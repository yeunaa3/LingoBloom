import { Passport } from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getUserById, upsertGoogleUser } from "./db.js";
import { googleOAuthConfigured } from "./config.js";

export function createPassport(db, runtimeConfig) {
  const passport = new Passport();

  passport.serializeUser((user, done) => done(null, String(user._id ?? user.id)));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, (await getUserById(db, id)) || false);
    } catch (error) {
      done(error);
    }
  });

  if (googleOAuthConfigured(runtimeConfig)) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: runtimeConfig.google.clientId,
          clientSecret: runtimeConfig.google.clientSecret,
          callbackURL: runtimeConfig.google.callbackUrl,
          state: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            done(null, await upsertGoogleUser(db, profile));
          } catch (error) {
            done(error);
          }
        },
      ),
    );
  }

  return passport;
}

export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.() && req.user) return next();
  return res.status(401).json({
    message: "Vui lòng đăng nhập để tiếp tục.",
    error: {
      code: "AUTH_REQUIRED",
      message: "Vui lòng đăng nhập để tiếp tục.",
    },
  });
}
