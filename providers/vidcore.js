// VidCore (vidcore.io): the player behind Coreflix. Every server it lists, keyed by TMDB id.
var SPECS = {
  "origin": "https://vidcore.io",
  "enc": "https://enc-dec.app/api"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = cfg.origin;
  var enc = cfg.enc;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var tmdbId = String(ctx.tmdbId);
  var page =
    ctx.type === 'movie'
      ? origin + '/movie/' + tmdbId + '/'
      : origin + '/tv/' + tmdbId + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1) + '/';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    'X-Requested-With': 'XMLHttpRequest',
  };

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  return ctx
    .fetch(page, { headers: headers })
    .then(function (r) {
      return r.text();
    })
    .then(function (html) {
      var text = (html.match(/\\"(?:en|token)\\":\\"([^\\"]+)\\"/) ||
        html.match(/"(?:en|token)":"([^"]+)"/) ||
        [])[1];
      if (!text) {
        ctx.error('vidcore: page token missing');
        return [];
      }
      // Stage 1 trades the page token for a session token; stage 2 turns that into the servers and stream URLs.
      return ctx
        .fetch(enc + '/enc-vidcore?text=' + encodeURIComponent(text) + '&stage=1', { headers: headers })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var s1 = validate(j);
          if (!s1 || !s1.stage1) {
            ctx.error('vidcore: enc-vidcore stage 1 failed');
            return null;
          }
          return ctx
            .fetch(s1.stage1, {
              method: 'POST',
              headers: Object.assign({}, headers, { 'X-CSRF-Token': s1.token || '' }),
            })
            .then(function (r) {
              return r.text();
            })
            .then(function (t1) {
              return ctx.fetch(enc + '/enc-vidcore?text=' + encodeURIComponent(t1) + '&stage=2', { headers: headers });
            })
            .then(function (r) {
              return r.json();
            });
        })
        .then(function (j) {
          if (!j) return [];
          var parts = validate(j);
          if (!parts || !parts.servers || !parts.stream) {
            ctx.error('vidcore: enc-vidcore stage 2 failed');
            return [];
          }
          var hdrs = Object.assign({}, headers, { 'X-CSRF-Token': parts.token || '' });
          return ctx
            .fetch(parts.servers, { method: 'POST', headers: hdrs })
            .then(function (r) {
              return r.text();
            })
            .then(function (encServers) {
              return ctx
                .fetch(enc + '/dec-vidcore', {
                  method: 'POST',
                  headers: Object.assign({}, hdrs, { 'Content-Type': 'application/json' }),
                  body: JSON.stringify({ text: encServers }),
                })
                .then(function (r) {
                  return r.json();
                })
                .then(function (dj) {
                  var servers = validate(dj) || [];
                  var tasks = (Array.isArray(servers) ? servers : []).map(function (server) {
                    var data = server && server.data;
                    if (!data) return Promise.resolve([]);
                    return ctx
                      .fetch(parts.stream + '/' + data, { method: 'POST', headers: hdrs })
                      .then(function (r) {
                        return r.text();
                      })
                      .then(function (encStream) {
                        return ctx.fetch(enc + '/dec-vidcore', {
                          method: 'POST',
                          headers: Object.assign({}, hdrs, { 'Content-Type': 'application/json' }),
                          body: JSON.stringify({ text: encStream }),
                        });
                      })
                      .then(function (r) {
                        return r.json();
                      })
                      .then(function (sj) {
                        var stream = validate(sj);
                        var urls = [];
                        function walk(o) {
                          if (!o) return;
                          if (typeof o === 'string' && /^https?:/i.test(o)) urls.push(o);
                          else if (Array.isArray(o)) o.forEach(walk);
                          else if (typeof o === 'object') {
                            ['url', 'file', 'src', 'stream'].forEach(function (k) {
                              if (o[k]) walk(o[k]);
                            });
                          }
                        }
                        walk(stream);
                        return urls.map(function (u) {
                          return {
                            url: u,
                            name: server.name ? 'VidCore · ' + server.name : 'VidCore',
                            headers: { 'User-Agent': ua, Referer: origin + '/' },
                          };
                        });
                      })
                      .catch(function () {
                        return [];
                      });
                  });
                  return Promise.all(tasks).then(function (groups) {
                    var out = [].concat.apply([], groups);
                    if (!out.length) ctx.error('vidcore: no playable streams');
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
