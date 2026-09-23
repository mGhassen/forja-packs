var SPECS = {
  serviceOrigin: 'https://st.111477.xyz',
  streamHost: 'https://a.111477.xyz/',
  sort: 'file-desc',
  limit: 3,
  tmdbKey: '',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var serviceOrigin = String(cfg.serviceOrigin || '').replace(/\/$/, '');
  var streamHost = String(cfg.streamHost || 'https://a.111477.xyz/');
  var sort = cfg.sort != null ? String(cfg.sort) : 'file-desc';
  var limit = cfg.limit != null ? Number(cfg.limit) : 3;
  var tmdbKey = cfg.tmdbKey ? String(cfg.tmdbKey) : '';
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

  function base64UrlEncode(str) {
    var b64;
    try {
      b64 = btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      b64 = btoa(str);
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateManifestBaseUrl() {
    var config = streamHost.trim();
    if (config.charAt(config.length - 1) !== '/') config += '/';
    if (sort && sort !== 'none') config += '::sort=' + sort;
    if (limit > 0 && limit !== 5) config += '::limit=' + limit;
    if (tmdbKey) config += '::tmdb=' + tmdbKey;
    return serviceOrigin + '/config/' + base64UrlEncode(config);
  }

  var addonBase = generateManifestBaseUrl();

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
          var rawName = item.name != null ? String(item.name) : '111477';
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
            name: (rawName || '111477') + (rawTitle ? ' · ' + rawTitle : ''),
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
