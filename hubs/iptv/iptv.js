// IPTV hub — portals in vault; Live / Movies / Series via platforms + prefs.
// Host bridges: vault, http, engine.request, playback.probe, cache.disk*.
// Player stays host via open.surface / playback.open. No ctx.host.iptv.

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
  // Stalker: rust puts create_link cmd in stream_id; keep cmd override if present.
  var id = String(
    stream.cmd || stream.id || stream.stream_id || '',
  ).trim();
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
  // Stalker: no CDN URL until host create_link — paint with pending handoff.
  if (!url && platform === 'stalker') {
    if (!id) return null;
    url = 'pending:stalker:' + id;
  }
  if (!url) return null;
  var catId = String(
    kindOverride || stream.categoryId || stream.category_id || 'all',
  ).trim() || 'all';
  var pkey = iptvPortalKey(portal);
  var open = {
    surface: 'stream',
    id: url,
    url: url,
    kind: 'live',
    platform: platform,
    portalKey: pkey,
    streamId: id,
    categoryId: catId,
    epgChannelId: String(stream.epgChannelId || stream.epg_channel_id || '').trim(),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  };
  return hubPaintPoster({
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
    epgChannelId: String(stream.epgChannelId || stream.epg_channel_id || '').trim(),
    categoryId: String(stream.categoryId || stream.category_id || 'all').trim() || 'all',
  });
}

function iptvVodMeta(portal, stream, section, catName) {
  var id = String(stream.id || stream.stream_id || stream.series_id || '').trim();
  var rawName = String(stream.name || stream.title || 'Title').trim() || 'Title';
  var cleaned = iptvCleanMediaTitle(rawName);
  var name = cleaned.title || rawName;
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
  return hubPaintPoster({
    id: 'iptv:' + kind + ':' + pkey + ':' + id,
    type: isMovie ? 'movie' : 'tv',
    kind: catId,
    categoryName: catName || catId,
    name: name,
    poster: logo || undefined,
    background: logo || undefined,
    badge: isMovie ? 'MOVIE' : 'TV',
    description: catName || '',
    releaseInfo: cleaned.year != null ? String(cleaned.year) : '',
    open: {
      surface: 'iptv',
      id: id,
      movie: isMovie,
      kind: kind,
      portalKey: pkey,
      streamId: id,
      streamName: rawName,
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
  });
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
  if (raw === 'channels' || raw === 'channel') return 'channels';
  return 'live';
}

function iptvFeedQueryMatch(meta, q) {
  var needle = String(q || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;
  var name = String(meta.name || meta.title || '').toLowerCase();
  var cat = String(meta.categoryName || meta.kind || '').toLowerCase();
  return name.indexOf(needle) >= 0 || cat.indexOf(needle) >= 0;
}

async function iptvFeedFromCatalog(ctx, portal, section, catalog, prefs, q, params) {
  var cats = iptvCatNameMap(catalog.categories);
  var streams = catalog.streams || [];
  var filterCat = String(
    (params && (params.categoryId || params.kind)) ||
      catalog.categoryId ||
      '',
  ).trim();
  var FAV = '__favorites__';
  var WATCHED = '__watched__';
  var items = [];

  if (section === 'live' && (filterCat === FAV || filterCat === WATCHED)) {
    var label = filterCat === FAV ? 'Favorites' : 'Already watched';
    for (var i = 0; i < streams.length; i++) {
      var s = streams[i];
      if (!s) continue;
      var meta = iptvLiveMeta(portal, s, label, filterCat);
      if (!meta || !(meta.open && meta.open.url)) continue;
      if (!iptvFeedQueryMatch(meta, q)) continue;
      items.push(meta);
    }
    return items;
  }

  if (section === 'live') {
    for (var j = 0; j < streams.length; j++) {
      var st = streams[j];
      if (!st) continue;
      var catId = String(st.categoryId || 'all').trim() || 'all';
      var liveMeta = iptvLiveMeta(portal, st, cats[catId] || catId);
      if (!liveMeta || !(liveMeta.open && liveMeta.open.url)) continue;
      if (!iptvFeedQueryMatch(liveMeta, q)) continue;
      items.push(liveMeta);
    }
    return items;
  }

  for (var k = 0; k < streams.length; k++) {
    var vst = streams[k];
    if (!vst) continue;
    var vCat = String(vst.categoryId || 'all').trim() || 'all';
    var vMeta = iptvVodMeta(portal, vst, section, cats[vCat] || vCat);
    if (!vMeta) continue;
    items.push(vMeta);
  }
  return items;
}

/** Short EPG for card NOW badges (always for live; capped). */
async function iptvAttachLiveNowProgrammes(ctx, portal, items) {
  if (!items || !items.length) return items;
  var platform = iptvPlatformOf(portal);
  var http = iptvHttp(ctx);
  var base = iptvNormBase(portal.url);
  var limit = Math.min(items.length, 16);

  for (var i = 0; i < items.length; i++) {
    if (!Array.isArray(items[i].programmes)) items[i].programmes = [];
  }

  if (platform !== 'xtream' || !http || !base) return items;

  var qs =
    'username=' +
    encodeURIComponent(portal.username) +
    '&password=' +
    encodeURIComponent(portal.password);

  for (var j = 0; j < limit; j++) {
    var row = items[j];
    if (!row || !row.streamId) continue;
    if (Array.isArray(row.programmes) && row.programmes.length) continue;
    try {
      var url =
        base +
        '/player_api.php?' +
        qs +
        '&action=get_short_epg&stream_id=' +
        encodeURIComponent(row.streamId) +
        '&limit=2';
      var res = await http({ method: 'GET', url: url, timeoutMs: 6000 });
      var body = res && (res.body || res.data || res.text);
      var parsed = typeof body === 'string' ? JSON.parse(body) : body;
      var list =
        (parsed && (parsed.epg_listings || parsed.listings || parsed)) || [];
      if (!Array.isArray(list)) list = [];
      var programmes = [];
      for (var k = 0; k < list.length; k++) {
        var e = list[k] || {};
        var title = String(e.title || e.name || e.programme || '').trim();
        if (!title && e.title) {
          try {
            title = String(decodeURIComponent(escape(atob(String(e.title))))).trim();
          } catch (_) {
            title = String(e.title).trim();
          }
        }
        if (!title) continue;
        var start = Number(e.start_timestamp || e.startMs || e.start || 0);
        var end = Number(e.stop_timestamp || e.endMs || e.end || e.stop || 0);
        if (!start || !end || end <= start) continue;
        programmes.push({
          title: title,
          startMs: start < 1e11 ? start * 1000 : start,
          endMs: end < 1e11 ? end * 1000 : end,
        });
      }
      row.programmes = programmes;
    } catch (_) {
      /* keep empty — card still paints without NOW */
    }
  }
  return items;
}

/** Guide / timeline: attach opaque programmes[] when layout asks for EPG. */
async function iptvAttachTimelineProgrammes(ctx, portal, items, prefs, params) {
  var layout = String((prefs && prefs.layout) || '').trim().toLowerCase();
  if (layout === 'epg' || layout === 'timeline') layout = 'guide';
  var p = params || {};
  var styleParam = String(p.listStyle || p.style || p.view || '')
    .trim()
    .toLowerCase();
  if (styleParam === 'epg' || styleParam === 'timeline') styleParam = 'guide';
  var wantGuide =
    layout === 'guide' || styleParam === 'guide' || styleParam === 'timeline';
  // Host CatalogEpgGuide loads full tables lazily; short EPG still helps NOW badges.
  if (!wantGuide || !items || !items.length) return items;
  return iptvAttachLiveNowProgrammes(ctx, portal, items);
}

/** Mark live rows as channel cards; keep programmes[] for NOW footer / sheet. */
function iptvApplyLiveCardPaint(items) {
  if (!items || !items.length) return items;
  for (var i = 0; i < items.length; i++) {
    var row = items[i];
    if (!row || typeof row !== 'object') continue;
    if (String(row.type || '') !== 'iptv') continue;
    if (!row.paint || typeof row.paint !== 'object') {
      row = hubPaintPoster(row);
      items[i] = row;
    }
    row.paint.type = 'channelCard';
    if (!row.paint.props) row.paint.props = {};
    delete row.paint.props.aspect;
    delete row.paint.props.badge;
    delete row.paint.props.subtitle;
    if (row.poster && !row.paint.props.imageUrl) {
      row.paint.props.imageUrl = String(row.poster);
    }
  }
  return items;
}

function iptvFeedKinds(catalog, items) {
  var out = [];
  var seen = {};
  var cats = catalog && catalog.categories;
  if (Array.isArray(cats)) {
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (!c) continue;
      var id = String(c.id || c.category_id || '').trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push({
        id: id,
        label: String(c.name || c.category_name || id).trim() || id,
      });
    }
  }
  if (out.length) return out;
  if (!Array.isArray(items)) return out;
  for (var j = 0; j < items.length; j++) {
    var row = items[j];
    if (!row) continue;
    var kid = String(row.categoryId || row.kind || '').trim();
    if (!kid || kid === 'all' || seen[kid]) continue;
    seen[kid] = true;
    out.push({
      id: kid,
      label: String(row.categoryName || kid).trim() || kid,
    });
  }
  return out;
}

async function iptvFeed(ctx) {
  var params = hubParams(ctx);
  var section = iptvSection(params);
  if (section === 'channels') {
    return await iptvChannelsFeed(ctx, params);
  }

  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    var env = hubItems('feed', [])[0];
    env.data.kinds = [];
    env.data.coverBody = true;
    env.data.emptyTitle = 'Choose a portal';
    env.data.emptyDescription =
      'Select a provider to browse Live TV, Movies, and Series.';
    env.data.emptyAction = {
      label: 'Open portal',
      action: 'portals',
    };
    return [env];
  }

  try {
    var skipCache = !!(params && (params.refresh || params.force));
    var prefs = await iptvPrefsLoad(ctx, iptvPortalKey(portal), section);
    var sortOverride = String((params && params.sort) || '').trim();
    if (
      sortOverride === 'playlist' ||
      sortOverride === 'nameAsc' ||
      sortOverride === 'nameDesc'
    ) {
      prefs = Object.assign({}, prefs, { liveSort: sortOverride });
    }
    var q = String((params && params.q) || '').trim();
    var filterCat = String(
      (params && (params.categoryId || params.kind)) || '',
    ).trim();
    var pageNum = Number(params && params.page);
    if (!isFinite(pageNum) || pageNum < 1) pageNum = 1;
    var pageSize = Number(
      params && (params.limit || params.pageSize || params.perPage),
    );
    if (!(pageSize > 0)) pageSize = section === 'live' ? 96 : 48;

    var pageOpts = {
      skipCache: skipCache,
      categoryId: filterCat,
      page: pageNum,
      pageSize: pageSize,
      sort: String((prefs && prefs.liveSort) || 'playlist').trim(),
      q: q,
    };
    // Top-bar search scans the whole shelf (legacy Live paint search).
    if (q) pageOpts.categoryId = '';
    var FAV = '__favorites__';
    var WATCHED = '__watched__';
    if (section === 'live' && filterCat === FAV) {
      pageOpts.streamIds =
        (params && Array.isArray(params.favorites) && params.favorites) || [];
      pageOpts.categoryId = '';
      pageOpts.q = '';
    } else if (section === 'live' && filterCat === WATCHED) {
      pageOpts.streamIds =
        (params && Array.isArray(params.watched) && params.watched) || [];
      pageOpts.categoryId = '';
      pageOpts.q = '';
    }

    var catalog = await iptvFetchCatalogPage(ctx, portal, section, pageOpts);
    if (catalog && catalog.error && !(catalog.streams || []).length) {
      return hubFail(
        'feed',
        catalog.error.code || 'UPSTREAM',
        String(catalog.error.message || 'catalog failed'),
        true,
      );
    }
    var items = await iptvFeedFromCatalog(
      ctx,
      portal,
      section,
      catalog,
      prefs,
      q,
      params,
    );
    var kinds = iptvFeedKinds(catalog, items);
    var paging = {
      pageSize: Number(catalog.pageSize) || pageSize,
      hasMore: !!catalog.hasMore,
    };
    if (section === 'live') {
      // NOW/EPG is host-lazy (CatalogEpgGuideHost) — never block channel paint.
      items = iptvApplyLiveCardPaint(items);
    }
    var env = hubItems('feed', items, null, paging)[0];
    if (kinds.length) env.data.kinds = kinds;
    // Portal active — never leave layout "Choose a portal".
    if (section === 'movies') {
      env.data.emptyTitle = 'No movies';
    } else if (section === 'series') {
      env.data.emptyTitle = 'No series';
    } else {
      env.data.emptyTitle = 'No channels';
    }
    env.data.emptyDescription = 'Nothing in this category.';
    return [env];
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
    var needles = [];
    function pushNeedle(s) {
      var t = String(s || '').trim();
      if (!t) return;
      var low = t.toLowerCase();
      for (var i = 0; i < needles.length; i++) {
        if (needles[i].toLowerCase() === low) return;
      }
      needles.push(t);
    }
    pushNeedle(game.homeTeam);
    pushNeedle(game.awayTeam);
    pushNeedle(game.title);
    var broadcasts = game.broadcastChannels || [];
    if (Array.isArray(broadcasts)) {
      for (var b = 0; b < broadcasts.length; b++) pushNeedle(broadcasts[b]);
    }
    if (!needles.length) {
      return hubOk('searchChannels', { sources: [] }, { maxAge: 60, swr: 120 });
    }

    var seenUrl = {};
    var sources = [];
    for (var n = 0; n < needles.length; n++) {
      var catalog = await iptvFetchCatalogPage(ctx, portal, 'live', {
        q: needles[n],
        page: 1,
        pageSize: 96,
        categoryId: '',
      });
      var streams = (catalog && catalog.streams) || [];
      for (var i = 0; i < streams.length; i++) {
        var st = streams[i];
        if (!st) continue;
        if (categoryIds.length) {
          var cid = String(st.categoryId || '');
          if (categoryIds.indexOf(cid) < 0) continue;
        }
        if (!iptvChannelMatchesGame(st.name || st.title, game)) continue;
        var meta = iptvLiveMeta(portal, st, st.categoryId || '');
        if (!meta || !meta.open || !meta.open.url) continue;
        var url = String(meta.open.url);
        if (seenUrl[url]) continue;
        seenUrl[url] = true;
        sources.push({
          url: url,
          label: meta.name,
          logoUrl: meta.poster || '',
          provider: portal.label || 'IPTV',
          portalKey: meta.portalKey,
          streamId: meta.streamId,
          liveSourceKind:
            iptvPlatformOf(portal) === 'stalker' ? 'iptvStalker' : 'iptvXtream',
        });
      }
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
  if (action === 'details') {
    return await iptvVodDetails(ctx, params);
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
  if (action === 'importPortal') {
    return await iptvImportPortal(ctx, params);
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
