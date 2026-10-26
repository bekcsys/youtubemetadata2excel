import assert from "node:assert/strict";
import test from "node:test";
import { IngestError } from "./errors";
import type { VideoRecord } from "./types";
import { readExportRequest, sortVideos } from "./videos";

function video(overrides: Partial<VideoRecord>): VideoRecord {
  return {
    video_id: "video000001",
    title: "Title",
    published_at: "2024-01-01T00:00:00Z",
    view_count: 1,
    like_count: 1,
    playlist_titles: "",
    video_url: "https://www.youtube.com/watch?v=video000001",
    channel_id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    channel_title: "Example",
    ingested_at: "2026-10-25T00:00:00Z",
    ...overrides,
  };
}

test("sorts by playlist title, then by view count", () => {
  const sorted = sortVideos([
    video({ video_id: "none-low", playlist_titles: "", view_count: 5 }),
    video({ video_id: "talks-low", playlist_titles: "Talks", view_count: 10 }),
    video({ video_id: "news-high", playlist_titles: "News", view_count: 100 }),
    video({ video_id: "talks-high", playlist_titles: "Talks", view_count: 50 }),
    video({ video_id: "none-high", playlist_titles: "", view_count: 80 }),
    video({ video_id: "none-missing", playlist_titles: "", view_count: null }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.video_id),
    ["news-high", "talks-high", "talks-low", "none-high", "none-low", "none-missing"],
  );
});

test("accepts an export payload and rejects invalid rows", () => {
  const parsed = readExportRequest({
    channelTitle: "Example",
    videos: [
      video({ video_id: "plain", playlist_titles: "", view_count: 100 }),
      video({ video_id: "listed", playlist_titles: "Talks", view_count: 2, like_count: null }),
    ],
  });

  assert.equal(parsed.channelTitle, "Example");
  assert.deepEqual(
    parsed.videos.map((item) => item.video_id),
    ["listed", "plain"],
  );
  assert.equal(parsed.videos[0]?.like_count, null);
  assert.throws(() => readExportRequest({ videos: [{ video_id: "" }] }), IngestError);
  assert.throws(() => readExportRequest({}), IngestError);
});
