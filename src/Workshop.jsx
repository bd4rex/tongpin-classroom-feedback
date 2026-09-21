import React, { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Layers,
  Plus,
  Radio,
  RotateCcw,
} from "lucide-react";
import { post } from "./api.js";
import { BlankInputs, BlankReferences } from "./FillBlanks.jsx";

export function initialWorkspace() {
  const requested = new URLSearchParams(location.search).get("workspace");
  if (["classic", "unified"].includes(requested)) return requested;
  try {
    return localStorage.getItem("tongpin-workspace") === "classic"
      ? "classic"
      : "unified";
  } catch {
    return "unified";
  }
}

export function WorkspaceBar({ classic, onChange, disabled = false }) {
  return (
    <div className="unified-workspace-bar" inert={disabled}>
      <div>
        <strong>
          <Layers size={18} />
          {classic ? "原版工作台" : "统一课堂工作台"}
        </strong>
        <span>
          {classic
            ? "课前配置与课堂控制分开显示"
            : "准备任务 → 开放采集 → 查看反馈，都在这里完成"}
        </span>
      </div>
      <button
        className="btn plain"
        onClick={() => onChange(classic ? "unified" : "classic")}
      >
        <RotateCcw size={15} />
        {classic ? "使用统一工作台" : "切回原界面"}
      </button>
    </div>
  );
}

export function TaskTools({
  activity,
  group,
  roomId,
  onPrepare,
  onPreview,
  readonly,
}) {
  return (
    <div className="task-tools">
      <span className="task-context">
        <BookOpen size={17} />
        {activity ? "当前任务" : "准备课堂任务"}
      </span>
      <div className="button-row">
        {!readonly && (
          <button className="btn secondary" onClick={onPrepare}>
            <Plus size={15} />
            快速备课
          </button>
        )}
        {activity && (
          <button className="btn plain" onClick={onPreview}>
            <Eye size={15} />
            学生视角预览
          </button>
        )}
        {group?.progress.taskCount > 0 && (
          <a
            className="btn plain"
            href={`/api/teacher/groups/${group.id}/pack`}
          >
            <Copy size={15} />
            保存为备课包
          </a>
        )}
        {activity && (
          <a
            className="btn plain"
            href={`/api/teacher/classrooms/${roomId}/export?format=csv&activityId=${encodeURIComponent(activity.id)}`}
          >
            <Download size={15} />
            导出本题反馈
          </a>
        )}
      </div>
    </div>
  );
}

const PACKS = [
  {
    title: "课前摸底",
    note: "1 个投票，了解起点",
    activities: [
      {
        type: "poll",
        title: "对今天的主题，你已经了解多少？",
        options: ["第一次接触", "听说过一些", "能够解释", "可以应用"],
      },
    ],
  },
  {
    title: "课中检查",
    note: "理解度 + 一句解释",
    activities: [
      { type: "understanding", title: "到这里，你的理解程度如何？" },
      {
        type: "text",
        title: "用自己的话解释刚学到的概念。",
        description: "用 1–2 句话或一个生活中的例子说明。",
      },
    ],
  },
  {
    title: "离堂反馈",
    note: "收获、疑问和难度",
    activities: [
      {
        type: "exit",
        title: "今天的收获与还没弄懂的问题",
        description: "留下一个收获，再告诉老师哪里需要帮助。",
      },
    ],
  },
];
const TYPES = {
  single: "单选",
  multiple: "多选",
  boolean: "判断",
  poll: "投票",
  understanding: "理解度",
  text: "开放回答",
  fill: "填空题",
  exit: "离堂反馈",
  ai: "AI 问答",
};
const example = {
  schemaVersion: 1,
  group: { title: "概念检查", duration: 0 },
  activities: [
    {
      type: "single",
      title: "将教学目标转成一个概念辨析问题",
      description: "给出完成任务所需的简短材料。",
      options: ["选项一", "选项二"],
      correct: ["0"],
    },
    { type: "text", title: "请用一句话解释你的理由。" },
  ],
};

export function PreparationAssistant({ room, onSaved, notify }) {
  const [raw, setRaw] = useState(""),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId, setRequestId] = useState(null),
    [topic, setTopic] = useState(room.title),
    [importOpen, setImportOpen] = useState(false);
  const prompt = `请根据我接下来提供的教材或课程材料，为“${topic}”（学科：${room.subject}；年级：${room.grade || "按材料判断"}）设计一个教学环节的课堂反馈任务。只生成 2–4 项，总作答时间约 3–5 分钟；材料放进 description，描述清楚要做什么。先检查理解，再请学生简短说明理由。不要把整份教材变成问卷，不收集姓名、学校等身份信息，也不要生成网页、脚本或数据接口。\n仅返回一个 JSON 对象，结构参考：\n${JSON.stringify(example, null, 2)}\n可选 type：single、multiple、boolean、poll、understanding、text、fill、exit。fill 为填空题，设置 blanks 数组，每项包含学生可见的 label 和教师参考答案 reference，1–6 个空；label 不超过 120 字，reference 不超过 300 字。可以设置仅教师可见的 teacherNotes（不超过 3000 字）。选项 2–8 个；correct 为从 0 开始的选项编号字符串数组，投票不设置正确答案；判断题的 0 为正确、1 为错误。understanding 和 exit 由平台提供固定填写方式，无需 options。title 不超过 500 字，description 不超过 1200 字，任务组 title 不超过 80 字；duration 为整组开放秒数，0 为不限时。不要在学生可见的 description 中写答案。材料不充分时先询问，不编造教材内容。`;
  async function validate(pack) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const normalized = await post(
        `/api/teacher/classrooms/${room.id}/task-pack/preview`,
        pack,
      );
      setPreview(normalized);
      setRequestId(
        Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join(""),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function parse() {
    try {
      const json = raw
        .trim()
        .replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
      await validate(JSON.parse(json));
    } catch {
      setPreview(null);
      setError(
        "暂时无法识别。请粘贴完整 JSON 对象，可以包含 ```json 代码围栏。",
      );
    }
  }
  return (
    <div className="preparation-assistant modal-body">
      <p className="prep-guidance">
        从一个教学环节开始。选模板最快；已有教材或 AI
        生成的任务，可一次导入。保存后仍是草稿。
      </p>
      <div className="quick-pack-grid">
        {PACKS.map((pack) => (
          <button
            key={pack.title}
            className="quick-pack"
            disabled={busy}
            onClick={() =>
              validate({
                schemaVersion: 1,
                group: { title: pack.title, duration: 0 },
                activities: pack.activities,
              })
            }
          >
            <Radio size={18} />
            <strong>{pack.title}</strong>
            <span>{pack.note}</span>
          </button>
        ))}
      </div>
      <label className="pack-file">
        打开已保存的备课包
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setPreview(null);
            setError("");
            if (file.size > 262144) {
              setError("备课包请控制在 256 KB 内，每包最多 12 项任务。");
              return;
            }
            try {
              const content = await file.text();
              setRaw(content);
              await validate(JSON.parse(content));
            } catch {
              setError("文件无法识别。请使用本平台导出的 JSON 备课包。");
            }
          }}
        />
      </label>
      <details
        open={importOpen}
        onToggle={(e) => setImportOpen(e.currentTarget.open)}
        className="pack-import"
      >
        <summary>已有课程材料？用 AI 整理后批量导入</summary>
        <label>
          本环节主题
          <input
            maxLength={200}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <p className="form-help">
          复制说明，和课程材料一起交给常用
          AI。这里只生成任务格式说明，不发送课程材料。
        </p>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              notify("备课说明已复制，可和课程材料一起粘贴给 AI");
            } catch {
              notify("请展开下方说明并手动复制", true);
            }
          }}
        >
          <Copy size={15} />
          复制给 AI 的备课说明
        </button>
        <details className="prompt-details">
          <summary>查看备课说明</summary>
          <textarea aria-label="备课说明" readOnly value={prompt} rows={8} />
        </details>
        <label>
          粘贴任务包
          <textarea
            aria-label="任务包 JSON"
            rows={7}
            maxLength={100000}
            disabled={busy}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
              setError("");
            }}
            placeholder="粘贴 AI 返回的 JSON，或打开之前保存的备课包复制内容"
          />
        </label>
        <button
          className="btn secondary"
          disabled={busy || !raw.trim()}
          onClick={parse}
        >
          校验并预览
        </button>
      </details>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <section className="pack-preview" aria-label="备课包预览">
          <h3>
            <CheckCircle2 size={18} />
            {preview.group.title} · {preview.activities.length} 项
          </h3>
          <p className="form-help">
            请核对题意与参考答案。
            {preview.group.duration
              ? `整组限时 ${preview.group.duration} 秒。`
              : "整组不限时。"}
            保存不会向学生发布。
          </p>
          <ol>
            {preview.activities.map((a, i) => (
              <li key={i}>
                <span className="type-pill">{TYPES[a.type]}</span>
                <strong>{a.title}</strong>
                {a.description && <p>{a.description}</p>}
                {!!a.options.length && (
                  <ul>
                    {a.options.map((option, n) => (
                      <li key={n}>
                        {option}
                        {a.correct.includes(String(n)) && (
                          <span className="answer-hint">教师参考答案</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {a.type === "fill" && (
                  <BlankReferences
                    blanks={a.blanks}
                    references={a.blanks.map((b) => b.reference)}
                  />
                )}
                {a.teacherNotes && (
                  <details className="teacher-notes">
                    <summary>教师讲解提示</summary>
                    <p>{a.teacherNotes}</p>
                  </details>
                )}
                {a.type === "ai" && (
                  <p className="notice">
                    此任务需要教师另外配置 AI；每端最多 {a.aiLimit} 次。
                  </p>
                )}
              </li>
            ))}
          </ol>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await post(
                  `/api/teacher/classrooms/${room.id}/task-pack`,
                  { ...preview, requestId },
                );
                await onSaved(result.group);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "正在保存…" : `保存 ${preview.activities.length} 项为草稿`}
          </button>
        </section>
      )}
    </div>
  );
}

export function StudentPreview({ activity: a }) {
  const letters = a.type === "understanding" ? ["✓", "?", "!"] : "ABCDEFGH";
  return (
    <div
      className="resource-preview-body student-preview"
      aria-label="学生视角预览内容"
    >
      <span className="type-pill">{TYPES[a.type]}</span>
      <h2>{a.title}</h2>
      {a.description && <p className="question-description">{a.description}</p>}
      {a.options?.length ? (
        <div className="preview-options">
          {a.options.map((option, i) => (
            <div className="preview-option" key={i}>
              <span className="option-letter">{letters[i]}</span>
              {option}
            </div>
          ))}
        </div>
      ) : a.type === "fill" ? (
        <BlankInputs blanks={a.blanks} disabled />
      ) : a.type === "exit" ? (
        <div className="preview-input-placeholder">
          我学到的内容 · 还想弄懂的问题（选填）· 课堂难度 1–5
        </div>
      ) : a.type === "ai" ? (
        <div className="preview-input-placeholder">
          围绕任务向 AI 提问（最多 {a.aiLimit} 次），再提交自己的反思。
        </div>
      ) : (
        <div className="preview-input-placeholder">用自己的话写下回答…</div>
      )}
      <p className="form-help">
        这是预览，不会提交回答。学生只需首次加入时填写本节课要求的信息。
      </p>
    </div>
  );
}
