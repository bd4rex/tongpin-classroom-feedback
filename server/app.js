import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import QRCode from "qrcode";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import {
  createStore,
  AppError,
  hash,
  now,
  str,
  normalizeActivity,
  normalizeAnswer,
} from "./store.js";
import { templates } from "./templates.js";
import { createAI } from "./ai.js";
import {
  collectionConfig,
  normalizeCollection,
  publicCollection,
  normalizeProfile,
  profileOf,
  anonymousName,
  participantName,
  missingProfile,
} from "./collection.js";
import { createDashboard } from "./dashboard.js";
import { normalizeTaskPack } from "./task-pack.js";

const token = () => randomBytes(32).toString("hex");
const cookieValue = (request, name) =>
  request.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const csvCell = (value) => {
  let s = String(value ?? "");
  if (/^[\s\uFEFF]*[=+@-]/u.test(s) || /^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};
function passwordHash(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export async function buildApp({
  dataDir = process.env.DATA_DIR || "./data",
  serveStatic = true,
  fetchImpl,
  publicUrl = process.env.PUBLIC_URL,
  secureCookie = process.env.COOKIE_SECURE === "true",
  dev = false,
} = {}) {
  const app = Fastify({ logger: false, bodyLimit: 32768 });
  const store = createStore(dataDir);
  const dashboard = createDashboard(store);
  const ai = createAI(store, fetchImpl, (participantId, roomId) => {
    broadcast(roomId, "teacher");
    for (const c of clients.get(roomId) ?? [])
      if (
        c.participantId === participantId &&
        !c.res.destroyed &&
        !c.res.write(`event: update\ndata: ${now()}\n\n`)
      )
        c.res.end();
  });
  app.decorate("store", store);
  const clients = new Map();
  const limits = new Map();
  const pendingBroadcasts = new Map();
  const stateCache = new Map();
  let vite;
  function limit(request, scope, max, window = 60000) {
    const key = `${scope}:${request.ip}`;
    const current = limits.get(key);
    if (current && current.until > now()) {
      current.count++;
      if (current.count > max)
        throw new AppError("操作较频繁，请稍后再试", 429);
    } else {
      if (limits.size > 10000) throw new AppError("服务繁忙，请稍后再试", 429);
      limits.set(key, { count: 1, until: now() + window });
    }
  }
  function setCookie(reply, name, value, age = 43200) {
    reply.header(
      "Set-Cookie",
      `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookie ? "; Secure" : ""}`,
    );
  }
  function teacher(request) {
    const value = cookieValue(request, "teacher");
    const session =
      value &&
      store.get(
        "SELECT * FROM teacher_sessions WHERE token=? AND expires>?",
        hash(value),
        now(),
      );
    if (!session) throw new AppError("请先进入教师工作台", 401);
    return session;
  }
  function participant(request) {
    const value = cookieValue(request, "student");
    const p =
      value &&
      store.get("SELECT * FROM participants WHERE token=?", hash(value));
    if (!p) throw new AppError("请先加入课堂", 401);
    return p;
  }
  function broadcast(roomId, audience = "all") {
    stateCache.delete(roomId);
    if (audience === "all") dashboard.invalidate(roomId);
    const pending = pendingBroadcasts.get(roomId);
    if (pending) {
      if (audience === "all") pending.audience = "all";
      return;
    }
    const update = {
      audience,
      timer: setTimeout(() => {
        pendingBroadcasts.delete(roomId);
        for (const c of clients.get(roomId) ?? []) {
          if (update.audience === "teacher" && c.role !== "teacher") continue;
          if (!c.res.destroyed) {
            const ok = c.res.write(`event: update\ndata: ${now()}\n\n`);
            if (!ok) c.res.end();
          }
        }
      }, 350),
    };
    update.timer.unref();
    pendingBroadcasts.set(roomId, update);
  }
  function baseUrl(request) {
    if (publicUrl) return publicUrl.replace(/\/+$/, "");
    const host = request.headers.host || "127.0.0.1:3210";
    if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
      const lan = Object.entries(networkInterfaces())
        .filter(([name]) => !/utun|bridge|docker|vbox/i.test(name))
        .flatMap(([, values]) => values ?? [])
        .find(
          (i) =>
            i.family === "IPv4" &&
            !i.internal &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address),
        );
      if (lan) return `http://${lan.address}:${host.split(":")[1] || "3210"}`;
    }
    return `${request.protocol}://${host}`;
  }
  app.setErrorHandler((error, request, reply) => {
    const status =
      error.statusCode && error.statusCode < 500
        ? error.statusCode
        : error instanceof AppError
          ? error.statusCode
          : 500;
    reply.code(status).send({
      error: status === 500 ? "服务暂时出错，请稍后重试" : error.message,
    });
    if (status === 500)
      console.error(
        JSON.stringify({
          event: "request_failed",
          method: request.method,
          route: request.routeOptions?.url,
          code: error.code || "INTERNAL_ERROR",
        }),
      );
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    if (!dev)
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        if (!request.headers["content-type"]?.startsWith("application/json"))
          throw new AppError("请使用 JSON 提交", 415);
      }
    }
  });
  app.get("/api/health", async () => ({
    ok: true,
    app: "同频课堂反馈",
    version: "0.3.0",
  }));
  app.get("/api/auth/status", async (request) => {
    let authenticated = false;
    try {
      teacher(request);
      authenticated = true;
    } catch {}
    return { initialized: !!store.meta("password"), authenticated };
  });
  app.post("/api/auth/setup", async (request, reply) => {
    limit(request, "setup", 10, 900000);
    if (store.meta("password"))
      throw new AppError("管理密码已设置，请直接登录", 409);
    const password = str(request.body?.password, "管理密码", 128);
    if (password.length < 8) throw new AppError("管理密码至少需要 8 个字符");
    store.setMeta("password", passwordHash(password));
    const value = token();
    store.run(
      "INSERT INTO teacher_sessions VALUES (?,?)",
      hash(value),
      now() + 43200000,
    );
    setCookie(reply, "teacher", value);
    return { ok: true };
  });
  app.post("/api/auth/login", async (request, reply) => {
    limit(request, "login", 10, 900000);
    const password = str(request.body?.password, "管理密码", 128);
    const stored = store.meta("password");
    if (
      !stored ||
      !timingSafeEqual(
        Buffer.from(passwordHash(password, stored.salt).hash, "hex"),
        Buffer.from(stored.hash, "hex"),
      )
    )
      throw new AppError("管理密码不正确", 401);
    limits.delete(`login:${request.ip}`);
    const value = token();
    store.run(
      "INSERT INTO teacher_sessions VALUES (?,?)",
      hash(value),
      now() + 43200000,
    );
    setCookie(reply, "teacher", value);
    return { ok: true };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    const value = cookieValue(request, "teacher");
    if (value)
      store.run("DELETE FROM teacher_sessions WHERE token=?", hash(value));
    setCookie(reply, "teacher", "", 0);
    return { ok: true };
  });

  app.get("/api/teacher/templates", async (request) => {
    teacher(request);
    return templates;
  });
  app.get("/api/teacher/classrooms", async (request) => {
    teacher(request);
    return store
      .all("SELECT * FROM classrooms ORDER BY created_at DESC")
      .map(store.roomSummary);
  });
  app.post("/api/teacher/classrooms", async (request) => {
    teacher(request);
    if (store.get("SELECT id FROM classrooms WHERE status!='ended'"))
      throw new AppError("请先结束当前课堂，再开始新的一节课", 409);
    const room = store.createClassroom(request.body ?? {});
    return room;
  });
  app.get("/api/teacher/classrooms/:id", async (request) => {
    teacher(request);
    const id = request.params.id;
    let cached = stateCache.get(id);
    if (!cached || cached.until < now()) {
      cached = { value: store.teacherState(id), until: now() + 800 };
      if (stateCache.size > 32) stateCache.clear();
      stateCache.set(id, cached);
    }
    const state = cached.value;
    return {
      ...state,
      aiQueue: ai.telemetry(),
      joinUrl: `${baseUrl(request)}/join?code=${state.room.code}`,
    };
  });
  app.put(
    "/api/teacher/classrooms/:id/collection",
    { bodyLimit: 131072 },
    async (request) => {
      teacher(request);
      const room = store.classroom(request.params.id);
      if (room.status === "ended")
        throw new AppError("已结束课堂的采集设置不能修改", 409);
      const config = normalizeCollection(request.body);
      store.run(
        "UPDATE classrooms SET collection_config=? WHERE id=?",
        JSON.stringify(config),
        room.id,
      );
      broadcast(room.id);
      return config;
    },
  );
  app.get("/api/teacher/classrooms/:id/dashboard", async (request) => {
    teacher(request);
    store.classroom(request.params.id);
    return dashboard.read(
      request.params.id,
      request.query.activityId,
      request.query.shared === "1",
    );
  });
  app.get(
    "/api/teacher/classrooms/:id/participants",
    async (request, reply) => {
      teacher(request);
      const room = store.classroom(request.params.id);
      const raw = store.all(
        "SELECT id,nickname,nickname_generated,city,school,class_name,student_no,name,mode,size,joined_at,last_seen FROM participants WHERE classroom_id=? ORDER BY joined_at,id",
        room.id,
      );
      const rows = raw.map((p) => ({
        id: p.id,
        ...profileOf(p),
        displayName: participantName(p),
        mode: p.mode,
        size: p.size,
        joinedAt: p.joined_at,
        online: p.last_seen > now() - 75000,
      }));
      if (request.query.format === "csv") {
        const table = [
          [
            "参与端ID",
            "城市",
            "学校",
            "年级／班级",
            "学号",
            "姓名",
            "昵称",
            "参与方式",
            "加入时间",
          ],
          ...rows.map((p) => [
            p.id,
            p.city,
            p.school,
            p.className,
            p.studentNo,
            p.name,
            p.nickname,
            p.mode,
            new Date(p.joinedAt).toISOString(),
          ]),
        ];
        return reply
          .type("text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="participants-${room.code}.csv"`,
          )
          .send(
            "\uFEFF" + table.map((r) => r.map(csvCell).join(",")).join("\r\n"),
          );
      }
      const offset = Math.max(0, Number(request.query.offset) || 0);
      return {
        total: rows.length,
        offset,
        rows: rows.slice(offset, offset + 50),
      };
    },
  );
  app.post("/api/teacher/classrooms/:id/duplicate", async (request) => {
    teacher(request);
    if (store.get("SELECT id FROM classrooms WHERE status!='ended'"))
      throw new AppError("请先结束当前课堂", 409);
    const source = store.classroom(request.params.id);
    return store.transaction(() => {
      // Create manually inside this transaction to keep the copied activity set atomic.
      const id = randomUUID();
      let code;
      do {
        code = String(
          100000 +
            (Number.parseInt(randomBytes(3).toString("hex"), 16) % 900000),
        );
      } while (store.get("SELECT id FROM classrooms WHERE code=?", code));
      store.run(
        "INSERT INTO classrooms (id,code,title,subject,grade,created_at) VALUES (?,?,?,?,?,?)",
        id,
        code,
        source.title,
        source.subject,
        source.grade,
        now(),
      );
      store.run(
        "UPDATE classrooms SET collection_config=? WHERE id=?",
        source.collection_config,
        id,
      );
      for (const oldGroup of store.all(
        "SELECT * FROM task_groups WHERE classroom_id=? ORDER BY position",
        source.id,
      )) {
        const newGroup = store.addGroup(id, {
          title: oldGroup.title,
          duration: oldGroup.duration,
        });
        for (const a of store.all(
          "SELECT content FROM activities WHERE group_id=? ORDER BY position",
          oldGroup.id,
        ))
          store.addActivity(id, {
            ...JSON.parse(a.content),
            groupId: newGroup.id,
          });
      }
      return store.classroom(id);
    });
  });
  app.post("/api/teacher/classrooms/:id/end", async (request) => {
    teacher(request);
    const id = request.params.id;
    store.classroom(id);
    store.transaction(() => {
      store.run("UPDATE classrooms SET status='ended' WHERE id=?", id);
      store.run(
        "UPDATE task_groups SET status='closed',deadline=NULL WHERE classroom_id=? AND status IN ('live','paused')",
        id,
      );
      store.run(
        "UPDATE activities SET status='closed',deadline=NULL WHERE classroom_id=? AND status IN ('live','paused')",
        id,
      );
    });
    ai.cancelQueued({ classroomId: id });
    broadcast(id);
    return { ok: true };
  });
  app.post("/api/teacher/classrooms/:id/activities", async (request) => {
    teacher(request);
    const a = store.addActivity(request.params.id, request.body ?? {});
    broadcast(a.classroom_id);
    return a;
  });
  app.post(
    "/api/teacher/classrooms/:id/task-pack/preview",
    { bodyLimit: 262144 },
    async (request) => {
      teacher(request);
      store.classroom(request.params.id);
      return normalizeTaskPack(request.body);
    },
  );
  app.post(
    "/api/teacher/classrooms/:id/task-pack",
    { bodyLimit: 262144 },
    async (request) => {
      teacher(request);
      const room = store.classroom(request.params.id);
      if (room.status === "ended") throw new AppError("课堂已结束", 409);
      const pack = normalizeTaskPack(request.body);
      const requestId = str(request.body.requestId, "导入请求编号", 80);
      if (!/^[a-zA-Z0-9-]+$/.test(requestId))
        throw new AppError("导入请求编号格式无效");
      const key = `task-pack:${room.id}:${requestId}`;
      const fingerprint = hash(JSON.stringify(pack));
      const result = store.transaction(() => {
        const previous = store.meta(key);
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            throw new AppError("本次导入内容已变化，请重新校验", 409);
          return { group: store.group(previous.groupId), duplicate: true };
        }
        const group = store.addGroup(room.id, pack.group);
        for (const activity of pack.activities)
          store.addActivity(room.id, { ...activity, groupId: group.id });
        store.setMeta(key, { groupId: group.id, fingerprint });
        return { group, duplicate: false };
      });
      broadcast(room.id, "teacher");
      return result;
    },
  );
  app.get("/api/teacher/groups/:id/pack", async (request, reply) => {
    teacher(request);
    const group = store.group(request.params.id);
    const activities = store
      .all(
        "SELECT content FROM activities WHERE group_id=? ORDER BY position,id",
        group.id,
      )
      .map((a) => JSON.parse(a.content));
    const pack = normalizeTaskPack({ schemaVersion: 1, group, activities });
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="task-pack-${group.id}.json"`,
      )
      .send(pack);
  });
  app.put("/api/teacher/activities/:id", async (request) => {
    teacher(request);
    const a = store.activity(request.params.id);
    if (
      a.status !== "draft" ||
      store.classroom(a.classroom_id).status === "ended"
    )
      throw new AppError("只有未发布的活动可以修改", 409);
    const body = normalizeActivity(request.body ?? {});
    if (request.body?.groupId && request.body.groupId !== a.group_id) {
      const target = store.group(request.body.groupId);
      if (target.classroom_id !== a.classroom_id)
        throw new AppError("任务组不属于当前课堂", 403);
      if (target.status !== "draft")
        throw new AppError("只能移动到未发布的任务组", 409);
      store.run("UPDATE activities SET group_id=? WHERE id=?", target.id, a.id);
    }
    store.run(
      "UPDATE activities SET content=? WHERE id=?",
      JSON.stringify(body),
      a.id,
    );
    broadcast(a.classroom_id);
    return store.activity(a.id);
  });
  app.delete("/api/teacher/activities/:id", async (request) => {
    teacher(request);
    const a = store.activity(request.params.id);
    if (
      a.status !== "draft" ||
      store.classroom(a.classroom_id).status === "ended"
    )
      throw new AppError("只有未发布的活动可以删除", 409);
    store.run("DELETE FROM activities WHERE id=?", a.id);
    broadcast(a.classroom_id);
    return { ok: true };
  });
  app.post("/api/teacher/classrooms/:id/groups", async (request) => {
    teacher(request);
    const g = store.addGroup(request.params.id, request.body ?? {});
    broadcast(g.classroom_id, "teacher");
    return g;
  });
  app.put("/api/teacher/groups/:id", async (request) => {
    teacher(request);
    const g = store.group(request.params.id);
    if (
      g.status !== "draft" ||
      store.classroom(g.classroom_id).status === "ended"
    )
      throw new AppError("只有未发布的任务组可以修改", 409);
    const title = str(request.body?.title, "任务组名称", 80),
      duration = Number(request.body?.duration ?? 0);
    if (!Number.isInteger(duration) || duration < 0 || duration > 7200)
      throw new AppError("开放时长应为 0–7200 秒");
    store.run(
      "UPDATE task_groups SET title=?,duration=? WHERE id=?",
      title,
      duration,
      g.id,
    );
    broadcast(g.classroom_id, "teacher");
    return store.group(g.id);
  });
  app.delete("/api/teacher/groups/:id", async (request) => {
    teacher(request);
    const g = store.group(request.params.id);
    if (
      g.status !== "draft" ||
      store.classroom(g.classroom_id).status === "ended"
    )
      throw new AppError("只有未发布的任务组可以删除", 409);
    if (store.get("SELECT id FROM activities WHERE group_id=?", g.id))
      throw new AppError("请先移走或删除组内草稿，再删除空组", 409);
    store.run("DELETE FROM task_groups WHERE id=?", g.id);
    broadcast(g.classroom_id, "teacher");
    return { ok: true };
  });
  app.post("/api/teacher/groups/:id/control", async (request) => {
    teacher(request);
    const g = store.controlGroup(request.params.id, request.body?.action);
    if (["pause", "close"].includes(request.body?.action))
      ai.cancelQueued({ groupId: g.id });
    broadcast(g.classroom_id);
    return { ok: true };
  });
  app.post("/api/teacher/activities/:id/control", async (request) => {
    teacher(request);
    const a = store.activity(request.params.id);
    const action = request.body?.action;
    if (action === "reveal") {
      if (a.status === "draft") throw new AppError("任务尚未发布", 409);
      store.run(
        "UPDATE activities SET revealed=? WHERE id=?",
        a.revealed ? 0 : 1,
        a.id,
      );
    } else {
      store.controlGroup(a.group_id, action);
      if (["pause", "close"].includes(action))
        ai.cancelQueued({ groupId: a.group_id });
    }
    broadcast(a.classroom_id);
    return { ok: true };
  });
  app.patch("/api/teacher/questions/:id", async (request) => {
    teacher(request);
    const q = store.get(
      "SELECT * FROM questions WHERE id=?",
      request.params.id,
    );
    if (!q) throw new AppError("问题不存在", 404);
    store.run(
      "UPDATE questions SET answered=? WHERE id=?",
      request.body?.answered ? 1 : 0,
      q.id,
    );
    broadcast(q.classroom_id);
    return { ok: true };
  });
  app.get("/api/teacher/model", async (request) => {
    teacher(request);
    return ai.publicConfig();
  });
  app.put("/api/teacher/model", async (request) => {
    teacher(request);
    return ai.save(request.body ?? {});
  });
  app.post("/api/teacher/model/test", async (request) => {
    teacher(request);
    limit(request, "model-test", 6);
    return ai.test();
  });
  app.post("/api/teacher/activities/:id/analyze", async (request) => {
    teacher(request);
    limit(request, "analyze", 6);
    const result = await ai.analyze(request.params.id);
    broadcast(store.activity(request.params.id).classroom_id);
    return result;
  });
  app.get("/api/teacher/classrooms/:id/qr", async (request, reply) => {
    teacher(request);
    const room = store.classroom(request.params.id);
    const svg = await QRCode.toString(
      `${baseUrl(request)}/join?code=${room.code}`,
      { type: "svg", margin: 1, width: 240 },
    );
    return reply.type("image/svg+xml").send(svg);
  });
  app.get("/api/teacher/classrooms/:id/export", async (request, reply) => {
    teacher(request);
    const state = store.teacherState(request.params.id, true);
    const activityId = request.query.activityId;
    if (activityId) {
      if (!state.activities.some((a) => a.id === activityId))
        throw new AppError("活动不属于当前课堂", 404);
      if (request.query.format === "json")
        throw new AppError("单题反馈请使用 CSV；完整记录请导出全课 JSON");
      state.activities = state.activities.filter((a) => a.id === activityId);
    }
    if (request.query.format === "json")
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename="classroom-${state.room.code}.json"`,
        )
        .send({
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          participants: store
            .all(
              "SELECT id,nickname,nickname_generated,city,school,class_name,student_no,name,mode,size,joined_at FROM participants WHERE classroom_id=?",
              state.room.id,
            )
            .map((p) => ({
              id: p.id,
              ...profileOf(p),
              displayName: participantName(p),
              mode: p.mode,
              size: p.size,
              joinedAt: p.joined_at,
            })),
          unit: "参与端；每端一份回答，不按代表人数放大",
          ...state,
          aiInteractions: store.all(
            "SELECT j.id,j.activity_id,j.participant_id,j.question,j.status,j.answer,j.error,j.created_at,j.completed_at FROM ai_jobs j JOIN activities a ON a.id=j.activity_id WHERE a.classroom_id=?",
            state.room.id,
          ),
        });
    const rows = [
      [
        "课堂",
        "学科",
        "活动",
        "题型",
        "匿名称呼",
        "城市（自填）",
        "学号（自填）",
        "姓名（自填）",
        "学校（自填）",
        "年级／班级（自填）",
        "参与方式",
        "回答",
        "是否符合参考答案",
        "提交时间",
      ],
    ];
    const modes = { individual: "个人", group: "小组", class: "整班" };
    for (const a of state.activities)
      for (const r of a.stats.responses) {
        const answer = r.answer.choices
          ? r.answer.choices.map((c) => a.options[Number(c)]).join("；")
          : (r.answer.text ??
            `收获：${r.answer.takeaway}；疑问：${r.answer.question}；难度：${r.answer.difficulty}/5`);
        rows.push([
          state.room.title,
          state.room.subject,
          a.title,
          a.type,
          r.nickname,
          r.city,
          r.student_no,
          r.name,
          r.school,
          r.class_name,
          modes[r.mode],
          answer,
          a.correct.length
            ? JSON.stringify(r.answer.choices) === JSON.stringify(a.correct)
              ? "是"
              : "否"
            : "未设置",
          new Date(r.created_at).toISOString(),
        ]);
      }
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="classroom-${state.room.code}${activityId ? `-task-${activityId}` : ""}.csv"`,
      )
      .send("\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"));
  });

  app.get("/api/join/options", async (request) => {
    const code = str(request.query.code, "课堂码", 6);
    const room = store.get("SELECT * FROM classrooms WHERE code=?", code);
    if (!room) throw new AppError("没有找到这个课堂，请核对课堂码", 404);
    if (room.status === "ended") throw new AppError("这节课已经结束", 409);
    return {
      code: room.code,
      title: room.title,
      collection: publicCollection(collectionConfig(room)),
    };
  });
  function requireProfile(p) {
    const missing = missingProfile(
      p,
      collectionConfig(store.classroom(p.classroom_id)),
    );
    if (missing.length)
      throw new AppError(`请先补充参与信息：${missing.join("、")}`, 409);
  }
  app.put("/api/student/profile", async (request) => {
    const p = participant(request),
      room = store.classroom(p.classroom_id);
    if (room.status === "ended") throw new AppError("课堂已结束", 409);
    const profile = normalizeProfile(
      request.body ?? {},
      collectionConfig(room),
      profileOf(p),
    );
    store.run(
      "UPDATE participants SET nickname=?,nickname_generated=?,city=?,school=?,class_name=?,student_no=?,name=?,last_seen=? WHERE id=?",
      profile.nickname || anonymousName(p.id),
      profile.nickname ? 0 : 1,
      profile.city,
      profile.school || "未填写学校",
      profile.className || "未填写班级",
      profile.studentNo,
      profile.name,
      now(),
      p.id,
    );
    dashboard.invalidate(room.id);
    broadcast(room.id, "teacher");
    return store.studentState(
      store.get("SELECT * FROM participants WHERE id=?", p.id),
    );
  });
  app.get("/api/student/dashboard", async (request) => {
    const p = participant(request),
      config = collectionConfig(store.classroom(p.classroom_id));
    if (!config.display.studentStats)
      throw new AppError("老师尚未开放课堂统计", 403);
    return dashboard.read(p.classroom_id, request.query.activityId, true);
  });
  app.post("/api/join", async (request, reply) => {
    limit(request, "join", 10000);
    const body = request.body ?? {};
    const code = str(request.body?.code, "课堂码", 6);
    const room = store.get("SELECT * FROM classrooms WHERE code=?", code);
    if (!room) throw new AppError("没有找到这个课堂，请核对课堂码", 404);
    if (room.status === "ended")
      throw new AppError("这节课已经结束，请向老师获取新的课堂码", 409);
    let existing;
    try {
      existing = participant(request);
    } catch {}
    if (existing?.classroom_id === room.id) {
      store.run(
        "UPDATE participants SET last_seen=? WHERE id=?",
        now(),
        existing.id,
      );
      setCookie(reply, "student", cookieValue(request, "student"), 86400);
      return store.studentState(existing);
    }
    const mode = body.mode ?? "individual";
    if (!["individual", "group", "class"].includes(mode))
      throw new AppError("请选择参与方式");
    const size =
      mode === "individual"
        ? 1
        : Number(body.size ?? (mode === "group" ? 4 : 30));
    if (!Number.isInteger(size) || size < 1 || size > 100)
      throw new AppError("代表人数应为 1–100 人");
    const id = randomUUID();
    const value = token();
    const profile = normalizeProfile(
      body.profile ?? body,
      collectionConfig(room),
    );
    const nickname = profile.nickname || anonymousName(id);
    store.run(
      "INSERT INTO participants (id,classroom_id,token,nickname,nickname_generated,school,class_name,mode,size,joined_at,last_seen,city,student_no,name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      room.id,
      hash(value),
      nickname,
      profile.nickname ? 0 : 1,
      profile.school || "未填写学校",
      profile.className || "未填写班级",
      mode,
      size,
      now(),
      now(),
      profile.city,
      profile.studentNo,
      profile.name,
    );
    setCookie(reply, "student", value, 86400);
    broadcast(room.id, "teacher");
    return store.studentState(
      store.get("SELECT * FROM participants WHERE id=?", id),
    );
  });
  app.get("/api/student/state", async (request) => {
    let p;
    try {
      p = participant(request);
    } catch (error) {
      if (error.statusCode === 401) return { joined: false };
      throw error;
    }
    if (
      request.query.code &&
      store.classroom(p.classroom_id).code !== request.query.code
    )
      return { joined: false };
    return store.studentState(p);
  });
  app.post("/api/student/heartbeat", async (request, reply) => {
    const p = participant(request);
    store.run("UPDATE participants SET last_seen=? WHERE id=?", now(), p.id);
    setCookie(reply, "student", cookieValue(request, "student"), 86400);
    return { ok: true };
  });
  app.post("/api/student/activities/:id/answer", async (request) => {
    const p = participant(request);
    const a = store.activity(request.params.id);
    const room = store.classroom(p.classroom_id);
    if (a.classroom_id !== p.classroom_id)
      throw new AppError("活动不属于当前课堂", 403);
    const answer = normalizeAnswer(a, request.body ?? {});
    const serialized = JSON.stringify(answer);
    const existing = store.get(
      "SELECT content FROM answers WHERE activity_id=? AND participant_id=?",
      a.id,
      p.id,
    );
    if (existing) {
      if (existing.content === serialized) return { ok: true, duplicate: true };
      throw new AppError("这项活动已提交，每个参与端提交一次", 409);
    }
    requireProfile(p);
    if (room.status === "ended" || a.status !== "live")
      throw new AppError("当前活动已暂停或结束", 409);
    store.run(
      "INSERT INTO answers VALUES (?,?,?,?,?)",
      randomUUID(),
      a.id,
      p.id,
      serialized,
      now(),
    );
    store.run("UPDATE participants SET last_seen=? WHERE id=?", now(), p.id);
    broadcast(room.id, "teacher");
    return { ok: true };
  });
  app.post("/api/student/activities/:id/open", async (request) => {
    const p = participant(request),
      a = store.activity(request.params.id);
    if (a.classroom_id !== p.classroom_id)
      throw new AppError("任务不属于当前课堂", 403);
    if (a.status === "draft") throw new AppError("任务尚未发布", 403);
    if (
      a.status === "live" &&
      store.classroom(a.classroom_id).status !== "ended"
    ) {
      const result = store.run(
        "INSERT OR IGNORE INTO activity_visits VALUES (?,?,?)",
        a.id,
        p.id,
        now(),
      );
      if (result.changes) broadcast(p.classroom_id, "teacher");
    }
    return { ok: true };
  });
  app.post("/api/student/questions", async (request) => {
    const p = participant(request);
    requireProfile(p);
    const room = store.classroom(p.classroom_id);
    if (room.status === "ended") throw new AppError("课堂已结束", 409);
    const count = store.get(
      "SELECT COUNT(*) AS n FROM questions WHERE participant_id=? AND created_at>?",
      p.id,
      now() - 60000,
    ).n;
    if (count >= 3) throw new AppError("问题已收到，请稍等老师回应", 429);
    store.run(
      "INSERT INTO questions VALUES (?,?,?,?,?,?)",
      randomUUID(),
      room.id,
      p.id,
      str(request.body?.content, "问题", 1000),
      0,
      now(),
    );
    broadcast(room.id, "teacher");
    return { ok: true };
  });
  app.post("/api/student/activities/:id/ai", async (request) => {
    const p = participant(request);
    requireProfile(p);
    return ai.submit(p, store.activity(request.params.id), request.body ?? {});
  });
  app.get("/api/events", async (request, reply) => {
    let roomId;
    let expires = Infinity;
    let participantId;
    if (request.query.role === "teacher") {
      const session = teacher(request);
      expires = session.expires;
      roomId = str(request.query.room, "课堂", 80);
      store.classroom(roomId);
    } else {
      const p = participant(request);
      roomId = p.classroom_id;
      participantId = p.id;
    }
    const raw = reply.raw;
    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    });
    raw.write("retry: 3000\nevent: ready\ndata: connected\n\n");
    if (!clients.has(roomId)) clients.set(roomId, new Set());
    const client = {
      res: raw,
      expires,
      role: request.query.role === "teacher" ? "teacher" : "student",
      participantId,
    };
    clients.get(roomId).add(client);
    raw.on("close", () => {
      clients.get(roomId)?.delete(client);
      if (clients.get(roomId)?.size === 0) clients.delete(roomId);
    });
  });
  const timer = setInterval(() => {
    for (const group of clients.values())
      for (const c of group) {
        if (c.expires < now()) c.res.end();
        else if (!c.res.destroyed && !c.res.write(": heartbeat\n\n"))
          c.res.end();
      }
    for (const [key, value] of limits)
      if (value.until < now()) limits.delete(key);
    store.run("DELETE FROM teacher_sessions WHERE expires<?", now());
  }, 20000);
  timer.unref();
  app.addHook("preClose", async () => {
    for (const group of clients.values()) for (const c of group) c.res.end();
  });
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const p of pendingBroadcasts.values()) clearTimeout(p.timer);
    await ai.shutdown();
    if (vite) await vite.close();
    store.close();
  });
  if (serveStatic) {
    if (dev) {
      const { createServer } = await import("vite");
      vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith("/api/"))
          return reply.code(404).send({ error: "接口不存在" });
        reply.hijack();
        vite.middlewares(request.raw, reply.raw);
      });
    } else {
      const root = resolve("dist");
      if (!existsSync(resolve(root, "index.html")))
        throw new Error("请先执行 npm run build");
      await app.register(fastifyStatic, { root });
      app.setNotFoundHandler((request, reply) =>
        request.url.startsWith("/api/")
          ? reply.code(404).send({ error: "接口不存在" })
          : reply.sendFile("index.html"),
      );
    }
  }
  return app;
}
