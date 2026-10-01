var SPECS = {
  config:
    'W3siaWQiOiJkZWZhdWx0IiwibmFtZSI6Ik1lZ2FTb3VyY2UgZGVmYXVsdCIsInVybCI6Imh0dHBzOi8vZ2l0aHViLmNvbS96b3JldS9tZWdhc291cmNlX3NjcmFwZXJzL3Jhdy9yZWZzL2hlYWRzL21haW4vZGVmYXVsdF9zY3JhcGVyLnB5IiwiZGVzY3JpcHRpb24iOiJEZWZhdWx0IHNjcmFwZXIgaG9zdGVkIG9uIEdpdEh1Yi4ifV0',
  origin: 'https://megasource.wasmer.app',
  tmdbKey: 'b3556f3b206e16f82df4d1f6fd4545e6',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var configToken = String(cfg.config || '');
  var baseUrl = origin + '/' + configToken;
  var tmdbKey = String(cfg.tmdbKey || '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json',
  };
  var isTv = ctx.type === 'tv';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';

  function resolveImdb() {
    var existing = ctx.imdbId ? String(ctx.imdbId) : '';
    if (existing && existing.indexOf('tt') === 0) return Promise.resolve(existing);
    if (!tmdbId || !tmdbKey) return Promise.resolve('');
    var path = isTv
      ? 'https://tmdb.forjahq.xyz/3/tv/' +
        encodeURIComponent(tmdbId) +
        '/external_ids?api_key=' +
        encodeURIComponent(tmdbKey)
      : 'https://tmdb.forjahq.xyz/3/movie/' +
        encodeURIComponent(tmdbId) +
        '?api_key=' +
        encodeURIComponent(tmdbKey);
    return ctx
      .fetch(path, { headers: headers })
      .then(function (r) {
        if (!r.ok) return '';
        return r.json();
      })
      .then(function (data) {
        if (!data) return '';
        if (data.imdb_id) return String(data.imdb_id);
        if (data.external_ids && data.external_ids.imdb_id) {
          return String(data.external_ids.imdb_id);
        }
        return '';
      })
      .catch(function () {
        return '';
      });
  }

  return resolveImdb()
    .then(function (imdbId) {
      if (!imdbId || imdbId.indexOf('tt') !== 0) return [];
      var path = isTv
        ? '/stream/series/' +
          imdbId +
          ':' +
          (ctx.season || 1) +
          ':' +
          (ctx.episode || 1) +
          '.json'
        : '/stream/movie/' + imdbId + '.json';
      return ctx.fetch(baseUrl + path, { headers: headers }).then(function (r) {
        if (!r.ok) return [];
        return r.json().then(function (data) {
          if (!data || !Array.isArray(data.streams)) return [];
          var out = [];
          data.streams.forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            var streamUrl = st.url != null ? String(st.url) : '';
            if (!streamUrl) return;
            var stTitle = st.title != null ? String(st.title) : 'Stream';
            var reqHeaders = null;
            if (
              st.behaviorHints &&
              st.behaviorHints.proxyHeaders &&
              st.behaviorHints.proxyHeaders.request &&
              typeof st.behaviorHints.proxyHeaders.request === 'object'
            ) {
              reqHeaders = {};
              Object.keys(st.behaviorHints.proxyHeaders.request).forEach(function (k) {
                reqHeaders[k] = String(st.behaviorHints.proxyHeaders.request[k]);
              });
            }
            var row = {
              url: streamUrl,
              name: 'MegaSource · ' + stTitle,
            };
            if (reqHeaders) row.headers = reqHeaders;
            out.push(row);
          });
          return out;
        });
      });
    })
    .catch(function () {
      return [];
    });
}
