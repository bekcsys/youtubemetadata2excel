import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelUrl } from "./channel-url";
import { IngestError } from "./errors";

test("parses handle, channel, user, and custom URLs", () => {
  assert.deepEqual(parseChannelUrl("https://www.youtube.com/@GoogleDevelopers"), {
    kind: "handle",
    value: "GoogleDevelopers",
  });
  assert.deepEqual(parseChannelUrl("https://www.youtube.com/@GoogleDevelopers/videos"), {
    kind: "handle",
    value: "GoogleDevelopers",
  });
  assert.deepEqual(parseChannelUrl("youtube.com/@GoogleDevelopers"), {
    kind: "handle",
    value: "GoogleDevelopers",
  });
  assert.deepEqual(
    parseChannelUrl("https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"),
    { kind: "id", value: "UC_x5XG1OV2P6uZZ5FSM9Ttw" },
  );
  assert.deepEqual(parseChannelUrl("https://m.youtube.com/user/GoogleDevelopers"), {
    kind: "username",
    value: "GoogleDevelopers",
  });
  assert.deepEqual(parseChannelUrl("https://www.youtube.com/c/GoogleDevelopers"), {
    kind: "custom",
    value: "GoogleDevelopers",
  });
});

test("rejects links that are not channel URLs", () => {
  assert.throws(() => parseChannelUrl(""), IngestError);
  assert.throws(() => parseChannelUrl("https://example.com/@GoogleDevelopers"), IngestError);
  assert.throws(() => parseChannelUrl("https://www.youtube.com/watch?v=abc"), IngestError);
  assert.throws(() => parseChannelUrl("https://www.youtube.com/channel/not-a-channel"), IngestError);
  assert.throws(() => parseChannelUrl("https://www.youtube.com/@"), IngestError);
});
