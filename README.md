# rLogs Website

`rlogs-website` is the public, game-facing web testbed for rLogs. It is a
separate repository from the capture/parser application so the site, parser,
plug-ins, and future backend can evolve independently.

The first release is intentionally a static site:

- it validates the version-1 `WebsitePayloadEnvelope` emitted by rLogs;
- it imports and renders sanitized Blue Protocol: Star Resonance character
  profiles;
- it discovers hashed, developer-published profile packages without requiring
  an upload API or account authentication;
- it records the native module-optimizer smoke result without duplicating the
  Rust optimizer in TypeScript;
- it is deployable to GitHub Pages and contains no secrets, database, packet
  capture, authentication, or upload endpoint.

## Run locally

```text
npm install
npm run dev
```

Before committing:

```text
npm test
npm run check
npm run build
```

## Folder guide

```text
public/
  fixtures/                    sanitized payloads and test receipts
  profiles/                    indexed developer-published profile packages
src/
  contracts/                   versioned parser-to-website boundaries
  features/
    module-optimizer/          optimizer web adapter and status
    profile-lab/               profile import, validation, and rendering
  styles/                      shared site styling
.github/workflows/             checks and GitHub Pages deployment
```

Feature-specific files stay in their feature folder. Shared transport contracts
belong in `src/contracts`; game data does not.

## Deployment boundary

GitHub Pages hosts only static browser assets. The site must not contain API
secrets or pretend to persist profiles. A later backend will own:

- opt-in identity linking and authentication;
- idempotent profile storage;
- log ingestion, verification, and abuse controls;
- ranking calculations and leaderboard queries.

The frontend will address that backend through a configurable API adapter, so
moving away from GitHub Pages will not require rewriting page features.

## Developer profile publishing

Until the authenticated API exists, repository write access is the developer
authorization boundary. Publish an already-sanitized, user-approved profile
envelope with:

```powershell
npm run profile:publish -- --input C:\path\profile.json --slug marierose --confirm-public
npm test
npm run check
npm run build
git add public/profiles
git commit -m "data: publish updated marierose profile"
git push
```

The publisher reruns the prohibited-field and size checks, creates a
deterministic SHA-256 manifest entry, and refuses to write without
`--confirm-public`. It does not read packet captures or bypass the public
profile allowlist. A normal push deploys the package through GitHub Pages; do
not force-push.

Each package is available at
`https://donneeee.github.io/rlogs-website/?profile=<slug>`. The browser
validates the index, byte length, digest, envelope, and manifest routing before
rendering it. These packages are visibly developer-published test data, not
authenticated character claims.

Use `--dry-run` instead of `--confirm-public` to validate without writing.

## Optimizer path

The canonical optimizer remains the
`rlogs-bpsr-module-optimizer` Rust crate in RLogs. The browser imports that
implementation through its WebAssembly wrapper, keeping native and browser
scoring behavior in one implementation.

## Privacy

The browser validator mirrors Core's prohibited-field boundary for passwords,
account/login containers, credentials, tokens, cookies, email/phone fields, and
private platform identity. The example fixture is synthetic. Developer profile
packages are sanitized, user-authorized public envelopes.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).
