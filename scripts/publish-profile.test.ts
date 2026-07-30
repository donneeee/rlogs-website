import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { publishProfilePackage } from "./publish-profile";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("developer profile publisher", () => {
  it("writes a validated package and updates the same slug in place", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    await writeFile(input, JSON.stringify(profileEnvelope("character-1", 60)));

    const first = await publishProfilePackage({
      input,
      slug: "test-character",
      websiteRoot: root,
      confirmPublic: true,
    });
    expect(first.wroteFiles).toBe(true);

    await writeFile(input, JSON.stringify(profileEnvelope("character-1", 61)));
    await publishProfilePackage({
      input,
      slug: "test-character",
      websiteRoot: root,
      confirmPublic: true,
    });

    const index = JSON.parse(await readFile(first.indexPath, "utf8")) as {
      profiles: Array<{ slug: string }>;
    };
    expect(index.profiles.map((entry) => entry.slug)).toEqual(["test-character"]);
    const payload = JSON.parse(await readFile(first.profilePath, "utf8")) as {
      body: { level: number };
    };
    expect(payload.body.level).toBe(61);
  });

  it("normalizes published package line endings for stable GitHub Pages hashes", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    const source = `${JSON.stringify(profileEnvelope("character-1", 60), null, 2)}\n`
      .replace(/\n/g, "\r\n");
    await writeFile(input, source);

    const result = await publishProfilePackage({
      input,
      slug: "test-character",
      websiteRoot: root,
      confirmPublic: true,
    });
    const published = await readFile(result.profilePath, "utf8");

    expect(published).not.toContain("\r");
    expect(result.entry.payload_bytes).toBe(Buffer.byteLength(published));
  });

  it("requires explicit confirmation before writing public files", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    await writeFile(input, JSON.stringify(profileEnvelope("character-1", 60)));

    await expect(
      publishProfilePackage({
        input,
        slug: "test-character",
        websiteRoot: root,
      }),
    ).rejects.toThrow("--confirm-public");
  });

  it("rejects prohibited account data before publication", async () => {
    const root = await temporaryRoot();
    const input = join(root, "profile.json");
    const profile = profileEnvelope("character-1", 60);
    profile.body.account = { id: "private" };
    await writeFile(input, JSON.stringify(profile));

    await expect(
      publishProfilePackage({
        input,
        slug: "test-character",
        websiteRoot: root,
        confirmPublic: true,
      }),
    ).rejects.toThrow("prohibited account or credential field");
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rlogs-profile-publisher-"));
  temporaryRoots.push(root);
  return root;
}

function profileEnvelope(characterId: string, level: number) {
  const body: Record<string, unknown> = {
    character: { character_id: characterId },
    display_name: "Test Character",
    level,
  };
  return {
    schema_version: 1,
    game_plugin_id: "app.rlogs.game.blue-protocol-star-resonance",
    payload_kind: "character-profile",
    payload_schema_id: "app.rlogs.bpsr.character-profile",
    payload_schema_version: 1,
    routing: {
      deployment: "global",
      region: "global",
      realm: "asteria",
      "character-id": characterId,
    },
    body,
  };
}
