import { describe, expect, it } from "vitest";
import { isVoiceInviteMessage, parseVoiceInvite, stripVoiceInviteMarker } from "./voice-invite";

describe("voice-invite", () => {
  const content =
    "🎤 **Ada** invited you to join **General** in **My Server**.\n<!--voice-invite:s1:c1:inv1-->";

  it("parses invite metadata", () => {
    expect(parseVoiceInvite(content)).toEqual({
      serverId: "s1",
      channelId: "c1",
      inviteId: "inv1",
    });
  });

  it("strips hidden marker from display text", () => {
    expect(stripVoiceInviteMarker(content)).toBe(
      "🎤 **Ada** invited you to join **General** in **My Server**.",
    );
  });

  it("detects invite messages", () => {
    expect(isVoiceInviteMessage(content)).toBe(true);
    expect(isVoiceInviteMessage("hello")).toBe(false);
  });
});
