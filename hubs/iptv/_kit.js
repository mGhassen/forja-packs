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
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
  if (meta.badge || opts.badge) paint.props.badge = String(meta.badge || opts.badge);
  if (opts.subtitle || meta.releaseInfo) {
    paint.props.subtitle = String(opts.subtitle || meta.releaseInfo || '');
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

function hubNormalizeTitle(raw) {
  var t = String(raw || '').trim();
  if (!t) return t;
  t = t.replace(/[\(\[]\s*\d{4}\s*[\)\]]\s*$/g, '').trim();
  t = t.replace(
    /\b(HD|FHD|UHD|4K|1080p|720p|WEB-?DL|BluRay)\b/gi,
    ' ',
  );
  var pipe = t.indexOf('|');
  if (pipe > 0) t = t.substring(0, pipe);
  return t.replace(/\s+/g, ' ').trim();
}

function hubTmdbSearchTitle(meta) {
  if (!meta) return '';
  var ids = meta.ids || {};
  var fromIds = String(ids.tmdbSearch || '').trim();
  if (fromIds) return hubNormalizeTitle(fromIds);
  return hubNormalizeTitle(meta.name || '');
}

function hubTmdbMatch(ctx, query) {
  query = query || {};
  var title = hubNormalizeTitle(query.title);
  if (!title) return Promise.resolve(null);
  var normalized = Object.assign({}, query, { title: title });
  function fetchJs() {
    return hubTmdbMatchFetch(ctx, normalized);
  }
  if (ctx && ctx.host && ctx.host.tmdb && typeof ctx.host.tmdb.match === 'function') {
    return Promise.resolve(ctx.host.tmdb.match(normalized))
      .then(function (hit) {
        if (hit && hit.id) return hit;
        return fetchJs();
      })
      .catch(function () {
        return fetchJs();
      });
  }
  return fetchJs();
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

function hubTmdbParseCast(json) {
  var credits = json && json.credits;
  var list = credits && Array.isArray(credits.cast) ? credits.cast : [];
  var out = [];
  for (var i = 0; i < list.length && out.length < 20; i++) {
    var e = list[i] || {};
    var name = String(e.name || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      character: String(e.character || '').trim(),
      profilePath: hubTmdbAbsArt(e.profile_path, 'w185'),
    });
  }
  return out;
}

function hubTmdbParseCrew(json) {
  var credits = json && json.credits;
  var list = credits && Array.isArray(credits.crew) ? credits.crew : [];
  var out = [];
  for (var i = 0; i < list.length && out.length < 8; i++) {
    var e = list[i] || {};
    var job = String(e.job || '').toLowerCase();
    if (
      job.indexOf('director') < 0 &&
      job.indexOf('writer') < 0 &&
      job.indexOf('creator') < 0
    ) {
      continue;
    }
    var name = String(e.name || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      job: String(e.job || '').trim(),
      profilePath: hubTmdbAbsArt(e.profile_path, 'w185'),
    });
  }
  return out;
}

function hubTmdbParseTrailers(json) {
  var videos = json && json.videos;
  var list = videos && Array.isArray(videos.results) ? videos.results : [];
  var allow = {
    Trailer: 0,
    Teaser: 1,
    Featurette: 2,
    Clip: 3,
    'Behind the Scenes': 4,
  };
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var v = list[i] || {};
    if (String(v.site || '') !== 'YouTube') continue;
    var type = String(v.type || '');
    if (!(type in allow)) continue;
    var key = String(v.key || '').trim();
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push({
      key: key,
      name: String(v.name || type).trim() || type,
      type: type,
      official: v.official === true,
      site: 'YouTube',
    });
  }
  out.sort(function (a, b) {
    if (a.official !== b.official) return a.official ? -1 : 1;
    var ta = allow[a.type] != null ? allow[a.type] : 99;
    var tb = allow[b.type] != null ? allow[b.type] : 99;
    if (ta !== tb) return ta - tb;
    return String(a.name).localeCompare(String(b.name));
  });
  return out;
}

function hubTmdbParseRecommendations(json, media) {
  var root = json && json.recommendations;
  var list = root && Array.isArray(root.results) ? root.results : [];
  var out = [];
  for (var i = 0; i < list.length && out.length < 12; i++) {
    var row = list[i] || {};
    var id = Number(row.id);
    if (!(id > 0)) continue;
    var title = String(
      media === 'movie' ? row.title || row.name || '' : row.name || row.title || '',
    ).trim();
    if (!title) continue;
    var poster = hubTmdbAbsArt(row.poster_path, 'w500');
    var backdrop = hubTmdbAbsArt(row.backdrop_path, 'w1280');
    var overview = String(row.overview || '').trim();
    var rating = Number(row.vote_average);
    out.push({
      id: 'tmdb:' + media + ':' + id,
      type: media,
      name: title,
      poster: poster,
      background: backdrop,
      description: overview,
      rating: rating > 0 ? rating : undefined,
      ids: { tmdb: String(id) },
      tmdbMediaType: media,
      open: { surface: 'tmdb', id: String(id), mediaType: media },
    });
  }
  return out;
}

function hubTmdbParseFacts(json, media) {
  if (!json) return null;
  var facts = {
    mediaType: media,
    status: String(json.status || '').trim(),
    originalLanguage: String(json.original_language || '').trim(),
  };
  var companies = Array.isArray(json.production_companies)
    ? json.production_companies
    : [];
  var prod = [];
  for (var i = 0; i < companies.length; i++) {
    var n = String((companies[i] && companies[i].name) || '').trim();
    if (n) prod.push(n);
  }
  if (prod.length) facts.productionCompanies = prod;

  var langs = Array.isArray(json.spoken_languages) ? json.spoken_languages : [];
  var spoken = [];
  for (var li = 0; li < langs.length; li++) {
    var L = langs[li] || {};
    var ln = String(L.english_name || L.name || '').trim();
    if (ln) spoken.push(ln);
  }
  if (spoken.length) facts.spokenLanguages = spoken;

  if (media === 'movie') {
    var runtime = Number(json.runtime);
    if (runtime > 0) facts.runtimeMinutes = runtime;
    var release = String(json.release_date || '').trim();
    if (release) facts.releaseDate = release.substring(0, 10);
    var budget = Number(json.budget);
    if (budget > 0) facts.budget = budget;
    var revenue = Number(json.revenue);
    if (revenue > 0) facts.revenue = revenue;
  } else {
    var epRuntime = Array.isArray(json.episode_run_time)
      ? json.episode_run_time
      : [];
    if (epRuntime.length && Number(epRuntime[0]) > 0) {
      facts.runtimeMinutes = Number(epRuntime[0]);
    }
    var first = String(json.first_air_date || '').trim();
    if (first) facts.releaseDate = first.substring(0, 10);
    var last = String(json.last_air_date || '').trim();
    if (last) facts.lastAirDate = last.substring(0, 10);
    var seasons = Number(json.number_of_seasons);
    if (seasons > 0) facts.seasonCount = seasons;
    var episodes = Number(json.number_of_episodes);
    if (episodes > 0) facts.episodeCount = episodes;
    var networks = Array.isArray(json.networks) ? json.networks : [];
    var nets = [];
    for (var ni = 0; ni < networks.length; ni++) {
      var nn = String((networks[ni] && networks[ni].name) || '').trim();
      if (nn) nets.push(nn);
    }
    if (nets.length) facts.networks = nets;
    var creators = Array.isArray(json.created_by) ? json.created_by : [];
    var created = [];
    for (var ci = 0; ci < creators.length; ci++) {
      var cn = String((creators[ci] && creators[ci].name) || '').trim();
      if (cn) created.push(cn);
    }
    if (created.length) facts.creators = created;
  }
  return facts;
}

function hubTmdbParseBackdrops(json) {
  var images = json && json.images;
  var list = images && Array.isArray(images.backdrops) ? images.backdrops : [];
  var out = [];
  for (var i = 0; i < list.length && out.length < 12; i++) {
    var path = list[i] && list[i].file_path;
    var url = hubTmdbAbsArt(path, 'w1280');
    if (url) out.push(url);
  }
  return out;
}

function hubApplyTmdbHit(meta, hit) {
  if (!meta || !hit || !hit.id) return meta;
  meta.ids = Object.assign({}, meta.ids || {}, { tmdb: String(hit.id) });
  if (hit.imdb) {
    meta.ids.imdb = String(hit.imdb);
  }
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
  if (hit.overview && !String(meta.description || '').trim()) {
    meta.description = String(hit.overview);
  }
  if (hit.rating != null && !(Number(meta.rating) > 0)) {
    meta.rating = Number(hit.rating);
  }
  if (hit.premiereDate && !String(meta.premiereDate || '').trim()) {
    meta.premiereDate = String(hit.premiereDate);
  }
  if (
    hit.premiereDate &&
    hubIsFutureIsoDate(hit.premiereDate) &&
    !String(meta.status || '').trim()
  ) {
    meta.status = 'NOT_YET_RELEASED';
  }
  if (Array.isArray(hit.cast) && hit.cast.length) meta.cast = hit.cast;
  if (Array.isArray(hit.crew) && hit.crew.length) meta.crew = hit.crew;
  if (Array.isArray(hit.trailers) && hit.trailers.length) {
    meta.trailers = hit.trailers;
  }
  if (hit.facts && typeof hit.facts === 'object') meta.facts = hit.facts;
  if (Array.isArray(hit.backdrops) && hit.backdrops.length) {
    meta.backdrops = hit.backdrops;
  }
  if (Array.isArray(hit.recommendations) && hit.recommendations.length) {
    meta.recommendations = hit.recommendations;
  }
  if (Array.isArray(hit.genres) && hit.genres.length && !meta.genres) {
    meta.genres = hit.genres;
  } else if (
    Array.isArray(hit.genres) &&
    hit.genres.length &&
    Array.isArray(meta.genres) &&
    !meta.genres.length
  ) {
    meta.genres = hit.genres;
  }
  meta._hubTmdbEnriched = true;
  delete meta.paint;
  delete meta.meta;
  return hubPaintHero(meta);
}

function hubEnrichPreferType(meta) {
  var prefer = String(meta.tmdbMediaType || '').toLowerCase();
  if (prefer === 'movie' || prefer === 'tv') return prefer;
  if (prefer === 'tvseries' || prefer === 'anime') return 'tv';
  var fmt = String(meta.badge || '').toUpperCase();
  if (fmt === 'MOVIE' || fmt === 'FILM' || fmt === 'HOLLYWOOD') return 'movie';
  if (fmt === 'TV' || fmt === 'SERIES' || fmt === 'TVSERIES' || fmt === 'ANIME') {
    return 'tv';
  }
  if (String(meta.type || '').toLowerCase() === 'movie') return 'movie';
  return 'tv';
}

function hubEnrichMetaTmdbId(meta) {
  if (!meta || !meta.ids) return 0;
  var raw = meta.ids.tmdb != null ? meta.ids.tmdb : meta.ids.TMDB;
  var n = Number(raw);
  return n > 0 ? n : 0;
}

function hubTmdbHitFromDetails(json, media, details) {
  if (!json || !json.id) return null;
  var poster = hubTmdbAbsArt(json.poster_path, 'w500');
  var backdrop = hubTmdbAbsArt(json.backdrop_path, 'w1280');
  var logo = hubTmdbPickTitleLogo(json.images);
  var name = String(
    media === 'movie' ? json.title || '' : json.name || '',
  );
  var overview = String(json.overview || '').trim();
  var rating = Number(json.vote_average);
  var date = String(
    media === 'movie' ? json.release_date || '' : json.first_air_date || '',
  );
  var ext = json.external_ids || {};
  var imdb = String(ext.imdb_id || '').trim();
  var genres = [];
  if (Array.isArray(json.genres)) {
    for (var gi = 0; gi < json.genres.length; gi++) {
      var gn = String((json.genres[gi] && json.genres[gi].name) || '').trim();
      if (gn) genres.push(gn);
    }
  }
  var hit = {
    id: Number(json.id),
    mediaType: media,
    name: name,
    year: date.length >= 4 ? Number(date.slice(0, 4)) || null : null,
    premiereDate: hubParseIsoDate(date),
    poster: poster || null,
    backdrop: backdrop || null,
    logo: logo || null,
    overview: overview || null,
    rating: rating > 0 ? rating : null,
    imdb: imdb || null,
    genres: genres,
  };
  if (details) {
    hit.cast = hubTmdbParseCast(json);
    hit.crew = hubTmdbParseCrew(json);
    hit.trailers = hubTmdbParseTrailers(json);
    hit.facts = hubTmdbParseFacts(json, media);
    hit.backdrops = hubTmdbParseBackdrops(json);
    hit.recommendations = hubTmdbParseRecommendations(json, media);
  }
  return hit;
}

function hubTmdbById(ctx, id, preferType, details) {
  var tid = Number(id);
  if (!(tid > 0)) return Promise.resolve(null);
  var primary = preferType === 'movie' ? 'movie' : 'tv';
  var secondary = primary === 'movie' ? 'tv' : 'movie';
  var cfg = hubConfig(ctx, {});
  var key = String(cfg.apiKey || '').trim();
  if (!key) return Promise.resolve(null);
  var append = details
    ? 'external_ids,images,credits,videos,recommendations'
    : 'external_ids,images';

  function fetchOne(media) {
    var url =
      'https://api.themoviedb.org/3/' +
      media +
      '/' +
      tid +
      '?api_key=' +
      encodeURIComponent(key) +
      '&append_to_response=' +
      append +
      (details ? '&include_image_language=en,null' : '');
    return ctx
      .fetch(url)
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (json) {
        return hubTmdbHitFromDetails(json, media, !!details);
      })
      .catch(function () {
        return null;
      });
  }

  return fetchOne(primary).then(function (hit) {
    return hit || fetchOne(secondary);
  });
}

function hubTmdbEpisodeStillUrl(path) {
  return hubTmdbAbsArt(path, 'w300');
}

function hubTmdbSeasonEpisodeMap(ctx, tvId, season) {
  var cfg = hubConfig(ctx, {});
  var key = String(cfg.apiKey || '').trim();
  if (!key || !(Number(tvId) > 0) || !(Number(season) > 0)) {
    return Promise.resolve({});
  }
  var url =
    'https://api.themoviedb.org/3/tv/' +
    Number(tvId) +
    '/season/' +
    Number(season) +
    '?api_key=' +
    encodeURIComponent(key);
  return ctx
    .fetch(url)
    .then(function (res) {
      if (!res.ok) return {};
      return res.json();
    })
    .then(function (json) {
      var out = {};
      var eps = json && Array.isArray(json.episodes) ? json.episodes : [];
      for (var i = 0; i < eps.length; i++) {
        var e = eps[i] || {};
        var n = Number(e.episode_number);
        if (!(n > 0)) continue;
        out[n] = {
          still: e.still_path ? hubTmdbEpisodeStillUrl(e.still_path) : '',
          name: String(e.name || '').trim(),
          overview: String(e.overview || '').trim(),
          air_date: hubParseIsoDate(e.air_date),
          aired: e.air_date ? !hubIsFutureIsoDate(e.air_date) : undefined,
        };
      }
      return out;
    })
    .catch(function () {
      return {};
    });
}

function hubIsGenericEpisodeTitle(title) {
  return /^Episode\s+\d+$/i.test(String(title || '').trim());
}

function hubEnrichMetaVideos(ctx, meta, hit) {
  if (!meta || !hit || !hit.id) return Promise.resolve(meta);
  if (String(hit.mediaType || '').toLowerCase() === 'movie') {
    return Promise.resolve(meta);
  }
  var videos = Array.isArray(meta.videos) ? meta.videos : [];
  if (!videos.length) return Promise.resolve(meta);

  var seasonSet = {};
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    if (!v || typeof v !== 'object') continue;
    var season = Number(v.season) > 0 ? Number(v.season) : 1;
    seasonSet[season] = true;
  }
  var seasonNums = Object.keys(seasonSet).map(Number).filter(function (n) {
    return n > 0;
  });
  if (!seasonNums.length) return Promise.resolve(meta);

  return Promise.all(
    seasonNums.map(function (season) {
      return hubTmdbSeasonEpisodeMap(ctx, hit.id, season);
    }),
  ).then(function (maps) {
    var epBySeason = {};
    for (var si = 0; si < seasonNums.length; si++) {
      epBySeason[seasonNums[si]] = maps[si] || {};
    }
    for (var vi = 0; vi < videos.length; vi++) {
      var vid = videos[vi];
      if (!vid || typeof vid !== 'object') continue;
      var s = Number(vid.season) > 0 ? Number(vid.season) : 1;
      var ep = Number(vid.episode) > 0 ? Number(vid.episode) : vi + 1;
      var extras = (epBySeason[s] || {})[ep];
      if (!extras) continue;
      if (!String(vid.thumbnail || '').trim() && extras.still) {
        vid.thumbnail = extras.still;
      }
      if (
        extras.name &&
        (!String(vid.title || '').trim() ||
          hubIsGenericEpisodeTitle(vid.title))
      ) {
        vid.title = extras.name;
      }
      if (!String(vid.overview || '').trim() && extras.overview) {
        vid.overview = extras.overview;
      }
      if (!String(vid.airDate || vid.air_date || '').trim() && extras.air_date) {
        vid.airDate = extras.air_date;
      }
      if (vid.aired == null && extras.air_date) {
        vid.aired = extras.aired !== false && !hubIsFutureIsoDate(extras.air_date);
      }
    }
    return meta;
  });
}

function hubTmdbFetchImdb(ctx, media, id) {
  var cfg = hubConfig(ctx, {});
  var key = String(cfg.apiKey || '').trim();
  var mid = Number(id);
  var kind = String(media || '').toLowerCase();
  if (!key || !(mid > 0) || (kind !== 'movie' && kind !== 'tv')) {
    return Promise.resolve('');
  }
  var url =
    'https://api.themoviedb.org/3/' +
    kind +
    '/' +
    mid +
    '/external_ids?api_key=' +
    encodeURIComponent(key);
  return ctx
    .fetch(url)
    .then(function (res) {
      if (!res.ok) return '';
      return res.json();
    })
    .then(function (json) {
      return String((json && json.imdb_id) || '').trim();
    })
    .catch(function () {
      return '';
    });
}

function hubTmdbAttachImdb(ctx, meta, hit) {
  if (!meta || !hit || !hit.id) return Promise.resolve(meta);
  if (meta.ids && meta.ids.imdb) return Promise.resolve(meta);
  if (hit.imdb) {
    meta.ids = Object.assign({}, meta.ids || {}, { imdb: String(hit.imdb) });
    return Promise.resolve(meta);
  }
  var media = String(hit.mediaType || meta.tmdbMediaType || 'tv').toLowerCase();
  return hubTmdbFetchImdb(ctx, media, hit.id).then(function (imdb) {
    if (imdb) {
      meta.ids = Object.assign({}, meta.ids || {}, { imdb: imdb });
    }
    return meta;
  });
}

function hubEnrichTmdb(ctx, items, limit, opts) {
  if (!Array.isArray(items) || !items.length) return Promise.resolve(items || []);
  var details = !!(opts && opts.details);
  var n = Number(limit) > 0 ? Number(limit) : items.length;
  var head = items.slice(0, n);
  var tail = items.slice(n);
  return Promise.all(
    head.map(function (meta) {
      var prefer = hubEnrichPreferType(meta);
      var yearBit = String(meta.releaseInfo || '').split(' • ')[0];
      var year = Number(yearBit) || 0;
      var existingId = hubEnrichMetaTmdbId(meta);
      var start = existingId
        ? hubTmdbById(ctx, existingId, prefer, details)
        : Promise.resolve(null);
      return start.then(function (hit) {
        function finish(applied, matchedHit) {
          if (!applied || !matchedHit || !matchedHit.id) {
            return Promise.resolve(applied);
          }
          return hubEnrichMetaVideos(ctx, applied, matchedHit).then(
            function (withVideos) {
              return hubTmdbAttachImdb(ctx, withVideos, matchedHit);
            },
          );
        }
        if (hit) return finish(hubApplyTmdbHit(meta, hit), hit);
        return hubTmdbMatch(ctx, {
          title: hubTmdbSearchTitle(meta),
          year: year,
          type: prefer,
        }).then(function (matched) {
          if (!matched || !matched.id) return finish(meta, null);
          return hubTmdbById(
            ctx,
            matched.id,
            matched.mediaType || prefer,
            details,
          ).then(function (full) {
            return finish(hubApplyTmdbHit(meta, full || matched), full || matched);
          });
        });
      });
    }),
  ).then(function (enriched) {
    return enriched.concat(tail);
  });
}

function hubIptvEnrichDetailsPayload(meta) {
  var recs =
    meta && Array.isArray(meta.recommendations) ? meta.recommendations.slice() : [];
  if (meta && Array.isArray(meta.recommendations)) {
    delete meta.recommendations;
  }
  var data = { meta: meta };
  if (recs.length) {
    data.rails = {
      recommendations: { title: 'More Like This', items: recs },
    };
  }
  return data;
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

