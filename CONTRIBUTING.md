# Contributing to forja-packs

## Scope

This repo holds **EngineJS packs** only — manifests, JS extractors, hub kits, live unlock modules, and the pack SDK.

Do **not** put Flutter / Rust host code here. That lives in [Forja](https://github.com/mGhassen/Forja).

## Pack kinds

| Tree | Responsibility |
|------|----------------|
| `providers/` | VOD / anime / drama stream extract |
| `live/` | Live Sports resolve + unlock modules |
| `catalog/` | Match **schedule** only (no streams) |
| `torrent/` | Torrent indexer `search(ctx)` |
| `hubs/` | Catalog hub UI (layout, open, enrich) |
| `iptv/` | IPTV feature companions (e.g. VOD details) |
| `sdk/` | Shared schemas + kits |

## Rules of thumb

1. **Host stays generic** — packs own scrapers, upstream ids, and enrich. Emit opaque `open.surface` + ids; do not assume Dart allowlists.
2. **Catalog ≠ streams** — `catalog/` never returns playable URLs or embed iframes as streams.
3. **Live = native play** — resolve returns `{ url, headers? }` (m3u8/mp4). No WebView-only fallbacks for Forja Live.
4. **User-facing copy** — `name` / `description` / `nav.label` describe what the pack does now. No migration notes.
5. **Validate** — keep `manifest.json` aligned with [`sdk/schema/manifest.schema.json`](sdk/schema/manifest.schema.json).

## Local install

Point Forja at a local manifest:

```text
/absolute/path/to/forja-packs/providers/manifest.json
```

Or set `FORJA_PACKS_ROOT` in the Forja `.env` (see [README](README.md)).

## PR checklist

- [ ] Manifest `version` bumped when behavior changes
- [ ] `bundle` lists every file the host must download (if used)
- [ ] No secrets / cookies committed
- [ ] Archived dead packs under `archived/` instead of leaving broken entries in live manifests
