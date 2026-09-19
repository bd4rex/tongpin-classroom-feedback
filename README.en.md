# Tongpin · General Classroom Feedback MVP

[中文](README.md)

Repository: [bd4rex/tongpin-classroom-feedback](https://github.com/bd4rex/tongpin-classroom-feedback). This is a public repository and can be viewed or cloned without signing in to GitHub.

One teacher, one current classroom, and many students joining live. The application supports mathematics, language, science, AI, and other subjects. Audio and video remain in the existing conferencing system.

Students do not need accounts or an imported roster. They enter a classroom code and complete only the fields enabled by the teacher. Nickname, school, and class are optional by default; all can be disabled, or city, name, and student number can be enabled. Participation can represent an individual, a group, or an entire class.

## Documentation

| Document                     | Chinese                                         | English                                               |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------------------- |
| Project guide and deployment | [README.md](README.md)                          | [README.en.md](README.en.md)                          |
| Validation report            | [TEST_REPORT.md](TEST_REPORT.md)                | [TEST_REPORT.en.md](TEST_REPORT.en.md)                |
| Update and handoff log       | [TIMESTAMP_LOG.md](TIMESTAMP_LOG.md)            | [TIMESTAMP_LOG.en.md](TIMESTAMP_LOG.en.md)            |
| Form integration contract    | [form-integration.md](docs/form-integration.md) | [form-integration.en.md](docs/form-integration.en.md) |

## Start and try it

Requires Node.js 24 or later.

```bash
git clone https://github.com/bd4rex/tongpin-classroom-feedback.git
cd tongpin-classroom-feedback
npm ci
npm run build
npm start
```

Teacher entry: `http://127.0.0.1:3210`. Student entry: `/join` on the server's reachable address and port 3210. On macOS, you can also double-click `启动同频.command`.

1. On first use, the teacher sets an administrator password and signs in to the workbench.
2. Choose a template or create an empty classroom, select fields in Collection and display, then share its code or QR code.
3. Students enter the code and fill in the enabled fields once. Later responses are linked to that classroom session.
4. The teacher publishes questions or tasks in groups. Students choose the task order within each group and proceed to later groups that are open. The teacher can inspect group progress, individual task feedback, and student questions.
5. End the classroom and review or export its records. Activities from past classrooms can be reused without carrying over past answers.

The server listens on `0.0.0.0:3210` by default. QR code generation tries to select a LAN address. With multiple network adapters, VPNs, or networks spanning schools, set `PUBLIC_URL` explicitly in `.env` and ensure students can reach it. Copy `.env.example` to `.env`, then start with `node --env-file=.env server/index.js`.

The server no longer compares the browser `Origin` with the server `Host`, so `localhost`, `127.0.0.1`, LAN IPs, and reverse-proxy entry points do not reject setup, classroom joins, or feedback merely because their address representations differ. Mutations still require JSON; teacher routes require a teacher session; student routes require a student cookie; cookies remain `HttpOnly` and `SameSite=Strict`.

## Implemented features

- One current classroom and its completed history. There is no student administration, admissions, enrollment, homework, or grading system.
- Single choice, multiple choice, true/false, polls, comprehension checks, open responses, exit feedback, and AI inquiry.
- Create and edit task groups, move draft tasks, and publish, pause, resume, time, or manually end groups. Results can be shown or hidden for individual tasks.
- Multiple groups can remain open at once. Publishing a later group leaves earlier groups open and does not force students onto a new question.
- Group progress shows completed, in progress, and not started, with optional aggregation by the school and class students enter themselves.
- Students can switch tasks freely. Unsubmitted answers and AI question drafts are temporarily kept in the current browser tab; retention after closing it is not guaranteed.
- SSE notifications and reconnection, with automatic polling when the live connection fails.
- Submission counts and rates, answer distributions, accuracy against reference answers, online participation endpoints, and aggregation by self-reported school or class.
- Students can ask the teacher questions; other students cannot see their original text.
- CSV answer export and complete JSON record export, including activities, answers, questions, analyses, and AI interactions.
- SQLite persistence restores submitted answers after browser refreshes or server restarts.
- Per-classroom visible/required settings for city, school, class, student number, name, and nickname, with optional dependent city/school lists.
- Teacher statistics, an authenticated projection screen, optional student statistics, and teacher-only participation records and CSV export.
- Local word clouds for written feedback, controlled by task result publication, with custom excluded words and no AI calls.

## Collection and classroom statistics

Open **Collection and display** after creating a classroom. Each of the six fields has visible and required checkboxes. Hidden fields do not appear on the join form. Optionally enter up to 200 `city｜school` rows to offer city-dependent school choices; otherwise students type their own values. No student roster is needed.

Students fill in their details once. Answers, progress, and questions remain linked to that participation endpoint after a page refresh or server restart. Heartbeats renew its cookie for 24 hours from the latest renewal. A different browser/device or cleared cookies creates a new endpoint; self-reported identity is not verified. Students can update My participation information; previously linked records then display the updated details. Newly required fields must be completed before further submissions. Disabling a field stops new collection without deleting historical values. Duplicating a classroom copies configuration, not participants or answers.

Teachers use **Statistics** for participation, online counts, city/school distribution, group progress, and task results. Expand Participation records to inspect or export details. **Projection screen** opens a separate page with a fullscreen button and requires teacher authentication. Enable Student classroom statistics to add the statistics tab on student pages.

Student and projection endpoints return aggregates without names, student numbers, participant records, or raw responses. Choice distributions and word clouds appear only after **Show this task's results**; teachers can preview them first. Word clouds cover open responses, exit reflections/questions, and final AI-inquiry reflections. A repeated word counts once per response. Each cloud uses at most the latest 300 responses and 24,000 characters, shows the top 50 terms, and labels sampling. Collected names, student numbers, nicknames, common contact patterns, and teacher-defined excluded words are filtered. Other personal details in free text still require teacher preview. Term frequency is not an accuracy measure.

QuickForm or other external form products are not integrated yet. Stable field IDs, server-side validation, and complete JSON exports with `schemaVersion: 2` provide an adaptation point once the specific product/API is known. See the [form integration contract](docs/form-integration.en.md).

## Using task groups

A mathematics lesson might have two groups: exploration and practice, followed by review and reflection. The first group can contain two choice questions and an open task at the same time. Students need not wait for everyone to finish the same question. The teacher opens the next group based on overall progress; the first remains open by default. To bring everyone back to discussion, pause the relevant group or end the classroom.

Completed means that a participation endpoint submitted every task in the group. In progress means it opened a task or submitted some answers. Not started means no opening or submission has been recorded. These labels describe page participation and do not infer actual learning. City, school, and class are self-reported according to teacher settings; missing values are grouped as unspecified.

To keep completion rates meaningful, tasks cannot be added, deleted, or moved after a group is published. Create a new group for extra practice. Draft groups remain editable, and the teacher ends them manually by default. When upgrading from the earlier task-by-task version, each original activity is preserved as a separate group without exposing old drafts.

Each participation endpoint submits once per activity; retrying the same request does not increase the statistics. Accuracy and proportions use submitting endpoints as their unit. **An answer from a group or an entire class is not converted into individual grades.** Changing browsers, clearing cookies, or using a new device creates a new anonymous endpoint. This version does not verify identity or deduplicate across devices.

## Running AI interactions

The first version provides two paths:

**Student inquiry:** The teacher adds an AI inquiry activity, specifies the task and model instructions, and permits 1–5 questions per endpoint. The activity opens with its task group, which also controls its timing. Students ask questions within the task and submit an evaluation or reflection after reading the reply. Each question is an independent request and must include any needed context; this is not unlimited multi-turn chat. Instructions help maintain the teaching topic but cannot guarantee the model will always follow it.

**Teacher analysis:** For open responses, exit feedback, and AI inquiry reflections, the teacher explicitly requests AI-assisted analysis. It samples at most 80 responses and 16,000 characters to produce main ideas, possible misconceptions to verify, and follow-up questions. The interface identifies the sample size and any later responses. Collected identity fields are not appended to model requests, although student-written response text may itself contain personal information.

In AI settings, enter an OpenAI-compatible API base URL, model name, and key. Local models without keys are supported. Keys are stored on the server in `data/model-config.json` with file permissions `0600` and are not returned to the browser. Changing the URL requires re-entering or clearing the old key to avoid sending it to another service.

Saving settings does not call the model. Calls occur only for a connection test, a student's question in a published task, or teacher-requested analysis. Automated tests and local capacity validation use simulated models. Configure and validate a real model after deployment; existing tests do not establish real model answer quality or capacity.

## Concurrency controls

| Ordinary feedback                                                                     | AI requests                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Submissions write directly to the database without a model call                       | Requests enter a bounded queue before calling the model                  |
| Teacher notifications are coalesced every 350 ms                                      | Defaults: at most 4 running and 100 waiting                              |
| Submissions notify the teacher without broadcasting to all students                   | At most one outstanding request per endpoint                             |
| Only classroom controls such as publish and pause notify all students                 | 1–5 attempts per task per endpoint, enforced by the server               |
| Summaries are cached for 800 ms; normal responses include only the latest 100 answers | Questions are limited to 1,500 characters; output defaults to 600 tokens |
| Students send a heartbeat every 25 seconds and count as online for 75 seconds         | Each request times out after 25 seconds, with no automatic paid retry    |

Dashboard responses are cached for two seconds. Teacher/projection pages poll every three seconds; students poll every 6–7.5 seconds with jitter only while viewing statistics. A submission does not refresh every student's dashboard. Word-cloud sampling is bounded and statistics do not use the model queue.

A full queue returns a retryable message, and rejected requests do not consume the allowance. Accepted attempts count toward the allowance, including failed or cancelled requests. Pausing or ending a group cancels requests that have not been dispatched; requests already sent to the model may finish and save their results. Interrupted requests are marked failed after a restart and are not automatically sent again.

Model concurrency can be set to 1–16, with a waiting queue of 1–200. Teacher analysis and connection tests do not compete with outstanding student jobs; they ask the teacher to retry later while student jobs remain. During an analysis or connection test, new student requests ask students to retry later.

Assess feedback participation capacity separately from simultaneous model use. A successful local test with 3,000 endpoints does not mean 3,000 model requests can run at once. Before a real lesson, set concurrency from the model provider's quota and measured latency. AI inquiry can be opened in batches or used through group devices.

## Deployment on a school server

Run the Node commands above directly. Use a single instance and back up the complete `data/` directory. For online backups, use the SQLite Backup API. The simplest alternative is to stop the service and copy the entire directory, including WAL files.

Docker configuration is also included:

```bash
docker compose up -d --build
```

Docker stores data in the persistent volume `tongpin-data`. Set `PUBLIC_URL` for the actual environment. For an Nginx reverse proxy, see `deploy/nginx.conf.example`; proxy buffering must be disabled for SSE. Set `COOKIE_SECURE=true` when using HTTPS.

This MVP uses one server and one Node process. The AI scheduler and notification subscriptions are held in memory, while SQLite stores classroom records. **Do not scale by starting multiple instances sharing the database.** Multiple instances would require a shared queue, publish/subscribe infrastructure, a shared database, and renewed validation. Public deployment, target-server measurements, and real-model capacity testing have not been performed.

Other boundaries remain: the teacher setup password must be at least eight characters; login and AI requests have rate and queue limits; requests have JSON and body-size validation; unauthenticated users cannot call teacher routes, and students must join before submitting; only one current classroom is allowed; ended classrooms are read-only. These protect authentication, stability, and classroom data boundaries without requiring a student roster.

## Validation and code entry points

```bash
npm test
npm run build
npm run test:capacity
```

Tests use separate temporary databases and do not write to production `data/`. Capacity tests do not access real models. Capacity results are written to `output/capacity-results.json`; see [TEST_REPORT.en.md](TEST_REPORT.en.md) for the current validation record.

| Path                                                                | Purpose                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/App.jsx`, `src/TaskGroups.jsx`, `src/styles.css`               | Teacher and student pages, task groups, and independent progress           |
| `server/app.js`                                                     | HTTP API, authentication, SSE, and classroom controls                      |
| `server/store.js`                                                   | SQLite schema, statistics, and input validation                            |
| `server/collection.js`, `src/Collection.jsx`                        | Collection configuration, student forms, teacher participation records     |
| `server/dashboard.js`, `server/word-cloud.js`, `src/Statistics.jsx` | Aggregate statistics, word clouds, dashboard and projection pages          |
| `server/ai.js`                                                      | Model configuration, server-side calls, bounded queue, and analysis        |
| `server/templates.js`                                               | Editable example activities across subjects                                |
| `test/app.test.js`                                                  | Classroom flows, permissions, statistics, AI limits, and persistence tests |
| `scripts/capacity.js`                                               | Local HTTP/SSE concurrency and simulated model queue tests                 |

Implementation reference: the user-provided implementation plan for a real-time feedback system for remote AI general education in Jiangsu rural schools. This version follows the user's subsequent scope: general subjects, one teacher and classroom, anonymous live joining, priority for concurrency and model interaction, and group publishing with students progressing independently. Province-wide governance, a complete account system, and all longer-term functions from the original plan are outside this MVP.
