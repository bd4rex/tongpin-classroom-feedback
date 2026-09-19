const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const stop = new Set(
  "我们 你们 他们 这个 那个 这些 那些 一个 一些 可以 觉得 因为 所以 然后 但是 就是 还有 已经 需要 自己 没有 什么 怎么 今天 老师 同学 学生 课堂 学习 知道 理解 认为 比较 非常 真的 进行 以及 对于 通过 不是 这样 那样 时候 问题 回答 说明 表示 例子 the and for with this that are was have has not you your our can will from they them about into".split(
    " ",
  ),
);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function buildWordCloud(
  rows,
  totalResponses,
  identities = [],
  hiddenWords = [],
) {
  const excluded = new Set(hiddenWords.map((s) => s.toLocaleLowerCase()));
  const privateValues = [
    ...new Set(
      [...identities, ...hiddenWords].filter(
        (s) => typeof s === "string" && s.length > 0,
      ),
    ),
  ].sort((a, b) => b.length - a.length);
  const masks = [];
  for (let i = 0; i < privateValues.length; i += 200)
    masks.push(
      new RegExp(
        privateValues
          .slice(i, i + 200)
          .map(escape)
          .join("|"),
        "giu",
      ),
    );
  const counts = new Map();
  let sampleSize = 0,
    characters = 0,
    clipped = false;
  for (const row of rows) {
    if (characters >= 24000) {
      clipped = true;
      break;
    }
    const answer = JSON.parse(row.content);
    let text =
      answer.text ??
      [answer.takeaway, answer.question].filter(Boolean).join(" ");
    // Do not derive cloud terms from collected identifiers or common contact formats.
    for (const mask of masks) text = text.replace(mask, " ");
    text = text.replace(
      /https?:\/\/\S+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\+?\d[\d\s-]{5,}\d/giu,
      " ",
    );
    if (text.length > 24000 - characters) clipped = true;
    text = text.slice(0, 24000 - characters);
    characters += text.length;
    sampleSize++;
    const mentioned = new Set();
    for (const item of segmenter.segment(text)) {
      const term = item.segment.toLocaleLowerCase();
      if (
        !item.isWordLike ||
        term.length < 2 ||
        term.length > 18 ||
        /^\d+$/u.test(term) ||
        stop.has(term) ||
        excluded.has(term)
      )
        continue;
      mentioned.add(term);
    }
    for (const term of mentioned) counts.set(term, (counts.get(term) || 0) + 1);
  }
  const terms = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
    .slice(0, 50)
    .map(([text, count]) => ({ text, count }));
  return {
    terms,
    sampleSize,
    totalResponses,
    sampled: sampleSize < totalResponses || clipped,
    characters,
    unit: "提及该词的回答数，同一回答重复出现只计一次",
  };
}
