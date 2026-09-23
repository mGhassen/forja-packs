var SPECS = {
  base: 'https://tryembed.us.cc',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var cookies = {};

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function storeCookies(headers) {
    if (!headers) return;
    var raw =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : [headers.get && headers.get('set-cookie')].filter(Boolean);
    for (var i = 0; i < raw.length; i++) {
      var parts = String(raw[i] || '').split(/,(?=[^;,]+=)/);
      for (var j = 0; j < parts.length; j++) {
        var pair = parts[j].split(';')[0].trim();
        var eq = pair.indexOf('=');
        if (eq > 0) cookies[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }
  }

  function cookieHeader() {
    var out = [];
    for (var k in cookies) {
      if (!Object.prototype.hasOwnProperty.call(cookies, k)) continue;
      out.push(k + '=' + cookies[k]);
    }
    return out.join('; ');
  }

  function tracksFrom(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      var file = item.url || item.file || '';
      if (!file) continue;
      out.push({
        url: file,
        language: item.lang || item.label || 'und',
        name: item.label || 'Subtitles',
      });
    }
    return out;
  }

  function scrape(al, kind) {
    var cat = kind === 'dub' ? 'dub' : 'sub';
    var embedUrl = base + '/embed/anime/' + al + '/' + ep + '/' + cat + '?autoSkip=true';
    return ctx
      .fetch(embedUrl, {
        headers: {
          'User-Agent': ua,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://google.com/',
        },
      })
      .then(function (r) {
        if (!r.ok) return [];
        storeCookies(r.headers);
        return r.text().then(function (body) {
          var nonceM = body.match(/EMBED_NONCE\s*=\s*["']([^"']+)["']/);
          var nonce = (nonceM && nonceM[1]) || '';
          var apiUrl =
            base +
            '/api/stream_data?id=' +
            al +
            '&episode=' +
            ep +
            '&audio=' +
            cat +
            '&nonce=' +
            encodeURIComponent(nonce);
          var hdrs = {
            'User-Agent': ua,
            Accept: '*/*',
            Referer: embedUrl,
            Origin: base,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'X-Embed-Nonce': nonce,
          };
          var cookie = cookieHeader();
          if (cookie) hdrs.Cookie = cookie;
          return ctx.fetch(apiUrl, { headers: hdrs }).then(function (apiRes) {
            if (!apiRes.ok) return [];
            storeCookies(apiRes.headers);
            return apiRes.json().then(function (data) {
              if (!data) return [];
              var providers = Array.isArray(data.providers) ? data.providers : [];
              var globalTracks = tracksFrom(data.captions);
              var cookieString = cookieHeader();
              var rows = [];
              for (var i = 0; i < providers.length; i++) {
                var provider = providers[i];
                if (!provider) continue;
                var serverName = provider.name || provider.id || 'Server';
                var qualities = Array.isArray(provider.qualities) ? provider.qualities : [];
                var streamUrl = '';
                for (var q = 0; q < qualities.length; q++) {
                  var row = qualities[q];
                  if (!row) continue;
                  if (row.directUrl) {
                    streamUrl = row.directUrl;
                    break;
                  }
                  if (row.token) {
                    streamUrl = base + '/s/' + row.token + '.m3u8';
                    break;
                  }
                  if (row.fallbackToken) {
                    streamUrl = base + '/s/' + row.fallbackToken + '.m3u8';
                    break;
                  }
                }
                if (!streamUrl) continue;
                var headers = {
                  Referer: embedUrl,
                  Origin: base,
                  'User-Agent': ua,
                };
                if (cookieString) headers.Cookie = cookieString;
                var entry = {
                  url: streamUrl,
                  name: 'TryEmbed [' + serverName + '] (' + cat.toUpperCase() + ')',
                  language: cat === 'dub' ? 'Dub' : 'Sub',
                  headers: headers,
                };
                var tracks = globalTracks.slice();
                tracksFrom(provider.captions).forEach(function (t) {
                  if (!tracks.some(function (x) { return x.url === t.url; })) tracks.push(t);
                });
                if (tracks.length) entry.subtitles = tracks;
                rows.push(entry);
              }
              return rows;
            });
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  var al = anilistId();
  if (!al) return Promise.resolve([]);

  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  return Promise.all(
    cats.map(function (kind) {
      return scrape(al, kind);
    }),
  ).then(function (groups) {
    var seen = {};
    var out = [];
    groups.forEach(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || !r.url || seen[r.url]) return;
        seen[r.url] = true;
        out.push(r);
      });
    });
    return out;
  });
}
