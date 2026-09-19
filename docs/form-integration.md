# 表单扩展接口（0.2.0）

[English](form-integration.en.md)

本页描述已实现的采集与导出接口。尚未接入具体 QuickForm 产品、动态自定义题型、Webhook 或第三方账号；这不是某个外部表单产品的 API 承诺。

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

后续明确具体 QuickForm 项目及其 API 后，可在服务端将外部字段映射到稳定 ID，新增题型仍通过任务组发布，并让响应进入现有会话、校验和统计路径。任意表单 Schema、导入、Webhook 推送、外部账户绑定和自定义字段设计器均未实现。

验证入口：`npm run check`；`test/app.test.js` 覆盖必填／选项校验、关闭字段拒绝新采集、会话复用、后加必填项、导出关联、权限、词云和明细隔离。`npm run test:capacity` 包含六字段采集、任务提交、并发统计读取和词云采样。
