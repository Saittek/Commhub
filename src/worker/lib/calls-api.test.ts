import { describe, expect, it } from "vitest";
import { callsConfigured } from "./calls-api";

describe("callsConfigured", () => {
  it("is false when credentials are missing", () => {
    expect(callsConfigured({} as Env)).toBe(false);
    expect(callsConfigured({ CALLS_APP_ID: "app" } as Env)).toBe(false);
  });

  it("is true when both credentials are set", () => {
    expect(
      callsConfigured({
        CALLS_APP_ID: "app-id",
        CALLS_APP_SECRET: "secret",
      } as Env),
    ).toBe(true);
  });
});
