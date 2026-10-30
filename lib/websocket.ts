"use client";
import { useEffect, useState } from "react";

export interface StreamNotification {
  type: string;
  documentId?: string;
  percent?: number;
  message?: string;
  at?: number;
}

export function useSignalR(): StreamNotification | null {
  const [notification, setNotification] = useState<StreamNotification | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/notifications/stream");

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setNotification(parsed);
        } catch {
          // ignore ping or non-json message
        }
      };

      eventSource.onerror = () => {
        // SSE reconnects automatically
      };
    } catch {
      // EventSource fallback
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  return notification;
}
