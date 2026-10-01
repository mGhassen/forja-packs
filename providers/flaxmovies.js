var SPECS = {
  "baseUrl": "https://flaxmovies.xyz",
  "defaultWorkers": [
    "https://freakyniki.elaxo.lol",
    "https://vidlove.nabilekson.workers.dev"
  ]
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var baseUrl = String(cfg.baseUrl || '').replace(/\/$/, '');
  var defaultWorkers = Array.isArray(cfg.defaultWorkers)
    ? cfg.defaultWorkers
    : SPECS.defaultWorkers;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: baseUrl + '/',
    Origin: baseUrl,
    Accept: 'application/json, text/plain, */*',
  };
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  function getWorkerUrls(embedUrl) {
    var foundUrls = [];
    return ctx
      .fetch(embedUrl, {
        headers: {
          'User-Agent': ua,
          Referer: baseUrl + '/',
          Origin: baseUrl,
        },
      })
      .then(function (r) {
        if (!r.ok) return foundUrls;
        return r.text().then(function (html) {
          var directMatch = html.match(
            /WORKER_URL\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
          );
          if (directMatch && directMatch[1]) {
            var wUrl = directMatch[1].replace(/\/+$/, '');
            if (foundUrls.indexOf(wUrl) < 0) foundUrls.push(wUrl);
          }

          var scriptUrls = [];
          var re = /<script[^>]+src=["']([^"']+)["']/gi;
          var sm;
          while ((sm = re.exec(html))) {
            if (sm[1]) scriptUrls.push(sm[1]);
          }

          var chain = Promise.resolve();
          scriptUrls.forEach(function (scriptUrl) {
            chain = chain.then(function () {
              var resolved = scriptUrl;
              if (resolved.indexOf('//') === 0) resolved = 'https:' + resolved;
              else if (resolved.indexOf('/') === 0) resolved = baseUrl + resolved;
              else if (resolved.indexOf('http') !== 0) {
                resolved = baseUrl + '/' + resolved;
              }
              if (
                resolved.indexOf('jsdelivr') >= 0 ||
                resolved.indexOf('google') >= 0 ||
                resolved.indexOf('cloudflare') >= 0
              ) {
                return;
              }
              return ctx
                .fetch(resolved, {
                  headers: { 'User-Agent': ua, Referer: embedUrl },
                })
                .then(function (sRes) {
                  if (!sRes.ok) return;
                  return sRes.text().then(function (body) {
                    var wm = body.match(
                      /WORKER_URL\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
                    );
                    if (wm && wm[1]) {
                      var wu = wm[1].replace(/\/+$/, '');
                      if (foundUrls.indexOf(wu) < 0) foundUrls.push(wu);
                    }
                  });
                })
                .catch(function () {});
            });
          });
          return chain.then(function () {
            return foundUrls;
          });
        });
      })
      .catch(function () {
        return foundUrls;
      })
      .then(function (urls) {
        defaultWorkers.forEach(function (d) {
          if (urls.indexOf(d) < 0) urls.push(d);
        });
        return urls;
      });
  }

  var embedUrl = isTv
    ? baseUrl +
      '/embed/tv/' +
      tmdbId +
      '/' +
      (ctx.season || 1) +
      '/' +
      (ctx.episode || 1)
    : baseUrl + '/embed/movie/' + tmdbId;

  var query = isTv
    ? 'tmdb_id=' +
      tmdbId +
      '&tmdbId=' +
      tmdbId +
      '&season=' +
      (ctx.season || 1) +
      '&episode=' +
      (ctx.episode || 1)
    : 'tmdb_id=' + tmdbId + '&tmdbId=' + tmdbId;

  return getWorkerUrls(embedUrl)
    .then(function (workerUrls) {
      function tryWorker(index) {
        if (index >= workerUrls.length) return Promise.resolve([]);
        var worker = workerUrls[index];
        var url = worker.replace(/\/$/, '') + '/?' + query;
        return ctx
          .fetch(url, { headers: headers })
          .then(function (r) {
            if (!r.ok) return tryWorker(index + 1);
            return r.json().then(function (data) {
              if (!data || !Array.isArray(data.streams) || !data.streams.length) {
                return tryWorker(index + 1);
              }
              var rows = [];
              var playHeaders = {
                'User-Agent': ua,
                Referer: baseUrl + '/',
                Origin: baseUrl,
              };
              data.streams.forEach(function (st) {
                if (!st || typeof st !== 'object') return;
                var streamUrl = st.url != null ? String(st.url) : '';
                if (!streamUrl) return;
                var provider = String(st.provider || 'CDN');
                var resolution = String(st.resolution || '1080p');
                rows.push({
                  url: streamUrl,
                  name: 'FlaxMovies · ' + provider + ' · ' + resolution,
                  quality: resolution,
                  headers: playHeaders,
                });
              });
              return rows.length ? rows : tryWorker(index + 1);
            });
          })
          .catch(function () {
            return tryWorker(index + 1);
          });
      }
      return tryWorker(0);
    })
    .catch(function () {
      return [];
    });
}
