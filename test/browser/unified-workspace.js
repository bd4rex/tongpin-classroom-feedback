// Run with playwright-cli run-code --filename against an isolated QA server.
// prettier-ignore
async (page) => {
  const base = "http://127.0.0.1:3211";
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const request = async (method, path, data, context = page.request) => {
    const r = await context.fetch(base + path, {
      method,
      ...(data === undefined ? {} : { data }),
    });
    if (!r.ok()) throw new Error(`${path}: ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const auth = await request("GET", "/api/auth/status");
  if (!auth.initialized)
    await request("POST", "/api/auth/setup", {
      password: "isolated-unified-test-only",
    });
  else if (!auth.authenticated)
    await request("POST", "/api/auth/login", {
      password: "isolated-unified-test-only",
    });
  for (const r of await request("GET", "/api/teacher/classrooms"))
    if (r.status !== "ended")
      await request("POST", `/api/teacher/classrooms/${r.id}/end`, {});
  const room = await request("POST", "/api/teacher/classrooms", {
    title: "统一工作台 · 科学课演示",
    subject: "科学",
    grade: "七年级",
  });
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page.goto(base + "/?workspace=unified");
  await page.getByText("统一课堂工作台", { exact: true }).waitFor();
  if (await page.getByRole("tab", { name: "课前配置" }).count())
    throw new Error("Unexpected mode switching in unified workspace");
  await page
    .getByRole("button", { name: "快速备课", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "课中检查 理解度 + 一句解释" })
    .click();
  await page.getByRole("button", { name: "保存 2 项为草稿" }).waitFor();
  const beforePreview = await request(
    "GET",
    `/api/teacher/classrooms/${room.id}`,
  );
  if (beforePreview.activities.length)
    throw new Error("Preview created activities");
  await page.getByRole("button", { name: "保存 2 项为草稿" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByLabel("题目／任务", { exact: true })
    .fill("这个现象，你理解到哪一步？");
  if (await page.getByRole("dialog").count())
    throw new Error("Editor should be inline");
  await page.getByRole("button", { name: "保存活动", exact: true }).click();
  await page
    .getByRole("heading", { name: "这个现象，你理解到哪一步？", exact: true })
    .last()
    .waitFor();
  await page
    .getByRole("button", { name: "快速备课", exact: true })
    .first()
    .click();
  await page
    .getByText("已有课程材料？用 AI 整理后批量导入", { exact: true })
    .click();
  await page.getByLabel("任务包 JSON").fill("{broken");
  await page.getByRole("button", { name: "校验并预览" }).click();
  await page.getByRole("alert").waitFor();
  const pack = {
    schemaVersion: 1,
    group: { title: "观察与解释", duration: 0 },
    activities: [
      {
        type: "single",
        title: "哪组实验可以比较温度对蒸发的影响？",
        description: "两杯等量的水，容器相同。请选择合理的实验安排。",
        options: ["只改变温度", "同时改变水量和温度"],
        correct: ["0"],
      },
      {
        type: "text",
        title: "请描述你观察到的证据。",
        description: "记录看到的现象，并用一句话解释依据。",
      },
    ],
  };
  await page
    .getByLabel("任务包 JSON")
    .fill("```json\n" + JSON.stringify(pack) + "\n```");
  await page.getByRole("button", { name: "校验并预览" }).click();
  await page.getByRole("region", { name: "备课包预览" }).waitFor();
  await page.screenshot({
    path: "output/playwright/unified-preparation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "保存 2 项为草稿" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const prepared = await request("GET", `/api/teacher/classrooms/${room.id}`);
  if (
    prepared.activities.length !== 4 ||
    prepared.activities.some((a) => a.status !== "draft")
  )
    throw new Error("Imported tasks must remain drafts");
  const packDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "保存为备课包" }).click();
  await (await packDownload).saveAs("output/playwright/roundtrip-pack.json");
  await page
    .getByRole("button", { name: "快速备课", exact: true })
    .first()
    .click();
  await page
    .getByLabel("打开已保存的备课包", { exact: true })
    .setInputFiles("output/playwright/roundtrip-pack.json");
  await page.getByRole("region", { name: "备课包预览" }).waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "学生视角预览" }).click();
  const previewText = await page.getByRole("dialog").innerText();
  if (previewText.includes("参考答案"))
    throw new Error("Student preview leaked correct-answer hints");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "发布整组", exact: true }).click();
  await page.getByRole("button", { name: "暂停整组" }).waitFor();
  await page.getByRole("button", { name: "切回原界面" }).click();
  await page.getByRole("tab", { name: "课前配置" }).waitFor();
  await page.reload();
  await page.getByRole("tab", { name: "课前配置" }).waitFor();
  await page.getByRole("button", { name: "使用统一工作台" }).click();
  await page.getByRole("button", { name: "暂停整组" }).waitFor();
  const browser = page.context().browser();
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const student = await studentContext.newPage();
  student.on("pageerror", (error) => failures.push(error.message));
  try {
    await student.goto(`${base}/join?code=${room.code}`);
    await student.getByLabel("姓名或昵称", { exact: true }).fill("测试同学");
    await student.getByLabel("城市", { exact: true }).selectOption("南京市");
    await student.getByLabel("学校", { exact: true }).fill("演示学校");
    await student.getByLabel("年级／班级", { exact: true }).fill("七年级1班");
    await student
      .getByRole("button", { name: "加入课堂", exact: true })
      .click();
    await student
      .getByRole("heading", { name: pack.activities[0].title })
      .waitFor();
    if ((await student.locator("body").innerText()).includes("参考答案"))
      throw new Error("Correct answer revealed prematurely");
    const evidenceTitle = pack.activities[1].title;
    await student
      .getByRole("button", { name: new RegExp(evidenceTitle) })
      .click();
    await student
      .getByLabel("你的回答")
      .fill("我观察到温度较高时水蒸发得更快。");
    await student
      .getByRole("button", { name: new RegExp(pack.activities[0].title) })
      .click();
    await student
      .getByRole("button", { name: new RegExp(evidenceTitle) })
      .click();
    if (
      (await student.getByLabel("你的回答").inputValue()) !==
      "我观察到温度较高时水蒸发得更快。"
    )
      throw new Error("Draft lost during task switch");
    const reviewGroup = prepared.groups.find((g) => g.title === "课中检查");
    await request("POST", `/api/teacher/groups/${reviewGroup.id}/control`, {
      action: "publish",
    });
    await student
      .getByRole("button", { name: /这个现象，你理解到哪一步/ })
      .waitFor();
    if (
      (await student.getByLabel("你的回答").inputValue()) !==
      "我观察到温度较高时水蒸发得更快。"
    )
      throw new Error("New group interrupted current answer");
    await student.reload();
    await student
      .getByRole("button", { name: new RegExp(evidenceTitle) })
      .click();
    if (
      (await student.getByLabel("你的回答").inputValue()) !==
      "我观察到温度较高时水蒸发得更快。"
    )
      throw new Error("Draft lost after reload");
    await student
      .getByRole("button", { name: "提交反馈", exact: true })
      .click();
    await student.getByText("已收到你的反馈", { exact: true }).waitFor();
    await student.screenshot({
      path: "output/playwright/unified-student-mobile.png",
      fullPage: true,
    });
    await student.getByRole("button", { name: "继续下一项" }).click();
    await student
      .getByRole("heading", { name: "这个现象，你理解到哪一步？" })
      .waitFor();
    await student.getByRole("button", { name: /已经理解，可以应用/ }).click();
    await student
      .getByRole("button", { name: "提交反馈", exact: true })
      .click();
    await student.getByText("已收到你的反馈", { exact: true }).waitFor();
    const studentState = await request(
      "GET",
      "/api/student/state",
      undefined,
      student.request,
    );
    if (studentState.participant.displayName !== "测试同学")
      throw new Error("Identity not restored");
    await page
      .getByRole("button", { name: new RegExp(evidenceTitle + ".*份反馈") })
      .click();
    await page
      .getByText("我观察到温度较高时水蒸发得更快。", { exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "数据统计", exact: true }).click();
    const evidence = prepared.activities.find((a) => a.title === evidenceTitle);
    await page.waitForFunction(
      (id) => document.querySelector('[aria-label="统计任务"]')?.value === id,
      evidence.id,
    );
    await page.getByRole("tab", { name: "活动反馈", exact: true }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "导出本题反馈" }).click();
    if (!(await download).suggestedFilename().includes(evidence.id))
      throw new Error("Wrong export scope");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "output/playwright/unified-teacher-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/playwright/unified-teacher-mobile.png",
      fullPage: true,
    });
    for (const target of [student, page]) {
      const overflow = await target.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      if (overflow) throw new Error("Horizontal overflow on mobile");
    }
    const final = await request("GET", `/api/teacher/classrooms/${room.id}`);
    if (
      final.room.total !== 1 ||
      final.activities.reduce((n, a) => n + a.stats.submitted, 0) !== 2
    )
      throw new Error("Identity or submission duplicated");
    if (failures.length) throw new Error(failures.join("\n"));
    return {
      passed: true,
      activities: final.activities.length,
      participants: final.room.total,
      answers: 2,
      preview: true,
      inlineEditing: true,
      templateAndImport: true,
      portableFilePreview: true,
      draftPersistence: true,
      newGroupNonInterrupting: true,
      rollbackUI: true,
      perTaskExport: true,
      statisticsFollowSelection: true,
      mobileNoOverflow: true,
      pageErrors: failures,
    };
  } finally {
    await studentContext.close();
    await page.setViewportSize({ width: 1440, height: 1040 });
  }
}
