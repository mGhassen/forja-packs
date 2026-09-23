var SPECS = {
  "api": "https://core.vidzee.wtf",
  "origin": "https://player.vidzee.wtf",
  // Live player chip order (Ads bundle 2026-09): Dcloud, Apre, Acme(v4:<lang>),
  // TCloud(tik), IPcloud, Hindi v3(v6:Hindi). `acme` is a folder only — probe v4:*.
  "servers": [
    "dcloud",
    "apre",
    "tik",
    "ipcloud",
    "v6:Hindi",
    "v4:English",
    "v4:Hindi",
    "v4:Tamil",
    "v4:Telugu",
    "v4:Bengali",
    "v4:Malayalam",
    "v4:Kannada",
    "v4:Marathi",
    "v4:Punjabi"
  ]
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = cfg.api.replace(/\/$/, '');
  var origin = cfg.origin.replace(/\/$/, '');
  var servers = Array.isArray(cfg.servers) ? cfg.servers : [];
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var tmdbId = String(ctx.tmdbId);
  var isTv = ctx.type !== 'movie';
  var season = ctx.season || 1;
  var episode = ctx.episode || 1;
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
    Accept: 'application/json, text/plain, */*',
  };

  ctx.log(
    'start tmdb=' +
      tmdbId +
      ' type=' +
      (isTv ? 'tv' : 'movie') +
      ' servers=' +
      servers.join(','),
  );

  function streamUrl(sr) {
    var path = isTv
      ? '/streams/tv/' +
        encodeURIComponent(tmdbId) +
        '/' +
        encodeURIComponent(season) +
        '/' +
        encodeURIComponent(episode)
      : '/streams/movie/' + encodeURIComponent(tmdbId);
    // e=0 = plaintext (site uses e=1 + wasmDecrypt with hostname key).
    return api + path + '?s=' + encodeURIComponent(sr) + '&e=0';
  }

  function playHeadersFor(data) {
    var apiHdrs =
      data && data.headers && typeof data.headers === 'object' ? data.headers : null;
    var hasApiRef =
      apiHdrs &&
      typeof apiHdrs.Referer === 'string' &&
      apiHdrs.Referer.trim().length > 0;
    // CDN rows often require the API Referer (e.g. slast430did.com). Forcing
    // player.vidzee.wtf Origin/Referer over that makes those playlists 404.
    if (hasApiRef) {
      var out = { 'User-Agent': ua };
      Object.keys(apiHdrs).forEach(function (k) {
        out[k] = String(apiHdrs[k]);
      });
      return out;
    }
    var base = {
      'User-Agent': ua,
      Referer: origin + '/',
      Origin: origin,
    };
    if (apiHdrs) {
      Object.keys(apiHdrs).forEach(function (k) {
        base[k] = String(apiHdrs[k]);
      });
    }
    return base;
  }

  function labelFor(sr) {
    if (sr === 'apre') return 'Apre';
    if (sr === 'dcloud') return 'Dcloud';
    if (sr === 'tik') return 'TCloud';
    if (sr === 'ipcloud') return 'IPcloud';
    if (sr === 'v6:Hindi') return 'Hindi v3';
    if (sr.indexOf('v4:') === 0) return 'Acme · ' + sr.slice(3);
    return sr;
  }

  function probePlayable(stream, hdrs, sr) {
    return ctx
      .fetch(stream, { headers: hdrs })
      .then(function (r) {
        if (!r.ok) {
          ctx.log('server ' + sr + ' playlist http ' + r.status);
          return false;
        }
        return r.text().then(function (body) {
          var ok = typeof body === 'string' && body.indexOf('#EXT') !== -1;
          if (!ok) ctx.log('server ' + sr + ' playlist not HLS');
          return ok;
        });
      })
      .catch(function (e) {
        ctx.log(
          'server ' +
            sr +
            ' playlist probe: ' +
            (e && e.message ? e.message : e),
        );
        return false;
      });
  }

  function one(sr) {
    var url = streamUrl(sr);
    ctx.log('GET ' + url);
    return ctx
      .fetch(url, { headers: headers })
      .then(function (r) {
        if (!r.ok) {
          ctx.log('server ' + sr + ' http ' + r.status);
          return [];
        }
        return r.json().then(function (data) {
          if (!data || typeof data !== 'object') return [];
          if (data.c) {
            ctx.log('server ' + sr + ' encrypted blob (e=0 expected)');
            return [];
          }
          var stream = typeof data.url === 'string' ? data.url.trim() : '';
          if (!/^https?:\/\//i.test(stream)) {
            ctx.log('server ' + sr + ' empty');
            return [];
          }
          var hdrs = playHeadersFor(data);
          var lang = data.language || '';
          return probePlayable(stream, hdrs, sr).then(function (ok) {
            if (!ok) return [];
            ctx.log('server ' + sr + ' ok ' + stream.slice(0, 80));
            return [
              {
                url: stream,
                name:
                  'Vidzee ' +
                  labelFor(sr) +
                  (lang && lang !== 'Auto' ? ' · ' + lang : ''),
                language: lang === 'Auto' ? '' : lang,
                headers: hdrs,
              },
            ];
          });
        });
      })
      .catch(function (e) {
        ctx.error('server ' + sr + ': ' + (e && e.message ? e.message : e));
        return [];
      });
  }

  return Promise.all(servers.map(one)).then(function (groups) {
    var out = [];
    var seen = {};
    groups.forEach(function (rows) {
      rows.forEach(function (row) {
        var key = String(row.url || '');
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(row);
      });
    });
    ctx.log('streams=' + out.length);
    return out;
  });
}
