var SPECS = {
  base: 'https://anime-dunya.com',
  mapApi: 'https://id-mapping-api-malid.hf.space/api/resolve',
  tmdbKey: '1865f43a0549ca50d341dd9ab8b29f49',
  jikan: 'https://api.jikan.moe/v4/anime',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var mapApi = cfg.mapApi;
  var jikan = cfg.jikan;
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var hdrs = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: base + '/',
    'sec-ch-ua': '"Chromium";v="137", "Google Chrome";v="137", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
  var isTv = ctx.type !== 'movie';
  var epNum = isTv ? ctx.mappedEpisode || ctx.episode || 1 : 1;
  var http =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch.bind(ctx);

  function log(msg) {
    if (ctx && typeof ctx.log === 'function') ctx.log(msg);
  }

  function fetchText(url) {
    return http(url, { headers: hdrs }).then(function (r) {
      return r.text().then(function (t) {
        return { status: r.status | 0, text: t || '' };
      });
    });
  }

  function fetchJson(url) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, { Accept: 'application/json' }) }).then(
      function (r) {
        return r.json();
      },
    );
  }

  function isChallenge(html) {
    var s = String(html || '');
    return /Just a moment|not available in your country|Access Blocked|cf-browser-verification|Enable JavaScript and cookies/i.test(
      s,
    );
  }

  function resolveMal() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost && fromHost.mal) {
      return Promise.resolve({
        mal: fromHost.mal,
        ep: Number(fromHost.ep || fromHost.mappedEp || epNum) || 1,
      });
    }
    if (!isTv) {
      return fetchJson(
        'https://tmdb.forjahq.xyz/3/movie/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
      )
        .then(function (d) {
          var title = d.title || d.original_title || '';
          if (!title) return null;
          return fetchJson(jikan + '?q=' + encodeURIComponent(title) + '&type=movie&limit=1').then(
            function (j) {
              return j && j.data && j.data[0] ? { mal: j.data[0].mal_id, ep: 1 } : null;
            },
          );
        })
        .catch(function () {
          return null;
        });
    }
    var imdbP = ctx.imdbId
      ? Promise.resolve(String(ctx.imdbId))
      : fetchJson(
          'https://tmdb.forjahq.xyz/3/tv/' +
            encodeURIComponent(String(ctx.tmdbId || '')) +
            '/external_ids?api_key=' +
            encodeURIComponent(tmdbKey),
        )
          .then(function (d) {
            return (d && d.imdb_id) || '';
          })
          .catch(function () {
            return '';
          });
    return imdbP.then(function (imdbId) {
      if (!imdbId) return null;
      return fetchJson(
        mapApi +
          '?id=' +
          encodeURIComponent(imdbId) +
          '&s=' +
          encodeURIComponent(String(ctx.season || 1)) +
          '&e=' +
          encodeURIComponent(String(epNum)),
      )
        .then(function (m) {
          return m && m.mal_id ? { mal: m.mal_id, ep: Number(epNum) || 1 } : null;
        })
        .catch(function () {
          return null;
        });
    });
  }

  function extractLiteral(html, key, open) {
    var close = open === '[' ? ']' : '}';
    var marker = new RegExp('\\\\?"' + key + '\\\\?":\\s*\\' + open, 'g');
    var match;
    while ((match = marker.exec(html))) {
      var start = match.index + match[0].length - 1;
      var depth = 0;
      var out = '';
      for (var i = start; i < html.length; i++) {
        var ch = html.charAt(i);
        if (ch === open) depth++;
        else if (ch === close) depth--;
        out += ch;
        if (depth === 0) break;
      }
      try {
        var clean = out.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        var parsed = JSON.parse(clean);
        if (Array.isArray(parsed) ? parsed.length > 0 : parsed && typeof parsed === 'object') {
          return parsed;
        }
      } catch (e) {}
    }
    return null;
  }

  function extractStream(html) {
    var stream = extractLiteral(html, 'stream', '{');
    if (stream && stream.source) return stream;
    var sourceMatch = html.match(/"source"\s*:\s*"([^"]+)"/);
    if (sourceMatch) return { source: sourceMatch[1].replace(/\\/g, ''), subtitles: [] };
    var m3u8 = html.match(/https?:\/\/fs\d*\.anime-dunya\.com\/files\/[^"'\\\s]+\/master\.m3u8/);
    if (m3u8) return { source: m3u8[0], subtitles: [] };
    return null;
  }

  function loadPlay(mal, ep) {
    var urls = [base + '/api/play/' + mal + '/' + ep, base + '/en/play/' + mal + '/' + ep];
    function walk(i) {
      if (i >= urls.length) return Promise.resolve('');
      return fetchText(urls[i])
        .then(function (res) {
          var html = res.text || '';
          if (html && !isChallenge(html)) return html;
          log('animedunya play miss HTTP ' + res.status + ' @ ' + urls[i]);
          return walk(i + 1);
        })
        .catch(function (e) {
          log('animedunya play error @ ' + urls[i] + ': ' + e);
          return walk(i + 1);
        });
    }
    return walk(0);
  }

  return resolveMal()
    .then(function (ids) {
      if (!ids || !ids.mal) {
        log('animedunya no MAL id');
        return [];
      }
      return loadPlay(ids.mal, ids.ep).then(function (html) {
        var streamData = extractStream(html);
        if (!streamData || !streamData.source) {
          log('animedunya no stream mal=' + ids.mal + ' ep=' + ids.ep);
          return [];
        }
        var subtitles = (streamData.subtitles || []).map(function (s) {
          return { url: s.src, lang: s.srclang || s.label || 'en' };
        });
        return [
          {
            url: streamData.source,
            name: 'AnimeDunya',
            headers: { 'User-Agent': ua, Referer: base + '/' },
            language: 'Sub',
            subtitles: subtitles,
          },
        ];
      });
    })
    .catch(function (e) {
      log('animedunya error: ' + e);
      return [];
    });
}
