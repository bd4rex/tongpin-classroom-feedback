import { buildApp } from "../server/app.js";
import http from "node:http";
const mock = http.createServer(async (req, res) => {
  for await (const chunk of req) {
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content:
              "【联调模拟回答】把一个整体平均分成四份，取其中三份，就是四分之三。请结合课堂上的例子核实这个解释。这是测试输出，不是真实模型生成。",
          },
        },
      ],
    }),
  );
});
await new Promise((resolve) => mock.listen(3212, "127.0.0.1", resolve));
const app = await buildApp({
  dataDir: process.env.QA_DATA_DIR || "./output/browser-data",
  publicUrl: "http://127.0.0.1:3211",
});
await app.listen({ port: 3211, host: "127.0.0.1" });
console.log("独立浏览器测试服务：http://127.0.0.1:3211");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    mock.close();
    process.exit(0);
  });
