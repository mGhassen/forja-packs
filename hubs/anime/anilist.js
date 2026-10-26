// AniList anime hub — layout / rail / search / details (protocol 1).
// Row order matches the pre-CatalogShell Anime hub.

var ANILIST_DEFAULTS = {
  graphql: 'https://graphql.anilist.co',
  // Offline AniList catalog — raced when graphql.anilist.co is down/hanging.
  graphqlMirrors: ['https://graphql.aniraku.tech/'],
  perPage: 24,
};

// Shared cooldown across extract runs in the same engine isolate.
var _anilistCooldownUntilMs = 0;

// Season-chain cache (AniList Media id → ordered season spine).
var _anilistSeasonsById = {};
var _anilistSeasonsMediaById = {};
var _ANILIST_SEASONS_CACHE_MAX = 80;

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

// Keep franchise links; drop CHARACTER / ADAPTATION / SOURCE / SAME_UNIVERSE.
var ANILIST_RELATION_TYPES = {
  SIDE_STORY: true,
  SUMMARY: true,
  ALTERNATIVE: true,
  SPIN_OFF: true,
  SEQUEL: true,
  PREQUEL: true,
  PARENT: true,
  COMPILATION: true,
  CONTAINS: true,
  OTHER: true,
};

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

// AniList streamingEpisodes is a recent window (titles like "Episode 130 - …"),
// not a full 1..N list. Parse real numbers; pad to episodes / nextAiring.
function anilistParseEpisodeNumber(title) {
  var t = String(title || '').trim();
  if (!t) return 0;
  var m =
    t.match(/\bEpisode\s+(\d+)\b/i) ||
    t.match(/\bEp\.?\s*(\d+)\b/i) ||
    t.match(/#\s*(\d+)\b/) ||
    t.match(/\bE(\d+)\b/i);
  if (!m) return 0;
  var n = Number(m[1]);
  return n > 0 ? n : 0;
}

function anilistVideosFromMedia(m) {
  var isoByEp = anilistAiringIsoByEpisode(m);
  var stream = Array.isArray(m.streamingEpisodes) ? m.streamingEpisodes : [];
  var known = {};
  var maxKnown = 0;
  var parsed = 0;
  var i;
  for (i = 0; i < stream.length; i++) {
    var ep = stream[i] || {};
    var num = anilistParseEpisodeNumber(ep.title);
    if (!(num > 0)) continue;
    parsed++;
    known[num] = {
      title: String(ep.title || '').trim(),
      thumbnail: anilistAbsUrl(ep.thumbnail || ''),
    };
    if (num > maxKnown) maxKnown = num;
  }
  // Titles without numbers — keep old index map so short lists still work.
  if (parsed === 0) {
    for (i = 0; i < stream.length; i++) {
      var raw = stream[i] || {};
      var fb = i + 1;
      known[fb] = {
        title: String(raw.title || '').trim(),
        thumbnail: anilistAbsUrl(raw.thumbnail || ''),
      };
      if (fb > maxKnown) maxKnown = fb;
    }
  }
  for (var airKey in isoByEp) {
    if (!Object.prototype.hasOwnProperty.call(isoByEp, airKey)) continue;
    var airEp = Number(airKey);
    if (airEp > maxKnown) maxKnown = airEp;
  }
  var total = Number(m.episodes) || 0;
  var next = m && m.nextAiringEpisode;
  var nextEp = next && Number(next.episode) > 0 ? Number(next.episode) : 0;
  var nextAt = next ? Number(next.airingAt) : 0;
  var nextAhead =
    nextEp > 0 && (!(nextAt > 0) || nextAt * 1000 > Date.now());
  var count = total;
  if (maxKnown > count) count = maxKnown;
  if (nextEp > 0) {
    var through = nextAhead ? nextEp - 1 : nextEp;
    if (through > count) count = through;
    // Include the upcoming episode when it is the next slot.
    if (nextEp > count && nextEp - count <= 2) count = nextEp;
  }
  if (count <= 0 && nextEp > 0) count = nextEp;
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

function anilistRelationLabel(type) {
  switch (String(type || '')) {
    case 'SIDE_STORY':
      return 'Side Story';
    case 'SUMMARY':
      return 'Summary';
    case 'ALTERNATIVE':
      return 'Alternative';
    case 'SPIN_OFF':
      return 'Spin-off';
    case 'SEQUEL':
      return 'Sequel';
    case 'PREQUEL':
      return 'Prequel';
    case 'PARENT':
      return 'Parent';
    case 'COMPILATION':
      return 'Compilation';
    case 'CONTAINS':
      return 'Contains';
    case 'OTHER':
      return 'Other';
    default:
      return String(type || '').replace(/_/g, ' ');
  }
}

function anilistTrimSeasonsCache(map) {
  var keys = Object.keys(map);
  if (keys.length <= _ANILIST_SEASONS_CACHE_MAX) return;
  var drop = keys.length - _ANILIST_SEASONS_CACHE_MAX;
  for (var i = 0; i < drop; i++) delete map[keys[i]];
}

function anilistStartKey(node) {
  var d = node && node.startDate;
  if (!d || typeof d !== 'object') return 0;
  var y = Number(d.year) || 0;
  var m = Number(d.month) || 0;
  var day = Number(d.day) || 0;
  return y * 10000 + m * 100 + day;
}

function anilistCanWalkSeasonNode(node) {
  if (!node || String(node.type || '') !== 'ANIME') return false;
  var fmt = String(node.format || '').toUpperCase();
  if (fmt === 'TV' || fmt === 'TV_SHORT') return true;
  // Bridge: film between TV cours (Youjo Senki).
  if (fmt === 'MOVIE') return true;
  // Multi-ep ONA cour — not 1-ep specials (One Piece → MONSTERS).
  if (fmt === 'ONA') {
    var eps = node.episodes;
    return !(typeof eps === 'number') || eps > 1;
  }
  return false;
}

function anilistIsSeasonEntry(node) {
  var fmt = String((node && node.format) || '').toUpperCase();
  if (fmt === 'TV' || fmt === 'TV_SHORT') return true;
  if (fmt === 'ONA') {
    var eps = node.episodes;
    return !(typeof eps === 'number') || eps > 1;
  }
  return false;
}

function anilistWalkRank(node) {
  var fmt = String((node && node.format) || '').toUpperCase();
  if (fmt === 'TV' || fmt === 'TV_SHORT') return 0;
  if (fmt === 'ONA') return 1;
  if (fmt === 'MOVIE') return 2;
  return 9;
}

function anilistWalkNeighbors(media) {
  var wanted = { PREQUEL: true, SEQUEL: true, PARENT: true };
  var edges =
    media &&
    media.relations &&
    Array.isArray(media.relations.edges)
      ? media.relations.edges
      : [];
  var scored = [];
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i] || {};
    var type = String(e.relationType || '');
    if (!wanted[type]) continue;
    var node = e.node;
    if (!anilistCanWalkSeasonNode(node)) continue;
    var id = Number(node.id);
    if (!(id > 0)) continue;
    scored.push({ id: id, rank: anilistWalkRank(node) });
  }
  scored.sort(function (a, b) {
    return a.rank - b.rank;
  });
  return scored.map(function (s) {
    return s.id;
  });
}

var ANILIST_SEASONS_FIELDS =
  'id title { romaji english } format episodes status type ' +
  'coverImage { large extraLarge } startDate { year month day } ' +
  'relations { edges { relationType(version: 2) node { ' +
  'id type format episodes status title { romaji english } ' +
  'coverImage { large extraLarge } startDate { year month day } } } }';

// BFS PREQUEL/SEQUEL/PARENT spine. Movies bridge but are not season chips.
// Returns ordered list of season Media maps (TV / TV_SHORT / multi-ep ONA).
function anilistGetSeasons(ctx, cfg, anilistId) {
  var cached = _anilistSeasonsById[anilistId];
  if (cached) return Promise.resolve(cached);

  var query =
    'query ($id: Int) { Media(id: $id, type: ANIME) { ' +
    ANILIST_SEASONS_FIELDS +
    ' } }';
  var fetched = {};

  function fetchMedia(id) {
    if (fetched[id]) return Promise.resolve(fetched[id]);
    var mem = _anilistSeasonsMediaById[id];
    if (mem) {
      fetched[id] = mem;
      return Promise.resolve(mem);
    }
    return anilistQuery(ctx, cfg, query, { id: id })
      .then(function (data) {
        var media = data && data.Media;
        if (!media || !media.id) return null;
        fetched[id] = media;
        anilistTrimSeasonsCache(_anilistSeasonsMediaById);
        _anilistSeasonsMediaById[id] = media;
        return media;
      })
      .catch(function () {
        return null;
      });
  }

  return fetchMedia(anilistId).then(function (seed) {
    if (!seed) return [];

    var queue = [anilistId];
    var seen = {};
    seen[anilistId] = true;

    function step() {
      if (!queue.length) {
        var seasons = [];
        Object.keys(seen).forEach(function (key) {
          var media = fetched[Number(key)];
          if (media && anilistIsSeasonEntry(media)) seasons.push(media);
        });
        seasons.sort(function (a, b) {
          var ka = anilistStartKey(a);
          var kb = anilistStartKey(b);
          if (ka !== kb) return ka - kb;
          return Number(a.id) - Number(b.id);
        });
        if (!seasons.length) seasons = [seed];
        anilistTrimSeasonsCache(_anilistSeasonsById);
        _anilistSeasonsById[anilistId] = seasons;
        for (var si = 0; si < seasons.length; si++) {
          _anilistSeasonsById[Number(seasons[si].id)] = seasons;
        }
        return seasons;
      }
      var id = queue.shift();
      return fetchMedia(id).then(function (media) {
        if (media) {
          var neighbors = anilistWalkNeighbors(media);
          for (var ni = 0; ni < neighbors.length; ni++) {
            var n = neighbors[ni];
            if (seen[n]) continue;
            seen[n] = true;
            queue.push(n);
          }
        }
        return step();
      });
    }

    return step();
  });
}

function anilistSeasonsPayload(seasons, currentId) {
  if (!Array.isArray(seasons) || seasons.length <= 1) return null;
  var out = [];
  for (var i = 0; i < seasons.length; i++) {
    var m = seasons[i];
    var id = Number(m.id);
    if (!(id > 0)) continue;
    var row = {
      number: out.length + 1,
      id: 'anilist:' + id,
      label: 'Season ' + (out.length + 1),
    };
    if (id === Number(currentId)) row.selected = true;
    out.push(row);
  }
  return out.length > 1 ? out : null;
}

function anilistSeasonChainIdSet(seasons) {
  var set = {};
  if (!Array.isArray(seasons)) return set;
  for (var i = 0; i < seasons.length; i++) {
    var id = Number(seasons[i] && seasons[i].id);
    if (id > 0) set[id] = true;
  }
  return set;
}

function anilistRelatedFromMedia(m, preferred, excludeIds) {
  var edges =
    m &&
    m.relations &&
    Array.isArray(m.relations.edges)
      ? m.relations.edges
      : [];
  var exclude = excludeIds || {};
  var out = [];
  var seen = {};
  var typeRank = {
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
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i] || {};
    var type = String(e.relationType || '');
    if (!ANILIST_RELATION_TYPES[type]) continue;
    var node = e.node;
    if (!node || String(node.type || 'ANIME') !== 'ANIME') continue;
    var fmt = String(node.format || '').toUpperCase();
    if (!fmt || !ANILIST_RELATION_FORMATS[fmt]) continue;
    var id = Number(node.id);
    if (!(id > 0) || seen[id] || exclude[id]) continue;
    seen[id] = true;
    var meta = anilistMeta(node, preferred);
    if (!meta) continue;
    // Host paints badge; format chips are stripped — relation label stays.
    meta.badge = anilistRelationLabel(type);
    meta._relationRank = typeRank[type] != null ? typeRank[type] : 99;
    out.push(meta);
  }
  out.sort(function (a, b) {
    var ra = a._relationRank != null ? a._relationRank : 99;
    var rb = b._relationRank != null ? b._relationRank : 99;
    if (ra !== rb) return ra - rb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  for (var j = 0; j < out.length; j++) delete out[j]._relationRank;
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

function anilistGraphqlEndpoints(cfg, skipPrimary) {
  var primary = String(
    (cfg && cfg.graphql) || ANILIST_DEFAULTS.graphql || '',
  ).trim();
  var mirrors =
    (cfg && cfg.graphqlMirrors) || ANILIST_DEFAULTS.graphqlMirrors || [];
  var out = [];
  var seen = {};
  function add(u) {
    u = String(u || '').trim();
    if (!u || seen[u]) return;
    seen[u] = true;
    out.push(u);
  }
  if (!skipPrimary) add(primary);
  for (var i = 0; i < mirrors.length; i++) add(mirrors[i]);
  return out;
}

function anilistIsOutageMessage(msg, errObj) {
  msg = String(msg || '');
  if (/temporarily disabled/i.test(msg)) return true;
  if (/stability issues/i.test(msg)) return true;
  if (/too many requests/i.test(msg) || /\b429\b/.test(msg)) return true;
  if (errObj && Number(errObj.status) === 403) return true;
  return false;
}

function anilistShouldFailoverStatus(status) {
  if (status === 403 || status === 429) return true;
  if (status === 502 || status === 503 || status === 504) return true;
  return status >= 500 || status === 0;
}

// One POST → data or reject. Treats AniList "temporarily disabled" as failure.
function anilistFetchOnce(ctx, url, headers, body) {
  return ctx.fetch(url, { method: 'POST', headers: headers, body: body }).then(
    function (res) {
      if (anilistShouldFailoverStatus(res.status) || !res.ok) {
        if (res.status === 429) anilistArmCooldown(res);
        throw new Error('anilist HTTP ' + res.status + ' @ ' + url);
      }
      return res.json().then(function (json) {
        if (json && json.errors && json.errors.length) {
          var err0 = json.errors[0] || {};
          var msg = String(err0.message || '');
          if (anilistIsOutageMessage(msg, err0)) {
            if (/too many requests/i.test(msg) || /\b429\b/.test(msg)) {
              anilistArmCooldown(res);
            }
            throw new Error(msg || 'anilist outage @ ' + url);
          }
          throw new Error(msg || 'anilist error');
        }
        if (!json || !json.data) {
          throw new Error('anilist empty @ ' + url);
        }
        return { url: url, data: json.data };
      });
    },
  );
}

// Race primary + mirrors. First valid payload wins — AniList hang must not block.
function anilistQuery(ctx, cfg, query, variables) {
  var now = Date.now();
  var cooling = now < _anilistCooldownUntilMs;
  var primary = String(
    (cfg && cfg.graphql) || ANILIST_DEFAULTS.graphql || '',
  ).trim();
  // On AniList 429 cooldown, skip primary and use mirrors only.
  var endpoints = anilistGraphqlEndpoints(cfg, cooling);
  if (!endpoints.length) {
    if (cooling) {
      var waitSec = Math.max(1, Math.ceil((_anilistCooldownUntilMs - now) / 1000));
      return Promise.reject(
        new Error('anilist rate limited; retry in ' + waitSec + 's'),
      );
    }
    return Promise.reject(new Error('anilist: no graphql endpoint'));
  }
  // AniList Cloudflare rejects bare POSTs (fake 403 "temporarily disabled").
  // Browser / Apollo send anilist.co Referer; Origin alone is not enough.
  var headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://anilist.co',
    Referer: 'https://anilist.co/',
  };
  var body = JSON.stringify({ query: query, variables: variables || {} });

  return new Promise(function (resolve, reject) {
    var left = endpoints.length;
    var lastErr = null;
    var won = false;

    function onFail(err) {
      lastErr = err;
      left -= 1;
      if (!won && left <= 0) {
        reject(lastErr || new Error('anilist unreachable'));
      }
    }

    function onWin(hit) {
      if (won) return;
      won = true;
      if (hit.url && hit.url !== primary) {
        console.warn('[anilist] failover → ' + hit.url);
      }
      resolve(hit.data);
    }

    for (var i = 0; i < endpoints.length; i++) {
      anilistFetchOnce(ctx, endpoints[i], headers, body).then(onWin, onFail);
    }
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
    var recommendations = anilistRecommendationsFromMedia(media, preferred);

    return anilistGetSeasons(ctx, cfg, id).then(function (seasons) {
      var chainIds = anilistSeasonChainIdSet(seasons);
      var related = anilistRelatedFromMedia(media, preferred, chainIds);
      var payload = {
        meta: meta,
        layout: {
          fullBleedBackdrop: true,
          firstBodyRowFraction: 0.65,
        },
      };
      var seasonsPayload = anilistSeasonsPayload(seasons, id);
      if (seasonsPayload) payload.seasons = seasonsPayload;
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
          id: 'languages',
          field: 'languages',
          style: 'multiselect',
          source: 'pluginLanguages',
          settingsField: 'streamLanguages',
          types: ['anime'],
          default: [],
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
