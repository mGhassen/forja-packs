// TMDB hydrate for My List legacy rows — companion to my-list-hub.
// Helpers live in `_kit.js` (shared with feed paint). Host may also call
// enrich via MetaRuntime after feed; feed itself enriches before paint.

function extract(ctx) {
  var action = hubAction(ctx);
  if (action !== 'enrich') {
    return hubFail(
      action,
      'INVALID_ACTION',
      'my-list-enrich-tmdb only supports action enrich',
    );
  }

  var params = hubParams(ctx);
  var items = Array.isArray(params.items) ? params.items : [];
  var limit = Number(params.limit) > 0 ? Number(params.limit) : items.length;

  return hubEnrichMyListRows(ctx, items, limit)
    .then(function (out) {
      return hubOk('enrich', { items: out }, { maxAge: 600, swr: 3600 });
    })
    .catch(function (e) {
      return hubFail('enrich', 'UPSTREAM', e && e.message, true);
    });
}
