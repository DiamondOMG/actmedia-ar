import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ตารางสำหรับเก็บแผนที่ห้าง (Stores)
export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(), // เช่น 'demo_001'
  name: text("name").notNull(),
  floor: integer("floor").default(1),
  initialHeadingDeg: real("initial_heading_deg").default(0),
  proximityRadiusM: real("proximity_radius_m").default(2.5),
  
  // 💡 ออกแบบโดยเก็บเป็น JSON text เพื่อรองรับโครงสร้าง Graph ที่ซับซ้อน
  // ทำให้ฝั่ง Client ดึงไปคำนวณ A* Pathfinding และวาด Three.js ได้ใน Query เดียว (เร็วและจัดการง่ายมาก)
  waypointsJson: text("waypoints_json").notNull(),       // { "W1": { "x": 0, "z": 0, "label": "จุดเริ่มต้น" }, ... }
  edgesJson: text("edges_json").notNull(),               // [ ["W1", "W2"], ["W2", "W3"] ]
  destinationsJson: text("destinations_json").notNull(), // [ { "name": "ร้านอาหาร", "waypoint": "W5", "icon": "🏪" } ]
  
  comment: text("comment"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ตารางสำหรับเก็บผู้ใช้งาน (Admin/Staff) อิงตาม Clerk User ID
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // รับค่ามาจาก id ของ Clerk โดยตรง (เช่น user_2xxx...)
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: text("role").default("admin"), // สถานะแอดมินหรือร้านค้า (เผื่ออนาคต)
  
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
