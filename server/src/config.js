import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverRoot = dirname(dirname(fileURLToPath(import.meta.url)));

for (const candidate of [join(serverRoot, "..", ".env"), join(serverRoot, ".env")]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate });
}

const bool = (value, fallback) => {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
};

const port = Number(process.env.PORT || 3001);
const renderUrl = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : "";
const publicUrl = process.env.CLIENT_URL || renderUrl || `http://localhost:${port === 3001 ? 5173 : port}`;
const parsedTimeZoneOffset = Number(process.env.APP_TIME_ZONE_OFFSET_MINUTES ?? 420);

export const config = {
  serverRoot,
  port,
  clientUrl: publicUrl,
  sessionSecret: process.env.SESSION_SECRET || "lingobloom-local-demo-secret-change-me",
  sessionCollection: process.env.SESSION_COLLECTION || "sessions",
  secureCookies: bool(process.env.SECURE_COOKIES, process.env.NODE_ENV === "production"),
  demoAuthEnabled: bool(process.env.DEMO_AUTH_ENABLED, true),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      `${renderUrl || `http://localhost:${port}`}/api/auth/google/callback`,
  },
  mongoUri: process.env.MONGODB_URI || "",
  mongoDbName: process.env.MONGODB_DB_NAME || "lingobloom",
  mongoConnectTimeoutMs: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 10_000),
  mongoMaxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10),
  dictionary: {
    provider: process.env.DICTIONARY_PROVIDER || "free_dictionary",
    baseUrl:
      process.env.DICTIONARY_API_BASE_URL ||
      "https://api.dictionaryapi.dev/api/v2/entries",
    suggestionBaseUrl:
      process.env.DICTIONARY_SUGGEST_API_BASE_URL ||
      "https://api.datamuse.com/sug",
    translationBaseUrl:
      process.env.DICTIONARY_TRANSLATION_API_BASE_URL ||
      "https://api.mymemory.translated.net/get",
    selectionTtlSeconds: Math.max(
      60,
      Math.min(900, Number(process.env.DICTIONARY_SELECTION_TTL_SECONDS || 300) || 300),
    ),
  },
  serveClient: bool(process.env.SERVE_CLIENT, true),
  nodeEnv: process.env.NODE_ENV || "development",
  timeZoneOffsetMinutes: Number.isFinite(parsedTimeZoneOffset)
    ? Math.max(-720, Math.min(840, parsedTimeZoneOffset))
    : 420,
};

export const googleOAuthConfigured = (runtimeConfig = config) =>
  Boolean(runtimeConfig.google.clientId && runtimeConfig.google.clientSecret);
