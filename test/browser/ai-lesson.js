// Run via Playwright CLI against scripts/qa-server.js with a fresh, isolated data directory.
// This script creates test classrooms and uses only the local mock model on port 3212.
// prettier-ignore
async (page) => {
  const base = "http://127.0.0.1:3211";
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const request = async (method, path, data, context = page.request) => {
    const r = await context.fetch(base + path, { method, ...(data === undefined ? {} : { data }) });
    if (!r.ok()) throw new Error(`${path}: ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const auth = await request("GET", "/api/auth/status");
  if (!auth.initialized) await request("POST", "/api/auth/setup", { password: "isolated-lesson-test-only" });
  else if (!auth.authenticated) await request("POST", "/api/auth/login", { password: "isolated-lesson-test-only" });
  for (const room of await request("GET", "/api/teacher/classrooms"))
    if (room.status !== "ended") await request("POST", `/api/teacher/classrooms/${room.id}/end`, {});
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(base + "/?workspace=unified");
  await page.getByRole("button", { name: "新建课堂", exact: true }).first().click();
  await page.getByRole("combobox", { name: "预置活动", exact: true }).selectOption("ai-everywhere");
  await page.getByRole("region", { name: "整课安排" }).waitFor();
  assert(await page.getByLabel("年级／对象").inputValue() === "七年级", "Grade not supplied");
  await page.screenshot({ path: "output/playwright/ai-lesson-create.png", fullPage: true });
  await page.getByRole("button", { name: "创建课堂", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const room = (await request("GET", "/api/teacher/classrooms")).find((r) => r.status !== "ended");
  let state = await request("GET", `/api/teacher/classrooms/${room.id}`);
  assert(state.groups.length === 6 && state.activities.length === 12, "Incomplete built-in lesson");
  await page.getByText("教师讲解提示（仅教师可见）", { exact: true }).click();
  await page.getByText(/开场建议/).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/playwright/ai-lesson-teacher.png", fullPage: true });
  await page.getByRole("button", { name: "发布整组", exact: true }).click();
  await page.getByRole("button", { name: "暂停整组", exact: true }).waitFor();
  const studentContext = await page.context().browser().newContext({ viewport: { width: 390, height: 844 } });
  const student = await studentContext.newPage();
  student.on("pageerror", (error) => errors.push(error.message));
  try {
    await student.goto(`${base}/join?code=${room.code}`);
    await student.getByLabel("姓名或昵称", { exact: true }).fill("课程测试同学");
    await student.getByLabel("城市", { exact: true }).selectOption("南京市");
    await student.getByLabel("学校", { exact: true }).fill("测试学校");
    await student.getByLabel("年级／班级", { exact: true }).fill("七年级1班");
    await student.getByRole("button", { name: "加入课堂", exact: true }).click();
    await student.getByRole("heading", { name: state.activities[0].title, exact: true }).waitFor();
    const firstFill = state.activities.find((a) => a.type === "fill");
    const chooseTask = (p, title) => p.getByRole("button", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await chooseTask(student, firstFill.title);
    const firstBlank = student.getByLabel("1. 我见过的 AI 应用", { exact: true });
    await firstBlank.fill("语音助手");
    await student.getByLabel("2. 它帮助人完成的事情", { exact: true }).fill("把声音变成文字");
    await chooseTask(student, state.activities[0].title);
    await chooseTask(student, firstFill.title);
    assert(await firstBlank.inputValue() === "语音助手", "Fill draft lost on switch");
    await student.reload();
    await chooseTask(student, firstFill.title);
    assert(await firstBlank.inputValue() === "语音助手", "Fill draft lost on reload");
    await request("POST", `/api/teacher/groups/${state.groups[1].id}/control`, { action: "publish" });
    await student.getByRole("button", { name: /怎样理解人工智能更恰当/ }).waitFor();
    assert(await firstBlank.inputValue() === "语音助手", "Next group interrupted answer");
    assert(!(await student.locator("body").innerText()).includes("开场建议"), "Teacher notes exposed");
    assert(!(await student.locator("body").innerText()).includes("填空参考答案"), "Fill references exposed before reveal");
    await student.screenshot({ path: "output/playwright/ai-lesson-fill-mobile.png", fullPage: true });
    await student.getByRole("button", { name: "提交反馈", exact: true }).click();
    await student.getByText("已收到你的反馈", { exact: true }).waitFor();
    await student.getByRole("button", { name: "继续下一项", exact: true }).click();
    await student.getByRole("heading", { name: state.activities[0].title, exact: true }).waitFor();
    await student.getByRole("button", { name: /根据照片判断植物种类的识花工具/ }).click();
    await student.getByRole("button", { name: "提交反馈", exact: true }).click();
    await student.getByText("已收到你的反馈", { exact: true }).waitFor();
    await student.getByRole("button", { name: "继续下一项", exact: true }).click();
    await student.getByRole("heading", { name: "怎样理解人工智能更恰当？", exact: true }).waitFor();

    const concept = state.activities.find((a) => a.title.startsWith("机器狗认人"));
    await chooseTask(page, concept.title);
    await page.getByRole("button", { name: "学生视角预览", exact: true }).click();
    assert(await page.getByRole("dialog").getByRole("textbox").count() === 3, "Fill preview missing inputs");
    assert(!(await page.getByRole("dialog").innerText()).includes("参考答案"), "Preview leaked references");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("第 1 空参考答案").fill("数据（教学参考）");
    await page.getByLabel("教师讲解提示", { exact: false }).fill(concept.teacherNotes + "\n浏览器讲解提示检查。");
    await page.getByRole("button", { name: "保存活动", exact: true }).click();
    await page.getByRole("heading", { name: concept.title, exact: true }).last().waitFor();
    await page.getByRole("button", { name: "切回原界面", exact: true }).click();
    await page.getByRole("tab", { name: /^课前配置/ }).click();
    assert(await page.locator(".resource-preview-card .fill-blanks input").count() === 3, "Classic preview missing blanks");
    await page.getByRole("button", { name: "使用统一工作台", exact: true }).click();
    await request("POST", `/api/teacher/activities/${firstFill.id}/control`, { action: "reveal" });
    await chooseTask(student, firstFill.title);
    await student.getByText("填空参考答案", { exact: true }).waitFor();

    await request("PUT", "/api/teacher/model", { baseUrl: "http://127.0.0.1:3212/v1", model: "lesson-mock", apiKey: "", enabled: true, concurrency: 2, maxQueue: 8, maxTokens: 300 });
    const aiTasks = state.activities.filter((a) => a.type === "ai");
    await request("POST", `/api/teacher/groups/${aiTasks[0].group_id}/control`, { action: "publish" });
    for (const task of aiTasks) {
      await chooseTask(student, task.title);
      await student.getByLabel("向 AI 提问", { exact: true }).fill("请从数据的角度解释这个课堂情境，并给出需要核实的一点。");
      await student.getByRole("button", { name: "向 AI 提问", exact: true }).click();
      await student.getByText(/【联调模拟回答】/).waitFor();
      await student.getByLabel("你的评价或反思").fill("这是模拟输出，我会核实回答是否切合当前情境。");
      await student.getByRole("button", { name: "提交反馈", exact: true }).click();
      await student.getByText("已收到你的反馈", { exact: true }).waitFor();
    }
    for (const p of [page, student]) {
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Horizontal overflow");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Teacher mobile overflow");
    state = await request("GET", `/api/teacher/classrooms/${room.id}`);
    assert(state.activities.find((a) => a.id === concept.id).blanks[0].reference === "数据（教学参考）", "Fill edit not saved");
    assert(state.activities.find((a) => a.id === concept.id).teacherNotes.includes("浏览器讲解提示检查"), "Teacher notes not saved");
    assert(state.activities.find((a) => a.id === firstFill.id).stats.submitted === 1, "Fill response count wrong");
    assert(aiTasks.every((a) => state.activities.find((t) => t.id === a.id).stats.submitted === 1), "AI reflection missing");
    assert(errors.length === 0, errors.join("; "));
    await page.setViewportSize({ width: 1440, height: 1040 });
    return { ok: true, groups: state.groups.length, activities: state.activities.length, fillDraftRecovered: true, teacherReferenceHiddenUntilReveal: true, aiTasksCompletedWithMock: aiTasks.length, errors, viewports: ["1440x1040", "390x844"] };
  } finally {
    await studentContext.close();
  }
}
