var SPECS = {
  apiBase: 'https://streamdata.vaplayer.ru/api.php',
  embedOrigin: 'https://nextgencloudfabric.com',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var apiBase = String(cfg.apiBase || '');
  var embedOrigin = String(cfg.embedOrigin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var verifyHeaders = {
    'User-Agent': ua,
    Referer: embedOrigin + '/',
    Origin: embedOrigin,
  };
  var isTv = ctx.type === 'tv';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';
  if (!tmdbId) return Promise.resolve([]);

  function extractStreamUrls(obj, urls) {
    if (obj == null) return;
    if (typeof obj === 'string') {
      if (
        obj.indexOf('http') === 0 &&
        (obj.indexOf('.m3u8') !== -1 ||
          obj.indexOf('.mp4') !== -1 ||
          obj.indexOf('.mpd') !== -1)
      ) {
        urls[obj] = true;
      }
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach(function (item) {
        extractStreamUrls(item, urls);
      });
      return;
    }
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) {
        extractStreamUrls(obj[k], urls);
      });
    }
  }

  var qs =
    'tmdb=' +
    encodeURIComponent(tmdbId) +
    '&type=' +
    encodeURIComponent(mediaType);
  if (isTv) {
    qs +=
      '&season=' +
      encodeURIComponent(String(ctx.season || 1)) +
      '&episode=' +
      encodeURIComponent(String(ctx.episode || 1));
  }

  return ctx
    .fetch(apiBase + '?' + qs, {
      headers: {
        Accept: '*/*',
        Origin: embedOrigin,
        Referer: embedOrigin + '/',
        'User-Agent': ua,
      },
    })
    .then(function (r) {
      if (!r.ok) return [];
      return r.json();
    })
    .then(function (data) {
      var seen = {};
      extractStreamUrls(data, seen);
      var out = [];
      Object.keys(seen).forEach(function (sUrl) {
        var isHls = sUrl.indexOf('.m3u8') !== -1;
        var isDash = sUrl.indexOf('.mpd') !== -1;
        var format = isHls ? 'HLS' : isDash ? 'DASH' : 'MP4';
        out.push({
          url: sUrl,
          name: 'VidAPI · ' + format + ' · 1080p',
          quality: '1080p',
          headers: verifyHeaders,
        });
      });
      return out;
    })
    .catch(function () {
      return [];
    });
}
