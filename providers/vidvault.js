var SPECS = {
  origin: 'https://vidvault.ru',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    Referer: origin + '/',
    Origin: origin,
    'User-Agent': ua,
  };
  var isTv = ctx.type === 'tv';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';
  if (!tmdbId) return Promise.resolve([]);

  function getToken() {
    return ctx
      .fetch(origin + '/api/get-token', { headers: headers })
      .then(function (r) {
        if (!r.ok) return '';
        return r.json();
      })
      .then(function (data) {
        return data && data.t != null ? String(data.t) : '';
      })
      .catch(function () {
        return '';
      });
  }

  return getToken()
    .then(function (token) {
      if (!token) return [];
      var payload = {
        type: mediaType,
        tmdbId: tmdbId,
      };
      if (isTv) {
        payload.season = String(ctx.season || 1);
        payload.episode = String(ctx.episode || 1);
      }
      return ctx
        .fetch(origin + '/api/download-proxy', {
          method: 'POST',
          headers: Object.assign({}, headers, {
            'Content-Type': 'application/json',
            'x-request-token': token,
          }),
          body: JSON.stringify(payload),
        })
        .then(function (r) {
          if (!r.ok) return [];
          return r.json();
        })
        .then(function (data) {
          if (!data || typeof data !== 'object') return [];
          var out = [];

          var mp4 = data.mp4Data;
          if (mp4 && typeof mp4 === 'object') {
            var lanName = mp4.lanName != null ? String(mp4.lanName).trim() : '';
            var country = mp4.country != null ? String(mp4.country).trim() : '';
            var downloads =
              mp4.downloadInfo &&
              mp4.downloadInfo.data &&
              mp4.downloadInfo.data.downloads;
            if (Array.isArray(downloads)) {
              downloads.forEach(function (d) {
                if (!d || typeof d !== 'object') return;
                var dUrl = d.url != null ? String(d.url) : '';
                if (!dUrl) return;
                var resLabel = d.resolution != null ? String(d.resolution) : '1080';
                var titleParts = ['VidVault', 'MP4'];
                if (lanName) titleParts.push(lanName);
                if (country && country !== lanName) titleParts.push(country);
                titleParts.push(resLabel + 'p');
                out.push({
                  url: dUrl,
                  name: titleParts.join(' · '),
                  quality: resLabel + 'p',
                  headers: headers,
                });
              });
            }
          }

          var mkvFiles = data.mkvData && data.mkvData.files;
          if (Array.isArray(mkvFiles)) {
            mkvFiles.forEach(function (f) {
              if (!f || typeof f !== 'object') return;
              var fUrl = f.url != null ? String(f.url) : '';
              if (!fUrl) return;
              var size = f.size != null ? String(f.size) : '';
              var label = size ? 'MKV · ' + size : 'MKV';
              out.push({
                url: fUrl,
                name: 'VidVault · ' + label,
                headers: headers,
              });
            });
          }

          ['mkvV2Data', 'mkvV3Data'].forEach(function (key) {
            var mkvExtra = data[key];
            if (!mkvExtra || typeof mkvExtra !== 'object') return;
            var eUrl = mkvExtra.url != null ? String(mkvExtra.url) : '';
            if (!eUrl) return;
            var eQuality = mkvExtra.quality != null ? String(mkvExtra.quality).trim() : '';
            var eLang = mkvExtra.language != null ? String(mkvExtra.language).trim() : '';
            var eCountry = mkvExtra.country != null ? String(mkvExtra.country).trim() : '';
            var eSize = mkvExtra.size != null ? String(mkvExtra.size).trim() : '';
            var parts = ['VidVault', 'MKV'];
            if (eLang) parts.push(eLang);
            if (eCountry && eCountry !== eLang) parts.push(eCountry);
            if (eQuality) parts.push(eQuality);
            if (eSize) parts.push(eSize);
            out.push({
              url: eUrl,
              name: parts.join(' · '),
              quality: eQuality,
              headers: headers,
            });
          });

          return out;
        });
    })
    .catch(function () {
      return [];
    });
}
