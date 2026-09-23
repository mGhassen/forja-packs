var SPECS = {
  origin: 'https://play.xpass.top',
  authToken:
    'de21073d24bca9b50f189b402ac870734cf945f2085cb7e1a4fc453fcfe4f57e',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var authToken = String(cfg.authToken || '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isTv = ctx.type === 'tv';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';
  if (!tmdbId) return Promise.resolve([]);

  var refererUrl =
    origin +
    '/e/' +
    (isTv ? 'tv' : 'movie') +
    '/' +
    tmdbId +
    '?autostart=true';
  var reqHeaders = {
    Accept: '*/*',
    'User-Agent': ua,
    Origin: origin,
    Referer: refererUrl,
    Cookie: 'auth_token=' + authToken,
  };
  var playHeaders = {
    Origin: origin,
    Referer: origin,
    'User-Agent': ua,
  };

  function loadSources() {
    if (!isTv) {
      return ctx.fetch(refererUrl, { headers: reqHeaders }).then(function (r) {
        if (!r.ok) return null;
        return r.text().then(function (body) {
          var match = String(body || '').match(/var backups=(\[[\s\S]*?\])/);
          if (!match || !match[1]) return null;
          try {
            return JSON.parse(match[1]);
          } catch (e) {
            return null;
          }
        });
      });
    }
    return ctx
      .fetch(
        origin +
          '/data/tv/' +
          tmdbId +
          '/' +
          (ctx.season || 1) +
          '/' +
          (ctx.episode || 1) +
          '?autostart=true&force=true',
        { headers: reqHeaders },
      )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function resolveSource(src) {
    if (!src || typeof src !== 'object' || src.url == null) return Promise.resolve([]);
    var sUrl = String(src.url);
    var sName = src.name != null ? String(src.name) : 'Server';
    return ctx
      .fetch(origin + sUrl, { headers: reqHeaders })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (mdata) {
        if (
          !mdata ||
          !Array.isArray(mdata.playlist) ||
          !mdata.playlist.length
        ) {
          return [];
        }
        var pl0 = mdata.playlist[0];
        if (!pl0 || !Array.isArray(pl0.sources) || !pl0.sources.length) return [];
        var list = pl0.sources;
        var target = null;
        var i;
        for (i = 0; i < list.length; i++) {
          if (list[i] && list[i].type === 'hls') {
            target = list[i];
            break;
          }
        }
        if (!target) {
          for (i = 0; i < list.length; i++) {
            if (list[i] && typeof list[i] === 'object') {
              target = list[i];
              break;
            }
          }
        }
        if (!target || target.file == null) return [];
        var streamUrl = String(target.file);
        return [
          {
            url: streamUrl,
            name: 'XPass · ' + sName + ' · 1080p',
            quality: '1080p',
            headers: playHeaders,
          },
        ];
      })
      .catch(function () {
        return [];
      });
  }

  return loadSources()
    .then(function (sources) {
      if (!Array.isArray(sources) || !sources.length) return [];
      return Promise.all(sources.map(resolveSource)).then(function (groups) {
        return [].concat.apply([], groups);
      });
    })
    .catch(function () {
      return [];
    });
}
