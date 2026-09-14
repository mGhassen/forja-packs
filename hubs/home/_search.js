// Home hub search — pack-owned product (RFC-109).
// Host only opens search chrome and calls action `search`; never TMDB/addons.
// Relies on tmdb.js helpers (tmdbStructuredSearch, hubConfig, …) at call time.

var HOME_SEARCH_MAX_PAGES = 5;

function homeSearch(ctx, cfg, params) {
  var p = params || {};
  var q = String(p.query || '').trim();
  var hasFilter = p.filter != null && p.filter !== '';
  if (!q && !hasFilter) {
    return Promise.resolve(hubItems('search', [])[0]);
  }

  var page = Number(p.page) > 0 ? Number(p.page) : 1;
  var pageSize =
    Number(p.limit) > 0
      ? Number(p.limit)
      : Number((cfg && cfg.pageSize) || 20) || 20;

  // Page 1 keeps structured fan-in (multi + discover). Later pages: multi only.
  var searchParams = Object.assign({}, p, { limit: pageSize });
  var fetch =
    page <= 1
      ? tmdbStructuredSearch(ctx, cfg, searchParams)
      : homeSearchMultiPage(ctx, cfg, searchParams, page);

  return fetch.then(function (items) {
    var list = Array.isArray(items) ? items : [];
    var painted = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      painted.push(hubPaintPoster(list[i]));
    }
    var hasMore = page < HOME_SEARCH_MAX_PAGES && painted.length >= pageSize;
    return hubItems(
      'search',
      painted,
      { maxAge: 300 },
      { pageSize: pageSize, hasMore: hasMore },
    )[0];
  });
}

function homeSearchMultiPage(ctx, cfg, params, page) {
  var trimmed = String(params.query || '').trim();
  if (!trimmed) return Promise.resolve([]);
  var limit = Number(params.limit) > 0 ? Number(params.limit) : 20;
  return tmdbSearchMultiPage(ctx, cfg, trimmed, page).then(function (json) {
    var rows = (json && json.results) || [];
    var out = [];
    var seen = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row && row.media_type === 'person') continue;
      var meta = tmdbMeta(cfg, row, '');
      if (!meta) continue;
      var key = meta.type + ':' + (meta.ids && meta.ids.tmdb);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(meta);
      if (out.length >= limit) break;
    }
    return out;
  });
}
