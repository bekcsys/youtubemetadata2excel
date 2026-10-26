"use client";

import { useRef, useState, type FormEvent } from "react";
import { parseChannelUrl } from "@/lib/channel-url";
import { IngestError } from "@/lib/errors";
import type { VideoRecord } from "@/lib/types";

type IngestResult = {
  channelTitle: string;
  videos: VideoRecord[];
};

type IngestEvent =
  | { type: "progress"; message: string }
  | { type: "complete"; channelTitle: string; videos: VideoRecord[] }
  | { type: "error"; message: string };

export default function Home() {
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const loading = progress !== "";

  function onUrlChange(value: string) {
    abortRef.current?.abort();
    abortRef.current = null;
    setUrl(value);
    setFieldError("");
    setError("");
    setResult(null);
    setProgress("");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError("");
    setError("");
    setResult(null);

    try {
      parseChannelUrl(url);
    } catch (caught) {
      setFieldError(
        caught instanceof IngestError ? caught.message : "Enter a valid YouTube channel URL.",
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress("Starting ingestion…");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const contentType = response.headers.get("Content-Type") ?? "";

      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Ingestion failed.");
      }
      if (!response.ok || !response.body) {
        throw new Error("Ingestion failed.");
      }

      await readIngestStream(response.body, controller, setProgress, setResult);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Ingestion failed.");
    } finally {
      if (abortRef.current === controller) {
        setProgress("");
      }
    }
  }

  async function onDownload() {
    if (!result || downloading) return;
    setDownloading(true);
    setError("");

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelTitle: result.channelTitle,
          videos: result.videos,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not create the Excel file.");
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(response.headers.get("Content-Disposition"));
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the Excel file.");
    } finally {
      setDownloading(false);
    }
  }

  const videoLabel = result?.videos.length === 1 ? "video" : "videos";

  return (
    <main className="page">
      <h1>Youtube video list downloader</h1>
      <p className="subtitle">Video metadata export</p>
      <p className="lede">
        Paste a channel URL to download each video&apos;s title, like count, view count, playlist
        title, and URL.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <label htmlFor="channel-url">YouTube Channel URL</label>
        <input
          id="channel-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://www.youtube.com/@GoogleDevelopers"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={loading}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "channel-url-error" : undefined}
        />
        {fieldError ? (
          <p id="channel-url-error" className="error" role="alert">
            {fieldError}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          Fetch Videos
        </button>
      </form>
      {loading ? (
        <p className="progress" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>{progress}</span>
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="results">
          <p>
            Retrieved {result.videos.length.toLocaleString()} {videoLabel}
            {result.channelTitle ? ` from ${result.channelTitle}` : ""}.
          </p>
          <button type="button" onClick={onDownload} disabled={downloading} aria-busy={downloading}>
            Download Excel
          </button>
        </div>
      ) : null}
    </main>
  );
}

async function readIngestStream(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  setProgress: (message: string) => void,
  setResult: (result: IngestResult) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const applyLine = (line: string) => {
    if (!line.trim() || controller.signal.aborted) return;
    const event = parseIngestEvent(line);
    if (event.type === "progress") {
      setProgress(event.message);
    } else if (event.type === "error") {
      throw new Error(event.message || "Ingestion failed.");
    } else if (event.type === "complete") {
      completed = true;
      setResult({
        channelTitle: typeof event.channelTitle === "string" ? event.channelTitle : "",
        videos: Array.isArray(event.videos) ? event.videos : [],
      });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      applyLine(buffer);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) applyLine(line);
  }

  if (!completed) {
    throw new Error("Ingestion ended before any videos were returned.");
  }
}

function parseIngestEvent(line: string): IngestEvent {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("Ingestion returned an unreadable response.");
  }
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("Ingestion returned an unreadable response.");
  }
  return value as IngestEvent;
}

function filenameFromDisposition(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] || "youtube-channel.xlsx";
}
