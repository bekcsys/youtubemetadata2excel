import assert from "node:assert/strict";
import test from "node:test";
import { Workbook } from "exceljs";
import { buildWorkbook, workbookFilename } from "./excel";
import type { VideoRecord } from "./types";

const video: VideoRecord = {
  video_id: "videoNew0001",
  title: "New title",
  published_at: "2025-06-01T00:00:00Z",
  view_count: 20,
  like_count: null,
  playlist_titles: "Talks",
  video_url: "https://www.youtube.com/watch?v=videoNew0001",
  channel_id: "UC1234567890123456789012",
  channel_title: "Example Channel",
  ingested_at: "2026-10-25T18:00:00Z",
};

test("writes SN, title, counts, playlist title, and URL", async () => {
  const older = {
    ...video,
    video_id: "videoOld0001",
    title: "Old title",
    like_count: 4,
    view_count: 10,
    playlist_titles: "",
    video_url: "https://www.youtube.com/watch?v=videoOld0001",
  };
  const bytes = await buildWorkbook([video, older]);
  const view = new Uint8Array(bytes);
  assert.equal(view[0], 0x50);
  assert.equal(view[1], 0x4b);

  const workbook = new Workbook();
  await workbook.xlsx.load(bytes as Parameters<Workbook["xlsx"]["load"]>[0]);
  const sheet = workbook.getWorksheet("Videos");
  assert.ok(sheet);

  const headers = [1, 2, 3, 4, 5, 6].map((column) => sheet.getRow(1).getCell(column).value);
  assert.deepEqual(headers, [
    "SN",
    "video title",
    "like count",
    "view count",
    "playlist title",
    "URL",
  ]);
  assert.equal(sheet.getRow(2).getCell(1).value, 1);
  assert.equal(sheet.getRow(2).getCell(2).value, "New title");
  assert.equal(sheet.getRow(2).getCell(3).value, null);
  assert.equal(sheet.getRow(2).getCell(4).value, 20);
  assert.equal(sheet.getRow(2).getCell(5).value, "Talks");
  assert.equal(sheet.getRow(2).getCell(6).value, "https://www.youtube.com/watch?v=videoNew0001");
  assert.equal(sheet.getRow(3).getCell(1).value, 2);
  assert.equal(sheet.getRow(3).getCell(2).value, "Old title");
  assert.equal(sheet.getRow(3).getCell(3).value, 4);
  assert.equal(sheet.getRow(3).getCell(4).value, 10);
  assert.equal(sheet.getRow(3).getCell(5).value, "");
  assert.equal(sheet.getRow(3).getCell(6).value, "https://www.youtube.com/watch?v=videoOld0001");
  assert.equal(sheet.columnCount, 6);
});

test("builds a safe workbook filename from the channel title", () => {
  const filename = workbookFilename("Google for Developers!", new Date("2026-10-25T12:00:00Z"));
  assert.equal(filename, "youtube-google-for-developers-2026-10-25.xlsx");
});
