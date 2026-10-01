var SPECS = {
  "domains": [
    "https://www.lookmovie2.to",
    "https://lookmovie2.to",
    "https://lookmovie.foundation"
  ]
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var domains = Array.isArray(cfg.domains) ? cfg.domains : SPECS.domains;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headersBase = {
    'User-Agent': ua,
    'Accept-Language': 'en-US,en;q=0.9',
  };
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var typeStr = isTv ? 'shows' : 'movies';
  var title = String(ctx.title || '').trim();
  var year = ctx.year != null ? String(ctx.year) : '';
  if (!title) return Promise.resolve([]);

  function searchOne(base) {
    var headers = Object.assign({}, headersBase, {
      Accept: 'application/json',
      Referer: base + '/',
      'X-Requested-With': 'XMLHttpRequest',
    });
    return ctx
      .fetch(
        base +
          '/api/v1/' +
          typeStr +
          '/do-search/?q=' +
          encodeURIComponent(title),
        { headers: headers },
      )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (data) {
          if (
            !data ||
            !Array.isArray(data.result) ||
            !data.result.length
          ) {
            return null;
          }
          var results = data.result;
          var match = null;
          if (year) {
            for (var i = 0; i < results.length; i++) {
              if (
                results[i] &&
                typeof results[i] === 'object' &&
                String(results[i].year) === year
              ) {
                match = results[i];
                break;
              }
            }
          }
          if (!match) {
            for (var j = 0; j < results.length; j++) {
              if (
                results[j] &&
                typeof results[j] === 'object' &&
                String(results[j].title || '').toLowerCase() ===
                  title.toLowerCase()
              ) {
                match = results[j];
                break;
              }
            }
          }
          if (!match) match = results[0];
          if (match && typeof match === 'object') {
            return { match: match, base: base };
          }
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function searchLookMovie() {
    var chain = Promise.resolve(null);
    domains.forEach(function (base) {
      chain = chain.then(function (found) {
        if (found) return found;
        return searchOne(base);
      });
    });
    return chain;
  }

  function getEpisodeId(html, s, e) {
    var storageMatch = html.match(
      /window\[['\"](?:movie|show)_storage['\"]\]\s*=\s*\{([^}]+)\}/,
    );
    if (storageMatch) {
      var block = storageMatch[1];
      var sm = block.match(/seasons\s*:\s*(\[[\s\S]+?\])\s*[,}]/);
      if (sm && sm[1]) {
        try {
          var seasons = JSON.parse(sm[1]);
          if (Array.isArray(seasons)) {
            var season = null;
            for (var i = 0; i < seasons.length; i++) {
              var x = seasons[i];
              if (!x || typeof x !== 'object') continue;
              var sn =
                x.season != null
                  ? x.season
                  : x.meta && x.meta.season != null
                    ? x.meta.season
                    : null;
              if (String(sn) === String(s)) {
                season = x;
                break;
              }
            }
            if (season && season.episodes) {
              var eps = season.episodes;
              if (Array.isArray(eps)) {
                for (var j = 0; j < eps.length; j++) {
                  if (
                    eps[j] &&
                    typeof eps[j] === 'object' &&
                    String(eps[j].episode) === String(e)
                  ) {
                    return String(eps[j].id_episode || eps[j].id || '');
                  }
                }
              } else if (typeof eps === 'object') {
                var ep = eps[String(e)];
                if (!ep) {
                  var keys = Object.keys(eps);
                  for (var k = 0; k < keys.length; k++) {
                    var cand = eps[keys[k]];
                    if (
                      cand &&
                      typeof cand === 'object' &&
                      String(cand.episode) === String(e)
                    ) {
                      ep = cand;
                      break;
                    }
                  }
                }
                if (ep) return String(ep.id_episode || ep.id || '');
              }
            }
          }
        } catch (err) {}
      }
    }
    var am =
      html.match(
        new RegExp(
          'data-season=["\']' +
            s +
            '["\'][^>]*?data-episode=["\']' +
            e +
            '["\'][^>]*?data-id=["\'](\\d+)["\']',
        ),
      ) ||
      html.match(
        new RegExp(
          'data-episode=["\']' +
            e +
            '["\'][^>]*?data-season=["\']' +
            s +
            '["\'][^>]*?data-id=["\'](\\d+)["\']',
        ),
      );
    return am ? am[1] : null;
  }

  return searchLookMovie()
    .then(function (searchRes) {
      if (!searchRes || !searchRes.match) return [];
      var match = searchRes.match;
      var base = searchRes.base;
      var slug = String(match.slug || '');
      if (!slug) return [];

      var pageHeaders = Object.assign({}, headersBase, {
        Accept: 'text/html',
        Referer: base + '/',
      });

      return ctx
        .fetch(base + '/' + typeStr + '/play/' + slug, {
          headers: pageHeaders,
        })
        .then(function (r) {
          if (!r.ok) return [];
          return r.text().then(function (html) {
            var storageMatch = html.match(
              /window\[['\"](?:movie|show)_storage['\"]\]\s*=\s*\{([^}]+)\}/,
            );
            if (!storageMatch || !storageMatch[1]) return [];
            var block = storageMatch[1];
            var hashMatch = block.match(/hash\s*:\s*['\"]([^'\"]+)['\"]/);
            var expiresMatch = block.match(/expires\s*:\s*(\d+)/);
            if (!hashMatch || !expiresMatch) return [];
            var hash = hashMatch[1];
            var expires = expiresMatch[1];

            var streamId;
            if (isTv) {
              streamId = getEpisodeId(
                html,
                ctx.season || 1,
                ctx.episode || 1,
              );
            } else {
              streamId = String(
                match.id_movie ||
                  match.id ||
                  '',
              );
              if (!streamId) {
                var idm = html.match(
                  /['\"]?(?:id_movie|movieId)['\"]?\s*[:=]\s*['\"]?(\d+)['\"]?/,
                );
                streamId = idm ? idm[1] : '';
              }
            }
            if (!streamId) return [];

            var accessParam = isTv ? 'episode' : 'movie';
            var accessUrl =
              base +
              '/api/v1/security/' +
              accessParam +
              '-access?id_' +
              accessParam +
              '=' +
              encodeURIComponent(streamId) +
              '&hash=' +
              encodeURIComponent(hash) +
              '&expires=' +
              encodeURIComponent(expires);

            var accessHeaders = Object.assign({}, headersBase, {
              Accept: 'application/json',
              Referer: base + '/',
              'X-Requested-With': 'XMLHttpRequest',
            });

            return ctx
              .fetch(accessUrl, { headers: accessHeaders })
              .then(function (ar) {
                if (!ar.ok) return [];
                return ar.json();
              })
              .then(function (data) {
                var streams = null;
                if (data && typeof data === 'object') {
                  streams =
                    data.streams ||
                    (data.result && data.result.streams) ||
                    (data.data && data.data.streams) ||
                    data;
                }
                if (!streams || typeof streams !== 'object' || Array.isArray(streams)) {
                  return [];
                }
                var rows = [];
                Object.keys(streams).forEach(function (q) {
                  var url = streams[q] != null ? String(streams[q]) : '';
                  if (!url || url.indexOf('.m3u8') < 0) return;
                  var qualityLabel =
                    q.indexOf('1080') >= 0
                      ? '1080p'
                      : q.indexOf('720') >= 0
                        ? '720p'
                        : q + ' p';
                  rows.push({
                    url: url,
                    name: 'LookMovie · ' + qualityLabel,
                    quality: qualityLabel,
                    headers: {
                      'User-Agent': ua,
                      Referer: base + '/',
                    },
                  });
                });
                return rows;
              });
          });
        });
    })
    .catch(function () {
      return [];
    });
}
