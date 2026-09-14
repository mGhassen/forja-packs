// Cartoon hub search — pack-owned (RFC-109).

function cartoonSearchAjax(ctx, base, query, limit) {
  return ctx
    .fetch(base + '/wp-admin/admin-ajax.php', {
      method: 'POST',
      headers: Object.assign(cartoonHeaders(base + '/'), {
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: 'action=cartoon_search_action&term=' + encodeURIComponent(query),
    })
    .then(function (res) {
      if (!res.ok) return [];
      return res.text();
    })
    .then(function (body) {
      var $ = cartoonHtml(ctx, body);
      var fakeTerms = [];
      if ($) {
        $('.search-result-item').each(function () {
          var item = $(this);
          var a = item.find('a[href]').first();
          var img = item.find('img').first();
          if (!a.length) return;
          var href = a.attr('href') || '';
          var title = cartoonStripZw(a.text() || '');
          var poster = img.length ? img.attr('src') || '' : '';
          if (!title || !href) return;
          var epHint = item.find('small').first();
          var count = 0;
          if (epHint.length) {
            var cm = /(\d+)/.exec(epHint.text() || '');
            if (cm) count = Number(cm[1]) || 0;
          }
          fakeTerms.push({
            id: href,
            name: title,
            link: href,
            description: poster
              ? '<img src="' + poster.replace(/"/g, '') + '">'
              : '',
            count: count,
          });
        });
      }
      return cartoonGroupTerms(fakeTerms, { limit: limit, sort: 'latest' });
    })
    .catch(function () {
      return [];
    });
}

function cartoonSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  var base = cartoonBase(cfg);
  var limit = Number(params.limit) > 0 ? Number(params.limit) : 40;
  return Promise.all([
    cartoonSearchAjax(ctx, base, q, limit).catch(function () {
      return [];
    }),
    cartoonListSeries(ctx, base, {
      limit: limit,
      sort: 'popular',
      search: q,
      maxPages: 2,
    }).catch(function () {
      return [];
    }),
  ]).then(function (parts) {
    var out = [];
    var seen = {};
    for (var p = 0; p < parts.length; p++) {
      var list = parts[p] || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || !it.id || seen[it.id]) continue;
        seen[it.id] = true;
        out.push(it);
      }
    }
    return hubItems('search', hubClampList(out, limit), { maxAge: 300 });
  });
}
