import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// กำหนด Route ที่ต้องการล็อกความปลอดภัย (ต้อง Login ก่อนเข้าใช้งาน)
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/api/admin(.*)"
]);

// Webhook ต้องเปิดเป็น Public เพราะ Clerk ยิง request มาเอง (ไม่มี session)
const isWebhookRoute = createRouteMatcher([
  "/api/webhooks(.*)"
]);

export default clerkMiddleware(async (auth, req) => {
  // ข้าม Auth สำหรับ Webhook routes
  if (isWebhookRoute(req)) return;

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // ข้ามการประมวลผลไฟล์ภายในของ Next.js และ Static Files ทั้งหมด (รูปภาพ, CSS, โมเดล 3D)
    "/((?!_next|[^?]*\\.[^?]*$).*)",
    // บังคับรันสำหรับ API และ trpc
    "/(api|trpc)(.*)",
  ],
};
