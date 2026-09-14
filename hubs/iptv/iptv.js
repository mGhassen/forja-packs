// IPTV hub — portals in vault; Live / Movies / Series via platforms + prefs.
// Host bridges: vault, http, engine.request, playback.probe, cache.disk*.
// Player stays host via open.surface / playback.open. No ctx.host.iptv.

function iptvLayout() {
  return {
    pages: {
      iptv: {
        widgets: [
          kitStack('page', { expand: true }, [
            kitTopBar('chrome', {
              focusDown: 'cats',
              actions: [
                {
                  id: 'portals',
                  label: 'Portals',
                  icon: 'dns',
                  action: 'portals',
                },
                {
                  id: 'catalog',
                  label: 'Section',
                  icon: 'live_tv',
                  default: 'live',
                  items: [
                    { id: 'live', label: 'Live' },
                    { id: 'movies', label: 'Movies' },
                    { id: 'series', label: 'Series' },
                  ],
                },
                {
                  id: 'refresh',
                  label: 'Refresh',
                  icon: 'refresh',
                  action: 'refresh',
                },
              ],
            }),
            kitCategoryBar('cats', {
              dynamic: true,
              source: 'iptv',
              focusUp: 'chrome',
              focusDown: 'items',
              default: 'all',
            }),
            kitList('items', {
              source: 'iptv',
              style: 'grid',
              expand: true,
              focusUp: 'cats',
              kindMenu: 'cats',
              catalogMenu: 'catalog',
            }),
          ]),
        ],
      },
    },
  };
}

function iptvStreamPath(portal, kind, id, ext) {
  var base = iptvNormBase(portal.url);
  var e = String(ext || 'ts').replace(/^\./, '');
  if (!e) e = kind === 'live' ? 'ts' : 'mp4';
  var sid = String(id || '').trim();
  if (!sid) return '';
  var folder =
    kind === 'movie' || kind === 'vod'
      ? 'movie'
      : kind === 'series'
        ? 'series'
        : 'live';
  return (
    base +
    '/' +
    folder +
    '/' +
    encodeURIComponent(portal.username) +
    '/' +
    encodeURIComponent(portal.password) +
    '/' +
    encodeURIComponent(sid) +
    '.' +
    e
  );
}

function iptvLiveMeta(portal, stream, catName, kindOverride) {
  var id = String(stream.id || stream.stream_id || '').trim();
  var name = String(stream.name || stream.title || 'Channel').trim() || 'Channel';
  var logo = String(stream.icon || stream.stream_icon || stream.logo || '').trim();
  var ext = String(stream.ext || stream.container_extension || 'ts').replace(
    /^\./,
    '',
  );
  var platform = iptvPlatformOf(portal);
  var url = String(stream.url || '').trim();
  if (!url && platform === 'xtream') {
    url = iptvStreamPath(portal, 'live', id, ext);
  }
  // Stalker needs create_link at play time (host); skip rows with no URL yet.
  if (!url) return null;
  var catId = String(
    kindOverride || stream.categoryId || stream.category_id || 'all',
  ).trim() || 'all';
  var pkey = iptvPortalKey(portal);
  var open = {
    surface: 'stream',
    id: url,
    url: url,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  };
  return {
    id: 'iptv:live:' + pkey + ':' + id + (kindOverride ? ':' + kindOverride : ''),
    type: 'iptv',
    kind: catId,
    categoryName: catName || catId,
    name: name,
    poster: logo || undefined,
    description: catName || '',
    open: open,
    portalKey: pkey,
    streamId: id,
    categoryId: String(stream.categoryId || stream.category_id || 'all').trim() || 'all',
  };
}

function iptvVodMeta(portal, stream, section, catName) {
  var id = String(stream.id || stream.stream_id || stream.series_id || '').trim();
  var name = String(stream.name || stream.title || 'Title').trim() || 'Title';
  var logo = String(
    stream.icon ||
      stream.stream_icon ||
      stream.cover ||
      stream.poster ||
      stream.logo ||
      '',
  ).trim();
  var catId = String(stream.categoryId || stream.category_id || '').trim() || 'all';
  var pkey = iptvPortalKey(portal);
  var isMovie = section === 'movies';
  var ext = String(stream.ext || stream.container_extension || 'mp4').replace(
    /^\./,
    '',
  );
  var kind = isMovie ? 'vod' : 'series';
  return {
    id: 'iptv:' + kind + ':' + pkey + ':' + id,
    type: isMovie ? 'movie' : 'tv',
    kind: catId,
    categoryName: catName || catId,
    name: name,
    poster: logo || undefined,
    background: logo || undefined,
    badge: isMovie ? 'MOVIE' : 'TV',
    description: catName || '',
    open: {
      surface: 'iptv',
      id: id,
      movie: isMovie,
      kind: kind,
      portalKey: pkey,
      streamId: id,
      streamName: name,
      streamIcon: logo,
      name: name,
      icon: logo,
      categoryId: catId,
      containerExt: ext,
      platform: iptvPlatformOf(portal),
      extract: {
        resolveType: 'iptv',
        panelCategory: 'iptv',
        ctx: {
          portalKey: pkey,
          streamId: id,
          kind: kind,
          platform: iptvPlatformOf(portal),
          containerExt: ext,
          categoryId: catId,
        },
      },
    },
    portalKey: pkey,
    streamId: id,
    categoryId: catId,
  };
}

function iptvCatNameMap(categories) {
  var map = {};
  if (!Array.isArray(categories)) return map;
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    if (!c) continue;
    var id = String(c.id || '').trim();
    if (!id) continue;
    map[id] = String(c.name || id).trim() || id;
  }
  return map;
}

function iptvSortStreams(streams, sort) {
  if (!Array.isArray(streams) || streams.length < 2) return streams || [];
  if (sort === 'playlist') return streams;
  var copy = streams.slice();
  copy.sort(function (a, b) {
    var an = String(a.name || '').toLowerCase();
    var bn = String(b.name || '').toLowerCase();
    if (an < bn) return sort === 'nameDesc' ? 1 : -1;
    if (an > bn) return sort === 'nameDesc' ? -1 : 1;
    return 0;
  });
  return copy;
}

function iptvSection(params) {
  var raw = String(
    (params && (params.catalogFilter || params.section || params.source)) ||
      'live',
  )
    .trim()
    .toLowerCase();
  if (raw === 'movies' || raw === 'movie' || raw === 'vod') return 'movies';
  if (raw === 'series' || raw === 'tv') return 'series';
  return 'live';
}

async function iptvFeedFromCatalog(ctx, portal, section, catalog, prefs) {
  var cats = iptvCatNameMap(catalog.categories);
  var streams = iptvSortStreams(catalog.streams || [], prefs.liveSort);
  var items = [];
  var byId = {};

  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s) continue;
    var catId = String(s.categoryId || 'all').trim() || 'all';
    var meta =
      section === 'live'
        ? iptvLiveMeta(portal, s, cats[catId] || catId)
        : iptvVodMeta(portal, s, section, cats[catId] || catId);
    if (!meta) continue;
    if (section === 'live' && !(meta.open && meta.open.url)) continue;
    items.push(meta);
    byId[String(s.id)] = s;
  }

  if (section === 'live') {
    var favIds = prefs.favorites || [];
    var watchedIds = prefs.watched || [];
    for (var f = 0; f < favIds.length; f++) {
      var fs = byId[String(favIds[f])];
      if (!fs) continue;
      var favMeta = iptvLiveMeta(
        portal,
        fs,
        'Favorites',
        'favorites',
      );
      if (favMeta) items.push(favMeta);
    }
    for (var w = 0; w < watchedIds.length; w++) {
      var ws = byId[String(watchedIds[w])];
      if (!ws) continue;
      var watchedMeta = iptvLiveMeta(
        portal,
        ws,
        'Already watched',
        'watched',
      );
      if (watchedMeta) items.push(watchedMeta);
    }
  }

  return items;
}

async function iptvFeed(ctx) {
  var params = hubParams(ctx);
  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    return hubItems('feed', [
      {
        id: 'iptv:setup',
        type: 'message',
        kind: 'all',
        name: 'Add a portal in Settings → Addons → IPTV',
        description: 'Enter portal URL and credentials, then refresh.',
      },
    ]);
  }

  try {
    var section = iptvSection(params);
    var skipCache = !!(params && (params.refresh || params.force));
    var catalog = await iptvFetchCatalog(ctx, portal, section, {
      skipCache: skipCache,
    });
    if (catalog && catalog.error && !(catalog.streams || []).length) {
      return hubFail(
        'feed',
        catalog.error.code || 'UPSTREAM',
        String(catalog.error.message || 'catalog failed'),
        true,
      );
    }
    var prefs = await iptvPrefsLoad(ctx, iptvPortalKey(portal), section);
    var items = await iptvFeedFromCatalog(ctx, portal, section, catalog, prefs);
    return hubItems('feed', items);
  } catch (e) {
    return hubFail('feed', 'UPSTREAM', String((e && e.message) || e), true);
  }
}

function iptvNormToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function iptvChannelMatchesGame(name, game) {
  var n = iptvNormToken(name);
  if (!n) return false;
  var home = iptvNormToken(game && game.homeTeam);
  var away = iptvNormToken(game && game.awayTeam);
  var title = iptvNormToken(game && game.title);
  var broadcasts = (game && game.broadcastChannels) || [];
  if (Array.isArray(broadcasts)) {
    for (var i = 0; i < broadcasts.length; i++) {
      var b = iptvNormToken(broadcasts[i]);
      if (b && (n.indexOf(b) >= 0 || b.indexOf(n) >= 0)) return true;
    }
  }
  if (home && away && n.indexOf(home) >= 0 && n.indexOf(away) >= 0) return true;
  if (home && n.indexOf(home) >= 0) return true;
  if (away && n.indexOf(away) >= 0) return true;
  if (title && n.indexOf(title) >= 0) return true;
  return false;
}

async function iptvSearchChannels(ctx, params) {
  var cfg = hubConfig(ctx, {});
  if (cfg.forjaSportsEnabled === false) {
    return hubOk('searchChannels', { sources: [] }, { maxAge: 30 });
  }
  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    return hubOk('searchChannels', { sources: [] }, { maxAge: 30 });
  }
  var game = (params && params.game) || {};
  var categoryIds = Array.isArray(params && params.categoryIds)
    ? params.categoryIds
    : [];
  try {
    var catalog = await iptvFetchCatalog(ctx, portal, 'live');
    var prefs = await iptvPrefsLoad(ctx, iptvPortalKey(portal), 'live');
    var items = await iptvFeedFromCatalog(ctx, portal, 'live', catalog, prefs);
    var sources = [];
    for (var i = 0; i < items.length; i++) {
      var ch = items[i];
      if (ch.kind === 'favorites' || ch.kind === 'watched') continue;
      if (categoryIds.length) {
        var cid = String(ch.categoryId || '');
        if (categoryIds.indexOf(cid) < 0) continue;
      }
      if (!iptvChannelMatchesGame(ch.name, game)) continue;
      var url = ch.open && ch.open.url;
      if (!url) continue;
      sources.push({
        url: url,
        label: ch.name,
        logoUrl: ch.poster || '',
        provider: portal.label || 'IPTV',
        portalKey: ch.portalKey,
        streamId: ch.streamId,
      });
    }
    return hubOk('searchChannels', { sources: sources }, { maxAge: 60, swr: 120 });
  } catch (e) {
    return hubFail(
      'searchChannels',
      'UPSTREAM',
      String((e && e.message) || e),
      true,
    );
  }
}

async function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);
  if (action === 'layout') {
    return hubOk('layout', iptvLayout());
  }
  if (action === 'feed') {
    return await iptvFeed(ctx);
  }
  if (action === 'searchChannels') {
    return await iptvSearchChannels(ctx, params);
  }
  if (action === 'listPortals') {
    return await iptvListPortals(ctx);
  }
  if (action === 'addPortal') {
    return await iptvAddPortal(ctx, params);
  }
  if (action === 'editPortal') {
    return await iptvEditPortal(ctx, params);
  }
  if (action === 'removePortal') {
    return await iptvRemovePortal(ctx, params);
  }
  if (action === 'selectPortal') {
    return await iptvSelectPortal(ctx, params);
  }
  if (action === 'scrape') {
    return await iptvScrapePortals(ctx, params);
  }
  if (action === 'shareEncode') {
    return await iptvShareEncode(ctx, params);
  }
  if (action === 'shareDecode') {
    return await iptvShareDecode(ctx, params);
  }
  if (action === 'prefsLoad') {
    var portal = await iptvResolveActive(ctx);
    if (!portal) return hubFail('prefsLoad', 'NO_PORTAL', 'no active portal');
    var section = iptvSection(params);
    var prefs = await iptvPrefsLoad(ctx, iptvPortalKey(portal), section);
    return hubOk('prefsLoad', { prefs: prefs, portalKey: iptvPortalKey(portal), section: section });
  }
  if (action === 'prefsSave') {
    var portalSave = await iptvResolveActive(ctx);
    if (!portalSave) return hubFail('prefsSave', 'NO_PORTAL', 'no active portal');
    var sectionSave = iptvSection(params);
    var ok = await iptvPrefsSave(
      ctx,
      iptvPortalKey(portalSave),
      sectionSave,
      (params && params.prefs) || params || {},
    );
    return ok
      ? hubOk('prefsSave', { ok: true })
      : hubFail('prefsSave', 'VAULT', 'failed to save prefs');
  }
  return hubFail(action, 'UNSUPPORTED', 'Unsupported action: ' + action);
}
