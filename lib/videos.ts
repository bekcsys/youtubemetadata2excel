import { IngestError } from "./errors";
import type { VideoRecord } from "./types";

const MAX_EXPORT_ROWS = 20000;

const STRING_LIMITS = {
  video_id: 64,
  title: 500,
  published_at: 64,
  playlist_titles: 32000,
  video_url: 300,
  channel_id: 64,
  channel_title: 200,
  ingested_at: 64,
} as const;

export function sortVideos(videos: VideoRecord[]): VideoRecord[] {
  return [...videos].sort((left, right) => {
    const leftPlaylist = left.playlist_titles.trim();
    const rightPlaylist = right.playlist_titles.trim();
    const leftHasPlaylist = leftPlaylist.length > 0;
    const rightHasPlaylist = rightPlaylist.length > 0;

    if (leftHasPlaylist !== rightHasPlaylist) {
      return leftHasPlaylist ? -1 : 1;
    }
    if (leftHasPlaylist) {
      const byPlaylist = leftPlaylist.localeCompare(rightPlaylist, undefined, { sensitivity: "base" });
      if (byPlaylist !== 0) return byPlaylist;
    }

    const byViews = compareViewCountDescending(left.view_count, right.view_count);
    if (byViews !== 0) return byViews;
    return left.video_id.localeCompare(right.video_id);
  });
}

function compareViewCountDescending(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

export function readExportRequest(body: unknown): {
  channelTitle: string;
  videos: VideoRecord[];
} {
  if (!body || typeof body !== "object") {
    throw new IngestError("Export data is missing videos.", 400);
  }

  const record = body as { videos?: unknown; channelTitle?: unknown };
  if (!Array.isArray(record.videos)) {
    throw new IngestError("Export data is missing videos.", 400);
  }
  if (record.videos.length > MAX_EXPORT_ROWS) {
    throw new IngestError("Too many videos to export at once.", 400);
  }

  const videos = sortVideos(record.videos.map((video) => sanitizeVideo(video)));
  const channelTitle =
    typeof record.channelTitle === "string"
      ? record.channelTitle.trim().slice(0, STRING_LIMITS.channel_title)
      : (videos[0]?.channel_title ?? "");

  return { channelTitle, videos };
}

function sanitizeVideo(value: unknown): VideoRecord {
  if (!value || typeof value !== "object") {
    throw new IngestError("A video record is invalid.", 400);
  }

  const record = value as Record<string, unknown>;
  const videoId = readString(record, "video_id", STRING_LIMITS.video_id);
  if (!videoId) {
    throw new IngestError("A video is missing video_id.", 400);
  }

  return {
    video_id: videoId,
    title: readString(record, "title", STRING_LIMITS.title),
    published_at: readString(record, "published_at", STRING_LIMITS.published_at),
    view_count: readCount(record, "view_count"),
    like_count: readCount(record, "like_count"),
    playlist_titles: readString(record, "playlist_titles", STRING_LIMITS.playlist_titles),
    video_url: readString(record, "video_url", STRING_LIMITS.video_url),
    channel_id: readString(record, "channel_id", STRING_LIMITS.channel_id),
    channel_title: readString(record, "channel_title", STRING_LIMITS.channel_title),
    ingested_at: readString(record, "ingested_at", STRING_LIMITS.ingested_at),
  };
}

function readString(record: Record<string, unknown>, field: string, max: number): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new IngestError(`A video is missing ${field}.`, 400);
  }
  return value.slice(0, max);
}

function readCount(record: Record<string, unknown>, field: string): number | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new IngestError(`A video has an invalid ${field}.`, 400);
  }
  return value;
}
