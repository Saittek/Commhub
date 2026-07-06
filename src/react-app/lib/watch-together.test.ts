import { describe, expect, it } from "vitest";
import { parseWatchTogetherMetadata, toYouTubeEmbedUrl } from "./watch-together";

describe("toYouTubeEmbedUrl", () => {
  it("converts watch URLs", () => {
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converts youtu.be links", () => {
    expect(toYouTubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("returns null for unsupported hosts", () => {
    expect(toYouTubeEmbedUrl("https://example.com/video")).toBeNull();
  });
});

describe("parseWatchTogetherMetadata", () => {
  it("parses stored metadata", () => {
    expect(parseWatchTogetherMetadata('{"videoUrl":"https://youtu.be/abc"}')).toEqual({
      videoUrl: "https://youtu.be/abc",
    });
  });
});
