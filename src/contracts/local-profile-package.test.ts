import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  type LocalProfilePackage,
  requestDigest,
  validateLocalProfilePackage,
} from "./local-profile-package";

describe("local profile package contract", () => {
  it("keeps the browser demo on the exact native package boundary", async () => {
    const value: unknown = JSON.parse(
      readFileSync(
        new URL(
          "../../public/fixtures/bpsr-local-profile-package.v1.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );

    const result = await validateLocalProfilePackage(value);

    expect(result.errors).toEqual([]);
    expect(result.package?.request.payload.body.display_name).toBe(
      "Example Adventurer",
    );
  });

  it("accepts a native-compatible package and verifies its canonical seal", async () => {
    const profilePackage = await packageFixture();
    const result = await validateLocalProfilePackage(profilePackage);

    expect(result.errors).toEqual([]);
    expect(result.package?.request.payload.routing["character-id"]).toBe(
      "1000001",
    );
  });

  it("uses recursively sorted request keys for a stable cross-runtime digest", async () => {
    const profilePackage = await packageFixture();
    const reordered = {
      payload: {
        routing: {
          region: "north-america",
          deployment: "global",
          "character-id": "1000001",
        },
        schema_version: 1,
        payload_schema_version: 1,
        payload_schema_id: "app.rlogs.bpsr.character-profile",
        payload_kind: "character-profile",
        game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
        body: {
          level: 60,
          display_name: "Test Character",
          character: { character_id: "1000001" },
        },
      },
      relative_endpoint: "/v1/games/blue-protocol-star-resonance/profiles",
    };

    expect(await requestDigest(reordered)).toBe(profilePackage.package_id);
  });

  it("matches the native Rust canonical digest test vector", async () => {
    const request = {
      relative_endpoint: "/v1/games/example/profiles",
      payload: {
        schema_version: 1,
        game_plugin_id: "app.rlogs.game.example",
        payload_kind: "character-profile",
        payload_schema_id: "app.rlogs.example.character-profile",
        payload_schema_version: 1,
        routing: {
          deployment: "global",
          region: "north-america",
          "character-id": "123456",
        },
        body: { display_name: "Example", level: 60 },
      },
    };

    expect(await requestDigest(request)).toBe(
      "9e4ccb06bb416aef8630df13fb4fffa8d1cd9b79ff84fd8c23414c87b9cdd287",
    );
  });

  it("rejects request tampering", async () => {
    const profilePackage = await packageFixture();
    profilePackage.request.payload.body.level = 61;

    const result = await validateLocalProfilePackage(profilePackage);

    expect(result.package).toBeUndefined();
    expect(result.errors.join(" ")).toContain("package_id does not match");
  });

  it("reapplies the credential boundary to packaged payloads", async () => {
    const profilePackage = await packageFixture();
    profilePackage.request.payload.body = {
      account: { id: "must-never-publish" },
    };
    profilePackage.package_id = await requestDigest(profilePackage.request);

    const result = await validateLocalProfilePackage(profilePackage);

    expect(result.package).toBeUndefined();
    expect(result.errors.join(" ")).toContain(
      "prohibited account or credential field",
    );
  });

  it("rejects unknown package and source fields like the native serde contract", async () => {
    const profilePackage = (await packageFixture()) as LocalProfilePackage & {
      authorization?: string;
    };
    profilePackage.authorization = "not-allowed";
    (profilePackage.source as ProfilePackageSourceWithExtra).token_hint =
      "not-allowed";

    const result = await validateLocalProfilePackage(profilePackage);

    expect(result.errors).toContain("package.authorization is not supported.");
    expect(result.errors).toContain("source.token_hint is not supported.");
  });
});

interface ProfilePackageSourceWithExtra {
  session_id: string;
  client_build: string;
  protocol_pack_digest: string;
  canonical_content_sha256: string;
  observation_count: number;
  last_event_sequence: number;
  token_hint?: string;
}

async function packageFixture(): Promise<LocalProfilePackage> {
  const request = {
    relative_endpoint: "/v1/games/blue-protocol-star-resonance/profiles",
    payload: {
      schema_version: 1,
      game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
      payload_kind: "character-profile",
      payload_schema_id: "app.rlogs.bpsr.character-profile",
      payload_schema_version: 1,
      routing: {
        "character-id": "1000001",
        deployment: "global",
        region: "north-america",
      },
      body: {
        character: { character_id: "1000001" },
        display_name: "Test Character",
        level: 60,
      },
    },
  };
  return {
    schema_version: 1,
    package_id: await requestDigest(request),
    created_unix_millis: 1_789_000_000_000,
    source: {
      session_id: "session-1",
      client_build: "build-1",
      protocol_pack_digest: "sha256:pack-1",
      canonical_content_sha256: `sha256:${"a".repeat(64)}`,
      observation_count: 2,
      last_event_sequence: 9,
    },
    request,
  };
}
