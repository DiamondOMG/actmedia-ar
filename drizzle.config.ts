import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// โหลดตัวแปรสภาพแวดล้อมจาก .env.local สำหรับ Drizzle CLI
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DB_URL!,
    authToken: process.env.TURSO_TOKEN!,
  },
});
