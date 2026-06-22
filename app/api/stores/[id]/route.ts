import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stores } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, id),
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // แปลงโครงสร้าง DB ให้ตรงกับ StoreData interface ของ Client
    const formattedData = {
      store_id: store.id,
      store_name: store.name,
      floor: store.floor ?? 1,
      initial_heading_deg: store.initialHeadingDeg ?? 0,
      proximity_radius_m: store.proximityRadiusM ?? 1.5,
      waypoints: JSON.parse(store.waypointsJson),
      edges: JSON.parse(store.edgesJson),
      destinations: JSON.parse(store.destinationsJson),
      comment: store.comment || "",
    };

    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error("Failed to fetch store:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const store = await db.query.stores.findFirst({
      where: and(eq(stores.id, id), eq(stores.userId, userId)),
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found or unauthorized" }, { status: 404 });
    }

    await db.delete(stores).where(eq(stores.id, id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete store:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const store = await db.query.stores.findFirst({
      where: and(eq(stores.id, id), eq(stores.userId, userId)),
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found or unauthorized" }, { status: 404 });
    }

    const body = await request.json();
    const { name, floor, initialHeadingDeg, proximityRadiusM, waypointsJson, edgesJson, destinationsJson, comment } = body;

    if (!name || !waypointsJson || !edgesJson || !destinationsJson) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await db
      .update(stores)
      .set({
        name,
        floor: floor || 1,
        initialHeadingDeg: initialHeadingDeg || 0,
        proximityRadiusM: proximityRadiusM || 1.5,
        waypointsJson,
        edgesJson,
        destinationsJson,
        comment: comment || null,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to update store:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
