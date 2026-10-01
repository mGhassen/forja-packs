var SPECS = {
  origin: 'https://player.zxcstream.xyz',
  aesKey: '7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c',
  servers: ['berkas', 'orion', 'aquarius', 'resshin'],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var aesKey = cfg.aesKey || SPECS.aesKey;
  var servers = cfg.servers || SPECS.servers;
  if (!origin) return Promise.resolve([]);

  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
    Accept: 'application/json, text/plain, */*',
  };

  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = ctx.tmdbId;
  if (tmdbId == null || tmdbId === '') return Promise.resolve([]);
  var year = String(ctx.year || 2024).substring(0, 4);
  var title = ctx.title || '';

  function decryptCryptoJS(ciphertextB64, passphrase) {
    if (!ctx.crypto || !ctx.crypto.AES) return null;
    try {
      var C = ctx.crypto;
      var buf = C.enc.Base64.parse(ciphertextB64);
      var words = buf.words;
      var prefix = '';
      if (buf.sigBytes >= 8) {
        for (var i = 0; i < 2; i++) {
          var w = words[i];
          prefix += String.fromCharCode((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255);
        }
      }
      if (prefix.substring(0, 8) === 'Salted__') {
        var pt = C.AES.decrypt(ciphertextB64, passphrase).toString(C.enc.Utf8);
        return pt || null;
      }
      // Non-OpenSSL: MD5(passphrase) as 16-byte key, zero IV
      var key = C.MD5(passphrase);
      var iv = C.lib.WordArray.create([0, 0, 0, 0], 16);
      var out = C.AES.decrypt({ ciphertext: buf }, key, {
        iv: iv,
        mode: C.mode.CBC,
        padding: C.pad.Pkcs7,
      }).toString(C.enc.Utf8);
      return out || null;
    } catch (e) {
      return null;
    }
  }

  function collectUrls(sourcesData, server) {
    var list = [];
    if (Array.isArray(sourcesData)) {
      for (var i = 0; i < sourcesData.length; i++) {
        var it = sourcesData[i];
        if (it && it.url) list.push({ url: String(it.url), server: server });
      }
    } else if (sourcesData && typeof sourcesData === 'object') {
      if (sourcesData.url) list.push({ url: String(sourcesData.url), server: server });
      var nested = sourcesData.sources;
      if (Array.isArray(nested)) {
        for (var j = 0; j < nested.length; j++) {
          var n = nested[j];
          if (n && n.url) list.push({ url: String(n.url), server: server });
        }
      }
    }
    return list;
  }

  function probe(server) {
    var body = {
      id: tmdbId,
      media_type: mediaType,
      path: server,
    };
    if (isTv) {
      body.season = ctx.season || 1;
      body.episode = ctx.episode || 1;
    }
    return ctx
      .fetch(origin + '/backend/you-are-gay', {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (tokenData) {
        if (!tokenData || !tokenData.token) return [];
        var q =
          'id=' +
          encodeURIComponent(String(tmdbId)) +
          '&b=' +
          encodeURIComponent(mediaType) +
          '&ts=' +
          encodeURIComponent(String(tokenData.ts || '')) +
          '&token=' +
          encodeURIComponent(String(tokenData.token)) +
          '&title=' +
          encodeURIComponent(title) +
          '&year=' +
          encodeURIComponent(year) +
          '&date=' +
          encodeURIComponent(year);
        if (isTv) {
          q +=
            '&season=' +
            encodeURIComponent(String(ctx.season || 1)) +
            '&episode=' +
            encodeURIComponent(String(ctx.episode || 1));
        }
        return ctx
          .fetch(origin + '/backend_/sources/' + server + '?' + q, { headers: headers })
          .then(function (r) {
            return r.json();
          })
          .then(function (sourcesData) {
            if (typeof sourcesData === 'string') {
              var dec = decryptCryptoJS(sourcesData, aesKey);
              if (dec) {
                try {
                  sourcesData = JSON.parse(dec);
                } catch (e) {
                  return [];
                }
              }
            }
            return collectUrls(sourcesData, server);
          });
      })
      .catch(function () {
        return [];
      });
  }

  return Promise.all(servers.map(probe))
    .then(function (chunks) {
      var rows = [];
      for (var i = 0; i < chunks.length; i++) {
        var part = chunks[i] || [];
        for (var j = 0; j < part.length; j++) {
          var item = part[j];
          rows.push({
            url: item.url,
            name: 'ZxcStream · ' + item.server,
            quality: '1080p',
            headers: headers,
          });
        }
      }
      return rows;
    })
    .catch(function () {
      return [];
    });
}
