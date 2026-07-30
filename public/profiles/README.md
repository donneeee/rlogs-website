# Developer-published profiles

This folder is the temporary, no-authentication publication path for public
rLogs profile envelopes.

- `index.v1.json` is the only discovery index.
- Each public character UID owns one versioned profile payload.
- The index records the exact byte length and SHA-256 digest.
- The browser validates the index, digest, website envelope, prohibited-field
  policy, and routing metadata before rendering.
- Profiles received from native `current.profile.json` files retain only the
  request seal, creation time, observation count, and client build in the
  index. Source session IDs and sealed-log hashes remain local.
- A package means a repository developer published reviewed test data. It is
  not an authenticated character claim.

Do not add packet captures, raw journals, credentials, account/login data,
private chat, local package source evidence, or unreviewed exports here. Use
`npm run profile:publish` from the repository root so package and index
validation stay synchronized. Folder and URL keys are derived from the
character UID; display names are never routes.
