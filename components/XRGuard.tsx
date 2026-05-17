"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * XRGuard: ตรวจจับว่าผู้ใช้ออกจากหน้า /ar หรือยัง
 * ถ้าออกแล้วแต่กล้อง XR8 ยังค้างอยู่ → บังคับ Full Reload เพื่อปิดกล้องทันที
 * วางไว้ใน Root Layout เพื่อครอบทั้งโปรเจค
 */
export default function XRGuard() {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;

    // ถ้าเพิ่งอยู่หน้า /ar แล้วย้ายไปหน้าอื่น → บังคับ Reload เพื่อฆ่ากล้อง
    if (prevPath.startsWith("/ar") && !pathname.startsWith("/ar")) {
      window.location.reload();
      return;
    }

    // Safety net: ถ้าไม่ได้อยู่หน้า /ar แต่ XR8 ยังทำงานค้างอยู่ → Reload ทิ้ง
    if (!pathname.startsWith("/ar")) {
      const canvas = document.getElementById("camerafeed") as HTMLCanvasElement;
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        window.location.reload();
      }
    }
  }, [pathname]);

  return null; // ไม่ render อะไร แค่ทำหน้าที่เฝ้าระวัง
}
