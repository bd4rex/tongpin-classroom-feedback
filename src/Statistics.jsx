import React, { useEffect, useRef, useState } from "react";
import {
  Maximize,
  ArrowLeft,
  BarChart3,
  Users,
  MapPin,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { api } from "./api.js";
import { ParticipantRecords } from "./Collection.jsx";

export function WordCloud({ cloud }) {
  if (!cloud) return <p className="chart-empty">词云未开启。</p>;
  const max = Math.max(1, ...cloud.terms.map((t) => t.count));
  return (
    <>
      <div className="word-cloud" aria-label="回答关键词词云">
        {cloud.terms.length ? (
          cloud.terms.map((t, i) => (
            <span
              key={t.text}
              className={`word-color-${i % 5}`}
              style={{ fontSize: `${15 + 25 * Math.sqrt(t.count / max)}px` }}
              title={`${t.text}：${t.count} 份回答提及`}
            >
              {t.text}
              <small>{t.count}</small>
            </span>
          ))
        ) : (
          <p className="chart-empty">收到文字反馈后，这里会出现关键词。</p>
        )}
      </div>
      <p className="chart-note">
        {cloud.sampled
          ? `抽样 ${cloud.sampleSize} / ${cloud.totalResponses} 份回答`
          : `基于 ${cloud.sampleSize} 份回答`}{" "}
        · 同一回答中的重复词只计一次
      </p>
    </>
  );
}
export function StatisticsPanel({ roomId, audience = "teacher" }) {
  const [data, setData] = useState(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [refreshId, setRefreshId] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true,
      timer;
    const load = async () => {
      if (inFlight.current) {
        timer = setTimeout(load, 300);
        return;
      }
      inFlight.current = true;
      try {
        const base =
          audience === "student"
            ? "/api/student/dashboard"
            : `/api/teacher/classrooms/${roomId}/dashboard`;
        const params = new URLSearchParams({
          activityId: selected,
          ...(audience === "screen" ? { shared: "1" } : {}),
        });
        const d = await api(`${base}?${params}`);
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active) {
          setData(null);
          setError(e.message);
        }
      } finally {
        inFlight.current = false;
        if (active)
          timer = setTimeout(
            load,
            audience === "student" ? 6000 + Math.random() * 1500 : 3000,
          );
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [roomId, audience, selected, refreshId]);
  if (!data)
    return (
      <div className="surface statistics-loading">
        <BarChart3 size={28} />
        <p>{error || "正在汇总课堂反馈…"}</p>
        {error && (
          <button
            className="btn secondary"
            onClick={() => setRefreshId((n) => n + 1)}
          >
            重新加载
          </button>
        )}
      </div>
    );
  const overview = data.overview,
    task = data.selected;
  return (
    <div className={`statistics-panel ${audience}`}>
      <div className="statistics-heading">
        <div>
          <span className="eyebrow">课堂中的每一份声音</span>
          <h2>{audience === "screen" ? data.room.title : "课堂数据统计"}</h2>
          <p>
            {audience === "screen"
              ? `${data.room.subject} · 课堂码 ${data.room.code}`
              : "参与、进度与观点，随课堂持续更新"}
          </p>
        </div>
        <div className="statistics-fresh">
          <span className="live-dot" />
          自动更新{" "}
          <time>
            {new Date(data.updatedAt).toLocaleTimeString("zh-CN", {
              hour12: false,
            })}
          </time>
          <button
            className="icon-btn"
            aria-label="刷新统计"
            onClick={() => setRefreshId((n) => n + 1)}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <div className="statistics-metrics">
        {[
          [
            Users,
            "参与端",
            overview.participants,
            `当前在线 ${overview.online} 端`,
          ],
          [
            MapPin,
            "城市 / 学校",
            `${overview.cities} / ${overview.schools}`,
            "按现场填写的信息汇总",
          ],
          [
            BarChart3,
            "已提交反馈",
            overview.answers,
            `${overview.submittedParticipants} 端至少提交一次`,
          ],
          [
            MessageSquare,
            "已开放任务",
            overview.tasks,
            `${data.groups.length} 个任务组`,
          ],
        ].map(([Icon, title, value, note]) => (
          <article className="surface stat-metric" key={title}>
            <span>
              <Icon size={17} />
              {title}
            </span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="statistics-grid">
        <section className="surface stats-card task-statistics">
          <div className="section-header">
            <h3>任务反馈</h3>
            {audience === "teacher" && (
              <span className="private-badge">教师预览</span>
            )}
          </div>
          {data.activities.length > 0 ? (
            <>
              <label className="stats-task-picker">
                查看任务
                <select
                  aria-label="统计任务"
                  value={task?.id || ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.activities.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.groupTitle} · {a.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="stats-task-title">
                <h3>{task.title}</h3>
                <span>
                  {task.submitted} / {task.total} 端提交
                </span>
              </div>
              {!task.visible ? (
                <div className="chart-empty">
                  老师尚未公布本题结果。提交数量会持续更新。
                </div>
              ) : task.distribution.length ? (
                <div className="stat-bars">
                  {task.distribution.map((d, i) => (
                    <div key={i}>
                      <div>
                        <span>{d.label}</span>
                        <strong>
                          {d.count} <small>端 · {d.percent}%</small>
                        </strong>
                      </div>
                      <i>
                        <b style={{ width: `${d.percent}%` }} />
                      </i>
                    </div>
                  ))}
                </div>
              ) : (
                <WordCloud cloud={task.wordCloud} />
              )}
              <p className="chart-note">
                {audience === "teacher"
                  ? task.revealed
                    ? "本题结果已对学生及大屏开放。"
                    : "当前为教师预览；在活动反馈中展示本题结果后，大屏和学生端才能看到。"
                  : "展示已公布的汇总，不显示个人回答或身份信息。"}
              </p>
            </>
          ) : (
            <p className="chart-empty">老师发布第一组任务后，这里开始统计。</p>
          )}
        </section>
        <section className="surface stats-card">
          <div className="section-header">
            <h3>任务组进度</h3>
            <span className="small muted">按参与端</span>
          </div>
          <div className="statistics-groups">
            {data.groups.map((g) => (
              <article key={g.id}>
                <div>
                  <h4>{g.title}</h4>
                  <strong>
                    {g.progress.completed}
                    <small> / {g.progress.total} 完成</small>
                  </strong>
                </div>
                <div className="stats-progress">
                  <i
                    style={{
                      width: `${g.progress.total ? (g.progress.completed / g.progress.total) * 100 : 0}%`,
                    }}
                  />
                  <i
                    style={{
                      width: `${g.progress.total ? (g.progress.inProgress / g.progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p>
                  进行中 {g.progress.inProgress} · 未开始{" "}
                  {g.progress.notStarted} · {g.progress.taskCount} 项任务
                </p>
              </article>
            ))}
            {!data.groups.length && (
              <p className="chart-empty">等待开放任务组</p>
            )}
          </div>
        </section>
        <section className="surface stats-card statistics-regions">
          <div className="section-header">
            <h3>城市与学校分布</h3>
            <span className="small muted">
              {data.regionCount} 个学校／班级分组
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>城市</th>
                  <th>学校 / 班级</th>
                  <th>参与端</th>
                  <th>在线</th>
                </tr>
              </thead>
              <tbody>
                {data.regions.map((r, i) => (
                  <tr key={i}>
                    <td>{r.city || "未填写"}</td>
                    <td>
                      <strong>{r.school}</strong>
                      <span>{r.className}</span>
                    </td>
                    <td>{r.participants}</td>
                    <td>{r.online}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.regions.length && <p className="chart-empty">等待学生加入</p>}
          {data.regionCount > 50 && (
            <p className="chart-note">显示参与端最多的 50 个分组。</p>
          )}
        </section>
      </div>
      {audience === "teacher" && <ParticipantRecords roomId={roomId} />}
      <p className="statistics-footer">
        每个参与端计一份反馈，不折算为个人成绩。统计不依赖 AI。
      </p>
    </div>
  );
}
export function Projection({ roomId, notify }) {
  return (
    <main className="projection">
      <header className="projection-bar">
        <a href="/">
          <ArrowLeft size={17} />
          教师工作台
        </a>
        <span className="projection-title">
          <strong>同频 · 实时课堂监看</strong>
          <small>数据随课堂进程自动更新</small>
        </span>
        <button
          className="btn plain"
          onClick={async () => {
            try {
              if (document.fullscreenElement) await document.exitFullscreen();
              else await document.documentElement.requestFullscreen();
            } catch {
              notify("当前浏览器未进入全屏，可使用浏览器的全屏功能", true);
            }
          }}
        >
          <Maximize size={17} />
          全屏显示
        </button>
      </header>
      <StatisticsPanel roomId={roomId} audience="screen" />
    </main>
  );
}
