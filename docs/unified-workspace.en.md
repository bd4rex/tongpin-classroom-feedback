# Unified workspace, lesson preparation, and rollback (0.3.0)

[中文](unified-workspace.md)

## Mechanisms borrowed from QuickForm

We referenced the [official QuickForm repository](https://github.com/wstlab/quickform) and its task → collection → review/analysis → export/reuse flow. The concrete code reference was the local teacher edition 2.0: `create_task`, `task_detail`, `submit_form`, `export_data`, and task import, with local repository HEAD at `6b1557568de75735732e94d6cc0b094ecc28c33f`. The current upstream README lists a newer edition; this local 2.0 snapshot is not presented as the latest release.

This is an independent implementation inspired by the workflow. No QuickForm code was copied or executed, and no QuickForm online service was connected.

| Reference mechanism | Implementation in Tongpin |
| --- | --- |
| Collection and results belong to a task | Select a task on the left; edit, preview, publish its group, review feedback and analysis on the right, without switching between preparation and live modes by default |
| Reusable teaching resources | Existing “Teach again” copies a lesson; portable preparation packs copy one teaching segment, carrying content only |
| No new backend for each collection activity | Imported standard tasks use existing student sessions, validation, SSE, and statistics, without per-task endpoint setup |
| Review evidence before analysis | Live counts, distributions, school/class progress, raw responses, optional AI analysis, and per-task CSV export |

This release does not implement arbitrary HTML attachments, arbitrary form fields, public collection URLs, cross-origin submissions, or migration from QuickForm online. Existing slides, videos, and interactive experiments remain teaching materials; Tongpin collects the corresponding **questions, short resource descriptions, and feedback**. It does not upload and execute arbitrary webpages. Model configuration, session credentials, and student data are excluded from preparation instructions and portable packs.

## Saving teacher preparation time

1. **A similar lesson already exists:** use “Teach again” in past lessons. End the current classroom first. Content and collection settings are copied; students and answers are not.
2. **Only immediate feedback is needed:** open Quick preparation, select prior-knowledge check, mid-lesson check, or exit feedback, inspect the preview, and save drafts. Aim for 2–4 tasks per teaching segment instead of a long questionnaire for every resource.
3. **Materials or AI-created resources already exist:** expand batch import, enter the segment topic, and copy the preparation instructions into your usual AI tool along with your materials. Paste the returned JSON, validate and preview it, then save the group. Alternatively open a previously exported `.json` preparation pack directly. This entry point does not call a real model or send materials automatically.
4. **Check once before publishing:** verify wording, options, and teacher reference answers. Use the student-view preview to inspect visible materials. Set identity collection once under Collection and display, keeping only what the lesson needs, preferably before students join.
5. **One entry point during class:** share the classroom code or QR code and publish groups by teaching segment. Inspect task feedback, questions, and statistics in the same workspace. Student and projection results remain hidden until explicitly revealed per task.
6. **Save once after class:** export useful teaching segments as preparation packs. Export current-task feedback as complete CSV or the entire classroom as relational JSON.

Every imported task starts as a draft. Errors identify the task number. Each pack contains 1–12 tasks; the task-pack HTTP body limit is 256 KB (other routes remain at 32 KB). A failed insertion rolls back the entire pack. Retrying the same import request does not create another group. Deliberately importing again after success creates a new draft copy.

## A reasonable student flow

- Join once and provide only the information requested by the teacher. Later tasks use the same session; students do not re-enter identity for each question.
- Read the task and short supporting materials before answering. Choose task order within open groups. Publishing later groups does not force a switch away from the current answer.
- Unsubmitted answers persist in the same browser tab across task changes and reloads. Closing the tab, clearing browser storage, or changing devices may lose drafts.
- A successful submission explicitly shows that it is saved, followed by a next-task action. Each endpoint contributes one answer per task; network retries do not increase counts.
- Pausing retains current content and allows viewing other open groups. Unrevealed answers and other students’ raw responses are not exposed.
- Understanding checks guide reteaching, open responses capture reasoning, and exit feedback captures takeaways and questions. Click counts and participating endpoints are not individual grades.

## Rollback and backups

### 1. Return to the previous interface

Click “Switch to the original interface” to restore separate preparation/live layouts immediately. The preference persists in the current browser. `/?workspace=classic` forces that layout; `/?workspace=unified` restores the unified layout. Switching does not modify classroom data, end a class, or remove responses. This only changes layout; the backend remains the current release.

### 2. Snapshot current data

```bash
npm run backup
# For a custom data directory:
DATA_DIR=/absolute/path/to/data npm run backup
```

The script uses SQLite’s Backup API for a consistent database snapshot, verifies integrity and foreign keys, and copies model configuration from the data directory and `.env` from the current working directory when present. Output goes to `output/backups/<time>-<random suffix>/`, with row counts and SHA-256 hashes. Directory permissions are 700 and files 600. It only creates copies; it never restores or overwrites current data. Keep configuration backups together with the database locally; do not commit them to GitHub.

The following checkpoint was created before this change:

- Working branch: `codex/unified-feedback`.
- Original commit: `021bb8328558bf1d2a2f0921aa19ac087a220205`.
- Local rollback tag: `codex/pre-unified-feedback-20260920`.
- Local backup: `output/backups/pre-unified-feedback-20260920/`, containing the verified database, manifest, and verified `source.bundle`. Runtime backups are Git-ignored and are not included when cloning the source.

### 3. Roll back code while keeping recent answers

This release changes no database structure. To restore the original program, first run `npm run backup` to preserve **current** data, then stop the running Tongpin process. Run the rollback tag in a separate directory, retaining the current data directory:

```bash
# Run from the project root. output/rollback-app must not already exist.
task_root="$PWD"
rollback_dir="$task_root/output/rollback-app"
git worktree add --detach "$rollback_dir" codex/pre-unified-feedback-20260920
cd "$rollback_dir"
npm ci
npm run build
DATA_DIR="$task_root/data" HOST=127.0.0.1 PORT=3210 npm start
```

Preserve the original data directory, `.env`, `PUBLIC_URL`, port, and Cookie settings if different. Do not run both versions against the same classroom database simultaneously. `source.bundle` is the local source backup and can restore the original version if its tag is lost.

**A normal code rollback does not require replacing the database.** Replacing current data with the pre-upgrade snapshot loses later answers. Only perform a full data restore after confirming corruption and choosing the recovery point; retain the replaced database and its WAL/SHM files. Never overwrite an active SQLite database.

## Validation boundaries

See the [test report](../TEST_REPORT.en.md). Validation covers local automated checks and real Chromium, plus original-version compatibility on a separate copy of new-version test data. No school-server deployment, real-model call, full-class-duration test, or new 3,000-endpoint capacity test is claimed.
