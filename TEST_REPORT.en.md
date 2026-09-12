# MVP Validation Report

[中文](TEST_REPORT.md)

Validation date: 2026-09-12. Scope: a locally runnable MVP. It has not been deployed to a production school server or tested with a real model.

## Functional validation

`npm run check` passed: all 18 integration tests, JavaScript syntax checks, and the frontend production build passed. `npm audit --omit=dev` reported no known vulnerabilities.

Coverage includes one teacher and one current classroom; anonymous live joining; statistics for different participation modes; isolation between classrooms; prevention of early answer disclosure; idempotent duplicate submissions; group timing, pause, and resume; simultaneous groups; arbitrary task order; progress by school; moving draft tasks; legacy migration without exposing drafts; all feedback types; simultaneous submission by 200 endpoints; private student questions; CSV formula protection; full export; database recovery after restart; AI concurrency, queue, and attempt limits; recovery from model failures and invalid responses; and analysis requests without identity fields.

## Browser validation

Validation used a separate `output/browser-data` directory and did not write to production `data/`.

- The teacher set an administrator password, created a mathematics template classroom, and published three tasks in the exploration and practice group at once.
- Two independent student pages participated. The faster endpoint completed tasks in the order 3, 1, 2 while the slower one stayed on the first task. The teacher saw one completed endpoint and one in progress.
- After the review and reflection group was published, the slower endpoint retained its first-group task and unsubmitted selection and could submit successfully. The faster endpoint could proceed directly to the next group.
- Open-response drafts survived task switching, and unpublished later groups were not shown early.
- Pausing the first group prevented further submissions to its unanswered tasks while the second group continued to accept submissions.
- Students joined using only the classroom code and received generated nicknames. Teacher statistics updated automatically after a mobile submission.
- The settings page connected to a local simulated HTTP model service and passed a connection test.
- The earlier AI interaction flow was validated: a student received a simulated reply and submitted a reflection, after which the teacher viewed feedback and generated analysis. The task-group version additionally validated creating an AI extension group with two tasks and publishing them together. AI question drafts survived task switching, replies were clearly labelled as simulated, and reflections were submitted successfully.
- Desktop at 1440 px and mobile at 390 px were checked. Teacher, student answer, and AI interaction pages had no horizontal overflow.
- Browser integration used explicitly labelled simulated replies and does not validate real model answer quality.

Screenshots are stored locally in `output/playwright/`. Restarting the test service during development caused temporary connection errors. SSE reconnected after recovery, preserving classrooms and submitted answers. An initial 401 request without a student session was adjusted to represent the normal state before joining.

## Ordinary feedback concurrency

Raw record: [capacity-task-groups-2026-09-12.json](docs/validation/capacity-task-groups-2026-09-12.json). This record revalidates the task-group version; the earlier task-by-task baseline remains in the same directory.

Environment: Apple M3, 8 logical CPUs, 16 GiB memory, macOS arm64, Node.js v24.14.1. The server ran in a separate Node process using SQLite WAL. The load client and server ran on the same computer.

Each level first established the corresponding number of real HTTP/SSE connections, then published a group containing three tasks and read student state. Clients started together and completed the group using three different task orders. Each endpoint waited for its previous submission response before sending the next. The HTTP pool allowed at most 200 concurrent requests, while all SSE connections remained open. Timings include waiting in the client connection pool.

| Participation endpoints / SSE connections | Successful writes | Failures | Time for all submissions | Submission P95 | Publish to completed student-state read P95 |
| --- | --- | --- | --- | --- | --- |
| 500 | 1500 | 0 | 306 ms | 107.9 ms | 273.5 ms |
| 1000 | 3000 | 0 | 525 ms | 176.4 ms | 286.9 ms |
| 3000 | 9000 | 0 | 1692 ms | 571.4 ms | 509 ms |

Database answer counts, per-task submission counts, group completion counts, and accuracy against reference answers matched expectations at every level. Completed state reads measure the API network path; they do not include rendering on 3,000 real devices.

The 3,000 connections then underwent a short hold check of approximately 31 seconds. Six rounds, totalling 18,000 heartbeat requests, had no failures. Server RSS samples were 394, 382, 394, 410, 411, and 411 MiB, with an observed peak of approximately 411 MiB. These figures exclude client and browser memory and real model inference resources.

This is a short local test, **not a full-lesson stability acceptance test or a promise of support for 3,000 real students in production**. Results cannot be directly converted into an ordinary x86 server specification. They exclude campus egress, Wi-Fi, VPNs, reverse proxies, mobile browsers, and real model services.

## AI queue concurrency

A separate simulated model delayed each request by 120 ms to test scheduling only. No model provider was contacted.

| Item | Result |
| --- | --- |
| Requests arriving together | 100 |
| Configured model concurrency | 4 |
| Configured waiting capacity | 40 |
| Accepted and completed | 44 |
| HTTP 429 responses asking clients to retry later | 56 |
| Observed maximum upstream concurrency | 4 |

Other tests verify one outstanding request per endpoint, duplicate-request idempotency, attempt limits, cancellation before dispatch after a pause, and release of processing slots after connection failures or invalid responses. These results cannot estimate real model throughput per minute, cost, or waiting time.

## Checks for this GitHub publication

At 11:05 on 2026-09-12 (UTC+08:00), `npm run check` was rerun: all 18 tests, syntax checks, and the production build passed. `npm audit --omit=dev` reported 0 known vulnerabilities.

The upload includes application code, tests, scripts, deployment examples, bilingual documentation, and existing simulated capacity records. It excludes `data/`, `output/`, `node_modules/`, `dist/`, `.playwright-cli/`, and actual `.env` files. Fixed passwords and keys in the files prepared for publication are test examples.

The browser and capacity data above are retained from existing records from the same day. Browser operations and capacity tests were not rerun for this publication. Publishing to GitHub does not establish server deployment or real-model acceptance.

## Validation still needed in production

1. Rerun `npm run test:capacity` on the intended server and actual network, and include real phones and tablets.
2. Run a limited pilot with the actual model configuration. Measure latency, provider concurrency and request-rate limits, output tokens, and cost before adjusting the queue.
3. Check connection holding over an entire lesson, network reconnection, service restart, and backup restoration.
4. If using Docker or Nginx, validate ports, SSE buffering, file descriptors, and persistent volumes for that deployment path. No Docker image was run and no existing server was modified in this validation round.
