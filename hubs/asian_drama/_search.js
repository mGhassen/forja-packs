// Asian Drama hub search — pack-owned (RFC-109).

var ASIAN_HELPER_POOL = 64;

function kisskhSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  return kisskhList(
    ctx,
    cfg,
    '/DramaList/Search?q=' + encodeURIComponent(q) + '&type=0',
    params.limit,
  )
    .then(function (items) {
      return hubItems('search', items, { maxAge: 300 });
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}

function kisskhHelperExcludeSet(params) {
  var seen = {};
  var raw = (params && params.exclude) || [];
  if (!Array.isArray(raw)) return seen;
  for (var i = 0; i < raw.length; i++) {
    var t = String(raw[i] || '').trim().toLowerCase();
    if (t) seen[t] = true;
  }
  return seen;
}

function kisskhHelperRoundRobin(lists, seen, max) {
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

function kisskhHelperTitleItems(titles) {
  var items = [];
  for (var i = 0; i < titles.length; i++) {
    var t = String(titles[i] || '').trim();
    if (!t) continue;
    items.push({ id: 'helper:' + i, type: 'query', name: t });
  }
  return hubItems('search_helpers', items, { maxAge: 600, swr: 3600 });
}

function kisskhHelperTitlesFromItems(items) {
  var out = [];
  var list = Array.isArray(items) ? items : [];
  for (var i = 0; i < list.length; i++) {
    var name = String((list[i] && list[i].name) || '').trim();
    if (name) out.push(name);
  }
  return out;
}

function kisskhSearchHelpersIdle(ctx, cfg, params) {
  var seen = kisskhHelperExcludeSet(params);
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : ASIAN_HELPER_POOL;
  return Promise.all([
    kisskhList(ctx, cfg, KISSKH_RAILS.trending, 24),
    kisskhList(ctx, cfg, KISSKH_RAILS.most_viewed, 24),
    kisskhList(ctx, cfg, KISSKH_RAILS.latest, 24),
    kisskhList(ctx, cfg, KISSKH_RAILS.spotlight, 24),
  ])
    .then(function (lists) {
      var titleLists = [];
      for (var i = 0; i < lists.length; i++) {
        titleLists.push(kisskhHelperTitlesFromItems(lists[i]));
      }
      return kisskhHelperTitleItems(
        kisskhHelperRoundRobin(titleLists, seen, max),
      );
    })
    .catch(function () {
      return kisskhHelperTitleItems([]);
    });
}

function kisskhHelperParseSeed(params) {
  var seed = params && params.seed;
  if (!seed || typeof seed !== 'object') return null;
  var ids = seed.ids || {};
  var tmdb = Number(ids.tmdb || 0);
  var type = String(seed.tmdbMediaType || '').trim();
  if (type !== 'movie' && type !== 'tv') type = 'tv';
  var name = String(seed.name || '').trim();
  if (!(tmdb > 0) && !name) return null;
  return { id: tmdb, type: type, name: name };
}

function kisskhHelperTitlesFromTmdbHit(hit) {
  var out = [];
  var recs =
    hit && Array.isArray(hit.recommendations) ? hit.recommendations : [];
  for (var i = 0; i < recs.length; i++) {
    var name = String((recs[i] && recs[i].name) || '').trim();
    if (name) out.push(name);
  }
  return out;
}

function kisskhSearchHelpersContextual(ctx, cfg, params, seed) {
  var seen = kisskhHelperExcludeSet(params);
  if (seed.name) seen[seed.name.toLowerCase()] = true;
  var max =
    Number(params.limit) > 0 ? Number(params.limit) : ASIAN_HELPER_POOL;

  function finishFromHit(hit) {
    var titles = kisskhHelperRoundRobin(
      [kisskhHelperTitlesFromTmdbHit(hit)],
      seen,
      max,
    );
    if (titles.length) return kisskhHelperTitleItems(titles);
    return kisskhSearchHelpersIdle(ctx, cfg, params);
  }

  if (seed.id > 0 && typeof hubTmdbById === 'function') {
    return hubTmdbById(ctx, seed.id, seed.type || 'tv', true)
      .then(finishFromHit)
      .catch(function () {
        return kisskhSearchHelpersIdle(ctx, cfg, params);
      });
  }

  if (seed.name && typeof hubTmdbMatch === 'function') {
    return hubTmdbMatch(ctx, { title: seed.name, type: seed.type || 'tv' })
      .then(function (hit) {
        var tid = hit && (hit.ids && hit.ids.tmdb ? hit.ids.tmdb : hit.id);
        if (!tid) return kisskhSearchHelpersIdle(ctx, cfg, params);
        var type =
          String(
            (hit && (hit.tmdbMediaType || hit.mediaType || hit.type)) || 'tv',
          ) === 'movie'
            ? 'movie'
            : 'tv';
        return hubTmdbById(ctx, tid, type, true).then(finishFromHit);
      })
      .catch(function () {
        return kisskhSearchHelpersIdle(ctx, cfg, params);
      });
  }

  return kisskhSearchHelpersIdle(ctx, cfg, params);
}

function kisskhSearchHelpers(ctx, cfg, params) {
  var seed = kisskhHelperParseSeed(params);
  if (seed) return kisskhSearchHelpersContextual(ctx, cfg, params, seed);
  return kisskhSearchHelpersIdle(ctx, cfg, params);
}
