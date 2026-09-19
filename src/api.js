export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "服务返回异常，请稍后重试" }));
  if (!response.ok)
    throw Object.assign(new Error(data.error || "操作失败"), {
      status: response.status,
    });
  return data;
}
export const post = (path, body = {}) =>
  api(path, { method: "POST", body: JSON.stringify(body) });
