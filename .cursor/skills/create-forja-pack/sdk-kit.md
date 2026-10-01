# SDK + kit (must read before writing pack JS)

Source of truth: sibling **`forja-sdk`** (`../forja-sdk/` from forja-packs).
Index: `contract.json` · guide: `DEVELOPING.md` · layout catalog: `docs/components.md` · machine index: `schema/layout-components.schema.json` · kits: `catalog-kit.js`, `torrent-kit.js`.

Packs **vendor** kits as local prelude (`_kit.js`, `_torrent_common.js`). Never `require` a sibling sdk path at runtime.

| Constant | Value today |
|----------|-------------|
| `kit` / `HUB_KIT` | `1` |
| `protocol` / `HUB_PROTOCOL` | `1` |

If pack `kit` > host kit → shell shows unsupported kit. Stay on `1` unless host ships a bump.

---

## Entry points (`contract.json`)

| Plugin `kind` | Function | Return |
|---------------|----------|--------|
| `http`, `hop`, `host` | `extract(ctx)` | `Promise` or array of stream rows |
| `catalog` | `extract(ctx)` | **one-element** envelope array `[env]` (or use `hubOk` / `hubFail`) |
| `torrent` | `search(ctx)` | array of torrent rows |

---

## Schemas (validate shapes against these)

| Kind | Schema |
|------|--------|
| Pack manifest | `schema/manifest.schema.json` |
| Catalog response | `schema/catalog-envelope.schema.json` |
| VOD / hop streams | `schema/vod-stream.schema.json` |
| Torrent search wrapper | `schema/torrent-search.schema.json` |
| Torrent row | `schema/torrent-row.schema.json` |

Fixtures: `forja-sdk/fixtures/` (`anilist_rail.json`, `anilist_layout.json`, …).

---

## Shared `ctx` (all kinds)

| API | Use |
|-----|-----|
| `ctx.config` | Manifest `config` + optional cloud overlay |
| `ctx.fetch(url, opts)` | HTTP |
| `ctx.chromeFetch(url, opts)` | Chrome TLS/JA3 when needed |
| `ctx.log` / `ctx.error` | Logging |
| `ctx.hop(url)` | Delegate to hop plugin by hostname (`hosts[]`) |
| `ctx.crypto.*` | STREAMCRYPTO helpers (see providers peers) |

Do not hardcode TMDB API keys — use host helpers below.

---

## Catalog kit (`catalog-kit.js` → pack `_kit.js`)

### Request helpers

```javascript
hubAction(ctx)   // string action
hubParams(ctx)   // params object
hubAuth(ctx)
hubCache(ctx)
hubConfig(ctx, defaults)  // merges defaults + ctx.config, strips __request
```

Prefer top-level `ctx.action` / `ctx.params` / `ctx.auth` / `ctx.cache` / `ctx.kit` / `ctx.protocol`. Older hosts may still use `ctx.config.__request` — kit helpers fall back.

### Envelope builders (always return **array**)

```javascript
hubOk(action, data, cache)           // [{ ok:true, kit:1, protocol:1, action, data, cache? }]
hubItems(action, items, cache, paging)
hubFail(action, code, message, retryable)
hubNotModified(action)
```

Error `code` enum: `INVALID_ACTION` | `INVALID_PARAMS` | `NOT_FOUND` | `AUTH_REQUIRED` | `AUTH_EXPIRED` | `RATE_LIMIT` | `UPSTREAM` | `PARSE` | `UNSUPPORTED_KIT` | `CANCELLED`.

### Catalog `ctx.action` → `data`

| Action | Typical `data` |
|--------|----------------|
| `layout` | `pages.{page}.widgets[]` |
| `rail` / `feed` / `search` | `items[]` (+ paging) |
| `details` | `meta` (+ optional `rails`, optional `layout`) |
| `filters` | `fields[]` (+ optional play filters) |
| `enrich` | enriched `items` / `meta` (companion plugin) |

`details.layout` (optional) — host paints backdrop / first body row from these props only:

```javascript
layout: {
  fullBleedBackdrop: true,       // backdrop fills viewport (else backdropFraction)
  backdropFraction: 0.82,        // optional; default 0.82 when not full-bleed
  firstBodyRowFraction: 0.65,    // optional; first body row Y + overlap; omit = no overlap
}
```

Omit `layout` → classic 82% hero, no body pull-up.

### Layout (one foundation catalog)

**Author catalog (full DS):** `forja-sdk/docs/components.md` · `forja-sdk/schema/layout-components.schema.json` — includes `not_mounted` atoms/widgets. Pack JSON only paints `status: mounted`.

**Everything is a component.** Host = one mount table. `kit.stack` composes children; each child is any **mounted** foundation `type` (chrome, list, hero, prepared page, …). No atoms-vs-blocks API.

```javascript
kitStack(id, opts, children)       // kit.stack — expand:true on last child
kitMenu(id, items, opts)           // kit.menu
kitTabs(id, tabs, opts)            // kit.tabs
kitList(id, opts)                  // kit.list — hubWithLoad for feed
kitRow(id, opts)                   // kit.row — rail
kitTopBar(id, opts)                // kit.topBar
kitCategoryBar(id, opts)           // kit.categoryBar — orientation:'vertical' for side rail
kitNode(type, id, opts, children)  // any foundation type string
kitColumnsHeader(id, opts, children) // optional prepared page
kitTopBody(id, opts, children)     // optional prepared page
kitTabsCards(id, opts, children)   // optional prepared page
playFilterGrouped(field, options, opts)
```

Usual page:

```javascript
kitStack('page', { expand: true }, [
  kitTopBar('chrome', { actions: […] }),
  kitCategoryBar('cats', { items: […], default: 'all' }),
  hubWithLoad(kitList('items', { style: 'grid', kindMenu: 'cats' }), 'feed', {}),
]);
```

Legacy aliases still work in host (`stack` → `kit.stack`, …). Prefer `kit.*`. Sync helpers from `forja-sdk/catalog-kit.js`.

### Paint (validate + paint host)

Host does **not** invent `title` / `poster` / schedule fields. Packs shape paint:

```javascript
hubPaintPoster(meta)           // { paint: { type: 'posterCard', props: { title, imageUrl, … } }, open?, meta? }
hubPaintHero(meta)             // poster + backdropUrl / logoUrl / overview for hero slides
hubPaintEvent(meta, opts)      // { paint: { type: 'eventCard', props: { … } } }
hubWithLoad(node, action, params)  // node.load → host opaque runPlugin(action, params)
```

`hubItems` stamps `hubPaintPoster` when an item has no `paint` yet.

Cards stay `posterCard` / `eventCard`. Product difference = pack JSON + `open.surface`, not host Dart.

Hub `nav.page.action` must declare the opaque page load (usually `"layout"`). Rails/lists that need data use `hubWithLoad(..., 'rail'|'feed'|…, params)` — host never special-cases those action names.

### Meta / open

Openable items need:

```javascript
open: { surface: 'anime'|'drama'|'tmdb'|'arabic'|…, id: '<opaque>', extract?: { … } }
```

Host routes on **`open.surface` only** — never pack id / scraper name.

### TMDB helpers (in kit)

`hubTmdbMatch`, `hubTmdbMatchFetch`, `hubTmdbById`, `hubApplyTmdbHit`, `hubEnrichTmdb`, `hubEnrichMetaVideos`, …

Also host: `ctx.host.tmdb.match({ title, year, type })` when available.

### Re-vendor `_kit.js`

When cloning a hub, **keep** the peer `_kit.js` unless intentionally syncing from `forja-sdk/catalog-kit.js`. If SDK kit gained APIs you need → copy SDK file into pack `_kit.js` and bump pack `version`. Do not half-edit helpers.

---

## VOD / hop (`extract`)

Stream row (required playable field):

```javascript
{ url: 'https://…/index.m3u8', name?, title?, quality?, language?, headers?, subtitles? }
```

Miss → `[]` (do not throw). Hop: `kind: "hop"`, `hosts: […]`, `ctx.url` is the embed page.

---

## Torrent kit (`torrent-kit.js` → `_torrent_common.js`)

Entry: **`search(ctx)`** with `ctx.query`, optional `ctx.imdbId` / season / episode.

```javascript
row(ctx, name, hash, seeders, size, fallbackSource)
magnetFromHash(hash, name)
formatBytes(bytes)
fetchJson / fetchText / fetchJsonMaybeJina / fetchTextMaybeProxy
```

Row must have `name`, `magnet` (`magnet:?xt=urn:btih:…`), `seeders`, `size`, `source` (strings).

---

## Live sport (`types: ["live_sport"]`)

Same `extract(ctx)`; branch `ctx.action`:

| Action | Return |
|--------|--------|
| `catalog` | schedule rows + opaque `sources: [{ source, id }]` — **no** streams/iframe playables |
| `resolve` | native `{ url, headers? }` only; unlock fail → omit |

Live unlock (when pack ships modules): `ctx.live.goatUnlock` / `gasmUnlock` / `sportsEmbedUnlock` / `sniffEmbed` (sniff skipped on ATV).

---

## Manifest fields agents must get right

| Field | Notes |
|-------|-------|
| Pack `schema` | `1` |
| Pack `id` | stable (`forjahq-…`) |
| `version` | semver; bump on behavior change |
| Plugin `kind` | `http` \| `hop` \| `catalog` \| `torrent` \| `host` |
| Catalog | `protocol: 1`, `kit: 1`, `capabilities[]`, usually `nav` + `prelude: "_kit.js"` (comma-separated OK: `"_kit.js,_search.js"`) |
| Hub search | Pack owns `action: 'search'` (often `_search.js`); host only opens chrome + `runPlugin` — never TMDB/addons in Dart |
| `bundle` | every install path |
| Do **not** set pack/plugin `enabled` | host Settings owns on/off |

Full field table: `DEVELOPING.md` § Pack manifest.

---

## Mandatory agent reads (by kind)

| Writing… | Read first |
|----------|------------|
| Any pack | this file + `clone-targets.md` |
| Hub / IPTV catalog | `forja-sdk/catalog-kit.js` (or pack `_kit.js`) + one peer hub entry |
| Provider / hop | `schema/vod-stream.schema.json` + peer extract |
| Torrent | `torrent-kit.js` + `knaben.js` |
| Livesports | this live section + `streamfree.js` |
| Unsure of contract | `forja-sdk/DEVELOPING.md` |
