// Downloads hub — cards of titles saved on this device.

function downloadsLoadFeed(ctx) {
  var host = ctx && ctx.host;
  var downloads = host && host.downloads;
  if (!downloads || typeof downloads.titles !== 'function') {
    return Promise.resolve([]);
  }
  return Promise.resolve(downloads.titles()).then(function (rows) {
    if (!Array.isArray(rows)) rows = [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || typeof row !== 'object') continue;
      var kind = String(row.kind || row.type || 'movie');
      var item = {
        id: String(row.id || ''),
        type: kind,
        kind: kind,
        name: String(row.name || ''),
        poster: String(row.poster || ''),
        releaseInfo: String(row.releaseInfo || row.year || ''),
        open: row.open,
      };
      out.push(hubPaintPoster(item));
    }
    return out;
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  if (action === 'layout') {
    return hubOk('layout', downloadsLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'feed' || action === 'rail') {
    return downloadsLoadFeed(ctx).then(function (items) {
      return hubItems(action, items, { maxAge: 5, swr: 15 });
    });
  }
  return hubFail(action, 'INVALID_ACTION', 'downloads hub: layout + feed only');
}
