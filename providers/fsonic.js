var SPECS = {
  baseUrl: 'https://www.fsonic.net',
  fshareBase: 'https://fsharetv.co',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var baseUrl = String(cfg.baseUrl || '').replace(/\/$/, '');
  var fshareBase = String(cfg.fshareBase || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (ctx.type === 'tv' || ctx.type === 'series' || ctx.season != null) {
    return Promise.resolve([]);
  }
  var title = String(ctx.title || '');
  if (!title) return Promise.resolve([]);
  var yearStr = ctx.year ? String(ctx.year) : '';

  return ctx
    .fetch(baseUrl + '/movie/search/' + encodeURIComponent(title), { headers: headers })
    .then(function (r) {
      if (!r.ok) return [];
      return r.text();
    })
    .then(function (sHtml) {
      var watchSlug = null;
      var re = /href="(\/watch\/[^"]+)"/g;
      var m;
      while ((m = re.exec(sHtml))) {
        if (!watchSlug) watchSlug = m[1];
        if (yearStr && m[1].indexOf(yearStr) >= 0) {
          watchSlug = m[1];
          break;
        }
      }
      if (!watchSlug) return [];
      return ctx.fetch(baseUrl + watchSlug, { headers: headers }).then(function (wr) {
        if (!wr.ok) return [];
        return wr.text().then(function (wHtml) {
          var match = wHtml.match(/init\('([^']+)',\s*(?:'[^']*',\s*)?'([^']+)'\)/);
          if (!match) return [];
          var token = match[1];
          var trailer = match[2] || '';
          return ctx
            .fetch(
              baseUrl +
                '/api/source/' +
                encodeURIComponent(token) +
                '?trailer=' +
                encodeURIComponent(trailer) +
                '&type=watch',
              {
                headers: Object.assign({}, headers, {
                  Accept: 'application/json, text/plain, */*',
                  Referer: baseUrl + watchSlug,
                }),
              },
            )
            .then(function (jr) {
              if (!jr.ok) return [];
              return jr.json();
            })
            .then(function (json) {
              if (!json || json.status !== 'ok') return [];
              var groups = [];
              var file = json.data && json.data.file ? json.data.file : null;
              if (file && Array.isArray(file.sources)) groups.push(file.sources);
              if (file && Array.isArray(file.alternatives)) {
                file.alternatives.forEach(function (g) {
                  if (Array.isArray(g)) groups.push(g);
                });
              }
              var seen = {};
              var rows = [];
              var playHeaders = Object.assign({}, headers, { Referer: fshareBase + '/' });
              groups.forEach(function (group) {
                group.forEach(function (item) {
                  if (!item || !item.src) return;
                  var rawSrc = String(item.src);
                  var srcUrl = rawSrc.indexOf('http') === 0 ? rawSrc : fshareBase + rawSrc;
                  if (seen[srcUrl]) return;
                  seen[srcUrl] = true;
                  var quality = String(item.quality || '1080');
                  var label = String(item.label || '').trim();
                  var parts = ['FSonic'];
                  if (label) parts.push(label);
                  parts.push(quality + 'p');
                  rows.push({
                    url: srcUrl,
                    name: parts.join(' · '),
                    quality: quality + 'p',
                    headers: playHeaders,
                  });
                });
              });
              return rows;
            });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
