var SPECS = {
  "hosts": [
    "https://api6.aoneroom.com",
    "https://api5.aoneroom.com",
    "https://api4.aoneroom.com",
    "https://api3.aoneroom.com",
    "https://api.inmoviebox.com"
  ],
  "api": "https://api6.aoneroom.com",
  "referer": "https://videodownloader.site/",
  "keyB64Default": "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==",
  "keyB64Alt": "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49",
  "packageName": "com.community.oneroom",
  "versionCode": 50020120,
  "versionName": "4.0.01.0813.03"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var hosts = Array.isArray(cfg.hosts) && cfg.hosts.length ? cfg.hosts.slice() : [cfg.api];
  if (cfg.api && hosts.indexOf(cfg.api.replace(/\/$/, '')) < 0) {
    hosts.unshift(cfg.api.replace(/\/$/, ''));
  }
  hosts = hosts.map(function (h) {
    return String(h || '').replace(/\/$/, '');
  }).filter(Boolean);
  var keyB64Default = cfg.keyB64Default;
  var keyB64Alt = cfg.keyB64Alt;
  var tmdbKey = cfg.tmdbKey;
  var pkg = cfg.packageName;
  var versionCode = cfg.versionCode;
  var versionName = cfg.versionName;
  var ua =
    pkg +
    '/' +
    versionCode +
    ' (Linux; U; Android 13; en_US; 22101316G; Build/TQ2A.230405.003; Cronet/135.0.7012.3)';
  var isTv = ctx.type !== 'movie';
  var season = isTv ? Number(ctx.season) || 1 : 0;
  var episode = isTv ? Number(ctx.episode) || 1 : 0;
  var deviceId = '';
  var selectedBrand = 'Redmi';
  var selectedModel = '22101316G';
  var authToken = '';
  var activeHost = hosts[0];
  var retryStatuses = { 403: 1, 406: 1, 407: 1, 429: 1, 500: 1, 502: 1, 503: 1, 504: 1 };

  function initSession() {
    if (deviceId) return;
    var chars = '0123456789abcdef';
    for (var i = 0; i < 32; i++) deviceId += chars[Math.floor(Math.random() * 16)];
  }

  function md5Hex(input) {
    return ctx.crypto.MD5(String(input)).toString(ctx.crypto.enc.Hex);
  }

  function secretKey(alt) {
    var outer = ctx.crypto.enc.Base64.parse(alt ? keyB64Alt : keyB64Default);
    var inner = ctx.crypto.enc.Utf8.stringify(outer);
    return ctx.crypto.enc.Base64.parse(inner);
  }

  function hmacMd5B64(key, data) {
    return ctx.crypto.HmacMD5(String(data), key).toString(ctx.crypto.enc.Base64);
  }

  function xClientToken(ts) {
    var t = String(ts || Date.now());
    return t + ',' + md5Hex(t.split('').reverse().join(''));
  }

  function canonicalString(method, accept, contentType, url, body, ts) {
    var path = '';
    var query = '';
    try {
      var u = new URL(url);
      path = u.pathname;
      var keys = [];
      u.searchParams.forEach(function (_, k) {
        if (keys.indexOf(k) < 0) keys.push(k);
      });
      keys.sort();
      if (keys.length) {
        query = keys
          .map(function (k) {
            return u.searchParams
              .getAll(k)
              .map(function (v) {
                return k + '=' + v;
              })
              .join('&');
          })
          .join('&');
      }
    } catch (e) {
      return '';
    }
    var canonicalUrl = query ? path + '?' + query : path;
    var bodyHash = '';
    var bodyLength = '';
    if (body) {
      bodyHash = md5Hex(body);
      bodyLength = String(ctx.crypto.enc.Utf8.parse(body).sigBytes);
    }
    return (
      method.toUpperCase() +
      '\n' +
      (accept || '') +
      '\n' +
      (contentType || '') +
      '\n' +
      bodyLength +
      '\n' +
      ts +
      '\n' +
      bodyHash +
      '\n' +
      canonicalUrl
    );
  }

  function xTrSignature(method, accept, contentType, url, body, ts, alt) {
    var canonical = canonicalString(method, accept, contentType, url, body, ts);
    return ts + '|2|' + hmacMd5B64(secretKey(alt), canonical);
  }

  function payloadData(j) {
    var d = (j && j.data) || {};
    if (d && typeof d === 'object' && d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      if (d.data.results || d.data.streams || d.data.list || d.data.subject || d.data.token) {
        return d.data;
      }
    }
    return d;
  }

  function mbRequest(method, pathAndQuery, body, extra, altKey, hostIdx) {
    initSession();
    var start = typeof hostIdx === 'number' ? hostIdx : hosts.indexOf(activeHost);
    if (start < 0) start = 0;
    var idx = start;
    var host = hosts[idx] || activeHost;
    var url = host + pathAndQuery;
    var ts = Date.now();
    var contentType =
      (extra && extra['Content-Type']) || (body ? 'application/json; charset=utf-8' : 'application/json');
    var accept = (extra && extra.Accept) || 'application/json';
    var xClientInfo = JSON.stringify({
      package_name: pkg,
      version_name: versionName,
      version_code: versionCode,
      os: 'android',
      os_version: '13',
      device_id: deviceId,
      install_store: 'ps',
      gaid: 'd7578036d13336cc',
      brand: selectedBrand.toLowerCase(),
      model: selectedModel,
      system_language: 'en',
      net: 'NETWORK_WIFI',
      region: 'US',
      timezone: 'Asia/Kolkata',
      sp_code: '40401',
      'X-Play-Mode': '2',
    });
    var headers = Object.assign(
      {
        Accept: accept,
        'Content-Type': contentType,
        'x-client-token': xClientToken(ts),
        'x-tr-signature': xTrSignature(method, accept, contentType, url, body, ts, !!altKey),
        'User-Agent': ua,
        'x-client-info': xClientInfo,
        'x-client-status': '0',
      },
      extra || {},
    );
    if (authToken && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + authToken;
    }
    return ctx
      .fetch(url, { method: method, headers: headers, body: body || undefined })
      .then(function (r) {
        if (r.status === 403 && !altKey) {
          return mbRequest(method, pathAndQuery, body, extra, true, idx);
        }
        if (retryStatuses[r.status] && idx + 1 < hosts.length) {
          return mbRequest(method, pathAndQuery, body, extra, altKey, idx + 1);
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        activeHost = host;
        return r.json().then(function (j) {
          var code = j && typeof j.code === 'number' ? j.code : 0;
          if (code === 441 && !authToken) {
            throw new Error('HTTP 441');
          }
          if (retryStatuses[code] && idx + 1 < hosts.length) {
            return mbRequest(method, pathAndQuery, body, extra, altKey, idx + 1);
          }
          return { json: j, headers: r.headers, host: host };
        });
      });
  }

  function visitorLogin() {
    if (authToken) return Promise.resolve(authToken);
    return mbRequest('POST', '/wefeed-mobile-bff/user-api/visitor-login', '{}').then(function (res) {
      var data = payloadData(res.json);
      var token = data.token || '';
      if (!token) throw new Error('moviebox visitor login missing token');
      authToken = token;
      return authToken;
    });
  }

  function normalizeTitle(s) {
    return String(s || '')
      .replace(/\[.*?\]/g, ' ')
      .replace(/\(.*?\|/g, ' ')
      .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, ' ')
      .trim()
      .toLowerCase()
      .replace(/:/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function tmdbDetails() {
    var kind = isTv ? 'tv' : 'movie';
    return ctx
      .fetch(
        'https://tmdb.forjahq.xyz/3/' +
          kind +
          '/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
        { headers: { Accept: 'application/json', 'User-Agent': ua } },
      )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        return {
          title: (isTv ? d.name || d.original_name : d.title || d.original_title) || String(ctx.title || ''),
          year: String((isTv ? d.first_air_date : d.release_date) || ctx.year || '').substring(0, 4),
          originalTitle: d.original_title || d.original_name || '',
        };
      });
  }

  function searchSubjects(query) {
    var body = JSON.stringify({ page: 1, perPage: 20, keyword: query, subjectType: 0 });
    return mbRequest('POST', '/wefeed-mobile-bff/subject-api/search/v2', body).then(function (res) {
      var data = payloadData(res.json);
      var groups = data.results || [];
      var out = [];
      groups.forEach(function (g) {
        (g.subjects || []).forEach(function (s) {
          out.push(s);
        });
      });
      if (!out.length && Array.isArray(data.list)) {
        data.list.forEach(function (s) {
          out.push(s);
        });
      }
      if (typeof ctx.log === 'function') ctx.log('moviebox subjects=' + out.length);
      return out;
    }).catch(function () {
      return [];
    });
  }

  function pickSubject(subjects, details) {
    var want = normalizeTitle(details.title);
    var alt = normalizeTitle(details.originalTitle);
    var rawWant = String(details.title || '').trim().toLowerCase();
    var targetType = isTv ? 2 : 1;
    var best = null;
    var bestScore = 0;
    (subjects || []).forEach(function (s) {
      if (Number(s.subjectType) !== targetType) return;
      var rawTitle = String(s.title || '').trim();
      var title = normalizeTitle(rawTitle);
      var year = String(s.year || (s.releaseDate || '').substring(0, 4) || '');
      var score = 0;
      if (title === want || title === alt) score += 50;
      else if (title.indexOf(want) >= 0 || want.indexOf(title) >= 0) score += 15;
      if (details.year && year === details.year) score += 35;
      if (rawTitle.toLowerCase() === rawWant) score += 20;
      if (/\[|\(|hindi|tamil|telugu|dub/i.test(rawTitle)) score -= 10;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    });
    return bestScore >= 40 ? best : null;
  }

  function streamRow(url, quality, cookie, host) {
    if (!url) return null;
    var qn = String(quality || 'Auto').match(/(\d{3,4})/);
    var base = host || activeHost;
    return {
      url: url,
      name: 'MovieBox',
      quality: qn ? qn[1] + 'p' : 'Auto',
      headers: Object.assign(
        { Referer: base + '/', 'User-Agent': ua },
        cookie ? { Cookie: cookie } : {},
      ),
    };
  }

  function streamsFromPlayInfo(playData, host) {
    var out = [];
    var streams = playData.streams;
    if (Array.isArray(streams)) {
      streams.forEach(function (s) {
        var row = streamRow(s && s.url, s.resolutions || s.quality || 'Auto', s && s.signCookie, host);
        if (row) out.push(row);
      });
    } else if (Array.isArray(playData.resourceDetectors)) {
      playData.resourceDetectors.forEach(function (det) {
        (det.resolutionList || []).forEach(function (v) {
          var row = streamRow(v && v.resourceLink, v && v.resolution, null, host);
          if (row) out.push(row);
        });
      });
    }
    return out;
  }

  function playStreams(subjectId) {
    var qs =
      '?subjectId=' +
      encodeURIComponent(String(subjectId)) +
      (isTv ? '&se=' + season + '&ep=' + episode : '');
    var pathV2 = '/wefeed-mobile-bff/subject-api/play-info/v2' + qs;
    var pathV1 =
      '/wefeed-mobile-bff/subject-api/play-info?subjectId=' +
      encodeURIComponent(String(subjectId)) +
      '&se=' +
      season +
      '&ep=' +
      episode;

    function fromPath(path) {
      return mbRequest('GET', path, null).then(function (res) {
        return streamsFromPlayInfo(payloadData(res.json), res.host);
      });
    }

    return fromPath(pathV2)
      .then(function (out) {
        if (out.length) return out;
        return fromPath(pathV1);
      })
      .catch(function () {
        return fromPath(pathV1).catch(function () {
          return [];
        });
      })
      .then(function (out) {
        if (out.length) return out;
        var resPath =
          '/wefeed-mobile-bff/subject-api/resource?subjectId=' +
          encodeURIComponent(String(subjectId)) +
          '&page=1&perPage=20' +
          (isTv ? '&se=' + season + '&ep=' + episode : '');
        return mbRequest('GET', resPath, null).then(function (res) {
          var data = payloadData(res.json);
          var list = data.list || [];
          var rows = [];
          list.forEach(function (item) {
            if (!item) return;
            if (isTv) {
              var se = Number(item.se);
              var ep = Number(item.ep);
              if ((se && se !== season) || (ep && ep !== episode)) return;
            }
            var row = streamRow(
              item.resourceLink || item.url || item.sourceUrl,
              item.resolution || 'Auto',
              item.signCookie,
              res.host,
            );
            if (row) rows.push(row);
          });
          return rows;
        }).catch(function () {
          return [];
        });
      });
  }

  function streamsForSubject(subjectId) {
    var subjectPath =
      '/wefeed-mobile-bff/subject-api/get?subjectId=' + encodeURIComponent(String(subjectId));
    return mbRequest('GET', subjectPath, null)
      .then(function (res) {
        try {
          var xUser = res.headers && res.headers.get ? res.headers.get('x-user') : '';
          if (xUser) {
            var tok = JSON.parse(xUser).token || '';
            if (tok) authToken = tok;
          }
        } catch (e) {}
        var data = payloadData(res.json);
        var subject = data.subject || data;
        var dubs = subject.dubs || data.dubs || [];
        var ids = [{ id: subjectId, lang: 'Original' }];
        dubs.forEach(function (d) {
          if (d && d.subjectId && String(d.subjectId) !== String(subjectId)) {
            ids.push({ id: d.subjectId, lang: d.lanName || 'Dub' });
          }
        });
        return Promise.all(
          ids.slice(0, 4).map(function (item) {
            return playStreams(item.id).catch(function () {
              return [];
            });
          }),
        ).then(function (groups) {
          return [].concat.apply([], groups);
        });
      })
      .catch(function () {
        // get may 441 on some hosts; play-info/v2 still works with visitor token
        return playStreams(subjectId);
      });
  }

  return tmdbDetails()
    .then(function (details) {
      if (!details.title) return [];
      return visitorLogin()
        .then(function () {
          return searchSubjects(details.title);
        })
        .then(function (subjects) {
          var match = pickSubject(subjects, details);
          if (!match && details.originalTitle && details.originalTitle !== details.title) {
            return searchSubjects(details.originalTitle).then(function (more) {
              return pickSubject(more, details);
            });
          }
          return match;
        })
        .then(function (match) {
          if (!match || !match.subjectId) return [];
          return streamsForSubject(match.subjectId);
        });
    })
    .catch(function () {
      return [];
    });
}
