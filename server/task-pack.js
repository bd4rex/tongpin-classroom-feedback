import { AppError, normalizeActivity, str } from "./store.js";

// Portable teaching content only. Identities, answers, IDs and publication state
// are deliberately never carried into a new classroom.
export function normalizeTaskPack(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AppError(
      "请粘贴包含 schemaVersion、group 和 activities 的任务包",
    );
  if (input.schemaVersion !== 1)
    throw new AppError("任务包 schemaVersion 必须为 1");
  const group = {
    title: str(input.group?.title, "任务组名称", 80),
    duration: Number(input.group?.duration ?? 0),
  };
  if (
    !Number.isInteger(group.duration) ||
    group.duration < 0 ||
    group.duration > 7200
  )
    throw new AppError("任务组开放时长应为 0–7200 秒");
  if (
    !Array.isArray(input.activities) ||
    input.activities.length < 1 ||
    input.activities.length > 12
  )
    throw new AppError("每个任务包请安排 1–12 项任务，建议每个教学环节 2–4 项");
  const activities = input.activities.map((item, i) => {
    try {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new AppError("任务必须是一个对象");
      return normalizeActivity({ ...item, duration: 0 });
    } catch (error) {
      if (error instanceof AppError)
        throw new AppError(`第 ${i + 1} 项：${error.message}`);
      throw error;
    }
  });
  return { schemaVersion: 1, group, activities };
}
