import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { buildApp } from "../server/app.js";

let app,
  dir,
  teacherCookie,
  modelCalls,
  activeModels,
  peakModels,
  modelBehavior,
  modelGate;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const request = (method, url, body, cookie = teacherCookie) =>
  app.inject({
    method,
    url,
    ...(body !== undefined ? { payload: body } : {}),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
  });
const value = (r) => {
  assert.ok(r.statusCode < 300, r.body);
  return r.json();
};
async function room(templateId = "math") {
  return value(
    await request("POST", "/api/teacher/classrooms", {
      title: "测试课堂",
      subject: "跨学科",
      templateId,
    }),
  );
}
async function student(code, extra = {}) {
  const profileKeys = [
    "city",
    "school",
    "className",
    "studentNo",
    "name",
    "nickname",
  ];
  const profile = {
    city: "南京市",
    school: "测试学校",
    className: "五年级1班",
    nickname: "测试同学",
    ...Object.fromEntries(
      profileKeys
        .filter((key) => Object.hasOwn(extra, key))
        .map((key) => [key, extra[key]]),
    ),
    ...(extra.profile || {}),
  };
  const body = { code, ...extra, profile };
  for (const key of profileKeys) delete body[key];
  const r = await request("POST", "/api/join", body, "");
  return { state: value(r), cookie: r.headers["set-cookie"].split(";")[0] };
}
async function activity(roomId, body) {
  return value(
    await request("POST", `/api/teacher/classrooms/${roomId}/activities`, body),
  );
}
async function control(id, action = "publish") {
  return value(
    await request("POST", `/api/teacher/activities/${id}/control`, { action }),
  );
}
async function model() {
  return value(
    await request("PUT", "/api/teacher/model", {
      baseUrl: "https://model.invalid/v1",
      model: "test-model",
      apiKey: "test-secret-not-real",
      enabled: true,
      concurrency: 2,
      maxQueue: 3,
      maxTokens: 200,
    }),
  );
}
async function idle() {
  for (let i = 0; i < 100; i++) {
    if (
      !app.store.get(
        "SELECT id FROM ai_jobs WHERE status IN ('queued','running')",
      )
    )
      return;
    await pause(20);
  }
  assert.fail("AI queue did not finish");
}
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tongpin-test-"));
  modelCalls = [];
  activeModels = 0;
  peakModels = 0;
  modelBehavior = "success";
  modelGate = null;
  app = await buildApp({
    dataDir: dir,
    serveStatic: false,
    fetchImpl: async (url, options) => {
      activeModels++;
      peakModels = Math.max(peakModels, activeModels);
      modelCalls.push({ url, body: JSON.parse(options.body) });
      if (modelGate) await modelGate;
      await pause(50);
      activeModels--;
      if (modelBehavior === "error") throw new Error("upstream unavailable");
      if (modelBehavior === "malformed") return new Response("invalid JSON");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "这是测试模型的回答，请核实。" } }],
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const setup = await request(
    "POST",
    "/api/auth/setup",
    { password: "test-password-123" },
    "",
  );
  assert.equal(setup.statusCode, 200);
  teacherCookie = setup.headers["set-cookie"].split(";")[0];
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

test("教师权限、初始化锁定、请求格式与密钥隔离", async () => {
  assert.equal(
    (await request("GET", "/api/teacher/classrooms", undefined, "")).statusCode,
    401,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/auth/setup",
        { password: "another-password" },
        "",
      )
    ).statusCode,
    409,
  );
  const originCompatible = await app.inject({
    method: "POST",
    url: "/api/teacher/classrooms",
    payload: { title: "不同入口仍可用" },
    headers: {
      cookie: teacherCookie,
      origin: "https://untrusted.invalid",
      "content-type": "application/json",
    },
  });
  assert.equal(originCompatible.statusCode, 200, originCompatible.body);
  const wrongContentType = await app.inject({
    method: "POST",
    url: "/api/teacher/classrooms",
    payload: "title=wrong-content-type",
    headers: {
      cookie: teacherCookie,
      origin: "https://untrusted.invalid",
      "content-type": "text/plain",
    },
  });
  assert.equal(wrongContentType.statusCode, 415);
  assert.notEqual(app.store.meta("password").hash, "test-password-123");
  const saved = await model();
  assert.equal(saved.hasApiKey, true);
  assert.equal(saved.apiKey, undefined);
  assert.ok(!JSON.stringify(saved).includes("test-secret"));
  assert.equal(
    (await stat(join(dir, "model-config.json"))).mode & 0o777,
    0o600,
  );
  assert.equal(
    (
      await request("PUT", "/api/teacher/model", {
        baseUrl: "https://other.invalid/v1",
        model: "new",
        enabled: true,
      })
    ).statusCode,
    400,
  );
});
test("只允许一节当前课堂，结束后可复用活动而不带入回答", async () => {
  const r = await room();
  const defaultOptions = value(
    await request("GET", `/api/join/options?code=${r.code}`, undefined, ""),
  );
  assert.equal(defaultOptions.collection.cities.length, 13);
  assert.deepEqual(
    defaultOptions.collection.fields.filter((f) => f.required).map((f) => f.id),
    ["city", "school", "className", "nickname"],
  );
  assert.equal(
    (await request("POST", "/api/teacher/classrooms", { title: "第二节课" }))
      .statusCode,
    409,
  );
  const s = await student(r.code);
  assert.equal(s.state.participant.nickname, "测试同学");
  assert.equal(s.state.participant.school, "测试学校");
  await request("POST", `/api/teacher/classrooms/${r.id}/end`, {});
  assert.equal(
    (await request("POST", "/api/join", { code: r.code }, "")).statusCode,
    409,
  );
  const copy = value(
    await request("POST", `/api/teacher/classrooms/${r.id}/duplicate`, {}),
  );
  assert.notEqual(copy.code, r.code);
  assert.equal(app.store.teacherState(copy.id).room.total, 0);
  assert.equal(app.store.teacherState(copy.id).activities.length, 5);
});
test("发布前不暴露活动，公布前不暴露正确答案或其他学生记录", async () => {
  const r = await room();
  const s = await student(r.code);
  assert.equal(s.state.activity, null);
  const a = app.store.teacherState(r.id).activities[0];
  await control(a.id);
  const state = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.equal(state.activity.correct, undefined);
  assert.equal(state.activity.results, undefined);
  assert.equal(state.activity.content, undefined);
  await control(a.id, "reveal");
  const revealed = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.deepEqual(revealed.activity.correct, ["1"]);
  assert.equal(revealed.activity.results.responses, undefined);
});
test("重复答案幂等，跨课堂提交拒绝，暂停后不接受新回答", async () => {
  const r = await room();
  const a = app.store.teacherState(r.id).activities[0];
  const s = await student(r.code);
  await control(a.id);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["1"] },
        s.cookie,
      )
    ).statusCode,
    200,
  );
  assert.equal(
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["1"] },
        s.cookie,
      ),
    ).duplicate,
    true,
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["0"] },
        s.cookie,
      )
    ).statusCode,
    409,
  );
  const other = await student(r.code);
  await control(a.id, "pause");
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["1"] },
        other.cookie,
      )
    ).statusCode,
    409,
  );
  await control(a.id);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["1"] },
        other.cookie,
      )
    ).statusCode,
    200,
  );
  const privateRoom = app.store.createClassroom({
    title: "隔离课堂",
    templateId: "math",
  });
  const foreign = app.store.teacherState(privateRoom.id).activities[0];
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${foreign.id}/answer`,
        { choices: ["1"] },
        s.cookie,
      )
    ).statusCode,
    403,
  );
});
test("个人、小组和整班各计一个参与端，正确率以实际提交为分母", async () => {
  const r = await room();
  const a = app.store.teacherState(r.id).activities[0];
  await control(a.id);
  const students = await Promise.all([
    student(r.code, { mode: "individual", school: "甲校" }),
    student(r.code, {
      mode: "group",
      size: 5,
      school: "甲校",
      className: "五一",
    }),
    student(r.code, {
      mode: "class",
      size: 30,
      school: "甲校",
      className: "五二",
    }),
  ]);
  await request(
    "POST",
    `/api/student/activities/${a.id}/answer`,
    { choices: ["1"] },
    students[0].cookie,
  );
  await request(
    "POST",
    `/api/student/activities/${a.id}/answer`,
    { choices: ["0"] },
    students[2].cookie,
  );
  const state = app.store.teacherState(r.id);
  assert.equal(state.room.total, 3);
  assert.equal(state.room.represented, 36);
  assert.equal(state.room.schools, 1);
  assert.equal(state.activities[0].stats.submitted, 2);
  assert.equal(state.activities[0].stats.correctRate, 50);
  assert.equal(state.activities[0].stats.submissionRate, 67);
  assert.equal(state.activities[0].stats.groups.length, 3);
});
test("多选、判断、文本、理解度和离堂反馈可提交并校验输入", async () => {
  const r = await room("");
  const s = await student(r.code);
  const cases = [
    [
      {
        type: "multiple",
        title: "多选",
        options: ["A", "B", "C"],
        correct: ["2", "0"],
      },
      { choices: ["2", "0"] },
    ],
    [{ type: "boolean", title: "判断", correct: ["0"] }, { choices: ["0"] }],
    [
      { type: "poll", title: "投票", options: ["是", "否"] },
      { choices: ["1"] },
    ],
    [{ type: "understanding", title: "理解度" }, { choices: ["2"] }],
    [{ type: "text", title: "开放回答" }, { text: "用生活中的例子解释。" }],
    [
      { type: "exit", title: "离堂反馈" },
      {
        takeaway: "理解了平均分",
        question: "还想知道更复杂的分数",
        difficulty: 3,
      },
    ],
  ];
  for (const [body, answer] of cases) {
    const a = await activity(r.id, body);
    await control(a.id);
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        answer,
        s.cookie,
      ),
    );
    assert.equal(app.store.stats(a.id).submitted, 1);
    if (body.correct) assert.equal(app.store.stats(a.id).correctRate, 100);
  }
  const a = await activity(r.id, { type: "text", title: "长度限制" });
  await control(a.id);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { text: "a".repeat(2001) },
        s.cookie,
      )
    ).statusCode,
    400,
  );
});
test("整组发布、学生任意顺序作答、后续组不打断前组，按校汇总进度", async () => {
  const r = await room("");
  const g1 = app.store.teacherState(r.id).groups[0];
  const tasks = [];
  for (let i = 0; i < 3; i++)
    tasks.push(
      await activity(r.id, {
        groupId: g1.id,
        type: "text",
        title: `任务 ${i + 1}`,
      }),
    );
  const g2 = value(
    await request("POST", `/api/teacher/classrooms/${r.id}/groups`, {
      title: "拓展",
    }),
  );
  const later = await activity(r.id, {
    groupId: g2.id,
    type: "text",
    title: "后续任务",
  });
  const fast = await student(r.code, { school: "甲校", className: "一班" });
  const slow = await student(r.code, { school: "乙校", className: "二班" });
  const absent = await student(r.code, { school: "乙校", className: "二班" });
  assert.deepEqual(fast.state.groups, []);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${later.id}/open`,
        {},
        slow.cookie,
      )
    ).statusCode,
    403,
  );
  value(
    await request("POST", `/api/teacher/groups/${g1.id}/control`, {
      action: "publish",
    }),
  );
  let ss = value(
    await request("GET", "/api/student/state", undefined, fast.cookie),
  );
  assert.equal(ss.groups.length, 1);
  assert.equal(ss.groups[0].activities.length, 3);
  assert.ok(ss.groups[0].activities.every((a) => a.status === "live"));
  const answer = async (s, a) =>
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { text: a.title },
        s.cookie,
      ),
    );
  value(
    await request(
      "POST",
      `/api/student/activities/${tasks[0].id}/open`,
      {},
      slow.cookie,
    ),
  );
  for (const i of [2, 0, 1]) await answer(fast, tasks[i]);
  let progress = app.store.teacherState(r.id).groups[0].progress;
  assert.deepEqual(
    [progress.completed, progress.inProgress, progress.notStarted],
    [1, 1, 1],
  );
  assert.deepEqual(
    progress.schools.map((s) => [
      s.school,
      s.completed,
      s.inProgress,
      s.notStarted,
    ]),
    [
      ["甲校", 1, 0, 0],
      ["乙校", 0, 1, 1],
    ],
  );
  value(
    await request("POST", `/api/teacher/groups/${g2.id}/control`, {
      action: "publish",
    }),
  );
  assert.equal(app.store.group(g1.id).status, "live");
  ss = value(
    await request("GET", "/api/student/state", undefined, slow.cookie),
  );
  assert.equal(ss.groups.length, 2);
  assert.ok(ss.groups[0].activities.every((a) => a.answer === null));
  await answer(fast, later);
  for (const i of [1, 2, 0]) await answer(slow, tasks[i]);
  const state = app.store.teacherState(r.id);
  assert.equal(state.groups[0].progress.completed, 2);
  assert.equal(state.groups[1].progress.completed, 1);
  assert.equal(state.groups[0].progress.submitted, 6);
  assert.equal(
    value(await request("GET", "/api/student/state", undefined, absent.cookie))
      .groups[0].completed,
    0,
  );
});
test("整组暂停、继续和限时结束对全部任务生效，其他组仍可提交", async () => {
  const r = await room();
  const [g1, g2] = app.store.teacherState(r.id).groups;
  value(
    await request("PUT", `/api/teacher/groups/${g1.id}`, {
      title: g1.title,
      duration: 60,
    }),
  );
  value(
    await request("POST", `/api/teacher/groups/${g1.id}/control`, {
      action: "publish",
    }),
  );
  const deadline = app.store.group(g1.id).deadline;
  assert.ok(deadline > Date.now());
  assert.ok(
    g1.taskIds.every((id) => app.store.activity(id).deadline === deadline),
  );
  value(
    await request("POST", `/api/teacher/groups/${g2.id}/control`, {
      action: "publish",
    }),
  );
  value(
    await request("POST", `/api/teacher/groups/${g1.id}/control`, {
      action: "pause",
    }),
  );
  assert.ok(
    g1.taskIds.every((id) => app.store.activity(id).status === "paused"),
  );
  assert.equal(app.store.group(g2.id).status, "live");
  const s = await student(r.code);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${g1.taskIds[0]}/answer`,
        { choices: ["1"] },
        s.cookie,
      )
    ).statusCode,
    409,
  );
  const understanding = app.store
    .teacherState(r.id)
    .activities.find((a) => a.type === "understanding");
  value(
    await request(
      "POST",
      `/api/student/activities/${understanding.id}/answer`,
      { choices: ["0"] },
      s.cookie,
    ),
  );
  value(
    await request("POST", `/api/teacher/groups/${g1.id}/control`, {
      action: "publish",
    }),
  );
  assert.ok(g1.taskIds.every((id) => app.store.activity(id).status === "live"));
  app.store.run(
    "UPDATE task_groups SET deadline=? WHERE id=?",
    Date.now() - 1,
    g1.id,
  );
  app.store.run(
    "UPDATE activities SET deadline=? WHERE group_id=?",
    Date.now() - 1,
    g1.id,
  );
  assert.equal(app.store.group(g1.id).status, "closed");
  assert.ok(
    g1.taskIds.every((id) => app.store.activity(id).status === "closed"),
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${g1.taskIds[0]}/answer`,
        { choices: ["1"] },
        s.cookie,
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (await request("PUT", `/api/teacher/groups/${g1.id}`, { title: "改名" }))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await request("PUT", `/api/teacher/activities/${g1.taskIds[0]}`, {
        type: "text",
        title: "修改",
      })
    ).statusCode,
    409,
  );
  value(
    await request("POST", `/api/teacher/groups/${g2.id}/control`, {
      action: "close",
    }),
  );
  assert.ok(
    g2.taskIds.every((id) => app.store.activity(id).status === "closed"),
  );
});
test("草稿可移组，空组不能发布，已发布组不能增加任务，复用保留组结构", async () => {
  const r = await room("");
  const g1 = app.store.teacherState(r.id).groups[0];
  assert.equal(
    (
      await request("POST", `/api/teacher/groups/${g1.id}/control`, {
        action: "publish",
      })
    ).statusCode,
    400,
  );
  const a = await activity(r.id, {
    groupId: g1.id,
    type: "text",
    title: "任务",
  });
  assert.equal(
    (await request("DELETE", `/api/teacher/groups/${g1.id}`, {})).statusCode,
    409,
  );
  const g2 = value(
    await request("POST", `/api/teacher/classrooms/${r.id}/groups`, {
      title: "第二阶段",
      duration: 180,
    }),
  );
  value(
    await request("PUT", `/api/teacher/activities/${a.id}`, {
      groupId: g2.id,
      type: "text",
      title: "移动后的任务",
    }),
  );
  assert.equal(app.store.activity(a.id).group_id, g2.id);
  value(await request("DELETE", `/api/teacher/groups/${g1.id}`, {}));
  value(
    await request("POST", `/api/teacher/groups/${g2.id}/control`, {
      action: "publish",
    }),
  );
  assert.equal(
    (
      await request("POST", `/api/teacher/classrooms/${r.id}/activities`, {
        groupId: g2.id,
        type: "text",
        title: "新增",
      })
    ).statusCode,
    409,
  );
  value(await request("POST", `/api/teacher/classrooms/${r.id}/end`, {}));
  const copy = value(
    await request("POST", `/api/teacher/classrooms/${r.id}/duplicate`, {}),
  );
  const state = app.store.teacherState(copy.id);
  assert.equal(state.groups.length, 1);
  assert.equal(state.groups[0].title, "第二阶段");
  assert.equal(state.groups[0].duration, 180);
  assert.equal(state.groups[0].status, "draft");
  assert.equal(state.groups[0].progress.total, 0);
  assert.equal(state.activities[0].group_id, state.groups[0].id);
});
test("AI 任务在后续组发布后仍可继续，跨组共享单端并发限制", async () => {
  await model();
  const r = await room("");
  const first = await activity(r.id, {
    type: "ai",
    title: "第一阶段",
    prompt: "引导探究",
    aiLimit: 2,
  });
  await control(first.id);
  const second = await activity(r.id, {
    type: "ai",
    title: "第二阶段",
    prompt: "引导探究",
    aiLimit: 2,
  });
  await control(second.id);
  const s = await student(r.code);
  value(
    await request(
      "POST",
      `/api/student/activities/${first.id}/ai`,
      { question: "早先任务的问题", requestId: "first" },
      s.cookie,
    ),
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${second.id}/ai`,
        { question: "另一组的问题", requestId: "second" },
        s.cookie,
      )
    ).statusCode,
    429,
  );
  await idle();
  value(
    await request(
      "POST",
      `/api/student/activities/${second.id}/ai`,
      { question: "另一组的问题", requestId: "second" },
      s.cookie,
    ),
  );
  await idle();
  const ss = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.ok(
    ss.groups.every((g) => g.activities[0].jobs[0].status === "completed"),
  );
  assert.equal(modelCalls.length, 2);
});
test("200 个参与端同时提交，统计与数据库记录一致，返回列表有界", async () => {
  const r = await room();
  const a = app.store.teacherState(r.id).activities[0];
  await control(a.id);
  const students = await Promise.all(
    Array.from({ length: 200 }, () => student(r.code)),
  );
  const results = await Promise.all(
    students.map((s) =>
      request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { choices: ["1"] },
        s.cookie,
      ),
    ),
  );
  assert.ok(results.every((r) => r.statusCode === 200));
  const stats = app.store.stats(a.id);
  assert.equal(stats.submitted, 200);
  assert.equal(stats.correctRate, 100);
  assert.equal(stats.responses.length, 100);
  assert.equal(app.store.stats(a.id, true).responses.length, 200);
});
test("问题仅教师及本人可见；CSV 公式注入防护；完整导出包含全部回答", async () => {
  const r = await room("");
  const a = await activity(r.id, { type: "text", title: "表达" });
  await control(a.id);
  const s = await student(r.code, { nickname: "=1+1" });
  const other = await student(r.code);
  await request(
    "POST",
    `/api/student/activities/${a.id}/answer`,
    { text: '=HYPERLINK("x")' },
    s.cookie,
  );
  value(
    await request(
      "POST",
      "/api/student/questions",
      { content: "需要再讲一遍" },
      s.cookie,
    ),
  );
  assert.equal(
    value(await request("GET", "/api/student/state", undefined, other.cookie))
      .questions.length,
    0,
  );
  assert.equal(app.store.teacherState(r.id).questions.length, 1);
  const csv = await request("GET", `/api/teacher/classrooms/${r.id}/export`);
  assert.ok(csv.body.includes("'=1+1"));
  assert.ok(csv.body.includes("'=HYPERLINK"));
  const data = value(
    await request("GET", `/api/teacher/classrooms/${r.id}/export?format=json`),
  );
  assert.equal(data.activities[0].stats.responses.length, 1);
});
test("AI 队列有界，最大并发守约，重试幂等，单端单请求与次数限制生效", async () => {
  await model();
  const r = await room("");
  const a = await activity(r.id, {
    type: "ai",
    title: "探究",
    prompt: "解释课堂概念",
    aiLimit: 1,
  });
  await control(a.id);
  const students = await Promise.all(
    Array.from({ length: 6 }, () => student(r.code)),
  );
  const responses = await Promise.all(
    students.map((s, i) =>
      request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: `解释概念${i}`, requestId: `req-${i}` },
        s.cookie,
      ),
    ),
  );
  assert.equal(responses.filter((r) => r.statusCode === 200).length, 5);
  assert.equal(responses.filter((r) => r.statusCode === 429).length, 1);
  assert.equal(
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: "解释概念0", requestId: "req-0" },
        students[0].cookie,
      ),
    ).id,
    responses[0].json().id,
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: "再问", requestId: "other" },
        students[0].cookie,
      )
    ).statusCode,
    429,
  );
  await idle();
  assert.equal(peakModels, 2);
  assert.equal(modelCalls.length, 5);
  assert.equal(
    app.store.get("SELECT COUNT(*) AS n FROM ai_jobs WHERE status='completed'")
      .n,
    5,
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: "超出额度", requestId: "next" },
        students[0].cookie,
      )
    ).statusCode,
    429,
  );
  assert.equal(
    value(
      await request("GET", "/api/student/state", undefined, students[5].cookie),
    ).activity.jobs.length,
    0,
  );
});
test("暂停 AI 活动后，尚未开始的请求取消；普通答题继续工作", async () => {
  await model();
  const r = await room("");
  const a = await activity(r.id, {
    type: "ai",
    title: "探究",
    prompt: "解释概念",
    aiLimit: 3,
  });
  await control(a.id);
  const students = await Promise.all(
    Array.from({ length: 5 }, () => student(r.code)),
  );
  await Promise.all(
    students.map((s, i) =>
      request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: "解释概念", requestId: `req-${i}` },
        s.cookie,
      ),
    ),
  );
  await control(a.id, "pause");
  await idle();
  assert.equal(
    app.store.get("SELECT COUNT(*) AS n FROM ai_jobs WHERE status='cancelled'")
      .n,
    3,
  );
  assert.equal(modelCalls.length, 2);
  const normal = await activity(r.id, {
    type: "poll",
    title: "是否理解",
    options: ["是", "否"],
  });
  await control(normal.id);
  value(
    await request(
      "POST",
      `/api/student/activities/${normal.id}/answer`,
      { choices: ["0"] },
      students[0].cookie,
    ),
  );
});
test("AI 分析只发送题目和样本文本，不附带参与者身份字段", async () => {
  await model();
  const r = await room("");
  const a = await activity(r.id, { type: "text", title: "解释分数" });
  const s = await student(r.code, {
    nickname: "测试姓名不应发送",
    school: "测试学校不应发送",
  });
  await control(a.id);
  await request(
    "POST",
    `/api/student/activities/${a.id}/answer`,
    { text: "表示平均分后的部分" },
    s.cookie,
  );
  const result = value(
    await request("POST", `/api/teacher/activities/${a.id}/analyze`, {}),
  );
  assert.equal(result.sample_size, 1);
  assert.ok(!JSON.stringify(modelCalls).includes("不应发送"));
  assert.equal(
    app.store.teacherState(r.id).activities[0].analysis.stale,
    false,
  );
});
test("数据库持久化，学生会话和课堂回答可在重启后恢复", async () => {
  const r = await room();
  const a = app.store.teacherState(r.id).activities[0];
  const s = await student(r.code);
  await control(a.id);
  await request(
    "POST",
    `/api/student/activities/${a.id}/answer`,
    { choices: ["1"] },
    s.cookie,
  );
  await app.close();
  app = await buildApp({ dataDir: dir, serveStatic: false });
  const state = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.deepEqual(state.activity.answer.choices, ["1"]);
  assert.equal(app.store.stats(a.id).submitted, 1);
  assert.ok(value(await request("GET", "/api/auth/status")).authenticated);
});
test("模型网络失败与非法响应释放处理槽位，不阻塞后续请求或普通反馈", async () => {
  await model();
  const r = await room("");
  const a = await activity(r.id, {
    type: "ai",
    title: "探究",
    prompt: "解释概念",
    aiLimit: 3,
  });
  await control(a.id);
  const s = await student(r.code);
  for (const behavior of ["error", "malformed", "success"]) {
    modelBehavior = behavior;
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/ai`,
        { question: "解释平均分", requestId: behavior },
        s.cookie,
      ),
    );
    await idle();
  }
  const state = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.deepEqual(
    state.activity.jobs.map((j) => j.status),
    ["failed", "failed", "completed"],
  );
  const p = await activity(r.id, {
    type: "poll",
    title: "你理解了吗",
    options: ["理解了", "还有疑问"],
  });
  await control(p.id);
  value(
    await request(
      "POST",
      `/api/student/activities/${p.id}/answer`,
      { choices: ["0"] },
      s.cookie,
    ),
  );
  assert.equal(app.store.stats(p.id).submitted, 1);
});

test("旧版逐题数据升级为独立任务组，未发布内容保持隐藏，迁移可重复启动", async () => {
  const legacy = join(dir, "legacy");
  mkdirSync(legacy);
  const db = new DatabaseSync(join(legacy, "classroom.sqlite"));
  db.exec(`CREATE TABLE classrooms (id TEXT PRIMARY KEY,code TEXT UNIQUE NOT NULL,title TEXT NOT NULL,subject TEXT NOT NULL,grade TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'waiting',current_activity_id TEXT,created_at INTEGER NOT NULL);
  CREATE TABLE activities (id TEXT PRIMARY KEY,classroom_id TEXT NOT NULL REFERENCES classrooms(id),position INTEGER NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',revealed INTEGER NOT NULL DEFAULT 0,deadline INTEGER,remaining INTEGER,published_at INTEGER);`);
  db.prepare("INSERT INTO classrooms VALUES (?,?,?,?,?,?,?,?)").run(
    "legacy-room",
    "654321",
    "原课堂",
    "科学",
    "",
    "live",
    "legacy-live",
    Date.now(),
  );
  const content = JSON.stringify({
    type: "text",
    title: "原任务",
    description: "",
    options: [],
    correct: [],
    duration: 0,
  });
  db.prepare(
    "INSERT INTO activities (id,classroom_id,position,content,status) VALUES (?,?,?,?,?)",
  ).run("legacy-live", "legacy-room", 0, content, "live");
  db.prepare(
    "INSERT INTO activities (id,classroom_id,position,content,status) VALUES (?,?,?,?,?)",
  ).run("legacy-draft", "legacy-room", 1, content, "draft");
  db.close();
  await app.close();
  app = await buildApp({ dataDir: legacy, serveStatic: false });
  const s = await student("654321");
  assert.equal(s.state.groups.length, 1);
  assert.equal(s.state.groups[0].activities[0].id, "legacy-live");
  assert.equal(app.store.teacherState("legacy-room").groups.length, 2);
  await app.close();
  app = await buildApp({ dataDir: legacy, serveStatic: false });
  assert.equal(app.store.teacherState("legacy-room").groups.length, 2);
  assert.equal(
    value(await request("GET", "/api/student/state", undefined, s.cookie))
      .groups.length,
    1,
  );
});

async function configureCollection(
  roomId,
  enabled = [],
  required = [],
  display = {},
) {
  const config = app.store.teacherState(roomId).collection;
  config.fields = config.fields.map((f) => ({
    ...f,
    enabled: enabled.includes(f.id),
    required: required.includes(f.id),
  }));
  config.display = { ...config.display, ...display };
  return value(
    await request(
      "PUT",
      `/api/teacher/classrooms/${roomId}/collection`,
      config,
    ),
  );
}

test("教师勾选采集项、城市学校联动、必填校验及未启用字段不采集", async () => {
  const r = await room("");
  let config = await configureCollection(
    r.id,
    ["city", "school", "className", "studentNo", "name"],
    ["city", "school", "studentNo", "name"],
  );
  config.schools = [
    { city: "南京市", school: "甲小学" },
    { city: "苏州市", school: "乙小学" },
  ];
  value(
    await request("PUT", `/api/teacher/classrooms/${r.id}/collection`, config),
  );
  const options = value(
    await request("GET", `/api/join/options?code=${r.code}`, undefined, ""),
  );
  assert.deepEqual(
    options.collection.fields.map((f) => f.id),
    ["city", "school", "className", "studentNo", "name"],
  );
  assert.deepEqual(options.collection.cities, ["南京市", "苏州市"]);
  assert.equal(options.collection.display, undefined);
  const invalidIdentity = {
    ...config,
    fields: config.fields.map((f) =>
      ["name", "nickname"].includes(f.id)
        ? { ...f, enabled: true, required: true }
        : f,
    ),
  };
  assert.equal(
    (
      await request(
        "PUT",
        `/api/teacher/classrooms/${r.id}/collection`,
        invalidIdentity,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request("PUT", `/api/teacher/classrooms/${r.id}/collection`, {
        ...config,
        schools: [{ city: "北京市", school: "不应保存" }],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request("POST", "/api/join", { code: r.code }, "")).statusCode,
    400,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/join",
        {
          code: r.code,
          profile: {
            city: "南京市",
            school: "乙小学",
            studentNo: "0007",
            name: "测试张三",
          },
        },
        "",
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/join",
        {
          code: r.code,
          profile: {
            city: "北京市",
            school: "甲小学",
            studentNo: "0007",
            name: "测试张三",
          },
        },
        "",
      )
    ).statusCode,
    400,
  );
  const s = await student(r.code, {
    profile: {
      city: "南京市",
      school: "甲小学",
      className: "六一",
      studentNo: "0007",
      name: "测试张三",
      nickname: "未启用不应采集",
      phone: "不应采集",
    },
  });
  assert.equal(s.state.participant.city, "南京市");
  assert.equal(s.state.participant.name, "测试张三");
  assert.equal(s.state.participant.studentNo, "0007");
  assert.equal(s.state.participant.nickname, "");
  assert.equal(s.state.participant.displayName, "测试张三");
  assert.equal(s.state.participant.phone, undefined);
  const p = app.store.get(
    "SELECT * FROM participants WHERE classroom_id=?",
    r.id,
  );
  assert.equal(p.student_no, "0007");
  assert.equal(p.name, "测试张三");
  assert.ok(!JSON.stringify(p).includes("不应采集"));
  assert.equal(
    (
      await request(
        "PUT",
        `/api/teacher/classrooms/${r.id}/collection`,
        config,
        s.cookie,
      )
    ).statusCode,
    401,
  );
});

test("姓名或昵称在前后端按二选一处理，并可被后台改为固定项", async () => {
  const r = await room("");
  await configureCollection(r.id, ["name", "nickname"], ["nickname"]);
  assert.equal(
    (await request("POST", "/api/join", { code: r.code }, "")).statusCode,
    400,
  );
  const s = await student(r.code, { profile: { nickname: "课堂小明" } });
  assert.equal(s.state.participant.nickname, "课堂小明");
  await configureCollection(r.id, ["name", "nickname"], ["name"]);
  assert.deepEqual(
    value(await request("GET", "/api/student/state", undefined, s.cookie))
      .missingProfile,
    [],
  );
});

test("同一会话恢复身份、反馈自动关联、心跳续期与重启后继续采集", async () => {
  const r = await room("");
  await configureCollection(r.id, ["name", "studentNo", "city"], ["name"]);
  const s = await student(r.code, {
    profile: { name: "测试李四", studentNo: "00109", city: "南京市" },
  });
  const a = await activity(r.id, { type: "text", title: "解释观察" });
  await control(a.id);
  const rejoin = value(
    await request(
      "POST",
      "/api/join",
      { code: r.code, profile: { name: "不应覆盖" } },
      s.cookie,
    ),
  );
  assert.equal(rejoin.participant.name, "测试李四");
  assert.equal(app.store.roomSummary(r).total, 1);
  value(
    await request(
      "POST",
      `/api/student/activities/${a.id}/answer`,
      { text: "观察需要证据" },
      s.cookie,
    ),
  );
  const response = app.store.stats(a.id).responses[0];
  assert.equal(response.name, "测试李四");
  assert.equal(response.student_no, "00109");
  assert.equal(response.city, "南京市");
  const hb = await request("POST", "/api/student/heartbeat", {}, s.cookie);
  value(hb);
  assert.ok(hb.headers["set-cookie"].startsWith(s.cookie + ";"));
  assert.match(hb.headers["set-cookie"], /Max-Age=86400/);
  await app.close();
  app = await buildApp({ dataDir: dir, serveStatic: false });
  const restored = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.equal(restored.participant.studentNo, "00109");
  assert.equal(restored.groups[0].completed, 1);
  const exported = value(
    await request("GET", `/api/teacher/classrooms/${r.id}/export?format=json`),
  );
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.participants[0].name, "测试李四");
  assert.equal(exported.participants[0].token, undefined);
});

test("新增必填项要求当前会话补填，不新增参与端，关闭字段保留原记录", async () => {
  const r = await room("");
  const s = await student(r.code);
  const a = await activity(r.id, { type: "text", title: "记录观察" });
  await control(a.id);
  await configureCollection(r.id, ["name", "city"], ["name", "city"]);
  const state = value(
    await request("GET", "/api/student/state", undefined, s.cookie),
  );
  assert.deepEqual(state.missingProfile, ["姓名"]);
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { text: "证据" },
        s.cookie,
      )
    ).statusCode,
    409,
  );
  value(
    await request(
      "PUT",
      "/api/student/profile",
      { name: "测试王五", city: "无锡市", studentNo: "未开启不收集" },
      s.cookie,
    ),
  );
  value(
    await request(
      "POST",
      `/api/student/activities/${a.id}/answer`,
      { text: "证据" },
      s.cookie,
    ),
  );
  assert.equal(app.store.roomSummary(r).total, 1);
  await configureCollection(r.id, [], []);
  value(
    await request(
      "PUT",
      "/api/student/profile",
      { name: "伪造覆盖", studentNo: "伪造学号" },
      s.cookie,
    ),
  );
  const p = app.store.get(
    "SELECT * FROM participants WHERE classroom_id=?",
    r.id,
  );
  assert.equal(p.name, "测试王五");
  assert.equal(p.student_no, "");
  assert.deepEqual(
    value(
      await request("GET", `/api/join/options?code=${r.code}`, undefined, ""),
    ).collection.fields,
    [],
  );
});

test("大屏与学生统计仅公布汇总，词云经教师公布且过滤采集身份，关闭立即生效", async () => {
  const r = await room("");
  await configureCollection(r.id, ["city", "school", "name", "studentNo"]);
  const a = await activity(r.id, { type: "text", title: "生物现象" });
  await control(a.id);
  const draft = await activity(r.id, {
    type: "text",
    title: "尚未公开的任务标题",
  });
  const one = await student(r.code, {
    profile: {
      city: "南京市",
      school: "同名小学",
      name: "隐私姓名甲",
      studentNo: "0000012345",
    },
  });
  const two = await student(r.code, {
    profile: {
      city: "苏州市",
      school: "同名小学",
      name: "隐私姓名乙",
      studentNo: "0000054321",
    },
  });
  for (const s of [one, two])
    value(
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        {
          text: `${s.state.participant.name} ${s.state.participant.studentNo} 光合作用 光合作用 水分 阳光`,
        },
        s.cookie,
      ),
    );
  assert.equal(
    (await request("GET", "/api/student/dashboard", undefined, one.cookie))
      .statusCode,
    403,
  );
  const teacher = value(
    await request(
      "GET",
      `/api/teacher/classrooms/${r.id}/dashboard?activityId=${a.id}`,
    ),
  );
  assert.equal(teacher.overview.participants, 2);
  assert.equal(teacher.overview.answers, 2);
  assert.equal(teacher.overview.schools, 2);
  assert.equal(
    teacher.selected.wordCloud.terms.find((t) => t.text === "光合作用").count,
    2,
  );
  assert.ok(!JSON.stringify(teacher).includes("隐私姓名"));
  assert.ok(!JSON.stringify(teacher).includes("0000012345"));
  assert.ok(!JSON.stringify(teacher).includes(draft.title));
  const screen = value(
    await request(
      "GET",
      `/api/teacher/classrooms/${r.id}/dashboard?shared=1&activityId=${a.id}`,
    ),
  );
  assert.equal(screen.selected.visible, false);
  assert.equal(screen.selected.wordCloud, null);
  await configureCollection(r.id, ["city", "school", "name", "studentNo"], [], {
    studentStats: true,
  });
  const before = value(
    await request("GET", "/api/student/dashboard", undefined, one.cookie),
  );
  assert.equal(before.selected.wordCloud, null);
  assert.deepEqual(before.selected.distribution, []);
  await control(a.id, "reveal");
  const after = value(
    await request("GET", "/api/student/dashboard", undefined, one.cookie),
  );
  assert.equal(after.selected.visible, true);
  assert.equal(after.selected.wordCloud.sampleSize, 2);
  assert.equal(
    after.selected.wordCloud.terms.find((t) => t.text === "光合作用").count,
    2,
  );
  for (const privateValue of [
    "隐私姓名",
    "0000012345",
    "0000054321",
    "participant_id",
    "request_id",
    "token",
    "responses",
  ])
    assert.ok(!JSON.stringify(after).includes(privateValue), privateValue);
  await configureCollection(r.id, ["city", "school", "name", "studentNo"], [], {
    studentStats: true,
    wordCloud: false,
  });
  assert.equal(
    value(await request("GET", "/api/student/dashboard", undefined, one.cookie))
      .selected.wordCloud,
    null,
  );
  await configureCollection(r.id, [], [], { studentStats: false });
  assert.equal(
    (await request("GET", "/api/student/dashboard", undefined, one.cookie))
      .statusCode,
    403,
  );
});

test("采集记录按教师权限分页和导出，复用课堂带设置而不带身份记录", async () => {
  const r = await room("");
  await configureCollection(r.id, ["name", "studentNo"], ["name"], {
    studentStats: true,
  });
  const all = await Promise.all(
    Array.from({ length: 52 }, (_, i) =>
      student(r.code, {
        profile: { name: `样例 ${i}`, studentNo: i === 0 ? "=1+1" : String(i) },
      }),
    ),
  );
  assert.equal(
    (
      await request(
        "GET",
        `/api/teacher/classrooms/${r.id}/participants`,
        undefined,
        all[0].cookie,
      )
    ).statusCode,
    401,
  );
  const page = value(
    await request("GET", `/api/teacher/classrooms/${r.id}/participants`),
  );
  assert.equal(page.total, 52);
  assert.equal(page.rows.length, 50);
  assert.equal(page.rows[0].token, undefined);
  assert.equal(
    value(
      await request(
        "GET",
        `/api/teacher/classrooms/${r.id}/participants?offset=50`,
      ),
    ).rows.length,
    2,
  );
  const csv = await request(
    "GET",
    `/api/teacher/classrooms/${r.id}/participants?format=csv`,
  );
  assert.equal(csv.statusCode, 200);
  assert.ok(csv.body.includes('"\'=1+1"'));
  value(await request("POST", `/api/teacher/classrooms/${r.id}/end`, {}));
  const copy = value(
    await request("POST", `/api/teacher/classrooms/${r.id}/duplicate`, {}),
  );
  assert.equal(
    app.store.teacherState(copy.id).collection.display.studentStats,
    true,
  );
  assert.equal(
    value(
      await request("GET", `/api/teacher/classrooms/${copy.id}/participants`),
    ).total,
    0,
  );
});

test("词云按每份回答计数、排除词生效、采样和长度有界", async () => {
  const { buildWordCloud } = await import("../server/word-cloud.js");
  const words = buildWordCloud(
    [
      {
        content: JSON.stringify({
          text: "光合作用 光合作用 阳光 水分 张三 13812345678 test@example.com",
        }),
      },
      { content: JSON.stringify({ text: "光合作用 阳光" }) },
    ],
    2,
    ["张三"],
    ["阳光"],
  );
  assert.equal(words.terms.find((t) => t.text === "光合作用").count, 2);
  assert.ok(
    words.terms.every(
      (t) =>
        !/[0-9@]/.test(t.text) &&
        !t.text.includes("阳光") &&
        !t.text.includes("张三"),
    ),
  );
  const bounded = buildWordCloud(
    Array.from({ length: 300 }, () => ({
      content: JSON.stringify({ text: "光合作用 水分 ".repeat(250) }),
    })),
    9000,
  );
  assert.ok(bounded.characters <= 24000);
  assert.ok(bounded.terms.length <= 50);
  assert.equal(bounded.sampled, true);
  assert.ok(bounded.sampleSize < 300);
});

for (const operation of [
  "group-pause",
  "activity-pause",
  "group-close",
  "classroom-end",
]) {
  test(`AI ${operation} 立即取消对应排队请求，恢复后不重新派发`, async () => {
    let release;
    modelGate = new Promise((resolve) => {
      release = resolve;
    });
    try {
      value(
        await request("PUT", "/api/teacher/model", {
          baseUrl: "https://model.invalid/v1",
          model: "test-model",
          apiKey: "",
          enabled: true,
          concurrency: 1,
          maxQueue: 3,
          maxTokens: 200,
        }),
      );
      const r = await room("");
      const a = await activity(r.id, {
        type: "ai",
        title: "先开放的探究",
        prompt: "解释概念",
        aiLimit: 3,
      });
      await control(a.id);
      const b = await activity(r.id, {
        type: "ai",
        title: "另一组探究",
        prompt: "解释概念",
        aiLimit: 3,
      });
      await control(b.id);
      const people = await Promise.all(
        Array.from({ length: 3 }, () => student(r.code)),
      );
      const jobs = [];
      for (let i = 0; i < people.length; i++) {
        jobs.push(
          value(
            await request(
              "POST",
              `/api/student/activities/${i < 2 ? a.id : b.id}/ai`,
              { question: `问题 ${i}`, requestId: `held-${i}` },
              people[i].cookie,
            ),
          ),
        );
      }
      assert.equal(modelCalls.length, 1);
      if (operation === "classroom-end")
        value(await request("POST", `/api/teacher/classrooms/${r.id}/end`, {}));
      else if (operation === "activity-pause") await control(a.id, "pause");
      else
        value(
          await request("POST", `/api/teacher/groups/${a.group_id}/control`, {
            action: operation === "group-close" ? "close" : "pause",
          }),
        );

      const status = (id) =>
        app.store.get("SELECT status FROM ai_jobs WHERE id=?", id).status;
      assert.equal(status(jobs[0].id), "running");
      assert.equal(status(jobs[1].id), "cancelled");
      assert.equal(
        status(jobs[2].id),
        operation === "classroom-end" ? "cancelled" : "queued",
      );
      if (operation.endsWith("pause")) {
        await control(a.id, "publish");
        const retry = value(
          await request(
            "POST",
            `/api/student/activities/${a.id}/ai`,
            { question: "问题 1", requestId: "held-1" },
            people[1].cookie,
          ),
        );
        assert.equal(retry.status, "cancelled");
        assert.equal(modelCalls.length, 1);
        // The cancelled job must no longer block this participant's next task.
        value(
          await request(
            "POST",
            `/api/student/activities/${b.id}/ai`,
            { question: "新任务的问题", requestId: "after-pause" },
            people[1].cookie,
          ),
        );
      }
      release();
      await idle();
      assert.equal(status(jobs[1].id), "cancelled");
      assert.equal(
        modelCalls.length,
        operation === "classroom-end" ? 1 : operation.endsWith("pause") ? 3 : 2,
      );
      assert.ok(
        !modelCalls.some(
          (call) => call.body.messages.at(-1).content === "问题 1",
        ),
      );
      assert.equal(peakModels, 1);
    } finally {
      release();
      await idle();
    }
  });
}

test("自动参与编号不满足后来开启的昵称必填，补填后沿用原会话", async () => {
  const r = await room("");
  await configureCollection(r.id, [], []);
  const s = await student(r.code);
  assert.equal(s.state.participant.nickname, "");
  assert.match(s.state.participant.displayName, /^同学 /);
  const a = await activity(r.id, { type: "text", title: "补填后的反馈" });
  await control(a.id);
  await configureCollection(r.id, ["nickname"], ["nickname"]);
  assert.deepEqual(
    value(await request("GET", "/api/student/state", undefined, s.cookie))
      .missingProfile,
    ["昵称"],
  );
  assert.equal(
    (
      await request(
        "POST",
        `/api/student/activities/${a.id}/answer`,
        { text: "尚未补填" },
        s.cookie,
      )
    ).statusCode,
    409,
  );
  await configureCollection(r.id, ["name", "nickname"], ["nickname"]);
  assert.deepEqual(
    value(await request("GET", "/api/student/state", undefined, s.cookie))
      .missingProfile,
    ["姓名或昵称"],
  );
  const saved = value(
    await request(
      "PUT",
      "/api/student/profile",
      { nickname: "补填同学" },
      s.cookie,
    ),
  );
  assert.equal(saved.participant.displayName, "补填同学");
  assert.deepEqual(saved.missingProfile, []);
  value(
    await request(
      "POST",
      `/api/student/activities/${a.id}/answer`,
      { text: "补填完成" },
      s.cookie,
    ),
  );
  assert.equal(app.store.roomSummary(r).total, 1);
});

test("姓名和昵称切换不会回填自动编号，明细与导出只记录实际填写值", async () => {
  const r = await room("");
  await configureCollection(r.id, ["name", "nickname"], ["nickname"]);
  const s = await student(r.code, { name: "测试陈明", nickname: "" });
  assert.equal(s.state.participant.name, "测试陈明");
  assert.equal(s.state.participant.nickname, "");
  assert.equal(s.state.participant.displayName, "测试陈明");
  let state = value(
    await request(
      "PUT",
      "/api/student/profile",
      { name: "", nickname: "课堂昵称" },
      s.cookie,
    ),
  );
  assert.equal(state.participant.name, "");
  assert.equal(state.participant.displayName, "课堂昵称");
  state = value(
    await request(
      "PUT",
      "/api/student/profile",
      { name: "测试陈明", nickname: "" },
      s.cookie,
    ),
  );
  assert.equal(state.participant.nickname, "");
  assert.equal(state.participant.displayName, "测试陈明");
  const rows = value(
    await request("GET", `/api/teacher/classrooms/${r.id}/participants`),
  ).rows;
  assert.equal(rows[0].nickname, "");
  assert.equal(rows[0].displayName, "测试陈明");
  const exported = value(
    await request("GET", `/api/teacher/classrooms/${r.id}/export?format=json`),
  );
  assert.equal(exported.participants[0].nickname, "");
  assert.equal(exported.participants[0].displayName, "测试陈明");
});

test("旧版自动昵称兼容迁移保留记录，真实昵称及迁移后显式填写的编号不被误判", async () => {
  const r = await room("");
  await configureCollection(r.id, [], []);
  const anonymous = await student(r.code);
  const original = app.store.get(
    "SELECT * FROM participants WHERE classroom_id=?",
    r.id,
  );
  await configureCollection(r.id, ["nickname"], ["nickname"]);
  const named = await student(r.code, { nickname: "实际填写的昵称" });
  const namedId = app.store.get(
    "SELECT id FROM participants WHERE nickname=?",
    "实际填写的昵称",
  ).id;
  const explicitLabel =
    namedId.slice(0, 4).toUpperCase() === "ABCD" ? "同学 DCBA" : "同学 ABCD";
  value(
    await request(
      "PUT",
      "/api/student/profile",
      { nickname: explicitLabel },
      named.cookie,
    ),
  );
  // Simulate the previous release's schema, preserving the same session tokens.
  await app.close();
  const db = new DatabaseSync(join(dir, "classroom.sqlite"));
  if (
    db
      .prepare("PRAGMA table_info(participants)")
      .all()
      .some((c) => c.name === "nickname_generated")
  )
    db.exec("ALTER TABLE participants DROP COLUMN nickname_generated");
  db.close();
  app = await buildApp({ dataDir: dir, serveStatic: false });
  let state = value(
    await request("GET", "/api/student/state", undefined, anonymous.cookie),
  );
  assert.equal(state.participant.nickname, "");
  assert.deepEqual(state.missingProfile, ["昵称"]);
  assert.equal(
    value(await request("GET", "/api/student/state", undefined, named.cookie))
      .participant.nickname,
    explicitLabel,
  );
  assert.equal(app.store.roomSummary(r).total, 2);
  // A student can explicitly choose a value identical to their display number.
  value(
    await request(
      "PUT",
      "/api/student/profile",
      { nickname: `同学 ${namedId.slice(0, 4).toUpperCase()}` },
      named.cookie,
    ),
  );
  value(
    await request(
      "PUT",
      "/api/student/profile",
      { nickname: original.nickname },
      anonymous.cookie,
    ),
  );
  await app.close();
  app = await buildApp({ dataDir: dir, serveStatic: false });
  state = value(
    await request("GET", "/api/student/state", undefined, anonymous.cookie),
  );
  assert.equal(state.participant.nickname, original.nickname);
  assert.deepEqual(state.missingProfile, []);
  assert.deepEqual(
    value(await request("GET", "/api/student/state", undefined, named.cookie))
      .missingProfile,
    [],
  );
});

test("关闭学校采集后名单不再限制城市，重新开启后恢复联动校验", async () => {
  const r = await room("");
  const config = await configureCollection(
    r.id,
    ["city", "school"],
    ["city", "school"],
  );
  config.schools = [{ city: "南京市", school: "名单学校" }];
  value(
    await request("PUT", `/api/teacher/classrooms/${r.id}/collection`, config),
  );
  await configureCollection(r.id, ["city"], ["city"]);
  const options = value(
    await request("GET", `/api/join/options?code=${r.code}`, undefined, ""),
  );
  assert.equal(options.collection.cities.length, 13);
  for (const city of options.collection.cities) {
    const joined = value(
      await request(
        "POST",
        "/api/join",
        { code: r.code, profile: { city, school: "隐藏字段" } },
        "",
      ),
    );
    assert.equal(joined.participant.city, city);
    assert.equal(joined.participant.school, "未填写学校");
  }
  await configureCollection(r.id, ["city", "school"], ["city", "school"]);
  assert.deepEqual(
    value(
      await request("GET", `/api/join/options?code=${r.code}`, undefined, ""),
    ).collection.cities,
    ["南京市"],
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/join",
        { code: r.code, profile: { city: "苏州市", school: "名单学校" } },
        "",
      )
    ).statusCode,
    400,
  );
  value(
    await request(
      "POST",
      "/api/join",
      { code: r.code, profile: { city: "南京市", school: "名单学校" } },
      "",
    ),
  );
  await configureCollection(r.id, ["school"], ["school"]);
  value(
    await request(
      "POST",
      "/api/join",
      { code: r.code, profile: { school: "名单学校" } },
      "",
    ),
  );
  assert.equal(
    (
      await request(
        "POST",
        "/api/join",
        { code: r.code, profile: { school: "名单外学校" } },
        "",
      )
    ).statusCode,
    400,
  );
});
