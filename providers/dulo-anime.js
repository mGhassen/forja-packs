var SPECS = {
  domains: ['https://dulo.gd', 'https://dulo.cx'],
  playOrigin: 'https://d.dulo.gd',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var domains = Array.isArray(cfg.domains) && cfg.domains.length ? cfg.domains : SPECS.domains;
  var playOrigin = String(cfg.playOrigin || SPECS.playOrigin).replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var sessionCookie = '';

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function pickCookie(headers) {
    if (!headers) return '';
    var raw =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie().join(',')
        : headers.get && (headers.get('set-cookie') || headers.get('Set-Cookie') || '');
    var m = String(raw || '').match(/(__Host-amri_session=[^;]+)/);
    return m ? m[1] : String(raw || '').split(';')[0].trim();
  }

  function getSession(domain) {
    if (sessionCookie) return Promise.resolve(sessionCookie);
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
        if (!r.ok) return '';
        sessionCookie = pickCookie(r.headers);
        return sessionCookie;
      })
      .catch(function () {
        return '';
      });
  }

  function parseSse(text) {
    var seen = {};
    var rows = [];
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var trimmed = lines[i].trim();
      if (trimmed.indexOf('data:') !== 0) continue;
      var jsonPart = trimmed.substring(5).trim();
      if (!jsonPart || jsonPart.charAt(0) !== '{') continue;
      try {
        var data = JSON.parse(jsonPart);
        var sources = data && data.sources;
        if (!Array.isArray(sources)) continue;
        for (var j = 0; j < sources.length; j++) {
          var item = sources[j];
          if (!item || !item.url || !/^https?:\/\//i.test(item.url)) continue;
          if (seen[item.url]) continue;
          seen[item.url] = true;
          rows.push({
            url: item.url,
            name: 'Dulo Anime (' + (item.title || item.quality || 'Source') + ')',
            quality: item.quality && item.quality !== 'Auto' ? item.quality : '1080p',
            headers: {
              'User-Agent': ua,
              Referer: playOrigin + '/',
              Origin: playOrigin,
            },
          });
        }
      } catch (e) {}
    }
    return rows;
  }

  function fetchDomain(domain, al) {
    return getSession(domain).then(function (cookie) {
      var headers = {
        'User-Agent': ua,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Referer: domain + '/',
        Origin: domain,
      };
      if (cookie) headers.Cookie = cookie;
      return ctx
        .fetch(domain + '/api/source', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            type: 'anime',
            anilistId: al,
            episode: ep,
          }),
        })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) {
            sessionCookie = '';
            return [];
          }
          if (!r.ok) return [];
          return r.text().then(parseSse);
        });
    });
  }

  var al = anilistId();
  if (!al) return Promise.resolve([]);

  var chain = Promise.resolve([]);
  domains.forEach(function (domain) {
    chain = chain.then(function (acc) {
      if (acc.length) return acc;
      return fetchDomain(String(domain).replace(/\/$/, ''), al).catch(function () {
        return [];
      });
    });
  });
  return chain.catch(function () {
    return [];
  });
}
