var SPECS = {
  addonBase: 'https://stremio.vadapav.mov',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var addonBase = String(cfg.addonBase || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
  };
  var isTv = ctx.type === 'tv';
  var imdbId = ctx.imdbId ? String(ctx.imdbId) : '';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';

  var targetIds = [];
  if (imdbId && imdbId.indexOf('tt') === 0) targetIds.push(imdbId);
  if (tmdbId) targetIds.push('tmdb:' + tmdbId);
  if (!targetIds.length) return Promise.resolve([]);

  function endpointFor(id) {
    if (isTv) {
      var s = ctx.season || 1;
      var e = ctx.episode || 1;
      return addonBase + '/stream/series/' + id + ':' + s + ':' + e + '.json';
    }
    return addonBase + '/stream/movie/' + id + '.json';
  }

  function fetchId(id) {
    return ctx
      .fetch(endpointFor(id), { headers: headers })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.streams)) return [];
        var rows = [];
        data.streams.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var url = item.url != null ? String(item.url) : '';
          if (!url || !/^https?:\/\//i.test(url)) return;
          var rawTitle = item.title != null ? String(item.title) : '';
          var rawName = item.name != null ? String(item.name) : 'vadapav.mov';
          var bh = item.behaviorHints && typeof item.behaviorHints === 'object' ? item.behaviorHints : null;
          var reqHeaders = headers;
          if (
            bh &&
            bh.proxyHeaders &&
            bh.proxyHeaders.request &&
            typeof bh.proxyHeaders.request === 'object'
          ) {
            reqHeaders = Object.assign({}, headers, bh.proxyHeaders.request);
          }
          rows.push({
            url: url,
            name: rawName + (rawTitle ? ' · ' + rawTitle : ''),
            headers: reqHeaders,
          });
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  function tryNext(i, seen) {
    if (i >= targetIds.length) return Promise.resolve([]);
    return fetchId(targetIds[i]).then(function (rows) {
      var out = [];
      (rows || []).forEach(function (r) {
        if (!r || !r.url || seen[r.url]) return;
        seen[r.url] = true;
        out.push(r);
      });
      if (out.length) return out;
      return tryNext(i + 1, seen);
    });
  }

  return tryNext(0, {}).catch(function () {
    return [];
  });
}
