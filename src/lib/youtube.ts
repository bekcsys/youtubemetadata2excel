import { parseChannelUrl, type ChannelReference } from "./channel-url";
import { IngestError, isAbortError } from "./errors";
import type { VideoRecord } from "./types";
import { sortVideos } from "./videos";

const API_ORIGIN = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;
const MAX_PAGES = 5000;
const PLAYLIST_CONCURRENCY = 3;

type ProgressReporter = (message: string) => void;

type ResolvedChannel = {
  id: string;
  title: string;
  uploadsPlaylistId: string;
};

type Page<T> = {
  nextPageToken?: string;
  items?: T[];
};

type ChannelItem = {
  id?: string;
  snippet?: { title?: string; customUrl?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type ChannelsResponse = {
  items?: ChannelItem[];
};

type UploadItem = {
  snippet?: { resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string };
};

type VideoItem = {
  id?: string;
  snippet?: { title?: string; publishedAt?: string; channelTitle?: string };
  statistics?: { viewCount?: string; likeCount?: string };
  status?: { privacyStatus?: string };
};

type PlaylistSummary = {
  id?: string;
  snippet?: { title?: string };
};

type PlaylistVideoItem = {
  contentDetails?: { videoId?: string };
};

type SearchResponse = {
  items?: Array<{
    id?: { channelId?: string };
    snippet?: { channelId?: string };
  }>;
};

export type IngestResult = {
  channelTitle: string;
  videos: VideoRecord[];
};

export async function ingestChannel(
  channelUrl: string,
  apiKey: string,
  options: { signal: AbortSignal; onProgress: ProgressReporter },
): Promise<IngestResult> {
  if (!apiKey.trim()) {
    throw new IngestError("The server is missing YOUTUBE_API_KEY.", 500);
  }

  const reference = parseChannelUrl(channelUrl);
  const channel = await resolveChannel(reference, apiKey, options.signal, options.onProgress);
  const videoIds = await listUploadedVideoIds(
    channel.uploadsPlaylistId,
    apiKey,
    options.signal,
    options.onProgress,
  );

  if (videoIds.length === 0) {
    return { channelTitle: channel.title, videos: [] };
  }

  const details = await fetchVideoDetails(videoIds, apiKey, options.signal, options.onProgress);
  const playlistsByVideo = await fetchPlaylistMembership(
    channel.id,
    apiKey,
    options.signal,
    options.onProgress,
  );
  options.onProgress("Sorting videos…");

  return {
    channelTitle: channel.title,
    videos: buildVideoRecords(channel, details, playlistsByVideo, new Date().toISOString()),
  };
}

async function resolveChannel(
  reference: ChannelReference,
  apiKey: string,
  signal: AbortSignal,
  onProgress: ProgressReporter,
): Promise<ResolvedChannel> {
  onProgress("Resolving channel…");

  if (reference.kind === "id") {
    return fetchChannel({ id: reference.value }, apiKey, signal);
  }
  if (reference.kind === "handle") {
    return fetchChannel({ forHandle: reference.value }, apiKey, signal);
  }
  if (reference.kind === "username") {
    return fetchChannelOrHandle(reference.value, apiKey, signal);
  }

  try {
    return await fetchChannel({ forHandle: reference.value }, apiKey, signal);
  } catch (error) {
    if (!isMissingChannel(error)) throw error;
  }

  try {
    return await fetchChannel({ forUsername: reference.value }, apiKey, signal);
  } catch (error) {
    if (!isMissingChannel(error)) throw error;
  }

  onProgress("Searching for the channel…");
  return resolveCustomUrl(reference.value, apiKey, signal);
}

async function fetchChannelOrHandle(
  value: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<ResolvedChannel> {
  try {
    return await fetchChannel({ forUsername: value }, apiKey, signal);
  } catch (error) {
    if (!isMissingChannel(error)) throw error;
  }
  return fetchChannel({ forHandle: value }, apiKey, signal);
}

function isMissingChannel(error: unknown): boolean {
  return error instanceof IngestError && error.status === 404;
}

async function fetchChannel(
  params: Record<string, string>,
  apiKey: string,
  signal: AbortSignal,
): Promise<ResolvedChannel> {
  const data = await youtubeGet<ChannelsResponse>(
    "channels",
    { part: "snippet,contentDetails", ...params },
    apiKey,
    signal,
  );
  const channel = data.items?.[0];
  if (!channel) {
    throw new IngestError("No YouTube channel was found for that URL.", 404);
  }
  return toResolvedChannel(channel);
}

async function resolveCustomUrl(
  name: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<ResolvedChannel> {
  const search = await youtubeGet<SearchResponse>(
    "search",
    { part: "snippet", type: "channel", q: name, maxResults: "10" },
    apiKey,
    signal,
  );
  const ids = [
    ...new Set(
      (search.items ?? [])
        .map((item) => item.id?.channelId || item.snippet?.channelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) {
    throw new IngestError("No YouTube channel was found for that URL.", 404);
  }

  const channels = await youtubeGet<ChannelsResponse>(
    "channels",
    {
      part: "snippet,contentDetails",
      id: ids.join(","),
      maxResults: String(ids.length),
    },
    apiKey,
    signal,
  );
  const needle = name.toLowerCase();
  const match = (channels.items ?? []).find((item) => {
    const customUrl = item.snippet?.customUrl?.replace(/^@/, "").toLowerCase();
    return customUrl === needle;
  });
  if (!match) {
    throw new IngestError(
      "Could not resolve that custom channel URL. Use an @handle or /channel/UC... link.",
      404,
    );
  }
  return toResolvedChannel(match);
}

function toResolvedChannel(channel: ChannelItem): ResolvedChannel {
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!channel.id || !uploadsPlaylistId) {
    throw new IngestError("This channel does not expose a public uploads playlist.", 404);
  }
  return {
    id: channel.id,
    title: channel.snippet?.title?.trim() ?? "",
    uploadsPlaylistId,
  };
}

async function listUploadedVideoIds(
  playlistId: string,
  apiKey: string,
  signal: AbortSignal,
  onProgress: ProgressReporter,
): Promise<string[]> {
  const items = await eachPage<UploadItem>(
    "playlistItems",
    { part: "snippet,contentDetails", playlistId },
    apiKey,
    signal,
    (_page, _pageNumber, total) => {
      onProgress(`Fetching uploaded videos (${total} so far)…`);
    },
  );

  const videoIds: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    videoIds.push(videoId);
  }
  return videoIds;
}

async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
  signal: AbortSignal,
  onProgress: ProgressReporter,
): Promise<VideoItem[]> {
  const batches = chunk(videoIds, PAGE_SIZE);
  const details: VideoItem[] = [];

  for (let index = 0; index < batches.length; index += 1) {
    const through = Math.min((index + 1) * PAGE_SIZE, videoIds.length);
    onProgress(`Fetching video statistics (${through} of ${videoIds.length})…`);
    const data = await youtubeGet<Page<VideoItem>>(
      "videos",
      {
        part: "snippet,statistics,status",
        id: batches[index].join(","),
        maxResults: String(PAGE_SIZE),
      },
      apiKey,
      signal,
    );
    details.push(...(data.items ?? []));
  }

  return details;
}

async function fetchPlaylistMembership(
  channelId: string,
  apiKey: string,
  signal: AbortSignal,
  onProgress: ProgressReporter,
): Promise<Map<string, string[]>> {
  onProgress("Fetching channel playlists…");
  const playlists = await eachPage<PlaylistSummary>(
    "playlists",
    { part: "snippet", channelId },
    apiKey,
    signal,
    () => {},
  );

  const membership = new Map<string, Set<string>>();
  let completed = 0;

  await mapWithConcurrency(playlists, PLAYLIST_CONCURRENCY, async (playlist) => {
    const playlistId = playlist.id;
    const title = playlist.snippet?.title?.trim() ?? "";
    if (playlistId && title) {
      onProgress(`Matching videos to playlists (${completed + 1} of ${playlists.length})…`);
      const items = await eachPage<PlaylistVideoItem>(
        "playlistItems",
        { part: "contentDetails", playlistId },
        apiKey,
        signal,
        () => {},
      );
      for (const item of items) {
        const videoId = item.contentDetails?.videoId;
        if (!videoId) continue;
        const titles = membership.get(videoId);
        if (titles) titles.add(title);
        else membership.set(videoId, new Set([title]));
      }
    }
    completed += 1;
    onProgress(`Matching videos to playlists (${completed} of ${playlists.length})…`);
  });

  return new Map([...membership].map(([videoId, titles]) => [videoId, [...titles]]));
}

function buildVideoRecords(
  channel: ResolvedChannel,
  videos: VideoItem[],
  playlistsByVideo: Map<string, string[]>,
  ingestedAt: string,
): VideoRecord[] {
  const records: VideoRecord[] = [];
  const seen = new Set<string>();

  for (const video of videos) {
    const videoId = video.id?.trim();
    if (!videoId || seen.has(videoId)) continue;
    if (video.status?.privacyStatus && video.status.privacyStatus !== "public") continue;
    seen.add(videoId);

    records.push({
      video_id: videoId,
      title: video.snippet?.title?.trim() ?? "",
      published_at: video.snippet?.publishedAt ?? "",
      view_count: parseCount(video.statistics?.viewCount),
      like_count: parseCount(video.statistics?.likeCount),
      playlist_titles: joinPlaylistTitles(playlistsByVideo.get(videoId) ?? []),
      video_url: `https://www.youtube.com/watch?v=${videoId}`,
      channel_id: channel.id,
      channel_title: channel.title || video.snippet?.channelTitle?.trim() || "",
      ingested_at: ingestedAt,
    });
  }

  return sortVideos(records);
}

function joinPlaylistTitles(titles: string[]): string {
  const joined = [...new Set(titles.map((title) => title.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .join("; ");
  if (joined.length <= 32000) return joined;
  return `${joined.slice(0, 31997)}...`;
}

function parseCount(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

async function eachPage<T>(
  resource: string,
  params: Record<string, string>,
  apiKey: string,
  signal: AbortSignal,
  onPage: (items: T[], pageNumber: number, total: number) => void,
): Promise<T[]> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  let pageNumber = 0;

  do {
    signal.throwIfAborted();
    const page = await youtubeGet<Page<T>>(
      resource,
      {
        ...params,
        maxResults: String(PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
      signal,
    );
    pageNumber += 1;
    const pageItems = page.items ?? [];
    items.push(...pageItems);
    onPage(pageItems, pageNumber, items.length);

    if (!page.nextPageToken || seenTokens.has(page.nextPageToken)) break;
    if (pageNumber >= MAX_PAGES) {
      throw new IngestError(
        "This channel has more results than this app can retrieve in one run.",
        413,
      );
    }
    seenTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}

export function mapYoutubeError(status: number, body: unknown): IngestError {
  const message = safeApiMessage(extractMessage(body));
  const reason = extractReason(body);

  if (
    reason === "quotaExceeded" ||
    reason === "dailyLimitExceeded" ||
    reason === "rateLimitExceeded" ||
    status === 429 ||
    /quota/i.test(message)
  ) {
    return new IngestError("YouTube API quota has been exceeded. Try again later.", 429);
  }

  if (reason === "keyInvalid" || /API key not valid/i.test(message)) {
    return new IngestError(
      "The YouTube API key was rejected. Check the YOUTUBE_API_KEY environment variable.",
      500,
    );
  }

  if (
    reason === "accessNotConfigured" ||
    /has not been used in project/i.test(message) ||
    /YouTube Data API v3 has not been used/i.test(message)
  ) {
    return new IngestError("The YouTube Data API is not enabled for this API key.", 500);
  }

  if (status === 404 || reason === "channelNotFound" || reason === "playlistNotFound") {
    return new IngestError("YouTube could not find that channel.", 404);
  }

  if (status === 403) {
    return new IngestError("This channel or its videos are not accessible.", 403);
  }

  if (status === 400) {
    return new IngestError(message || "YouTube rejected the request.", 400);
  }

  if (status >= 500) {
    return new IngestError("YouTube is unavailable right now. Try again shortly.", 502);
  }

  return new IngestError(message || "The YouTube API request failed.", status || 502);
}

function safeApiMessage(message: string): string {
  if (!message || /key=|api[_-]?key/i.test(message)) return "";
  return message.slice(0, 300);
}

function extractMessage(body: unknown): string {
  if (!body || typeof body !== "object" || !("error" in body)) return "";
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : "";
}

function extractReason(body: unknown): string {
  if (!body || typeof body !== "object" || !("error" in body)) return "";
  const error = (body as { error?: { errors?: Array<{ reason?: unknown }> } }).error;
  const reason = error?.errors?.[0]?.reason;
  return typeof reason === "string" ? reason : "";
}

async function youtubeGet<T>(
  resource: string,
  params: Record<string, string>,
  apiKey: string,
  signal: AbortSignal,
): Promise<T> {
  const url = new URL(`${API_ORIGIN}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("key", apiKey);

  let sawNetworkFailure = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal,
        headers: { Accept: "application/json" },
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status >= 500 && attempt === 0) {
        await delay(400, signal);
        continue;
      }
      if (body === null || typeof body !== "object") {
        throw new IngestError("YouTube returned an unreadable response.", 502);
      }
      if (!response.ok) {
        throw mapYoutubeError(response.status, body);
      }
      return body as T;
    } catch (error) {
      if (isAbortError(error) || error instanceof IngestError) throw error;
      sawNetworkFailure = true;
      if (attempt === 0) {
        await delay(400, signal);
        continue;
      }
    }
  }

  throw new IngestError(
    sawNetworkFailure
      ? "Network request to YouTube failed. Check your connection and try again."
      : "YouTube is unavailable right now. Try again shortly.",
    502,
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
      }
    }),
  );
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError(signal));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException("Aborted", "AbortError");
}
