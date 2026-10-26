import { describe, expect, it } from "vitest";
import { queuedCommentIdsFromWakePayload } from "../services/issue-queued-comment-queue.js";

describe("queuedCommentIdsFromWakePayload", () => {
  it("drops non-uuid ids so a malformed wake cannot break the uuid lookup", () => {
    const good = "8e3bb32a-571c-48af-9b65-5c2183fe85f3";
    const payload = { _paperclipWakeContext: { wakeCommentIds: ["x", good, good, ""] } };
    expect(queuedCommentIdsFromWakePayload(payload)).toEqual([good]);
  });
});
