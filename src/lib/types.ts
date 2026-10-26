export const VIDEO_FIELDS = [
  "video_id",
  "title",
  "published_at",
  "view_count",
  "like_count",
  "playlist_titles",
  "video_url",
  "channel_id",
  "channel_title",
  "ingested_at",
] as const;

export type VideoRecord = {
  video_id: string;
  title: string;
  published_at: string;
  view_count: number | null;
  like_count: number | null;
  playlist_titles: string;
  video_url: string;
  channel_id: string;
  channel_title: string;
  ingested_at: string;
};
