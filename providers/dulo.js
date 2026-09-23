var SPECS = {
  "domains": ["https://dulo.gd", "https://dulo.cx"],
  "playbackReferer": "https://d.dulo.gd/",
  "playbackOrigin": "https://d.dulo.gd"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var domains = Array.isArray(cfg.domains) ? cfg.domains : SPECS.domains;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var playbackHeaders = {
    'User-Agent': ua,
    Referer: cfg.playbackReferer || 'https://d.dulo.gd/',
    Origin: cfg.playbackOrigin || 'https://d.dulo.gd',
  };
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  var payload = isTv
    ? {
        type: 'tv',
        tmdbId: Number(tmdbId) || tmdbId,
        season: ctx.season || 1,
        episode: ctx.episode || 1,
      }
    : {
        type: 'movie',
        tmdbId: Number(tmdbId) || tmdbId,
      };

  function getSessionCookie(domain) {
    return ctx
      .fetch(domain + '/api/session', {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          Referer: domain + '/',
          Origin: domain,
        },
      })
      .then(function (r) {
        if (!r.ok) return null;
        var setCookie = '';
        if (r.headers) {
          if (typeof r.headers.getSetCookie === 'function') {
            var arr = r.headers.getSetCookie();
            setCookie = Array.isArray(arr) ? arr.join('; ') : String(arr || '');
          } else if (typeof r.headers.get === 'function') {
            setCookie = r.headers.get('set-cookie') || '';
          }
        }
        if (!setCookie) return null;
        var match = setCookie.match(/(__Host-amri_session=[^;]+)/);
        return match ? match[1] : setCookie.split(';')[0];
      })
      .catch(function () {
        return null;
      });
  }

  function parseSseSources(body, seen) {
    var rows = [];
    var lines = String(body || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.indexOf('event: complete') === 0) break;
      if (trimmed.indexOf('data:') !== 0) continue;
      var jsonPart = trimmed.substring(5).trim();
      if (!jsonPart || jsonPart.indexOf('{') !== 0) continue;
      try {
        var data = JSON.parse(jsonPart);
        if (!data || !Array.isArray(data.sources)) continue;
        data.sources.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var url = String(item.url || '');
          if (!url || url.indexOf('http') !== 0 || seen[url]) return;
          seen[url] = true;
          var titleLabel = String(item.title || 'Stream');
          var quality = String(item.quality || 'Auto');
          var qualityLabel =
            quality && quality !== 'Auto' ? quality : '1080p';
          rows.push({
            url: url,
            name: 'Dulo · ' + titleLabel + ' · ' + qualityLabel,
            quality: qualityLabel,
            headers: playbackHeaders,
          });
        });
      } catch (e) {}
    }
    return rows;
  }

  function fetchDomain(domain, seen) {
    return getSessionCookie(domain).then(function (cookie) {
      var reqHeaders = {
        'User-Agent': ua,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Referer: domain + '/',
        Origin: domain,
      };
      if (cookie) reqHeaders.Cookie = cookie;
      return ctx
        .fetch(domain + '/api/source', {
          method: 'POST',
          headers: reqHeaders,
          body: JSON.stringify(payload),
        })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) return [];
          if (!r.ok) return [];
          return r.text().then(function (body) {
            return parseSseSources(body, seen);
          });
        })
        .catch(function () {
          return [];
        });
    });
  }

  function tryDomains(index, seen) {
    if (index >= domains.length) return Promise.resolve([]);
    return fetchDomain(domains[index], seen).then(function (rows) {
      if (rows && rows.length) return rows;
      return tryDomains(index + 1, seen);
    });
  }

  return tryDomains(0, {}).catch(function () {
    return [];
  });
}
