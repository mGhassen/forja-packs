var SPECS = {
  "baseUrl": "https://fsharetv.cc",
  "tmdbKey": "439c478a771f35c05022f9feabcca01c"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var baseUrl = String(cfg.baseUrl || '').replace(/\/$/, '');
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: baseUrl + '/',
  };

  if (ctx.type === 'tv' || ctx.type === 'series' || ctx.season != null) {
    return Promise.resolve([]);
  }

  function resolveImdb() {
    var imdb = ctx.imdbId ? String(ctx.imdbId).trim() : '';
    if (imdb && imdb.indexOf('tt') === 0) return Promise.resolve(imdb);
    var tmdbId = String(ctx.tmdbId || '').trim();
    if (!tmdbId) return Promise.resolve('');
    return ctx
      .fetch(
        'https://tmdb.forjahq.xyz/3/movie/' +
          encodeURIComponent(tmdbId) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
        { headers: { Accept: 'application/json', 'User-Agent': ua } },
      )
      .then(function (r) {
        if (!r.ok) return '';
        return r.json().then(function (data) {
          return data && data.imdb_id ? String(data.imdb_id) : '';
        });
      })
      .catch(function () {
        return '';
      });
  }

  return resolveImdb()
    .then(function (imdbId) {
      if (!imdbId || imdbId.indexOf('tt') !== 0) return [];
      return ctx
        .fetch(baseUrl + '/movie/' + imdbId, { headers: headers })
        .then(function (r) {
          if (!r.ok) return [];
          return r.text();
        })
        .then(function (html) {
          var match = html.match(/href="(\/w\/[^"]+)"/);
          if (!match || !match[1]) return [];
          var watchPath = match[1];
          return ctx
            .fetch(baseUrl + watchPath, { headers: headers })
            .then(function (wr) {
              if (!wr.ok) return [];
              return wr.text().then(function (watchHtml) {
                var sidMatch = watchHtml.match(
                  /(?:source_id|file_id|setSource)[\s=:\('"]+([^'"\)]+)/i,
                );
                if (!sidMatch || !sidMatch[1]) return [];
                var sourceId = sidMatch[1];
                var apiHeaders = Object.assign({}, headers, {
                  Accept: 'application/json, */*; q=0.01',
                  'X-Requested-With': 'XMLHttpRequest',
                  Referer: baseUrl + watchPath,
                });
                return ctx
                  .fetch(
                    baseUrl +
                      '/api/file/' +
                      encodeURIComponent(sourceId) +
                      '/source?trailer=Png81APqcxU&type=watch',
                    { headers: apiHeaders },
                  )
                  .then(function (jr) {
                    if (!jr.ok) return [];
                    return jr.json();
                  })
                  .then(function (json) {
                    if (!json || json.status !== 'ok') return [];
                    var groups = [];
                    var file =
                      json.data && json.data.file ? json.data.file : null;
                    if (file && Array.isArray(file.sources)) {
                      groups.push(file.sources);
                    }
                    if (file && Array.isArray(file.alternatives)) {
                      file.alternatives.forEach(function (g) {
                        if (Array.isArray(g)) groups.push(g);
                      });
                    }
                    var seen = {};
                    var rows = [];
                    groups.forEach(function (group) {
                      group.forEach(function (item) {
                        if (!item || typeof item !== 'object' || !item.src) {
                          return;
                        }
                        var rawSrc = String(item.src);
                        var srcUrl =
                          rawSrc.indexOf('http') === 0
                            ? rawSrc
                            : baseUrl + rawSrc;
                        if (seen[srcUrl]) return;
                        seen[srcUrl] = true;
                        var quality = String(item.quality || '1080');
                        var label = String(item.label || '').trim();
                        var titleParts = ['FshareTV'];
                        if (label) titleParts.push(label);
                        titleParts.push(quality + 'p');
                        rows.push({
                          url: srcUrl,
                          name: titleParts.join(' · '),
                          quality: quality + 'p',
                          headers: headers,
                        });
                      });
                    });
                    return rows;
                  });
              });
            });
        });
    })
    .catch(function () {
      return [];
    });
}
