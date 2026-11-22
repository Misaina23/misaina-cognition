import { NextRequest } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connect frame
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", at: Date.now() })}\n\n`));

      const listener = (payload: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          // stream closed
        }
      };

      mockDb.subscribers.add(listener);

      // Keepalive ping every 25 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        mockDb.subscribers.delete(listener);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
