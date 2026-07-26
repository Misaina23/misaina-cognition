"use client";
import { useEffect, useState } from "react";
import { api } from "./api";

export function useSignalR() {
  const [progress, setProgress] = useState<Record<string, number>>({});
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "indexing") {
        setProgress((p) => ({ ...p, [data.documentId]: data.percent }));
      }
    };
    return () => es.close();
  }, []);
  return progress;
}
