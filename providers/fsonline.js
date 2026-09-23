var SPECS = {
  origin: 'https://www3.fsonline.app',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ajaxUrl = origin + '/wp-admin/admin-ajax.php';
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Origin: origin,
    Referer: origin + '/',
  };
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var title = String(ctx.title || '');
  if (!title) return Promise.resolve([]);
  var query = ctx.year ? title + ' ' + ctx.year : title;

  return ctx
    .fetch(origin + '/?s=' + encodeURIComponent(query), { headers: headers })
    .then(function (r) {
      if (!r.ok) return [];
      return r.text();
    })
    .then(function (searchHtml) {
      var typeFolder = isTv ? 'seriale' : 'film';
      var re = new RegExp(
        'href=["\'](https?://www3\\.fsonline\\.app/' + typeFolder + '/([^"\'/]+)/)["\']',
        'i',
      );
      var linkMatch = searchHtml.match(re);
      if (!linkMatch) return [];
      var slug = linkMatch[2];
      var targetPageUrl = isTv
        ? origin +
          '/episoade/' +
          slug.replace(/-\d{4}$/, '') +
          '-sezonul-' +
          (ctx.season || 1) +
          '-episodul-' +
          (ctx.episode || 1) +
          '/'
        : linkMatch[1];
      return ctx.fetch(targetPageUrl, { headers: headers }).then(function (pr) {
        if (!pr.ok) return [];
        return pr.text().then(function (pageHtml) {
          var movieIdMatch =
            pageHtml.match(/movie-id=['"]([^'"]+)['"]/) ||
            pageHtml.match(/movie-id=([^ >]+)/);
          if (!movieIdMatch) return [];
          var movieId = movieIdMatch[1];
          return ctx
            .fetch(ajaxUrl, {
              method: 'POST',
              headers: Object.assign({}, headers, {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                Referer: targetPageUrl,
              }),
              body: 'action=lazy_player&movieID=' + encodeURIComponent(movieId),
            })
            .then(function (ar) {
              if (!ar.ok) return [];
              return ar.text();
            })
            .then(function (ajaxHtml) {
              var tasks = [];
              var idx = 0;
              while ((idx = ajaxHtml.indexOf('data-vs="', idx)) !== -1) {
                var embedStart = idx + 9;
                var embedEnd = ajaxHtml.indexOf('"', embedStart);
                if (embedEnd < 0) break;
                var embedUrl = ajaxHtml.slice(embedStart, embedEnd);
                var spanStart = ajaxHtml.indexOf('<span>', embedEnd);
                var spanEnd = ajaxHtml.indexOf('</span>', spanStart);
                var serverLabel =
                  spanStart >= 0 && spanEnd >= 0
                    ? ajaxHtml.slice(spanStart + 6, spanEnd).trim().toLowerCase()
                    : '';
                idx = spanEnd >= 0 ? spanEnd : embedEnd;
                if (serverLabel.indexOf('filesun') < 0) continue;
                tasks.push(
                  ctx
                    .fetch(embedUrl, {
                      headers: { Referer: origin, 'User-Agent': ua },
                    })
                    .then(function (er) {
                      if (!er.ok) return [];
                      return er.text();
                    })
                    .then(function (body) {
                      var m =
                        body.match(/file:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
                        body.match(/["']?file["']?:\s*["'](https?:\/\/[^"']+)["']/);
                      if (!m) return [];
                      var streamUrl = m[1].replace(/\\\//g, '/');
                      return [
                        {
                          url: streamUrl,
                          name: 'FSOnline · FileSuN · 1080p',
                          quality: '1080p',
                          headers: {
                            Referer: embedUrl,
                            Origin: 'https://player.fsonline.app',
                            'User-Agent': ua,
                          },
                        },
                      ];
                    })
                    .catch(function () {
                      return [];
                    }),
                );
              }
              return Promise.all(tasks).then(function (groups) {
                return [].concat.apply([], groups);
              });
            });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
