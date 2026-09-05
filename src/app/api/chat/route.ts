import { NextRequest } from "next/server";
import { streamAnswer, type ChatMessage } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = String(body.question || body.message || "").trim();
    const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
    if (!question) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }
    const { stream, citations, stats } = await streamAnswer(question, history);
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "meta", citations, stats }) + "\n"));
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (delta) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: "token", text: delta }) + "\n"));
            }
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "stream error";
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: msg }) + "\n"));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
