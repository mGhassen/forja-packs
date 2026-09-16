// Home hub search — pack-owned product (RFC-109).
// Host only opens search chrome and calls action `search` / `search_helpers`.
// Relies on tmdb.js helpers (tmdbStructuredSearch, hubConfig, …) at call time.
//
// Results are never strict-empty: page 1 soft-fills with related (or trending).
// Scroll loads up to 3 pages; pages 2–3 are relatedness hops (new seed each page),
// not the same TMDB multi query again.

var HOME_SEARCH_MAX_PAGES = 3;
var HOME_HELPER_POOL = 64;

function homeSearchMetaKey(meta) {
  if (!meta) return '';
  var id = meta.ids && meta.ids.tmdb;
  if (id == null || id === '') return '';
  return String(meta.type || '') + ':' + String(id);
}

function homeSearchExcludeIds(params) {
  var seen = {};
  var raw = (params && params.excludeIds) || [];
  if (!Array.isArray(raw)) return seen;
  for (var i = 0; i < raw.length; i++) {
    var k = String(raw[i] || '').trim().toLowerCase();
    if (k) seen[k] = true;
  }
  return seen;
}

function homeSearchPaintEnvelope(painted, pageSize, hasMore) {
  return hubItems(
    'search',
    painted,
    { maxAge: 300 },
    { pageSize: pageSize, hasMore: hasMore },
  )[0];
}

function homeSearchPaintList(list) {
  var painted = [];
  for (var i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    painted.push(hubPaintPoster(list[i]));
  }
  return painted;
}

function homeSearchMetasFromJson(cfg, json, forcedType, seen, limit) {
  var rows = (json && json.results) || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row && row.media_type === 'person') continue;
    var meta = tmdbMeta(cfg, row, forcedType || '');
    if (!meta) continue;
    var key = homeSearchMetaKey(meta).toLowerCase();
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(meta);
    if (out.length >= limit) break;
  }
  return out;
}

function homeSearchRelatedMetas(ctx, cfg, seed, seen, limit) {
  if (!seed || !(limit > 0)) return Promise.resolve([]);
  var type = seed.type;
  var id = seed.id;
  return Promise.all([
    homeHelperSafeJson(
      tmdbGet(ctx, cfg, '/' + type + '/' + id + '/recommendations', {
        page: 1,
      }),
    ),
    homeHelperSafeJson(
      tmdbGet(ctx, cfg, '/' + type + '/' + id + '/similar', { page: 1 }),
    ),
  ]).then(function (jsons) {
    var queues = [
      homeSearchMetasFromJson(cfg, jsons[0], type, {}, 40),
      homeSearchMetasFromJson(cfg, jsons[1], type, {}, 40),
    ];
    var out = [];
    var progress = true;
    while (progress && out.length < limit) {
      progress = false;
      for (var q = 0; q < queues.length; q++) {
        while (queues[q].length) {
          var meta = queues[q].shift();
          var key = homeSearchMetaKey(meta).toLowerCase();
          if (!key || seen[key]) continue;
          seen[key] = true;
          out.push(meta);
          progress = true;
          break;
        }
        if (out.length >= limit) break;
      }
    }
    return out;
  });
}

function homeSearchTrendingMetas(ctx, cfg, seen, limit) {
  return Promise.all([
    homeHelperSafeJson(tmdbGet(ctx, cfg, '/trending/movie/day', { page: 1 })),
    homeHelperSafeJson(tmdbGet(ctx, cfg, '/trending/tv/day', { page: 1 })),
    homeHelperSafeJson(tmdbGet(ctx, cfg, '/movie/popular', { page: 1 })),
    homeHelperSafeJson(tmdbGet(ctx, cfg, '/tv/popular', { page: 1 })),
  ]).then(function (jsons) {
    var queues = [
      homeSearchMetasFromJson(cfg, jsons[0], 'movie', {}, 20),
      homeSearchMetasFromJson(cfg, jsons[1], 'tv', {}, 20),
      homeSearchMetasFromJson(cfg, jsons[2], 'movie', {}, 20),
      homeSearchMetasFromJson(cfg, jsons[3], 'tv', {}, 20),
    ];
    var out = [];
    var progress = true;
    while (progress && out.length < limit) {
      progress = false;
      for (var q = 0; q < queues.length; q++) {
        while (queues[q].length) {
          var meta = queues[q].shift();
          var key = homeSearchMetaKey(meta).toLowerCase();
          if (!key || seen[key]) continue;
          seen[key] = true;
          out.push(meta);
          progress = true;
          break;
        }
        if (out.length >= limit) break;
      }
    }
    return out;
  });
}

function homeSearch(ctx, cfg, params) {
  var p = params || {};
  var q = String(p.query || '').trim();
  var hasFilter = p.filter != null && p.filter !== '';
  if (!q && !hasFilter) {
    return Promise.resolve(hubItems('search', [])[0]);
  }

  var page = Number(p.page) > 0 ? Number(p.page) : 1;
  var pageSize =
    Number(p.limit) > 0
      ? Number(p.limit)
      : Number((cfg && cfg.pageSize) || 20) || 20;
  if (page > HOME_SEARCH_MAX_PAGES) {
    return Promise.resolve(
      homeSearchPaintEnvelope([], pageSize, false),
    );
  }

  if (page > 1) {
    return homeSearchRelatedPage(ctx, cfg, p, page, pageSize);
  }

  var searchParams = Object.assign({}, p, { limit: pageSize });
  var seen = homeSearchExcludeIds(p);
  return tmdbStructuredSearch(ctx, cfg, searchParams).then(function (items) {
    var hits = Array.isArray(items) ? items.slice() : [];
    var seedMeta = hits.length ? hits[0] : null;
    var out = [];
    for (var i = 0; i < hits.length; i++) {
      var key = homeSearchMetaKey(hits[i]).toLowerCase();
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(hits[i]);
    }

    var padNeed = pageSize - out.length;
    var seed = homeHelperParseSeed({ seed: seedMeta }) ||
      homeHelperParseSeed(p);

    function finish(list) {
      var painted = homeSearchPaintList(list);
      var hasSeed = !!(seed || homeHelperParseSeed({ seed: list[0] }));
      var hasMore =
        page < HOME_SEARCH_MAX_PAGES && hasSeed && painted.length > 0;
      return homeSearchPaintEnvelope(painted, pageSize, hasMore);
    }

    if (padNeed <= 0) return Promise.resolve(finish(out));

    if (seed) {
      return homeSearchRelatedMetas(ctx, cfg, seed, seen, padNeed).then(
        function (related) {
          for (var r = 0; r < related.length; r++) out.push(related[r]);
          if (out.length > 0) return finish(out);
          return homeSearchTrendingMetas(ctx, cfg, seen, pageSize).then(finish);
        },
      );
    }

    return homeSearchTrendingMetas(ctx, cfg, seen, pageSize).then(function (
      trending,
    ) {
      for (var t = 0; t < trending.length; t++) out.push(trending[t]);
      return finish(out);
    });
  });
}

function homeSearchRelatedPage(ctx, cfg, params, page, pageSize) {
  var seen = homeSearchExcludeIds(params);
  var seed = homeHelperParseSeed(params);
  if (!seed) {
    return Promise.resolve(homeSearchPaintEnvelope([], pageSize, false));
  }
  return homeSearchRelatedMetas(ctx, cfg, seed, seen, pageSize).then(function (
    related,
  ) {
    var painted = homeSearchPaintList(related);
    var hasMore =
      page < HOME_SEARCH_MAX_PAGES && painted.length > 0;
    return homeSearchPaintEnvelope(painted, pageSize, hasMore);
  });
}

function homeHelperExcludeSet(params) {
  var seen = {};
  var raw = (params && params.exclude) || [];
  if (!Array.isArray(raw)) return seen;
  for (var i = 0; i < raw.length; i++) {
    var t = String(raw[i] || '').trim().toLowerCase();
    if (t) seen[t] = true;
  }
  return seen;
}

function homeHelperRoundRobin(lists, seen, max) {
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

function homeHelperTitleItems(titles) {
  var items = [];
  for (var i = 0; i < titles.length; i++) {
    var t = String(titles[i] || '').trim();
    if (!t) continue;
    items.push({ id: 'helper:' + i, type: 'query', name: t });
  }
  return hubItems('search_helpers', items, { maxAge: 600, swr: 3600 })[0];
}

function homeHelperTitlesFromJson(cfg, json, forcedType) {
  var rows = (json && json.results) || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var meta = tmdbMeta(cfg, rows[i], forcedType || '');
    if (meta && meta.name) out.push(meta.name);
  }
  return out;
}

function homeSearchHelpersIdle(ctx, cfg, params) {
  var seen = homeHelperExcludeSet(params);
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : HOME_HELPER_POOL;
  return Promise.all([
    tmdbGet(ctx, cfg, '/trending/movie/day', { page: 1 }),
    tmdbGet(ctx, cfg, '/trending/tv/day', { page: 1 }),
    tmdbGet(ctx, cfg, '/movie/popular', { page: 1 }),
    tmdbGet(ctx, cfg, '/tv/popular', { page: 1 }),
    tmdbGet(ctx, cfg, '/movie/now_playing', { page: 1 }),
    tmdbGet(ctx, cfg, '/tv/on_the_air', { page: 1 }),
    tmdbGet(ctx, cfg, '/movie/top_rated', { page: 1 }),
  ])
    .then(function (lists) {
      var titles = homeHelperRoundRobin(
        [
          homeHelperTitlesFromJson(cfg, lists[0], 'movie'),
          homeHelperTitlesFromJson(cfg, lists[1], 'tv'),
          homeHelperTitlesFromJson(cfg, lists[2], 'movie'),
          homeHelperTitlesFromJson(cfg, lists[3], 'tv'),
          homeHelperTitlesFromJson(cfg, lists[4], 'movie'),
          homeHelperTitlesFromJson(cfg, lists[5], 'tv'),
          homeHelperTitlesFromJson(cfg, lists[6], 'movie'),
        ],
        seen,
        max,
      );
      return homeHelperTitleItems(titles);
    })
    .catch(function () {
      return homeHelperTitleItems([]);
    });
}

function homeHelperParseSeed(params) {
  var seed = params && params.seed;
  if (!seed || typeof seed !== 'object') return null;
  var ids = seed.ids || {};
  var tmdb = Number(ids.tmdb || 0);
  var type = String(
    seed.tmdbMediaType || (seed.open && seed.open.mediaType) || seed.type || '',
  ).trim();
  if (!(tmdb > 0)) {
    var id = String(seed.id || '');
    var m = id.match(/^tmdb:(movie|tv):(\d+)/);
    if (m) {
      type = m[1];
      tmdb = Number(m[2]);
    } else if (seed.open && seed.open.id) {
      tmdb = Number(seed.open.id);
    }
  }
  if (type !== 'movie' && type !== 'tv') {
    type = type === 'series' ? 'tv' : '';
  }
  if (!(tmdb > 0) || (type !== 'movie' && type !== 'tv')) return null;
  return {
    id: tmdb,
    type: type,
    name: String(seed.name || '').trim(),
  };
}

function homeHelperSafeJson(promise) {
  return promise.then(
    function (json) {
      return json || { results: [] };
    },
    function () {
      return { results: [] };
    },
  );
}

function homeSearchHelpersContextual(ctx, cfg, params, seed) {
  var seen = homeHelperExcludeSet(params);
  if (seed.name) seen[seed.name.toLowerCase()] = true;
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : HOME_HELPER_POOL;
  var type = seed.type;
  var id = seed.id;

  return tmdbGet(ctx, cfg, '/' + type + '/' + id, {
    append_to_response: 'credits',
  })
    .then(
      function (details) {
        return details || {};
      },
      function () {
        return {};
      },
    )
    .then(function (details) {
      var genres = Array.isArray(details.genres) ? details.genres : [];
      var genreIds = [];
      for (var i = 0; i < genres.length && genreIds.length < 2; i++) {
        if (genres[i] && genres[i].id) genreIds.push(Number(genres[i].id));
      }
      var dateRaw = String(
        details.release_date || details.first_air_date || '',
      );
      var year = dateRaw.length >= 4 ? Number(dateRaw.substring(0, 4)) : 0;
      var language = String(details.original_language || '').trim();
      var companyId = 0;
      var companies = details.production_companies || [];
      if (companies[0] && companies[0].id) companyId = Number(companies[0].id);
      var networkId = 0;
      var networks = details.networks || [];
      if (networks[0] && networks[0].id) networkId = Number(networks[0].id);
      var personId = 0;
      var credits = details.credits || {};
      var crew = credits.crew || [];
      for (var c = 0; c < crew.length; c++) {
        var job = String((crew[c] && crew[c].job) || '');
        if (
          job === 'Director' ||
          job === 'Creator' ||
          job === 'Executive Producer'
        ) {
          personId = Number(crew[c].id);
          break;
        }
      }
      if (!personId) {
        var created = details.created_by || [];
        if (created[0] && created[0].id) personId = Number(created[0].id);
      }

      var fetches = [
        homeHelperSafeJson(
          tmdbGet(ctx, cfg, '/' + type + '/' + id + '/recommendations', {
            page: 1,
          }),
        ),
        homeHelperSafeJson(
          tmdbGet(ctx, cfg, '/' + type + '/' + id + '/similar', { page: 1 }),
        ),
      ];
      if (genreIds.length) {
        var gq = { with_genres: genreIds.join(','), page: 1 };
        if (year > 0) {
          if (type === 'movie') gq.primary_release_year = year;
          else gq.first_air_date_year = year;
        }
        fetches.push(
          homeHelperSafeJson(
            type === 'tv'
              ? tmdbGet(ctx, cfg, '/discover/tv', gq)
              : tmdbGet(ctx, cfg, '/discover/movie', gq),
          ),
        );
        fetches.push(
          homeHelperSafeJson(
            type === 'tv'
              ? tmdbGet(ctx, cfg, '/discover/tv', {
                  with_genres: genreIds.join(','),
                  page: 1,
                })
              : tmdbGet(ctx, cfg, '/discover/movie', {
                  with_genres: genreIds.join(','),
                  page: 1,
                }),
          ),
        );
        if (language) {
          fetches.push(
            homeHelperSafeJson(
              type === 'tv'
                ? tmdbGet(ctx, cfg, '/discover/tv', {
                    with_genres: genreIds.join(','),
                    with_original_language: language,
                    page: 1,
                  })
                : tmdbGet(ctx, cfg, '/discover/movie', {
                    with_genres: genreIds.join(','),
                    with_original_language: language,
                    page: 1,
                  }),
            ),
          );
        }
      }
      if (personId > 0) {
        fetches.push(
          homeHelperSafeJson(
            type === 'tv'
              ? tmdbGet(ctx, cfg, '/discover/tv', {
                  with_people: personId,
                  page: 1,
                })
              : tmdbGet(ctx, cfg, '/discover/movie', {
                  with_people: personId,
                  page: 1,
                }),
          ),
        );
      }
      if (type === 'tv' && networkId > 0) {
        fetches.push(
          homeHelperSafeJson(
            tmdbGet(ctx, cfg, '/discover/tv', {
              with_networks: networkId,
              page: 1,
            }),
          ),
        );
      }
      if (type === 'movie' && companyId > 0) {
        fetches.push(
          homeHelperSafeJson(
            tmdbGet(ctx, cfg, '/discover/movie', {
              with_companies: companyId,
              page: 1,
            }),
          ),
        );
      }

      return Promise.all(fetches).then(function (jsons) {
        var lists = [];
        for (var j = 0; j < jsons.length; j++) {
          lists.push(homeHelperTitlesFromJson(cfg, jsons[j], type));
        }
        var titles = homeHelperRoundRobin(lists, seen, max);
        if (titles.length) return homeHelperTitleItems(titles);
        return homeSearchHelpersIdle(ctx, cfg, params);
      });
    });
}

function homeSearchHelpers(ctx, cfg, params) {
  var seed = homeHelperParseSeed(params);
  if (seed) return homeSearchHelpersContextual(ctx, cfg, params, seed);
  return homeSearchHelpersIdle(ctx, cfg, params);
}
