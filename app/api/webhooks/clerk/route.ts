import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Clerk Webhook Handler
 * รับ Event จาก Clerk เมื่อมีการ สร้าง/แก้ไข/ลบ ผู้ใช้ แล้วซิงก์ลง Turso DB
 * 
 * Clerk Dashboard → Webhooks → เพิ่ม Endpoint:
 *   URL: https://your-domain.com/api/webhooks/clerk
 *   Events: user.created, user.updated, user.deleted
 *   Signing Secret → ใส่ใน .env.local ชื่อ CLERK_WEBHOOK_SECRET
 */

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("[Clerk Webhook] CLERK_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // ดึง Headers สำหรับ Verify Signature
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  // อ่าน Body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify Signature ด้วย svix
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[Clerk Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // จัดการ Event ตามประเภท
  const eventType = evt.type;
  console.log(`[Clerk Webhook] Received: ${eventType}`);

  try {
    switch (eventType) {
      // ★ ผู้ใช้สมัครใหม่ → INSERT ลง Turso
      case "user.created": {
        const { id, email_addresses, first_name, last_name } = evt.data;
        const primaryEmail = email_addresses?.[0]?.email_address;

        if (!primaryEmail) {
          console.warn("[Clerk Webhook] user.created without email, skipping");
          break;
        }

        await db.insert(users).values({
          id,
          email: primaryEmail,
          firstName: first_name || null,
          lastName: last_name || null,
          role: "admin",
        }).onConflictDoNothing();

        console.log(`[Clerk Webhook] User created: ${id} (${primaryEmail})`);
        break;
      }

      // ★ ผู้ใช้แก้ไขข้อมูล → UPDATE ใน Turso
      case "user.updated": {
        const { id, email_addresses, first_name, last_name } = evt.data;
        const primaryEmail = email_addresses?.[0]?.email_address;

        if (!primaryEmail) break;

        await db.update(users)
          .set({
            email: primaryEmail,
            firstName: first_name || null,
            lastName: last_name || null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));

        console.log(`[Clerk Webhook] User updated: ${id}`);
        break;
      }

      // ★ ผู้ใช้ลบบัญชี → DELETE จาก Turso
      case "user.deleted": {
        const { id } = evt.data;
        if (!id) break;

        await db.delete(users).where(eq(users.id, id));

        console.log(`[Clerk Webhook] User deleted: ${id}`);
        break;
      }

      default:
        console.log(`[Clerk Webhook] Unhandled event: ${eventType}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[Clerk Webhook] DB error:`, error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
