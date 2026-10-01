var SPECS = {
  "apiBase": "https://vuflix.co",
  "referer": "https://vuflix.co/",
  "origin": "https://vuflix.co"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var apiBase = String(cfg.apiBase || '').replace(/\/$/, '');
  var referer = cfg.referer || 'https://vuflix.co/';
  var origin = cfg.origin || 'https://vuflix.co';
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: referer,
    Origin: origin,
    Accept: 'application/json, text/plain, */*',
  };
  var fallbackProviders = [
    { id: 'vsembed', name: 'Sigma' },
    { id: 'moonflix', name: 'Source 40' },
    { id: 'megasource', name: 'Source 39' },
    { id: 'hdghar', name: 'Source 44' },
    { id: 'moviebox', name: 'Pi' },
    { id: 'cineplay', name: '4K' },
    { id: 'huhu', name: 'Beta' },
    { id: 'bingr', name: 'Upsilon' },
    { id: 'onlyflix', name: 'Gamma' },
    { id: 'vaplayer', name: 'Alpha' },
    { id: 'flixhqz', name: 'Gamma' },
    { id: 'castle', name: 'Source 40' },
    { id: 'cinejoy', name: '4K2' },
    { id: 'filesun', name: 'Tau' },
    { id: 'yoru', name: 'Yoru' },
  ];
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  function defaultHeaders() {
    return {
      'User-Agent': ua,
      Referer: referer,
      Origin: origin,
    };
  }

  function unwrapUrl(rawUrl) {
    var fallback = defaultHeaders();
    if (!rawUrl) return { url: '', headers: fallback };
    if (rawUrl.indexOf('v-relay?t=') < 0 && rawUrl.indexOf('a-relay?t=') < 0) {
      return { url: rawUrl, headers: fallback };
    }
    try {
      var uri = new URL(rawUrl);
      var t = uri.searchParams.get('t');
      if (!t) return { url: rawUrl, headers: fallback };
      var b64 = t.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      var jsonStr = atob(b64);
      var parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        var directUrl = String(parsed.u || '').trim();
        var headersMap = defaultHeaders();
        if (parsed.h && typeof parsed.h === 'object') {
          Object.keys(parsed.h).forEach(function (k) {
            headersMap[k] = String(parsed.h[k]);
          });
        }
        if (directUrl) return { url: directUrl, headers: headersMap };
      }
    } catch (e) {}
    return { url: rawUrl, headers: fallback };
  }

  function getProviders() {
    return ctx
      .fetch(apiBase + '/api/player/providers', { headers: headers })
      .then(function (r) {
        if (!r.ok) return fallbackProviders;
        return r.json().then(function (data) {
          if (data && data.ok === true && Array.isArray(data.providers)) {
            var list = [];
            data.providers.forEach(function (p) {
              if (!p || typeof p !== 'object') return;
              var id = String(p.id || '').trim();
              if (!id) return;
              var name = String(
                p.publicLabel || p.providerName || p.name || id,
              );
              list.push({ id: id, name: name });
            });
            if (list.length) return list;
          }
          return fallbackProviders;
        });
      })
      .catch(function () {
        return fallbackProviders;
      });
  }

  function pushRow(out, seen, unwrapped, name, quality) {
    if (!unwrapped.url || seen[unwrapped.url]) return;
    seen[unwrapped.url] = true;
    out.push({
      url: unwrapped.url,
      name: name,
      quality: quality || '',
      headers: unwrapped.headers,
    });
  }

  function fetchProvider(prov, baseParams, seen) {
    var url =
      apiBase +
      '/api/player/sources?' +
      baseParams +
      '&provider=' +
      encodeURIComponent(prov.id);
    return ctx
      .fetch(url, { headers: headers })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true || !Array.isArray(data.sources)) return [];
        var out = [];
        data.sources.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var providerName = String(
            item.providerName || item.publicLabel || prov.name,
          );
          var primaryRawUrl = String(item.url || '').trim();
          var itemType = String(item.type || 'hls').toLowerCase();
          var itemLabel = String(item.label || '');

          if (Array.isArray(item.qualities) && item.qualities.length) {
            item.qualities.forEach(function (q) {
              if (!q || typeof q !== 'object') return;
              var qRawUrl = String(q.url || '').trim();
              if (!qRawUrl) return;
              var unwrapped = unwrapUrl(qRawUrl);
              var qQuality = String(q.quality || 'Auto');
              pushRow(
                out,
                seen,
                unwrapped,
                '[Vuflix - ' + providerName + '] ' + qQuality,
                qQuality,
              );
            });
          }

          if (Array.isArray(item.candidates) && item.candidates.length) {
            var candIndex = 1;
            item.candidates.forEach(function (c) {
              if (!c || typeof c !== 'object') return;
              var cRawUrl = String(c.url || '').trim();
              if (!cRawUrl) return;
              var unwrapped = unwrapUrl(cRawUrl);
              var cQuality = String(c.quality || '1080p');
              pushRow(
                out,
                seen,
                unwrapped,
                '[Vuflix - ' +
                  providerName +
                  '] Mirror ' +
                  candIndex +
                  ' · ' +
                  cQuality,
                cQuality,
              );
              candIndex++;
            });
          }

          if (Array.isArray(item.audioTracks) && item.audioTracks.length) {
            item.audioTracks.forEach(function (a) {
              if (!a || typeof a !== 'object') return;
              var aRawUrl = String(a.switchUrl || a.url || '').trim();
              if (!aRawUrl) return;
              var unwrapped = unwrapUrl(aRawUrl);
              var rawLabel = String(
                a.label || a.name || a.language || 'Audio',
              ).trim();
              var cleanLabel = rawLabel
                .replace(/\s*audio\s*$/i, '')
                .trim();
              var aLabel = cleanLabel || 'Audio';
              pushRow(
                out,
                seen,
                unwrapped,
                '[Vuflix - ' + providerName + '] ' + aLabel + ' Audio',
                'HD',
              );
            });
          }

          if (primaryRawUrl) {
            var unwrapped = unwrapUrl(primaryRawUrl);
            if (unwrapped.url && !seen[unwrapped.url]) {
              var displayQuality = String(item.quality || '');
              if (!displayQuality) {
                displayQuality = itemType === 'mp4' ? 'MP4' : 'HD';
              }
              var cleanLabel = itemLabel || providerName;
              var streamTitle = cleanLabel.indexOf('[') === 0
                ? cleanLabel
                : '[Vuflix - ' + providerName + '] ' + displayQuality;
              pushRow(out, seen, unwrapped, streamTitle, displayQuality);
            }
          }
        });
        return out;
      })
      .catch(function () {
        return [];
      });
  }

  var baseParams = 'type=' + mediaType + '&tmdbId=' + encodeURIComponent(tmdbId);
  if (isTv) {
    baseParams +=
      '&season=' +
      (ctx.season || 1) +
      '&episode=' +
      (ctx.episode || 1);
  }

  return getProviders()
    .then(function (providers) {
      var seen = {};
      return Promise.all(
        providers.map(function (prov) {
          return fetchProvider(prov, baseParams, seen);
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
