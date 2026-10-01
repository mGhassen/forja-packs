// IPTV platforms — xtream / m3u / stalker catalog fetch via http + engine.request.
// No ctx.host.iptv. Optional disk cache via cache.diskGet/diskSet.

var IPTV_CATALOG_CACHE_NS = 'iptv.catalog';
var IPTV_CATALOG_TTL_MS = 30 * 60 * 1000;

function iptvPlatformOf(portal) {
  var p = String((portal && (portal.platform || portal.type)) || 'xtream')
    .trim()
    .toLowerCase();
  if (p === 'm3u' || p === 'm3u8' || p === 'playlist') return 'm3u';
  if (p === 'stalker' || p === 'mag' || p === 'ministra') return 'stalker';
  return 'xtream';
}

function iptvSectionWire(section) {
  var s = String(section || 'live').trim().toLowerCase();
  if (s === 'movies' || s === 'movie' || s === 'vod') return 'vod';
  if (s === 'series' || s === 'tv') return 'series';
  return 'live';
}

function iptvParseJsonBody(res) {
  if (!res || !res.ok) return null;
  var body = res.body;
  if (body == null) return null;
  if (typeof body === 'object') return body;
  var s = String(body).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function iptvEmptyCatalog(errMeta) {
  var out = { categories: [], streams: [] };
  if (errMeta) out.error = errMeta;
  return out;
}

function iptvNormCategories(raw) {
  var out = [];
  if (!Array.isArray(raw)) return out;
  for (var i = 0; i < raw.length; i++) {
    var c = raw[i];
    if (!c) continue;
    var id = String(c.id || c.category_id || '').trim();
    if (!id) continue;
    out.push({
      id: id,
      name: String(c.name || c.category_name || id).trim() || id,
    });
  }
  return out;
}

function iptvNormStreams(raw, kindFallback) {
  var out = [];
  if (!Array.isArray(raw)) return out;
  for (var i = 0; i < raw.length; i++) {
    var s = raw[i];
    if (!s) continue;
    var id = String(
      s.id || s.stream_id || s.series_id || s.num || '',
    ).trim();
    if (!id && s.url) id = String(s.url);
    if (!id) continue;
    var kind = String(s.kind || kindFallback || 'live').trim() || 'live';
    out.push({
      id: id,
      name: String(s.name || s.title || 'Channel').trim() || 'Channel',
      icon: String(
        s.icon || s.stream_icon || s.logo || s.cover || s.poster || '',
      ).trim(),
      categoryId: String(s.categoryId || s.category_id || 'all').trim() || 'all',
      url: (function () {
        var u = s.url ? String(s.url).trim() : '';
        if (u) return u;
        // M3U catalog_page rows encode the play URL as id/stream_id.
        if (/^https?:\/\//i.test(id) || id.indexOf('://') > 0) return id;
        return undefined;
      })(),
      ext: String(s.ext || s.container_ext || s.container_extension || '')
        .replace(/^\./, '')
        .trim(),
      kind: kind,
      epgChannelId: String(s.epg_channel_id || s.epgChannelId || '').trim(),
      cmd: s.cmd ? String(s.cmd) : undefined,
    });
  }
  return out;
}

async function iptvCatalogDiskGet(ctx, portalKey, section) {
  var cache = iptvCache(ctx);
  if (!cache || typeof cache.diskGet !== 'function') return null;
  try {
    var raw = await cache.diskGet(
      IPTV_CATALOG_CACHE_NS,
      String(portalKey) + ':' + iptvSectionWire(section),
    );
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(String(raw));
  } catch (e) {
    return null;
  }
}

async function iptvCatalogDiskSet(ctx, portalKey, section, catalog) {
  var cache = iptvCache(ctx);
  if (!cache || typeof cache.diskSet !== 'function') return;
  try {
    await cache.diskSet(
      IPTV_CATALOG_CACHE_NS,
      String(portalKey) + ':' + iptvSectionWire(section),
      catalog,
      { ttlMs: IPTV_CATALOG_TTL_MS },
    );
  } catch (e) {}
}

async function iptvProbeStream(ctx, url) {
  var playback = iptvPlayback(ctx);
  if (!playback || typeof playback.probe !== 'function') {
    return { ok: false, error: 'PROBE_UNAVAILABLE' };
  }
  try {
    return await playback.probe({ url: String(url || ''), timeoutMs: 8000 });
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function iptvEngineIptv(ctx, body) {
  var request = iptvEngine(ctx);
  if (!request) return { ok: false, error: 'ENGINE_REQUIRED' };
  return await request('iptv', body || {});
}

async function iptvFetchXtreamHttp(ctx, portal, section) {
  var request = iptvHttp(ctx);
  if (!request) throw new Error('HOST_HTTP_REQUIRED');
  var base = iptvNormBase(portal.url);
  var qs =
    'username=' +
    encodeURIComponent(portal.username) +
    '&password=' +
    encodeURIComponent(portal.password);
  var wire = iptvSectionWire(section);
  var catAction =
    wire === 'vod'
      ? 'get_vod_categories'
      : wire === 'series'
        ? 'get_series_categories'
        : 'get_live_categories';
  var streamAction =
    wire === 'vod'
      ? 'get_vod_streams'
      : wire === 'series'
        ? 'get_series'
        : 'get_live_streams';
  var both = await Promise.all([
    request({
      method: 'GET',
      url: base + '/player_api.php?' + qs + '&action=' + catAction,
      timeoutMs: 45000,
    }),
    request({
      method: 'GET',
      url: base + '/player_api.php?' + qs + '&action=' + streamAction,
      timeoutMs: 45000,
    }),
  ]);
  var cats = iptvParseJsonBody(both[0]);
  var streams = iptvParseJsonBody(both[1]);
  return {
    categories: iptvNormCategories(cats),
    streams: iptvNormStreams(streams, wire === 'vod' ? 'vod' : wire),
  };
}

async function iptvFetchXtream(ctx, portal, section) {
  var engine = iptvEngine(ctx);
  if (engine) {
    var res = await iptvEngineIptv(ctx, {
      action: 'catalog',
      platform: 'xtream',
      url: iptvNormBase(portal.url),
      username: String(portal.username || ''),
      password: String(portal.password || ''),
      section: iptvSectionWire(section),
      timeout_secs: 45,
    });
    if (res && res.ok !== false && !res.error) {
      return {
        categories: iptvNormCategories(res.categories),
        streams: iptvNormStreams(
          res.streams,
          iptvSectionWire(section) === 'vod' ? 'vod' : iptvSectionWire(section),
        ),
      };
    }
  }
  return await iptvFetchXtreamHttp(ctx, portal, section);
}

async function iptvFetchM3u(ctx, portal, section) {
  var request = iptvHttp(ctx);
  var engine = iptvEngine(ctx);
  if (!request) throw new Error('HOST_HTTP_REQUIRED');
  if (!engine) throw new Error('ENGINE_REQUIRED');

  var url = iptvNormBase(portal.url) || String(portal.url || '').trim();
  var headers = {};
  var ua = String(portal.userAgent || portal.user_agent || '').trim();
  if (ua) headers['User-Agent'] = ua;

  var res = await request({
    method: 'GET',
    url: url,
    headers: headers,
    timeoutMs: 120000,
  });
  if (!res || !res.ok) {
    return iptvEmptyCatalog({
      code: 'M3U_FETCH_FAILED',
      message: 'Failed to download playlist',
    });
  }
  var content =
    typeof res.body === 'string'
      ? res.body
      : res.body != null
        ? JSON.stringify(res.body)
        : '';
  if (!content) {
    return iptvEmptyCatalog({
      code: 'M3U_EMPTY',
      message: 'Playlist body empty',
    });
  }

  var parsed = await engine('parse_m3u', { content: content });
  var channels = [];
  if (parsed && Array.isArray(parsed.items)) channels = parsed.items;
  else if (parsed && Array.isArray(parsed.channels)) channels = parsed.channels;
  else if (Array.isArray(parsed)) channels = parsed;
  else if (parsed && parsed.ok && Array.isArray(parsed.value)) {
    channels = parsed.value;
  } else if (parsed && parsed.error) {
    return iptvEmptyCatalog({
      code: 'M3U_PARSE_FAILED',
      message: String(parsed.error || parsed.message || 'parse failed'),
    });
  }

  var wire = iptvSectionWire(section);
  var catMap = {};
  var streams = [];
  for (var i = 0; i < channels.length; i++) {
    var ch = channels[i] || {};
    var group = String(ch.group || ch.category || 'All').trim() || 'All';
    var catId = group.toLowerCase().replace(/\s+/g, '_');
    catMap[catId] = group;
    var entryType = String(ch.entry_type || ch.entryType || '').toLowerCase();
    var kind = 'live';
    if (entryType === 'video' || /movie|vod/i.test(group)) kind = 'vod';
    if (/series|show/i.test(group)) kind = 'series';
    if (wire === 'vod' && kind === 'live') continue;
    if (wire === 'series' && kind !== 'series') continue;
    if (wire === 'live' && kind !== 'live') continue;
    streams.push({
      id: String(ch.tvg_id || ch.tvgId || ch.url || i),
      name: String(ch.name || 'Channel').trim() || 'Channel',
      icon: String(ch.logo || '').trim(),
      categoryId: catId,
      url: String(ch.url || '').trim(),
      kind: kind,
      epgChannelId: String(ch.tvg_id || ch.tvgId || '').trim(),
    });
  }
  var categories = Object.keys(catMap).map(function (id) {
    return { id: id, name: catMap[id] };
  });
  return { categories: categories, streams: streams };
}

async function iptvFetchStalker(ctx, portal, section) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return iptvEmptyCatalog({
      code: 'STALKER_ENGINE_REQUIRED',
      message: 'Stalker catalog needs ctx.host.engine.request',
    });
  }
  var res = await iptvEngineIptv(ctx, {
    action: 'catalog',
    platform: 'stalker',
    url: iptvNormBase(portal.url) || String(portal.url || '').trim(),
    username: String(portal.username || portal.mac || ''),
    password: String(portal.password || portal.serial || ''),
    section: iptvSectionWire(section),
    timeout_secs: 45,
  });
  if (!res || res.error || res.ok === false) {
    return iptvEmptyCatalog({
      code: 'STALKER_CATALOG_FAILED',
      message: String(
        (res && (res.error || res.message)) || 'Stalker catalog failed',
      ),
    });
  }
  return {
    categories: iptvNormCategories(res.categories),
    streams: iptvNormStreams(
      res.streams,
      iptvSectionWire(section) === 'vod' ? 'vod' : iptvSectionWire(section),
    ),
  };
}

async function iptvFetchCatalog(ctx, portal, section, opts) {
  var o = opts || {};
  var pkey = iptvPortalKey(portal);
  var sec = String(section || 'live').trim().toLowerCase() || 'live';
  if (!o.skipCache) {
    var cached = await iptvCatalogDiskGet(ctx, pkey, sec);
    if (
      cached &&
      Array.isArray(cached.categories) &&
      Array.isArray(cached.streams)
    ) {
      return cached;
    }
  }

  var platform = iptvPlatformOf(portal);
  var catalog;
  if (platform === 'm3u') {
    catalog = await iptvFetchM3u(ctx, portal, sec);
  } else if (platform === 'stalker') {
    catalog = await iptvFetchStalker(ctx, portal, sec);
  } else {
    catalog = await iptvFetchXtream(ctx, portal, sec);
  }

  if (
    catalog &&
    !catalog.error &&
    (catalog.streams.length || catalog.categories.length)
  ) {
    await iptvCatalogDiskSet(ctx, pkey, sec, catalog);
  }
  return catalog || iptvEmptyCatalog();
}

/**
 * Host-owned shelf + one page of streams (issue 290 / plan C).
 * Never pulls the full VOD/series list into flutter_js.
 */
async function iptvFetchCatalogPage(ctx, portal, section, opts) {
  var o = opts || {};
  var request = iptvEngine(ctx);
  if (!request) {
    return iptvEmptyCatalog({
      code: 'ENGINE_REQUIRED',
      message: 'catalog_page needs ctx.host.engine.request',
    });
  }
  var wire = iptvSectionWire(section);
  var body = {
    action: 'catalog_page',
    platform: iptvPlatformOf(portal),
    url: iptvNormBase(portal.url) || String(portal.url || '').trim(),
    username: String(portal.username || portal.mac || ''),
    password: String(portal.password || portal.serial || ''),
    section: wire,
    category_id: String(o.categoryId || o.category_id || '').trim(),
    page: Number(o.page) > 0 ? Number(o.page) : 1,
    page_size: Number(o.pageSize || o.page_size || o.limit) > 0
      ? Number(o.pageSize || o.page_size || o.limit)
      : 48,
    sort: String(o.sort || 'playlist').trim() || 'playlist',
    q: String(o.q || '').trim(),
    refresh: !!(o.skipCache || o.refresh || o.force),
    timeout_secs: wire === 'live' ? 90 : 60,
  };
  var ua = String(portal.userAgent || portal.user_agent || '').trim();
  if (ua) body.user_agent = ua;
  // Always stamp stream_ids when the pack passes a list (Favorites / Watched),
  // including empty — otherwise host falls back to the first category page.
  if (Array.isArray(o.streamIds)) {
    body.stream_ids = o.streamIds;
  } else if (Array.isArray(o.stream_ids)) {
    body.stream_ids = o.stream_ids;
  }

  var res = await request('iptv', body);
  if (!res || res.ok === false || res.error) {
    return iptvEmptyCatalog({
      code: (res && res.error) || 'CATALOG_PAGE_FAILED',
      message: String(
        (res && (res.message || res.error)) || 'catalog_page failed',
      ),
    });
  }
  var kindFallback = wire === 'vod' ? 'vod' : wire;
  var hitRaw = res.hitCategoryIds || res.hit_category_ids;
  var hitCategoryIds = [];
  if (Array.isArray(hitRaw)) {
    for (var hi = 0; hi < hitRaw.length; hi++) {
      var hid = String(hitRaw[hi] || '').trim();
      if (hid) hitCategoryIds.push(hid);
    }
  }
  var out = {
    categories: iptvNormCategories(res.categories),
    streams: iptvNormStreams(res.streams, kindFallback),
    hasMore: !!(res.hasMore || res.has_more),
    pageSize: Number(res.pageSize || res.page_size) || body.page_size,
    total: Number(res.total) || 0,
    categoryId: String(res.categoryId || res.category_id || body.category_id || ''),
    hitCategoryIds: hitCategoryIds,
  };
  return out;
}
