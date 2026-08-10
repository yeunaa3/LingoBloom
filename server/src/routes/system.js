import { Router } from "express";
import { googleOAuthConfigured } from "../config.js";

export const languages = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
];

export function systemRoutes({ config }) {
  const router = Router();
  router.get("/config", (_req, res) => {
    res.json({
      appName: "LingoBloom",
      googleOAuthEnabled: googleOAuthConfigured(config),
      googleOAuthConfigured: googleOAuthConfigured(config),
      demoAuthEnabled: config.demoAuthEnabled,
      demoMode: config.demoAuthEnabled,
      dictionaryProvider: config.dictionary.provider,
      maxImportBytes: 2 * 1024 * 1024,
    });
  });
  router.get("/languages", (_req, res) => res.json({ languages, data: languages }));
  return router;
}
