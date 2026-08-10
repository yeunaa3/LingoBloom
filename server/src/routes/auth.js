import { Router } from "express";
import { getUserById, serializeUser } from "../db.js";
import { googleOAuthConfigured } from "../config.js";
import { ApiError, asyncHandler } from "../http.js";

export function authRoutes({ db, passport, config }) {
  const router = Router();

  router.get("/me", (req, res) => {
    const user = req.isAuthenticated?.() ? serializeUser(req.user) : null;
    res.json({
      user,
      authenticated: Boolean(user),
      googleOAuthEnabled: googleOAuthConfigured(config),
      demoAuthEnabled: config.demoAuthEnabled,
    });
  });

  router.post("/demo", asyncHandler(async (req, res) => {
    if (!config.demoAuthEnabled) {
      return res.status(403).json({
        message: "Chế độ đăng nhập demo đã tắt.",
        error: { code: "DEMO_AUTH_DISABLED", message: "Chế độ đăng nhập demo đã tắt." },
      });
    }
    const user = await getUserById(db, "demo-user");
    if (!user) {
      throw new ApiError(503, "DEMO_USER_UNAVAILABLE", "Tài khoản demo chưa sẵn sàng.");
    }
    await new Promise((resolve, reject) => {
      req.logIn(user, (error) => (error ? reject(error) : resolve()));
    });
    return res.json({ user: serializeUser(user), authenticated: true, mode: "demo" });
  }));

  router.get("/google", (req, res, next) => {
    if (!googleOAuthConfigured(config)) {
      return res.status(503).json({
        message: "Google OAuth chưa được cấu hình. Hãy dùng chế độ demo hoặc thêm credentials vào .env.",
        error: {
          code: "GOOGLE_OAUTH_NOT_CONFIGURED",
          message: "Google OAuth chưa được cấu hình. Hãy dùng chế độ demo hoặc thêm credentials vào .env.",
        },
        demoAuthEnabled: config.demoAuthEnabled,
      });
    }
    return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  router.get("/google/callback", (req, res, next) => {
    if (!googleOAuthConfigured(config)) {
      return res.redirect(`${config.clientUrl}/login?error=google_not_configured`);
    }
    return passport.authenticate("google", (error, user) => {
      if (error || !user) {
        return res.redirect(`${config.clientUrl}/login?error=google_login_failed`);
      }
      return req.logIn(user, (loginError) => {
        if (loginError) return next(loginError);
        return res.redirect(`${config.clientUrl}/auth/callback?success=1`);
      });
    })(req, res, next);
  });

  router.post("/logout", (req, res, next) => {
    const finish = () => {
      if (!req.session) return res.json({ success: true });
      return req.session.destroy((error) => {
        if (error) return next(error);
        res.clearCookie("lingobloom.sid");
        return res.json({ success: true });
      });
    };
    if (req.isAuthenticated?.()) return req.logout((error) => (error ? next(error) : finish()));
    return finish();
  });

  return router;
}
