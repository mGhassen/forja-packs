---
name: create-forja-pack
description: >-
  Create or extend Forja EngineJS packs in forja-packs by cloning a peer pack.
  Covers catalog-kit / torrent-kit, envelopes, ctx, schemas (forja-sdk).
  Use when adding a provider, hop, hub, livesports plugin, torrent indexer,
  IPTV hub change, new plugin, new pack, or scaffolding manifest/entry JS.
---

# Create Forja pack / plugin

Clone a peer in this repo. Do not invent a blank shape. Do not edit Forja host Dart.

## Before writing

1. Ask if unclear: **kind** + **id** + **display name** + **upstream origin**.
2. Decide mode:
   - **Add plugin** → existing multi-plugin pack (`providers`, `livesports`, `torrent`)
   - **New hub pack** → new `hubs/<slug>/`
   - **Extend IPTV** → `hubs/iptv/` only (ask before a new companion tree)
3. **Read [sdk-kit.md](sdk-kit.md)** — kit/protocol, envelopes, `ctx`, entry points, schemas. Do not write JS until this is loaded.
4. Open [clone-targets.md](clone-targets.md) and pick the clone source for that kind.
5. If still unsure: sibling `../forja-sdk/DEVELOPING.md` + matching `schema/*.schema.json` + kit source file.

## Workflow

Copy and track:

```
Pack progress:
- [ ] Kind + mode chosen
- [ ] Peer cloned (files + manifest snippet)
- [ ] Ids / names / config renamed
- [ ] Upstream JS rewritten
- [ ] bundle updated
- [ ] version bumped
- [ ] validate-manifests.yml updated (new hub folder only)
- [ ] README inventory row (new installable pack only)
- [ ] Local install path given to user
```

### A — Add plugin to existing pack

1. Read peer entry + its `plugins[]` object in that pack’s `manifest.json`.
2. Copy entry JS next to peers (`providers/foo.js`, `providers/hops/foo.js`, `livesports/foo.js`, `torrent/foo.js`).
3. Append a new `plugins[]` object (same shape as peer; new `id`).
4. Add every new path to top-level `bundle` if the pack uses `bundle`.
5. Bump pack `version`.
6. Strip peer upstream leftovers — keep only the new site’s logic.

### B — New hub pack (`hubs/<slug>/`)

1. `cp -R` clone target folder → `hubs/<slug>/` (see clone-targets).
2. Rewrite `manifest.json`: pack `id` (`forjahq-<slug>`), plugin `id`, `nav.label`, `nav.icon`, `config`, `description`.
3. Keep `_kit.js` unless intentionally syncing from `forja-sdk/catalog-kit.js` (see sdk-kit.md).
4. Replace hub JS — return `hubOk` / `hubItems` / `hubFail` envelopes; layout via `kitStack` / `kitMenu` / …
5. Openable metas need `open.surface` + `open.id` (host routes on surface only).
6. Optional enrich companion: second plugin + `enrich: "<id>"` like anime/kids peers.
7. `bundle` = every file install needs (JS, `_kit.js`, `icons/nav.png`, …).
8. Add `hubs/<slug>` to `.github/workflows/validate-manifests.yml`.
9. Add a row to root `README.md` pack inventory.

### C — Livesports specifics

- `types: ["live_sport"]`, `capabilities: ["catalog","resolve"]` (or subset).
- Same `extract(ctx)`; branch on `ctx.action`.
- Catalog rows: schedule fields + opaque `sources: [{ source, id }]` — **no** playable `streams[]` / iframe.
- Resolve: native `{ url, headers? }` only. Unlock fail → omit row. No `webviewOnly`.
- Prefer cloning `streamfree` (HTTP). Clone goat/gasm peers only when unlock WASM is required.

### D — Provider / hop specifics

- Provider: `extract(ctx)` → stream array (`url` required). Miss → `[]`.
- Hop: `kind: "hop"`, `hosts: […]`, `extract(ctx)` uses `ctx.url`.
- Types: `movie` / `tv` / `anime` / `drama` as needed.

### E — Torrent specifics

- `kind: "torrent"`, implement **`search(ctx)`** (not `extract`).
- Return `{ name, magnet, seeders, size, source }[]`.
- Keep pack `prelude: "_torrent_common.js"` — use `magnetFromHash` / helpers like knaben.

### F — IPTV

- Default: extend `hubs/iptv/` (clone patterns from files already there).
- New top-level companion pack: **ask first**. Do not resurrect `archived/iptv_vod` blindly.

## User-facing copy

`name` / `description` / `nav.label` = what it does **now**. No “only / formerly / separate packs / host-owned” residue.

## Hand off

Tell the user the local install path:

```text
/Users/mghassen/Workspace/forja-packs/<tree>/manifest.json
```

Settings → Forja Packs → paste path → Reload after edits.

## Do not

- Edit `apps/forja` / foundation for pack-only work
- Put new packs under `archived/`
- Skip `version` bump on behavior change
- Leave stale peer ids / origins / hostnames in the copy
