# Update and Handoff Log

[中文](TIMESTAMP_LOG.md)

All times use UTC+08:00.

## Project information

- Project: Tongpin · General Classroom Feedback MVP, local version `0.3.0`.
- Repository: <https://github.com/bd4rex/tongpin-classroom-feedback>.
- Published branch: `main`; this feature branch: `codex/unified-feedback`; repository visibility: public. The first publication is complete.

## 2026-09-20 — Unified feedback, quick preparation, and rollback (local)

- Started from clean `main` at `021bb8328558bf1d2a2f0921aa19ac087a220205`, created `codex/unified-feedback`, and tagged the original code as `codex/pre-unified-feedback-20260920` before editing. The source Git bundle and consistent SQLite snapshot were verified and retained under ignored `output/backups/pre-unified-feedback-20260920/`.
- Referenced QuickForm’s official description and local teacher edition 2.0 task, collection, data-review, and export mechanisms. Independently implemented the unified workspace, preparation templates/AI instructions, standard task-pack import/export, and per-task CSV. No QuickForm code was copied or executed, and no online QuickForm service was connected.
- Teachers edit, preview, publish, and review feedback on one page. Students join once and retain independent task order, recoverable drafts, submission confirmation, and uninterrupted work when later groups open. Imports validate before creating draft groups, roll back atomically on failure, and deduplicate retries.
- Preserved the original layout, a separate rollback tag, and `npm run backup`. No database schema changes. The original code reads a copy of new-version test data; reopening in the new version preserves tasks, participants, responses, login, and sessions.
- All 44 tests, syntax checks, production build, dependency audit, and desktop/mobile Chromium flows passed. Both languages of the guide, API contract, and validation report are synchronized. Real models and school servers are outside this acceptance scope.
- Local implementation commit: `bd358db42418dcb38e65095f6eba188eb062f643` on `codex/unified-feedback`; the rollback tag still points to the pre-change commit. Nothing has been pushed to GitHub.
- Local port 3210 runs 0.3.0 and the health endpoint confirms the version. Original data matches the pre-change snapshot and the management password is unchanged; test records remain in the isolated QA directory.
- Changes and verification are local only: no GitHub push, PR creation, or school production deployment. Runtime data, backups, and browser screenshots remain outside Git.

## 2026-09-19 20:33 — PR #3 merged and local verification

- Fix commit `298079efc87a95d6e61bb89c8e7c458cb90010b3` merged into `main` through [PR #3](https://github.com/bd4rex/tongpin-classroom-feedback/pull/3). The GitHub merge commit is `8502e571aebf3c0459fd8fdb9e6c4d9842caa789`.
- Verified the base branch, fix commit, and mergeability before merging. This repository has no GitHub automated checks configured; release validation used the passing local 36 tests, build, browser regressions, and dependency audit. Merged source matches the validated commit.
- The local port-3210 service was not running. Backed up the existing database through the SQLite Backup API into ignored `output/backups/`, checked integrity and foreign keys, then started `0.2.1`.
- Local health reports `0.2.1`. The new column migrated successfully; comparison with the backup confirms preservation of classrooms, tasks, participants, answers, and questions, with the management password unchanged. No test records were inserted into existing classrooms.
- No school production deployment or real-model calls were performed. Runtime data, backups, and model configuration remain local.

## 2026-09-19 — 0.2.1 review fixes and release preparation

- Based on `main` at `d3fa12a`, fixes four findings: follow-up refreshes for notifications received during a state request, immediate AI waiting-queue cancellation on pause/end, separation of generated labels from entered nicknames, and consistent city validation when school collection is disabled.
- Preserves legacy sessions, answers, and original label text. Adds read-only `displayName`; profile and exported nickname fields represent actual student input.
- Eight new server regressions failed on the original implementation and pass after the fixes. Together with refresh-scheduling regressions, all 36 tests pass, as do the production build and dependency audit. A real browser verifies automatic recovery after a delayed response and correct name restoration in the editor.
- Updates both language versions of the guide, validation record, and form contract. Tests use isolated data and simulated models. Publication excludes production databases, model configuration, real environment files, dependencies, build outputs, and screenshots.
- Preparing the authorized GitHub push and PR merge into `main`. No school production deployment or real-model calls were performed.

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
- Local acceptance is complete. The update was committed and merged into the public `main` branch; no school-server deployment was made.

## 2026-09-19 — Removed entry-origin restriction

- Removed the strict server comparison between `Origin` and `Host`, fixing the “request source mismatch” shown during password setup when `localhost`, `127.0.0.1`, a LAN IP, or a reverse-proxy entry point differs.
- Kept JSON request validation, teacher/student session authentication, cookie attributes, request rates, body limits, classroom state rules, and AI queue limits.
- All 24 tests, the production build, and the dependency audit passed; the main service restarted at `127.0.0.1:3210`.

## 2026-09-19 — Student entry and default collection rules (pending publication)

- Default classroom collection now limits cities to the 13 prefecture-level cities in Jiangsu; school lists reject cities outside Jiangsu.
- When name and nickname are both shown, students choose one. The teacher UI prevents both from being required; a fixed identity can still use only one enabled field.
- The student join page hides group and whole-class choices and submits individual participation; the server keeps existing modes for compatibility.
- All 25 tests, syntax checks, the production build, and `npm audit --omit=dev` passed. Browser screenshots were not regenerated and no school server was deployed in this round.

## 2026-09-19 — PR #2 merged into main

- Feature commit `ef995e500df7747be8f8b35ebfce3944eee432e9` was pushed to `codex/jiangsu-student-entry`, and PR #2 was merged into `main`.
- GitHub merge commit: `0406b0eede66bc27036d66bf15e286859d947fe7`; remote `main` was verified to contain the Jiangsu city restriction, either/or identity fields, and individual join entry.
- Pre-merge acceptance: 25 tests, syntax checks, the production build, dependency audit, and secret-pattern scan passed. No school-server deployment or real-model call was made.
- GitHub PR: [bd4rex/tongpin-classroom-feedback#2](https://github.com/bd4rex/tongpin-classroom-feedback/pull/2).

## 2026-09-19 — PR #1 merged into main

- Feature commit `8f4844939df09edaf5b2761c6aa05eac2286b616` was pushed to `codex/collection-dashboard`, and PR #1 was merged into `main`.
- GitHub merge commit: `432939ef395ebdb6b619c75975a51e4fbcd89270`; remote `main` was verified to contain the collection and statistics feature.
- Pre-merge acceptance: 24 tests, JavaScript syntax checks, the production build, and `npm audit --omit=dev` passed; the staged-content secret-pattern scan passed.
- GitHub PR: [bd4rex/tongpin-classroom-feedback#1](https://github.com/bd4rex/tongpin-classroom-feedback/pull/1). No school-server deployment or real-model call was made.
