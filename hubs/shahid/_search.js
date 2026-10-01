// Shahid hub search — pack-owned (RFC-109).

function shahidSearchTab(ctx, auth, country, language, tab, q) {
  var body = {
    name: q,
    pageNumber: 0,
    pageSize: 30,
  };
  return ctx
    .fetch(
      SHAHID_PROXY +
      '/v2.1/search/' +
      tab +
      '?' +
      apiQs(body, country),
      { headers: shahidHeaders(auth.sessionId, auth.jwt, language) },
    )
    .then(function (res) {
      if (!res.ok) return [];
      return res.json().then(function (j) {
        return mapProducts((j && j.productList) || []);
      });
    })
    .catch(function () {
      return [];
    });
}

function shahidSearch(ctx) {
  var cfg = hubConfig(ctx, SHAHID_DEFAULTS);
  var params = hubParams(ctx);
  var q = String(params.query || params.q || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  return ensureAuth(ctx, cfg).then(function (auth) {
    var country = sessionCountry(auth);
    return Promise.all([
      shahidSearchTab(ctx, auth, country, cfg.language, 'TV_SHOWS', q),
      shahidSearchTab(ctx, auth, country, cfg.language, 'MOVIES', q),
    ]).then(function (parts) {
      var seen = {};
      var items = [];
      for (var p = 0; p < parts.length; p++) {
        var list = parts[p] || [];
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (!m || seen[m.id]) continue;
          seen[m.id] = true;
          items.push(m);
        }
      }
      return hubItems('search', items);
    });
  });
}
