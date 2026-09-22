import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.js";
import { backupData } from "../scripts/backup.js";

test("WAL backup is consistent and independent, protects configuration, and never overwrites the source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tongpin-backup-"));
  const store = createStore(join(dir, "data"));
  try {
    store.createClassroom({ title: "备份时的课堂" });
    await writeFile(
      join(dir, "data", "model-config.json"),
      '{"apiKey":"fake-test-only"}',
    );
    const result = await backupData({
      dataDir: join(dir, "data"),
      outputRoot: join(dir, "backups"),
      envFile: null,
    });
    assert.equal(result.counts.classrooms, 1);
    assert.equal(result.integrity, "ok");
    store.run("UPDATE classrooms SET title='备份后继续上课'");
    const copy = new DatabaseSync(
      join(result.destination, "classroom.sqlite"),
      { readOnly: true },
    );
    try {
      assert.equal(
        copy.prepare("SELECT title FROM classrooms").get().title,
        "备份时的课堂",
      );
    } finally {
      copy.close();
    }
    assert.equal(
      store.get("SELECT title FROM classrooms").title,
      "备份后继续上课",
    );
    for (const [file, checksum] of Object.entries(result.checksums)) {
      assert.equal(
        createHash("sha256")
          .update(await readFile(join(result.destination, file)))
          .digest("hex"),
        checksum,
      );
      assert.equal(
        (await stat(join(result.destination, file))).mode & 0o777,
        0o600,
      );
    }
    assert.equal((await stat(result.destination)).mode & 0o777, 0o700);
    assert.doesNotMatch(
      await readFile(join(result.destination, "manifest.json"), "utf8"),
      /fake-test-only/,
    );
    await assert.rejects(
      backupData({
        dataDir: join(dir, "missing"),
        outputRoot: join(dir, "backups"),
        envFile: null,
      }),
      { code: "ENOENT" },
    );
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
