import { collectionConfig } from "./collection.js";
import { buildWordCloud } from "./word-cloud.js";

export function createDashboard(store) {
  const cache = new Map();
  return {
    invalidate(roomId) {
      for (const key of cache.keys())
        if (key.startsWith(`${roomId}|`)) cache.delete(key);
    },
    read(roomId, activityId, shared = false) {
      const key = `${roomId}|${shared ? "shared" : "teacher"}|${activityId || ""}`;
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return cached.value;
      const state = store.teacherState(roomId);
      const config = collectionConfig(state.room);
      const activities = state.activities.filter((a) => a.status !== "draft");
      const selected =
        activities.find((a) => a.id === activityId) ||
        activities.find((a) => a.id === state.room.current_activity_id) ||
        activities[0];
      const regions = store.all(
        "SELECT city,school,class_name AS className,COUNT(*) AS participants,COALESCE(SUM(last_seen>?),0) AS online FROM participants WHERE classroom_id=? GROUP BY city,school,class_name ORDER BY participants DESC,city,school,class_name LIMIT 50",
        Date.now() - 75000,
        roomId,
      );
      const regionCount = store.get(
        "SELECT COUNT(*) AS n FROM (SELECT city,school,class_name FROM participants WHERE classroom_id=? GROUP BY city,school,class_name)",
        roomId,
      ).n;
      const submittedParticipants = store.get(
        "SELECT COUNT(DISTINCT an.participant_id) AS n FROM answers an JOIN activities a ON a.id=an.activity_id WHERE a.classroom_id=?",
        roomId,
      ).n;
      let detail = null;
      if (selected) {
        const visible = !shared || !!selected.revealed;
        let cloud = null;
        if (
          visible &&
          config.display.wordCloud &&
          ["text", "exit", "ai"].includes(selected.type)
        ) {
          const rows = store.all(
            "SELECT content FROM answers WHERE activity_id=? ORDER BY created_at DESC,id DESC LIMIT 300",
            selected.id,
          );
          const identities = store
            .all(
              "SELECT name,student_no,nickname FROM participants WHERE classroom_id=?",
              roomId,
            )
            .flatMap((p) => [p.name, p.student_no, p.nickname]);
          cloud = buildWordCloud(
            rows,
            selected.stats.submitted,
            identities,
            config.display.hiddenWords,
          );
        }
        detail = {
          id: selected.id,
          title: selected.title,
          type: selected.type,
          status: selected.status,
          visible,
          revealed: !!selected.revealed,
          submitted: selected.stats.submitted,
          total: selected.stats.total,
          distribution: visible ? selected.stats.distribution : [],
          correctRate: visible ? selected.stats.correctRate : null,
          wordCloud: cloud,
        };
      }
      const value = {
        updatedAt: new Date().toISOString(),
        room: {
          id: roomId,
          title: state.room.title,
          subject: state.room.subject,
          code: state.room.code,
          status: state.room.status,
        },
        overview: {
          participants: state.room.total,
          online: state.room.online,
          schools: state.room.schools,
          cities: store.get(
            "SELECT COUNT(DISTINCT city) AS n FROM participants WHERE classroom_id=? AND city!=''",
            roomId,
          ).n,
          submittedParticipants,
          answers: activities.reduce((n, a) => n + a.stats.submitted, 0),
          tasks: activities.length,
        },
        groups: state.groups
          .filter((g) => g.status !== "draft")
          .map((g) => ({
            id: g.id,
            title: g.title,
            status: g.status,
            progress: {
              total: g.progress.total,
              completed: g.progress.completed,
              inProgress: g.progress.inProgress,
              notStarted: g.progress.notStarted,
              taskCount: g.progress.taskCount,
            },
          })),
        activities: activities.map((a) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          submitted: a.stats.submitted,
          groupTitle: state.groups.find((g) => g.id === a.group_id)?.title,
        })),
        regions,
        regionCount,
        selected: detail,
      };
      if (cache.size >= 64) cache.clear();
      cache.set(key, { value, until: Date.now() + 2000 });
      return value;
    },
  };
}
