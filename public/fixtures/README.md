# Public website fixtures

- `bpsr-character-profile.v1.json` is a synthetic contract example.
- `bpsr-local-profile-package.v1.json` is a synthetic native-package example
  with a reproducible cross-runtime request seal.

User-authorized developer profile packages live under `public/profiles/`, not
in the fixture folder. They are indexed, hashed, and loaded through the same
versioned website-payload and local-package validators used for local imports.

Source captures remain private and are never website artifacts.
