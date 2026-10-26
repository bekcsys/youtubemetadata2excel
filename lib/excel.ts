import { Workbook } from "exceljs";
import type { VideoRecord } from "./types";

const SHEET_COLUMNS = [
  { header: "SN", key: "sn", width: 8 },
  { header: "video title", key: "title", width: 48 },
  { header: "like count", key: "like_count", width: 14 },
  { header: "view count", key: "view_count", width: 14 },
  { header: "playlist title", key: "playlist_title", width: 42 },
  { header: "URL", key: "url", width: 46 },
] as const;

export async function buildWorkbook(videos: VideoRecord[]): Promise<ArrayBuffer> {
  const workbook = new Workbook();
  workbook.creator = "YouTube Channel Ingestion";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Videos");
  sheet.columns = SHEET_COLUMNS.map((column) => ({ ...column }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const lastColumn = sheet.getColumn(SHEET_COLUMNS.length).letter;
  sheet.autoFilter = `A1:${lastColumn}${Math.max(videos.length + 1, 1)}`;

  for (const [index, video] of videos.entries()) {
    const row = sheet.addRow({
      sn: index + 1,
      title: video.title,
      like_count: video.like_count,
      view_count: video.view_count,
      playlist_title: video.playlist_titles,
      url: video.video_url,
    });
    if (typeof video.view_count === "number") {
      row.getCell("view_count").numFmt = "#,##0";
    }
    if (typeof video.like_count === "number") {
      row.getCell("like_count").numFmt = "#,##0";
    }
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F1EC" },
  };
  sheet.getColumn("title").alignment = { vertical: "top", wrapText: true };
  sheet.getColumn("playlist_title").alignment = { vertical: "top", wrapText: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const view = new Uint8Array(buffer);
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

export function workbookFilename(channelTitle: string, now = new Date()): string {
  const slug = channelTitle
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const date = now.toISOString().slice(0, 10);
  return `youtube-${slug || "channel"}-${date}.xlsx`;
}
