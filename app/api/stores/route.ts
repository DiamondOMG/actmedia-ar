import { NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { stores } from "../../../lib/schema";
import { auth } from "@clerk/nextjs/server";

// ดึงรายการแผนที่ทั้งหมด (สำหรับเบอร์เกอร์เมนู)
export async function GET() {
  try {
    const allStores = await db.select().from(stores);
    return NextResponse.json(allStores);
  } catch (error: any) {
    console.error("Failed to fetch stores:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// เซฟแผนที่ใหม่จากหน้าบันทึกแผนที่
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, name, floor, initialHeadingDeg, proximityRadiusM, waypointsJson, edgesJson, destinationsJson, comment } = body;

    if (!id || !name || !waypointsJson || !edgesJson || !destinationsJson) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await db.insert(stores).values({
      id,
      userId,
      name,
      floor: floor || 1,
      initialHeadingDeg: initialHeadingDeg || 0,
      proximityRadiusM: proximityRadiusM || 1.5,
      waypointsJson,
      edgesJson,
      destinationsJson,
      comment: comment || null,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to save store:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
