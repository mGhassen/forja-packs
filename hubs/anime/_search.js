// Anime hub search — pack-owned (RFC-109).

var ANIME_HELPER_POOL = 64;

function anilistSearch(ctx, cfg, params) {
  return anilistPage(ctx, cfg, params)
    .then(function (items) {
      var perPage =
        Number(params.limit) > 0
          ? Number(params.limit)
          : Number(cfg.perPage) || 24;
      return hubItems(
        'search',
        items,
        { maxAge: 900, swr: 3600 },
        { pageSize: perPage },
      );
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}

function anilistHelperExcludeSet(params) {
  var seen = {};
  var raw = (params && params.exclude) || [];
  if (!Array.isArray(raw)) return seen;
  for (var i = 0; i < raw.length; i++) {
    var t = String(raw[i] || '').trim().toLowerCase();
    if (t) seen[t] = true;
  }
  return seen;
}

function anilistHelperRoundRobin(lists, seen, max) {
  var queues = [];
  for (var i = 0; i < lists.length; i++) {
    queues.push(Array.isArray(lists[i]) ? lists[i].slice() : []);
  }
  var out = [];
  var progress = true;
  while (progress && out.length < max) {
    progress = false;
    for (var q = 0; q < queues.length; q++) {
      while (queues[q].length) {
        var title = String(queues[q].shift() || '').trim();
        if (!title) continue;
        var key = title.toLowerCase();
        if (seen[key]) continue;
        seen[key] = true;
        out.push(title);
        progress = true;
        break;
      }
      if (out.length >= max) break;
    }
  }
  return out;
}

function anilistHelperTitleItems(titles) {
  var items = [];
  for (var i = 0; i < titles.length; i++) {
    var t = String(titles[i] || '').trim();
    if (!t) continue;
    items.push({ id: 'helper:' + i, type: 'query', name: t });
  }
  return hubItems('search_helpers', items, { maxAge: 900, swr: 3600 });
}

function anilistHelperTitlesFromMedia(list) {
  var out = [];
  var rows = Array.isArray(list) ? list : [];
  for (var i = 0; i < rows.length; i++) {
    var meta = anilistMeta(rows[i]);
    if (meta && meta.name) out.push(meta.name);
  }
  return out;
}

function anilistHelperPage(ctx, cfg, sort) {
  var query =
    'query ($page: Int, $perPage: Int, $sort: [MediaSort]) {' +
    '  Page(page: $page, perPage: $perPage) {' +
    '    media(type: ANIME, isAdult: false, sort: $sort) {' +
    ANILIST_CARD_FIELDS +
    '    }' +
    '  }' +
    '}';
  return anilistQuery(ctx, cfg, query, {
    page: 1,
    perPage: 24,
    sort: sort,
  }).then(function (data) {
    var media = (data && data.Page && data.Page.media) || [];
    return anilistHelperTitlesFromMedia(media);
  });
}

function anilistSearchHelpersIdle(ctx, cfg, params) {
  var seen = anilistHelperExcludeSet(params);
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : ANIME_HELPER_POOL;
  return Promise.all([
    anilistHelperPage(ctx, cfg, ['TRENDING_DESC']),
    anilistHelperPage(ctx, cfg, ['POPULARITY_DESC']),
    anilistHelperPage(ctx, cfg, ['SCORE_DESC']),
  ])
    .then(function (lists) {
      return anilistHelperTitleItems(
        anilistHelperRoundRobin(lists, seen, max),
      );
    })
    .catch(function () {
      return anilistHelperTitleItems([]);
    });
}

function anilistHelperParseSeed(params) {
  var seed = params && params.seed;
  if (!seed || typeof seed !== 'object') return null;
  var ids = seed.ids || {};
  var anilist = Number(ids.anilist || 0);
  if (!(anilist > 0)) {
    var id = String(seed.id || '');
    var m = id.match(/^anilist:(\d+)/);
    if (m) anilist = Number(m[1]);
    else if (seed.open && seed.open.id) anilist = Number(seed.open.id);
  }
  if (!(anilist > 0)) return null;
  return {
    id: anilist,
    name: String(seed.name || '').trim(),
  };
}

function anilistSearchHelpersContextual(ctx, cfg, params, seed) {
  var seen = anilistHelperExcludeSet(params);
  if (seed.name) seen[seed.name.toLowerCase()] = true;
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : ANIME_HELPER_POOL;
  var query =
    'query ($id: Int) {' +
    '  Media(id: $id, type: ANIME) {' +
    '    id title { romaji english native userPreferred }' +
    '    genres' +
    '    recommendations(page: 1, perPage: 24, sort: [RATING_DESC]) {' +
    '      nodes { mediaRecommendation { ' +
    ANILIST_CARD_FIELDS +
    ' } }' +
    '    }' +
    '  }' +
    '}';
  return anilistQuery(ctx, cfg, query, { id: seed.id })
    .then(function (data) {
      var media = data && data.Media ? data.Media : null;
      if (!media) return anilistSearchHelpersIdle(ctx, cfg, params);
      var recs = anilistRecommendationsFromMedia(media);
      var recTitles = [];
      for (var i = 0; i < recs.length; i++) {
        if (recs[i] && recs[i].name) recTitles.push(recs[i].name);
      }
      var genres = Array.isArray(media.genres) ? media.genres : [];
      var genreFetches = [];
      for (var g = 0; g < genres.length && g < 2; g++) {
        genreFetches.push(
          anilistPage(ctx, cfg, {
            limit: 24,
            filter: { op: 'eq', field: 'genre', value: genres[g] },
          }).then(
            function (items) {
              var titles = [];
              for (var j = 0; j < items.length; j++) {
                if (items[j] && items[j].name) titles.push(items[j].name);
              }
              return titles;
            },
            function () {
              return [];
            },
          ),
        );
      }
      return Promise.all(genreFetches).then(function (genreLists) {
        var lists = [recTitles].concat(genreLists);
        var titles = anilistHelperRoundRobin(lists, seen, max);
        if (titles.length) return anilistHelperTitleItems(titles);
        return anilistSearchHelpersIdle(ctx, cfg, params);
      });
    })
    .catch(function () {
      return anilistSearchHelpersIdle(ctx, cfg, params);
    });
}

function anilistSearchHelpers(ctx, cfg, params) {
  var seed = anilistHelperParseSeed(params);
  if (seed) return anilistSearchHelpersContextual(ctx, cfg, params, seed);
  return anilistSearchHelpersIdle(ctx, cfg, params);
}
