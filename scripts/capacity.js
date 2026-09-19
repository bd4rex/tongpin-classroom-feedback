import { fork } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform, arch } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (process.argv.includes("--worker")) {
  let active = 0,
    peak = 0,
    calls = 0,
    peakRss = 0;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const app = await buildApp({
    dataDir: process.env.TONGPIN_PERF_DIR,
    serveStatic: false,
    fetchImpl: async () => {
      active++;
      calls++;
      peak = Math.max(peak, active);
      await wait(120);
      active--;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "本地测试模型的模拟回答，不代表真实模型速度。",
              },
            },
          ],
        }),
      );
    },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 100);
  timer.unref();
  process.send({ event: "ready", port: app.server.address().port });
  process.on("message", async (message) => {
    if (message.event === "metrics") {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      process.send({
        event: "metrics",
        id: message.id,
        rss: process.memoryUsage().rss,
        peakRss,
        cpu: process.resourceUsage(),
        eventLoopP95Ms: loop.percentile(95) / 1e6,
        modelPeak: peak,
        modelCalls: calls,
      });
    }
    if (message.event === "stop") {
      clearInterval(timer);
      await app.close();
      process.exit(0);
    }
  });
} else {
  const directory = await mkdtemp(join(tmpdir(), "tongpin-capacity-"));
  const child = fork(import.meta.filename, ["--worker"], {
    env: { ...process.env, TONGPIN_PERF_DIR: directory },
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });
  const ready = await new Promise((resolve, reject) => {
    child.once("message", resolve);
    child.once("error", reject);
  });
  const port = ready.port;
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 200,
    maxFreeSockets: 200,
  });
  let teacher = "";
  const streams = [];
  const report = {
    createdAt: new Date().toISOString(),
    environment: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0].model,
      logicalCpus: cpus().length,
      memoryGiB: Math.round(totalmem() / 1024 ** 3),
      node: process.version,
    },
    method:
      "独立服务进程；客户端与服务端在同一台电脑；真实本机 HTTP + SSE；单进程 SQLite；每组 2 项选择题和 1 项文字任务；6 项参与信息采集；学生按 3 种顺序连续完成；最多 200 个并行 HTTP 请求；公布词云后并行读取学生统计；无真实模型调用。",
    scenarios: [],
  };
  async function request(method, path, body, cookie = teacher) {
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? null : JSON.stringify(body);
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path,
          method,
          agent,
          headers: {
            ...(payload
              ? {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(payload),
                }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (text += c));
          res.on("end", () => {
            let data;
            try {
              data = JSON.parse(text);
            } catch {
              data = { error: text };
            }
            resolve({
              status: res.statusCode,
              data,
              cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
              ms: performance.now() - started,
            });
          });
        },
      );
      req.on("error", reject);
      req.setTimeout(15000, () => req.destroy(new Error("timeout")));
      if (payload) req.write(payload);
      req.end();
    });
  }
  function success(r) {
    assert.ok(r.status < 300, JSON.stringify(r.data));
    return r;
  }
  const p95 = (values) => {
    const a = [...values].sort((a, b) => a - b);
    return (
      Math.round(a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] * 10) /
      10
    );
  };
  const metrics = () =>
    new Promise((resolve) => {
      const id = Math.random();
      const on = (m) => {
        if (m.event === "metrics" && m.id === id) {
          child.off("message", on);
          resolve(m);
        }
      };
      child.on("message", on);
      child.send({ event: "metrics", id });
    });
  async function pool(items, fn, concurrency = 100) {
    let at = 0;
    const result = [];
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (at < items.length) {
          const index = at++;
          result[index] = await fn(items[index], index);
        }
      }),
    );
    return result;
  }
  async function until(check, timeout = 20000) {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeout) throw new Error("condition timed out");
      await wait(30);
    }
  }
  function connect(cookie, onUpdate) {
    return new Promise((resolve, reject) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port,
          path: "/api/events",
          agent: false,
          headers: { Cookie: cookie },
        },
        (res) => {
          assert.equal(res.statusCode, 200);
          let buffer = "",
            resolved = false;
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            buffer += chunk;
            let split;
            while ((split = buffer.indexOf("\n\n")) !== -1) {
              const part = buffer.slice(0, split);
              buffer = buffer.slice(split + 2);
              if (part.includes("event: ready") && !resolved) {
                resolved = true;
                resolve(req);
              }
              if (part.includes("event: update")) onUpdate?.();
            }
          });
        },
      );
      req.on("error", reject);
      streams.push(req);
    });
  }
  try {
    teacher = success(
      await request(
        "POST",
        "/api/auth/setup",
        { password: "synthetic-local-test-password" },
        "",
      ),
    ).cookie;
    for (const count of [500, 1000, 3000]) {
      const room = success(
        await request("POST", "/api/teacher/classrooms", {
          title: `并发测试 ${count} 端`,
          subject: "测试",
        }),
      ).data;
      const tasks = [];
      for (let n = 0; n < 3; n++)
        tasks.push(
          success(
            await request(
              "POST",
              `/api/teacher/classrooms/${room.id}/activities`,
              {
                type: n === 2 ? "text" : "single",
                title: `任务 ${n + 1}：选择第二项`,
                options: ["第一项", "第二项"],
                correct: ["1"],
              },
            ),
          ).data,
        );
      const groupId = tasks[0].group_id;
      assert.ok(tasks.every((a) => a.group_id === groupId));
      const config = success(
        await request("GET", `/api/teacher/classrooms/${room.id}`),
      ).data.collection;
      config.fields = config.fields.map((f) => ({
        ...f,
        enabled: true,
        required: true,
      }));
      config.display.studentStats = true;
      success(
        await request(
          "PUT",
          `/api/teacher/classrooms/${room.id}/collection`,
          config,
        ),
      );
      const startJoin = performance.now();
      const joined = await pool(
        Array.from({ length: count }, (_, i) => i),
        async (i) =>
          success(
            await request(
              "POST",
              "/api/join",
              {
                code: room.code,
                profile: {
                  nickname: `测试端 ${i}`,
                  name: `测试姓名 ${i}`,
                  studentNo: `T-${String(i).padStart(6, "0")}`,
                  city: `测试城市 ${i % 3}`,
                  school: `测试学校 ${i % 12}`,
                  className: `测试班 ${i % 24}`,
                },
              },
              "",
            ),
          ),
      );
      const joinMs = performance.now() - startJoin;
      let publication = 0;
      const publishTimes = [],
        snapshotTimes = [];
      let snapshotErrors = 0;
      await pool(
        joined,
        async (person) =>
          connect(person.cookie, () => {
            if (!publication) return;
            publishTimes.push(performance.now() - publication);
            request("GET", "/api/student/state", undefined, person.cookie)
              .then((r) => {
                if (r.status !== 200) snapshotErrors++;
                snapshotTimes.push(performance.now() - publication);
              })
              .catch(() => {
                snapshotErrors++;
                snapshotTimes.push(performance.now() - publication);
              });
          }),
        100,
      );
      publication = performance.now();
      success(
        await request("POST", `/api/teacher/groups/${groupId}/control`, {
          action: "publish",
        }),
      );
      await until(() => snapshotTimes.length >= count);
      assert.equal(snapshotErrors, 0);
      publication = 0;
      const startSubmit = performance.now();
      const submissions = (
        await Promise.all(
          joined.map(async (person, index) => {
            const sent = [];
            for (let step = 0; step < tasks.length; step++) {
              const task = tasks[(index + step) % tasks.length];
              sent.push(
                await request(
                  "POST",
                  `/api/student/activities/${task.id}/answer`,
                  task.type === "text"
                    ? {
                        text: `测试姓名 ${index} T-${String(index).padStart(6, "0")} 光合作用需要阳光和水分。记录观察，寻找证据。`,
                      }
                    : { choices: ["1"] },
                  person.cookie,
                ),
              );
            }
            return sent;
          }),
        )
      ).flat();
      const submitMs = performance.now() - startSubmit;
      const state = success(
        await request("GET", `/api/teacher/classrooms/${room.id}`),
      ).data;
      for (const task of state.activities) {
        assert.equal(task.stats.submitted, count);
        if (task.type !== "text") assert.equal(task.stats.correctRate, 100);
      }
      assert.equal(state.groups[0].progress.completed, count);
      assert.equal(state.groups[0].progress.submitted, count * 3);
      assert.ok(submissions.every((r) => r.status === 200));
      success(
        await request(
          "POST",
          `/api/teacher/activities/${tasks[2].id}/control`,
          { action: "reveal" },
        ),
      );
      const dashboardStarted = performance.now();
      const dashboardReads = await Promise.all(
        joined.map((person) =>
          request(
            "GET",
            `/api/student/dashboard?activityId=${tasks[2].id}`,
            undefined,
            person.cookie,
          ),
        ),
      );
      assert.ok(
        dashboardReads.every(
          (r) =>
            r.status === 200 &&
            r.data.overview.participants === count &&
            r.data.selected.wordCloud?.sampleSize === 300,
        ),
      );
      assert.ok(
        dashboardReads.every(
          (r) => !JSON.stringify(r.data).includes("测试姓名"),
        ),
      );
      const dashboardAllMs = performance.now() - dashboardStarted;
      const m = await metrics();
      const result = {
        participants: count,
        sseConnections: count,
        tasksPerGroup: 3,
        collectedFields: 6,
        dashboardReadAllMs: Math.round(dashboardAllMs),
        dashboardReadP95Ms: p95(dashboardReads.map((r) => r.ms)),
        wordCloudSampleSize:
          dashboardReads[0].data.selected.wordCloud.sampleSize,
        dashboardFailures: 0,
        groupCompleted: state.groups[0].progress.completed,
        joinAllMs: Math.round(joinMs),
        joinP95Ms: p95(joined.map((r) => r.ms)),
        publishEventP95Ms: p95(publishTimes),
        publishedPageReadyP95Ms: p95(snapshotTimes),
        submitAllMs: Math.round(submitMs),
        submitP95Ms: p95(submissions.map((r) => r.ms)),
        successful: submissions.length,
        failed: 0,
        storedAnswers: state.groups[0].progress.submitted,
        serverRssMiB: Math.round(m.rss / 1024 ** 2),
        serverPeakRssMiB: Math.round(m.peakRss / 1024 ** 2),
      };
      report.scenarios.push(result);
      console.log(JSON.stringify({ stage: "classroom", ...result }));
      if (count === 3000) {
        const start = performance.now(),
          checks = [];
        for (let round = 0; round < 6; round++) {
          const heartbeats = await pool(
            joined,
            (p) => request("POST", "/api/student/heartbeat", {}, p.cookie),
            100,
          );
          assert.ok(heartbeats.every((r) => r.status === 200));
          const dashboards = await pool(
            joined,
            (p) =>
              request(
                "GET",
                `/api/student/dashboard?activityId=${tasks[2].id}`,
                undefined,
                p.cookie,
              ),
            100,
          );
          assert.ok(
            dashboards.every(
              (r) => r.status === 200 && r.data.overview.answers === count * 3,
            ),
          );
          checks.push(await metrics());
          await wait(5000);
        }
        report.soak = {
          durationSeconds: Math.round((performance.now() - start) / 1000),
          connections: count,
          heartbeatRequests: count * 6,
          dashboardRequests: count * 6,
          failed: 0,
          rssMiBSamples: checks.map((m) => Math.round(m.rss / 1024 ** 2)),
        };
        console.log(JSON.stringify({ stage: "soak", ...report.soak }));
      }
      for (const stream of streams.splice(0)) stream.destroy();
      success(
        await request("POST", `/api/teacher/classrooms/${room.id}/end`, {}),
      );
      await wait(400);
    }
    const room = success(
      await request("POST", "/api/teacher/classrooms", {
        title: "模型排队测试",
        subject: "测试",
      }),
    ).data;
    success(
      await request("PUT", "/api/teacher/model", {
        baseUrl: "https://mock.invalid/v1",
        model: "synthetic",
        enabled: true,
        concurrency: 4,
        maxQueue: 40,
        maxTokens: 200,
      }),
    );
    const a = success(
      await request("POST", `/api/teacher/classrooms/${room.id}/activities`, {
        type: "ai",
        title: "探究任务",
        prompt: "测试任务",
        aiLimit: 1,
      }),
    ).data;
    const students = await pool(
      Array.from({ length: 100 }, (_, i) => i),
      async (i) =>
        success(
          await request(
            "POST",
            "/api/join",
            { code: room.code, nickname: `测试端 ${i}` },
            "",
          ),
        ),
    );
    success(
      await request("POST", `/api/teacher/activities/${a.id}/control`, {
        action: "publish",
      }),
    );
    const jobs = await Promise.all(
      students.map((s, i) =>
        request(
          "POST",
          `/api/student/activities/${a.id}/ai`,
          { question: "测试问题", requestId: `test-${i}` },
          s.cookie,
        ),
      ),
    );
    const accepted = jobs.filter((j) => j.status === 200).length;
    assert.ok(jobs.every((j) => [200, 429].includes(j.status)));
    assert.ok(accepted <= 44);
    await wait(2500);
    const states = await pool(students, (s) =>
      request("GET", "/api/student/state", undefined, s.cookie),
    );
    const completed = states.reduce(
      (n, r) =>
        n + r.data.activity.jobs.filter((j) => j.status === "completed").length,
      0,
    );
    const m = await metrics();
    assert.equal(m.modelPeak, 4);
    assert.equal(completed, accepted);
    report.ai = {
      kind: "纯模拟服务，每条模拟延迟 120ms，不代表真实模型吞吐",
      simultaneousRequests: 100,
      globalConcurrency: 4,
      maxQueue: 40,
      accepted,
      rejectedWith429: 100 - accepted,
      completed,
      observedUpstreamConcurrency: m.modelPeak,
    };
    report.server = {
      peakRssMiB: Math.round(m.peakRss / 1024 ** 2),
      eventLoopP95Ms: Math.round(m.eventLoopP95Ms * 10) / 10,
    };
    console.log(JSON.stringify({ stage: "ai", ...report.ai }));
    await mkdir("output", { recursive: true });
    await writeFile(
      "output/capacity-results.json",
      JSON.stringify(report, null, 2),
    );
    console.log("已写入 output/capacity-results.json");
  } finally {
    for (const s of streams) s.destroy();
    agent.destroy();
    child.send({ event: "stop" });
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
}
