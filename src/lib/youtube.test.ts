import assert from "node:assert/strict";
import test from "node:test";
import { IngestError } from "./errors";
import { ingestChannel, mapYoutubeError } from "./youtube";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("maps quota, key, and access errors without echoing the API key", () => {
  const quota = mapYoutubeError(403, {
    error: {
      message: "quota exceeded for key=secret-key",
      errors: [{ reason: "quotaExceeded" }],
    },
  });
  assert.equal(quota.message, "YouTube API quota has been exceeded. Try again later.");
  assert.equal(quota.status, 429);
  assert.equal(quota.message.includes("secret-key"), false);

  const invalidKey = mapYoutubeError(400, {
    error: { message: "API key not valid. Please pass a valid API key.", errors: [{ reason: "keyInvalid" }] },
  });
  assert.match(invalidKey.message, /YOUTUBE_API_KEY/);

  const disabled = mapYoutubeError(403, {
    error: { message: "YouTube Data API v3 has not been used in project 1 before or it is disabled." },
  });
  assert.match(disabled.message, /not enabled/);
});

test("paginates uploads, skips non-public videos, and collects playlist titles", async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    return jsonResponse(mockYouTube(url));
  };

  const messages: string[] = [];
  const result = await ingestChannel("https://www.youtube.com/@Example", "test-key", {
    signal: new AbortController().signal,
    onProgress: (message) => messages.push(message),
  });

  assert.equal(requests.some((url) => url.searchParams.get("pageToken") === "next"), true);
  assert.deepEqual(
    result.videos.map((video) => video.video_id),
    ["videoNew0001", "videoOld0001"],
  );
  assert.equal(result.channelTitle, "Example Channel");
  assert.equal(result.videos[0]?.playlist_titles, "Talks");
  assert.equal(result.videos[0]?.like_count, null);
  assert.equal(result.videos[0]?.view_count, 20);
  assert.equal(result.videos[1]?.playlist_titles, "");
  assert.equal(result.videos[0]?.channel_id, "UC1234567890123456789012");
  assert.equal(result.videos[0]?.video_url, "https://www.youtube.com/watch?v=videoNew0001");
  assert.equal(Number.isNaN(Date.parse(result.videos[0]?.ingested_at ?? "")), false);
  assert.equal(messages.some((message) => message.includes("1 so far")), true);
  assert.equal(messages.some((message) => message.includes("3 so far")), true);
});

test("does not retry a quota error", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(
      { error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } },
      403,
    );
  };

  await assert.rejects(
    () =>
      ingestChannel("https://www.youtube.com/@Example", "test-key", {
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      assert.equal(error.status, 429);
      assert.equal(error.message.includes("test-key"), false);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("retries a transient YouTube failure once", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({ error: { message: "backend" } }, 500);
    }
    if (calls === 2) {
      return jsonResponse({
        items: [
          {
            id: "UC1234567890123456789012",
            snippet: { title: "Example Channel" },
            contentDetails: { relatedPlaylists: { uploads: "UU1234567890123456789012" } },
          },
        ],
      });
    }
    return jsonResponse({ items: [] });
  };

  const result = await ingestChannel("https://www.youtube.com/@Example", "test-key", {
    signal: new AbortController().signal,
    onProgress: () => {},
  });

  assert.equal(result.videos.length, 0);
  assert.equal(calls, 3);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockYouTube(url: URL): unknown {
  const resource = url.pathname.split("/").pop();
  const playlistId = url.searchParams.get("playlistId");
  const pageToken = url.searchParams.get("pageToken");

  if (resource === "channels") {
    return {
      items: [
        {
          id: "UC1234567890123456789012",
          snippet: { title: "Example Channel" },
          contentDetails: { relatedPlaylists: { uploads: "UU1234567890123456789012" } },
        },
      ],
    };
  }

  if (resource === "playlistItems" && playlistId === "UU1234567890123456789012") {
    if (!pageToken) {
      return {
        nextPageToken: "next",
        items: [{ contentDetails: { videoId: "videoOld0001" }, snippet: { title: "Old" } }],
      };
    }
    return {
      items: [
        { contentDetails: { videoId: "videoNew0001" } },
        { contentDetails: { videoId: "videoPrivate1" } },
      ],
    };
  }

  if (resource === "videos") {
    return {
      items: [
        {
          id: "videoOld0001",
          snippet: { title: "Old title", publishedAt: "2024-01-01T00:00:00Z" },
          statistics: { viewCount: "10", likeCount: "1" },
          status: { privacyStatus: "public" },
        },
        {
          id: "videoNew0001",
          snippet: { title: "New title", publishedAt: "2025-06-01T00:00:00Z" },
          statistics: { viewCount: "20" },
          status: { privacyStatus: "public" },
        },
        {
          id: "videoPrivate1",
          snippet: { title: "Secret", publishedAt: "2025-07-01T00:00:00Z" },
          statistics: { viewCount: "1", likeCount: "1" },
          status: { privacyStatus: "private" },
        },
      ],
    };
  }

  if (resource === "playlists") {
    return {
      items: [{ id: "PLexample0000000000000001", snippet: { title: "Talks" } }],
    };
  }

  if (resource === "playlistItems") {
    return { items: [{ contentDetails: { videoId: "videoNew0001" } }] };
  }

  return { error: { message: `unexpected ${resource ?? "request"}` } };
}
