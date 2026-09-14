// Asian Drama hub search — pack-owned (RFC-109).

function kisskhSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  return kisskhList(
    ctx,
    cfg,
    '/DramaList/Search?q=' + encodeURIComponent(q) + '&type=0',
    params.limit,
  )
    .then(function (items) {
      return hubItems('search', items, { maxAge: 300 });
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}
