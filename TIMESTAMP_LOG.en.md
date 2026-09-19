# Update and Handoff Log

[中文](TIMESTAMP_LOG.md)

All times use UTC+08:00.

## Project information

- Project: Tongpin · General Classroom Feedback MVP, local version `0.2.0`.
- Repository: <https://github.com/bd4rex/tongpin-classroom-feedback>.
- Published branch: `main`; local work: `codex/collection-dashboard`; repository visibility: public. The first publication is complete.

## 2026-09-12 11:05 — Preparation for first publication

- The local repository had no commits or remote. Preparation began to create a new GitHub repository as requested by the user.
- Existing application code, tests, and deployment examples are retained. Chinese and English project guides, validation reports, and this log are included.
- Reran `npm run check`: all 18 tests, syntax checks, and the production build passed. `npm audit --omit=dev` reported 0 known vulnerabilities.
- Publication excludes runtime databases, model configuration, real environment files, dependencies, build outputs, and browser screenshots.
- Browser and simulated capacity results are retained from existing records from the same day. No server was deployed and no real model was called. The first pushed commit and verification results will be appended after the push.

## 2026-09-12 11:11 — First GitHub push completed

- Created the private repository `tongpin-classroom-feedback` under `bd4rex`, with `main` as the default branch. Local `origin` now points to this repository.
- Initial publication commit: `1f01fd21c44d3afe2071036fa25465d2cbfb181b`, containing 32 files.
- `git ls-remote origin refs/heads/main` exactly matched local `HEAD`, and the working tree was clean at verification.
- GitHub repository metadata confirmed private visibility. This log update records the completed creation, push, and verification without changing application code.

## 2026-09-19 00:25 — Repository made public

- Changed `bd4rex/tongpin-classroom-feedback` from private to public at the user's request. GitHub confirmed its visibility as `PUBLIC`.
- Before the change, remote `main` matched local commit `7cab375dda085def9d41661dc031108ae7f364dc`. Committed files excluded runtime data and actual environment configuration.
- Updated current visibility in both language versions of the project guide and log. Application code is unchanged.

## 2026-09-19 01:00 — Configurable collection and classroom statistics (local 0.2.0)

- Added six per-classroom collection fields, dependent city/school choices, required-field validation, and session association on `codex/collection-dashboard`, without student accounts or a roster.
- Added teacher statistics, optional student statistics, and a projection screen with participation/progress/region aggregates, teacher-only record export, and locally computed word clouds gated by task result publication.
- Students poll with jitter only while viewing statistics; aggregate responses are cached for two seconds. Clouds use at most 300 responses/24,000 characters and no AI queue capacity.
- Upgraded complete JSON exports to `schemaVersion: 2` and added bilingual form integration notes. No specific QuickForm product is integrated.
- All 24 tests, syntax checks, production build, and dependency audit passed. Desktop/mobile views, fullscreen, and identity-record isolation were checked in real browsers.
- A local 3,000-endpoint run completed 9,000 submissions; 18,000 later heartbeats and 18,000 dashboard reads had no failures. Short-run server RSS peaked at approximately 448 MiB. These mock local measurements are not a target-server capacity promise.
- Backed up the primary SQLite database with the Backup API and verified integrity; the updated app runs locally on port 3210. Test data remains in `output/`; no real model was configured or called.
- Local acceptance is complete. The update is ready to be committed and merged into the public `main` branch; no school-server deployment was made.

## 2026-09-19 — Removed entry-origin restriction

- Removed the strict server comparison between `Origin` and `Host`, fixing the “request source mismatch” shown during password setup when `localhost`, `127.0.0.1`, a LAN IP, or a reverse-proxy entry point differs.
- Kept JSON request validation, teacher/student session authentication, cookie attributes, request rates, body limits, classroom state rules, and AI queue limits.
- All 24 tests, the production build, and the dependency audit passed; the main service restarted at `127.0.0.1:3210`.
