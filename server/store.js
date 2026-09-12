import { DatabaseSync } from "node:sqlite";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import { templates, TYPES } from "./templates.js";

export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const now = () => Date.now();
export function str(value, name, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new AppError(`${name}请填写 ${required ? "1" : "0"}–${max} 个字符`);
  return value.trim();
}
export function normalizeActivity(body) {
  if (!Object.hasOwn(TYPES, body.type))
    throw new AppError("请选择有效的活动类型");
  const a = {
    type: body.type,
    title: str(body.title, "活动题目", 500),
    description: str(body.description ?? "", "活动说明", 1200, false),
    options: [],
    correct: [],
  };
  if (a.type === "boolean") a.options = ["正确", "错误"];
  else if (a.type === "understanding")
    a.options = [
      "已经理解，可以应用",
      "基本理解，还有疑问",
      "需要老师再讲一讲",
    ];
  else if (["single", "multiple", "poll"].includes(a.type)) {
    if (
      !Array.isArray(body.options) ||
      body.options.length < 2 ||
      body.options.length > 8
    )
      throw new AppError("请设置 2–8 个选项");
    a.options = body.options.map((o) => str(o, "选项", 200));
    if (new Set(a.options).size !== a.options.length)
      throw new AppError("选项内容不能重复");
  }
  if (["single", "multiple", "boolean"].includes(a.type)) {
    if (!Array.isArray(body.correct ?? []))
      throw new AppError("参考答案格式不正确");
    a.correct = [...new Set(body.correct ?? [])].sort();
    if (
      a.correct.some(
        (c) =>
          typeof c !== "string" ||
          !a.options[Number(c)] ||
          String(Number(c)) !== c,
      )
    )
      throw new AppError("参考答案必须对应现有选项");
    if (a.type !== "multiple" && a.correct.length > 1)
      throw new AppError("此题只能设置一个参考答案");
  }
  const duration = Number(body.duration ?? 0);
  if (!Number.isInteger(duration) || duration < 0 || duration > 3600)
    throw new AppError("作答时间应为 0–3600 秒，0 表示不限时");
  a.duration = duration;
  if (a.type === "ai") {
    a.prompt = str(body.prompt, "AI 任务指令", 2000);
    a.aiLimit = Number(body.aiLimit ?? 3);
    if (!Number.isInteger(a.aiLimit) || a.aiLimit < 1 || a.aiLimit > 5)
      throw new AppError("每端调用次数应为 1–5 次");
  }
  return a;
}
export function normalizeAnswer(activity, body) {
  if (["text", "ai"].includes(activity.type))
    return { text: str(body.text, "回答／反思", 2000) };
  if (activity.type === "exit") {
    const difficulty = Number(body.difficulty);
    if (![1, 2, 3, 4, 5].includes(difficulty))
      throw new AppError("请选择课堂难度");
    return {
      takeaway: str(body.takeaway, "学习收获", 1000),
      question: str(body.question ?? "", "待解决问题", 1000, false),
      difficulty,
    };
  }
  if (!Array.isArray(body.choices)) throw new AppError("请选择答案");
  const choices = [...new Set(body.choices)].sort();
  if (
    !choices.length ||
    (activity.type !== "multiple" && choices.length !== 1) ||
    choices.some(
      (c) =>
        typeof c !== "string" ||
        !activity.options[Number(c)] ||
        String(Number(c)) !== c,
    )
  )
    throw new AppError("请选择有效选项");
  return { choices };
}
export const effectiveStatus = (a) =>
  a.status === "live" && a.deadline && a.deadline <= now()
    ? "closed"
    : a.status;

export function createStore(directory) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const db = new DatabaseSync(join(root, "classroom.sqlite"));
  chmodSync(join(root, "classroom.sqlite"), 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teacher_sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS task_groups (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), title TEXT NOT NULL, position INTEGER NOT NULL, duration INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', deadline INTEGER, remaining INTEGER, published_at INTEGER);
    CREATE TABLE IF NOT EXISTS classrooms (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, grade TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', current_activity_id TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), position INTEGER NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', revealed INTEGER NOT NULL DEFAULT 0, deadline INTEGER, remaining INTEGER, published_at INTEGER);
    CREATE TABLE IF NOT EXISTS participants (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), token TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL, school TEXT NOT NULL, class_name TEXT NOT NULL, mode TEXT NOT NULL, size INTEGER NOT NULL, joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES activities(id), participant_id TEXT NOT NULL REFERENCES participants(id), content TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(activity_id, participant_id));
    CREATE TABLE IF NOT EXISTS activity_visits (activity_id TEXT NOT NULL REFERENCES activities(id), participant_id TEXT NOT NULL REFERENCES participants(id), started_at INTEGER NOT NULL, PRIMARY KEY(activity_id,participant_id));
    CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id), participant_id TEXT NOT NULL REFERENCES participants(id), content TEXT NOT NULL, answered INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS analyses (activity_id TEXT PRIMARY KEY REFERENCES activities(id), content TEXT NOT NULL, sample_size INTEGER NOT NULL, answer_count INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_jobs (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id), activity_id TEXT NOT NULL REFERENCES activities(id), request_id TEXT NOT NULL, question TEXT NOT NULL, status TEXT NOT NULL, answer TEXT, error TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, UNIQUE(participant_id, activity_id, request_id));
    CREATE INDEX IF NOT EXISTS ai_jobs_participant ON ai_jobs(participant_id,activity_id);
    CREATE INDEX IF NOT EXISTS ai_jobs_status ON ai_jobs(status);
    CREATE INDEX IF NOT EXISTS participants_classroom ON participants(classroom_id);
    CREATE INDEX IF NOT EXISTS answers_activity ON answers(activity_id);
    CREATE INDEX IF NOT EXISTS answers_participant ON answers(participant_id,activity_id);
    CREATE INDEX IF NOT EXISTS activities_classroom ON activities(classroom_id);
    CREATE INDEX IF NOT EXISTS questions_classroom ON questions(classroom_id);`);
  if (
    !db
      .prepare("PRAGMA table_info(activities)")
      .all()
      .some((c) => c.name === "group_id")
  )
    db.exec(
      "ALTER TABLE activities ADD COLUMN group_id TEXT REFERENCES task_groups(id)",
    );
  if (
    !db
      .prepare("PRAGMA table_info(classrooms)")
      .all()
      .some((c) => c.name === "current_group_id")
  )
    db.exec(
      "ALTER TABLE classrooms ADD COLUMN current_group_id TEXT REFERENCES task_groups(id)",
    );
  db.exec(
    "CREATE INDEX IF NOT EXISTS activities_group ON activities(group_id); CREATE INDEX IF NOT EXISTS task_groups_classroom ON task_groups(classroom_id);",
  );
  const statsCache = new Map();
  const run = (sql, ...args) => {
    if (!/teacher_sessions|SET last_seen/.test(sql)) statsCache.clear();
    return db.prepare(sql).run(...args);
  };
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const meta = (key) => {
    const v = get("SELECT value FROM meta WHERE key=?", key);
    return v ? JSON.parse(v.value) : null;
  };
  const setMeta = (key, value) =>
    run(
      "INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      JSON.stringify(value),
    );
  function classroom(id) {
    const room = get("SELECT * FROM classrooms WHERE id=?", id);
    if (!room) throw new AppError("课堂不存在", 404);
    return room;
  }
  function activity(id) {
    const row = get("SELECT * FROM activities WHERE id=?", id);
    if (!row) throw new AppError("活动不存在", 404);
    return { ...row, ...JSON.parse(row.content), status: effectiveStatus(row) };
  }
  function group(id) {
    const row = get("SELECT * FROM task_groups WHERE id=?", id);
    if (!row) throw new AppError("任务组不存在", 404);
    return { ...row, status: effectiveStatus(row) };
  }
  function addGroup(roomId, body = {}) {
    if (classroom(roomId).status === "ended")
      throw new AppError("课堂已结束", 409);
    const position = get(
      "SELECT COALESCE(MAX(position),-1)+1 AS n FROM task_groups WHERE classroom_id=?",
      roomId,
    ).n;
    const title = str(body.title ?? `任务组 ${position + 1}`, "任务组名称", 80);
    const duration = Number(body.duration ?? 0);
    if (!Number.isInteger(duration) || duration < 0 || duration > 7200)
      throw new AppError("任务组开放时长应为 0–7200 秒");
    const id = randomUUID();
    run(
      "INSERT INTO task_groups (id,classroom_id,title,position,duration) VALUES (?,?,?,?,?)",
      id,
      roomId,
      title,
      position,
      duration,
    );
    return group(id);
  }
  function controlGroup(id, action) {
    const g = group(id);
    if (classroom(g.classroom_id).status === "ended")
      throw new AppError("课堂已结束", 409);
    transaction(() => {
      if (action === "publish") {
        if (!["draft", "paused"].includes(g.status))
          throw new AppError("任务组无法重复发布", 409);
        const first = get(
          "SELECT id FROM activities WHERE group_id=? ORDER BY position LIMIT 1",
          id,
        );
        if (!first) throw new AppError("请先在任务组中添加至少一项任务");
        const remaining =
          g.status === "paused" ? g.remaining : g.duration * 1000;
        const deadline = remaining ? now() + remaining : null;
        run(
          "UPDATE task_groups SET status='live',deadline=?,remaining=NULL,published_at=COALESCE(published_at,?) WHERE id=?",
          deadline,
          now(),
          id,
        );
        run(
          "UPDATE activities SET status='live',deadline=?,remaining=NULL,published_at=COALESCE(published_at,?) WHERE group_id=?",
          deadline,
          now(),
          id,
        );
        run(
          "UPDATE classrooms SET status='live',current_group_id=?,current_activity_id=? WHERE id=?",
          id,
          first.id,
          g.classroom_id,
        );
      } else if (action === "pause") {
        if (g.status !== "live") throw new AppError("任务组不在开放中", 409);
        const remaining = g.deadline ? Math.max(1, g.deadline - now()) : 0;
        run(
          "UPDATE task_groups SET status='paused',remaining=?,deadline=NULL WHERE id=?",
          remaining,
          id,
        );
        run(
          "UPDATE activities SET status='paused',remaining=?,deadline=NULL WHERE group_id=?",
          remaining,
          id,
        );
      } else if (action === "close") {
        if (g.status === "draft") throw new AppError("任务组尚未发布", 409);
        run(
          "UPDATE task_groups SET status='closed',deadline=NULL WHERE id=?",
          id,
        );
        run(
          "UPDATE activities SET status='closed',deadline=NULL WHERE group_id=?",
          id,
        );
      } else throw new AppError("无效的任务组操作");
    });
    return group(id);
  }
  function addActivity(roomId, body) {
    if (classroom(roomId).status === "ended")
      throw new AppError("已结束的课堂不能添加活动", 409);
    const content = normalizeActivity(body);
    let targetGroup;
    if (body.groupId) targetGroup = group(body.groupId);
    else {
      const draft = get(
        "SELECT id FROM task_groups WHERE classroom_id=? AND status='draft' ORDER BY position LIMIT 1",
        roomId,
      );
      targetGroup = draft
        ? group(draft.id)
        : addGroup(roomId, { duration: content.duration });
    }
    if (targetGroup.classroom_id !== roomId)
      throw new AppError("任务组不属于当前课堂", 403);
    if (targetGroup.status !== "draft")
      throw new AppError("已发布的任务组不能再增加任务，请新建一组", 409);
    const id = randomUUID();
    const position = get(
      "SELECT COALESCE(MAX(position), -1)+1 AS n FROM activities WHERE classroom_id=?",
      roomId,
    ).n;
    run(
      "INSERT INTO activities (id,classroom_id,position,content,group_id) VALUES (?,?,?,?,?)",
      id,
      roomId,
      position,
      JSON.stringify(content),
      targetGroup.id,
    );
    return activity(id);
  }
  function createClassroom(body) {
    const title = str(body.title, "课堂名称", 100);
    const subject = str(body.subject || "通用", "学科", 30);
    const grade = str(body.grade ?? "", "年级／对象", 60, false);
    const template = body.templateId
      ? templates.find((t) => t.id === body.templateId)
      : null;
    if (body.templateId && !template) throw new AppError("模板不存在");
    return transaction(() => {
      const id = randomUUID();
      let code;
      do {
        code = String(randomInt(100000, 1000000));
      } while (get("SELECT id FROM classrooms WHERE code=?", code));
      run(
        "INSERT INTO classrooms (id,code,title,subject,grade,created_at) VALUES (?,?,?,?,?,?)",
        id,
        code,
        title,
        subject,
        grade,
        now(),
      );
      if (template) {
        const explore = addGroup(id, { title: "探索与练习" }),
          reflect = addGroup(id, { title: "回顾与反思" });
        for (const a of template.activities)
          addActivity(id, {
            ...a,
            groupId: ["understanding", "exit"].includes(a.type)
              ? reflect.id
              : explore.id,
          });
      } else addGroup(id, { title: "任务组 1" });
      return classroom(id);
    });
  }
  function stats(activityId, includeAll = false) {
    const cached = statsCache.get(activityId);
    if (!includeAll && cached && cached.until > now()) return cached.value;
    const a = activity(activityId);
    const total = get(
      "SELECT COUNT(*) AS n FROM participants WHERE classroom_id=?",
      a.classroom_id,
    ).n;
    const counts = get(
      "SELECT COUNT(*) AS submitted, COALESCE(SUM(json_extract(content,'$.choices')=?),0) AS correctCount FROM answers WHERE activity_id=?",
      JSON.stringify(a.correct),
      a.id,
    );
    const submitted = counts.submitted;
    const distribution = all(
      "SELECT v.value AS choice, COUNT(*) AS n FROM answers, json_each(answers.content,'$.choices') v WHERE answers.activity_id=? GROUP BY v.value",
      a.id,
    );
    const groups = all(
      "SELECT p.school,p.class_name AS className,COUNT(*) AS total,COUNT(a.id) AS submitted,SUM(p.last_seen>?) AS online,COALESCE(SUM(json_extract(a.content,'$.choices')=?),0) AS correct FROM participants p LEFT JOIN answers a ON a.participant_id=p.id AND a.activity_id=? WHERE p.classroom_id=? GROUP BY p.school,p.class_name ORDER BY p.school,p.class_name",
      now() - 75000,
      JSON.stringify(a.correct),
      a.id,
      a.classroom_id,
    );
    const rows = all(
      `SELECT answers.*, participants.nickname,participants.school,participants.class_name,participants.mode FROM answers JOIN participants ON participants.id=answers.participant_id WHERE activity_id=? ORDER BY created_at DESC ${includeAll ? "" : "LIMIT 100"}`,
      activityId,
    ).map((r) => ({ ...r, answer: JSON.parse(r.content) }));
    const result = {
      total,
      submitted,
      submissionRate: total ? Math.round((submitted / total) * 100) : 0,
      correctCount: a.correct.length ? counts.correctCount : 0,
      correctRate:
        a.correct.length && submitted
          ? Math.round((counts.correctCount / submitted) * 100)
          : null,
      distribution: a.options.map((label, i) => {
        const count =
          distribution.find((d) => String(d.choice) === String(i))?.n ?? 0;
        return {
          label,
          count,
          percent: submitted ? Math.round((count / submitted) * 100) : 0,
        };
      }),
      groups,
      responses: rows.map(({ content, ...r }) => r),
    };
    if (!includeAll) {
      if (statsCache.size > 64) statsCache.clear();
      statsCache.set(activityId, { value: result, until: now() + 800 });
    }
    return result;
  }
  function roomSummary(room) {
    const p = get(
      "SELECT COUNT(*) AS total, COALESCE(SUM(size),0) AS represented, COUNT(DISTINCT CASE WHEN school!='未填写学校' THEN school END) AS schools, COALESCE(SUM(last_seen>?),0) AS online FROM participants WHERE classroom_id=?",
      now() - 75000,
      room.id,
    );
    const counts = get(
      "SELECT COUNT(*) AS activities, COALESCE(SUM(status!='draft'),0) AS published FROM activities WHERE classroom_id=?",
      room.id,
    );
    return { ...room, ...p, ...counts };
  }
  function teacherState(id, includeAll = false) {
    const room = roomSummary(classroom(id));
    const activities = all(
      "SELECT id FROM activities WHERE classroom_id=? ORDER BY position",
      id,
    ).map((r) => {
      const a = activity(r.id);
      const s = stats(r.id, includeAll);
      const analysis = get("SELECT * FROM analyses WHERE activity_id=?", r.id);
      return {
        ...a,
        stats: s,
        analysis: analysis
          ? { ...analysis, stale: analysis.answer_count !== s.submitted }
          : null,
      };
    });
    const questions = all(
      "SELECT q.*,p.nickname,p.school,p.class_name FROM questions q JOIN participants p ON p.id=q.participant_id WHERE q.classroom_id=? ORDER BY q.answered, q.created_at DESC",
      id,
    );
    const groups = all(
      "SELECT id FROM task_groups WHERE classroom_id=? ORDER BY position",
      id,
    ).map((row) => {
      const g = group(row.id);
      const taskIds = activities
        .filter((a) => a.group_id === g.id)
        .map((a) => a.id);
      return { ...g, taskIds, progress: groupProgress(g.id, taskIds.length) };
    });
    return { room, groups, activities, questions };
  }
  function groupProgress(id, taskCount) {
    const g = group(id);
    const rows = all(
      `WITH done AS (SELECT an.participant_id,COUNT(*) AS n FROM answers an JOIN activities a ON a.id=an.activity_id WHERE a.group_id=? GROUP BY an.participant_id), begun AS (SELECT DISTINCT v.participant_id FROM activity_visits v JOIN activities a ON a.id=v.activity_id WHERE a.group_id=?) SELECT p.school,p.class_name,COALESCE(done.n,0) AS done,(begun.participant_id IS NOT NULL) AS started FROM participants p LEFT JOIN done ON done.participant_id=p.id LEFT JOIN begun ON begun.participant_id=p.id WHERE p.classroom_id=?`,
      id,
      id,
      g.classroom_id,
    );
    const progress = {
      total: rows.length,
      taskCount,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      submitted: 0,
    };
    const schools = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.school, r.class_name]);
      if (!schools.has(key))
        schools.set(key, {
          school: r.school,
          className: r.class_name,
          total: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
        });
      const school = schools.get(key);
      school.total++;
      const status =
        taskCount > 0 && r.done === taskCount
          ? "completed"
          : r.done || r.started
            ? "inProgress"
            : "notStarted";
      progress[status]++;
      school[status]++;
      progress.submitted += r.done;
    }
    return {
      ...progress,
      completionRate: rows.length
        ? Math.round((progress.completed / rows.length) * 100)
        : 0,
      schools: [...schools.values()],
    };
  }
  function studentState(p) {
    const room = classroom(p.classroom_id);
    const published = all(
      "SELECT id FROM task_groups WHERE classroom_id=? AND status!='draft' ORDER BY position",
      room.id,
    ).map((row) => group(row.id));
    function publicActivity(a) {
      const answer = get(
        "SELECT content FROM answers WHERE activity_id=? AND participant_id=?",
        a.id,
        p.id,
      );
      const current = {
        id: a.id,
        groupId: a.group_id,
        type: a.type,
        title: a.title,
        description: a.description,
        options: a.options,
        status: a.status,
        deadline: a.deadline,
        revealed: !!a.revealed,
        answer: answer ? JSON.parse(answer.content) : null,
      };
      if (a.type === "ai") {
        current.aiLimit = a.aiLimit;
        current.jobs = all(
          "SELECT id,question,status,answer,error,created_at FROM ai_jobs WHERE activity_id=? AND participant_id=? ORDER BY created_at",
          a.id,
          p.id,
        );
      }
      if (a.revealed) {
        const s = stats(a.id);
        current.correct = a.correct;
        current.results = {
          submitted: s.submitted,
          distribution: s.distribution,
        };
      }
      return current;
    }
    const groups = published.map((g) => {
      const tasks = all(
        "SELECT id FROM activities WHERE group_id=? AND status!='draft' ORDER BY position",
        g.id,
      ).map((row) => publicActivity(activity(row.id)));
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        deadline: g.deadline,
        activities: tasks,
        completed: tasks.filter((a) => a.answer).length,
      };
    });
    const tasks = groups.flatMap((g) => g.activities);
    const current =
      tasks.find((a) => a.id === room.current_activity_id) ?? null;
    return {
      room: {
        id: room.id,
        code: room.code,
        title: room.title,
        subject: room.subject,
        grade: room.grade,
        status: room.status,
      },
      participant: {
        nickname: p.nickname,
        school: p.school,
        className: p.class_name,
        mode: p.mode,
        size: p.size,
      },
      activity: current,
      groups,
      questions: all(
        "SELECT id, content, answered, created_at FROM questions WHERE participant_id=? ORDER BY created_at DESC LIMIT 30",
        p.id,
      ),
    };
  }
  // Preserve every legacy activity's release boundary during the one-time upgrade.
  transaction(() => {
    for (const a of all(
      "SELECT * FROM activities WHERE group_id IS NULL ORDER BY classroom_id,position",
    )) {
      const id = randomUUID();
      const content = JSON.parse(a.content);
      run(
        "INSERT INTO task_groups (id,classroom_id,title,position,duration,status,deadline,remaining,published_at) VALUES (?,?,?,?,?,?,?,?,?)",
        id,
        a.classroom_id,
        `原活动 ${a.position + 1}`,
        a.position,
        content.duration ?? 0,
        a.status,
        a.deadline,
        a.remaining,
        a.published_at,
      );
      run("UPDATE activities SET group_id=? WHERE id=?", id, a.id);
      run(
        "UPDATE classrooms SET current_group_id=? WHERE current_activity_id=?",
        id,
        a.id,
      );
    }
  });
  return {
    root,
    db,
    run,
    get,
    all,
    transaction,
    meta,
    setMeta,
    classroom,
    activity,
    group,
    addGroup,
    controlGroup,
    addActivity,
    createClassroom,
    stats,
    teacherState,
    studentState,
    roomSummary,
    close: () => db.close(),
  };
}
