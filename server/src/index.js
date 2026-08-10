import { createApp } from "./app.js";
import { config } from "./config.js";

let app;
let server;
let stopping = false;

async function start() {
  app = await createApp();
  server = app.listen(config.port, () => {
    console.log(`LingoBloom is running at http://localhost:${config.port}`);
    console.log(`MongoDB database: ${config.mongoDbName}`);
    if (!config.google.clientId || !config.google.clientSecret) {
      console.log("Google OAuth is not configured; demo login remains available.");
    }
  });
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal}: closing LingoBloom...`);
  if (server) await new Promise((resolve) => server.close(resolve));
  if (app?.locals?.db) await app.locals.db.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start().catch((error) => {
  console.error(`LingoBloom could not start: ${error.message}`);
  process.exitCode = 1;
});
