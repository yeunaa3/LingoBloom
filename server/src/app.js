import { existsSync } from "node:fs";
import { join } from "node:path";
import cors from "cors";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import { createPassport } from "./auth.js";
import { config as defaultConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { errorMiddleware } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { contentRoutes } from "./routes/content.js";
import { dictionaryRoutes } from "./routes/dictionary.js";
import { importRoutes } from "./routes/imports.js";
import { profileRoutes } from "./routes/profile.js";
import { reviewRoutes } from "./routes/reviews.js";
import { statsRoutes } from "./routes/stats.js";
import { systemRoutes } from "./routes/system.js";
import { DictionaryService } from "./services/dictionary.js";

export async function createApp(options = {}) {
  const runtimeConfig = options.config || defaultConfig;
  if (
    runtimeConfig.nodeEnv === "production"
    && (!runtimeConfig.sessionSecret || runtimeConfig.sessionSecret === "lingobloom-local-demo-secret-change-me")
  ) {
    throw new Error("SESSION_SECRET phải được cấu hình bằng một chuỗi bí mật mạnh khi chạy production.");
  }
  const db = options.db || await createDatabase(runtimeConfig);
  const passport = createPassport(db, runtimeConfig);
  const dictionaryService = options.dictionaryService || new DictionaryService(runtimeConfig.dictionary);
  const app = express();
  const allowedOrigins = String(runtimeConfig.clientUrl || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.disable("x-powered-by");
  if (runtimeConfig.secureCookies) app.set("trust proxy", 1);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  const sessionOptions = {
    name: "lingobloom.sid",
    secret: runtimeConfig.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: runtimeConfig.secureCookies,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  };
  if (options.sessionStore !== false) {
    sessionOptions.store = options.sessionStore || MongoStore.create({
      clientPromise: Promise.resolve(db.connection.getClient()),
      dbName: runtimeConfig.mongoDbName,
      collectionName: runtimeConfig.sessionCollection || "sessions",
      ttl: 30 * 24 * 60 * 60,
    });
  }
  app.use(session(sessionOptions));
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/api/health", async (_req, res) => {
    let databaseReady = db.connection.readyState === 1;
    if (databaseReady) {
      try {
        await db.connection.db.admin().ping();
      } catch {
        databaseReady = false;
      }
    }
    return res.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? "ok" : "degraded",
      database: "mongodb",
    });
  });
  app.use("/api", systemRoutes({ config: runtimeConfig }));
  app.use("/api/auth", authRoutes({ db, passport, config: runtimeConfig }));
  app.use("/api/users/me", profileRoutes({ db }));
  app.use("/api", contentRoutes({ db }));
  app.use("/api/import", importRoutes({ db }));
  app.use("/api/dictionary", dictionaryRoutes({ db, service: dictionaryService }));
  app.use("/api/reviews", reviewRoutes({ db }));
  app.use("/api/stats", statsRoutes({ db, timeZoneOffsetMinutes: runtimeConfig.timeZoneOffsetMinutes }));

  app.use("/api", (_req, res) =>
    res.status(404).json({
      message: "API endpoint không tồn tại.",
      error: { code: "API_NOT_FOUND", message: "API endpoint không tồn tại." },
    }),
  );

  const clientDist = join(runtimeConfig.serverRoot, "..", "client", "dist");
  if (runtimeConfig.serveClient && existsSync(join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => res.sendFile(join(clientDist, "index.html")));
  }

  app.use(errorMiddleware);
  app.locals.db = db;
  app.locals.config = runtimeConfig;
  return app;
}
