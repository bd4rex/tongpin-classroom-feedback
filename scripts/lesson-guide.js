import { mkdirSync, writeFileSync } from "node:fs";
import { aiEverywhereLesson as lesson } from "../server/lessons/ai-everywhere.js";

const typeNames = {
  single: "选择（单选）",
  multiple: "选择（多选）",
  fill: "填空",
  ai: "AI 问答",
};
const lines = [
  "# 无处不在的人工智能 40 分钟课程",
  "",
  "[English](ai-everywhere.en.md)",
  "",
  "本课面向七年级，依据用户提供的 52 页 PPT 和 40 分钟逐字稿改编。课程已内置在同频 0.4.0，可直接创建课堂并按教学环节下发。全课 12 项互动：6 项选择（5 单选、1 多选）、4 项填空、2 项 AI 问答。",
  "",
  "## 使用方法",
  "",
  "1. 运行项目，教师登录后点击“新建课堂”，在“预置活动”中选择“人工智能 · 无处不在的人工智能”。首页也有对应模板卡片。已有未结束课堂时先完成当前课堂，再创建新课。",
  "2. 创建后自动生成六个草稿任务组。打开题目下的“教师讲解提示”，核对讲述建议、时间、参考解析和 PPT 页码。",
  "3. 在“AI 设置”中配置并测试模型。普通选择与填空不调用 AI；两项 AI 问答各允许每端最多两次独立提问。追问时需要补全前文情境。",
  "4. 分享课堂码，按下面的教学进度点击“发布整组”。分钟数是讲解与互动的建议用时，默认不启动倒计时。发布下一组不会关闭上一组或打断学生正在填写的内容。",
  "5. 先查看反馈，再决定是否“展示本题结果”。填空参考答案只在教师公布后发给学生，教师讲解提示始终只在教师端。填空由老师结合题意讲评，不自动按完全相同的字符串判分。",
  "6. 课后可导出全课记录或本题 CSV，也可保存任务组为备课包。选择“再上一节”会复制题组、填空和讲解提示，不复制学生与历史回答。",
  "",
  "```bash",
  "npm ci",
  "npm run build",
  "npm start",
  "```",
  "",
  "教师入口：`http://127.0.0.1:3210`。课程源文件位于 `server/lessons/ai-everywhere.js`，随源码和 Docker 的 `server/` 目录一起打包，无需原 PPT、Word、数据库种子或额外导入。",
  "",
  "## 学习目标",
  "",
  ...lesson.objectives.map((o) => `- ${o}`),
  "",
  "## 课堂进度",
  "",
  "| 时间 | 环节 | 互动 | PPT 页码 |",
  "| --- | --- | --- | --- |",
];
let elapsed = 0;
for (const group of lesson.groups) {
  lines.push(
    `| ${elapsed}–${elapsed + group.minutes} 分钟 | ${group.title} | ${group.activities.map((a) => typeNames[a.type]).join("、")} | ${group.pages} |`,
  );
  elapsed += group.minutes;
}
lines.push("", "## 教学内容与任务", "");
let taskNumber = 0;
for (const group of lesson.groups) {
  lines.push(`### ${group.title}`, "");
  for (const activity of group.activities) {
    lines.push(
      `#### ${++taskNumber}. ${activity.title}`,
      "",
      `互动形式：${typeNames[activity.type]}。`,
      "",
      activity.description,
      "",
    );
    if (activity.options) {
      lines.push(
        ...activity.options.map(
          (o, i) => `${String.fromCharCode(65 + i)}. ${o}`,
        ),
        "",
      );
      lines.push(
        `教师参考答案：${activity.correct.map((n) => String.fromCharCode(65 + Number(n))).join("、")}。`,
        "",
      );
    }
    if (activity.blanks) {
      lines.push("| 填空提示 | 教师参考 |", "| --- | --- |");
      for (const b of activity.blanks)
        lines.push(`| ${b.label} | ${b.reference} |`);
      lines.push("");
    }
    if (activity.type === "ai")
      lines.push(
        `每端最多 ${activity.aiLimit} 次。AI 的回答需由学生阅读、评价，并提交自己的反思。`,
        "",
      );
    lines.push("教师讲解提示：", "", activity.teacherNotes, "");
  }
}
lines.push(
  "## 教学调整",
  "",
  "逐字稿的生活导入、机器狗追问、三要素类比、行业价值和“做 AI 的主人”用于教师提示。六个生活场景采用代表性讲解，国内应用融入语音和行业案例，为项目中的实际 AI 问答留出 8 分钟。",
  "",
  "课件里的画图创想改为文字 AI 问答；实物机器狗、视频、举手、拍照标注等不设为平台任务或完成前提。学生所需情境均写在题目说明中，教师仍可自行配合原课件讲解。",
  "",
  "对照材料时调整了几处容易产生误解的表述：自动运行不等于使用 AI；“看、听、说、想”和训练小狗是教学类比；AI 的重要回答仍需核实；更丰富的数据也不能保证永远正确。课件第 36 页重复的港口标签未沿用。机器人纪录、产品芯片数量、性能及排名等未核实数字不纳入考查。",
  "",
  "## 课前准备与备用安排",
  "",
  "建议课前用测试课堂走一遍两项 AI 问答，确认模型能回应七年级的任务。模型不可用时，选择和填空仍能提交；两项 AI 任务可暂由教师口头提供可能解释或追问，让学生在原评价框内写下自己的判断。这样的回答不应称为真实 AI 输出。",
  "",
  "本课分钟数是教学安排，不代表已完成真实 40 分钟课堂或学校网络容量验证。验证范围见 [TEST_REPORT.md](../../TEST_REPORT.md)。",
  "",
  "## 内容来源与维护",
  "",
  `- PPT：${lesson.source.file}；${lesson.source.author}；${lesson.source.slides} 页。`,
  `- PPT SHA-256：\`${lesson.source.sha256}\`。`,
  `- 逐字稿：${lesson.source.script.file}。`,
  `- 逐字稿 SHA-256：\`${lesson.source.script.sha256}\`。`,
  "- 两份原文件仅作为内容来源读取，未修改，未复制进项目发布包。",
  "- 教学实现：[`server/lessons/ai-everywhere.js`](../../server/lessons/ai-everywhere.js)。修改后运行 `npm run lesson:guide` 更新本中文说明，并同步英文说明。",
  "- 填空及教师提示的数据约定见 [表单扩展接口](../form-integration.md)。含填空任务的课堂或备课包需使用 0.4.0 或更高版本，不能将“切回原界面”与运行旧代码混为一谈。",
  "",
);
mkdirSync(new URL("../docs/lessons/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../docs/lessons/ai-everywhere.md", import.meta.url),
  lines.join("\n"),
);
console.log("已更新 docs/lessons/ai-everywhere.md");
