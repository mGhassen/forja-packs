var SPECS = {
  origin: 'https://mapple.club',
  apiKey: 'mptv_sk_a8f29c4e7b3d1f',
  servers: [
    { id: 'mapple', name: 'Mapple' },
    { id: 's1', name: 'Nexus' },
    { id: 's2', name: 'Cipher' },
    { id: 's3', name: 'Pulse' },
    { id: 's4', name: 'Vertex' },
    { id: 's10', name: 'Chimp' },
  ],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var apiKey = cfg.apiKey || SPECS.apiKey;
  var servers = cfg.servers || SPECS.servers;
  if (!origin) return Promise.resolve([]);

  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = ctx.tmdbId;
  if (tmdbId == null || tmdbId === '') return Promise.resolve([]);

  var pageUrl = isTv
    ? origin + '/watch/tv/' + tmdbId + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1)
    : origin + '/watch/movie/' + tmdbId;

  function solvePoW(challenge, difficulty) {
    if (!ctx.crypto || !ctx.crypto.SHA256) return null;
    var maskBytes = (difficulty / 8) | 0;
    var maskBits = difficulty % 8;
    var finalMask = maskBits > 0 ? (0xff << (8 - maskBits)) & 0xff : 0;
    var C = ctx.crypto;

    for (var nonce = 0; nonce < 1000000; nonce++) {
      var nonceStr = String(nonce);
      var digestHex = C.SHA256(challenge + nonceStr).toString(C.enc.Hex);
      var ok = true;
      for (var i = 0; i < maskBytes; i++) {
        if (parseInt(digestHex.substring(i * 2, i * 2 + 2), 16) !== 0) {
          ok = false;
          break;
        }
      }
      if (ok && (finalMask === 0 || (parseInt(digestHex.substring(maskBytes * 2, maskBytes * 2 + 2), 16) & finalMask) === 0)) {
        return nonceStr;
      }
    }
    return null;
  }

  function cookieFromResponse(r) {
    var parts = [];
    var raw = '';
    if (r.headers) {
      if (typeof r.headers.getSetCookie === 'function') {
        raw = (r.headers.getSetCookie() || []).join('; ');
      } else if (r.headers.get) {
        raw = r.headers.get('set-cookie') || r.headers.get('Set-Cookie') || '';
      }
    }
    var re = /(_mapple_site(?:_partitioned)?=[^;]+)/g;
    var m;
    while ((m = re.exec(raw))) parts.push(m[1]);
    return parts.join('; ');
  }

  function probeServer(srv, initHeaders, cookieHeader, requestToken, streamToken, tvSlug) {
    return ctx
      .fetch(origin + '/api/encrypt', {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          data: {
            mediaId: tmdbId,
            mediaType: mediaType,
            tv_slug: tvSlug,
            source: srv.id,
            apikey: apiKey,
          },
        }),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (encryptData) {
        var encrypted = encryptData && encryptData.encrypted;
        if (!encrypted) return null;
        var streamUrl =
          origin +
          '/api/stream-encrypted?data=' +
          encodeURIComponent(encrypted) +
          '&requestToken=' +
          encodeURIComponent(requestToken) +
          '&token=' +
          encodeURIComponent(streamToken);
        return ctx
          .fetch(streamUrl, {
            headers: {
              'User-Agent': ua,
              Referer: pageUrl,
              Origin: origin,
              Cookie: cookieHeader || undefined,
            },
          })
          .then(function (r) {
            return r.json();
          })
          .then(function (streamData) {
            if (!streamData || streamData.success !== true || !streamData.data) return null;
            var fileUrl = streamData.data.stream_url;
            if (!fileUrl) return null;
            if (fileUrl.indexOf('omena-puu') >= 0 || fileUrl.indexOf('nocach') >= 0) {
              fileUrl += fileUrl.indexOf('?') >= 0 ? '&format=.m3u8' : '?format=.m3u8';
            }
            return {
              url: fileUrl,
              name: 'Mapple · ' + srv.name,
              quality: '1080p',
              headers: {
                'User-Agent': ua,
                Referer: origin + '/',
                Origin: origin,
              },
            };
          });
      })
      .catch(function () {
        return null;
      });
  }

  return ctx
    .fetch(pageUrl, {
      headers: { 'User-Agent': ua, Referer: origin + '/', Origin: origin },
    })
    .then(function (pageRes) {
      return pageRes.text().then(function (html) {
        var reqMatch = html.match(/window\.__REQUEST_TOKEN__\s*=\s*"([^"]+)"/);
        if (!reqMatch) return [];
        var requestToken = reqMatch[1];
        var cookieHeader = cookieFromResponse(pageRes);
        var initHeaders = {
          'Content-Type': 'application/json',
          'User-Agent': ua,
          Referer: pageUrl,
          Origin: origin,
        };
        if (cookieHeader) initHeaders.Cookie = cookieHeader;

        return ctx
          .fetch(origin + '/api/playback-init', {
            method: 'POST',
            headers: initHeaders,
            body: JSON.stringify({
              mediaId: tmdbId,
              mediaType: mediaType,
              requestToken: requestToken,
            }),
          })
          .then(function (r) {
            return r.json();
          })
          .then(function (initData) {
            if (!initData || typeof initData !== 'object') return [];
            var streamToken = initData.token ? String(initData.token) : '';

            var powStep = Promise.resolve(streamToken);
            if (initData.requiresPow === true && initData.pow && typeof initData.pow === 'object') {
              var powInfo = initData.pow;
              var challenge = String(powInfo.challenge || '');
              var difficulty = (powInfo.difficulty | 0) || 10;
              var challengeId = powInfo.challengeId;
              var nonce = solvePoW(challenge, difficulty);
              if (nonce) {
                powStep = ctx
                  .fetch(origin + '/api/playback-init', {
                    method: 'POST',
                    headers: initHeaders,
                    body: JSON.stringify({
                      mediaId: tmdbId,
                      mediaType: mediaType,
                      requestToken: requestToken,
                      pow: { challengeId: challengeId, nonce: nonce },
                    }),
                  })
                  .then(function (r) {
                    return r.json();
                  })
                  .then(function (solveData) {
                    if (solveData && solveData.token) return String(solveData.token);
                    return streamToken;
                  });
              }
            }

            return powStep.then(function (token) {
              if (!token) return [];
              var tvSlug = isTv ? (ctx.season || 1) + '-' + (ctx.episode || 1) : '';
              return Promise.all(
                servers.map(function (srv) {
                  return probeServer(srv, initHeaders, cookieHeader, requestToken, token, tvSlug);
                }),
              ).then(function (results) {
                return results.filter(Boolean);
              });
            });
          });
      });
    })
    .catch(function () {
      return [];
    });
}
