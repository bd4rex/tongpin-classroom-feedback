# MVP validation record

[中文](TEST_REPORT.md)

Latest validation: 2026-09-22, local version 0.4.0. The bundled lesson, fill-in tasks, and teacher notes were checked using isolated test data and mock AI, without school production deployment. Historical records remain below.

## 0.4.0 bundled AI lesson, fill-in tasks, and teacher notes

- Read and recorded SHA-256 hashes for the supplied 52-slide PPT and 40-minute script. The lesson ships with server source and does not depend on the original paths. Neither source document was changed or added to the project.
- `npm run check` passes 49 tests, syntax checks, and the production build. Five integration tests were added: the six-group/twelve-task template and creation contract, blank and answer validation, pre-reveal reference and teacher-note isolation, completing/exporting/reusing all twelve tasks, and atomic rollback when the last task is invalid. No dependencies were added; capacity and real-model tests were not repeated.
- The template uses only `single`/`multiple` (choice), `fill`, and `ai`. Suggested durations total 40 minutes; every group begins as an unlimited-time draft. Creation does not call a model. Existing templates and the original workspace remain available.
- Fill-in submission validates count, types, required values, and length, then builds labelled display text on the server. Retries are idempotent. There is no automatic grading; CSV marks these responses for teacher discussion. Packs and whole-class reuse retain references and teacher notes without participants, responses, publication state, or AI history.
- Real Chromium at 1440×1040 for teachers and 390×844 for mobile checked selection/creation, teacher notes, a choice response, fill-in recovery across task switches/reloads, uninterrupted input when another group opens, submission confirmation, continuing unfinished tasks, result publication, blank editing, and previews in both workspaces. Both AI tasks completed requests and reflections using the local mock. No page script errors or page-wide horizontal overflow; screenshots were visually inspected.
- Ran `npm run backup` before starting local port 3210 with 0.4.0; integrity returned `ok`. All six teaching-record counts in the original database were zero. No example classroom or test student was inserted into that database. Read back the health version; teachers create the actual lesson by selecting its template.
- Fill-in tasks require the new application. Older-code rollback evidence does not cover `fill`; see [preparation and rollback](docs/unified-workspace.en.md).

The browser script is for an isolated QA server only. It ends that test server's current classroom before creating a new one:

```bash
QA_DATA_DIR="$(mktemp -d)" node scripts/qa-server.js
# In another terminal:
npx --yes --package @playwright/cli playwright-cli --session ai-lesson open http://127.0.0.1:3211 --headed
npx --yes --package @playwright/cli playwright-cli --session ai-lesson run-code --filename test/browser/ai-lesson.js
```

Structured result: [ai-lesson-2026-09-22.json](docs/validation/ai-lesson-2026-09-22.json). Screenshots remain in ignored local paths `output/playwright/ai-lesson-create.png`, `ai-lesson-teacher.png`, and `ai-lesson-fill-mobile.png`. These checks do not establish target-school networking, real-model quality, or actual full-length lesson outcomes.

## 0.3.0 unified workspace, preparation packs, and rollback

- `npm run check` passes 44 tests, syntax checks, and the production build. `npm audit --omit=dev` reports zero known vulnerabilities. Eight tests were added; neither 3,000-endpoint nor full-class-duration load testing was repeated.
- Preparation packs: previews write no records; invalid tasks identify their index and leave no partial import; a simulated second insertion failure rolls back the group; retries create one group; the same ID with different content is rejected; students and anonymous clients cannot access teacher routes; ended classrooms reject imports.
- Content reuse: export/import retains materials and reference answers, without participants, responses, publication state, or analysis. Twelve long tasks exceeding the original 32 KB limit round-trip successfully; bodies above the dedicated 256 KB limit are rejected.
- Per-task CSV: 101 responses are exported completely, other tasks are excluded, cross-classroom IDs are rejected, and CSV formula protection plus the full classroom JSON format remain intact.
- Real Chromium: 1440×1040 teacher desktop and 390×844 mobile viewports cover template preview, inline editing, invalid JSON feedback, fenced JSON import, portable file export/reimport preview, student-view preview, publishing, per-task export, and statistics following task selection. The original layout, reload, and return to unified layout work. No page script errors or full-page horizontal overflow were observed.
- Student flow: one join links two answers to one participant. Task switches and reloads preserve unsent text; publishing another group does not interrupt input. Submission explicitly shows that it is saved, then proceeds to the next task. Reference answers remain hidden before publication.
- Backups: a live WAL snapshot passes integrity, foreign-key, SHA-256, file-permission, and source-preservation checks. Subsequent source writes do not modify the snapshot.
- Code rollback: original commit `021bb83` (0.2.1) builds independently and reads a separate copy of new-version data, preserving the current classroom’s 4 tasks, 1 participant, 2 answers, and 2 open groups, with teacher login intact. Reopening the same copy in 0.3.0 preserves the teacher session and responses. Evidence: [unified-rollback-2026-09-20.json](docs/validation/unified-rollback-2026-09-20.json).

Browser regression: `test/browser/unified-workspace.js`. Run only against an isolated QA service: it ends any unfinished classroom on that test service and creates a demonstration classroom.

```bash
QA_DATA_DIR="$(mktemp -d)" node scripts/qa-server.js
# In a separate terminal:
npx --yes --package @playwright/cli playwright-cli --session unified-feedback open http://127.0.0.1:3211 --headed
npx --yes --package @playwright/cli playwright-cli --session unified-feedback run-code --filename test/browser/unified-workspace.js
```

Local screenshots are Git-ignored under `output/playwright/unified-preparation.png`, `unified-teacher-desktop.png`, `unified-teacher-mobile.png`, and `unified-student-mobile.png`. These demonstrate a local simulated teaching workflow only. Real AI preparation quality, school-network behavior, and target-server capacity were not validated.


## 0.2.1 review-fix regressions

- Eight new server regressions failed before the fixes and passed afterward. Three frontend refresh-scheduling tests were also added. `npm run check` passes all 36 tests, syntax checks, and the production build; `npm audit --omit=dev` reports zero known vulnerabilities.
- Notification coalescing: 100 notifications arriving during one request produce one follow-up read, with a maximum of one concurrent request. Leaving the classroom cancels pending refreshes; later notifications still work after a failed request.
- Real Chromium page: delay the state response requested when SSE becomes ready, publish the second group, then release the old response. A follow-up refresh displays the second group automatically. Observed: three state requests, one ready event, one update event, and zero manual reloads.
- AI queue: covers group pause, the compatible activity-pause route, group end, and classroom end. Undispatched requests are cancelled immediately and do not revive on resume. Other groups remain queued, dispatched requests finish, and peak simulated model concurrency stays at one.
- Identity collection: generated labels do not satisfy newly required nickname or name/nickname fields. Completing the profile retains the session. Switching between name and nickname does not restore a generated label; teacher records and exports retain actual input. After supplying only a name, the browser editor selects Name and restores that value.
- Legacy data: restart from a simulated 0.2.0 participant schema identifies generated labels while preserving sessions and records. Real nicknames and matching labels explicitly entered after migration remain valid across another restart.
- City choices: all 13 cities can join when school collection is disabled. Re-enabling school collection narrows the options and restores catalog validation. School-only collection still validates the school catalog.
- After PR #3 merged, backed up the existing local database through the SQLite Backup API and started 0.2.1. Integrity, foreign keys, and comparison of existing records passed; the management password is unchanged. Port 3210 health reports 0.2.1, with no test data added to existing classrooms.

Browser regression: `test/browser/realtime-regression.js`. Start the QA server with a fresh data directory, then run the script through Playwright CLI:

```bash
QA_DATA_DIR="$(mktemp -d)" node scripts/qa-server.js
```

In another terminal:

```bash
npx --yes --package @playwright/cli playwright-cli --session regression open about:blank --headed
npx --yes --package @playwright/cli playwright-cli --session regression run-code --filename test/browser/realtime-regression.js
```

Screenshots for this round remain in ignored local paths `output/playwright/realtime-fixed.png` and `output/playwright/identity-fixed.png`. The 3,000-endpoint capacity run and full-class-duration tests were not repeated; the historical load results below are not production acceptance for this release.

## Functional validation

For 0.2.0, `npm run check` passed the final 25 integration tests, JavaScript syntax checks, and the production frontend build. `npm audit --omit=dev` reported zero known vulnerabilities.

Origin compatibility regression: a JSON mutation with a different `Origin` no longer returns 403 and proceeds to normal teacher authentication (401 when unauthenticated); a non-JSON mutation still returns 415. The main service health endpoint at `http://127.0.0.1:3210/api/health` reports version `0.2.0`.

Existing classroom, task-group, independent-progress, idempotency, participation-mode, permission, persistence, CSV, and AI-queue tests remain. This round adds the name-or-nickname regression, for 25 tests total:

- Visible/required collection fields, valid city/school combinations, and rejection of new values for disabled fields.
- Session reuse without duplicate participants, leading-zero student numbers, response relationships, cookie renewal, and recovery after restart.
- Newly required fields blocking further submissions until completed; historical values retained when disabled; edits do not create participants.
- Teacher preview versus per-task result publication for students/projection; no draft or raw identity disclosure; display revocation applies immediately at the API; same-named schools in different cities remain distinct.
- Teacher record pagination, CSV protection, JSON relationships, and copying configuration without identity records when reusing classrooms.
- Once-per-response word counts, excluded terms and collected identifier filtering, and bounded sample/character budgets.
- The default 13 Jiangsu cities, rejection of non-Jiangsu school-list cities, mutual exclusion of required name and nickname, and individual-only student entry.

## Browser validation

An isolated `output/collection-browser-data` directory and clearly named synthetic participants/schools were used. No test records were added to the primary `data/` directory.

- The teacher created a science classroom, made city/school/class/student number/name required, disabled nickname, and configured school choices, student statistics, and word clouds through the UI.
- At 390px, joining showed only enabled fields. Selecting Nanjing removed Suzhou schools from the school selector.
- After entering details once, the student joined and refreshed directly back into the classroom. My participation information retained student number `000012`.
- The student completed a choice task and an open response. The teacher saw two associated submissions, group completion, and participation details.
- Student statistics withheld results before publication and displayed the cloud after publication. A deliberately inserted synthetic name and student number were filtered from the cloud.
- Teacher statistics had participation details; student statistics and projection had no participant records, names, or student-number fields. The student's own name remained in their page header.
- Projection opened in a new tab. This classroom fit in one 1920×1080 view, and entering/exiting fullscreen worked.
- Teacher pages at 1440px and teacher/student pages at 390px had no page-level horizontal overflow. Wide tables scroll within their cards. Screenshots were visually checked.

Screenshots are local at `output/playwright/collection-*.png`. Independent group pacing and the simulated AI browser flow were validated on 2026-09-12. The new rules received server and production-build regression checks in this round; browser screenshots were not regenerated. Simulated output is not evidence of real-model quality.

## Collection, submission, and dashboard load

Raw record: [capacity-collection-stats-2026-09-19.json](docs/validation/capacity-collection-stats-2026-09-19.json).

Environment: Apple M3, 8 logical CPUs, 16 GiB RAM, macOS arm64, Node.js v24.14.1. An independent Node server uses SQLite WAL; the load client runs on the same machine. Real HTTP/SSE connections are retained, with an HTTP pool of at most 200 concurrent requests. Latency includes client queueing.

Each endpoint supplied all six profile fields. A group contained two choice tasks and one text task, completed in three different orders. After publishing the text results, all endpoints requested student statistics concurrently; checks enforced the 300-response sample and exclusion of collected identifiers from cloud terms.

| Endpoints / SSE connections | Successful writes | Failures | All submissions | Submission P95 | Publish to state-read completion P95 | Dashboard-read P95 |
| --------------------------- | ----------------- | -------- | --------------- | -------------- | ------------------------------------ | ------------------ |
| 500                         | 1500              | 0        | 332 ms          | 114.2 ms       | 304.4 ms                             | 64.7 ms            |
| 1000                        | 3000              | 0        | 648 ms          | 228.3 ms       | 233.3 ms                             | 98.4 ms            |
| 3000                        | 9000              | 0        | 1962 ms         | 671.6 ms       | 507.4 ms                             | 278.2 ms           |

Dashboard requests had no failures. Database answer counts and group completion matched expectations. State-read completion is an API metric and excludes rendering on thousands of devices.

The 3,000 connections remained for approximately 33 seconds over six rounds: 18,000 heartbeats and 18,000 dashboard reads, with no failures. Server RSS samples were 428, 429, 446, 448, 438, and 437 MiB; observed peak was 448 MiB, excluding client, browser, and model inference memory.

This is a short local simulated load, **not a promise of 3,000 real students or a full-lesson stability acceptance**. It excludes school networks, actual mobile devices, proxies, Wi-Fi, real models, and target-server resources.

## AI queue

An independent mock upstream delayed each response by 120ms. With 100 simultaneous arrivals, concurrency 4 and waiting capacity 40, 44 requests were accepted and completed; 56 received HTTP 429. Maximum observed upstream concurrency was 4. Ordinary feedback and statistics make no model calls.

Existing tests continue to cover one outstanding request per endpoint, idempotency, allowances, cancellation of queued work after pause, slot release on failures/malformed responses, and analysis without appended identity fields. Mock results cannot estimate real-model throughput, latency, or cost.

## Local upgrade and historical records

Before migration, `data/classroom.sqlite` was copied with the SQLite Backup API to ignored `output/backups/`, and its integrity check passed. New columns are additive; existing classrooms use the default optional fields. Version 0.2.0 starts locally on port 3210. Runtime data, model configuration, build artifacts, and screenshots remain outside Git.

The 18-test baseline and group-load results from 2026-09-12 remain in [capacity-task-groups-2026-09-12.json](docs/validation/capacity-task-groups-2026-09-12.json). Repository publication history is in [TIMESTAMP_LOG.en.md](TIMESTAMP_LOG.en.md); this feature update entered `main` through PR #1.

## Before a real lesson

1. Repeat capacity checks on the target server/network with real phones/tablets.
2. Run a limited trial with the actual model to measure quotas, latency, cost, and answer quality.
3. Check full-lesson stability, reconnects, server restarts, and backup restoration.
4. Validate ports, SSE buffering, file descriptors, and persistence on any Docker/Nginx deployment. This run did not build a Docker image or change an existing server.
