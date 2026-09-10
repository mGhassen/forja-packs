# Contributing to forja-packs

## Scope

This repo holds **EngineJS packs** only — manifests, JS extractors, hub kits, live unlock modules, and the pack SDK.

Do **not** put Flutter / Rust host code here. That lives in [Forja](https://github.com/mGhassen/Forja).

## Pack kinds

| Tree | Responsibility |
|------|----------------|
| `providers/` | VOD / anime / drama stream extract |
| `livesports/` | Live Sports schedule (`catalog` capability) + resolve (`resolve`) + unlock modules |
| `torrent/` | Torrent indexer `search(ctx)` |
| `hubs/` | Catalog hub UI (layout, open, enrich) |
| `iptv/` | IPTV feature companions (e.g. VOD details) |
| `sdk/` | Shared schemas + kits |

## Rules of thumb

1. **Host stays generic** — packs own scrapers, upstream ids, and enrich. Emit opaque `open.surface` + ids; do not assume Dart allowlists.
2. **Schedule ≠ play URL** — `catalog` capability returns fixtures only (no streams / embed iframes as playable rows).
3. **Resolve = native play** — returns `{ url, headers? }` (m3u8/mp4). No WebView-only fallbacks for live resolve.
4. **Capabilities** — one plugin per site; declare `types: ["live_sport"]` and `capabilities: ["catalog" and/or "resolve" and/or "broadcast"]`.
5. **User-facing copy** — `name` / `description` / `nav.label` describe what the pack does now. No migration notes.
6. **Validate** — keep `manifest.json` aligned with [`sdk/schema/manifest.schema.json`](sdk/schema/manifest.schema.json).

## Local install

Point Forja at a local manifest:

```text
/absolute/path/to/forja-packs/providers/manifest.json
```

Or set `FORJA_PACKS_ROOT` in the Forja `.env` (see [README](README.md)).

## PR checklist

- [ ] Manifest `id` / `version` bumped when behavior changes
- [ ] `bundle` lists every file install needs
- [ ] No host Dart changes required for pack-only work
