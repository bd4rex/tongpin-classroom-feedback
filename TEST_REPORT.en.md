# MVP validation record

[中文](TEST_REPORT.md)

Latest validation: 2026-09-19, version 0.2.0. Scope: local information collection, session association, teacher/student statistics, projection, and the multiple-entry origin restriction fix. This round further defaults cities to Jiangsu, treats name or nickname as an either/or identity field, and keeps the student entry individual-only. No school production server deployment or real-model calls; this round is pending merge into the public `main` branch.

## Functional validation

`npm run check` passed: 24 integration tests, JavaScript syntax checks, and the production frontend build. `npm audit --omit=dev` reported zero known vulnerabilities.

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
