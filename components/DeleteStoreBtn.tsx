"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteStoreBtn({ storeId, storeName }: { storeId: string; storeName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`คุณต้องการลบแผนที่ "${storeName}" จริงหรือไม่?\nการลบนี้ไม่สามารถย้อนคืนได้`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/stores/${storeId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete map");
      }

      router.refresh();
    } catch (error) {
      console.error(error);
      alert("ลบแผนที่ล้มเหลว กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition disabled:opacity-50"
      title="ลบแผนที่"
    >
      <Trash2 size={16} />
    </button>
  );
}
