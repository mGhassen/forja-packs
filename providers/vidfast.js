var SPECS = {
  origin: 'https://vidfast.vc',
  enc: 'https://enc-dec.app/api',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var enc = String(cfg.enc || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var tmdbId = String(ctx.tmdbId || '');
  if (!tmdbId || !origin || !enc) return Promise.resolve([]);

  var page =
    ctx.type === 'movie'
      ? origin + '/movie/' + tmdbId + '/'
      : origin + '/tv/' + tmdbId + '/' + (ctx.season || 1) + '/' + (ctx.episode || 1) + '/';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
    'X-Requested-With': 'XMLHttpRequest',
  };

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  return ctx
    .fetch(page, { headers: { 'User-Agent': ua, Referer: origin + '/' } })
    .then(function (r) {
      return r.text();
    })
    .then(function (html) {
      var text = (html.match(/\\"(?:en|token)\\":\\"([^\\"]+)\\"/) ||
        html.match(/"(?:en|token)":"([^"]+)"/) ||
        [])[1];
      if (!text) return [];
      return ctx
        .fetch(enc + '/enc-vidfast?text=' + encodeURIComponent(text), {
          headers: { 'User-Agent': ua, Accept: 'application/json' },
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var parts = validate(j);
          if (!parts || !parts.servers || !parts.stream || !parts.token) return [];
          var hdrs = Object.assign({}, headers, { 'X-CSRF-Token': parts.token || '' });
          return ctx
            .fetch(parts.servers, { method: 'POST', headers: hdrs })
            .then(function (r) {
              return r.text();
            })
            .then(function (encServers) {
              return ctx
                .fetch(enc + '/dec-vidfast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
                  body: JSON.stringify({ text: encServers }),
                })
                .then(function (r) {
                  return r.json();
                })
                .then(function (dj) {
                  var servers = validate(dj) || [];
                  var tasks = (Array.isArray(servers) ? servers : []).map(function (server) {
                    var data = server && server.data;
                    if (!data) return Promise.resolve(null);
                    return ctx
                      .fetch(parts.stream + '/' + data, { method: 'POST', headers: hdrs })
                      .then(function (r) {
                        return r.text();
                      })
                      .then(function (encStream) {
                        return ctx.fetch(enc + '/dec-vidfast', {
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
                        if (!finalUrl) return null;
                        var srvName = (server.name || 'Server') + '';
                        var is4K =
                          /2160|4k/i.test(srvName) || finalUrl.indexOf('2160p') >= 0;
                        return {
                          url: finalUrl,
                          name: 'VidFast · ' + srvName,
                          quality: is4K ? '4K' : '1080p',
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
                    return rows.filter(Boolean);
                  });
                });
            });
        });
    })
    .catch(function () {
      return [];
    });
}
