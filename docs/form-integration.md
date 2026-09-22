# 表单扩展接口（0.4.0）

[English](form-integration.en.md)

本页描述已实现的采集与导出接口。已借鉴 QuickForm 任务流程，但尚未接入其在线服务、动态自定义题型、Webhook 或第三方账号；这不是某个外部表单产品的 API 承诺。

## 稳定字段

`server/collection.js` 定义六个字符串字段。学号保持字符串，保留前导零。

| ID          | 含义 | 字符上限 |
| ----------- | ---- | -------- |
| `city`      | 城市 | 40       |
| `school`    | 学校 | 80       |
| `className` | 班级 | 60       |
| `studentNo` | 学号 | 40       |
| `name`      | 姓名 | 40       |
| `nickname`  | 昵称 | 40       |

采集配置 `schemaVersion: 1` 包含完整的六项 `fields`（每项 `id`、`enabled`、`required`）、`schools: [{ city, school }]` 和 `display: { studentStats, wordCloud, hiddenWords }`。字段名称、类型和长度由服务端提供，不接受客户端更改。此配置按课堂保存；没有全局学生名册。

`nickname` 只返回实际填写的昵称，未填写时为空字符串。学生状态、教师参与明细及 JSON 导出的参与记录另提供只读 `displayName`：优先姓名、其次昵称、最后自动参与编号；它不是采集字段，也不参与必填校验。学校字段关闭时，保存的学校名单不约束城市；开启后恢复联动校验。

旧记录升级时，一次性对照参与端 ID 识别原算法生成的“同学 XXXX”，保留原文本、会话和关联回答；新写入使用独立来源标记。学生在升级后显式填写的昵称即使与自动编号相同，也按实际填写值保存。

## 已实现的接口

| 接口                                                       | 权限／作用                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/teacher/classrooms/:id`                          | 教师会话；返回 `collection` 配置及课堂状态                                               |
| `PUT /api/teacher/classrooms/:id/collection`               | 教师会话；提交完整采集配置，已结束课堂不可修改                                           |
| `GET /api/join/options?code=123456`                        | 根据课堂码返回启用的字段和学校选项，不返回参与记录或教师展示设置                         |
| `POST /api/join`                                           | `{ code, mode, profile }`；服务端校验后发放 HttpOnly 学生 Cookie；同课堂已有会话直接恢复 |
| `PUT /api/student/profile`                                 | 学生 Cookie；提交当前表单字段，修改自身记录，不新建参与端                                |
| `GET /api/student/state`                                   | 学生 Cookie；自身参与信息、可访问的任务、`missingProfile` 和 `showStudentStats`          |
| `GET /api/student/dashboard?activityId=...`                | 学生 Cookie；教师开启后可用，仅返回已开放任务汇总，结果受逐题公布控制                    |
| `GET /api/teacher/classrooms/:id/dashboard?activityId=...` | 教师 Cookie；预览统计；追加 `shared=1` 使用与大屏相同的结果公布范围                      |
| `GET /api/teacher/classrooms/:id/participants?offset=0`    | 教师 Cookie；每页 50 条参与明细；`format=csv` 导出全部                                   |
| `GET /api/teacher/classrooms/:id/export?format=json`       | 教师 Cookie；导出 `schemaVersion: 2` 完整记录                                            |

新增的教师备课与按题导出接口：

| 接口 | 权限／作用 |
| --- | --- |
| `POST /api/teacher/classrooms/:id/task-pack/preview` | 教师 Cookie；校验并返回规范任务包，不创建记录 |
| `POST /api/teacher/classrooms/:id/task-pack` | 教师 Cookie；校验整个包后，在事务中创建一个草稿组和全部任务；额外需要 `requestId` |
| `GET /api/teacher/groups/:id/pack` | 教师 Cookie；导出 1–12 项的备课包，只含内容，不含身份、反馈、ID、发布状态或 AI 分析 |
| `GET /api/teacher/classrooms/:id/export?format=csv&activityId=...` | 教师 Cookie；当前课堂单题完整 CSV，不受页面 100 条显示限制；跨课 ID 拒绝 |

备课包为 `{ schemaVersion: 1, group: { title, duration }, activities: [...] }`，不是全课记录的 `schemaVersion: 2`。`duration` 为整组开放秒数（0–7200，0 不限时）；每包 1–12 项，复用现有九种任务与字段校验，不接受任意表单 Schema。两个 POST 接口的请求体上限为 256 KB，其余接口仍为 32 KB。`requestId` 为 1–80 字符的字母、数字或连字符；同一课堂相同编号与内容返回原组，编号相同但内容不同返回 409。幂等记录保存在既有 `meta` 表中，无表结构迁移。单题 JSON 不提供；全课 JSON 导出保持兼容。示例与流程见[备课与回滚](unified-workspace.md)。

### 填空与教师讲解提示（0.4.0）

`type: "fill"` 使用 `blanks: [{ label, reference }]` 定义 1–6 个空。`label` 为必填提示，最多 120 字；`reference` 为教师参考，最多 300 字，可留空。学生提交 `{ blanks: ["第一空", "第二空"] }`，数量必须完全一致，每空去除首尾空格后为 1–300 字。服务端额外生成带提示标签的 `answer.text`，用于现有教师反馈与 CSV；客户端不能伪造该文本。填空不自动计正确率，CSV 的对应字段为“教师讲评”。

任何任务可带 `teacherNotes`（0–3000 字）。备课包、整课复用和教师导出保留填空参考与提示。学生状态只含填空 `label`，公布本题结果后才增加 `blankReferences`，隐藏结果时移除；`teacherNotes` 永不进入学生状态或统计大屏。学生预览也不显示参考答案或教师提示。该新增内容需要 0.4.0 或更高版本，旧版本不支持 `fill`。

`GET /api/teacher/templates` 新增 `ai-everywhere`，返回含 `groups` 和教学分钟建议的整课模板；`POST /api/teacher/classrooms` 传 `templateId: "ai-everywhere"` 原子创建六组十二项草稿，默认年级七年级，分钟数不转成限时。仅创建内容，不发布、不调用 AI、不修改已有课堂。

示例加入请求（须与该课堂启用字段一致）：

```json
{
  "code": "123456",
  "mode": "individual",
  "profile": {
    "city": "示例城市",
    "school": "示例学校",
    "className": "五年级1班",
    "studentNo": "000012",
    "name": "示例学生"
  }
}
```

接口为当前应用的会话接口，未提供第三方服务 API Key 或跨域认证。服务端不再比较 `Origin` 与 `Host`，以兼容校内多入口；写请求仍要求 JSON，Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。不要把学生 Cookie、教师 Cookie 或模型密钥放进外部表单。

## 导出关联与后续适配

JSON 顶层包含 `participants`、`collection`、`room`、`groups`、`activities`、`questions`、`aiInteractions` 等；教师分析位于 `activities[].analysis`。`participants[].id` 与 `activities[].stats.responses[].participant_id`、问题及 AI 互动的 `participant_id` 关联；原始响应中的已有数据库字段保持命名，参与信息规范字段使用上表 ID。导出不包含会话令牌。导出属于教师明细，不能原样用于大屏或学生页。

后续如需适配 QuickForm 外部接口，可在服务端将外部字段映射到稳定 ID，新增题型仍通过任务组发布，并让响应进入现有会话、校验和统计路径。本轮只实现同频标准任务包的导入／导出；QuickForm 数据迁移、任意表单 Schema、Webhook 推送、外部账户绑定和自定义字段设计器未实现。

验证入口：`npm run check`；`test/app.test.js` 覆盖必填／选项校验、关闭字段拒绝新采集、会话复用、后加必填项、导出关联、权限、词云和明细隔离。`npm run test:capacity` 包含六字段采集、任务提交、并发统计读取和词云采样。
