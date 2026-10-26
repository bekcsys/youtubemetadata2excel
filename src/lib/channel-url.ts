import { IngestError } from "./errors";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

const NON_CHANNEL_PATHS = new Set([
  "watch",
  "playlist",
  "shorts",
  "embed",
  "live",
  "feed",
  "results",
  "clip",
  "post",
  "hashtag",
  "premium",
  "account",
  "upload",
]);

const CHANNEL_ID_PATTERN = /^UC[0-9A-Za-z_-]{22}$/;

export type ChannelReference =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "custom"; value: string };

export function parseChannelUrl(input: string): ChannelReference {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new IngestError("Enter a YouTube channel URL.", 400);
  }
  if (trimmed.length > 2048) {
    throw new IngestError("Enter a valid YouTube channel URL.", 400);
  }

  const withProtocol = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : /^(www\.|m\.)?youtube\.com\//i.test(trimmed) || /^music\.youtube\.com\//i.test(trimmed)
      ? `https://${trimmed}`
      : "";

  if (!withProtocol) {
    throw new IngestError("Enter a valid YouTube channel URL.", 400);
  }

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new IngestError("Enter a valid YouTube channel URL.", 400);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new IngestError("Enter a valid YouTube channel URL.", 400);
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new IngestError("URL must be a youtube.com channel link.", 400);
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodePathPart);
  if (parts.length === 0 || NON_CHANNEL_PATHS.has(parts[0].toLowerCase())) {
    throw new IngestError(
      "That link is not a channel URL. Use an @handle or /channel/UC... link.",
      400,
    );
  }

  if (parts[0].startsWith("@")) {
    const handle = parts[0].slice(1);
    assertIdentifier(handle, "channel handle");
    return { kind: "handle", value: handle };
  }

  const section = parts[0].toLowerCase();
  if (section === "channel") {
    const channelId = parts[1] ?? "";
    if (!CHANNEL_ID_PATTERN.test(channelId)) {
      throw new IngestError("That channel ID is not valid.", 400);
    }
    return { kind: "id", value: channelId };
  }

  if (section === "user") {
    const username = parts[1] ?? "";
    assertIdentifier(username, "username");
    return { kind: "username", value: username };
  }

  if (section === "c") {
    const customName = parts[1] ?? "";
    assertIdentifier(customName, "custom channel name");
    return { kind: "custom", value: customName };
  }

  throw new IngestError(
    "That link is not a channel URL. Use an @handle or /channel/UC... link.",
    400,
  );
}

function decodePathPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new IngestError("Enter a valid YouTube channel URL.", 400);
  }
}

function assertIdentifier(value: string, label: string): void {
  if (!value || value.length > 100 || /[\s/?#\\]/.test(value)) {
    throw new IngestError(`That ${label} is not valid.`, 400);
  }
}
