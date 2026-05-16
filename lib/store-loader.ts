export interface Waypoint {
  x: number;
  z: number;
  label: string;
  type?: string;
}

export interface StoreData {
  store_id: string;
  store_name: string;
  floor: number;
  initial_heading_deg: number;
  proximity_radius_m: number;
  waypoints: Record<string, Waypoint>;
  edges: [string, string][];
  destinations: { name: string; waypoint: string; icon?: string; description?: string }[];
}

export function getStoreParams() {
  if (typeof window === 'undefined') return { storeId: 'demo_001', entrance: 'A' };
  const params = new URLSearchParams(window.location.search);
  return {
    storeId: params.get('store') || 'demo_001',
    entrance: params.get('entrance') || 'A',
  };
}

export async function loadStoreData(storeId: string): Promise<StoreData> {
  // รองรับ 2 แบบ: Static JSON หรือ API
  // เปลี่ยนจาก import.meta.env (Vite) เป็น process.env.NEXT_PUBLIC_ (Next.js)
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const url = apiBase
    ? `${apiBase}/stores/${storeId}`
    : `/stores/${storeId}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ไม่พบข้อมูลห้าง: ${storeId} (HTTP ${response.status})`);
    }

    const data = await response.json();
    validateStoreData(data);

    console.log(`[StoreLoader] Loaded: ${data.store_name} (${Object.keys(data.waypoints).length} waypoints)`);
    return data;
  } catch (error) {
    console.error('[StoreLoader] Error:', error);
    throw error;
  }
}

function validateStoreData(data: any) {
  const required = ['store_id', 'store_name', 'waypoints', 'edges', 'destinations'];
  for (const key of required) {
    if (!data[key]) {
      throw new Error(`Store JSON missing required field: "${key}"`);
    }
  }

  if (Object.keys(data.waypoints).length < 2) {
    throw new Error('Store must have at least 2 waypoints');
  }

  if (data.edges.length < 1) {
    throw new Error('Store must have at least 1 edge');
  }
}
