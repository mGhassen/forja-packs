var SPECS = {
  origin: 'https://vidup.to',
  enc: 'https://enc-dec.app/api',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var enc = String(cfg.enc || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var tmdbId = String(ctx.tmdbId || '');
  if (!tmdbId || !origin || !enc) return Promise.resolve([]);

  var page =
    ctx.type === 'movie'
      ? origin + '/movie/' + tmdbId + '/'
      : origin + '/tv/' + tmdbId + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1) + '/';
  // Page GET must not send X-Requested-With — nginx returns 403 with that header.
  var pageHeaders = {
    'User-Agent': ua,
    Referer: origin + '/',
  };
  var apiHeaders = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
    'X-Requested-With': 'XMLHttpRequest',
  };

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  ctx.log('start tmdb=' + tmdbId + ' type=' + (ctx.type === 'movie' ? 'movie' : 'tv'));

  return ctx
    .fetch(page, { headers: pageHeaders })
    .then(function (r) {
      if (!r.ok) {
        ctx.error('vidup: page http ' + r.status);
        return [];
      }
      return r.text();
    })
    .then(function (html) {
      if (!html || !html.length) return [];
      // Prefer escaped Next.js payload token; plain "(?:en|token)" also hits analytics ids.
      var text = (html.match(/\\"(?:en|token)\\":\\"([^\\"]+)\\"/) || [])[1];
      if (!text) {
        ctx.error('vidup: page token missing');
        return [];
      }
      return ctx
        .fetch(enc + '/enc-vidup?text=' + encodeURIComponent(text), {
          headers: { 'User-Agent': ua, Accept: 'application/json' },
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var parts = validate(j);
          if (!parts || !parts.servers || !parts.stream) {
            ctx.error('vidup: enc-vidup failed');
            return [];
          }
          var hdrs = Object.assign({}, apiHeaders, { 'X-CSRF-Token': parts.token || '' });
          return ctx
            .fetch(parts.servers, { method: 'POST', headers: hdrs })
            .then(function (r) {
              return r.text();
            })
            .then(function (encServers) {
              return ctx
                .fetch(enc + '/dec-vidup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
                  body: JSON.stringify({ text: encServers }),
                })
                .then(function (r) {
                  return r.json();
                })
                .then(function (dj) {
                  var servers = validate(dj) || [];
                  var tasks = (Array.isArray(servers) ? servers : []).slice(0, 6).map(function (server) {
                    var data = server && server.data;
                    if (!data) return Promise.resolve(null);
                    return ctx
                      .fetch(parts.stream + '/' + data, { method: 'POST', headers: hdrs })
                      .then(function (r) {
                        return r.text();
                      })
                      .then(function (encStream) {
                        return ctx.fetch(enc + '/dec-vidup', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
                          body: JSON.stringify({ text: encStream }),
                        });
                      })
                      .then(function (r) {
                        return r.json();
                      })
                      .then(function (sj) {
                        var stream = validate(sj);
                        var finalUrl = stream && stream.url ? String(stream.url) : '';
                        if (!finalUrl) {
                          var urls = [];
                          function walk(o) {
                            if (!o) return;
                            if (typeof o === 'string' && /^https?:/i.test(o)) urls.push(o);
                            else if (Array.isArray(o)) o.forEach(walk);
                            else if (typeof o === 'object') {
                              ['url', 'file', 'src', 'stream', 'link'].forEach(function (k) {
                                if (o[k]) walk(o[k]);
                              });
                            }
                          }
                          walk(stream);
                          finalUrl = urls[0] || '';
                        }
                        if (!finalUrl) return null;
                        return {
                          url: finalUrl,
                          name: (server.name || 'VidUp') + '',
                          headers: {
                            'User-Agent': ua,
                            Referer: origin + '/',
                            Origin: origin,
                          },
                        };
                      })
                      .catch(function () {
                        return null;
                      });
                  });
                  return Promise.all(tasks).then(function (rows) {
                    var out = rows.filter(Boolean);
                    ctx.log('streams=' + out.length);
                    if (!out.length) ctx.error('vidup: no playable streams');
                    return out;
                  });
                });
            });
        });
    })
    .catch(function (e) {
      ctx.error(e && e.message ? e.message : e);
      return [];
    });
}
