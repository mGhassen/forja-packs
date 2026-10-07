// Arabic hub search — pack-owned (RFC-109).
// Larozaa search is loose (one shared word matches), so walk a few result
// pages and rank title matches first.

function arabicSearchNorm(title) {
  return arabicCleanShowTitle(arabicCleanMovieTitle(title))
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function arabicSearchScore(title, query) {
  var t = arabicSearchNorm(title);
  var q = arabicSearchNorm(query);
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.indexOf(q) === 0) return 80;
  if (t.indexOf(q) >= 0) return 60;
  var parts = q.split(' ').filter(Boolean);
  var hit = 0;
  for (var i = 0; i < parts.length; i++) {
    if (t.indexOf(parts[i]) >= 0) hit++;
  }
  if (parts.length && hit === parts.length) return 40;
  return hit > 0 ? 10 + hit : 0;
}

function arabicSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  var limit = arabicLimitOf(params, 40);
  // Host search is single-shot — cap the walk so a broad query stays cheap.
  var maxPages = 4;
  var path = '/search.php?keywords=' + encodeURIComponent(q);
  var byKey = {};
  var order = [];

  function bestScore() {
    var best = 0;
    for (var i = 0; i < order.length; i++) {
      var s = arabicSearchScore(byKey[order[i]].name, q);
      if (s > best) best = s;
    }
    return best;
  }

  function walk(page) {
    return arabicCardList(ctx, cfg, path, page, { group: true }).then(
      function (got) {
        for (var i = 0; i < got.items.length; i++) {
          var m = got.items[i];
          var key = (m.badge === 'MOVIE' ? 'm:' : 's:') + arabicSearchNorm(m.name);
          if (byKey[key]) continue;
          byKey[key] = m;
          order.push(key);
        }
        if (!got.hasMore || page >= maxPages || bestScore() >= 80) return null;
        return walk(page + 1);
      },
    );
  }

  return walk(1)
    .then(function () {
      var scored = order.map(function (key, idx) {
        return {
          meta: byKey[key],
          score: arabicSearchScore(byKey[key].name, q),
          idx: idx,
        };
      });
      scored.sort(function (a, b) {
        return b.score - a.score || a.idx - b.idx;
      });
      var out = [];
      for (var i = 0; i < scored.length && out.length < limit; i++) {
        out.push(scored[i].meta);
      }
      return hubItems('search', out, { maxAge: 300 }, {
        pageSize: limit,
        hasMore: false,
      });
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}
