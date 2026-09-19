import React, { useState, useEffect } from "react";
import {
  Save,
  Download,
  UserRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "./api.js";

export function ProfileFields({ collection, value, onChange }) {
  const fields = collection?.fields.filter((f) => f.enabled !== false) || [];
  const cityEnabled = fields.some((f) => f.id === "city");
  const catalog = collection?.schools || [];
  const set = (id, text) => {
    const next = { ...value, [id]: text };
    if (
      id === "city" &&
      catalog.length &&
      !catalog.some((s) => s.city === text && s.school === value.school)
    )
      next.school = "";
    onChange(next);
  };
  if (!fields.length)
    return (
      <p className="form-help">本节课无需填写个人信息，系统将生成参与编号。</p>
    );
  return (
    <div className="profile-fields">
      {fields.map((f) => {
        const options =
          f.id === "city"
            ? [...new Set(catalog.map((s) => s.city))]
            : f.id === "school"
              ? [
                  ...new Set(
                    catalog
                      .filter(
                        (s) =>
                          !cityEnabled || !value.city || s.city === value.city,
                      )
                      .map((s) => s.school),
                  ),
                ]
              : [];
        return (
          <label key={f.id}>
            {f.label}
            <span className="optional">{f.required ? "必填" : "选填"}</span>
            {options.length ? (
              <select
                aria-label={f.label}
                required={f.required}
                value={value[f.id] || ""}
                onChange={(e) => set(f.id, e.target.value)}
              >
                <option value="">请选择{f.label}</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={f.label}
                required={f.required}
                maxLength={f.maxLength}
                value={value[f.id] || ""}
                onChange={(e) => set(f.id, e.target.value)}
                autoComplete="off"
                placeholder={
                  f.id === "nickname"
                    ? "留空自动生成参与编号"
                    : `填写${f.label}`
                }
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
export function CollectionSettings({ initial, onSave, onClose, notify }) {
  const [config, setConfig] = useState(initial),
    [schools, setSchools] = useState(
      initial.schools.map((s) => `${s.city}｜${s.school}`).join("\n"),
    ),
    [hidden, setHidden] = useState(initial.display.hiddenWords.join("\n")),
    [busy, setBusy] = useState(false);
  const toggle = (id, key, v) =>
    setConfig((c) => ({
      ...c,
      fields: c.fields.map((f) =>
        f.id === id
          ? {
              ...f,
              [key]: v,
              ...(key === "enabled" && !v ? { required: false } : {}),
            }
          : f,
      ),
    }));
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const catalog = schools
        .split(/\r?\n/)
        .filter((s) => s.trim())
        .map((row, i) => {
          const parts = row.split(/[｜|,，\t]/).map((s) => s.trim());
          if (parts.length !== 2 || parts.some((s) => !s))
            throw new Error(`名单第 ${i + 1} 行请填写“城市｜学校”`);
          return { city: parts[0], school: parts[1] };
        });
      await onSave({
        ...config,
        schools: catalog,
        display: {
          ...config.display,
          hiddenWords: hidden
            .split(/[\n,，]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="modal-body form-stack collection-settings" onSubmit={save}>
      <p className="form-help">
        勾选后出现在学生加入页。填写一次，当前会话内的后续回答自动关联，无需创建学生账号。
      </p>
      <div className="field-config-heading">
        <span>采集信息</span>
        <span>显示</span>
        <span>必填</span>
      </div>
      {config.fields.map((f) => (
        <div className="field-config-row" key={f.id}>
          <strong>{f.label}</strong>
          <label>
            <span className="sr-only">显示{f.label}</span>
            <input
              type="checkbox"
              checked={f.enabled}
              onChange={(e) => toggle(f.id, "enabled", e.target.checked)}
            />
          </label>
          <label>
            <span className="sr-only">{f.label}必填</span>
            <input
              type="checkbox"
              disabled={!f.enabled}
              checked={f.required}
              onChange={(e) => toggle(f.id, "required", e.target.checked)}
            />
          </label>
        </div>
      ))}
      <label>
        城市与学校选项
        <textarea
          aria-label="城市与学校选项"
          rows={4}
          value={schools}
          onChange={(e) => setSchools(e.target.value)}
          placeholder={
            "每行一所学校，例如：\n南京市｜示例小学\n苏州市｜另一所示例小学"
          }
        />
      </label>
      <p className="form-help">
        最多 200
        行。填写名单后，学生从选项中选择，学校随城市筛选；留空时由学生填写。
      </p>
      <div className="collection-display-options">
        <label className="check-label">
          <input
            type="checkbox"
            checked={config.display.studentStats}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                display: { ...c.display, studentStats: e.target.checked },
              }))
            }
          />
          向学生开放课堂统计
        </label>
        <p className="form-help">
          展示参与规模和任务进度；答案分布与词云随每题“展示本题结果”开放。大屏遵循相同的结果公布范围。
        </p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={config.display.wordCloud}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                display: { ...c.display, wordCloud: e.target.checked },
              }))
            }
          />
          在统计中启用词云
        </label>
        <label>
          词云排除词
          <textarea
            rows={2}
            value={hidden}
            onChange={(e) => setHidden(e.target.value)}
            placeholder="不希望进入词云的词语，一行一个"
          />
        </label>
      </div>
      <p className="form-help">
        姓名、学号仅教师可查看，不进入大屏和学生汇总。设置变更后，已加入的学生只需补填新增必填项；已保存的信息不会因取消勾选而删除。
      </p>
      <div className="button-row end">
        <button className="btn secondary" type="button" onClick={onClose}>
          取消
        </button>
        <button className="btn primary" disabled={busy}>
          <Save size={16} />
          {busy ? "保存中…" : "保存采集与展示设置"}
        </button>
      </div>
    </form>
  );
}
export function ProfileEditor({ state, onSaved, onClose, notify }) {
  const [value, setValue] = useState({
      ...state.participant,
      school:
        state.participant.school === "未填写学校"
          ? ""
          : state.participant.school,
      className:
        state.participant.className === "未填写班级"
          ? ""
          : state.participant.className,
    }),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack profile-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const data = await api("/api/student/profile", {
            method: "PUT",
            body: JSON.stringify(value),
          });
          onSaved(data);
          notify("参与信息已保存，后续回答会自动关联");
        } catch (e) {
          notify(e.message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="form-help">
        {state.missingProfile?.length
          ? `老师需要补充：${state.missingProfile.join("、")}。`
          : "信息随当前课堂会话保存，返回页面后无需重复填写。"}
      </p>
      <ProfileFields
        collection={state.collection}
        value={value}
        onChange={setValue}
      />
      <div className="button-row end">
        {onClose && (
          <button className="btn secondary" type="button" onClick={onClose}>
            取消
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          <Save size={16} />
          保存参与信息
        </button>
      </div>
    </form>
  );
}
export function ParticipantRecords({ roomId }) {
  const [open, setOpen] = useState(false),
    [offset, setOffset] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    async function refresh() {
      try {
        const d = await api(
          `/api/teacher/classrooms/${roomId}/participants?offset=${offset}`,
        );
        if (active) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }
    refresh();
    const t = setInterval(refresh, 6000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [roomId, offset, open]);
  return (
    <details
      className="surface participant-records"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <UserRound size={18} />
        参与信息记录<span>仅教师可见</span>
      </summary>
      {open && (
        <div className="participant-record-body">
          <div className="button-row">
            <p className="muted small">
              {data?.total ?? 0} 个参与端 · 不含预置名单
            </p>
            <a
              className="btn secondary"
              href={`/api/teacher/classrooms/${roomId}/participants?format=csv`}
            >
              <Download size={15} />
              导出参与信息
            </a>
          </div>
          {error && <p role="alert">{error}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>姓名／参与编号</th>
                  <th>学号</th>
                  <th>城市</th>
                  <th>学校</th>
                  <th>班级</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name || p.nickname}
                      <small>{p.name ? p.nickname : ""}</small>
                    </td>
                    <td>{p.studentNo || "—"}</td>
                    <td>{p.city || "—"}</td>
                    <td>{p.school || "—"}</td>
                    <td>{p.className || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.total === 0 && <p className="muted">还没有学生加入。</p>}
          <div className="button-row end">
            <button
              className="btn plain"
              disabled={!offset}
              onClick={() => setOffset((n) => Math.max(0, n - 50))}
            >
              <ChevronLeft size={16} />
              上一页
            </button>
            <span className="small muted">
              第 {Math.floor(offset / 50) + 1} 页
            </span>
            <button
              className="btn plain"
              disabled={!data || offset + 50 >= data.total}
              onClick={() => setOffset((n) => n + 50)}
            >
              下一页
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
