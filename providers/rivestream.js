var SPECS = {
  "apiBase": "https://scrapper.rivestream.app",
  "referer": "https://www.rivestream.app/",
  "origin": "https://www.rivestream.app"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var apiBase = String(cfg.apiBase || '').replace(/\/$/, '');
  var referer = cfg.referer || 'https://www.rivestream.app/';
  var origin = cfg.origin || 'https://www.rivestream.app';
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: referer,
    Origin: origin,
    Accept: 'application/json, text/plain, */*',
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: referer,
    Origin: origin,
  };
  var fallbackProviders = [
    'apex',
    'pulse',
    'solstice',
    'quasar',
    'primevids',
    'flowcast',
    'citadel',
    'guru',
    'asiacloud',
    'horizon',
    'hindicast',
  ];
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  function getProviders() {
    return ctx
      .fetch(apiBase + '/api/providers', { headers: headers })
      .then(function (r) {
        if (!r.ok) return fallbackProviders;
        return r.json().then(function (pData) {
          if (pData && Array.isArray(pData.data)) {
            return pData.data.map(function (e) {
              return String(e);
            });
          }
          if (Array.isArray(pData)) {
            return pData.map(function (e) {
              return String(e);
            });
          }
          return fallbackProviders;
        });
      })
      .catch(function () {
        return fallbackProviders;
      });
  }

  function fetchProvider(provider, cbValue, seen) {
    var cbParam =
      provider === 'primevids' || provider === 'citadel' ? '&cb=' + cbValue : '';
    var endpoint;
    if (isTv) {
      var s = ctx.season || 1;
      var e = ctx.episode || 1;
      endpoint =
        apiBase +
        '/api/provider?provider=' +
        encodeURIComponent(provider) +
        '&id=' +
        encodeURIComponent(tmdbId) +
        '&season=' +
        s +
        '&episode=' +
        e +
        cbParam;
    } else {
      endpoint =
        apiBase +
        '/api/provider?provider=' +
        encodeURIComponent(provider) +
        '&id=' +
        encodeURIComponent(tmdbId) +
        cbParam;
    }

    return ctx
      .fetch(endpoint, { headers: headers })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object' || !data.data || typeof data.data !== 'object') {
          return [];
        }
        var sources = data.data.sources;
        if (!Array.isArray(sources) || !sources.length) return [];
        var rows = [];
        sources.forEach(function (src) {
          if (!src || typeof src !== 'object') return;
          var rawUrl = String(src.url || '').trim();
          if (!rawUrl || rawUrl.indexOf('http') !== 0 || seen[rawUrl]) return;
          seen[rawUrl] = true;
          var srcName = String(src.source || provider);
          var quality = String(src.quality || 'Auto');
          rows.push({
            url: rawUrl,
            name: '[Rive - ' + srcName + '] ' + quality,
            quality: quality,
            headers: playHeaders,
          });
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  return getProviders()
    .then(function (providers) {
      var seen = {};
      var cbValue = Math.floor(Date.now() / 3000000);
      return Promise.all(
        providers.map(function (provider) {
          return fetchProvider(provider, cbValue, seen);
        }),
      );
    })
    .then(function (groups) {
      return [].concat.apply([], groups);
    })
    .catch(function () {
      return [];
    });
}
