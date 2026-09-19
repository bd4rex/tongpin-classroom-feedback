import { api, post } from "./api.js";
import { createRefreshQueue } from "./refresh-queue.js";
import {
  CollectionSettings,
  ProfileFields,
  ProfileEditor,
} from "./Collection.jsx";
import { StatisticsPanel, Projection } from "./Statistics.jsx";
import {
  TeacherGroups,
  GroupProgress,
  TaskGroupForm,
  StudentTasks,
} from "./TaskGroups.jsx";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  BookOpen,
  Plus,
  Play,
  Pause,
  Square,
  Check,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  ArrowLeft,
  X,
  QrCode,
  Users,
  Radio,
  Download,
  Sparkles,
  Settings2,
  MessageCircle,
  Clock3,
  CircleHelp,
  Copy,
  LogOut,
  Pencil,
  Trash2,
  Send,
  Wifi,
  WifiOff,
  BarChart3,
  Layers,
  GraduationCap,
  Loader2,
  Eye,
  EyeOff,
  History,
  ChevronDown,
} from "lucide-react";

const TYPES = {
  single: "单选题",
  multiple: "多选题",
  boolean: "判断题",
  poll: "投票",
  understanding: "理解度",
  text: "开放回答",
  exit: "离堂反馈",
  ai: "AI 探究",
};
const STATUS = {
  draft: "待发布",
  live: "收集中",
  paused: "已暂停",
  closed: "已结束",
};
const MODES = { individual: "个人参与", group: "小组参与", class: "整班参与" };
const fmtTime = (time) =>
  new Date(time).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function Brand({ compact = false }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Activity size={25} />
      </span>
      {!compact && (
        <span>
          同频<span className="brand-sub">课堂反馈</span>
        </span>
      )}
    </div>
  );
}
function Button({ children, kind = "secondary", className = "", ...props }) {
  return (
    <button className={`btn ${kind} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Empty({ icon: Icon = MessageCircle, title, children }) {
  return (
    <div className="empty">
      <span className="empty-symbol">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function useRealtime(roomId, role, refresh) {
  const ref = useRef(refresh);
  ref.current = refresh;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!roomId) return;
    const { update, stop } = createRefreshQueue(() => ref.current());
    const events = new EventSource(
      `/api/events?role=${role}&room=${encodeURIComponent(roomId)}`,
    );
    events.addEventListener("ready", () => {
      setConnected(true);
      update();
    });
    events.addEventListener("update", update);
    events.onerror = () => setConnected(false);
    const timer = setInterval(
      () => {
        if (role === "teacher" || events.readyState !== EventSource.OPEN)
          update();
      },
      role === "teacher" ? 4000 : 7000,
    );
    return () => {
      stop();
      events.close();
      clearInterval(timer);
      setConnected(false);
    };
  }, [roomId, role]);
  return connected;
}
function Countdown({ deadline, onExpire }) {
  const [left, setLeft] = useState(
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );
  const ref = useRef(onExpire);
  ref.current = onExpire;
  useEffect(() => {
    const timer = setInterval(() => {
      const n = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(n);
      if (n === 0) {
        clearInterval(timer);
        ref.current?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return (
    <span className="time-left">
      <Clock3 size={15} />
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}
export default function App() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const notify = useCallback((message, error = false) => {
    setToast({ message, error });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const student = location.pathname.startsWith("/join");
  const screenId = location.pathname.startsWith("/screen/")
    ? location.pathname.split("/")[2]
    : null;
  return (
    <>
      {student ? (
        <Student notify={notify} />
      ) : (
        <TeacherGate notify={notify} screenId={screenId} />
      )}
      <div className="toast-zone" aria-live="polite">
        {toast && (
          <div className={`toast ${toast.error ? "error" : ""}`}>
            {toast.error ? (
              <CircleHelp size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </>
  );
}
function TeacherGate({ notify, screenId }) {
  const [auth, setAuth] = useState(null),
    [error, setError] = useState("");
  const refresh = () =>
    api("/api/auth/status")
      .then(setAuth)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);
  if (error)
    return (
      <main className="gate">
        <Brand />
        <Empty title="暂时无法连接课堂服务">{error}</Empty>
        <Button
          onClick={() => {
            setError("");
            refresh();
          }}
        >
          重新连接
        </Button>
      </main>
    );
  if (!auth)
    return (
      <div className="loading-page">
        <Loader2 className="spin" /> 正在连接工作台
      </div>
    );
  if (auth.authenticated && screenId)
    return <Projection roomId={screenId} notify={notify} />;
  if (auth.authenticated)
    return (
      <Teacher
        notify={notify}
        logout={async () => {
          await post("/api/auth/logout");
          refresh();
        }}
        onAuthExpired={refresh}
      />
    );
  return (
    <Login initialized={auth.initialized} onDone={refresh} notify={notify} />
  );
}
function Login({ initialized, onDone, notify }) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/api/auth/${initialized ? "login" : "setup"}`, { password });
      onDone();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">每一份反馈，都让课堂更清晰</span>
          <h1>
            一位老师。
            <br />
            一节课。
            <br />
            <em>听见更多学生。</em>
          </h1>
          <p>
            发布一个问题，接住一份思考。
            <br />
            把课堂的下一步，交给真实的反馈。
          </p>
        </div>
        <div className="story-foot">
          <span>各学科适用</span>
          <i />
          <span>学生现场加入</span>
          <i />
          <span>无需学生账号</span>
        </div>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="eyebrow">教师工作台</span>
          <h2>{initialized ? "欢迎回到课堂" : "准备好，开始一节课"}</h2>
          <p>
            {initialized
              ? "输入管理密码，继续你的课堂。"
              : "设置一个教师管理密码，保护课堂操作。"}
          </p>
          <form onSubmit={submit}>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value="teacher"
              readOnly
              hidden
            />
            <label>
              管理密码
              <input
                name="password"
                type="password"
                autoComplete={initialized ? "current-password" : "new-password"}
                minLength={8}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={initialized ? "输入管理密码" : "至少 8 个字符"}
              />
            </label>
            <Button kind="primary" disabled={busy} type="submit">
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <ArrowUpRight size={18} />
              )}{" "}
              {initialized ? "进入工作台" : "设置并进入工作台"}
            </Button>
          </form>
          <a className="text-link student-entry" href="/join">
            我是学生，加入课堂 <ChevronRight size={16} />
          </a>
        </div>
        <span className="login-note">
          仅教师需要管理密码，学生直接输入课堂码参与。
        </span>
      </section>
    </main>
  );
}
function Teacher({ notify, logout, onAuthExpired }) {
  const [rooms, setRooms] = useState([]),
    [templates, setTemplates] = useState([]),
    [id, setId] = useState(null),
    [state, setState] = useState(null),
    [view, setView] = useState("class"),
    [teacherMode, setTeacherMode] = useState("prepare"),
    [selected, setSelected] = useState(null),
    [selectedGroup, setSelectedGroup] = useState(null),
    [pane, setPane] = useState("results"),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const latestId = useRef(id);
  latestId.current = id;
  const handleError = (e) => {
    if (e.status === 401) onAuthExpired();
    else notify(e.message, true);
  };
  async function loadRooms() {
    const list = await api("/api/teacher/classrooms");
    setRooms(list);
    return list;
  }
  async function refresh() {
    if (!id) return;
    try {
      const data = await api(`/api/teacher/classrooms/${id}`);
      if (latestId.current !== id) return;
      setState(data);
      setSelectedGroup((old) =>
        data.groups.some((g) => g.id === old)
          ? old
          : (data.room.current_group_id ?? data.groups[0]?.id ?? null),
      );
      setSelected((old) =>
        data.activities.some((a) => a.id === old)
          ? old
          : data.room.current_activity_id || data.activities[0]?.id || null,
      );
    } catch (e) {
      handleError(e);
    }
  }
  useEffect(() => {
    Promise.all([loadRooms(), api("/api/teacher/templates")])
      .then(([list, t]) => {
        setTemplates(t);
        setId(list.find((r) => r.status !== "ended")?.id ?? null);
        setLoaded(true);
      })
      .catch(handleError);
  }, []);
  useEffect(() => {
    setState(null);
    setTeacherMode("prepare");
    setSelected(null);
    setSelectedGroup(null);
    if (id) refresh();
  }, [id]);
  const connected = useRealtime(id, "teacher", refresh);
  const activeGroup =
    state?.groups.find((g) => g.id === selectedGroup) ??
    state?.groups.find((g) => g.id === state.room.current_group_id) ??
    state?.groups[0];
  const active =
    state?.activities.find(
      (a) => a.id === selected && a.group_id === activeGroup?.id,
    ) ?? state?.activities.find((a) => a.group_id === activeGroup?.id);
  const liveGroup =
    state?.groups.find((g) => g.id === state.room.current_group_id) ??
    activeGroup;
  const liveActivity =
    state?.activities.find((a) => a.id === state.room.current_activity_id) ??
    state?.activities.find((a) => a.group_id === liveGroup?.id) ??
    active;
  const liveActivities = state?.activities.filter(
    (a) => a.group_id === liveGroup?.id && a.status !== "draft",
  ) ?? [];
  function selectLiveActivity(offset) {
    if (!liveActivities.length) return;
    const currentIndex = Math.max(
      0,
      liveActivities.findIndex((a) => a.id === (liveActivity?.id ?? "")),
    );
    const next =
      liveActivities[
        Math.min(
          liveActivities.length - 1,
          Math.max(0, currentIndex + offset),
        )
      ];
    setSelectedGroup(liveGroup?.id ?? null);
    setSelected(next?.id ?? null);
    setPane("results");
  }
  function enterLiveMode() {
    setSelectedGroup(liveGroup?.id ?? activeGroup?.id ?? null);
    setSelected(liveActivity?.id ?? active?.id ?? null);
    setPane("results");
    setTeacherMode("live");
  }
  const groupList = state ? (
    <TeacherGroups
      groups={state.groups}
      activities={state.activities}
      selectedGroup={activeGroup?.id}
      selectedTask={active?.id}
      readonly={state.room.status === "ended"}
      onGroup={(g) => {
        setSelectedGroup(g.id);
        setSelected(g.taskIds[0] ?? null);
        setPane("results");
      }}
      onTask={(g, a) => {
        setSelectedGroup(g.id);
        setSelected(a.id);
        setPane("results");
      }}
      onAddGroup={() => setModal({ type: "group" })}
      onEditGroup={(g) => setModal({ type: "group", group: g })}
      onAddTask={(g) => setModal({ type: "activity", groupId: g.id })}
    />
  ) : null;
  const openCurrent = () => {
    const currentRoom = rooms.find((r) => r.status !== "ended");
    setId(currentRoom?.id ?? null);
    setView("class");
  };
  async function perform(fn, message) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await refresh();
      await loadRooms();
      if (message) notify(message);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function control(action) {
    await perform(
      () => post(`/api/teacher/activities/${active.id}/control`, { action }),
      action === "publish"
        ? "活动已发布到学生端"
        : action === "reveal"
          ? "学生端结果显示已更新"
          : "课堂状态已更新",
    );
  }
  function exported(format) {
    window.location.href = `/api/teacher/classrooms/${id}/export?format=${format}`;
  }
  const unfinished = rooms.some((r) => r.status !== "ended");
  return (
    <div className="teacher-shell">
      <aside className="rail">
        <Brand compact />
        <div className="rail-title">同频</div>
        <nav>
          <button
            className={view === "class" ? "active" : ""}
            onClick={openCurrent}
          >
            <Radio size={22} />
            <span>当前课堂</span>
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => {
              setView("history");
              loadRooms().catch(handleError);
            }}
          >
            <History size={22} />
            <span>课后记录</span>
          </button>
          <button
            className={view === "ai" ? "active" : ""}
            onClick={() => setView("ai")}
          >
            <Sparkles size={22} />
            <span>AI 设置</span>
          </button>
        </nav>
        <button
          className="rail-logout"
          onClick={() => logout().catch(handleError)}
        >
          <LogOut size={20} />
          <span>退出</span>
        </button>
      </aside>
      <div className="teacher-main">
        <header className="topbar">
          <div>
            <span className="topbar-product">课堂反馈</span>
            <span className="topbar-divider">/</span>
            <span>
              {view === "ai"
                ? "AI 设置"
                : view === "history"
                  ? "课后记录"
                  : "教师工作台"}
            </span>
          </div>
          <div className="topbar-right">
            <a href="/join" target="_blank" rel="noreferrer">
              学生入口 <ArrowUpRight size={14} />
            </a>
            <button
              className="teacher-avatar"
              aria-label="退出教师工作台"
              title="退出教师工作台"
              onClick={() => logout().catch(handleError)}
            >
              <GraduationCap size={19} />
            </button>
          </div>
        </header>
        {view === "ai" ? (
          <AISettings notify={notify} />
        ) : view === "history" ? (
          <section className="page-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">课后回看</span>
                <h1>留住课堂里的思考</h1>
                <p>每节课的活动和反馈会自动保存。</p>
              </div>
            </div>
            <div className="history-list">
              {rooms.filter((r) => r.status === "ended").length ? (
                rooms
                  .filter((r) => r.status === "ended")
                  .map((r) => (
                    <article className="history-card" key={r.id}>
                      <span className="subject-icon">
                        <BookOpen size={23} />
                      </span>
                      <div className="grow">
                        <span className="muted small">
                          {r.subject} · {fmtTime(r.created_at)}
                        </span>
                        <h3>{r.title}</h3>
                        <span className="muted small">
                          {r.total} 个参与端 · {r.activities} 项活动
                        </span>
                      </div>
                      <Button
                        onClick={() => {
                          setId(r.id);
                          setView("class");
                        }}
                      >
                        查看反馈 <ChevronRight size={16} />
                      </Button>
                      <Button
                        disabled={unfinished || busy}
                        title={unfinished ? "结束当前课堂后可复用" : ""}
                        onClick={() =>
                          perform(async () => {
                            const copy = await post(
                              `/api/teacher/classrooms/${r.id}/duplicate`,
                            );
                            setId(copy.id);
                            setView("class");
                          }, "已创建新课堂，历史回答不会带入")
                        }
                      >
                        <Copy size={16} />
                        再上一节
                      </Button>
                    </article>
                  ))
              ) : (
                <div className="surface">
                  <Empty icon={History} title="课堂结束后，记录会留在这里">
                    你可以回看反馈，也可以复用活动再上一节课。
                  </Empty>
                </div>
              )}
            </div>
          </section>
        ) : !loaded ? (
          <div className="loading-page">
            <Loader2 className="spin" />
            正在读取课堂
          </div>
        ) : !id ? (
          <section className="page-content welcome">
            <div className="welcome-heading">
              <span className="eyebrow">开始一节有回应的课</span>
              <h1>今天，听听学生怎么想。</h1>
              <p>
                先选一组活动，或从空白课堂开始。学生现场输入课堂码即可加入。
              </p>
              <Button
                kind="primary"
                onClick={() => setModal({ type: "create" })}
              >
                <Plus size={18} />
                新建课堂
              </Button>
            </div>
            <div className="section-label">
              <h2>从适合你的活动开始</h2>
              <span>内容可在发布前自由修改</span>
            </div>
            <div className="template-grid">
              {templates.map((t) => (
                <button
                  className={`template-card theme-${t.id}`}
                  key={t.id}
                  onClick={() => setModal({ type: "create", template: t })}
                >
                  <span className="template-subject">
                    {t.subject}
                    <ArrowUpRight size={17} />
                  </span>
                  <h3>{t.title}</h3>
                  <p>{t.description}</p>
                  <span className="template-foot">
                    {t.activities.length} 项课堂活动 <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
            <div className="welcome-strip">
              <QrCode size={21} />
              <span>现场加入</span>
              <span className="muted">
                不建学生账号 · 不导入名单 · 学生个人加入即可
              </span>
            </div>
          </section>
        ) : !state ? (
          <div className="loading-page">
            <Loader2 className="spin" />
            正在读取反馈
          </div>
        ) : (
          <section className="page-content classroom">
            <div className="page-heading">
              <div>
                <div className="heading-meta">
                  <span className="subject-tag">{state.room.subject}</span>
                  <span className={`connection ${connected ? "" : "offline"}`}>
                    {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
                    {connected ? "实时连接" : "正在重连 · 自动刷新"}
                  </span>
                  {state.room.status === "ended" && (
                    <span className="status closed">课堂已结束</span>
                  )}
                </div>
                <h1>{state.room.title}</h1>
                <p>
                  {state.room.status === "ended"
                    ? "课堂记录已保存，可查看与导出。"
                    : "按组开放任务，看见不同学校、不同学生的学习进度。"}
                </p>
              </div>
              <div className="heading-actions">
                {state.room.status !== "ended" && (
                  <Button onClick={() => setModal({ type: "collection" })}>
                    <Settings2 size={16} />
                    采集与展示
                  </Button>
                )}
                <a
                  className="btn secondary"
                  href={`/screen/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <BarChart3 size={16} />
                  第二屏监看
                </a>
                <Button onClick={() => exported("csv")}>
                  <Download size={16} />
                  导出回答
                </Button>
                <Button kind="plain" onClick={() => exported("json")}>
                  完整记录
                </Button>
                {state.room.status !== "ended" ? (
                  <Button
                    kind="plain"
                    onClick={() => setModal({ type: "end" })}
                  >
                    <Square size={15} />
                    结束课堂
                  </Button>
                ) : (
                  !unfinished && (
                    <Button
                      kind="primary"
                      onClick={() => setModal({ type: "create" })}
                    >
                      <Plus size={16} />
                      开始下一节课
                    </Button>
                  )
                )}
              </div>
            </div>
            <div className="workspace-modebar" role="tablist" aria-label="教师工作模式">
              <div className="workspace-mode-tabs">
                <button
                  role="tab"
                  aria-selected={teacherMode === "prepare"}
                  className={teacherMode === "prepare" ? "selected" : ""}
                  onClick={() => setTeacherMode("prepare")}
                >
                  <Settings2 size={17} />
                  <span>
                    <strong>课前配置</strong>
                    <small>组织资源与任务</small>
                  </span>
                </button>
                <button
                  role="tab"
                  aria-selected={teacherMode === "live"}
                  className={teacherMode === "live" ? "selected" : ""}
                  onClick={enterLiveMode}
                >
                  <Radio size={17} />
                  <span>
                    <strong>课堂控制</strong>
                    <small>控制节奏与反馈</small>
                  </span>
                </button>
              </div>
              <div className="workspace-modebar-note">
                {teacherMode === "prepare"
                  ? "学生端预览不会直接发布，确认后再开放任务组。"
                  : "教师控制当前课堂，实时数据可交给第二块屏幕监看。"}
              </div>
              <a
                className="monitor-link"
                href={`/screen/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Eye size={16} />
                打开第二屏
                <ArrowUpRight size={14} />
              </a>
            </div>
            <div className="class-overview">
              <button
                className="join-card"
                onClick={() => setModal({ type: "qr" })}
              >
                <span className="join-card-icon">
                  <QrCode size={25} />
                </span>
                <span>
                  <span className="metric-label">课堂码</span>
                  <strong className="class-code">{state.room.code}</strong>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <div className="metric">
                <span className="metric-label">
                  已加入 <Users size={16} />
                </span>
                <strong>
                  {state.room.total}
                  <small>个参与端</small>
                </strong>
                <span className="metric-note">
                  当前在线 {state.room.online} 端
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">
                  所选任务组完成 <CheckCircle2 size={15} />
                </span>
                <strong>
                  {activeGroup?.progress.completed ?? 0}
                  <small>/ {state.room.total} 端</small>
                </strong>
                <div className="mini-progress">
                  <i
                    style={{
                      width: `${activeGroup?.progress.completionRate ?? 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="metric">
                <span className="metric-label">
                  AI 请求 <Sparkles size={16} />
                </span>
                <strong>
                  {state.aiQueue.running}
                  <small>处理中</small>
                </strong>
                <span className="metric-note">
                  {state.aiQueue.queued} 条排队 ·{" "}
                  {state.aiQueue.enabled ? "已开启" : "未开启"}
                </span>
              </div>
            </div>
            {teacherMode === "prepare" ? (
              <div className="class-workspace teacher-prep-workspace">
                {groupList}
                <div className="feedback-column">
                  <PreparationPanel
                    activity={active}
                    group={activeGroup}
                    room={state.room}
                    readonly={state.room.status === "ended"}
                    onEdit={() =>
                      active &&
                      setModal({ type: "activity", activity: active })
                    }
                    onAdd={() => setModal({ type: "activity" })}
                    onEnterLive={enterLiveMode}
                  />
                </div>
              </div>
            ) : (
              <div className="class-workspace teacher-live-workspace">
                {groupList}
                <div className="feedback-column">
                  <LiveControlStrip
                    activity={liveActivity}
                    group={liveGroup}
                    activities={liveActivities}
                    busy={busy}
                    onPrevious={() => selectLiveActivity(-1)}
                    onNext={() => selectLiveActivity(1)}
                    onOpenMonitor={() => window.open(`/screen/${id}`, "_blank", "noopener")}
                  />
                  {pane !== "stats" && (
                  <GroupProgress
                    group={activeGroup}
                    readonly={state.room.status === "ended"}
                    busy={busy}
                    Countdown={Countdown}
                    refresh={refresh}
                    onEdit={() =>
                      setModal({ type: "group", group: activeGroup })
                    }
                    onControl={(action) =>
                      perform(
                        () =>
                          post(
                            `/api/teacher/groups/${activeGroup.id}/control`,
                            {
                              action,
                            },
                          ),
                        action === "publish"
                          ? "整组任务已开放，学生可以自主完成"
                          : "任务组状态已更新",
                      )
                    }
                  />
                )}

                <div className="feedback-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={pane === "results"}
                    className={pane === "results" ? "selected" : ""}
                    onClick={() => setPane("results")}
                  >
                    <BarChart3 size={17} />
                    活动反馈
                  </button>
                  <button
                    role="tab"
                    aria-selected={pane === "questions"}
                    className={pane === "questions" ? "selected" : ""}
                    onClick={() => setPane("questions")}
                  >
                    <MessageCircle size={17} />
                    学生提问
                    <span className="count-badge">
                      {state.questions.filter((q) => !q.answered).length}
                    </span>
                  </button>
                  <button
                    role="tab"
                    aria-selected={pane === "stats"}
                    className={pane === "stats" ? "selected" : ""}
                    onClick={() => setPane("stats")}
                  >
                    <BarChart3 size={17} />
                    数据统计
                  </button>
                </div>
                {pane === "stats" ? (
                  <StatisticsPanel roomId={id} />
                ) : pane === "questions" ? (
                  <section className="surface question-panel">
                    <div className="section-header">
                      <h2>来自学生的疑问</h2>
                      <span className="muted small">仅教师可见</span>
                    </div>
                    {state.questions.length ? (
                      state.questions.map((q) => (
                        <article
                          className={`question-row ${q.answered ? "answered" : ""}`}
                          key={q.id}
                        >
                          <div className="grow">
                            <div className="response-meta">
                              <span>{q.nickname}</span>
                              <span>
                                {q.school === "未填写学校"
                                  ? "现场参与"
                                  : q.school}
                              </span>
                              <span>{fmtTime(q.created_at)}</span>
                            </div>
                            <p>{q.content}</p>
                          </div>
                          <Button
                            kind="plain"
                            disabled={busy}
                            onClick={() =>
                              perform(() =>
                                api(`/api/teacher/questions/${q.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    answered: !q.answered,
                                  }),
                                }),
                              )
                            }
                          >
                            {q.answered ? (
                              <>
                                <Check size={15} />
                                已回应
                              </>
                            ) : (
                              "标记已回应"
                            )}
                          </Button>
                        </article>
                      ))
                    ) : (
                      <Empty title="给疑问留一点空间">
                        学生可以随时提问，问题会实时出现在这里。
                      </Empty>
                    )}
                  </section>
                ) : active ? (
                  <ActivityPanel
                    activity={active}
                    room={state.room}
                    busy={busy}
                    onControl={control}
                    edit={() =>
                      setModal({ type: "activity", activity: active })
                    }
                    refresh={refresh}
                    aiEnabled={state.aiQueue.enabled}
                    analyze={() =>
                      perform(
                        () =>
                          post(`/api/teacher/activities/${active.id}/analyze`),
                        "AI 分析已生成",
                      )
                    }
                    aiSettings={() => setView("ai")}
                  />
                ) : (
                  <section className="surface">
                    <Empty icon={BookOpen} title="添加第一个课堂活动">
                      选择一个问题、一次投票，或邀请学生表达观点。
                    </Empty>
                    <div className="center-action">
                      <Button
                        kind="primary"
                        onClick={() => setModal({ type: "activity" })}
                      >
                        <Plus size={17} />
                        添加活动
                      </Button>
                    </div>
                  </section>
                )}
              </div>
              </div>
            )}
            <p className="measurement-note">
              每个参与端计一份反馈，不折算为个人成绩；在线状态按最近 75 秒的心跳计算。
            </p>
          </section>
        )}
      </div>
      {modal?.type === "create" && (
        <CreateClass
          templates={templates}
          chosen={modal.template}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            const room = await post("/api/teacher/classrooms", body);
            setId(room.id);
            setView("class");
            await loadRooms();
            setModal(null);
            notify("课堂已创建，邀请学生加入吧");
          }}
          notify={notify}
        />
      )}
      {modal?.type === "collection" && (
        <Modal title="采集与展示设置" onClose={() => setModal(null)} wide>
          <CollectionSettings
            initial={state.collection}
            notify={notify}
            onClose={() => setModal(null)}
            onSave={async (config) => {
              await api(`/api/teacher/classrooms/${id}/collection`, {
                method: "PUT",
                body: JSON.stringify(config),
              });
              await refresh();
              setModal(null);
              notify("采集与展示设置已更新");
            }}
          />
        </Modal>
      )}
      {modal?.type === "group" && (
        <Modal
          title={modal.group ? "编辑任务组" : "添加任务组"}
          onClose={() => setModal(null)}
        >
          <TaskGroupForm
            initial={modal.group}
            notify={notify}
            onClose={() => setModal(null)}
            onSave={async (body) => {
              const g = modal.group
                ? await api(`/api/teacher/groups/${modal.group.id}`, {
                    method: "PUT",
                    body: JSON.stringify(body),
                  })
                : await post(`/api/teacher/classrooms/${id}/groups`, body);
              setSelectedGroup(g.id);
              setSelected(null);
              await refresh();
              setModal(null);
              notify("任务组已保存");
            }}
            onDelete={
              modal.group
                ? async () => {
                    await api(`/api/teacher/groups/${modal.group.id}`, {
                      method: "DELETE",
                      body: "{}",
                    });
                    await refresh();
                    setModal(null);
                  }
                : null
            }
          />
        </Modal>
      )}
      {modal?.type === "activity" && (
        <ActivityEditor
          initial={modal.activity}
          groups={state.groups.filter((g) => g.status === "draft")}
          defaultGroupId={modal.groupId ?? activeGroup?.id}
          onClose={() => setModal(null)}
          onSave={async (body) => {
            if (modal.activity)
              await api(`/api/teacher/activities/${modal.activity.id}`, {
                method: "PUT",
                body: JSON.stringify(body),
              });
            else {
              const a = await post(
                `/api/teacher/classrooms/${id}/activities`,
                body,
              );
              setSelected(a.id);
            }
            setSelectedGroup(body.groupId);
            await refresh();
            setModal(null);
            notify("活动已保存");
          }}
          onDelete={
            modal.activity
              ? async () => {
                  await api(`/api/teacher/activities/${modal.activity.id}`, {
                    method: "DELETE",
                    body: "{}",
                  });
                  await refresh();
                  setModal(null);
                }
              : null
          }
          notify={notify}
        />
      )}
      {modal?.type === "qr" && state && (
        <Modal title="邀请学生加入课堂" onClose={() => setModal(null)}>
          <div className="qr-content">
            <p>{state.room.title}</p>
            <img
              alt="扫描二维码加入当前课堂"
              src={`/api/teacher/classrooms/${id}/qr`}
            />
            <span className="muted">打开学生入口，输入课堂码</span>
            <div className="qr-code">{state.room.code}</div>
            <code className="join-url">{state.joinUrl}</code>
            <p className="small muted">
              学生与服务器在同一网络时可扫码加入。校内服务器部署后可配置统一访问地址。
            </p>
            <div className="button-row">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.joinUrl);
                    notify("加入链接已复制");
                  } catch {
                    notify("请选中上方链接复制", true);
                  }
                }}
              >
                <Copy size={16} />
                复制链接
              </Button>
              <a
                className="btn primary"
                href={`/join?code=${state.room.code}`}
                target="_blank"
                rel="noreferrer"
              >
                打开学生端 <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === "end" && (
        <Modal title="结束这节课堂？" onClose={() => setModal(null)}>
          <div className="modal-body">
            <p>
              所有任务组将停止接收回答。已经提交的反馈会自动保存到课后记录。
            </p>
            <div className="button-row end">
              <Button onClick={() => setModal(null)}>继续上课</Button>
              <Button
                kind="primary"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    await post(`/api/teacher/classrooms/${id}/end`);
                    setModal(null);
                  }, "课堂已结束，反馈已保存")
                }
              >
                结束并保存
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PreparationPanel({
  activity,
  group,
  room,
  readonly,
  onEdit,
  onAdd,
  onEnterLive,
}) {
  const hasActivity = Boolean(activity);
  const hasGroupActivity = Boolean(group?.progress?.taskCount);
  const isPublished = group && group.status !== "draft";
  return (
    <div className="preparation-column">
      <section className="surface prep-intro">
        <div>
          <span className="eyebrow">课前配置</span>
          <h2>把本节课的资源和项目排好</h2>
          <p>
            先组织任务组，再预览学生页面。保存后的内容会在任务组开放后同步到学生端。
          </p>
        </div>
        <div className="prep-checklist" aria-label="课前配置进度">
          <div className={hasGroupActivity ? "done" : ""}>
            <span>1</span>
            <div>
              <strong>组织任务组</strong>
              <small>{hasGroupActivity ? "已添加课堂项目" : "先添加一个项目"}</small>
            </div>
            {hasGroupActivity && <CheckCircle2 size={17} />}
          </div>
          <div className={hasActivity ? "done" : ""}>
            <span>2</span>
            <div>
              <strong>配置当前项目</strong>
              <small>{hasActivity ? "可在右侧预览" : "添加问题、资源或选项"}</small>
            </div>
            {hasActivity && <CheckCircle2 size={17} />}
          </div>
          <div className={isPublished ? "done" : ""}>
            <span>3</span>
            <div>
              <strong>进入课堂控制</strong>
              <small>{isPublished ? "任务组已经开放" : "准备好后再开放"}</small>
            </div>
            {isPublished && <CheckCircle2 size={17} />}
          </div>
        </div>
        <div className="button-row prep-actions">
          {!readonly && (
            <Button kind="primary" onClick={hasActivity ? onEdit : onAdd}>
              {hasActivity ? <Pencil size={16} /> : <Plus size={17} />}
              {hasActivity ? "编辑教学资源" : "添加第一个项目"}
            </Button>
          )}
          <Button onClick={onEnterLive} disabled={readonly}>
            <Radio size={16} />
            进入课堂控制
            <ArrowUpRight size={14} />
          </Button>
        </div>
      </section>
      <section className="surface resource-preview-card">
        <div className="section-header">
          <h2>
            <Eye size={17} /> 学生端预览
          </h2>
          <span className="preview-badge">不会直接发布</span>
        </div>
        {activity ? (
          <div className="resource-preview-body">
            <div className="student-preview-topline">
              <span className="type-pill">{TYPES[activity.type]}</span>
              <span className="muted small">
                {group?.title || "未分配任务组"} · {room.subject}
              </span>
            </div>
            <h2>{activity.title}</h2>
            {activity.description && (
              <div className="preview-resource-text">
                <span>教学资源与任务说明</span>
                <p>{activity.description}</p>
              </div>
            )}
            {activity.options?.length ? (
              <div className="preview-options" aria-label="学生端选项预览">
                {activity.options.map((option, index) => (
                  <div className="preview-option" key={`${option}-${index}`}>
                    <span className="option-letter">
                      {activity.type === "understanding"
                        ? ["✓", "?", "!"][index]
                        : String.fromCharCode(65 + index)}
                    </span>
                    <span>{option}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="preview-input-placeholder">
                学生将在这里填写自己的回答或课堂反思
              </div>
            )}
            <div className="preview-footer">
              <span>学生端只展示当前开放的项目和可填写内容。</span>
              {!readonly && (
                <button className="text-link" onClick={onEdit}>
                  编辑这项内容 <ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <Empty icon={BookOpen} title="还没有可预览的项目">
            从左侧任务组添加一个项目，学生端预览会显示在这里。
          </Empty>
        )}
      </section>
    </div>
  );
}

function LiveControlStrip({
  activity,
  group,
  activities,
  busy,
  onPrevious,
  onNext,
  onOpenMonitor,
}) {
  const index = activities.findIndex((item) => item.id === activity?.id);
  return (
    <section className="surface live-control-strip">
      <div className="live-control-copy">
        <span className="eyebrow">课堂控制 · 当前项目</span>
        <div className="live-control-title">
          {activity && (
            <span className={`status ${activity.status}`}>
              {activity.status === "live" && <i />}
              {STATUS[activity.status]}
            </span>
          )}
          <h2>{activity?.title || "还没有开放的项目"}</h2>
        </div>
        <p>
          {group?.title || "未选择任务组"} · {group?.progress?.taskCount ?? activities.length} 项课堂项目
          {index >= 0 ? ` · 当前第 ${index + 1} 项` : " · 尚未开放"}
        </p>
      </div>
      <div className="live-control-actions">
        <div className="live-stepper" aria-label="切换当前项目">
          <button
            className="icon-btn"
            aria-label="上一个项目"
            disabled={busy || index <= 0}
            onClick={onPrevious}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-btn"
            aria-label="下一个项目"
            disabled={busy || index < 0 || index >= activities.length - 1}
            onClick={onNext}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <Button onClick={onOpenMonitor}>
          <Eye size={16} />
          第二屏监看
        </Button>
      </div>
    </section>
  );
}

function ActivityPanel({
  activity: a,
  room,
  busy,
  onControl,
  edit,
  refresh,
  aiEnabled,
  analyze,
  aiSettings,
}) {
  const [detail, setDetail] = useState("answers");
  useEffect(() => setDetail("answers"), [a.id]);
  const s = a.stats,
    hasText = ["text", "exit", "ai"].includes(a.type);
  return (
    <>
      <section className="surface activity-panel">
        <div className="activity-panel-top">
          <span className="type-pill">{TYPES[a.type]}</span>
          <span className={`status ${a.status}`}>
            {a.status === "live" && <i />}
            {STATUS[a.status]}
          </span>
          {a.deadline && a.status === "live" && (
            <Countdown deadline={a.deadline} onExpire={refresh} />
          )}
          <div className="grow" />
          {a.status === "draft" && room.status !== "ended" && (
            <Button kind="plain" onClick={edit}>
              <Pencil size={15} />
              编辑
            </Button>
          )}
        </div>
        <h2 className="question-title">{a.title}</h2>
        {a.description && (
          <p className="question-description">{a.description}</p>
        )}
        {a.type === "ai" && (
          <div className="ai-task-note">
            <Sparkles size={18} />
            <div>
              <strong>在任务范围内，与 AI 一起探究</strong>
              <span>
                每个参与端最多提问 {a.aiLimit} 次，完成后提交自己的反思。
              </span>
              {!aiEnabled && (
                <button className="text-link" onClick={aiSettings}>
                  先开启并配置 AI <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          </div>
        )}
        {a.options.length > 0 && (
          <div className="distribution">
            {s.distribution.map((d, i) => (
              <div className="distribution-row" key={i}>
                <div className="distribution-label">
                  <span
                    className={`option-letter ${a.correct.includes(String(i)) ? "is-correct" : ""}`}
                  >
                    {a.type === "understanding"
                      ? ["✓", "?", "!"][i]
                      : String.fromCharCode(65 + i)}
                  </span>
                  <span>{d.label}</span>
                  {a.correct.includes(String(i)) && (
                    <span className="answer-hint">参考答案</span>
                  )}
                  <strong>
                    {d.count}
                    <small> 端</small>
                  </strong>
                  <span className="distribution-percent">{d.percent}%</span>
                </div>
                <div className="distribution-bar">
                  <i
                    className={a.correct.includes(String(i)) ? "correct" : ""}
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {hasText && a.status === "draft" && (
          <div className="draft-note">
            <MessageCircle size={25} />
            <span>
              发布后，学生的{a.type === "ai" ? "探究反思" : "文字回答"}
              会汇集在下方。
            </span>
          </div>
        )}
        <div className="activity-control">
          <div className="small muted">
            {s.submitted} 份反馈 · 本题提交率 {s.submissionRate}%
            {s.correctRate !== null && (
              <span>
                {" "}
                · 正确率 <b className="green-text">{s.correctRate}%</b>
              </span>
            )}
            {a.type === "multiple" && (
              <div className="tiny-note">
                多选占比以已提交端为分母，总和可能超过 100%。
              </div>
            )}
          </div>
          {a.status !== "draft" ? (
            <Button
              kind="plain"
              disabled={busy}
              onClick={() => onControl("reveal")}
            >
              {a.revealed ? <EyeOff size={16} /> : <Eye size={16} />}{" "}
              {a.revealed ? "隐藏本题结果" : "展示本题结果"}
            </Button>
          ) : (
            <span className="small muted">通过上方“发布整组”开放任务</span>
          )}
        </div>
      </section>
      <section className="surface response-panel">
        <div className="section-header">
          <div className="sub-tabs">
            <button
              className={detail === "answers" ? "selected" : ""}
              onClick={() => setDetail("answers")}
            >
              反馈记录 <span>{s.submitted}</span>
            </button>
            <button
              className={detail === "groups" ? "selected" : ""}
              onClick={() => setDetail("groups")}
            >
              按学校／班级
            </button>
          </div>
          {hasText && s.submitted > 0 && (
            <Button kind="ai" disabled={busy || !aiEnabled} onClick={analyze}>
              <Sparkles size={15} />
              {busy ? "处理中…" : "AI 辅助分析"}
            </Button>
          )}
        </div>
        {detail === "groups" ? (
          s.groups.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>学校／班级</th>
                    <th>参与端</th>
                    <th>已提交</th>
                    <th>提交率</th>
                  </tr>
                </thead>
                <tbody>
                  {s.groups.map((g) => (
                    <tr key={`${g.city}/${g.school}/${g.className}`}>
                      <td>
                        <strong>
                          {g.city ? `${g.city} · ` : ""}
                          {g.school}
                        </strong>
                        <span>{g.className}</span>
                      </td>
                      <td>{g.total}</td>
                      <td>{g.submitted}</td>
                      <td>{Math.round((g.submitted / g.total) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="学生加入后，将显示分组反馈">
              学校和班级由学生自行选填。
            </Empty>
          )
        ) : s.responses.length ? (
          <div className="response-list">
            {s.submitted > 100 && (
              <p className="small muted">
                展示最近 100 份反馈，完整数据可导出。
              </p>
            )}
            {s.responses.map((r) => (
              <article className="response" key={r.id}>
                <div className="response-meta">
                  <span className="mini-avatar">{r.nickname.slice(0, 1)}</span>
                  <strong>{r.name || r.nickname}</strong>
                  {r.student_no && <span>学号 {r.student_no}</span>}
                  <span>{MODES[r.mode]}</span>
                  <span>{fmtTime(r.created_at)}</span>
                </div>
                <p>
                  {r.answer.choices
                    ? r.answer.choices
                        .map((c) => a.options[Number(c)])
                        .join("；")
                    : (r.answer.text ?? r.answer.takeaway)}
                </p>
                {r.answer.question && (
                  <p className="muted">还想弄懂：{r.answer.question}</p>
                )}
                {r.answer.difficulty && (
                  <span className="difficulty-label">
                    课堂难度 {r.answer.difficulty} / 5
                  </span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            icon={Radio}
            title={a.status === "draft" ? "等待活动发布" : "正在等待第一份反馈"}
          >
            {a.status === "draft"
              ? "发布所属任务组后，学生端会收到整组任务。"
              : "学生提交后，这里会实时更新。"}
          </Empty>
        )}
      </section>
      {a.analysis && (
        <section className="surface analysis-panel">
          <div className="section-header">
            <h2>
              <Sparkles size={18} />
              AI 辅助分析
            </h2>
            <span className="small muted">
              {a.analysis.sample_size} 份样本 / 当时 {a.analysis.answer_count}{" "}
              份回答
            </span>
          </div>
          {a.analysis.stale && (
            <p className="notice">分析后又收到新回答，可重新生成。</p>
          )}
          <p className="analysis-content">{a.analysis.content}</p>
          <p className="small muted">
            AI 结论需由教师核实；人数、占比和正确率由平台独立统计。
          </p>
        </section>
      )}
    </>
  );
}
function CreateClass({ templates, chosen, onClose, onSave, notify }) {
  const [templateId, setTemplateId] = useState(chosen?.id ?? "general"),
    [title, setTitle] = useState(chosen?.title ?? "今天的课堂"),
    [subject, setSubject] = useState(chosen?.subject ?? "通用"),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ title, subject, templateId });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="新建课堂" onClose={onClose}>
      <form className="modal-body form-stack" onSubmit={submit}>
        <label>
          课堂名称
          <input
            autoFocus
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          学科
          <input
            required
            maxLength={30}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="如：数学、语文、综合实践"
          />
        </label>
        <label>
          预置活动
          <select
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              const t = templates.find((t) => t.id === e.target.value);
              if (t) {
                setTitle(t.title);
                setSubject(t.subject);
              }
            }}
          >
            <option value="">空白课堂，自己添加</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.subject} · {t.title}（{t.activities.length} 项）
              </option>
            ))}
          </select>
        </label>
        <p className="form-help">不需要准备学生名单，创建后分享课堂码即可。</p>
        <div className="button-row end">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            创建课堂
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ActivityEditor({
  initial,
  groups,
  defaultGroupId,
  onClose,
  onSave,
  onDelete,
  notify,
}) {
  const [type, setType] = useState(initial?.type ?? "single"),
    [title, setTitle] = useState(initial?.title ?? ""),
    [description, setDescription] = useState(initial?.description ?? ""),
    [options, setOptions] = useState(
      initial?.options.length ? initial.options : ["", ""],
    ),
    [correct, setCorrect] = useState(initial?.correct ?? []),
    [groupId, setGroupId] = useState(
      initial?.group_id ??
        groups.find((g) => g.id === defaultGroupId)?.id ??
        groups[0]?.id ??
        "",
    ),
    [prompt, setPrompt] = useState(
      initial?.prompt ??
        "围绕当前课堂任务，帮助学生理解概念。用简洁的解释和生活中的例子启发学生，不代写作业。",
    ),
    [aiLimit, setAiLimit] = useState(initial?.aiLimit ?? 3),
    [busy, setBusy] = useState(false);
  const choice = ["single", "multiple", "poll", "boolean"].includes(type);
  function changeType(value) {
    setType(value);
    setCorrect([]);
    if (value === "boolean") setOptions(["正确", "错误"]);
    else if (["single", "multiple", "poll"].includes(value))
      setOptions(["", ""]);
  }
  function toggle(i) {
    const s = String(i);
    setCorrect(
      type === "multiple"
        ? correct.includes(s)
          ? correct.filter((c) => c !== s)
          : [...correct, s]
        : correct.includes(s)
          ? []
          : [s],
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        type,
        title,
        description,
        options,
        correct,
        duration: 0,
        groupId,
        prompt,
        aiLimit: Number(aiLimit),
      });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={initial ? "编辑活动" : "添加课堂活动"} onClose={onClose} wide>
      <form className="modal-body form-stack" onSubmit={submit}>
        <div className="type-choices">
          {Object.entries(TYPES).map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={type === key ? "selected" : ""}
              onClick={() => changeType(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          题目／任务
          <input
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === "ai"
                ? "例如：让 AI 帮你理解今天的一个概念"
                : "你希望学生回答什么？"
            }
          />
        </label>
        <label>
          教学资源与任务说明 <span className="optional">选填</span>
          <textarea
            rows={2}
            maxLength={1200}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="填写背景材料、图示说明、情境或作答要求"
          />
        </label>
        {choice && (
          <fieldset className="option-editor">
            <legend>
              选项{" "}
              {type !== "poll" && <span>勾选可设置参考答案，也可以不设。</span>}
            </legend>
            {options.map((o, i) => (
              <div className="option-edit-row" key={i}>
                {type !== "poll" && (
                  <input
                    aria-label={`选项 ${String.fromCharCode(65 + i)} 为参考答案`}
                    type="checkbox"
                    checked={correct.includes(String(i))}
                    onChange={() => toggle(i)}
                  />
                )}
                <span>{String.fromCharCode(65 + i)}</span>
                <input
                  aria-label={`选项 ${String.fromCharCode(65 + i)}`}
                  required
                  maxLength={200}
                  value={o}
                  readOnly={type === "boolean"}
                  onChange={(e) =>
                    setOptions(
                      options.map((v, n) => (n === i ? e.target.value : v)),
                    )
                  }
                />
                {options.length > 2 && type !== "boolean" && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`删除选项 ${String.fromCharCode(65 + i)}`}
                    onClick={() => {
                      setOptions(options.filter((_, n) => n !== i));
                      setCorrect([]);
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 8 && type !== "boolean" && (
              <button
                type="button"
                className="text-link"
                onClick={() => setOptions([...options, ""])}
              >
                <Plus size={15} />
                添加选项
              </button>
            )}
          </fieldset>
        )}
        {type === "understanding" && (
          <div className="notice">
            使用三级理解度：已经理解、基本理解、需要再讲。
          </div>
        )}
        {type === "exit" && (
          <div className="notice">
            学生填写学习收获、仍有的疑问，并选择课堂难度。
          </div>
        )}
        {type === "ai" && (
          <>
            <label>
              给 AI 的任务指令
              <textarea
                rows={3}
                required
                maxLength={2000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            <label>
              每个参与端的提问次数
              <select
                value={aiLimit}
                onChange={(e) => setAiLimit(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} 次
                  </option>
                ))}
              </select>
            </label>
            <p className="form-help">
              学生按任务独立提问，每次最多 1500 字。完成后提交评价或反思。
            </p>
          </>
        )}
        <label>
          所属任务组
          <select
            required
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <p className="form-help">
          整组同时开放，组内由学生自主推进。开放时间在任务组中设置。
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
              <Trash2 size={16} />
              删除草稿
            </Button>
          )}
          <span className="grow" />
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button kind="primary" type="submit" disabled={busy}>
            保存活动
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function AISettings({ notify }) {
  const [config, setConfig] = useState(null),
    [key, setKey] = useState(""),
    [clearKey, setClearKey] = useState(false),
    [busy, setBusy] = useState(false),
    [testing, setTesting] = useState(false),
    [connection, setConnection] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    api("/api/teacher/model")
      .then(setConfig)
      .catch((e) => notify(e.message, true));
  }, []);
  const update = (k, v) => {
    setConfig({ ...config, [k]: v });
    setDirty(true);
    setConnection("");
  };
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      setConfig(
        await api("/api/teacher/model", {
          method: "PUT",
          body: JSON.stringify({ ...config, apiKey: key, clearKey }),
        }),
      );
      setKey("");
      setClearKey(false);
      setDirty(false);
      notify("AI 设置已保存");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setTesting(true);
    try {
      const r = await post("/api/teacher/model/test");
      setConnection(`连接成功 · ${r.latencyMs} ms`);
      notify("模型连接成功");
    } catch (e) {
      setConnection(e.message);
      notify(e.message, true);
    } finally {
      setTesting(false);
    }
  }
  return (
    <section className="page-content settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">让 AI 参与课堂</span>
          <h1>有边界的探究，有依据的反馈。</h1>
          <p>学生在老师发布的任务内提问；老师可以用 AI 整理开放回答。</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="surface settings-form">
          <div className="section-header">
            <h2>
              <Sparkles size={19} />
              模型接入
            </h2>
            <span className="small muted">兼容 OpenAI 格式的接口</span>
          </div>
          {config ? (
            <form className="form-stack" onSubmit={save}>
              <label className="switch-row">
                <span>
                  <strong>开启 AI 辅助</strong>
                  <small>开启后仍需发布 AI 探究活动，学生才能提问。</small>
                </span>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
              </label>
              <label>
                API 地址
                <input
                  type="url"
                  maxLength={300}
                  value={config.baseUrl}
                  onChange={(e) => update("baseUrl", e.target.value)}
                  placeholder="https://你的模型服务/v1"
                />
              </label>
              <label>
                模型名称
                <input
                  maxLength={100}
                  value={config.model}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder="填写服务提供的模型名称"
                />
              </label>
              <label>
                API Key{" "}
                <span className="optional">
                  {config.hasApiKey
                    ? "已保存，留空保持现有密钥"
                    : "无密钥的本地模型可留空"}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={key}
                  maxLength={2000}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={
                    config.hasApiKey ? "••••••••（已保存在服务端）" : "输入密钥"
                  }
                />
              </label>
              {config.hasApiKey && (
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={clearKey}
                    onChange={(e) => {
                      setClearKey(e.target.checked);
                      setDirty(true);
                    }}
                  />
                  清除已保存的密钥
                </label>
              )}
              <details className="capacity-settings">
                <summary>
                  <Settings2 size={17} />
                  并发与用量控制
                  <ChevronDown size={16} />
                </summary>
                <div className="form-grid">
                  <label>
                    同时处理数
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={config.concurrency}
                      onChange={(e) =>
                        update("concurrency", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    最多排队数
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={config.maxQueue}
                      onChange={(e) =>
                        update("maxQueue", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    每次最大输出 Token
                    <input
                      type="number"
                      min={100}
                      max={2000}
                      step={100}
                      value={config.maxTokens}
                      onChange={(e) =>
                        update("maxTokens", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <p className="form-help">
                  按模型服务的配额调整。每端一次只处理一条提问；等候区满时直接提示稍后重试。
                </p>
              </details>
              <div className="button-row">
                <Button type="submit" kind="primary" disabled={busy || testing}>
                  {busy ? "保存中…" : "保存设置"}
                </Button>
                <Button
                  type="button"
                  disabled={busy || testing || dirty || !config.configured}
                  onClick={test}
                >
                  {testing ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Wifi size={16} />
                  )}
                  测试连接
                </Button>
              </div>
              <p className="form-help">
                测试连接会向已保存的模型发送一次简短请求，可能产生服务费用。
                {dirty ? "请先保存修改。" : ""}
              </p>
              {connection && <div className="notice">{connection}</div>}
            </form>
          ) : (
            <Empty title="正在读取设置" />
          )}
        </section>
        <aside className="settings-aside">
          <span className="eyebrow">两种课堂用法</span>
          <h2>
            先有教学任务，
            <br />
            再让 AI 加入。
          </h2>
          <div className="usage-step">
            <span>01</span>
            <div>
              <h3>学生探究</h3>
              <p>
                发布 AI
                探究任务，限制时间和提问次数。学生阅读回答后，提交自己的判断与反思。
              </p>
            </div>
          </div>
          <div className="usage-step">
            <span>02</span>
            <div>
              <h3>教师分析</h3>
              <p>
                收到文字反馈后，生成主要观点、待核实的误解和追问建议。只发送题目与回答样本，不附带昵称、学校或班级字段。
              </p>
            </div>
          </div>
          <div className="aside-note">
            <CheckCircle2 size={20} />
            <p>AI 停用或请求失败时，普通答题、统计和数据导出仍然可用。</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
function Student({ notify }) {
  const [state, setState] = useState(null),
    [loading, setLoading] = useState(true),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("code") ?? "",
    ),
    [studentView, setStudentView] = useState("tasks"),
    [profileOpen, setProfileOpen] = useState(false),
    [questionOpen, setQuestionOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef(state);
  ref.current = state;
  const refresh = async () => {
    try {
      const data = await api(
        `/api/student/state${code ? `?code=${encodeURIComponent(code)}` : ""}`,
      );
      setState(data.room ? data : null);
    } catch (e) {
      if (e.status === 401) setState(null);
      else notify(e.message, true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  const connected = useRealtime(state?.room.id, "student", refresh);
  useEffect(() => {
    if (!state?.room.id) return;
    const heartbeat = () => post("/api/student/heartbeat").catch(() => {});
    heartbeat();
    const timer = setInterval(heartbeat, 25000);
    return () => clearInterval(timer);
  }, [state?.room.id]);
  useEffect(() => {
    if (
      !state?.groups
        ?.flatMap((g) => g.activities)
        .flatMap((a) => a.jobs ?? [])
        .some((j) => ["queued", "running"].includes(j.status))
    )
      return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [
    state?.groups
      ?.flatMap((g) => g.activities)
      .flatMap((a) => a.jobs ?? [])
      .map((j) => `${j.id}:${j.status}`)
      .join(","),
  ]);
  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/api/student/questions", { content: question });
      setQuestion("");
      setQuestionOpen(false);
      notify("问题已发送给老师");
      refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="loading-page">
        <Loader2 className="spin" />
        正在连接课堂
      </div>
    );
  return (
    <div className="student-shell">
      <header className="student-topbar">
        <Brand />
        {state && (
          <span className={`connection ${connected ? "" : "offline"}`}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}{" "}
            {connected ? "已连接课堂" : "正在重连"}
          </span>
        )}
      </header>
      {!state ? (
        <JoinForm
          initialCode={code}
          notify={notify}
          onJoined={(data) => {
            setCode(data.room.code);
            history.replaceState(null, "", `/join?code=${data.room.code}`);
            setState(data);
          }}
        />
      ) : (
        <main className="student-main">
          <div className="student-lesson">
            <span className="subject-tag">{state.room.subject}</span>
            <span className="muted small">课堂 {state.room.code}</span>
            <h1>{state.room.title}</h1>
            <p>
              {state.participant.displayName} ·{" "}
              {MODES[state.participant.mode]}
            </p>
          </div>
          <div className="student-role-banner">
            <span>
              <Radio size={16} /> 学生参与端
            </span>
            <small>阅读教学资源，完成当前项目并提交反馈</small>
          </div>
          {state.room.status !== "ended" &&
            state.collection.fields.length > 0 && (
              <button
                className="text-link profile-edit-trigger"
                onClick={() => setProfileOpen(true)}
              >
                <Pencil size={14} />
                我的参与信息
              </button>
            )}
          {state.showStudentStats && (
            <div
              className="student-view-tabs"
              role="tablist"
              aria-label="课堂视图"
            >
              <button
                role="tab"
                aria-selected={studentView === "tasks"}
                onClick={() => setStudentView("tasks")}
              >
                我的任务
              </button>
              <button
                role="tab"
                aria-selected={studentView === "stats"}
                onClick={() => setStudentView("stats")}
              >
                课堂统计
              </button>
            </div>
          )}
          {state.missingProfile?.length > 0 && state.room.status !== "ended" ? (
            <section className="surface profile-required">
              <h2>补充参与信息</h2>
              <ProfileEditor state={state} onSaved={setState} notify={notify} />
            </section>
          ) : state.showStudentStats && studentView === "stats" ? (
            <StatisticsPanel roomId={state.room.id} audience="student" />
          ) : state.room.status === "ended" ? (
            <section className="surface student-wait">
              <span className="success-orbit">
                <CheckCircle2 size={40} />
              </span>
              <h2>这节课，我们一起完成了。</h2>
              <p>你的反馈已保存。谢谢你的思考与参与！</p>
              <Button
                onClick={() => {
                  setState(null);
                  setCode("");
                  history.replaceState(null, "", "/join");
                }}
              >
                加入另一节课堂
              </Button>
            </section>
          ) : !state.groups?.some((g) => g.activities.length) ? (
            <section className="surface student-wait">
              <div className="waiting-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="eyebrow">已经就位</span>
              <h2>等老师开放第一组任务</h2>
              <p>保持页面打开，新的任务组会自动出现。</p>
            </section>
          ) : (
            <StudentTasks
              groups={state.groups}
              roomId={state.room.id}
              notify={notify}
              refresh={refresh}
              ActivityComponent={StudentActivity}
              markOpen={(activityId) =>
                post(`/api/student/activities/${activityId}/open`)
              }
            />
          )}
          {state.room.status !== "ended" && (
            <button
              className="question-trigger"
              onClick={() => setQuestionOpen(true)}
            >
              <MessageCircle size={19} />
              <span>有疑问？问问老师</span>
              <ChevronRight size={17} />
            </button>
          )}
          {state.questions.length > 0 && (
            <details className="my-questions">
              <summary>我提过的问题 · {state.questions.length}</summary>
              {state.questions.map((q) => (
                <div key={q.id}>
                  <p>{q.content}</p>
                  <span>{q.answered ? "老师已回应" : "已发送给老师"}</span>
                </div>
              ))}
            </details>
          )}
          <div className="student-foot">无需账号 · 回答随提交自动保存</div>
        </main>
      )}
      {profileOpen && (
        <Modal title="我的参与信息" onClose={() => setProfileOpen(false)}>
          <div className="modal-body">
            <ProfileEditor
              state={state}
              notify={notify}
              onClose={() => setProfileOpen(false)}
              onSaved={(data) => {
                setState(data);
                setProfileOpen(false);
              }}
            />
          </div>
        </Modal>
      )}
      {questionOpen && (
        <Modal title="向老师提问" onClose={() => setQuestionOpen(false)}>
          <form className="modal-body form-stack" onSubmit={ask}>
            <label>
              你的问题
              <textarea
                autoFocus
                required
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                placeholder="哪里还没有弄明白？"
              />
            </label>
            <p className="form-help">只有老师可以看到你的问题。</p>
            <Button type="submit" kind="primary" disabled={busy}>
              <Send size={16} />
              发送给老师
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function JoinForm({ initialCode, onJoined, notify }) {
  const [code, setCode] = useState(initialCode),
    [profile, setProfile] = useState({}),
    [options, setOptions] = useState(null),
    [optionsError, setOptionsError] = useState(""),
    [configTick, setConfigTick] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setOptions(null);
    setOptionsError("");
    if (!/^\d{6}$/.test(code)) return;
    let active = true;
    api(`/api/join/options?code=${encodeURIComponent(code)}`)
      .then((d) => {
        if (active) setOptions(d);
      })
      .catch((e) => {
        if (active) setOptionsError(e.message);
      });
    return () => {
      active = false;
    };
  }, [code, configTick]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      onJoined(
        await post("/api/join", {
          code,
          profile,
          // The student entry currently exposes individual participation only.
          // Keep the server's group/class modes available for existing records
          // and future teacher-side workflows without presenting them here.
          mode: "individual",
        }),
      );
    } catch (e) {
      notify(e.message, true);
      setConfigTick((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="join-main">
      <div className="join-heading">
        <span className="join-symbol">
          <Radio size={30} />
        </span>
        <span className="eyebrow">把你的想法，带进课堂</span>
        <h1>加入正在发生的课堂</h1>
        <p>输入老师分享的 6 位课堂码。</p>
      </div>
      <form className="surface join-form form-stack" onSubmit={submit}>
        <label>
          课堂码
          <input
            className="code-input"
            autoFocus={!initialCode}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setProfile({});
            }}
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            required
          />
        </label>
        {options && (
          <section className="join-collection">
            <h2>{options.title}</h2>
            <ProfileFields
              collection={options.collection}
              value={profile}
              onChange={setProfile}
            />
          </section>
        )}
        {optionsError && (
          <div>
            <p className="notice" role="alert">
              {optionsError}
            </p>
            <button
              className="btn plain"
              type="button"
              onClick={() => setConfigTick((n) => n + 1)}
            >
              重新读取课堂
            </button>
          </div>
        )}
        <Button kind="primary" type="submit" disabled={busy || !options}>
          {busy ? (
            <Loader2 className="spin" size={18} />
          ) : (
            <ArrowUpRight size={18} />
          )}
          加入课堂
        </Button>
        <p className="join-privacy">
          无需注册账号。仅采集老师开启的信息，当前会话内自动关联后续回答。
        </p>
      </form>
      <a href="/" className="text-link teacher-entry">
        我是老师 <ArrowUpRight size={15} />
      </a>
    </main>
  );
}
function StudentActivity({ a, roomId, notify, refresh }) {
  const draftKey = `tongpin-draft:${roomId}:${a.id}`;
  const [savedDraft] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") ?? {};
    } catch {
      return {};
    }
  });
  const [choices, setChoices] = useState(
      a.answer?.choices ?? savedDraft.choices ?? [],
    ),
    [text, setText] = useState(a.answer?.text ?? savedDraft.text ?? ""),
    [takeaway, setTakeaway] = useState(
      a.answer?.takeaway ?? savedDraft.takeaway ?? "",
    ),
    [question, setQuestion] = useState(
      a.answer?.question ?? savedDraft.question ?? "",
    ),
    [difficulty, setDifficulty] = useState(
      a.answer?.difficulty ?? savedDraft.difficulty ?? 3,
    ),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      if (a.answer) sessionStorage.removeItem(draftKey);
      else
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ choices, text, takeaway, question, difficulty }),
        );
    } catch {}
  }, [draftKey, choices, text, takeaway, question, difficulty, a.answer]);
  const closed = a.status !== "live" || a.answer;
  function select(i) {
    if (closed) return;
    const v = String(i);
    setChoices(
      a.type === "multiple"
        ? choices.includes(v)
          ? choices.filter((c) => c !== v)
          : [...choices, v]
        : [v],
    );
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(
        `/api/student/activities/${a.id}/answer`,
        a.type === "exit"
          ? { takeaway, question, difficulty }
          : ["text", "ai"].includes(a.type)
            ? { text }
            : { choices },
      );
      await refresh();
      notify("反馈已提交");
    } catch (e) {
      notify(e.message, true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface student-activity">
      <div className="activity-panel-top">
        <span className="type-pill">{TYPES[a.type]}</span>
        <span className={`status ${a.status}`}>{STATUS[a.status]}</span>
        {a.deadline && a.status === "live" && (
          <Countdown deadline={a.deadline} onExpire={refresh} />
        )}
      </div>
      <h2>{a.title}</h2>
      {a.description && <p className="question-description">{a.description}</p>}
      {a.status === "paused" && (
        <div className="notice">
          <Pause size={16} />
          老师暂停了本组，你可以先查看其他已开放的任务组。
        </div>
      )}
      {a.status === "closed" && !a.answer && (
        <div className="notice">本组已结束，你可以查看其他已开放的任务组。</div>
      )}
      {a.type === "ai" && (
        <StudentAI a={a} roomId={roomId} refresh={refresh} notify={notify} />
      )}
      {a.answer && (
        <div className="submitted-banner">
          <CheckCircle2 size={20} />
          <div>
            <strong>已收到你的反馈</strong>
            <span>已保存，可以继续下一项或回看其他任务。</span>
          </div>
        </div>
      )}
      <form className="student-answer-form" onSubmit={submit}>
        {a.options.length > 0 && (
          <div className="student-options" role="group" aria-label="回答选项">
            {a.options.map((o, i) => (
              <button
                type="button"
                key={i}
                className={`student-option ${choices.includes(String(i)) ? "selected" : ""}`}
                disabled={!!closed}
                onClick={() => select(i)}
                aria-pressed={choices.includes(String(i))}
              >
                <span className="option-letter">
                  {a.type === "understanding"
                    ? ["✓", "?", "!"][i]
                    : String.fromCharCode(65 + i)}
                </span>
                <span>{o}</span>
                {choices.includes(String(i)) && <CheckCircle2 size={20} />}
              </button>
            ))}
            {a.type === "multiple" && (
              <p className="form-help">这道题可以选择多个答案。</p>
            )}
          </div>
        )}
        {["text", "ai"].includes(a.type) && (
          <label>
            {a.type === "ai" ? "你的评价或反思" : "你的回答"}
            <textarea
              required
              rows={4}
              maxLength={2000}
              value={text}
              disabled={!!closed}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                a.type === "ai"
                  ? "AI 的哪一点有帮助？哪些内容还需要核实？"
                  : "用自己的话说说你的想法…"
              }
            />
            <span className="field-counter">{text.length} / 2000</span>
          </label>
        )}
        {a.type === "exit" && (
          <div className="form-stack">
            <label>
              今天最重要的收获
              <textarea
                rows={3}
                required
                maxLength={1000}
                disabled={!!closed}
                value={takeaway}
                onChange={(e) => setTakeaway(e.target.value)}
              />
            </label>
            <label>
              我还没有弄明白的问题 <span className="optional">选填</span>
              <textarea
                rows={2}
                maxLength={1000}
                disabled={!!closed}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <fieldset className="difficulty-field">
              <legend>这节课的难度</legend>
              <div>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    disabled={!!closed}
                    className={difficulty === n ? "selected" : ""}
                    onClick={() => setDifficulty(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p>
                <span>很轻松</span>
                <span>有挑战</span>
              </p>
            </fieldset>
          </div>
        )}
        {!closed && (
          <Button
            kind="primary"
            type="submit"
            disabled={busy || (a.options.length > 0 && !choices.length)}
          >
            {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            提交反馈
          </Button>
        )}
      </form>
      {a.revealed && a.results && (
        <section className="student-results">
          <h3>
            老师公布的结果 <span>{a.results.submitted} 份反馈</span>
          </h3>
          {a.correct?.length > 0 && (
            <p className="green-text">
              参考答案：{a.correct.map((c) => a.options[Number(c)]).join("；")}
            </p>
          )}
          {a.results.distribution.map((d, i) => (
            <div className="result-row" key={i}>
              <span>{d.label}</span>
              <strong>{d.percent}%</strong>
              <div className="distribution-bar">
                <i style={{ width: `${d.percent}%` }} />
              </div>
            </div>
          ))}
          {!a.results.distribution.length && (
            <p className="muted small">
              文字回答由老师组织讨论，其他同学的原文不会公开展示。
            </p>
          )}
        </section>
      )}
    </section>
  );
}
function StudentAI({ a, roomId, refresh, notify }) {
  const draftKey = `tongpin-ai-draft:${roomId}:${a.id}`;
  const [input, setInput] = useState(() => {
      try {
        return sessionStorage.getItem(draftKey) ?? "";
      } catch {
        return "";
      }
    }),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      if (a.answer || !input) sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, input);
    } catch {}
  }, [draftKey, input, a.answer]);
  const request = useRef(null);
  const jobs = a.jobs ?? [],
    pending = jobs.some((j) => ["queued", "running"].includes(j.status)),
    available = Math.max(0, a.aiLimit - jobs.length);
  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    if (!request.current || request.current.question !== input)
      request.current = {
        requestId:
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        question: input,
      };
    try {
      await post(`/api/student/activities/${a.id}/ai`, request.current);
      request.current = null;
      setInput("");
      await refresh();
    } catch (e) {
      notify(e.message, true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="student-ai">
      <div className="ai-box-header">
        <Sparkles size={19} />
        <strong>课堂 AI 助手</strong>
        <span>还可提问 {available} 次</span>
      </div>
      {jobs.length === 0 && (
        <p className="small muted">
          围绕老师的任务提问。每次独立提问，需要时请补充背景；不要填写个人隐私。
        </p>
      )}
      <div className="ai-conversation">
        {jobs.map((j, i) => (
          <div className="ai-turn" key={j.id}>
            <div className="ai-question">
              <span>提问 {i + 1}</span>
              <p>{j.question}</p>
            </div>
            <div className="ai-answer">
              {["queued", "running"].includes(j.status) ? (
                <p className="queue-state">
                  <Loader2 size={17} className="spin" />
                  {j.status === "queued"
                    ? "已经排队，请保持页面打开…"
                    : "AI 正在思考…"}
                </p>
              ) : j.status === "completed" ? (
                <>
                  <span>
                    <Sparkles size={14} />
                    AI 的回答
                  </span>
                  <p>{j.answer}</p>
                </>
              ) : (
                <p className="muted">{j.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {a.status === "live" && available > 0 && !a.answer && (
        <form className="ai-ask-form" onSubmit={ask}>
          <label className="sr-only" htmlFor="ai-question">
            向 AI 提问
          </label>
          <textarea
            id="ai-question"
            rows={3}
            maxLength={1500}
            required
            value={input}
            disabled={busy || pending}
            onChange={(e) => setInput(e.target.value)}
            placeholder="你想让 AI 帮你弄懂什么？"
          />
          <Button kind="ai" type="submit" disabled={busy || pending}>
            {pending ? "等待当前请求完成" : busy ? "正在提交…" : "向 AI 提问"}
            <Send size={15} />
          </Button>
        </form>
      )}
      <p className="ai-disclaimer">
        AI 可能出错，请结合课堂知识核实，再形成自己的判断。
      </p>
    </div>
  );
}
