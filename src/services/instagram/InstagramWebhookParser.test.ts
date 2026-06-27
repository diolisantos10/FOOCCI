import { describe, it, expect } from "vitest";
import { normalizeInstagramComments, normalizeInstagramPayload } from "./InstagramWebhookParser";

const BIZ = "17841400000000000"; // business IG account id (entry[].id)

function commentPayload(value: Record<string, unknown>) {
  return {
    object: "instagram",
    entry: [{ id: BIZ, time: 1_750_000_000, changes: [{ field: "comments", value }] }],
  };
}

describe("normalizeInstagramComments", () => {
  it("normalizes a customer comment with author + media", () => {
    const out = normalizeInstagramComments(commentPayload({
      id: "comment_1", text: "Que delícia! Fazem entrega no Centro?",
      from: { id: "cust_99", username: "joao.gourmet" },
      media: { id: "media_77" },
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "comment",
      commentId: "comment_1",
      mediaId: "media_77",
      fromUserId: "cust_99",
      fromUsername: "joao.gourmet",
      text: "Que delícia! Fazem entrega no Centro?",
      parentCommentId: null,
      isEcho: false,
    });
    expect(out[0]!.timestamp).toBe(1_750_000_000 * 1000); // entry time → ms
  });

  it("captures parent_id when the comment is a reply to another comment", () => {
    const out = normalizeInstagramComments(commentPayload({
      id: "comment_2", text: "obrigado!", parent_id: "comment_1",
      from: { id: "cust_99", username: "joao.gourmet" }, media: { id: "media_77" },
    }));
    expect(out[0]!.parentCommentId).toBe("comment_1");
  });

  it("flags the business's own comment as echo (so it's not stored as inbound)", () => {
    const out = normalizeInstagramComments(commentPayload({
      id: "comment_3", text: "Fazemos sim! 🛵",
      from: { id: BIZ, username: "sushi.cazza" }, media: { id: "media_77" },
    }));
    expect(out[0]!.isEcho).toBe(true);
  });

  it("ignores non-comment changes and malformed values", () => {
    expect(normalizeInstagramComments({ object: "instagram", entry: [{ id: BIZ, changes: [{ field: "mentions", value: {} }] }] })).toHaveLength(0);
    expect(normalizeInstagramComments(commentPayload({ text: "no id" }))).toHaveLength(0); // missing comment id
    expect(normalizeInstagramComments(commentPayload({ id: "c", from: {} }))).toHaveLength(0); // missing author
    expect(normalizeInstagramComments(null)).toHaveLength(0);
    expect(normalizeInstagramComments({})).toHaveLength(0);
  });

  it("does not treat a DM (messaging) payload as a comment, and vice-versa", () => {
    const dm = { object: "instagram", entry: [{ id: BIZ, messaging: [{ sender: { id: "u" }, recipient: { id: BIZ }, message: { mid: "m1", text: "oi" } }] }] };
    expect(normalizeInstagramComments(dm)).toHaveLength(0);          // DM is not a comment
    expect(normalizeInstagramPayload(commentPayload({ id: "c1", from: { id: "u" }, text: "hi" }))).toHaveLength(0); // comment is not a DM
  });
});
