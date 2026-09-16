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
  var upcoming = status === 'NOT_YET_RELEASED';
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
    }
  }
  if (!upcoming && labelIso && hubIsFutureIsoDate(labelIso)) {
    if (isMovie || !videos.length) upcoming = true;
  }
  meta.upcoming = !!upcoming;
  if (upcoming && !status) meta.status = 'NOT_YET_RELEASED';
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
  if (String(action) === 'details' && payload.meta && typeof payload.meta === 'object') {
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
    var m = hubStampDetailsPaint(list[i]);
    if (!m || typeof m !== 'object') continue;
    if (!m.paint) m = hubPaintPoster(m);
    stamped.push(m);
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


/// Home-style card meta under the title: `2026 • FILM` / `TV`.
/// Packs that already put format in releaseInfo (anime: `2026 • 12 eps`) pass through.
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
  // Skip redundant FILM/TV corner chip when type is already in the subtitle.
  if (badge && !(typeLabel && badge.toUpperCase() === typeLabel)) {
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

function hubPaintHero(item, opts) {
  opts = opts || {};
  var out = hubPaintPoster(item, opts);
  var meta = item || {};
  var props = out.paint.props;
  props.backdropUrl = String(
    meta.background || meta.backdrop || opts.backdropUrl || props.imageUrl || '',
  );
  props.posterUrl = String(meta.poster || props.imageUrl || '');
  props.logoUrl = String(meta.logo || opts.logoUrl || '');
  props.overview = String(
    meta.description || meta.overview || opts.overview || '',
  );
  if (meta.releaseInfo) props.year = String(meta.releaseInfo).slice(0, 4);
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
  var cfg = hubConfig(ctx, {
    base: 'https://db.speedracelight.com/3',
    apiKey: '',
  });
  var base = String(cfg.base || 'https://db.speedracelight.com/3').replace(/\/$/, '');
  var key = String(cfg.apiKey || '').trim();
  if (base.indexOf('api.themoviedb.org') >= 0 && !key) {
    return Promise.resolve(null);
  }
  var prefer = String(query.type || '').trim().toLowerCase();
  var primary = prefer === 'movie' ? 'movie' : 'tv';
  var secondary = primary === 'movie' ? 'tv' : 'movie';
  var year = Number(query.year) > 0 ? Number(query.year) : 0;

  function search(media) {
    var url =
      base +
      '/search/' +
      media +
      '?query=' +
      encodeURIComponent(title) +
      '&include_adult=false';
    if (key) url += '&api_key=' + encodeURIComponent(key);
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
  meta._hubTmdbEnriched = true;
  delete meta.paint;
  delete meta.meta;
  return hubPaintHero(meta);
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

