var SPECS = {
  origin: 'https://www.films365.org',
  auth:
    'Bearer 79a02956be35835728a044b11e2ae793149d45fb2c89cb6d029ec01aac19bfdb',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var headers = {
    Authorization: cfg.auth,
    'Content-Type': 'application/json',
    'User-Agent': 'MovieDownloader/1.0',
  };
  var title = String(ctx.title || '');
  if (!title) return [];
  var targetType = ctx.type === 'tv' || ctx.type === 'series' ? 'tv' : 'movie';

  return ctx
    .fetch(origin + '/api/mobile/search', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ query: title }),
    })
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (searchJson) {
      if (!searchJson || !searchJson.results) return [];
      var resultsObj = searchJson.results;
      var items =
        resultsObj.all || resultsObj.movies || resultsObj.tvs || [];
      if (!items.length) return [];
      var cleanSearch = title.toLowerCase().replace(/[^a-z0-9]/g, '');
      var matched = null;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type && item.type !== targetType) continue;
        var cleanItem = String(item.title || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        if (cleanItem === cleanSearch || cleanItem.indexOf(cleanSearch) >= 0) {
          matched = item;
          break;
        }
      }
      if (!matched) {
        for (var j = 0; j < items.length; j++) {
          if (items[j].type === targetType) {
            matched = items[j];
            break;
          }
        }
      }
      if (!matched) matched = items[0];
      var itemId = matched.id || matched.tmdbId;
      if (!itemId) return [];
      return ctx
        .fetch(
          origin +
            '/api/mobile/details?id=' +
            encodeURIComponent(String(itemId)) +
            '&type=' +
            targetType,
          { headers: headers },
        )
        .then(function (r) {
          if (!r.ok) return [];
          return r.json();
        })
        .then(function (detailsJson) {
          var data = detailsJson && detailsJson.data;
          if (!data) return [];
          var spoken = (data.spokenLanguages || [])
            .map(function (e) {
              return String(e).trim();
            })
            .filter(Boolean);
          var langSuffix = spoken.length ? ' · ' + spoken.join(', ') : '';
          var out = [];
          function push(url, extra) {
            if (!url) return;
            out.push({
              url: String(url),
              name: 'XDownloader' + langSuffix + (extra || ''),
            });
          }
          if (targetType === 'movie') {
            push(data.downloadUrl || data.videoUrl);
          } else {
            var seasons = data.seasons || [];
            var season = ctx.season || 1;
            var episode = ctx.episode || 1;
            var targetSeason = null;
            for (var s = 0; s < seasons.length; s++) {
              if (seasons[s].seasonNumber === season) {
                targetSeason = seasons[s];
                break;
              }
            }
            if (targetSeason) {
              var episodes = targetSeason.episodes || [];
              for (var e = 0; e < episodes.length; e++) {
                if (episodes[e].episodeNumber === episode) {
                  push(
                    episodes[e].downloadUrl || episodes[e].videoUrl,
                    ' S' + season + 'E' + episode,
                  );
                  break;
                }
              }
            }
          }
          return out;
        });
    })
    .catch(function () {
      return [];
    });
}
