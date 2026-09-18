// Forja catalog hub kit — shared envelope + request helpers (protocol 1).
//
// Host sets first-class `ctx.action` / `ctx.params` / `ctx.auth` / `ctx.cache`
// / `ctx.kit` / `ctx.protocol` (R70-A12). Older hosts may still put the request
// under `ctx.config.__request` — prefer top-level, fall back for one release.
// nav.icon: pack-relative image (icons/nav.png); omit for Material default.

var HUB_KIT = 1;
var HUB_PROTOCOL = 1;

function hubRequest(ctx) {
  if (ctx && ctx.params && typeof ctx.params === 'object') {
    return {
      action: ctx.action,
      params: ctx.params,
      auth: ctx.auth,
      cache: ctx.cache,
      kit: ctx.kit,
      protocol: ctx.protocol,
    };
  }
  var cfg = (ctx && ctx.config) || {};
  return cfg.__request || {};
}

function hubAction(ctx) {
  return String((ctx && ctx.action) || hubRequest(ctx).action || '');
}

function hubParams(ctx) {
  if (ctx && ctx.params && typeof ctx.params === 'object') return ctx.params;
  return hubRequest(ctx).params || {};
}

function hubAuth(ctx) {
  if (ctx && ctx.auth && typeof ctx.auth === 'object') return ctx.auth;
  return hubRequest(ctx).auth || {};
}

function hubCache(ctx) {
  if (ctx && ctx.cache && typeof ctx.cache === 'object') return ctx.cache;
  return hubRequest(ctx).cache || {};
}

function hubConfig(ctx, defaults) {
  var cfg = Object.assign({}, defaults || {}, (ctx && ctx.config) || {});
  delete cfg.__request;
  return cfg;
}


// Pack owns upcoming / premiereLabel — host only reads these fields.

function hubParseIsoDate(raw) {
  var s = String(raw || '').trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return '';
}

function hubIsFutureIsoDate(iso) {
  var s = hubParseIsoDate(iso);
  if (!s) return false;
  var parts = s.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var d = Number(parts[2]);
  if (!(y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  var air = new Date(y, m - 1, d);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return air.getTime() > today.getTime();
}

function hubFormatDisplayDate(iso) {
  var s = hubParseIsoDate(iso);
  if (!s) return '';
  var parts = s.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var m = Number(parts[1]);
  var d = Number(parts[2]);
  var y = Number(parts[0]);
  if (!(m >= 1 && m <= 12)) return s;
  return months[m - 1] + ' ' + d + ', ' + y;
}

function hubMetaIsMovie(meta) {
  if (!meta) return false;
  if (meta.open && meta.open.movie === true) return true;
  if (String(meta.badge || '').toUpperCase() === 'MOVIE') return true;
  if (String(meta.type || '').toLowerCase() === 'movie') return true;
  if (String(meta.tmdbMediaType || '').toLowerCase() === 'movie') return true;
  return false;
}

function hubVideoNotAiredYet(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.aired === false) return true;
  var air = hubParseIsoDate(v.airDate || v.air_date || '');
  return !!(air && hubIsFutureIsoDate(air));
}

function hubVideoHasAirSignal(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.aired === false) return true;
  return !!hubParseIsoDate(v.airDate || v.air_date || '');
}

/** Pack owns upcoming / premiereLabel — host only reads these fields. */
function hubStampDetailsPaint(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  var videos = Array.isArray(meta.videos) ? meta.videos : [];
  var status = String(meta.status || '').trim().toUpperCase();
  var premiere = hubParseIsoDate(meta.premiereDate || '');
  if (!premiere) {
    var bit = String(meta.releaseInfo || '').split(' • ')[0].trim();
    premiere = hubParseIsoDate(bit);
  }
  var earliest = '';
  for (var i = 0; i < videos.length; i++) {
    var day = hubParseIsoDate(videos[i].airDate || videos[i].air_date || '');
    if (!day) continue;
    if (!earliest || day < earliest) earliest = day;
  }
  var labelIso = premiere || earliest;
  var upcoming =
    status === 'NOT_YET_RELEASED' || status === 'UPCOMING';
  var isMovie = hubMetaIsMovie(meta);
  if (!upcoming && !isMovie && videos.length) {
    var dated = [];
    for (var j = 0; j < videos.length; j++) {
      if (hubVideoHasAirSignal(videos[j])) dated.push(videos[j]);
    }
    if (dated.length) {
      var allFuture = true;
      for (var k = 0; k < dated.length; k++) {
        if (!hubVideoNotAiredYet(dated[k])) {
          allFuture = false;
          break;
        }
      }
      if (allFuture) upcoming = true;
    } else if (labelIso && hubIsFutureIsoDate(labelIso)) {
      // Stub episodes with no air dates — trust future premiere.
      upcoming = true;
    }
  }
  if (!upcoming && labelIso && hubIsFutureIsoDate(labelIso)) {
    if (isMovie || !videos.length) upcoming = true;
  }
  meta.upcoming = !!upcoming;
  if (upcoming && (!status || status === 'UPCOMING')) {
    meta.status = 'NOT_YET_RELEASED';
  }
  if (labelIso) {
    meta.premiereDate = meta.premiereDate || labelIso;
    meta.premiereLabel = hubFormatDisplayDate(labelIso);
  } else if (!meta.premiereLabel) {
    meta.premiereLabel = '';
  }
  return meta;
}

function hubOk(action, data, cache) {
  var payload = data || {};
  if (
    (String(action) === 'details' || String(action) === 'enrich') &&
    payload.meta &&
    typeof payload.meta === 'object'
  ) {
    payload = Object.assign({}, payload, { meta: hubStampDetailsPaint(payload.meta) });
  }
  var env = {
    ok: true,
    kit: HUB_KIT,
    protocol: HUB_PROTOCOL,
    action: action,
    data: payload,
  };
  if (cache) env.cache = cache;
  return [env];
}

function hubItems(action, items, cache, paging) {
  var list = items || [];
  var stamped = [];
  for (var i = 0; i < list.length; i++) {
    stamped.push(hubStampDetailsPaint(list[i]));
  }
  var data = { items: stamped };
  if (paging && typeof paging === 'object') {
    if (Number(paging.pageSize) > 0) data.pageSize = Number(paging.pageSize);
    if (typeof paging.hasMore === 'boolean') data.hasMore = paging.hasMore;
  }
  return hubOk(action, data, cache);
}

function hubFail(action, code, message, retryable) {
  return [
    {
      ok: false,
      kit: HUB_KIT,
      protocol: HUB_PROTOCOL,
      action: action || '',
      error: {
        code: code || 'UPSTREAM',
        message: String(message || ''),
        retryable: retryable === true,
      },
    },
  ];
}

function hubNotModified(action) {
  return [
    {
      ok: true,
      kit: HUB_KIT,
      protocol: HUB_PROTOCOL,
      action: action,
      notModified: true,
      data: {},
    },
  ];
}

/// Card meta under the title: `2026 • FILM` / `TV` (same as Home).
function hubPosterTypeLabel(meta) {
  meta = meta || {};
  if (String(meta.type || '').toLowerCase() === 'anime') return null;
  var hint = String(meta.tmdbMediaType || '').trim().toLowerCase();
  var kind = String(meta.type || '').trim().toLowerCase();
  if (hint === 'tv' || kind === 'tv' || kind === 'series') return 'TV';
  if (hint === 'movie' || kind === 'movie') return 'FILM';
  if (kind === 'drama') {
    var badge = String(meta.badge || '').trim().toUpperCase();
    if (badge === 'MOVIE' || badge === 'FILM' || badge === 'HOLLYWOOD') {
      return 'FILM';
    }
    return 'TV';
  }
  return null;
}

function hubPosterCardSubtitle(meta) {
  meta = meta || {};
  var release = String(meta.releaseInfo || '').trim();
  if (release.indexOf(' • ') !== -1) return release || null;
  var parts = [];
  if (release) {
    parts.push(release.indexOf('-') !== -1 ? release.split('-')[0] : release);
  }
  var typeLabel = hubPosterTypeLabel(meta);
  if (typeLabel) parts.push(typeLabel);
  return parts.length ? parts.join(' • ') : null;
}

function hubPosterBadgeRedundant(badge, typeLabel) {
  if (!typeLabel || !badge) return false;
  var b = String(badge).trim().toUpperCase();
  if (b === typeLabel) return true;
  // IPTV still stamps badge MOVIE; subtitle uses FILM.
  if (typeLabel === 'FILM' && (b === 'MOVIE' || b === 'FILM' || b === 'HOLLYWOOD')) {
    return true;
  }
  if (typeLabel === 'TV' && (b === 'TV' || b === 'SERIES')) return true;
  return false;
}

function hubPaintPoster(item, opts) {
  opts = opts || {};
  var meta = item || {};
  var title = String(meta.name || meta.title || opts.title || '');
  var imageUrl = String(
    meta.poster || meta.posterUrl || meta.imageUrl || opts.imageUrl || '',
  );
  var paint = {
    type: 'posterCard',
    props: {
      title: title,
      imageUrl: imageUrl,
    },
  };
  if (meta.rating != null || opts.rating != null) {
    paint.props.rating = Number(meta.rating != null ? meta.rating : opts.rating);
  }
  if (opts.rank != null) paint.props.rank = Number(opts.rank);
  var typeLabel = hubPosterTypeLabel(meta);
  var badge = String(meta.badge || opts.badge || '').trim();
  if (badge && !hubPosterBadgeRedundant(badge, typeLabel)) {
    paint.props.badge = badge;
  }
  if (opts.subtitle) {
    paint.props.subtitle = String(opts.subtitle);
  } else {
    var sub = hubPosterCardSubtitle(meta);
    if (sub) paint.props.subtitle = sub;
  }
  var mediaType = String(meta.tmdbMediaType || meta.type || '')
    .trim()
    .toLowerCase();
  if (mediaType === 'movie' || mediaType === 'tv') {
    paint.props.mediaType = mediaType;
  }
  if (opts.aspect) paint.props.aspect = String(opts.aspect);
  if (meta.background || meta.backdrop || opts.backdropUrl) {
    paint.props.backdropUrl = String(
      meta.background || meta.backdrop || opts.backdropUrl || '',
    );
  }
  if (meta.logo || opts.logoUrl) {
    paint.props.logoUrl = String(meta.logo || opts.logoUrl || '');
  }
  if (meta.description || meta.overview || opts.overview) {
    paint.props.overview = String(
      meta.description || meta.overview || opts.overview || '',
    );
  }
  var out = Object.assign({}, meta);
  out.paint = paint;
  if (meta.open) out.open = meta.open;
  if (!out.meta && (meta.id || meta.name)) {
    out.meta = {
      id: String(meta.id || ''),
      type: String(meta.type || ''),
      name: title,
      poster: imageUrl,
      open: meta.open || null,
    };
    if (meta.ids) out.meta.ids = meta.ids;
    if (meta.tmdbMediaType) out.meta.tmdbMediaType = meta.tmdbMediaType;
    if (meta.background) out.meta.background = meta.background;
    if (meta.badge) out.meta.badge = meta.badge;
  }
  return out;
}

function hubPaintEvent(item, opts) {
  opts = opts || {};
  var meta = item || {};
  var props = Object.assign(
    {
      title: String(meta.name || meta.title || opts.title || ''),
      posterUrl: String(meta.poster || meta.posterUrl || opts.posterUrl || ''),
    },
    opts.props || {},
  );
  var keys = [
    'homeTeam',
    'awayTeam',
    'homeBadgeUrl',
    'awayBadgeUrl',
    'categoryLabel',
    'scheduleLabel',
    'timeLabel',
    'viewers',
    'live',
    'width',
    'height',
  ];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (opts[k] != null) props[k] = opts[k];
    else if (meta[k] != null) props[k] = meta[k];
  }
  var out = Object.assign({}, meta);
  out.paint = { type: 'eventCard', props: props };
  if (meta.open) out.open = meta.open;
  return out;
}

function hubWithLoad(node, action, params) {
  var out = Object.assign({}, node || {});
  out.load = {
    action: String(action || ''),
    params: params && typeof params === 'object' ? params : {},
  };
  return out;
}

function hubClampList(list, limit) {
  if (!Array.isArray(list)) return [];
  var n = Number(limit);
  if (!(n > 0) || n >= list.length) return list.slice();
  return list.slice(0, n);
}

function hubFilterLeaves(filter, field) {
  if (!filter || typeof filter !== 'object') return [];
  var op = String(filter.op || '');
  if (op === 'and' || op === 'or') {
    var out = [];
    var nodes = filter.nodes || [];
    for (var i = 0; i < nodes.length; i++) {
      out = out.concat(hubFilterLeaves(nodes[i], field));
    }
    return out;
  }
  if (String(filter.field || '') !== String(field || '')) return [];
  return [filter];
}

function hubFilterValues(filter, field) {
  var leaves = hubFilterLeaves(filter, field);
  var out = [];
  for (var i = 0; i < leaves.length; i++) {
    var leaf = leaves[i];
    var op = String(leaf.op || '');
    if (op === 'in' && Array.isArray(leaf.value)) {
      for (var j = 0; j < leaf.value.length; j++) {
        var v = leaf.value[j];
        if (v != null && String(v).trim()) out.push(String(v).trim());
      }
    } else if (leaf.value != null && String(leaf.value).trim()) {
      out.push(String(leaf.value).trim());
    }
  }
  return out;
}

function hubFilterValue(filter, field) {
  var values = hubFilterValues(filter, field);
  return values.length ? values[0] : '';
}


function hubStripHtml(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hubTmdbMatch(ctx, query) {
  query = query || {};
  if (ctx && ctx.host && ctx.host.tmdb && typeof ctx.host.tmdb.match === 'function') {
    return Promise.resolve(ctx.host.tmdb.match(query)).then(function (hit) {
      return hit && hit.id ? hit : null;
    }).catch(function () { return null; });
  }
  return hubTmdbMatchFetch(ctx, query);
}

function hubTmdbMatchFetch(ctx, query) {
  query = query || {};
  var title = String(query.title || '').trim();
  if (!title) return Promise.resolve(null);
  var cfg = hubConfig(ctx, {});
  var key = String(cfg.apiKey || '').trim();
  if (!key) return Promise.resolve(null);
  var prefer = String(query.type || '').trim().toLowerCase();
  var primary = prefer === 'movie' ? 'movie' : 'tv';
  var secondary = primary === 'movie' ? 'tv' : 'movie';
  var year = Number(query.year) > 0 ? Number(query.year) : 0;

  function search(media) {
    var url =
      'https://api.themoviedb.org/3/search/' +
      media +
      '?api_key=' +
      encodeURIComponent(key) +
      '&query=' +
      encodeURIComponent(title) +
      '&include_adult=false';
    return ctx.fetch(url).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (json) {
      if (!json || !Array.isArray(json.results) || !json.results.length) return null;
      return hubTmdbPick(json.results, media, year);
    }).catch(function () { return null; });
  }

  return search(primary).then(function (hit) {
    return hit || search(secondary);
  });
}

function hubTmdbPick(results, media, year) {
  function yearOf(m) {
    var d = String(
      media === 'movie' ? m.release_date || '' : m.first_air_date || '',
    );
    if (d.length < 4) return 0;
    return Number(d.slice(0, 4)) || 0;
  }
  function withBackdrop(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].backdrop_path) return list[i];
    }
    return list.length ? list[0] : null;
  }
  var chosen = null;
  if (year > 0) {
    var exact = [];
    var near = [];
    for (var i = 0; i < results.length; i++) {
      var y = yearOf(results[i]);
      if (y === year) exact.push(results[i]);
      else if (y && Math.abs(y - year) <= 1) near.push(results[i]);
    }
    chosen = withBackdrop(exact) || withBackdrop(near) || withBackdrop(results);
  } else {
    chosen = withBackdrop(results);
  }
  if (!chosen || !chosen.id) return null;
  var name = String(
    media === 'movie' ? chosen.title || '' : chosen.name || '',
  );
  var poster = hubTmdbAbsArt(chosen.poster_path, 'w500');
  var backdrop = hubTmdbAbsArt(chosen.backdrop_path, 'w1280');
  var overview = String(chosen.overview || '').trim();
  var rating = Number(chosen.vote_average);
  return {
    id: Number(chosen.id),
    mediaType: media,
    name: name,
    year: yearOf(chosen) || null,
    poster: poster || null,
    backdrop: backdrop || null,
    overview: overview || null,
    rating: rating > 0 ? rating : null,
  };
}

function hubTmdbAbsArt(path, size) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return 'https://image.tmdb.org/t/p/' + (size || 'w500') + p;
}

// Prefer English title logo, then lang-null, then first available.
function hubTmdbPickTitleLogo(images) {
  var logos = images && Array.isArray(images.logos) ? images.logos : [];
  if (!logos.length) return '';
  var en = null;
  var nul = null;
  var first = null;
  for (var i = 0; i < logos.length; i++) {
    var L = logos[i];
    if (!L || !L.file_path) continue;
    if (!first) first = L;
    var lang = L.iso_639_1;
    if (lang === 'en' && !en) en = L;
    if ((lang == null || lang === '') && !nul) nul = L;
  }
  var chosen = en || nul || first;
  return chosen ? hubTmdbAbsArt(chosen.file_path, 'w500') : '';
}

function hubApplyTmdbHit(meta, hit) {
  if (!meta || !hit || !hit.id) return meta;
  meta.ids = Object.assign({}, meta.ids || {}, { tmdb: String(hit.id) });
  if (hit.mediaType) meta.tmdbMediaType = String(hit.mediaType);
  if (hit.backdrop) {
    meta.background = String(hit.backdrop);
    meta.bannerImage = '';
  } else if (hit.poster && !meta.poster) {
    meta.poster = String(hit.poster);
  }
  if (hit.logo && !String(meta.logo || '').trim()) {
    meta.logo = String(hit.logo);
  }
  // Fill synopsis / score only when the pack left them empty (AniList keeps its own).
  if (hit.overview && !String(meta.description || '').trim()) {
    meta.description = String(hit.overview);
  }
  if (hit.rating != null && !(Number(meta.rating) > 0)) {
    meta.rating = Number(hit.rating);
  }
  return meta;
}

function hubEnrichPreferType(meta) {
  var prefer = String(meta.tmdbMediaType || '').toLowerCase();
  if (prefer === 'movie' || prefer === 'tv') return prefer;
  var fmt = String(meta.badge || '').toUpperCase();
  if (fmt === 'MOVIE' || fmt === 'FILM' || fmt === 'HOLLYWOOD') return 'movie';
  return 'tv';
}

function hubEnrichTmdb(ctx, items, limit) {
  if (!Array.isArray(items) || !items.length) return Promise.resolve(items || []);
  var n = Number(limit) > 0 ? Number(limit) : items.length;
  var head = items.slice(0, n);
  var tail = items.slice(n);
  return Promise.all(
    head.map(function (meta) {
      var yearBit = String(meta.releaseInfo || '').split(' • ')[0];
      var year = Number(yearBit) || 0;
      return hubTmdbMatch(ctx, {
        title: meta.name,
        year: year,
        type: hubEnrichPreferType(meta),
      }).then(function (hit) {
        return hubApplyTmdbHit(meta, hit);
      });
    }),
  ).then(function (enriched) {
    return enriched.concat(tail);
  });
}

// --- Layout kit builders (protocol 1) — use in `layout` widgets[] ---

function kitStack(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'kit.stack', id: id, children: children || [] },
    o,
  );
}

function kitMenu(id, items, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.menu', id: id, items: items || [] }, o);
}

function kitTabs(id, tabs, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.tabs', id: id, tabs: tabs || [] }, o);
}

function kitList(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.list', id: id }, o);
}

function kitRow(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.row', id: id }, o);
}

function kitTopBar(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.topBar', id: id }, o);
}

function kitCategoryBar(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.categoryBar', id: id }, o);
}

/** Header + side rail + body (IPTV catalog geometry). children: [header, side, body]. */
function kitColumnsHeader(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'columnsHeader', id: id, children: children || [] },
    o,
  );
}

// IPTV pack prefs — vault SoT per portal + section (live sort, pins, favs, watched, layout).

var IPTV_VAULT_PORTALS = 'iptv.portals';
var IPTV_VAULT_ACTIVE = 'iptv.active';
var IPTV_VAULT_PREFS_PREFIX = 'iptv.prefs.';

function iptvHost(ctx) {
  return (ctx && ctx.host) || {};
}

function iptvVault(ctx) {
  return iptvHost(ctx).vault || null;
}

function iptvHttp(ctx) {
  var host = iptvHost(ctx);
  if (host.http && typeof host.http.request === 'function') {
    return host.http.request.bind(host.http);
  }
  return null;
}

function iptvEngine(ctx) {
  var host = iptvHost(ctx);
  if (host.engine && typeof host.engine.request === 'function') {
    return host.engine.request.bind(host.engine);
  }
  return null;
}

function iptvCache(ctx) {
  return iptvHost(ctx).cache || null;
}

function iptvPlayback(ctx) {
  return iptvHost(ctx).playback || null;
}

function iptvNormBase(url) {
  var u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/player_api\.php$/i, '');
}

/** Pack form `url|user` — also strips legacy `platform|url|user|pass`. */
function iptvPackKeyForm(raw) {
  var s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  var parts = s.split('|');
  if (parts.length >= 4) {
    return (
      String(parts[1] || '').trim() + '|' + String(parts[2] || '').trim()
    );
  }
  if (parts.length >= 2) {
    return (
      String(parts[0] || '').trim() + '|' + String(parts[1] || '').trim()
    );
  }
  return s;
}

function iptvSamePortalKey(a, b) {
  var x = iptvPackKeyForm(a);
  var y = iptvPackKeyForm(b);
  if (x && y && x !== '|' && y !== '|' && x === y) return true;
  var aa = String(a || '')
    .trim()
    .toLowerCase();
  var bb = String(b || '')
    .trim()
    .toLowerCase();
  return !!(aa && bb && aa === bb);
}

/** Canonical `url|user`. Prefer url/username over a stale `portal.key`. */
function iptvPortalKey(portal) {
  if (!portal) return '';
  var url = String(portal.url || '')
    .trim()
    .toLowerCase();
  var user = String(portal.username || '')
    .trim()
    .toLowerCase();
  if (url) return url + '|' + user;
  if (portal.key) return iptvPackKeyForm(portal.key);
  return '';
}

function iptvPrefsKey(portalKey, section) {
  var pk = String(portalKey || '').trim();
  var sec = String(section || 'live').trim().toLowerCase() || 'live';
  return IPTV_VAULT_PREFS_PREFIX + pk + '.' + sec;
}

function iptvPrefsDefaults() {
  return {
    liveSort: 'playlist',
    pinnedCats: [],
    favorites: [],
    watched: [],
    layout: 'cards',
  };
}

function iptvPrefsNormalize(raw) {
  var d = iptvPrefsDefaults();
  if (!raw || typeof raw !== 'object') return d;
  var sort = String(raw.liveSort || raw.sort || d.liveSort).trim();
  if (sort !== 'playlist' && sort !== 'nameAsc' && sort !== 'nameDesc') {
    sort = d.liveSort;
  }
  var layout = String(raw.layout || d.layout).trim().toLowerCase();
  if (layout === 'epg') layout = 'guide';
  if (layout === 'timeline' || layout === 'list') layout = 'guide';
  if (layout !== 'cards' && layout !== 'grid' && layout !== 'guide') {
    layout = d.layout;
  }
  var pinned = Array.isArray(raw.pinnedCats) ? raw.pinnedCats : [];
  var favs = Array.isArray(raw.favorites) ? raw.favorites : [];
  var watched = Array.isArray(raw.watched) ? raw.watched : [];
  return {
    liveSort: sort,
    pinnedCats: pinned.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    favorites: favs.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    watched: watched.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    layout: layout,
  };
}

async function iptvPrefsLoad(ctx, portalKey, section) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return iptvPrefsDefaults();
  var key = iptvPrefsKey(portalKey, section);
  try {
    var raw = await vault.get(key);
    if (!raw) return iptvPrefsDefaults();
    return iptvPrefsNormalize(JSON.parse(String(raw)));
  } catch (e) {
    return iptvPrefsDefaults();
  }
}

async function iptvPrefsSave(ctx, portalKey, section, prefs) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  var key = iptvPrefsKey(portalKey, section);
  try {
    await vault.set(key, JSON.stringify(iptvPrefsNormalize(prefs)));
    return true;
  } catch (e) {
    return false;
  }
}
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
      url: s.url ? String(s.url).trim() : undefined,
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
// IPTV portals — vault inventory + scrape / share via engine.request.
// Vault keys: iptv.portals / iptv.active (same as host IptvVaultKeys).

async function iptvLoadPortals(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return [];
  try {
    var raw = await vault.get(IPTV_VAULT_PORTALS);
    if (!raw) return [];
    var parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function iptvSavePortals(ctx, portals) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    await vault.set(IPTV_VAULT_PORTALS, JSON.stringify(portals || []));
    return true;
  } catch (e) {
    return false;
  }
}

async function iptvGetActiveKey(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return '';
  try {
    var k = await vault.get(IPTV_VAULT_ACTIVE);
    return k ? String(k) : '';
  } catch (e) {
    return '';
  }
}

async function iptvSetActiveKey(ctx, key) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    if (!key) {
      if (typeof vault.remove === 'function') await vault.remove(IPTV_VAULT_ACTIVE);
      else await vault.set(IPTV_VAULT_ACTIVE, '');
    } else {
      await vault.set(IPTV_VAULT_ACTIVE, String(key));
    }
    return true;
  } catch (e) {
    return false;
  }
}

function iptvPortalPublic(portal) {
  if (!portal) return null;
  return {
    key: iptvPortalKey(portal),
    label: String(portal.label || portal.name || portal.username || '').trim(),
    url: String(portal.url || '').trim(),
    username: String(portal.username || '').trim(),
    platform: iptvPlatformOf(portal),
    activeConnections: portal.activeConnections,
    maxConnections: portal.maxConnections,
    expiry: portal.expiry,
  };
}

function iptvPortalFromParams(p) {
  var params = p || {};
  var platform = iptvPlatformOf({
    platform: params.platform || params.type || 'xtream',
  });
  var url = iptvNormBase(params.url || params.portalUrl || '');
  if (!url && params.url) url = String(params.url).trim();
  var username = String(
    params.username || params.portalUsername || params.mac || '',
  ).trim();
  var password = String(
    params.password || params.portalPassword || params.serial || '',
  ).trim();
  var label = String(params.label || params.portalLabel || params.name || '').trim();
  var userAgent = String(params.userAgent || params.user_agent || '').trim();
  var portal = {
    url: url,
    username: username,
    password: password,
    label: label || username || url,
    platform: platform,
  };
  if (userAgent) portal.userAgent = userAgent;
  portal.key = iptvPortalKey(portal);
  return portal;
}

function iptvPortalValidate(portal) {
  var platform = iptvPlatformOf(portal);
  if (!portal.url) return 'url required';
  if (platform === 'm3u') return '';
  if (platform === 'stalker') {
    if (!portal.username) return 'MAC (username) required';
    return '';
  }
  if (!portal.username || !portal.password) {
    return 'url, username, password required';
  }
  return '';
}

async function iptvUpsertPortalRow(ctx, portal, opts) {
  var o = opts || {};
  var portals = await iptvLoadPortals(ctx);
  var key = iptvPortalKey(portal);
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      portals[i] = Object.assign({}, portals[i], portal, { key: key });
      found = true;
      break;
    }
  }
  if (!found) portals.push(Object.assign({}, portal, { key: key }));
  await iptvSavePortals(ctx, portals);
  if (o.select !== false) await iptvSetActiveKey(ctx, key);
  return portals;
}

async function iptvUpsertFromSettings(ctx) {
  var cfg = hubConfig(ctx, {});
  var url = iptvNormBase(cfg.portalUrl || cfg.portal_url || '');
  var username = String(cfg.portalUsername || cfg.portal_username || '').trim();
  var password = String(cfg.portalPassword || cfg.portal_password || '').trim();
  var label = String(cfg.portalLabel || cfg.portal_label || '').trim();
  var platform = iptvPlatformOf({
    platform: cfg.platform || cfg.portalPlatform || 'xtream',
  });
  if (!url) return null;
  if (platform === 'xtream' && (!username || !password)) return null;
  if (platform === 'stalker' && !username) return null;

  var portal = {
    url: url,
    username: username,
    password: password,
    label: label || username || url,
    platform: platform,
  };
  portal.key = iptvPortalKey(portal);
  // Inventory only — never steal / bootstrap active on feed/list.
  await iptvUpsertPortalRow(ctx, portal, { select: false });
  return portal;
}

async function iptvResolveActive(ctx) {
  await iptvUpsertFromSettings(ctx);
  var portals = await iptvLoadPortals(ctx);
  if (!portals.length) return null;

  var active = await iptvGetActiveKey(ctx);
  if (!active) return null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), active)) {
      return portals[i];
    }
  }
  return null;
}

function iptvPortalFormFields(opts) {
  var o = opts || {};
  var editing = !!o.editing;
  return [
    { id: 'url', label: 'URL', type: 'text', required: !editing },
    { id: 'username', label: 'Username / MAC', type: 'text' },
    {
      id: 'password',
      label: editing ? 'Password (blank = keep)' : 'Password',
      type: 'password',
      required: !editing,
    },
    { id: 'label', label: 'Label', type: 'text' },
  ];
}

function iptvPortalAddForm() {
  return {
    title: 'Add portal',
    submitLabel: 'Add',
    cancelLabel: 'Cancel',
    action: 'addPortal',
    toastOk: 'Portal added',
    description: 'Portal URL and credentials.',
    fields: iptvPortalFormFields({ editing: false }),
  };
}

function iptvPortalEditForm() {
  return {
    title: 'Edit portal',
    submitLabel: 'Save',
    cancelLabel: 'Cancel',
    action: 'editPortal',
    toastOk: 'Portal updated',
    fields: iptvPortalFormFields({ editing: true }),
  };
}

function iptvPortalImportForm() {
  return {
    title: 'Import portal',
    submitLabel: 'Import',
    cancelLabel: 'Cancel',
    action: 'importPortal',
    toastOk: 'Portal imported',
    description: 'Paste an 8-character share code (XXXX-XXXX) or F1. token.',
    fields: [
      {
        id: 'token',
        label: 'Share code',
        type: 'text',
        required: true,
        hint: 'XXXX-XXXX',
      },
      { id: 'label', label: 'Label (optional)', type: 'text' },
    ],
  };
}

function iptvPortalListItem(portal, activeKey) {
  var pub = iptvPortalPublic(portal);
  if (!pub || !pub.key) return null;
  var label = pub.label || pub.username || pub.key;
  return {
    id: pub.key,
    type: 'portal',
    kind: 'portal',
    name: label,
    title: label,
    description: pub.url || '',
    subtitle: pub.url || '',
    badge: pub.platform || '',
    selected: iptvSamePortalKey(pub.key, activeKey),
    portalKey: pub.key,
    platform: pub.platform,
    activeConnections: pub.activeConnections,
    maxConnections: pub.maxConnections,
    expiry: pub.expiry,
    formValues: {
      url: pub.url || '',
      username: pub.username || '',
      label: label,
    },
    open: {
      surface: 'iptv',
      id: pub.key,
      action: 'selectPortal',
      portalKey: pub.key,
    },
  };
}

/** Side-panel layout token — foundation paints portalList from items. */
function iptvPortalsPanelLayout() {
  return {
    widgets: [
      {
        type: 'portalList',
        id: 'portals',
        source: 'listPortals',
        title: 'Portals',
        width: 380,
        searchPlaceholder: 'Search portals…',
        emptyTitle: 'No portals yet',
        emptyDescription:
          'Add a portal or import a share code to browse channels.',
        actions: [
          {
            id: 'scrape',
            label: 'Scrape',
            icon: 'travel_explore',
            action: 'scrape',
          },
          { id: 'deal', label: 'Deal', icon: 'casino', action: 'dealPortals' },
          {
            id: 'import',
            label: 'Import',
            icon: 'file_download',
            action: 'importPortal',
            form: iptvPortalImportForm(),
          },
          {
            id: 'add',
            label: 'Add',
            icon: 'add',
            action: 'addPortal',
            form: iptvPortalAddForm(),
          },
        ],
        itemActions: {
          edit: {
            label: 'Edit',
            action: 'editPortal',
            form: iptvPortalEditForm(),
          },
          remove: { label: 'Delete', action: 'removePortal' },
          share: { label: 'Copy share code', action: 'shareEncode' },
        },
      },
    ],
  };
}

async function iptvListPortals(ctx) {
  var portals = await iptvLoadPortals(ctx);
  var active = await iptvGetActiveKey(ctx);
  var items = [];
  for (var i = 0; i < portals.length; i++) {
    var item = iptvPortalListItem(portals[i], active);
    if (item) items.push(item);
  }
  return hubOk('listPortals', {
    active: active,
    portals: portals.map(iptvPortalPublic),
    items: items,
    layout: iptvPortalsPanelLayout(),
  });
}

async function iptvAddPortal(ctx, params) {
  var portal = iptvPortalFromParams(params);
  var err = iptvPortalValidate(portal);
  if (err) return hubFail('addPortal', 'INVALID', err);
  await iptvUpsertPortalRow(ctx, portal, { select: true });
  return hubOk('addPortal', { portal: iptvPortalPublic(portal) });
}

async function iptvImportPortal(ctx, params) {
  var p = params || {};
  var decoded = await iptvShareDecode(ctx, {
    token: p.token || p.code || p.share || p.url || '',
  });
  var env = Array.isArray(decoded) ? decoded[0] : decoded;
  if (!env || !env.ok) {
    return (
      decoded ||
      hubFail('importPortal', 'DECODE_FAILED', 'could not decode share code')
    );
  }
  var data = env.data || {};
  var row = data.portal || {};
  var label = String(p.label || p.portalLabel || '').trim();
  var portal = iptvPortalFromParams({
    url: row.url,
    username: row.username,
    password: row.password,
    platform: row.platform,
    userAgent: row.userAgent || row.user_agent,
    label: label || row.username || row.url,
  });
  var err = iptvPortalValidate(portal);
  if (err) return hubFail('importPortal', 'INVALID', err);
  await iptvUpsertPortalRow(ctx, portal, { select: true });
  return hubOk('importPortal', { portal: iptvPortalPublic(portal) });
}

async function iptvEditPortal(ctx, params) {
  var p = params || {};
  var key = String(p.key || p.portalKey || '').trim();
  if (!key) return hubFail('editPortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var idx = -1;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return hubFail('editPortal', 'NOT_FOUND', 'portal not found');

  var cur = portals[idx];
  var next = iptvPortalFromParams(
    Object.assign({}, cur, p, {
      url: p.url != null ? p.url : cur.url,
      username: p.username != null ? p.username : cur.username,
      password: p.password != null ? p.password : cur.password,
      label: p.label != null ? p.label : cur.label,
      platform: p.platform != null ? p.platform : cur.platform,
    }),
  );
  var err = iptvPortalValidate(next);
  if (err) return hubFail('editPortal', 'INVALID', err);

  // Preserve key identity when url/user change: replace old row.
  portals.splice(idx, 1);
  var replaced = false;
  for (var j = 0; j < portals.length; j++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[j]), next.key)) {
      portals[j] = next;
      replaced = true;
      break;
    }
  }
  if (!replaced) portals.push(next);
  await iptvSavePortals(ctx, portals);
  var active = await iptvGetActiveKey(ctx);
  if (iptvSamePortalKey(active, key)) await iptvSetActiveKey(ctx, next.key);
  return hubOk('editPortal', { portal: iptvPortalPublic(next) });
}

async function iptvRemovePortal(ctx, params) {
  var key = String((params && (params.key || params.portalKey)) || '').trim();
  if (!key) return hubFail('removePortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var next = [];
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      found = true;
      continue;
    }
    next.push(portals[i]);
  }
  if (!found) return hubFail('removePortal', 'NOT_FOUND', 'portal not found');
  await iptvSavePortals(ctx, next);
  var active = await iptvGetActiveKey(ctx);
  if (iptvSamePortalKey(active, key)) {
    await iptvSetActiveKey(ctx, '');
  }
  return hubOk('removePortal', { key: key, remaining: next.length });
}

async function iptvSelectPortal(ctx, params) {
  var key = String((params && (params.key || params.portalKey)) || '').trim();
  if (!key) return hubFail('selectPortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var hit = null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      hit = portals[i];
      break;
    }
  }
  if (!hit) return hubFail('selectPortal', 'NOT_FOUND', 'portal not found');
  var canon = iptvPortalKey(hit);
  await iptvSetActiveKey(ctx, canon);
  return hubOk('selectPortal', { key: canon });
}

async function iptvScrapePortals(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail('scrape', 'ENGINE_REQUIRED', 'ctx.host.engine.request required');
  }
  var p = params || {};
  var request = p.request || {
    action: p.scrapeAction || 'scrape_page',
    after: p.after || null,
    max_results: p.maxResults || p.max_results || 40,
    text: p.text,
    source: p.source,
  };
  try {
    var res = await engine('iptv', { action: 'scrape', request: request });
    if (!res || res.error || res.ok === false) {
      return hubFail(
        'scrape',
        'SCRAPE_FAILED',
        String((res && (res.error || res.message)) || 'scrape failed'),
        true,
      );
    }
    return hubOk('scrape', {
      portals: res.portals || [],
      nextAfter: res.next_after || res.nextAfter || null,
    });
  } catch (e) {
    return hubFail('scrape', 'SCRAPE_FAILED', String((e && e.message) || e), true);
  }
}

async function iptvShareEncode(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail(
      'shareEncode',
      'ENGINE_REQUIRED',
      'ctx.host.engine.request required',
    );
  }
  var p = params || {};
  var portal = p.portal || null;
  var key = String(p.key || p.portalKey || '').trim();
  if ((!portal || !portal.url) && key) {
    var portals = await iptvLoadPortals(ctx);
    for (var i = 0; i < portals.length; i++) {
      if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
        portal = portals[i];
        break;
      }
    }
  }
  if (!portal) portal = p;
  try {
    var res = await engine('portal_share', {
      action: 'encode',
      url: String(portal.url || '').trim(),
      username: String(portal.username || '').trim(),
      password: String(portal.password || '').trim(),
      platform: iptvPlatformOf(portal),
      userAgent: String(portal.userAgent || portal.user_agent || '').trim(),
    });
    if (!res || !res.ok || !res.token) {
      return hubFail(
        'shareEncode',
        'ENCODE_FAILED',
        String((res && (res.error || res.message)) || 'encode failed'),
      );
    }
    return hubOk('shareEncode', { token: res.token });
  } catch (e) {
    return hubFail('shareEncode', 'ENCODE_FAILED', String((e && e.message) || e));
  }
}

async function iptvShareDecode(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail(
      'shareDecode',
      'ENGINE_REQUIRED',
      'ctx.host.engine.request required',
    );
  }
  var token = String(
    (params && (params.token || params.code || params.share)) || '',
  ).trim();
  if (!token) return hubFail('shareDecode', 'INVALID', 'token required');
  try {
    var res = await engine('portal_share', { action: 'decode', token: token });
    if (!res || res.error || res.ok === false) {
      return hubFail(
        'shareDecode',
        'DECODE_FAILED',
        String((res && (res.error || res.message)) || 'decode failed'),
      );
    }
    return hubOk('shareDecode', {
      portal: {
        url: res.url,
        username: res.username,
        password: res.password,
        platform: res.platform || 'xtream',
        userAgent: res.user_agent || res.userAgent || '',
      },
    });
  } catch (e) {
    return hubFail('shareDecode', 'DECODE_FAILED', String((e && e.message) || e));
  }
}
// IPTV VOD details — portal movie/series meta (+ series episodes via vault + host http).

/** Strip portal/release junk from VOD titles (parity with host cleanIptvMediaTitle). */
function iptvCleanMediaTitle(raw) {
  var s = String(raw || '').trim();
  if (!s) return { title: '', year: null, season: null, episode: null };

  s = s.replace(/[_\.]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  var season = null;
  var episode = null;
  var se = /\b[Ss](\d{1,2})\s*[Ee](\d{1,3})\b|\b(\d{1,2})\s*[xX]\s*(\d{1,3})\b/.exec(s);
  if (se) {
    season = parseInt(se[1] || se[3], 10) || null;
    episode = parseInt(se[2] || se[4], 10) || null;
    s = (s.slice(0, se.index) + ' ' + s.slice(se.index + se[0].length)).trim();
  }

  var year = null;
  var yearMatch = /\b((?:19|20)\d{2})\b/.exec(s);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10) || null;
    s = (s.slice(0, yearMatch.index) + ' ' + s.slice(yearMatch.index + yearMatch[0].length)).trim();
  }

  // Leading `|EN|` / `|FR|` pipe tags (common portal prefixes).
  for (var i = 0; i < 4; i++) {
    var next = s.replace(
      /^\|?\s*(?:EN|FR|AR|ES|DE|IT|PT|NL|TR|PL|RU|MULTI|VO|VF|VOSTFR|VOST|NETFLIX|NF|AMAZON|AMZN|PRIME|DISNEY(?:\+)?|HULU|HBO|MAX|APPLE|ATVP|DC|DV|WEB|WEB[- ]?DL|WEBRip)\s*\|+\s*/i,
      '',
    );
    if (next === s) break;
    s = next;
  }

  // Leading platform / lang tags: EN-, FR-, NETFLIX-, Disney+-, etc.
  s = s.replace(
    /^(?:EN|FR|AR|ES|DE|IT|PT|NL|TR|PL|RU|MULTI|VO|VF|VOSTFR|VOST|NETFLIX|NF|AMAZON|AMZN|PRIME|DISNEY(?:\+)?|HULU|HBO|MAX|APPLE|ATVP|DC|DV|WEB|WEB[- ]?DL|WEBRip)\s*[-:]\s*/i,
    '',
  );
  s = s.replace(
    /^(?:EN|FR|AR|ES|DE|IT|PT|NL|TR|PL|RU|MULTI|VO|VF|VOSTFR|VOST|NETFLIX|NF|AMAZON|AMZN|PRIME|DISNEY(?:\+)?|HULU|HBO|MAX|APPLE|ATVP)\s*[-:]\s*/i,
    '',
  );

  s = s.replace(/[\[\(\{][^\]\)\}]{0,40}[\]\)\}]/g, ' ');

  var junk =
    /(?:1080p|720p|480p|2160p|4K|UHD|HDR10?\+?|DV|Dolby(?:\s*Vision)?|x264|x265|h\.?264|h\.?265|HEVC|AVC|AAC|AC3|DTS|Atmos|BluRay|BDRip|BRRip|HDRip|DVDRip|HDTV|WEB[- ]?DL|WEBRip|WEB|REPACK|PROPER|INTERNAL|LIMITED|EXTENDED|UNRATED|IMAX|MULTI|DUAL|SUBBED|DUBBED|VOSTFR|VOST|VF|VO|COMPLETE|SEASON|Saison)/gi;
  s = s.replace(junk, ' ');

  s = s.replace(/[-|~/\\]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\-\s:]+|[\-\s:]+$/g, '').trim();

  return { title: s, year: year, season: season, episode: episode };
}

function iptvEpisodeVideos(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i] || {};
    var id = String(e.id || e.episodeId || e.episode_id || '').trim();
    if (!id) continue;
    var season = Number(e.season);
    var episode = Number(e.episode || e.episode_num);
    var ext = String(
      e.containerExt || e.container_ext || e.container_extension || e.ext || '',
    )
      .replace(/^\./, '')
      .trim();
    var thumb = String(e.image || e.thumbnail || e.movie_image || '').trim();
    var title =
      String(e.title || e.name || '').trim() ||
      'Episode ' + (episode > 0 ? episode : i + 1);
    var row = {
      id: id,
      title: title,
      season: season > 0 ? season : 1,
      episode: episode > 0 ? episode : i + 1,
      thumbnail: thumb,
    };
    if (ext) row.containerExt = ext;
    var plot = String(e.plot || (e.info && e.info.plot) || '').trim();
    if (plot) row.plot = plot;
    out.push(row);
  }
  out.sort(function (a, b) {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });
  return out;
}

async function iptvFindPortalByKey(ctx, portalKey) {
  var portals = await iptvLoadPortals(ctx);
  if (!Array.isArray(portals)) return null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), portalKey)) {
      return portals[i];
    }
  }
  return null;
}

async function iptvFetchSeriesEpisodesHttp(ctx, portal, seriesId) {
  var request = iptvHttp(ctx);
  if (typeof request !== 'function') return [];
  var base = iptvNormBase(portal.url);
  var url =
    base +
    '/player_api.php?username=' +
    encodeURIComponent(portal.username) +
    '&password=' +
    encodeURIComponent(portal.password) +
    '&action=get_series_info&series_id=' +
    encodeURIComponent(seriesId);
  var res = await request({ method: 'GET', url: url, timeoutMs: 45000 });
  var json = iptvParseJsonBody(res);
  if (!json || typeof json !== 'object') return [];
  var episodes = json.episodes;
  var out = [];
  if (Array.isArray(episodes)) {
    return iptvEpisodeVideos(episodes);
  }
  if (episodes && typeof episodes === 'object') {
    Object.keys(episodes).forEach(function (seasonKey) {
      var list = episodes[seasonKey];
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var e = list[i] || {};
        out.push({
          id: String(e.id || e.episode_id || '').trim(),
          title: String(e.title || e.name || '').trim(),
          season: Number(e.season || seasonKey) || 1,
          episode: Number(e.episode_num || e.episode || i + 1) || i + 1,
          image: String(
            (e.info && (e.info.movie_image || e.info.cover)) || e.movie_image || '',
          ).trim(),
          plot: String((e.info && e.info.plot) || e.plot || '').trim(),
          container_ext: String(
            e.container_extension || e.container_ext || e.ext || '',
          ).trim(),
        });
      }
    });
  }
  return iptvEpisodeVideos(out);
}

/** Series episodes via engine (Xtream/Stalker) or Xtream HTTP — pack owns meta.videos. */
async function iptvFetchSeriesEpisodes(ctx, portal, seriesId) {
  var sid = String(seriesId || '').trim();
  if (!sid || !portal) return [];
  var platform = iptvPlatformOf(portal);
  var engine = iptvEngine(ctx);
  if (engine) {
    try {
      var res = await iptvEngineIptv(ctx, {
        action: 'series_episodes',
        platform: platform,
        url: iptvNormBase(portal.url) || String(portal.url || '').trim(),
        username: String(portal.username || portal.mac || ''),
        password: String(portal.password || portal.serial || ''),
        seriesId: sid,
        series_id: sid,
        timeout_secs: 45,
      });
      if (res && res.ok !== false && !res.error) {
        var fromEngine = iptvEpisodeVideos(res.episodes || res.videos || []);
        if (fromEngine.length) return fromEngine;
      }
    } catch (e) {
      /* fall through */
    }
  }
  if (platform === 'xtream') {
    return await iptvFetchSeriesEpisodesHttp(ctx, portal, sid);
  }
  return [];
}

async function iptvVodDetails(ctx, params) {
  var streamId = String(params.streamId || params.id || '').trim();
  var portalKey = String(params.portalKey || '').trim();
  if (!streamId || !portalKey) {
    return hubFail(
      'details',
      'INVALID_PARAMS',
      'details needs portalKey and streamId',
    );
  }

  var kind = String(params.kind || '').trim();
  var isMovie =
    kind === 'vod' ||
    kind === 'movie' ||
    params.movie === true ||
    params.movie === 'true';
  var type = isMovie ? 'movie' : 'tv';
  var rawName =
    String(params.streamName || params.name || params.title || '').trim() ||
    'Unknown';
  var cleaned = iptvCleanMediaTitle(rawName);
  var name = cleaned.title || rawName;
  var icon = String(params.icon || params.poster || '').trim();
  var plot = String(params.plot || params.description || '').trim();
  var releaseInfo =
    cleaned.year != null
      ? String(cleaned.year)
      : String(params.releaseInfo || '').trim();

  var videos = iptvEpisodeVideos(params.portalEpisodes || params.episodes);
  if (!isMovie && !videos.length) {
    var portal = await iptvFindPortalByKey(ctx, portalKey);
    if (portal) {
      videos = await iptvFetchSeriesEpisodes(ctx, portal, streamId);
      if (!plot && videos.length) {
        plot = String(videos[0].plot || '').trim();
      }
    }
  }

  var metaId = 'iptv:' + portalKey + ':' + streamId;
  var meta = {
    id: metaId,
    type: type,
    name: name,
    poster: icon,
    background: icon,
    description: plot,
    releaseInfo: releaseInfo,
    badge: isMovie ? 'MOVIE' : 'TV',
    open: {
      surface: 'iptv',
      id: streamId,
      movie: isMovie,
      kind: kind || (isMovie ? 'vod' : 'series'),
      portalKey: portalKey,
      streamName: rawName,
      name: name,
      streamIcon: icon,
      categoryId: String(params.categoryId || ''),
      containerExt: String(params.containerExt || ''),
      platform: String(params.platform || 'xtream'),
      extract: {
        resolveType: 'iptv',
        panelCategory: 'iptv',
        ctx: {
          portalKey: portalKey,
          streamId: streamId,
          kind: kind || (isMovie ? 'vod' : 'series'),
          platform: String(params.platform || 'xtream'),
          containerExt: String(params.containerExt || ''),
          categoryId: String(params.categoryId || ''),
        },
      },
    },
  };

  if (videos.length) {
    meta.videos = videos.map(function (v) {
      var open = {
        surface: 'iptv',
        id: v.id,
        movie: false,
        kind: 'series',
        portalKey: portalKey,
        streamId: streamId,
        episodeId: v.id,
        season: v.season,
        episode: v.episode,
        name: v.title,
        streamIcon: icon,
        containerExt: v.containerExt || String(params.containerExt || ''),
        platform: String(params.platform || 'xtream'),
        extract: {
          resolveType: 'iptv',
          panelCategory: 'iptv',
          ctx: {
            portalKey: portalKey,
            streamId: streamId,
            episodeId: v.id,
            kind: 'series',
            platform: String(params.platform || 'xtream'),
            containerExt: v.containerExt || String(params.containerExt || ''),
            season: v.season,
            episode: v.episode,
          },
        },
      };
      return Object.assign({}, v, { open: open });
    });
  }
  return hubOk('details', { meta: meta }, { maxAge: 300, swr: 900 });
}

