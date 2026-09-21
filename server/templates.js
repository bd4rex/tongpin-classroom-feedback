import { aiEverywhereLesson } from "./lessons/ai-everywhere.js";

export const TYPES = {
  single: "单选题",
  multiple: "多选题",
  boolean: "判断题",
  poll: "投票",
  understanding: "理解度",
  text: "开放回答",
  fill: "填空题",
  exit: "离堂反馈",
  ai: "AI 问答",
};
const checkin = {
  type: "understanding",
  title: "到这里，你的理解程度如何？",
  options: ["已经理解，可以应用", "基本理解，还有疑问", "需要老师再讲一讲"],
};
const exit = {
  type: "exit",
  title: "带着收获离开课堂",
  description: "回顾这节课，也留下你还想继续探究的问题。",
};
export const templates = [
  aiEverywhereLesson,
  {
    id: "general",
    subject: "通用",
    title: "一节课的反馈闭环",
    description: "课前摸底 → 课中反馈 → 开放表达 → 离堂反思",
    activities: [
      {
        type: "poll",
        title: "对于今天的主题，你已经了解多少？",
        options: ["第一次接触", "听说过一些", "能够简单解释", "已经可以应用"],
      },
      checkin,
      { type: "text", title: "用自己的话，解释今天最重要的一个概念。" },
      exit,
    ],
  },
  {
    id: "math",
    subject: "数学",
    title: "分数的意义",
    description: "概念辨析、即时诊断与表达，让思考过程可见。",
    activities: [
      {
        type: "single",
        title: "把一个圆平均分成 4 份，其中的 3 份可以用哪个分数表示？",
        options: ["1/4", "3/4", "4/3", "3/3"],
        correct: ["1"],
      },
      {
        type: "boolean",
        title: "把一块蛋糕分成 4 块，每块一定是这块蛋糕的 1/4。",
        options: ["正确", "错误"],
        correct: ["1"],
      },
      checkin,
      { type: "text", title: "请举一个生活中的例子，说明 3/4 表示什么。" },
      exit,
    ],
  },
  {
    id: "chinese",
    subject: "语文",
    title: "从文字中读懂人物",
    description: "自主阅读、依据表达与阅读策略反思。",
    activities: [
      {
        type: "poll",
        title: "阅读时，你最先从哪个角度了解人物？",
        options: ["语言描写", "动作描写", "心理描写", "人物所处的环境"],
      },
      {
        type: "text",
        title: "选择一句最能表现人物特点的文字，说说你的理由。",
        description: "先引用文中的依据，再解释你的理解。",
      },
      checkin,
      exit,
    ],
  },
  {
    id: "english",
    subject: "英语",
    title: "表达我的日常生活",
    description: "语言运用、短句表达与自我评价。",
    activities: [
      {
        type: "single",
        title: "She ___ to school by bus every day.",
        options: ["go", "goes", "going", "went"],
        correct: ["1"],
      },
      {
        type: "text",
        title: "Write two sentences about your daily routine.",
        description: "用两句话描述你的日常生活。",
      },
      checkin,
      exit,
    ],
  },
  {
    id: "science",
    subject: "科学",
    title: "让观察成为证据",
    description: "提出猜想、设计对照与解释实验结果。",
    activities: [
      {
        type: "multiple",
        title: "探究光照对植物生长的影响时，应尽量保持哪些条件相同？",
        options: ["植物的品种", "浇水量", "光照时间", "土壤条件"],
        correct: ["0", "1", "3"],
      },
      {
        type: "text",
        title: "怎样设计一个实验，检验你的猜想？",
        description: "说清楚改变什么、保持什么、观察什么。",
      },
      checkin,
      exit,
    ],
  },
  {
    id: "ai",
    subject: "人工智能",
    title: "观察与评价 AI 的回答",
    description: "结合外部 AI 演示，收集判断、依据与反思。",
    activities: [
      {
        type: "boolean",
        title: "AI 给出的回答看起来很完整，就一定是正确的。",
        options: ["正确", "错误"],
        correct: ["1"],
      },
      {
        type: "text",
        title: "观察老师展示的 AI 回答：哪一点需要进一步核实？为什么？",
      },
      {
        type: "ai",
        title: "让 AI 把一个概念解释得更清楚",
        description:
          "选择本课的一个概念，向 AI 提问。你可以改变表达方式再次尝试，最后评价回答。",
        prompt:
          "帮助学生理解他们提出的概念。面向中小学生，先给出简洁解释，再提供一个生活中的例子。不要代写作业；遇到不确定的信息应明确说明。",
        aiLimit: 3,
        duration: 300,
      },
      {
        type: "poll",
        title: "修改提问方式后，回答发生了怎样的变化？",
        options: ["更符合需求", "略有改善", "差不多", "更不符合需求"],
      },
      exit,
    ],
  },
];
