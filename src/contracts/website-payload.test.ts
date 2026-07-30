import { describe, expect, it } from "vitest";

import { validateWebsitePayload } from "./website-payload";

function publicProfile(): Record<string, unknown> {
  return {
    schema_version: 1,
    game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
    payload_kind: "character-profile",
    payload_schema_id: "app.rlogs.bpsr.character-profile",
    payload_schema_version: 1,
    routing: {
      deployment: "global",
      region: "north-america",
      "character-id": "public-character-123",
    },
    body: {
      display_name: "Example",
      level: 60,
    },
  };
}

describe("website payload contract", () => {
  it("accepts the public version-one profile envelope", () => {
    const result = validateWebsitePayload(publicProfile());

    expect(result.errors).toEqual([]);
    expect(result.envelope?.routing["character-id"]).toBe(
      "public-character-123",
    );
  });

  it("rejects credentials nested anywhere in the profile", () => {
    const profile = publicProfile();
    profile.body = {
      character: {
        token: "must-never-leave",
      },
    };

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors).toContain(
      "prohibited account or credential field found at body.character.token.",
    );
  });

  it("rejects account containers even when the child field looks harmless", () => {
    const profile = publicProfile();
    profile.body = {
      account: {
        id: "private",
      },
    };

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors).toContain(
      "prohibited account or credential field found at body.account.",
    );
  });

  it("rejects unsupported envelope versions", () => {
    const profile = publicProfile();
    profile.schema_version = 2;

    const result = validateWebsitePayload(profile);

    expect(result.envelope).toBeUndefined();
    expect(result.errors[0]).toContain("schema_version must be 1");
  });
});

