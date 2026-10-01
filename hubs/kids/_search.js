// Kids hub search — pack-owned (RFC-109).

function kidsSearch(ctx, cfg, params) {
  var q = String(params.query || '').trim();
  if (!q) return Promise.resolve(hubItems('search', []));
  var base = kidsBase(cfg);
  var limit = Number(params.limit) > 0 ? Number(params.limit) : 40;
  var url =
    base + '/search_results.php?q=' + encodeURIComponent(q) + '&ajax=1';
  return kidsFetchJson(ctx, url, base + '/')
    .then(function (data) {
      var out = [];
      var results = (data && data.results) || {};
      var series = results.series || [];
      var movies = results.movies || [];
      var rawSeasons = [];
      for (var i = 0; i < series.length; i++) {
        var s = series[i];
        if (!s || !s.id) continue;
        var title = kidsStripZw(s.title || '');
        var href = kidsSeriesPageUrl(base, s.subtitle || '', s.id);
        rawSeasons.push({
          id: s.id,
          name: title,
          link: href,
          poster: kidsImg(cfg, s.image || ''),
          season: kidsSeasonNumber(title),
          seriesTitle: kidsSeriesTitle(title),
          seriesKey: kidsSeriesKey(title),
        });
      }
      out = out.concat(kidsGroupSeries(rawSeasons, { limit: limit }));
      for (var m = 0; m < movies.length; m++) {
        var mv = movies[m];
        if (!mv || !mv.id) continue;
        var mtitle = kidsStripZw(mv.title || '');
        var murl = kidsMoviePageUrl(base, mv.id, mv.subtitle || '');
        var meta = kidsMeta('movie', 'movie:' + mv.id, mtitle, kidsImg(cfg, mv.image || ''), {
          url: murl,
          movie: true,
        });
        if (meta) out.push(meta);
      }
      return hubItems('search', hubClampList(out, limit), { maxAge: 300 });
    })
    .catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
}
