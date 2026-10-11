var SPECS = {
  "origin": "https://vidrock.ru",
  "subOrigin": "https://sub.vdrk.site",
  "aesKey": "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = cfg.origin;
  var subOrigin = String(cfg.subOrigin || SPECS.subOrigin).replace(/\/$/, '');
  var aesKey = cfg.aesKey;
  var ua =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    Referer: origin + '/',
    Origin: origin,
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
  };
  var tmdbId = String(ctx.tmdbId);
  var path =
    ctx.type === 'movie'
      ? 'movie/' + tmdbId
      : 'tv/' + tmdbId + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1);

  function qualityOf(url) {
    var m = String(url || '').match(/(\d{3,4})p/i);
    return m ? m[1] + 'p' : '';
  }

  function isAstraPlaylist(url) {
    return /cdn\.vidrock\.store\/playlist\//i.test(url || '') ||
      /streamrk\.site\/playlist\//i.test(url || '');
  }

  function langFromLabel(label) {
    return String(label || '')
      .replace(/\s*\d+$/, '')
      .trim() || 'und';
  }

  function mapSubList(list, sourceName) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!item) return;
      var url = String(item.url || item.file || '').trim();
      if (!url) return;
      var label = String(item.label || item.language || item.lang || '').trim();
      var language = langFromLabel(label || 'und');
      out.push({
        url: url,
        language: language,
        name: label || language,
        sourceName: sourceName,
      });
    });
    return out;
  }

  function fetchSubs(apiPath, sourceName) {
    return ctx
      .fetch(subOrigin + apiPath, { headers: headers })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        return mapSubList(data, sourceName);
      })
      .catch(function () {
        return [];
      });
  }

  function loadSubtitles() {
    // Site player: v2 = Internal, v1 = Open Subtitles (same paths as vidrock.ru bundle).
    return Promise.all([
      fetchSubs('/v2/' + path, 'Internal'),
      fetchSubs('/v1/' + path, 'Open Subtitles'),
    ]).then(function (groups) {
      var seen = {};
      var out = [];
      groups.forEach(function (list) {
        (list || []).forEach(function (sub) {
          if (!sub || !sub.url || seen[sub.url]) return;
          seen[sub.url] = true;
          out.push(sub);
        });
      });
      return out;
    });
  }

  function row(url, name, language, subtitles) {
    // CDNs (ngcorp / workers / digitalmonarch / …) 403 without vidrock.ru Referer.
    var label = 'VidRock ' + name + (language ? ' [' + language + ']' : '');
    var out = {
      url: url,
      name: label,
      quality: qualityOf(url),
      headers: playHeaders,
      pngStrip: 'auto',
    };
    if (subtitles && subtitles.length) out.subtitles = subtitles;
    return out;
  }

  function decryptUrl(enc) {
    if (!enc) return '';
    if (/^https?:\/\//i.test(enc)) return enc;
    var CryptoJS = ctx.crypto;
    if (!CryptoJS || !aesKey) return '';
    try {
      var packed = CryptoJS.enc.Base64.parse(enc);
      var hex = CryptoJS.enc.Hex.stringify(packed);
      if (hex.length < 56) return '';
      var iv = CryptoJS.enc.Hex.parse(hex.substring(0, 24));
      var ct = CryptoJS.enc.Hex.parse(hex.substring(24));
      var pt = CryptoJS.AES.decrypt(
        { ciphertext: ct },
        CryptoJS.enc.Hex.parse(aesKey),
        { iv: iv, mode: CryptoJS.mode.GCM },
      );
      return CryptoJS.enc.Utf8.stringify(pt) || '';
    } catch (e) {
      return '';
    }
  }

  function parseAstra(playlistUrl, name, subtitles) {
    return ctx
      .fetch(playlistUrl, { headers: playHeaders })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var rows = [];
        (Array.isArray(data) ? data : []).forEach(function (item) {
          if (item && item.url) {
            var q = item.resolution ? item.resolution + 'p' : qualityOf(item.url);
            var out = {
              url: item.url,
              name: 'VidRock ' + name,
              quality: q,
              headers: playHeaders,
              pngStrip: 'auto',
            };
            if (subtitles && subtitles.length) out.subtitles = subtitles;
            rows.push(out);
          }
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  function process(data, subtitles) {
    if (!data || typeof data !== 'object') return Promise.resolve([]);
    var tasks = [];
    Object.keys(data).forEach(function (serverName) {
      var source = data[serverName];
      var url = decryptUrl(source && source.url);
      if (!url) return;
      if (serverName === 'Astra' && isAstraPlaylist(url)) {
        tasks.push(parseAstra(url, serverName, subtitles));
        return;
      }
      tasks.push(
        Promise.resolve([row(url, serverName, source.language, subtitles)]),
      );
    });
    return Promise.all(tasks).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  if (!aesKey) return [];

  return Promise.all([
    ctx
      .fetch(origin.replace(/\/$/, '') + '/api/' + path, { headers: headers })
      .then(function (r) {
        return r.text();
      })
      .then(function (body) {
        try {
          return JSON.parse(body);
        } catch (e) {
          return null;
        }
      })
      .catch(function () {
        return null;
      }),
    loadSubtitles(),
  ])
    .then(function (parts) {
      return process(parts[0], parts[1] || []);
    })
    .then(function (rows) {
      var seen = {};
      var out = [];
      (rows || []).forEach(function (r) {
        if (!r || !r.url || seen[r.url]) return;
        seen[r.url] = true;
        out.push(r);
      });
      return out.length ? out : [];
    })
    .catch(function () {
      return [];
    });
}
