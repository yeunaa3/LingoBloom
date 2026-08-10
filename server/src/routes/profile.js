import { Router } from "express";
import { getUserById, serializeUser } from "../db.js";
import { requireAuth } from "../auth.js";
import { asyncHandler, notFound, text } from "../http.js";

const authenticatedUserId = (req) => String(req.user._id ?? req.user.id);

const languageCode = (value, name) => {
  const code = text(value, { name, max: 12, required: true }).toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(code)) {
    const error = new Error(`${name} không hợp lệ.`);
    error.status = 400;
    error.code = "INVALID_LANGUAGE";
    throw error;
  }
  return code;
};

export function profileRoutes({ db }) {
  const router = Router();
  router.use(requireAuth);

  const update = asyncHandler(async (req, res) => {
    const userId = authenticatedUserId(req);
    const current = await getUserById(db, userId);
    if (!current) throw notFound("Người dùng");
    const learningLanguage =
      req.body.learningLanguage == null
        ? current.learningLanguage
        : languageCode(req.body.learningLanguage, "Ngôn ngữ đang học");
    const nativeLanguage =
      req.body.nativeLanguage == null
        ? current.nativeLanguage
        : languageCode(req.body.nativeLanguage, "Ngôn ngữ mẹ đẻ");
    const displayName =
      req.body.displayName == null
        ? current.displayName
        : text(req.body.displayName, { name: "Tên hiển thị", max: 80, required: true });

    if (learningLanguage === nativeLanguage) {
      const error = new Error("Ngôn ngữ đang học và ngôn ngữ mẹ đẻ cần khác nhau.");
      error.status = 400;
      error.code = "LANGUAGES_MUST_DIFFER";
      throw error;
    }

    const user = await db.models.User.findByIdAndUpdate(
      userId,
      {
        $set: {
          learningLanguage,
          nativeLanguage,
          displayName,
          onboardingCompleted: true,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after", runValidators: true },
    );
    if (!user) throw notFound("Người dùng");
    res.json({ user: serializeUser(user) });
  });

  router.patch("/preferences", update);
  router.put("/preferences", update);
  return router;
}
