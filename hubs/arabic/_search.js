// Arabic hub search — pack-owned (RFC-109).

function arabicSearchLaroza(ctx, cfg, query, opts) {
  opts = typeof opts === 'object' && opts ? opts : { limit: opts };
  var limit = Number(opts.limit) > 0 ? Number(opts.limit) : 40;
  var page = Number(opts.page) > 0 ? Number(opts.page) : 1;
  return arabicResolveLaroza(ctx, cfg).then(function (base) {
    var url =
      base +
      '/search.php?keywords=' +
      encodeURIComponent(query) +
      '&page=' +
      page;
    return arabicFetchHtml(ctx, url, base + '/').then(function (got) {
      var origin = arabicOrigin(got.url) || base;
      var cards = arabicParseLarozaCards(ctx, got.html, origin, false);
      var rawCount = cards.length;
      var grouped = arabicGroupLarozaSearch(cards);
      return arabicPageResult(grouped, limit, rawCount);
    });
  });
}

function arabicSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  var limit = arabicLimitOf(params, 40);
  var page = arabicPageOf(params);
  return arabicSearchLaroza(ctx, cfg, q, { page: page, limit: limit })
    .then(function (pageOut) {
      return hubItems(
        'search',
        (pageOut && pageOut.items) || [],
        { maxAge: 300 },
        {
          pageSize: (pageOut && pageOut.pageSize) || limit,
          hasMore: !!(pageOut && pageOut.hasMore),
        },
      );
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}
