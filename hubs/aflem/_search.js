// Aflem hub search — pack-owned (RFC-109).

function brstejSearchScore(title, query) {
  var t = brstejNormTitle(title);
  var q = brstejNormTitle(query);
  if (!t || !q) return 0;
  if (t === q) return 100;
  if (t.indexOf(q) === 0) return 80;
  if (t.indexOf(q) >= 0) return 60;
  var parts = q.split(' ').filter(Boolean);
  if (!parts.length) return 0;
  var hit = 0;
  for (var i = 0; i < parts.length; i++) {
    if (t.indexOf(parts[i]) >= 0) hit++;
  }
  if (hit === parts.length) return 40;
  if (hit > 0) return 10 + hit;
  return 0;
}

function brstejMergeSearchPage(episodes, byKey, order) {
  for (var i = 0; i < (episodes || []).length; i++) {
    var ep = episodes[i];
    if (!ep || !ep.name) continue;
    var key = brstejNormTitle(ep.name);
    if (!key) continue;
    if (!byKey[key]) {
      order.push(key);
      byKey[key] = brstejMeta(
        ep.ids.brstej,
        brstejIsMovieTitle(ep.name)
          ? brstejStripMoviePrefix(ep.name)
          : brstejStripPrefix(brstejStripEpisode(ep.name)),
        ep.poster,
        { url: ep.ids.url },
      );
      if (byKey[key] && brstejIsMovieTitle(ep.name)) {
        byKey[key].badge = 'MOVIE';
      }
    }
  }
}

/** Host search is single-shot (no page scroll) — walk upstream pages. */
function brstejSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  var limit = brstejLimitOf(params, 40);
  var base = brstejBase(cfg);
  // Cap walks so a broad query cannot hammer ~3000 result pages.
  var maxPages = Number(params.maxPages) > 0 ? Number(params.maxPages) : 12;
  var byKey = {};
  var order = [];

  function bestScore() {
    var best = 0;
    for (var i = 0; i < order.length; i++) {
      var m = byKey[order[i]];
      if (!m) continue;
      var s = brstejSearchScore(m.name, q);
      if (s > best) best = s;
    }
    return best;
  }

  function fetchPage(page) {
    var url =
      base +
      '/search.php?keywords=' +
      encodeURIComponent(q) +
      '&page=' +
      page;
    return brstejFetchHtml(ctx, url, base + '/').then(function (got) {
      var origin = brstejOrigin(got.url) || base;
      var series = brstejParseSerieCards(ctx, got.html, origin);
      var items = series.length
        ? series
        : brstejParseEpisodeCards(ctx, got.html, origin);
      return {
        items: items,
        more: brstejHtmlHasNextPage(got.html, page),
      };
    });
  }

  function walk(page) {
    return fetchPage(page).then(function (got) {
      var episodes = (got && got.items) || [];
      brstejMergeSearchPage(episodes, byKey, order);
      var lastPage = !got.more && episodes.length < 24;
      // Strong title hit (exact / prefix) → stop early.
      if (lastPage || page >= maxPages || bestScore() >= 80) {
        return null;
      }
      return walk(page + 1);
    });
  }

  return walk(1).then(function () {
    var scored = [];
    for (var i = 0; i < order.length; i++) {
      var meta = byKey[order[i]];
      if (!meta) continue;
      scored.push({
        meta: meta,
        score: brstejSearchScore(meta.name, q),
        idx: i,
      });
    }
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    });
    var out = [];
    for (i = 0; i < scored.length && out.length < limit; i++) {
      out.push(scored[i].meta);
    }
    return hubItems('search', out, { maxAge: 300 }, {
      pageSize: limit,
      hasMore: false,
    });
  });
}
