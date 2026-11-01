# Releasing MD Reader

Releases are automated by `.github/workflows/release.yml`. You prepare the version, merge, and push a tag; the workflow does the rest.

## Every change: checks that run automatically

`.github/workflows/ci.yml` runs on every pull request and every push to `main`, on Linux and Windows:

1. `npm run compile` — TypeScript type-check (no output files)
2. `npm test` — the test suite in `test/` (Node's built-in runner)
3. `npm run build` — bundle the extension
4. `npx vsce package` — proves the extension packages; the `.vsix` is attached to the run as an artifact for 14 days, so a reviewer can install exactly what the PR builds

Run the same locally: `npm ci && npm run compile && npm test`.

What the tests guard (see `test/`): theme validation and the export/import format, starter-theme contrast, that every highlight.js token class has a style, that settings in `package.json` and `configManager.ts` stay in step and are actually read, that every command is declared and registered, and that `package.json`, `package-lock.json` and the top `CHANGELOG.md` entry agree on the version.

## Preparing a release

Follow the documentation rule in `CLAUDE.md`. Before opening the release PR:

- [ ] `package.json` and `package-lock.json` version bumped (patch = fixes, minor = features)
- [ ] `CHANGELOG.md`: the new `## [x.y.z] — date` entry is at the top (pending work lives under `## [Unreleased]`, which you rename)
- [ ] `README.md`, `CLAUDE.md` and `docs/roadmap/ROADMAP.md` updated for what changed
- [ ] You have run the extension (F5) and tried the change in a real editor

Merge the PR, then:

```
git checkout main && git pull
git tag v0.4.0
git push origin v0.4.0
```

## What the release workflow does

1. **verify** — type-check, tests, packaging, and a guard that the tag matches `package.json` (`v0.4.0` needs version `0.4.0`).
2. **release** — creates a **draft** GitHub release with the `.vsix` attached and generated notes, publishes to the VS Code Marketplace and Open VSX, and **only then** un-drafts the release.

If any step fails, the release stays a draft (or is never created) — nothing half-published goes public. Fix the cause, delete the draft and the tag, and tag again.

### Pre-releases

A tag containing a hyphen, such as `v0.4.0-beta.1`, publishes a GitHub **pre-release** only. It is **not** sent to the Marketplace or Open VSX. `package.json` keeps the plain version (`0.4.0`); the tag may add the suffix.

## One-time setup for store publishing (maintainer)

Until these are done, releases still work — they just publish to GitHub only (the publish steps are skipped when their token is absent).

### VS Code Marketplace

1. Sign in at <https://marketplace.visualstudio.com/manage> and create a publisher whose **ID is exactly** the `publisher` field in `package.json` (`rupeshbhurke`).
2. In Azure DevOps (<https://dev.azure.com>), create a Personal Access Token: organisation **All accessible organizations**, scope **Marketplace → Manage**.
3. In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, name `VSCE_PAT`, value the token.

### Open VSX (VSCodium and other editors that use it instead of the Microsoft Marketplace)

1. Sign in at <https://open-vsx.org> with GitHub and accept the Publisher Agreement.
2. Create an access token under your profile settings.
3. Create the namespace once: `npx ovsx create-namespace rupeshbhurke -p <token>`.
4. Add the token as the repository secret `OVSX_PAT`.

## Publisher ID must not change

Settings are keyed by `mdReader.*`, so users keep their themes across any change, but a different publisher means a different extension ID: existing users would not be upgraded and would have to reinstall.
