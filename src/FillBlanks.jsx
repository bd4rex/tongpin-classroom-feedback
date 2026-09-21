import React from "react";

export function BlankInputs({
  blanks,
  values = [],
  onChange,
  disabled = false,
}) {
  return (
    <div className="fill-blanks">
      {blanks.map((blank, i) => (
        <label key={i}>
          {i + 1}. {blank.label}
          <input
            required
            maxLength={300}
            value={values[i] ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange?.(
                blanks.map((_, n) =>
                  n === i ? e.target.value : (values[n] ?? ""),
                ),
              )
            }
            placeholder="在这里填入答案"
          />
        </label>
      ))}
    </div>
  );
}

export function BlankReferences({ blanks, references }) {
  if (!references?.some(Boolean)) return null;
  return (
    <div className="blank-references">
      <strong>填空参考答案</strong>
      <ol>
        {blanks.map((blank, i) => (
          <li key={i}>
            {blank.label}：{references[i] || "由老师结合回答讲评"}
          </li>
        ))}
      </ol>
      <p className="form-help">由老师结合题意讲评，开放表达可以有不同答案。</p>
    </div>
  );
}
