import { config } from "../config.js";
import { createDatabase, seedDemoData } from "../db.js";

const db = await createDatabase(config);
try {
  await seedDemoData(db);
  const words = await db.models.Word.countDocuments({ userId: "demo-user" });
  const structures = await db.models.Structure.countDocuments({ userId: "demo-user" });
  console.log(`Seed complete: ${words} words and ${structures} structures for the demo user.`);
} finally {
  await db.close();
}
