var SPECS = {
  origin: 'https://lmscript.xyz',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json',
  };
  var playHeaders = { 'User-Agent': ua };

  // Movies only
  if (ctx.type === 'tv' || ctx.season != null) return Promise.resolve([]);

  var title = String(ctx.title || '');
  if (!title) return Promise.resolve([]);
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';

  return ctx
    .fetch(
      origin +
        '/v1/movies?filters[q]=' +
        encodeURIComponent(title) +
        '&expand=streams',
      { headers: headers },
    )
    .then(function (r) {
      if (!r.ok) return [];
      return r.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.items) || !data.items.length) return [];
      var items = data.items;
      var movie = null;
      var i;

      if (tmdbId) {
        for (i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it || typeof it !== 'object') continue;
          if (
            String(it.tmdb_prefix) === tmdbId ||
            String(it.tmdb_id) === tmdbId
          ) {
            movie = it;
            break;
          }
        }
      }

      if (!movie) {
        var lower = title.toLowerCase();
        for (i = 0; i < items.length; i++) {
          if (
            items[i] &&
            items[i].title != null &&
            String(items[i].title).toLowerCase() === lower
          ) {
            movie = items[i];
            break;
          }
        }
      }
      if (!movie) movie = items[0];
      if (!movie || !movie.streams || typeof movie.streams !== 'object') return [];

      var out = [];
      Object.keys(movie.streams).forEach(function (quality) {
        var streamUrl = movie.streams[quality] != null ? String(movie.streams[quality]) : '';
        if (!streamUrl) return;
        out.push({
          url: streamUrl,
          name: 'LMScript · ' + quality,
          quality: quality,
          headers: playHeaders,
        });
      });
      return out;
    })
    .catch(function () {
      return [];
    });
}
