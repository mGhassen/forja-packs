# Clone targets

Prefer the **smallest clean peer** that matches the kind. Copy structure + manifest snippet; rewrite upstream.

| Kind | Mode | Clone from | Copy |
|------|------|------------|------|
| **Provider** (`http`) | Add plugin | `providers/videasy.js` + its `plugins[]` entry in `providers/manifest.json` | JS file + manifest object; bump `version` |
| **Hop** | Add plugin | `providers/hops/abyss.js` + `hop-abyss` in `providers/manifest.json` | `hops/<id>.js` + `kind: hop` + `hosts[]` |
| **Hub** (new tab) | New pack | `hubs/cartoon/` (manifest + `_kit.js` + entry + `icons/`) | Whole folder → `hubs/<slug>/`; rename everything |
| **Hub + enrich** | New pack | `hubs/anime/` or `hubs/kids/` | Folder + enrich plugin pair |
| **Live sports** | Add plugin | `livesports/streamfree.js` + its manifest entry | Unified `catalog`+`resolve`; `_prelude.js` |
| **Live + GOAT/GASM** | Add plugin | Peer already using that unlock (`livesports/` goat/gasm entries) | Only when WASM unlock required |
| **Torrent** | Add plugin | `torrent/knaben.js` + its manifest entry | `search(ctx)`; keep `_torrent_common.js` prelude |
| **IPTV hub** | Extend | `hubs/iptv/` (`iptv.js`, `_prelude.js`, `_portals.js`, …) | Edit in place; bump version |
| **IPTV companion** | New pack | **Ask user** — no live `iptv/` tree; `archived/iptv_vod` is retired | Do not default-clone archived |

## SDK fallback (no peer fit)

Sibling repo `forja-sdk/starters/`:

| Kind | Starter |
|------|---------|
| Provider | `forja-sdk/starters/provider/` |
| Hub | `forja-sdk/starters/hub/` |

Still prefer a forja-packs peer when one exists. Starters for greenfield community shapes only.

## Manifest snippet shapes

### Provider

```json
{
  "id": "myprovider",
  "name": "My Provider",
  "entry": "myprovider.js",
  "types": ["movie", "tv"],
  "kind": "http"
}
```

### Hop

```json
{
  "id": "hop-mysite",
  "name": "My Host",
  "entry": "hops/mysite.js",
  "types": ["movie", "tv"],
  "kind": "hop",
  "hosts": ["example.com", "cdn.example.com"]
}
```

### Livesports

```json
{
  "id": "mysport",
  "name": "My Sport",
  "description": "schedule and stream resolve",
  "entry": "mysport.js",
  "types": ["live_sport"],
  "kind": "http",
  "prelude": "_prelude.js",
  "capabilities": ["catalog", "resolve"],
  "defaultCapabilities": { "catalog": true, "resolve": true },
  "config": { "origin": "https://example.com" }
}
```

### Torrent

```json
{
  "id": "myindex",
  "name": "My Index",
  "entry": "myindex.js",
  "kind": "torrent",
  "searchInputs": ["query"],
  "config": { "source": "My Index" }
}
```

### Hub pack (top-level)

See `hubs/cartoon/manifest.json` — `kind: catalog`, `protocol: 1`, `kit: 1`, `capabilities`, `nav`, `prelude: "_kit.js"`, `bundle`.

## CI

New installable hub directory → add to `.github/workflows/validate-manifests.yml` `for dir in …` list.
