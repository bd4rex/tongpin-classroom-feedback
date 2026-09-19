// Run through playwright-cli run-code --filename against a fresh QA server.
// prettier-ignore
async (page) => {
  const base = "http://127.0.0.1:3211";
  const request = async (method, path, data) => {
    const response = await page.request.fetch(base + path, {
      method,
      ...(data !== undefined ? { data } : {}),
    });
    if (!response.ok())
      throw new Error(`${path}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  await request("POST", "/api/auth/setup", {
    password: "isolated-browser-test-only",
  });
  const room = await request("POST", "/api/teacher/classrooms", {
    title: "实时通知回归课堂",
  });
  const state = await request("GET", `/api/teacher/classrooms/${room.id}`);
  await request("PUT", `/api/teacher/classrooms/${room.id}/collection`, {
    ...state.collection,
    fields: state.collection.fields.map((f) => ({
      ...f,
      enabled: false,
      required: false,
    })),
  });
  const first = await request(
    "POST",
    `/api/teacher/classrooms/${room.id}/activities`,
    { type: "text", title: "已发布的第一项任务" },
  );
  await request("POST", `/api/teacher/activities/${first.id}/control`, {
    action: "publish",
  });
  const second = await request(
    "POST",
    `/api/teacher/classrooms/${room.id}/activities`,
    { type: "text", title: "发布后应自动出现的新任务" },
  );
  await request("POST", "/api/join", { code: room.code, profile: {} });
  await page.addInitScript(() => {
    window.testEvents = { ready: 0, updates: 0 };
    const OriginalEventSource = window.EventSource;
    window.EventSource = class extends OriginalEventSource {
      constructor(...args) {
        super(...args);
        this.addEventListener("ready", () => window.testEvents.ready++);
        this.addEventListener("update", () => window.testEvents.updates++);
      }
    };
  });
  let requests = 0,
    markHeld,
    releaseHeld;
  const held = new Promise((resolve) => {
    markHeld = resolve;
  });
  const released = new Promise((resolve) => {
    releaseHeld = resolve;
  });
  await page.route("**/api/student/state**", async (route) => {
    const number = ++requests;
    const response = await route.fetch();
    if (number === 2) {
      markHeld();
      await released;
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto(`${base}/join?code=${room.code}`, {
      waitUntil: "domcontentloaded",
    });
    await held;
    const before = await page.evaluate(() => window.testEvents.updates);
    await request("POST", `/api/teacher/activities/${second.id}/control`, {
      action: "publish",
    });
    await page.waitForFunction(
      (previous) => window.testEvents.updates > previous,
      before,
    );
    releaseHeld();
    // No manual reload, disconnection or extra teacher notification is allowed.
    await page
      .getByRole("button", { name: new RegExp(second.title) })
      .waitFor({ timeout: 5000 });
    if (requests < 3)
      throw new Error(
        "Expected a follow-up state request after the delayed response",
      );
    const events = await page.evaluate(() => window.testEvents);
    await page.screenshot({
      path: "output/playwright/realtime-fixed.png",
      fullPage: true,
    });
    return {
      passed: true,
      stateRequests: requests,
      events,
      manualReloads: 0,
      roomCode: room.code,
    };
  } finally {
    releaseHeld();
    await page.unroute("**/api/student/state**");
  }
}
