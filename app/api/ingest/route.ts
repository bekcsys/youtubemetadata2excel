import { IngestError, isAbortError } from "@/lib/errors";
import { parseChannelUrl } from "@/lib/channel-url";
import { ingestChannel } from "@/lib/youtube";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  let url = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "url" in body && typeof body.url === "string") {
      url = body.url;
    }
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }

  try {
    parseChannelUrl(url);
  } catch (error) {
    const message = error instanceof IngestError ? error.message : "Enter a valid YouTube channel URL.";
    const status = error instanceof IngestError ? error.status : 400;
    return jsonError(message, status);
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  if (!apiKey) {
    return jsonError("The server is missing YOUTUBE_API_KEY.", 500);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (request.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        const result = await ingestChannel(url, apiKey, {
          signal: request.signal,
          onProgress: (message) => send({ type: "progress", message }),
        });
        send({
          type: "complete",
          channelTitle: result.channelTitle,
          videos: result.videos,
        });
      } catch (error) {
        if (request.signal.aborted || isAbortError(error)) return;
        const message = error instanceof IngestError ? error.message : "Ingestion failed.";
        try {
          send({ type: "error", message });
        } catch {
          return;
        }
      } finally {
        try {
          controller.close();
        } catch {
          return;
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
