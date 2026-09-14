// Anime hub search — pack-owned (RFC-109).

function anilistSearch(ctx, cfg, params) {
  return anilistPage(ctx, cfg, params)
    .then(function (items) {
      var perPage =
        Number(params.limit) > 0
          ? Number(params.limit)
          : Number(cfg.perPage) || 24;
      return hubItems(
        'search',
        items,
        { maxAge: 900, swr: 3600 },
        { pageSize: perPage },
      );
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}
