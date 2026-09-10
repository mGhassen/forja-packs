# forja-packs

Official and community **EngineJS packs** for [Forja](https://github.com/mGhassen/Forja).

Packs are JavaScript plugins the Forja app installs by manifest URL, caches on disk, and runs at runtime. The Flutter host does **not** ship pack inventory — this repo is the source of truth for ForjaHQ packs.

| | |
|--|--|
| **Host app** | [mGhassen/Forja](https://github.com/mGhassen/Forja) |
| **Install** | Settings → Sources → Forja → paste a `manifest.json` URL |
| **Contracts** | [`sdk/`](sdk/) — schemas, kits, [DEVELOPING.md](sdk/DEVELOPING.md) |
| **Raw manifests** | `https://raw.githubusercontent.com/mGhassen/forja-packs/main/<path>/manifest.json` |

## Pack inventory

| Pack | Manifest | Role |
|------|----------|------|
| **Providers** | [`providers/manifest.json`](providers/manifest.json) | VOD / anime / drama scrapers + file-host hops |
| **Catalog** | [`catalog/manifest.json`](catalog/manifest.json) | Live Sports schedule catalogs |
| **Live** | [`live/manifest.json`](live/manifest.json) | Live Sports stream resolve (Forja Live) |
| **Torrent** | [`torrent/manifest.json`](torrent/manifest.json) | Builtin torrent indexer search |
| **Home** | [`hubs/home/manifest.json`](hubs/home/manifest.json) | Home catalog hub (TMDB) |
| **Anime** | [`hubs/anime/manifest.json`](hubs/anime/manifest.json) | Anime catalog hub (AniList) |
| **Asian Drama** | [`hubs/asian_drama/manifest.json`](hubs/asian_drama/manifest.json) | Asian Drama catalog hub (KissKH) |
| **Arabic** | [`hubs/arabic/manifest.json`](hubs/arabic/manifest.json) | Arabic hub (Larozaa) |
| **Aflem** | [`hubs/aflem/manifest.json`](hubs/aflem/manifest.json) | Aflem series hub |
| **Cartoon** | [`hubs/cartoon/manifest.json`](hubs/cartoon/manifest.json) | كرتون / DimaToon hub |
| **Kids** | [`hubs/kids/manifest.json`](hubs/kids/manifest.json) | Kids / Dimakids hub |
| **Shahid** | [`hubs/shahid/manifest.json`](hubs/shahid/manifest.json) | Shahid movies and series |
| **Live Sports** | [`hubs/live_sports/manifest.json`](hubs/live_sports/manifest.json) | Live sports schedule and streams |
| **My List** | [`hubs/my_list/manifest.json`](hubs/my_list/manifest.json) | My List hub |
| **IPTV VOD** | [`iptv/vod/manifest.json`](iptv/vod/manifest.json) | IPTV portal VOD details |

Web **Community Packs** lists packs published in admin (`plugin_packs`). Register a pack there with its GitHub (or CDN) `manifest.json` URL.

## Layout

```
forja-packs/
├── providers/     VOD extractors + hops/
├── torrent/       Torrent indexer search
├── live/          Live match resolvers (+ goat/gasm/sportsembed modules)
├── catalog/       Live schedule catalogs
├── iptv/          IPTV feature packs (VOD details)
├── hubs/          Catalog hub packs (home, anime, …)
├── archived/      Retired packs (not installable)
├── sdk/           JSON Schema contracts + catalog/torrent kits
└── domains.json   Shared domain hints
```

Each pack is a `manifest.json` plus JS entries. Optional **`bundle`** lists every file the host downloads on install:

```json
"bundle": ["videasy.js", "hops/abyss.js", "_kit.js"]
```

If `bundle` is omitted, the host derives paths from each plugin’s `entry` / `prelude`.

## Local development (with Forja)

Clone this repo next to Forja (recommended):

```text
Workspace/
├── Forja/
└── forja-packs/
```

In Forja `.env` (or `--dart-define-from-file`):

```bash
FORJA_PACKS_ROOT=/path/to/forja-packs
# Optional per-pack overrides:
# FORJA_HQ_PROVIDERS_MANIFEST_URL=/path/to/forja-packs/providers/manifest.json
```

Debug builds resolve local packs from `FORJA_PACKS_ROOT`, then a sibling `forja-packs/` checkout, then legacy `FORJA_REPO_ROOT/plugins/`.

## Authoring packs

See **[sdk/DEVELOPING.md](sdk/DEVELOPING.md)** — manifest schema, `extract(ctx)` / `search(ctx)`, catalog hub protocol.

Machine contracts: [`sdk/contract.json`](sdk/contract.json) + [`sdk/schema/`](sdk/schema/).

## License

Pack sources in this repository are provided for use with Forja. See [LICENSE](LICENSE).
