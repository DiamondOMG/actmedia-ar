import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { stores } from "../../../../lib/schema";
import { eq } from "drizzle-orm";

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
      proximity_radius_m: store.proximityRadiusM ?? 2.5,
      waypoints: JSON.parse(store.waypointsJson),
      edges: JSON.parse(store.edgesJson),
      destinations: JSON.parse(store.destinationsJson),
    };

    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error("Failed to fetch store:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
