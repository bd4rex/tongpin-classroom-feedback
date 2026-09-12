import { buildApp } from "./app.js";
const app = await buildApp({ dev: process.argv.includes("--dev") });
const port = Number(process.env.PORT || 3210);
await app.listen({ port, host: process.env.HOST || "0.0.0.0" });
console.log(`同频课堂反馈已启动：http://127.0.0.1:${port}`);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
