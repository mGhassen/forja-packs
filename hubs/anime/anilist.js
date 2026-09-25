// AniList anime hub — layout / rail / search / details (protocol 1).
// Row order matches the pre-CatalogShell Anime hub.

var ANILIST_DEFAULTS = {
  graphql: 'https://graphql.anilist.co',
  perPage: 24,
};

// Shared cooldown across extract runs in the same engine isolate.
var _anilistCooldownUntilMs = 0;

var ANILIST_CARD_FIELDS = [
  'id',
  'idMal',
  'title { romaji english native }',
  'coverImage { extraLarge large }',
  'bannerImage',
  'averageScore',
  'genres',
  'seasonYear',
  'format',
  'episodes',
  'status',
].join(' ');

var ANILIST_MEDIA_FIELDS = [
  ANILIST_CARD_FIELDS,
  'description(asHtml: false)',
].join(' ');

var ANILIST_DETAILS_FIELDS = [
  ANILIST_MEDIA_FIELDS,
  'nextAiringEpisode { episode airingAt }',
  'airingSchedule(perPage: 50) { nodes { episode airingAt } }',
  'streamingEpisodes { title thumbnail }',
  'characters(page: 1, perPage: 16, sort: [ROLE, RELEVANCE, ID]) { edges { ' +
    'role node { name { full } image { large } } } }',
  'staff(page: 1, perPage: 10, sort: [RELEVANCE, ID]) { edges { ' +
    'role node { name { full } image { large } } } }',
  'relations { edges { relationType(version: 2) node { ' +
    ANILIST_CARD_FIELDS +
    ' type } } }',
  // Community "more like this" — not franchise relations.
  'recommendations(page: 1, perPage: 12, sort: [RATING_DESC]) { nodes { ' +
    'rating mediaRecommendation { ' +
    ANILIST_CARD_FIELDS +
    ' type } } }',
].join(' ');

var ANILIST_RELATION_KEEP = {
  SIDE_STORY: 0,
  SUMMARY: 1,
  ALTERNATIVE: 2,
  SPIN_OFF: 3,
  SEQUEL: 4,
  PREQUEL: 5,
  PARENT: 6,
  COMPILATION: 7,
  CONTAINS: 8,
  OTHER: 9,
};

var ANILIST_RELATION_TYPES = Object.keys(ANILIST_RELATION_KEEP);

var ANILIST_RELATION_FORMATS = {
  TV: true,
  TV_SHORT: true,
  MOVIE: true,
  OVA: true,
  ONA: true,
  SPECIAL: true,
};

// AniList seasons: Winter=Dec–Feb (year of Jan/Feb), Spring=Mar–May,
// Summer=Jun–Aug, Fall=Sep–Nov.
function anilistCurrentSeason(now) {
  var d = now || new Date();
  var m = d.getUTCMonth() + 1;
  var y = d.getUTCFullYear();
  if (m === 12) return { season: 'WINTER', seasonYear: y + 1 };
  if (m <= 2) return { season: 'WINTER', seasonYear: y };
  if (m <= 5) return { season: 'SPRING', seasonYear: y };
  if (m <= 8) return { season: 'SUMMER', seasonYear: y };
  return { season: 'FALL', seasonYear: y };
}

var ANILIST_AIRING_FORMATS = {
  TV: true,
  TV_SHORT: true,
  ONA: true,
  OVA: true,
  SPECIAL: true,
  MOVIE: true,
};

// season: true → current AniList season. kind: 'airing' → AiringSchedule window.
// feedFrom: reuse another feed Page alias (same sort/filters) — one GraphQL Page.
// Spotlight stays global TRENDING — season+RELEASING/FINISHED collapses to ~1
// slide (most of the season is NOT_YET_RELEASED) so the hero loops one title.
var ANILIST_RAILS = {
  spotlight: { sort: ['TRENDING_DESC'] },
  trending: { sort: ['TRENDING_DESC'] },
  top_10: { sort: ['TRENDING_DESC'], limit: 10, feedFrom: 'trending' },
  this_season: { sort: ['POPULARITY_DESC'], season: true },
  top_airing: { sort: ['TRENDING_DESC'], status: 'RELEASING' },
  popular: { sort: ['POPULARITY_DESC'] },
  latest_episodes: { kind: 'airing', windowHours: 48, fetchSize: 50 },
  top_rated: { sort: ['SCORE_DESC'] },
  most_favorited: { sort: ['FAVOURITES_DESC'] },
  latest_completed: { sort: ['END_DATE_DESC'], status: 'FINISHED' },
};

var ANILIST_MOODS = [
  { id: 'shonen', label: 'Shōnen', genre: 'Action', icon: 'local_fire_department', accent: '#F97316' },
  { id: 'romance', label: 'Romance', genre: 'Romance', icon: 'favorite', accent: '#EC4899' },
  { id: 'comedy', label: 'Comedy', genre: 'Comedy', icon: 'emoji_emotions', accent: '#FBBF24' },
  { id: 'mystery', label: 'Mystery', genre: 'Mystery', icon: 'psychology', accent: '#8B5CF6' },
  { id: 'thriller', label: 'Thriller', genre: 'Thriller', icon: 'dark_mode', accent: '#64748B' },
  { id: 'fantasy', label: 'Fantasy', genre: 'Fantasy', icon: 'auto_awesome', accent: '#A855F7' },
  { id: 'sliceLife', label: 'Slice of Life', genre: 'Slice of Life', icon: 'wb_sunny', accent: '#06B6D4' },
  { id: 'scifi', label: 'Sci-Fi', genre: 'Sci-Fi', icon: 'rocket_launch', accent: '#3B82F6' },
  { id: 'sports', label: 'Sports', genre: 'Sports', icon: 'sports_soccer', accent: '#22C55E' },
  { id: 'horror', label: 'Horror', genre: 'Horror', icon: 'bedtime', accent: '#7C3AED' },
];

function anilistTitleLang(cfg) {
  var raw = String((cfg && cfg.titleLanguage) || 'romaji')
    .trim()
    .toLowerCase();
  if (raw === 'english' || raw === 'native' || raw === 'romaji') return raw;
  return 'romaji';
}

function anilistTitle(t, preferred) {
  if (!t) return '';
  var pref = String(preferred || 'romaji').trim().toLowerCase();
  var romaji = String(t.romaji || '').trim();
  var english = String(t.english || '').trim();
  var native = String(t.native || '').trim();
  if (pref === 'english') return english || romaji || native;
  if (pref === 'native') return native || romaji || english;
  return romaji || english || native;
}

function anilistTmdbSearchTitle(m) {
  // TMDB match prefers English then romaji — independent of display language.
  if (!m || !m.title) return '';
  var english = String(m.title.english || '').trim();
  var romaji = String(m.title.romaji || '').trim();
  return english || romaji || anilistTitle(m.title, 'romaji');
}

function anilistCardMeta(m) {
  // Year • N eps — no format type (TV / ONA / FILM); that lived on the badge.
  var parts = [];
  if (m.seasonYear) parts.push(String(m.seasonYear));
  if (m.episodes) parts.push(String(m.episodes) + ' eps');
  return parts.join(' • ');
}

function anilistAbsUrl(raw) {
  var u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  return u;
}

function anilistMeta(m, preferred) {
  if (!m || !m.id) return null;
  var name = anilistTitle(m.title, preferred);
  if (!name) return null;
  var cover = m.coverImage || {};
  var ids = { anilist: String(m.id) };
  if (m.idMal) ids.mal = String(m.idMal);
  var searchTitle = anilistTmdbSearchTitle(m);
  if (searchTitle) ids.tmdbSearch = searchTitle;
  var banner = anilistAbsUrl(m.bannerImage || '');
  var poster = anilistAbsUrl(cover.extraLarge || cover.large || '');
  var meta = {
    id: 'anilist:' + m.id,
    type: 'anime',
    name: name,
    poster: poster,
    // Prefer AniList banner for hero; cover fallback matches old bannerOrCover.
    background: banner || poster,
    description: hubStripHtml(m.description),
    releaseInfo: anilistCardMeta(m),
    genres: Array.isArray(m.genres) ? m.genres : [],
    ids: ids,
    open: {
      surface: 'anime',
      id: String(m.id),
      // Host: open.torrentEp → search Title 05 (not SxxExx).
      torrentEp: true,
      extract: {
        resolveType: 'anime',
        panelCategory: 'anime',
        ctx: {
          anilistId: Number(m.id),
          malId: m.idMal ? Number(m.idMal) : undefined,
        },
      },
    },
  };
  if (m.idMal) meta.open.mal = String(m.idMal);
  if (m.averageScore) meta.rating = Number(m.averageScore) / 10;
  if (m.format) meta.badge = String(m.format).replace(/_/g, ' ');
  var fmt = String(m.format || '').toUpperCase();
  if (fmt === 'MOVIE') meta.tmdbMediaType = 'movie';
  else if (fmt) meta.tmdbMediaType = 'tv';
  if (m.status) meta.status = String(m.status);
  if (m.episodes) meta.episodes = Number(m.episodes);
  if (banner) meta.bannerImage = banner;
  return hubPaintPoster(meta);
}

function anilistUnixToIso(unixSeconds) {
  var n = Number(unixSeconds);
  if (!(n > 0)) return '';
  var d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '';
  var y = d.getFullYear();
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return (
    String(y) +
    '-' +
    (m < 10 ? '0' : '') +
    m +
    '-' +
    (day < 10 ? '0' : '') +
    day
  );
}

function anilistAiringIsoByEpisode(m) {
  var nodes =
    m && m.airingSchedule && Array.isArray(m.airingSchedule.nodes)
      ? m.airingSchedule.nodes
      : [];
  var out = {};
  var i;
  for (i = 0; i < nodes.length; i++) {
    var node = nodes[i] || {};
    var ep = Number(node.episode);
    var iso = anilistUnixToIso(node.airingAt);
    if (ep > 0 && iso) out[ep] = iso;
  }
  var next = m && m.nextAiringEpisode;
  if (next) {
    var nextEp = Number(next.episode);
    var nextIso = anilistUnixToIso(next.airingAt);
    if (nextEp > 0 && nextIso) out[nextEp] = nextIso;
  }
  return out;
}

function anilistApplyAir(entry, m, isoByEp) {
  var num = Number(entry.episode);
  var iso = (isoByEp && isoByEp[num]) || '';
  if (iso) entry.airDate = iso;
  var next = m && m.nextAiringEpisode;
  var nextEp = next ? Number(next.episode) : 0;
  var nextAt = next ? Number(next.airingAt) : 0;
  var nextAhead = nextEp > 0 && (!(nextAt > 0) || nextAt * 1000 > Date.now());
  if (nextAhead && num >= nextEp) entry.aired = false;
  else if (iso && hubIsFutureIsoDate(iso)) entry.aired = false;
  return entry;
}

function anilistVideosFromMedia(m) {
  var isoByEp = anilistAiringIsoByEpisode(m);
  var stream = Array.isArray(m.streamingEpisodes) ? m.streamingEpisodes : [];
  var known = {};
  var i;
  for (i = 0; i < stream.length; i++) {
    var ep = stream[i] || {};
    var num = i + 1;
    known[num] = {
      title: String(ep.title || '').trim(),
      thumbnail: anilistAbsUrl(ep.thumbnail || ''),
    };
  }
  var total = Number(m.episodes) || 0;
  var nextEp =
    m.nextAiringEpisode && Number(m.nextAiringEpisode.episode) > 0
      ? Number(m.nextAiringEpisode.episode)
      : 0;
  var count = stream.length > 0 ? stream.length : total;
  if (count <= 0 && nextEp > 0) count = nextEp;
  // Rest of a short season, plus the next episode when it is the one after the list.
  if (total > count && total - count <= 30) count = total;
  if (nextEp > count && nextEp - count <= 2) count = nextEp;
  if (count <= 0) return [];
  var videos = [];
  var j;
  for (j = 1; j <= count; j++) {
    var row = known[j] || {};
    var entry = {
      id: String(j),
      episode: j,
      season: 1,
      title: row.title || 'Episode ' + j,
    };
    if (row.thumbnail) entry.thumbnail = row.thumbnail;
    videos.push(anilistApplyAir(entry, m, isoByEp));
  }
  return videos;
}

function anilistPersonImage(node) {
  if (!node || !node.image) return '';
  return anilistAbsUrl(node.image.large || node.image.medium || '');
}

function anilistCharactersFromMedia(m) {
  var edges =
    m &&
    m.characters &&
    Array.isArray(m.characters.edges)
      ? m.characters.edges
      : [];
  var out = [];
  for (var i = 0; i < edges.length && out.length < 16; i++) {
    var e = edges[i] || {};
    var node = e.node || {};
    var name = String((node.name && node.name.full) || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      character: String(e.role || '').trim().replace(/_/g, ' '),
      profilePath: anilistPersonImage(node),
    });
  }
  return out;
}

function anilistStaffFromMedia(m) {
  var edges =
    m && m.staff && Array.isArray(m.staff.edges) ? m.staff.edges : [];
  var out = [];
  for (var i = 0; i < edges.length && out.length < 10; i++) {
    var e = edges[i] || {};
    var node = e.node || {};
    var name = String((node.name && node.name.full) || '').trim();
    if (!name) continue;
    out.push({
      name: name,
      job: String(e.role || '').trim(),
      profilePath: anilistPersonImage(node),
    });
  }
  return out;
}

function anilistRelatedFromMedia(m, preferred) {
  var edges =
    m &&
    m.relations &&
    Array.isArray(m.relations.edges)
      ? m.relations.edges
      : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i] || {};
    var type = String(e.relationType || '');
    if (ANILIST_RELATION_TYPES.indexOf(type) < 0) continue;
    var node = e.node;
    if (!node || String(node.type || 'ANIME') !== 'ANIME') continue;
    var fmt = String(node.format || '').toUpperCase();
    if (!fmt || !ANILIST_RELATION_FORMATS[fmt]) continue;
    var id = Number(node.id);
    if (!(id > 0) || seen[id]) continue;
    seen[id] = true;
    var meta = anilistMeta(node, preferred);
    if (!meta) continue;
    meta.relationType = type;
    out.push(meta);
  }
  out.sort(function (a, b) {
    var ra = ANILIST_RELATION_KEEP[a.relationType] ?? 99;
    var rb = ANILIST_RELATION_KEEP[b.relationType] ?? 99;
    if (ra !== rb) return ra - rb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return out;
}

function anilistRecommendationsFromMedia(m, preferred) {
  var nodes =
    m &&
    m.recommendations &&
    Array.isArray(m.recommendations.nodes)
      ? m.recommendations.nodes
      : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < nodes.length && out.length < 12; i++) {
    var row = nodes[i] || {};
    var node = row.mediaRecommendation;
    if (!node || String(node.type || 'ANIME') !== 'ANIME') continue;
    var fmt = String(node.format || '').toUpperCase();
    if (!fmt || !ANILIST_RELATION_FORMATS[fmt]) continue;
    var id = Number(node.id);
    if (!(id > 0) || seen[id]) continue;
    seen[id] = true;
    var meta = anilistMeta(node, preferred);
    if (!meta) continue;
    out.push(meta);
  }
  return out;
}

function anilistHeader(res, name) {
  if (!res || !res.headers) return '';
  if (typeof res.headers.get === 'function') {
    return String(res.headers.get(name) || res.headers.get(name.toLowerCase()) || '');
  }
  return String(res.headers[name] || res.headers[name.toLowerCase()] || '');
}

function anilistArmCooldown(res) {
  var retryAfter = 60;
  var raw = anilistHeader(res, 'Retry-After');
  var n = Number(raw);
  if (n > 0 && n < 600) retryAfter = n;
  _anilistCooldownUntilMs = Date.now() + retryAfter * 1000;
}

function anilistQuery(ctx, cfg, query, variables) {
  var now = Date.now();
  if (now < _anilistCooldownUntilMs) {
    var waitSec = Math.max(1, Math.ceil((_anilistCooldownUntilMs - now) / 1000));
    return Promise.reject(
      new Error('anilist rate limited; retry in ' + waitSec + 's'),
    );
  }
  // AniList Cloudflare rejects bare POSTs (fake 403 "temporarily disabled").
  // Browser / Apollo send anilist.co Referer; Origin alone is not enough.
  return ctx
    .fetch(cfg.graphql, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://anilist.co',
        Referer: 'https://anilist.co/',
      },
      body: JSON.stringify({ query: query, variables: variables || {} }),
    })
    .then(function (res) {
      if (res.status === 429) {
        anilistArmCooldown(res);
        throw new Error('anilist HTTP 429');
      }
      if (!res.ok) throw new Error('anilist HTTP ' + res.status);
      return res.json().then(function (json) {
        // Some gateways return 200 + GraphQL 429 body.
        if (json && json.errors && json.errors.length) {
          var msg = String(json.errors[0].message || '');
          if (/too many requests/i.test(msg) || /\b429\b/.test(msg)) {
            anilistArmCooldown(res);
            throw new Error('anilist HTTP 429');
          }
          throw new Error(msg || 'anilist error');
        }
        return json && json.data ? json.data : {};
      });
    });
}

function anilistRailItemsFromList(railId, list, preferred) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var meta = anilistMeta(list[i], preferred);
    if (!meta) continue;
    if (railId === 'spotlight') {
      var st = String(meta.status || '').toUpperCase();
      if (st && st !== 'RELEASING' && st !== 'FINISHED') continue;
    }
    out.push(meta);
  }
  if (railId === 'spotlight' && !out.length) {
    for (var j = 0; j < list.length; j++) {
      var m2 = anilistMeta(list[j], preferred);
      if (m2) out.push(m2);
    }
  }
  var spec = ANILIST_RAILS[railId] || ANILIST_RAILS.trending;
  if (Number(spec.limit) > 0) out = out.slice(0, Number(spec.limit));
  return out;
}

function anilistAiringItemsFromSchedules(schedules, params, limit, preferred) {
  var genre = hubFilterValue(params && params.filter, 'genre');
  var format = hubFilterValue(params && params.filter, 'format');
  var formatNot = hubFilterValue(params && params.filter, 'format_not');
  var genreLc = genre ? String(genre).toLowerCase() : '';
  var out = [];
  var seen = {};
  var list = Array.isArray(schedules) ? schedules : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    var m = row.media;
    if (!m || !m.id || seen[m.id]) continue;
    if (m.isAdult) continue;
    var fmt = String(m.format || '').toUpperCase();
    if (!fmt || !ANILIST_AIRING_FORMATS[fmt]) continue;
    if (format && fmt !== String(format).toUpperCase()) continue;
    if (formatNot && fmt === String(formatNot).toUpperCase()) continue;
    if (genreLc) {
      var genres = Array.isArray(m.genres) ? m.genres : [];
      var hit = false;
      for (var g = 0; g < genres.length; g++) {
        if (String(genres[g] || '').toLowerCase() === genreLc) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
    }
    seen[m.id] = true;
    var meta = anilistMeta(m, preferred);
    if (!meta) continue;
    var ep = Number(row.episode);
    if (ep > 0) {
      meta.releaseInfo = (meta.releaseInfo ? meta.releaseInfo + ' • ' : '') + 'Ep ' + ep;
    }
    out.push(meta);
    if (Number(limit) > 0 && out.length >= Number(limit)) break;
  }
  return out;
}

function anilistMediaArgs(spec) {
  var sort = (spec.sort || ['TRENDING_DESC']).join(', ');
  var status = spec.status ? ', status: ' + spec.status : '';
  var season = spec.season ? ', season: $season, seasonYear: $seasonYear' : '';
  return (
    'type: ANIME, isAdult: false, sort: [' +
    sort +
    ']' +
    status +
    season +
    ', genre: $genre, format: $format, format_not_in: $formatNotIn'
  );
}

function anilistFeedQuery(cfg, params) {
  var perPage = Number(cfg.perPage) || 24;
  var parts = [];
  for (var railId in ANILIST_RAILS) {
    if (!Object.prototype.hasOwnProperty.call(ANILIST_RAILS, railId)) continue;
    var spec = ANILIST_RAILS[railId];
    // Alias rails reuse another Page — do not emit a second GraphQL Page.
    if (spec.feedFrom) continue;
    if (spec.kind === 'airing') {
      var fetchSize = Number(spec.fetchSize) > 0 ? Number(spec.fetchSize) : 50;
      parts.push(
        railId +
          ': Page(page: 1, perPage: ' +
          fetchSize +
          ') { airingSchedules(airingAt_greater: $airFrom, airingAt_lesser: $airTo, notYetAired: false, sort: [TIME_DESC]) { episode airingAt media { ' +
          ANILIST_CARD_FIELDS +
          ' isAdult } } }',
      );
      continue;
    }
    var limit = Number(spec.limit) > 0 ? Number(spec.limit) : perPage;
    parts.push(
      railId +
        ': Page(page: 1, perPage: ' +
        limit +
        ') { media(' +
        anilistMediaArgs(spec) +
        ') { ' +
        ANILIST_CARD_FIELDS +
        ' } }',
    );
  }
  return (
    'query AnilistFeed($genre: String, $format: MediaFormat, $formatNotIn: [MediaFormat], $season: MediaSeason, $seasonYear: Int, $airFrom: Int, $airTo: Int) { ' +
    parts.join(' ') +
    ' }'
  );
}

function anilistFeedVariables(params) {
  var genre = hubFilterValue(params.filter, 'genre');
  var format = hubFilterValue(params.filter, 'format');
  var formatNot = hubFilterValue(params.filter, 'format_not');
  var variables = {};
  if (genre) variables.genre = genre;
  if (format) variables.format = format;
  if (formatNot) variables.formatNotIn = [formatNot];
  var cur = anilistCurrentSeason();
  variables.season = cur.season;
  variables.seasonYear = cur.seasonYear;
  var nowSec = Math.floor(Date.now() / 1000);
  var hours = 48;
  var airSpec = ANILIST_RAILS.latest_episodes;
  if (airSpec && Number(airSpec.windowHours) > 0) {
    hours = Number(airSpec.windowHours);
  }
  variables.airTo = nowSec;
  variables.airFrom = nowSec - hours * 3600;
  return variables;
}

function anilistFeed(ctx, cfg, params) {
  var preferred = anilistTitleLang(cfg);
  return anilistQuery(ctx, cfg, anilistFeedQuery(cfg, params), anilistFeedVariables(params))
    .then(function (data) {
      var rails = {};
      var perPage = Number(cfg.perPage) || 24;
      for (var railId in ANILIST_RAILS) {
        if (!Object.prototype.hasOwnProperty.call(ANILIST_RAILS, railId)) continue;
        var spec = ANILIST_RAILS[railId];
        if (spec.feedFrom) continue;
        var page = data[railId] || {};
        if (spec.kind === 'airing') {
          rails[railId] = anilistAiringItemsFromSchedules(
            page.airingSchedules || [],
            params,
            perPage,
            preferred,
          );
        } else {
          rails[railId] = anilistRailItemsFromList(
            railId,
            page.media || [],
            preferred,
          );
        }
      }
      for (var aliasId in ANILIST_RAILS) {
        if (!Object.prototype.hasOwnProperty.call(ANILIST_RAILS, aliasId)) continue;
        var aliasSpec = ANILIST_RAILS[aliasId];
        if (!aliasSpec.feedFrom) continue;
        var src = rails[aliasSpec.feedFrom] || [];
        var limit = Number(aliasSpec.limit) > 0 ? Number(aliasSpec.limit) : perPage;
        rails[aliasId] = src.slice(0, limit);
      }
      // Evergreen browse — prefer cache over hammering AniList (30–90 req/min).
      return hubOk('feed', { rails: rails }, { maxAge: 900, swr: 3600 });
    });
}

function anilistPage(ctx, cfg, params) {
  var railId = String(params.rail || 'trending');
  var spec = ANILIST_RAILS[railId] || ANILIST_RAILS.trending;
  var preferred = anilistTitleLang(cfg);
  var genre = hubFilterValue(params.filter, 'genre');
  var format = hubFilterValue(params.filter, 'format');
  var formatNot = hubFilterValue(params.filter, 'format_not');
  var perPage = Number(params.limit) > 0
    ? Number(params.limit)
    : Number(spec.limit) > 0
      ? Number(spec.limit)
      : Number(cfg.perPage) || 24;
  var pageNum = Number(params.page) > 0 ? Number(params.page) : 1;

  if (spec.kind === 'airing') {
    var hours = Number(spec.windowHours) > 0 ? Number(spec.windowHours) : 48;
    var nowSec = Math.floor(Date.now() / 1000);
    var fetchSize = Math.max(
      perPage * 2,
      Number(spec.fetchSize) > 0 ? Number(spec.fetchSize) : 50,
    );
    var airQuery =
      'query ($page: Int, $perPage: Int, $airFrom: Int, $airTo: Int) {' +
      ' Page(page: $page, perPage: $perPage) {' +
      '  airingSchedules(airingAt_greater: $airFrom, airingAt_lesser: $airTo, notYetAired: false, sort: [TIME_DESC]) {' +
      '   episode airingAt media { ' +
      ANILIST_CARD_FIELDS +
      ' isAdult }' +
      '  }' +
      ' }' +
      '}';
    return anilistQuery(ctx, cfg, airQuery, {
      page: pageNum,
      perPage: fetchSize,
      airFrom: nowSec - hours * 3600,
      airTo: nowSec,
    }).then(function (data) {
      var schedules = (data.Page && data.Page.airingSchedules) || [];
      return anilistAiringItemsFromSchedules(
        schedules,
        params,
        perPage,
        preferred,
      );
    });
  }

  var query =
    'query ($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $status: MediaStatus, $format: MediaFormat, $formatNotIn: [MediaFormat], $search: String, $season: MediaSeason, $seasonYear: Int) {' +
    ' Page(page: $page, perPage: $perPage) {' +
    '  media(type: ANIME, isAdult: false, sort: $sort, genre: $genre, status: $status, format: $format, format_not_in: $formatNotIn, search: $search, season: $season, seasonYear: $seasonYear) {' +
    ANILIST_CARD_FIELDS +
    '  }' +
    ' }' +
    '}';

  var variables = {
    page: pageNum,
    perPage: perPage,
    sort: spec.sort || ['TRENDING_DESC'],
  };
  if (genre) variables.genre = genre;
  if (format) variables.format = format;
  if (formatNot) variables.formatNotIn = [formatNot];
  if (spec.status) variables.status = spec.status;
  if (spec.season) {
    var cur = anilistCurrentSeason();
    variables.season = cur.season;
    variables.seasonYear = cur.seasonYear;
  }
  var search = String(params.query || '').trim();
  if (search) {
    variables.search = search;
    variables.sort = ['SEARCH_MATCH'];
  }

  return anilistQuery(ctx, cfg, query, variables).then(function (data) {
    var list = (data.Page && data.Page.media) || [];
    return anilistRailItemsFromList(railId, list, preferred);
  });
}

function anilistDetails(ctx, cfg, params) {
  var id = Number(String(params.id || '').split(':').pop());
  if (!id) {
    return Promise.resolve(
      hubFail('details', 'INVALID_PARAMS', 'details needs params.id'),
    );
  }
  var preferred = anilistTitleLang(cfg);
  var query =
    'query ($id: Int) { Media(id: $id, type: ANIME) { ' +
    ANILIST_DETAILS_FIELDS +
    ' } }';
  return anilistQuery(ctx, cfg, query, { id: id }).then(function (data) {
    var media = data.Media;
    var meta = anilistMeta(media, preferred);
    if (!meta) return hubFail('details', 'NOT_FOUND', 'anime ' + id + ' not found');
    var videos = anilistVideosFromMedia(media);
    if (videos.length) meta.videos = videos;
    var characters = anilistCharactersFromMedia(media);
    if (characters.length) meta.cast = characters;
    var staff = anilistStaffFromMedia(media);
    if (staff.length) meta.crew = staff;
    var related = anilistRelatedFromMedia(media, preferred);
    var recommendations = anilistRecommendationsFromMedia(media, preferred);
    var payload = {
      meta: meta,
      layout: {
        fullBleedBackdrop: true,
        firstBodyRowFraction: 0.65,
      },
    };
    var rails = {};
    if (related.length) {
      rails.related = { title: 'Related', items: related };
    }
    if (recommendations.length) {
      rails.recommendations = {
        title: 'More Like This',
        items: recommendations,
      };
    }
    if (Object.keys(rails).length) payload.rails = rails;
    return hubOk('details', payload, { maxAge: 1800, swr: 3600 });
  });
}

function anilistCategoryOptions() {
  return ANILIST_MOODS.map(function (m) {
    return {
      id: m.id,
      label: m.label,
      genre: m.genre,
      filter: { op: 'eq', field: 'genre', value: m.genre },
    };
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var cfg = hubConfig(ctx, ANILIST_DEFAULTS);
  var params = hubParams(ctx);

  if (action === 'layout') {
    return hubOk('layout', anilistLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'filters') {
    return hubOk('filters', {
      menus: [
        {
          id: 'films',
          label: 'Films',
          filter: { op: 'eq', field: 'format', value: 'MOVIE' },
        },
        {
          id: 'series',
          label: 'Series',
          filter: { op: 'eq', field: 'format_not', value: 'MOVIE' },
        },
      ],
      fields: [{ field: 'genre', label: 'Genre', options: anilistCategoryOptions() }],
      play: [
        {
          id: 'audio',
          field: 'category',
          style: 'grouped',
          default: 'sub',
          options: [
            { id: 'sub', label: 'SUB', value: 'sub', icon: 'subtitles' },
            { id: 'dub', label: 'DUB', value: 'dub', icon: 'mic' },
          ],
        },
      ],
    }, { maxAge: 86400 });
  }
  if (action === 'details') {
    return anilistDetails(ctx, cfg, params).catch(function (e) {
      return hubFail('details', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'feed') {
    return anilistFeed(ctx, cfg, params).catch(function (e) {
      return hubFail('feed', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'search') {
    return anilistSearch(ctx, cfg, params);
  }
  if (action === 'search_helpers') {
    return anilistSearchHelpers(ctx, cfg, params).catch(function (e) {
      return hubFail('search_helpers', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action !== 'rail') {
    return hubFail(action, 'INVALID_ACTION', 'anilist has no action ' + action);
  }

  return anilistPage(ctx, cfg, params)
    .then(function (items) {
      var perPage =
        Number(params.limit) > 0
          ? Number(params.limit)
          : Number(cfg.perPage) || 24;
      return hubItems(
        action,
        items,
        { maxAge: 900, swr: 3600 },
        { pageSize: perPage },
      );
    })
    .catch(function (e) {
      return hubFail(action, 'UPSTREAM', e && e.message, true);
    });
}
