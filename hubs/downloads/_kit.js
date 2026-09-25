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

function hubOk(action, data, cache) {
  var env = {
    ok: true,
    kit: HUB_KIT,
    protocol: HUB_PROTOCOL,
    action: action,
    data: data || {},
  };
  if (cache) env.cache = cache;
  return [env];
}

function hubItems(action, items, cache, paging) {
  var data = { items: items || [] };
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


function hubPosterTypeLabel(meta) {
  meta = meta || {};
  var hint = String(meta.tmdbMediaType || '').trim().toLowerCase();
  var kind = String(meta.kind || meta.type || meta.mediaType || '')
    .trim()
    .toLowerCase();
  var surface = '';
  var open = meta.open || meta.metaOpen || meta.catalogOpen;
  if (open && typeof open === 'object') {
    surface = String(open.surface || '')
      .trim()
      .toLowerCase();
  }
  // Hub kinds win over TMDB hint — drama bookmarks often store tmdbMediaType=tv.
  if (kind === 'asian_drama' || kind === 'drama' || surface === 'drama') {
    return 'DRAMA';
  }
  if (kind === 'anime' || surface === 'anime') return 'ANIME';
  if (hint === 'tv' || kind === 'tv' || kind === 'series' || kind === 'shows') {
    return 'TV';
  }
  if (hint === 'movie' || kind === 'movie' || kind === 'movies') return 'FILM';
  return null;
}

/** Year from trailing `(2026)` / `(1999)` in a title — KissKH often embeds it. */
function hubYearFromTitle(title) {
  var m = String(title || '').match(/\((19|20)\d{2}\)\s*$/);
  return m ? m[0].slice(1, 5) : '';
}

function hubPosterCardSubtitle(meta) {
  meta = meta || {};
  var release = String(
    meta.releaseInfo || meta.releaseDate || meta.year || '',
  ).trim();
  if (!release) {
    release = hubYearFromTitle(meta.name || meta.title || '');
  }
  if (release.indexOf(' • ') !== -1) return release || null;
  var parts = [];
  if (release) {
    parts.push(release.indexOf('-') !== -1 ? release.split('-')[0] : release);
  }
  var typeLabel = hubPosterTypeLabel(meta);
  if (typeLabel) parts.push(typeLabel);
  return parts.length ? parts.join(' • ') : null;
}

function myListTmdbAbs(path, size) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return 'https://tmdb.forjahq.xyz/t/p/' + (size || 'w500') + p;
}

function myListPickTitleLogo(images) {
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
  return chosen ? myListTmdbAbs(chosen.file_path, 'w500') : '';
}

function myListNeedsEnrich(row) {
  if (!row || typeof row !== 'object') return false;
  var tmdbId = Number(row.tmdbId);
  if (!(tmdbId > 0)) return false;
  var poster = String(row.posterPath || row.poster || '').trim();
  var title = String(row.title || row.name || '').trim();
  var vote = row.voteAverage != null ? row.voteAverage : row.rating;
  var logo = String(row.logo || '').trim();
  var release = String(
    row.releaseDate || row.releaseInfo || row.year || '',
  ).trim();
  return (
    !poster ||
    !title ||
    vote == null ||
    Number(vote) === 0 ||
    !logo ||
    !release
  );
}

function myListMediaType(row) {
  var kind = String(row._simklType || '');
  var mt = String(row.mediaType || row.kind || row.type || 'movie');
  var tmdbMt = String(row.tmdbMediaType || '').trim();
  if (tmdbMt === 'tv' || tmdbMt === 'movie') return tmdbMt;
  if (
    kind === 'anime' ||
    kind === 'shows' ||
    mt === 'anime' ||
    mt === 'tv' ||
    mt === 'series' ||
    mt === 'asian_drama' ||
    mt === 'drama'
  ) {
    return 'tv';
  }
  return 'movie';
}

function myListApplyTmdbDetails(row, data, mediaType) {
  if (!row || !data) return row;
  var next = Object.assign({}, row);
  var title = String(data.title || data.name || '').trim();
  var poster = myListTmdbAbs(data.poster_path, 'w500');
  var backdrop = myListTmdbAbs(data.backdrop_path, 'w1280');
  var logo = myListPickTitleLogo(data.images);
  var vote = Number(data.vote_average);
  var date = String(data.release_date || data.first_air_date || '');
  if (title) {
    next.title = title;
    if (!next.name) next.name = title;
  }
  if (poster) {
    next.posterPath = poster;
    next.poster = poster;
  }
  if (backdrop) {
    next.backdropPath = backdrop;
    next.background = backdrop;
  }
  if (logo) next.logo = logo;
  if (vote > 0) {
    next.voteAverage = vote;
    next.rating = vote;
  }
  if (date) {
    next.releaseDate = date;
    next.releaseInfo = date.length >= 4 ? date.slice(0, 4) : date;
  }
  // Never invent a tmdb open for hub bookmarks (anime/drama) — that would
  // reopen them on Home providers.
  var hubMt = String(next.mediaType || next.kind || '');
  var open = next.metaOpen || next.open || next.catalogOpen;
  var surface =
    open && typeof open === 'object' ? String(open.surface || '') : '';
  var isHub =
    hubMt === 'anime' ||
    hubMt === 'drama' ||
    hubMt === 'asian_drama' ||
    surface === 'anime' ||
    surface === 'drama' ||
    next.anilistId != null ||
    next.kisskhId != null ||
    (next.pluginId && String(next.pluginId) !== 'tmdb');
  var hasOpen = !!(next.metaOpen || next.open || next.catalogOpen);
  if (!hasOpen && !isHub) {
    var tmdbOpen = {
      surface: 'tmdb',
      id: String(data.id),
      extract: {
        resolveType: mediaType,
        panelCategory: mediaType,
        ctx: { tmdbId: Number(data.id) },
      },
    };
    next.catalogOpen = tmdbOpen;
    next.metaOpen = tmdbOpen;
    next.open = tmdbOpen;
  }
  // Subtitle must rebuild after year/art fill.
  delete next.paint;
  return next;
}

function hubTmdbGetDetails(ctx, mediaType, id) {
  var n = Number(id);
  if (!(n > 0)) return Promise.resolve(null);
  var media = String(mediaType || 'movie') === 'tv' ? 'tv' : 'movie';
  var cfg = hubConfig(ctx, {
    base: 'https://tmdb.forjahq.xyz/3',
    apiKey: '',
  });
  var key = String(cfg.apiKey || '').trim();
  var base = String(cfg.base || 'https://tmdb.forjahq.xyz/3').replace(/\/$/, '');
  if (base.indexOf('api.themoviedb.org') >= 0 && !key) {
    return Promise.resolve(null);
  }
  var url =
    base +
    '/' +
    media +
    '/' +
    n +
    '?append_to_response=images' +
    (key ? '&api_key=' + encodeURIComponent(key) : '');
  return ctx
    .fetch(url)
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (json) {
      if (!json || json.success === false || json.status_code) return null;
      return json;
    })
    .catch(function () {
      return null;
    });
}

function hubEnrichMyListRows(ctx, items, limit) {
  if (!Array.isArray(items) || !items.length) {
    return Promise.resolve(items || []);
  }
  var n = Number(limit) > 0 ? Number(limit) : items.length;
  var out = items.slice();
  var jobs = [];
  for (var i = 0; i < out.length && jobs.length < n; i++) {
    if (!myListNeedsEnrich(out[i])) continue;
    (function (idx) {
      jobs.push(
        hubTmdbGetDetails(ctx, myListMediaType(out[idx]), out[idx].tmdbId).then(
          function (data) {
            if (!data) return;
            out[idx] = myListApplyTmdbDetails(
              out[idx],
              data,
              myListMediaType(out[idx]),
            );
          },
        ),
      );
    })(i);
  }
  if (!jobs.length) return Promise.resolve(out);
  return Promise.all(jobs).then(function () {
    return out;
  });
}

function hubPaintPoster(item, opts) {
  opts = opts || {};
  var meta = item || {};
  var title = String(meta.name || meta.title || opts.title || '');
  var imageUrl = String(
    meta.poster || meta.posterUrl || meta.imageUrl || opts.imageUrl || '',
  );
  var rating =
    meta.rating != null
      ? Number(meta.rating)
      : meta.voteAverage != null
        ? Number(meta.voteAverage)
        : opts.rating != null
          ? Number(opts.rating)
          : null;
  var paint = {
    type: 'posterCard',
    props: {
      title: title,
      imageUrl: imageUrl,
    },
  };
  if (rating != null && rating > 0) paint.props.rating = rating;
  if (opts.rank != null) paint.props.rank = Number(opts.rank);
  var typeLabel = hubPosterTypeLabel(meta);
  var badge = String(meta.badge || opts.badge || '').trim();
  if (badge && !(typeLabel && badge.toUpperCase() === typeLabel)) {
    paint.props.badge = badge;
  }
  if (opts.subtitle) {
    paint.props.subtitle = String(opts.subtitle);
  } else {
    var sub = hubPosterCardSubtitle(meta);
    if (sub) paint.props.subtitle = sub;
  }
  var mediaType = String(meta.tmdbMediaType || meta.type || meta.mediaType || '')
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
  var open = out.open || meta.metaOpen || meta.catalogOpen || null;
  var tmdbRaw = meta.tmdbId;
  var tmdb =
    typeof tmdbRaw === 'number' && isFinite(tmdbRaw)
      ? tmdbRaw | 0
      : parseInt(String(tmdbRaw || ''), 10);
  if (isNaN(tmdb)) tmdb = null;
  var ids =
    meta.ids && typeof meta.ids === 'object' ? Object.assign({}, meta.ids) : {};
  if (tmdb != null && ids.tmdb == null) ids.tmdb = tmdb;
  var metaId =
    String(meta.id || (open && open.id) || tmdb || title || '').trim();
  out.meta = {
    id: metaId,
    type: String(meta.type || meta.kind || meta.mediaType || ''),
    name: title,
    poster: imageUrl,
    open: open,
  };
  if (Object.keys(ids).length) out.meta.ids = ids;
  if (meta.tmdbMediaType) out.meta.tmdbMediaType = meta.tmdbMediaType;
  if (meta.background) out.meta.background = meta.background;
  if (badge) out.meta.badge = badge;
  if (rating != null && rating > 0) out.meta.rating = rating;
  var releaseInfo = String(
    meta.releaseInfo || meta.releaseDate || meta.year || '',
  ).trim();
  if (releaseInfo) out.meta.releaseInfo = releaseInfo;
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


var HUB_TMDB_DEFAULTS = {
  base: 'https://tmdb.forjahq.xyz/3',
  imageBase: 'https://tmdb.forjahq.xyz/t/p',
  apiKey: '',
};

function hubTmdbBuildUrl(cfg, path, queryObj) {
  var base = String((cfg && cfg.base) || HUB_TMDB_DEFAULTS.base).replace(/\/$/, '');
  var p = String(path || '');
  if (p.charAt(0) !== '/') p = '/' + p;
  var url = base + p;
  var qs = [];
  var key = String((cfg && cfg.apiKey) || '').trim();
  if (base.indexOf('api.themoviedb.org') >= 0 && !key) return null;
  if (key) qs.push('api_key=' + encodeURIComponent(key));
  if (queryObj) {
    for (var k in queryObj) {
      if (!Object.prototype.hasOwnProperty.call(queryObj, k)) continue;
      var v = queryObj[k];
      if (v === null || v === undefined || v === '') continue;
      qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
  }
  if (qs.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  return url;
}

function hubTmdbMatch(ctx, query) {
  query = query || {};
  return hubTmdbMatchFetch(ctx, query).then(function (hit) {
    if (hit && hit.id) return hit;
    if (ctx && ctx.host && ctx.host.tmdb && typeof ctx.host.tmdb.match === 'function') {
      return Promise.resolve(ctx.host.tmdb.match(query))
        .then(function (h) {
          return h && h.id ? h : null;
        })
        .catch(function () {
          return null;
        });
    }
    return null;
  });
}

function hubTmdbMatchFetch(ctx, query) {
  query = query || {};
  var title = String(query.title || '').trim();
  if (!title) return Promise.resolve(null);
  var cfg = hubConfig(ctx, HUB_TMDB_DEFAULTS);
  var key = String(cfg.apiKey || '').trim();
  var base = String(cfg.base || HUB_TMDB_DEFAULTS.base).replace(/\/$/, '');
  if (base.indexOf('api.themoviedb.org') >= 0 && !key) return Promise.resolve(null);
  var prefer = String(query.type || '').trim().toLowerCase();
  var primary = prefer === 'movie' ? 'movie' : 'tv';
  var secondary = primary === 'movie' ? 'tv' : 'movie';
  var year = Number(query.year) > 0 ? Number(query.year) : 0;

  function search(media) {
    var url =
      base + '/search/' + media + '?query=' + encodeURIComponent(title) + '&include_adult=false' + (key ? '&api_key=' + encodeURIComponent(key) : '');
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
  return HUB_TMDB_DEFAULTS.imageBase.replace(/\/$/, '') + '/' + (size || 'w500') + p;
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

/** Kind menu? + status tabs + cards grid (My List geometry). children: [menu?, tabs, cards]. */
function kitTabsCards(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'tabsCards', id: id, children: children || [] },
    o,
  );
}

function kitRow(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.row', id: id }, o);
}

