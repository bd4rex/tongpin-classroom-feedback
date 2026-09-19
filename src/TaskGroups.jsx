import React, { useState, useEffect } from "react";
import {
  Plus,
  Layers,
  Pencil,
  Play,
  Pause,
  Square,
  Check,
  ChevronRight,
  Trash2,
} from "lucide-react";
const names = {
  draft: "未发布",
  live: "开放中",
  paused: "已暂停",
  closed: "已结束",
};
const types = {
  single: "单选",
  multiple: "多选",
  boolean: "判断",
  poll: "投票",
  understanding: "理解度",
  text: "开放回答",
  exit: "离堂反馈",
  ai: "AI 探究",
};
const Button = ({ kind = "secondary", children, ...rest }) => (
  <button className={`btn ${kind}`} {...rest}>
    {children}
  </button>
);

export function TeacherGroups({
  groups,
  activities,
  selectedGroup,
  selectedTask,
  onGroup,
  onTask,
  onAddGroup,
  onEditGroup,
  onAddTask,
  readonly,
}) {
  return (
    <section className="activity-list surface grouped-list">
      <div className="section-header">
        <h2>
          课堂任务组 <span>{groups.length}</span>
        </h2>
        {!readonly && (
          <button
            className="icon-btn"
            aria-label="添加任务组"
            onClick={onAddGroup}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      <div className="teacher-group-list">
        {groups.map((g, i) => (
          <section
            className={`teacher-group ${selectedGroup === g.id ? "selected-group" : ""}`}
            key={g.id}
          >
            <div className="group-list-heading">
              <button onClick={() => onGroup(g)}>
                <span className="group-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <strong>{g.title}</strong>
                <span className={`status ${g.status}`}>{names[g.status]}</span>
              </button>
              {g.status === "draft" && !readonly && (
                <button
                  className="icon-btn"
                  aria-label={`编辑任务组 ${g.title}`}
                  onClick={() => onEditGroup(g)}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
            <div className="activity-items">
              {activities
                .filter((a) => a.group_id === g.id)
                .map((a, n) => (
                  <button
                    key={a.id}
                    className={`activity-item ${a.id === selectedTask ? "selected" : ""}`}
                    onClick={() => onTask(g, a)}
                  >
                    <span className="activity-number">{n + 1}</span>
                    <div>
                      <span className="activity-type">{types[a.type]}</span>
                      <h3>{a.title}</h3>
                      <span className="activity-sub">
                        {a.stats.submitted} 份反馈
                      </span>
                    </div>
                  </button>
                ))}
            </div>
            {g.status === "draft" && !readonly && (
              <button className="add-to-group" onClick={() => onAddTask(g)}>
                <Plus size={15} />
                添加任务
              </button>
            )}
            {g.status !== "draft" && (
              <button
                className="group-mini-progress"
                onClick={() => onGroup(g)}
              >
                <span>
                  整组完成 {g.progress.completed} / {g.progress.total} 端
                </span>
                <i>
                  <b style={{ width: `${g.progress.completionRate}%` }} />
                </i>
              </button>
            )}
          </section>
        ))}
      </div>
      {!readonly && (
        <button className="add-activity" onClick={onAddGroup}>
          <Plus size={17} />
          添加任务组
        </button>
      )}
      <div className="activity-list-note">
        <Layers size={16} />
        <span>
          按组发布，组内自主完成
          <br />
          后续组开放时，前一组仍可继续
        </span>
      </div>
    </section>
  );
}
export function GroupProgress({
  group: g,
  busy,
  readonly,
  onControl,
  onEdit,
  Countdown,
  refresh,
}) {
  if (!g) return null;
  const p = g.progress;
  return (
    <section className="surface group-progress">
      <div className="group-progress-top">
        <div>
          <span className="eyebrow">整体节奏</span>
          <h2>
            {g.title}
            <span className={`status ${g.status}`}>{names[g.status]}</span>
          </h2>
          <p>{p.taskCount} 项任务 · 学生可自行选择作答顺序</p>
        </div>
        <div className="button-row">
          {g.deadline && g.status === "live" && (
            <Countdown deadline={g.deadline} onExpire={refresh} />
          )}{" "}
          {!readonly && (
            <>
              {g.status === "draft" && (
                <Button kind="plain" onClick={onEdit}>
                  <Pencil size={15} />
                  编辑组
                </Button>
              )}
              {["draft", "paused"].includes(g.status) && (
                <Button
                  kind="primary"
                  disabled={busy || !p.taskCount}
                  onClick={() => onControl("publish")}
                >
                  <Play size={15} />
                  {g.status === "paused" ? "继续整组" : "发布整组"}
                </Button>
              )}
              {g.status === "live" && (
                <Button disabled={busy} onClick={() => onControl("pause")}>
                  <Pause size={15} />
                  暂停整组
                </Button>
              )}
              {["live", "paused"].includes(g.status) && (
                <Button
                  kind="plain"
                  disabled={busy}
                  onClick={() => onControl("close")}
                >
                  <Square size={14} />
                  结束整组
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="group-progress-meter">
        <i
          style={{ width: `${p.total ? (p.completed / p.total) * 100 : 0}%` }}
        />
        <i
          style={{ width: `${p.total ? (p.inProgress / p.total) * 100 : 0}%` }}
        />
      </div>
      <div className="progress-legend">
        <span>
          <i className="done" />
          已完成 <strong>{p.completed}</strong>
        </span>
        <span>
          <i className="doing" />
          进行中 <strong>{p.inProgress}</strong>
        </span>
        <span>
          <i />
          未开始 <strong>{p.notStarted}</strong>
        </span>
        <small>按参与端统计</small>
      </div>
      {g.status !== "draft" && p.schools.length > 0 && (
        <details className="group-school-progress">
          <summary>
            查看各学校／班级的整组进度 <ChevronRight size={14} />
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>学校／班级</th>
                  <th>已完成</th>
                  <th>进行中</th>
                  <th>未开始</th>
                </tr>
              </thead>
              <tbody>
                {p.schools.map((s) => (
                  <tr key={`${s.city}/${s.school}/${s.className}`}>
                    <td>
                      <strong>
                        {s.city ? `${s.city} · ` : ""}
                        {s.school}
                      </strong>
                      <span>{s.className}</span>
                    </td>
                    <td>{s.completed}</td>
                    <td>{s.inProgress}</td>
                    <td>{s.notStarted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
export function TaskGroupForm({ initial, onSave, onDelete, onClose, notify }) {
  const [title, setTitle] = useState(initial?.title ?? ""),
    [duration, setDuration] = useState(initial?.duration ?? 0),
    [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ title, duration: Number(duration) });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="modal-body form-stack" onSubmit={save}>
      <label>
        任务组名称
        <input
          autoFocus
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：自主探究、巩固练习、回顾与反思"
        />
      </label>
      <label>
        整组开放时长
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          <option value={0}>由老师手动结束</option>
          {[60, 180, 300, 600, 900, 1200, 1800, 3600].map((n) => (
            <option key={n} value={n}>
              {n / 60} 分钟
            </option>
          ))}
          {duration > 0 &&
            ![60, 180, 300, 600, 900, 1200, 1800, 3600].includes(
              Number(duration),
            ) && <option value={duration}>{duration} 秒</option>}
        </select>
      </label>
      <p className="form-help">
        发布整组后，学生可以自由选择组内任务。发布下一组不会自动结束前一组。
      </p>
      <div className="button-row end">
        {onDelete && (
          <Button
            kind="danger"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
              } catch (e) {
                notify(e.message, true);
                setBusy(false);
              }
            }}
          >
            <Trash2 size={15} />
            删除空组
          </Button>
        )}
        <span className="grow" />
        <Button type="button" onClick={onClose}>
          取消
        </Button>
        <Button kind="primary" type="submit" disabled={busy}>
          保存任务组
        </Button>
      </div>
    </form>
  );
}
export function StudentTasks({
  groups,
  roomId,
  notify,
  refresh,
  ActivityComponent,
  markOpen,
}) {
  const [selected, setSelected] = useState(null);
  const all = groups.flatMap((g) => g.activities);
  const fallback =
    all.find((a) => a.status === "live" && !a.answer) ??
    all.find((a) => !a.answer) ??
    all[0];
  const active = all.find((a) => a.id === selected) ?? fallback;
  const group = groups.find((g) =>
    g.activities.some((a) => a.id === active?.id),
  );
  useEffect(() => {
    if (active?.id) {
      setSelected(active.id);
      if (active.status === "live")
        markOpen(active.id).catch((e) => notify(e.message, true));
    }
  }, [active?.id, active?.status]);
  if (!active) return null;
  const next = all.find(
    (a) => a.id !== active.id && a.status === "live" && !a.answer,
  );
  return (
    <>
      <section className="surface student-task-map">
        <div className="student-task-map-heading">
          <div>
            <span className="eyebrow">按自己的节奏完成</span>
            <h2>我的课堂任务</h2>
          </div>
          <strong>
            {all.filter((a) => a.answer).length}
            <span> / {all.length}</span>
          </strong>
        </div>
        <div className="student-group-list">
          {groups.map((g) => (
            <div key={g.id} className={g.id === group?.id ? "current" : ""}>
              <div className="student-group-heading">
                <h3>{g.title}</h3>
                <span>
                  {g.completed}/{g.activities.length} 已完成 · {names[g.status]}
                </span>
              </div>
              <div className="student-task-chips">
                {g.activities.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={a.id === active.id}
                    className={`${a.id === active.id ? "selected" : ""} ${a.answer ? "done" : ""}`}
                    onClick={() => setSelected(a.id)}
                  >
                    <span>{a.answer ? <Check size={14} /> : i + 1}</span>
                    <span>{a.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="student-task-location">
        <span>
          {group.title} · 第{" "}
          {group.activities.findIndex((a) => a.id === active.id) + 1} 项
        </span>
        {group.status === "live" && <span>可自由切换任务</span>}
      </div>
      <ActivityComponent
        key={active.id}
        a={active}
        roomId={roomId}
        notify={notify}
        refresh={refresh}
      />
      {(active.answer || active.status === "closed") && (
        <div className="student-next">
          {next ? (
            <Button
              kind="primary"
              onClick={() => {
                setSelected(next.id);
                document
                  .querySelector(".student-task-location")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              继续下一项 <ChevronRight size={17} />
            </Button>
          ) : (
            <p>
              <Check size={18} />
              {all.every((a) => a.answer)
                ? "已完成所有已发布任务，可以回看或等待下一组。"
                : "当前没有其他可继续的任务，可回看反馈或等待老师开放。"}
            </p>
          )}
        </div>
      )}
    </>
  );
}
