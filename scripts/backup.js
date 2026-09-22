import { DatabaseSync, backup } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  copyFile,
  chmod,
  readFile,
  writeFile,
  access,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

// This command only creates snapshots; restoring is a separate, deliberate step.
export async function backupData({
  dataDir = process.env.DATA_DIR || "data",
  outputRoot = "output/backups",
  envFile = ".env",
} = {}) {
  const source = resolve(dataDir, "classroom.sqlite");
  await access(source);
  const destination = resolve(
    outputRoot,
    `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const target = join(destination, "classroom.sqlite");
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, target);
  } finally {
    db.close();
  }
  await chmod(target, 0o600);
  const check = new DatabaseSync(target, { readOnly: true });
  let counts;
  try {
    const integrity = check.prepare("PRAGMA integrity_check").all();
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== "ok" ||
      check.prepare("PRAGMA foreign_key_check").all().length
    )
      throw new Error("备份完整性检查失败，请勿用于恢复");
    counts = Object.fromEntries(
      [
        "classrooms",
        "task_groups",
        "activities",
        "participants",
        "answers",
        "questions",
      ].map((table) => [
        table,
        check.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n,
      ]),
    );
  } finally {
    check.close();
  }
  const files = ["classroom.sqlite"];
  for (const [from, name] of [
    [join(dataDir, "model-config.json"), "model-config.json"],
    [envFile, ".env"],
  ]) {
    if (!from) continue;
    try {
      await access(from);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    await copyFile(from, join(destination, name));
    await chmod(join(destination, name), 0o600);
    files.push(name);
  }
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
  const checksums = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(join(destination, file)))
          .digest("hex"),
      ]),
    ),
  );
  const manifest = {
    createdAt: new Date().toISOString(),
    commit,
    counts,
    checksums,
    integrity: "ok",
  };
  await writeFile(
    join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  return { destination, ...manifest };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await backupData();
    console.log(
      JSON.stringify(
        {
          destination: result.destination,
          counts: result.counts,
          integrity: result.integrity,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`备份失败：${error.message}`);
    process.exitCode = 1;
  }
}
