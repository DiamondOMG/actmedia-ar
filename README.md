# 📍 AR Navigate — WebAR In-Store Navigation

ระบบนำทางภายในอาคาร (Indoor Navigation) ด้วย **Augmented Reality** บนเว็บเบราว์เซอร์  
ลูกค้าแค่ **สแกน QR Code → เปิดกล้อง → เดินตามลูกศร AR** ไปถึงร้านที่ต้องการ ไม่ต้องติดตั้งแอป

---

## 🏗️ Tech Stack

| Layer          | Technology                     | หมายเหตุ |
|---------------|--------------------------------|----------|
| Framework     | **Next.js 16** (App Router)    | Canary, deploy บน Vercel |
| AR Engine     | **8th Wall** (WebXR SLAM)      | โหลดผ่าน CDN `<Script>` ใน layout |
| 3D Rendering  | **Three.js**                   | วาดลูกศรนำทาง 3D |
| Auth          | **Clerk**                      | Sign-in/up + middleware protect |
| Database      | **Turso** (libSQL / SQLite)    | Edge-ready, no cold start |
| ORM           | **Drizzle ORM**                | Type-safe, schema ใน `lib/schema.ts` |
| Styling       | **Tailwind CSS v4**            | PostCSS plugin |
| Icons         | **Lucide React**               | |
| Package Mgr   | **pnpm**                       | v9.15.4 |

---

## ✨ ฟีเจอร์ปัจจุบัน

### 📱 ฝั่งผู้ใช้ (AR Navigation)
- **เปิดกล้อง AR** ผ่านเบราว์เซอร์ด้วย 8th Wall SLAM (ไม่ต้องลงแอป)
- **ลูกศร 3D นำทาง** ลอยอยู่หน้ากล้อง ชี้ไปยังจุดหมายถัดไป (bounce animation)
- **A\* Pathfinding** คำนวณเส้นทางสั้นที่สุดจากจุดเริ่มต้น (W1) ไปยัง Waypoint ปลายทาง
- **เมนูเลือกร้านปลายทาง** (Full-screen overlay) + แสดงระยะทาง real-time
- **สลับแผนที่นำทาง** ได้จากเมนู hamburger
- **Tracking Warning** แจ้งเตือนเมื่อ SLAM หาพื้นที่ไม่เจอ
- **หน้าจอ "ถึงที่หมายแล้ว"** พร้อมปุ่มเลือกร้านอื่น
- **Fallback** ถ้าไม่เจอข้อมูลใน DB จะโหลดจาก `/public/stores/{id}.json`

### 🛠️ ฝั่งแอดมิน (Dashboard)
- **Dashboard** แสดงรายการแผนที่ของ user (protected by Clerk auth)
- **สร้างแผนที่ใหม่** (`/dashboard/record`) — เปิดกล้อง AR แล้วเดินปัก Waypoint ด้วยมือถือจริง
  - กดปุ่มวงกลมเพื่อปัก checkpoint → ระบบสร้าง edges เชื่อมอัตโนมัติ
  - Auto-generate 5 demo destinations ตอนเซฟ
  - บันทึกลง Turso DB ผ่าน `POST /api/stores`
- **Calibrate AR** (`/ar/calibrate`) — ปรับ Scale Factor เพื่อชดเชยความคลาดเคลื่อนระยะทาง SLAM vs จริง
  - เดิน 10 เมตรจริง → ระบบคำนวณตัวคูณชดเชย
  - เก็บค่าลง `localStorage` (`ar_scale_factor`)

### 🔐 Authentication
- Clerk sign-in / sign-up (หน้า `/sign-in`, `/sign-up`)
- Webhook sync user → DB (ตาราง `users`) ผ่าน `/api/webhooks`
- Dashboard protected: redirect ไป sign-in ถ้ายังไม่ login

---

## 📁 โครงสร้างโปรเจค

```
ar-navigate/
├── app/
│   ├── layout.tsx              # Root layout: ClerkProvider + 8th Wall Scripts + XRGuard
│   ├── page.tsx                # Landing page (Hero + Features)
│   ├── globals.css             # Tailwind base
│   ├── sign-in/                # Clerk sign-in page
│   ├── sign-up/                # Clerk sign-up page
│   ├── ar/
│   │   ├── page.tsx            # หน้า AR Navigation (dynamic import ARScene, ssr:false)
│   │   └── calibrate/          # หน้า AR Scale Calibrator
│   ├── dashboard/
│   │   ├── page.tsx            # Dashboard หลัก (แสดงรายการแผนที่)
│   │   └── record/             # หน้าบันทึกแผนที่ใหม่ (dynamic import ARRecordScene)
│   └── api/
│       ├── stores/
│       │   ├── route.ts        # GET: ดึงแผนที่ทั้งหมด / POST: สร้างแผนที่ใหม่ (auth required)
│       │   └── [id]/route.ts   # GET: ดึงแผนที่ตาม ID (แปลงเป็น StoreData format)
│       └── webhooks/           # Clerk webhook handler (sync user)
│
├── components/
│   ├── ARScene.tsx             # Client component: AR Navigation หลัก (8th Wall + Three.js)
│   ├── ARCalibrateScene.tsx    # Client component: หน้า Calibrate สเกลระยะ
│   ├── ARRecordScene.tsx       # Client component: หน้าเดินปัก Waypoint สร้างแผนที่
│   ├── NavbarUser.tsx          # Clerk UserButton component
│   └── XRGuard.tsx             # Guard component สำหรับ inject 8th Wall API key
│
├── lib/
│   ├── schema.ts               # Drizzle schema — tables: stores, users
│   ├── db.ts                   # Drizzle + libSQL client connection
│   ├── store-loader.ts         # โหลดข้อมูลแผนที่จาก API → fallback static JSON
│   ├── navigation.ts           # A* Pathfinding algorithm (buildGraph, findShortestPath)
│   ├── position-provider.ts    # Singleton จัดการตำแหน่งจาก SLAM (scale + heading offset)
│   ├── scene-init.ts           # 8th Wall Pipeline Module: init scene + navigation loop
│   └── arrow.ts                # NavigationArrow class: ลูกศร 3D (ExtrudeGeometry + animation)
│
├── drizzle/                    # Migration files
├── drizzle.config.ts           # Drizzle Kit config (Turso credentials)
├── public/stores/              # Static fallback JSON สำหรับแผนที่ demo
├── docs/architecture.md        # เอกสารสถาปัตยกรรมระบบ (ภาษาไทย)
└── proxy.ts                    # Dev proxy helper
```

---

## 🗄️ Database Schema

### ตาราง `stores` (แผนที่ห้าง)

| Column              | Type      | คำอธิบาย |
|---------------------|-----------|----------|
| `id`                | TEXT PK   | เช่น `demo_001`, `map_1718600000000` |
| `user_id`           | TEXT      | Clerk User ID ของเจ้าของ |
| `name`              | TEXT      | ชื่อห้าง/สถานที่ |
| `floor`             | INTEGER   | ชั้น (default: 1) |
| `initial_heading_deg` | REAL    | มุมเริ่มต้น AR (องศา) |
| `proximity_radius_m` | REAL     | รัศมีตรวจจับ "ถึงจุดหมาย" (default: 1.5m) |
| `waypoints_json`    | TEXT      | JSON ของ Waypoints: `{ "W1": { "x": 0, "z": 0, "label": "..." } }` |
| `edges_json`        | TEXT      | JSON ของ Edges: `[["W1","W2"], ["W2","W3"]]` |
| `destinations_json` | TEXT      | JSON ของ Destinations: `[{ "name": "...", "waypoint": "W5", "icon": "🏪" }]` |
| `comment`           | TEXT      | หมายเหตุ |
| `created_at`        | INTEGER   | Timestamp |
| `updated_at`        | INTEGER   | Timestamp |

### ตาราง `users` (ผู้ใช้แอดมิน)

| Column       | Type      | คำอธิบาย |
|-------------|-----------|----------|
| `id`        | TEXT PK   | Clerk User ID |
| `email`     | TEXT      | อีเมล (unique) |
| `first_name`| TEXT      | ชื่อ |
| `last_name` | TEXT      | นามสกุล |
| `role`      | TEXT      | สิทธิ์ (default: `admin`) |

---

## 🔄 Data Flow

### ผู้ใช้ทั่วไป (AR Navigation)
```
QR Code (รูปแบบใหม่) → /ar/navigate?map={map_id}&point={start_point}&goto={target_point}
(หรือลิงก์รูปแบบเดิม: /ar?store={store_id}&start={start_point}&target={target_point} - มีระบบ Redirect รองรับ)
  → ARScene (client) → fetch /api/stores/{id}
    → Drizzle query Turso DB → return StoreData JSON
  → A* pathfinding คำนวณเส้นทาง (คำนวณใหม่ทันทีหากจุดสแกนปัจจุบันหรือเป้าหมายเปลี่ยน)
  → Three.js วาดลูกศร 3D นำทาง real-time
  → PositionProvider ติดตามตำแหน่งจาก SLAM
```

#### 🔗 โครงสร้าง URL สำหรับ QR Code นำทาง
คุณสามารถสร้าง QR Code ติดไว้ตามพื้นที่ต่างๆ โดยใช้ Query Parameters ได้ดังนี้:
- **`map`** (หรือคีย์เดิม `store`): ID ของแผนที่/ห้าง (เช่น `demo_001`) — *จำเป็น*
- **`point`** (หรือคีย์เดิม `start`): รหัส Waypoint ที่แปะ QR Code นั้นอยู่ (เช่น `W2`) เพื่อระบุพิกัดปัจจุบันของผู้ใช้เมื่อเริ่มสแกน — *ไม่บังคับ*
- **`goto`** หรือ **`destination`** (หรือคีย์เดิม `target`): รหัส Waypoint ปลายทางที่ต้องการให้ล็อกเป้าหมายนำทางไปทันที (เช่น `W5`) — *ไม่บังคับ (หากไม่ระบุ ระบบจะแสดงปุ่มเมนูให้ผู้ใช้เลือกปลายทางเอง)*

---

### แอดมิน (สร้างแผนที่)
```
Dashboard → /dashboard/record
  → ARRecordScene เปิดกล้อง
  → Admin เดินปัก Waypoint ทีละจุด
  → กด Complete → ใส่ชื่อห้าง → POST /api/stores
    → Clerk auth verify → Drizzle insert Turso DB
```

---

## 🧩 Core Concepts

### Waypoint & Edge Graph
- **Waypoint**: จุดพิกัด 2D (x, z) ในพื้นที่ SLAM — เก็บเป็น object `{ W1: {x,z,label}, W2: ... }`
- **Edge**: เส้นเชื่อมระหว่าง 2 Waypoints (undirected) — เก็บเป็น array `[["W1","W2"], ...]`
- **Destination**: ร้านค้าปลายทาง ผูกกับ Waypoint ID

### PositionProvider (Singleton)
- รับพิกัดดิบจาก 8th Wall SLAM
- คูณ `scaleFactor` เพื่อชดเชยระยะทาง
- หมุนด้วย `headingOffsetRad` เพื่อแก้ทิศ
- รองรับ Layer system + Correction API

### NavigationArrow (Three.js)
- ลูกศร 3D สร้างจาก `ExtrudeGeometry` + `MeshStandardMaterial`
- ลอยอยู่หน้ากล้อง 1.5m ตาม camera direction
- หมุนชี้ไปยัง Waypoint เป้าหมาย (lerp smooth)
- Animation: bounce / pulse

---

## ⚙️ Environment Variables

สร้างไฟล์ `.env.local`:

```env
# Turso Database
TURSO_DB_URL=libsql://your-db.turso.io
TURSO_TOKEN=your-auth-token

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# 8th Wall (inject ผ่าน XRGuard component)
NEXT_PUBLIC_8THWALL_API_KEY=your-api-key
```

---

## 🚀 Getting Started

```bash
# ติดตั้ง dependencies
pnpm install

# สร้าง/migrate database
pnpm drizzle-kit push

# รัน dev server
pnpm dev
```

เปิด [http://localhost:3000](http://localhost:3000) — ต้องเปิดบนมือถือ (หรือ ngrok) เพื่อใช้งาน AR จริง

---

## 📌 สถานะโปรเจค & สิ่งที่ยังไม่ได้ทำ

- [ ] แก้ไข/ลบแผนที่ที่สร้างแล้ว (Edit/Delete store)
- [ ] แก้ไข Destinations หลังสร้างแผนที่ (ตอนนี้ auto-gen 5 demo)
- [ ] Map Editor 2D — ลาก Waypoint/Edge บนหน้าเว็บแทนการเดินจริง
- [ ] Multi-floor navigation
- [ ] QR Code generator สำหรับแต่ละแผนที่
- [ ] Cloudflare R2 สำหรับเก็บ 3D model / รูปภาพร้าน
- [ ] Analytics: จำนวนครั้งที่ผู้ใช้เปิด AR, ร้านที่ค้นหาบ่อย
- [ ] ปรับปรุง Pathfinding ให้เริ่มจาก Waypoint ที่ใกล้ user ที่สุด (ตอนนี้ fix W1)

---

## 📄 เอกสารเพิ่มเติม

- [docs/architecture.md](docs/architecture.md) — สถาปัตยกรรมระบบเต็มรูปแบบ (ภาษาไทย + Mermaid diagram)
