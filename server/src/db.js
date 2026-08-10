import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

const now = () => new Date();
const contentId = () => randomUUID();

export function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase();
}

function createModels(connection) {
  const commonOptions = { versionKey: false };

  const userSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      googleId: { type: String, default: null },
      email: { type: String, required: true, trim: true, lowercase: true },
      displayName: { type: String, required: true, trim: true },
      avatarUrl: { type: String, default: null },
      learningLanguage: { type: String, required: true, default: "en" },
      nativeLanguage: { type: String, required: true, default: "vi" },
      onboardingCompleted: { type: Boolean, default: false },
      isDemo: { type: Boolean, default: false },
    },
    { ...commonOptions, timestamps: true },
  );
  userSchema.index({ email: 1 }, { unique: true });
  userSchema.index(
    { googleId: 1 },
    { unique: true, partialFilterExpression: { googleId: { $type: "string" } } },
  );

  const reviewFields = {
    repetitions: { type: Number, default: 0, min: 0 },
    intervalDays: { type: Number, default: 0, min: 0 },
    easeFactor: { type: Number, default: 2.5, min: 1.3 },
    dueAt: { type: Date, required: true, default: now },
    lastReviewedAt: { type: Date, default: null },
  };

  const wordSchema = new mongoose.Schema(
    {
      _id: { type: String, default: contentId },
      userId: { type: String, required: true, index: true },
      term: { type: String, required: true, trim: true },
      termKey: { type: String, required: true },
      translation: { type: String, required: true, default: "" },
      pronunciation: { type: String, default: "" },
      partOfSpeech: { type: String, default: "" },
      example: { type: String, default: "" },
      notes: { type: String, default: "" },
      source: { type: String, default: "manual" },
      language: { type: String, required: true },
      nativeLanguage: { type: String, required: true },
      bookmarked: { type: Boolean, default: false },
      ...reviewFields,
    },
    { ...commonOptions, timestamps: true },
  );
  wordSchema.index({ userId: 1, language: 1, termKey: 1 }, { unique: true });
  wordSchema.index({ userId: 1, dueAt: 1 });
  wordSchema.index({ userId: 1, bookmarked: 1 });
  wordSchema.index({ userId: 1, createdAt: -1 });

  const structureSchema = new mongoose.Schema(
    {
      _id: { type: String, default: contentId },
      userId: { type: String, required: true, index: true },
      pattern: { type: String, required: true, trim: true },
      patternKey: { type: String, required: true },
      meaning: { type: String, required: true, default: "" },
      example: { type: String, default: "" },
      notes: { type: String, default: "" },
      language: { type: String, required: true },
      bookmarked: { type: Boolean, default: false },
      ...reviewFields,
    },
    { ...commonOptions, timestamps: true },
  );
  structureSchema.index({ userId: 1, language: 1, patternKey: 1 }, { unique: true });
  structureSchema.index({ userId: 1, dueAt: 1 });
  structureSchema.index({ userId: 1, bookmarked: 1 });
  structureSchema.index({ userId: 1, createdAt: -1 });

  const reviewSchema = new mongoose.Schema(
    {
      _id: { type: String, default: contentId },
      userId: { type: String, required: true, index: true },
      itemType: { type: String, required: true, enum: ["word", "structure"] },
      itemId: { type: String, required: true },
      rating: { type: Number, required: true, min: 0, max: 3 },
      correct: { type: Boolean, required: true },
      reviewedAt: { type: Date, required: true, default: now },
      nextDueAt: { type: Date, required: true },
    },
    commonOptions,
  );
  reviewSchema.index({ userId: 1, reviewedAt: -1 });
  reviewSchema.index({ userId: 1, itemType: 1, itemId: 1 });

  const appMetaSchema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      value: { type: mongoose.Schema.Types.Mixed, required: true },
      updatedAt: { type: Date, default: now },
    },
    commonOptions,
  );

  return {
    User: connection.model("User", userSchema),
    Word: connection.model("Word", wordSchema),
    Structure: connection.model("Structure", structureSchema),
    Review: connection.model("Review", reviewSchema),
    AppMeta: connection.model("AppMeta", appMetaSchema),
  };
}

export async function createDatabase(input = {}) {
  const runtime = typeof input === "string" ? { mongoUri: input } : input;
  const mongoUri = runtime.mongoUri || runtime.uri || process.env.MONGODB_URI || "";
  const mongoDbName = runtime.mongoDbName || runtime.dbName || process.env.MONGODB_DB_NAME || "lingobloom";
  if (!mongoUri) {
    const error = new Error(
      "MONGODB_URI chưa được cấu hình. Hãy tạo MongoDB Atlas và thêm chuỗi kết nối vào tệp .env.",
    );
    error.code = "MONGODB_URI_REQUIRED";
    throw error;
  }

  const connection = await mongoose
    .createConnection(mongoUri, {
      dbName: mongoDbName,
      serverSelectionTimeoutMS: Number(runtime.mongoConnectTimeoutMs || 10_000),
      maxPoolSize: Number(runtime.mongoMaxPoolSize || 10),
    })
    .asPromise();
  const models = createModels(connection);
  await Promise.all(Object.values(models).map((model) => model.init()));

  const db = {
    connection,
    models,
    startSession: () => connection.startSession(),
    close: () => connection.close(),
  };
  await seedDemoData(db);
  return db;
}

export async function seedDemoData(db) {
  const { User, Word, Structure, AppMeta } = db.models;
  await User.updateOne(
    { _id: "demo-user" },
    {
      $setOnInsert: {
        _id: "demo-user",
        email: "demo@lingobloom.local",
        displayName: "Linh (Demo)",
        avatarUrl: null,
        learningLanguage: "en",
        nativeLanguage: "vi",
        onboardingCompleted: false,
        isDemo: true,
      },
    },
    { upsert: true },
  );

  if (await AppMeta.exists({ _id: "demo_seed_v1" })) return;

  const session = await db.startSession();
  try {
    await session.withTransaction(async () => {
      if (await AppMeta.exists({ _id: "demo_seed_v1" }).session(session)) return;
      const stamp = now();
      if ((await Word.countDocuments({ userId: "demo-user" }).session(session)) === 0) {
        await Word.insertMany(
          [
            {
              _id: "sample-word-serendipity",
              userId: "demo-user",
              term: "serendipity",
              termKey: normalizeKey("serendipity"),
              translation: "sự tình cờ may mắn",
              pronunciation: "/ˌser.ənˈdɪp.ə.ti/",
              partOfSpeech: "noun",
              example: "Finding this little cafe was pure serendipity.",
              source: "sample",
              language: "en",
              nativeLanguage: "vi",
              bookmarked: true,
              dueAt: stamp,
              createdAt: stamp,
              updatedAt: stamp,
            },
            {
              _id: "sample-word-resilient",
              userId: "demo-user",
              term: "resilient",
              termKey: normalizeKey("resilient"),
              translation: "kiên cường",
              pronunciation: "/rɪˈzɪl.i.ənt/",
              partOfSpeech: "adjective",
              example: "She remained resilient through every challenge.",
              source: "sample",
              language: "en",
              nativeLanguage: "vi",
              dueAt: stamp,
              createdAt: stamp,
              updatedAt: stamp,
            },
            {
              _id: "sample-word-wander",
              userId: "demo-user",
              term: "wander",
              termKey: normalizeKey("wander"),
              translation: "đi lang thang",
              pronunciation: "/ˈwɒn.dər/",
              partOfSpeech: "verb",
              example: "We wandered through the old town.",
              source: "sample",
              language: "en",
              nativeLanguage: "vi",
              dueAt: stamp,
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
          { session },
        );
      }
      if ((await Structure.countDocuments({ userId: "demo-user" }).session(session)) === 0) {
        await Structure.create(
          [
            {
              _id: "sample-structure-it-takes",
              userId: "demo-user",
              pattern: "It takes + time + to + V",
              patternKey: normalizeKey("It takes + time + to + V"),
              meaning: "Mất bao lâu để làm gì",
              example: "It takes twenty minutes to walk there.",
              language: "en",
              bookmarked: true,
              dueAt: stamp,
              createdAt: stamp,
              updatedAt: stamp,
            },
          ],
          { session },
        );
      }
      await AppMeta.create(
        [{ _id: "demo_seed_v1", value: stamp.toISOString(), updatedAt: stamp }],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export async function getUserById(db, id) {
  if (!id) return null;
  const user = await db.models.User.findById(String(id)).lean();
  return user ? { ...user, id: String(user._id) } : null;
}

export async function upsertGoogleUser(db, profile) {
  const email = String(profile.emails?.[0]?.value || `${profile.id}@google.local`).toLowerCase();
  const avatarUrl = profile.photos?.[0]?.value || null;
  const displayName = profile.displayName || "Google user";
  let user = await db.models.User.findOne({ $or: [{ googleId: profile.id }, { email }] });
  if (user) {
    user.googleId = profile.id;
    user.displayName = displayName || user.displayName;
    user.avatarUrl = avatarUrl;
    await user.save();
    return user.toObject();
  }
  try {
    user = await db.models.User.create({
      _id: `google-${profile.id}`,
      googleId: profile.id,
      email,
      displayName,
      avatarUrl,
      learningLanguage: "en",
      nativeLanguage: "vi",
      onboardingCompleted: false,
      isDemo: false,
    });
    return user.toObject();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return db.models.User.findOne({ $or: [{ googleId: profile.id }, { email }] }).lean();
  }
}

export function serializeUser(row) {
  if (!row) return null;
  const user = typeof row.toObject === "function" ? row.toObject() : row;
  const id = String(user._id ?? user.id);
  return {
    id,
    email: user.email,
    name: user.displayName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || "",
    isDemo: Boolean(user.isDemo),
    onboardingCompleted: Boolean(user.onboardingCompleted),
    learningLanguage: user.learningLanguage,
    nativeLanguage: user.nativeLanguage,
    preferences: {
      learningLanguage: user.learningLanguage,
      nativeLanguage: user.nativeLanguage,
    },
  };
}
