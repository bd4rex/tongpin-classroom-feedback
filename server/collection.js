// Stable field IDs are also used in the join form and structured exports.
export const PROFILE_FIELDS = [
  { id: "city", label: "城市", type: "city", maxLength: 40 },
  { id: "school", label: "学校", type: "school", maxLength: 80 },
  { id: "className", label: "班级", type: "text", maxLength: 60 },
  { id: "studentNo", label: "学号", type: "text", maxLength: 40 },
  { id: "name", label: "姓名", type: "text", maxLength: 40 },
  { id: "nickname", label: "昵称", type: "text", maxLength: 40 },
];
const fail = (message) => {
  throw Object.assign(new Error(message), { statusCode: 400 });
};
export function defaultCollection() {
  return {
    schemaVersion: 1,
    fields: PROFILE_FIELDS.map((f) => ({
      ...f,
      enabled: ["school", "className", "nickname"].includes(f.id),
      required: false,
    })),
    schools: [],
    display: { studentStats: false, wordCloud: true, hiddenWords: [] },
  };
}
export function collectionConfig(room) {
  return room.collection_config
    ? JSON.parse(room.collection_config)
    : defaultCollection();
}
function clean(value, label, max) {
  if (typeof value !== "string" || value.trim().length > max)
    fail(`${label}最多 ${max} 个字符`);
  return value.trim();
}
export function normalizeCollection(body) {
  if (!body || !Array.isArray(body.fields)) fail("请选择需要采集的信息项");
  if (
    body.fields.length !== PROFILE_FIELDS.length ||
    new Set(body.fields.map((f) => f?.id)).size !== PROFILE_FIELDS.length
  )
    fail("信息项配置不完整或重复");
  const fields = PROFILE_FIELDS.map((field) => {
    const f = body.fields.find((v) => v?.id === field.id);
    if (!f || typeof f.enabled !== "boolean" || typeof f.required !== "boolean")
      fail("信息项配置不正确");
    return { ...field, enabled: f.enabled, required: f.enabled && f.required };
  });
  if (!Array.isArray(body.schools) || body.schools.length > 200)
    fail("城市学校名单最多 200 行");
  const unique = new Map();
  for (const item of body.schools) {
    const city = clean(item?.city ?? "", "城市", 40),
      school = clean(item?.school ?? "", "学校", 80);
    if (!city || !school) fail("每一行都需要同时填写城市和学校");
    unique.set(JSON.stringify([city, school]), { city, school });
  }
  const display = body.display;
  if (
    !display ||
    typeof display.studentStats !== "boolean" ||
    typeof display.wordCloud !== "boolean"
  )
    fail("展示设置不正确");
  if (!Array.isArray(display.hiddenWords) || display.hiddenWords.length > 100)
    fail("词云排除词最多 100 个");
  const hiddenWords = [
    ...new Set(
      display.hiddenWords.map((w) => clean(w, "排除词", 40)).filter(Boolean),
    ),
  ];
  return {
    schemaVersion: 1,
    fields,
    schools: [...unique.values()],
    display: {
      studentStats: display.studentStats,
      wordCloud: display.wordCloud,
      hiddenWords,
    },
  };
}
export function publicCollection(config) {
  // Hidden field definitions and teacher-only display settings are not exposed.
  const fields = config.fields.filter((f) => f.enabled);
  return {
    schemaVersion: 1,
    fields,
    schools: fields.some((f) => ["city", "school"].includes(f.id))
      ? config.schools
      : [],
  };
}
export function profileOf(p) {
  return {
    city: p.city || "",
    school: p.school === "未填写学校" ? "" : p.school,
    className: p.class_name === "未填写班级" ? "" : p.class_name,
    studentNo: p.student_no || "",
    name: p.name || "",
    nickname: p.nickname || "",
  };
}
export function normalizeProfile(body, config, existing = {}) {
  const profile = {};
  for (const field of config.fields) {
    // Disabling a field stops further collection; previously saved records remain.
    if (!field.enabled) {
      profile[field.id] = existing[field.id] || "";
      continue;
    }
    const value = clean(body[field.id] ?? "", field.label, field.maxLength);
    if (field.required && !value) fail(`请填写${field.label}`);
    profile[field.id] = value;
  }
  const enabled = (id) => config.fields.some((f) => f.id === id && f.enabled);
  if (config.schools.length) {
    if (
      enabled("city") &&
      profile.city &&
      !config.schools.some((s) => s.city === profile.city)
    )
      fail("请选择名单中的城市");
    if (
      enabled("school") &&
      profile.school &&
      !config.schools.some(
        (s) =>
          s.school === profile.school &&
          (!enabled("city") || !profile.city || s.city === profile.city),
      )
    )
      fail("请选择对应城市的学校");
  }
  return profile;
}
export function missingProfile(p, config) {
  const profile = profileOf(p);
  return config.fields
    .filter((f) => f.enabled && f.required && !profile[f.id])
    .map((f) => f.label);
}
