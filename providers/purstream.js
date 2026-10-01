var SPECS = {
  domain: 'https://purstream.club',
  apiBase: 'https://api.purstream.club/api/v1',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var domain = String(cfg.domain || '').replace(/\/$/, '');
  var apiBase = String(cfg.apiBase || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    Referer: domain + '/',
    Origin: domain,
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: domain + '/',
  };
  var isTv = ctx.type === 'tv';
  var mediaType = isTv ? 'tv' : 'movie';
  var title = String(ctx.title || '');
  var year = ctx.year != null ? String(ctx.year) : '';
  if (!title) return Promise.resolve([]);

  return ctx
    .fetch(apiBase + '/search-bar/search/' + encodeURIComponent(title), {
      headers: headers,
    })
    .then(function (r) {
      if (!r.ok) throw new Error('search');
      return r.json();
    })
    .then(function (searchData) {
      var items =
        searchData &&
        searchData.data &&
        searchData.data.items &&
        searchData.data.items.movies &&
        searchData.data.items.movies.items;
      if (!Array.isArray(items) || !items.length) return [];

      var lowerTitle = title.toLowerCase();
      var match = null;
      var i;
      for (i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || typeof item !== 'object') continue;
        var itemType = item.type != null ? String(item.type) : '';
        var itemTitle = item.title != null ? String(item.title).toLowerCase() : '';
        var releaseDate = item.release_date != null ? String(item.release_date) : '';
        if (itemType === mediaType && itemTitle === lowerTitle) {
          if (!year || (releaseDate && releaseDate.indexOf(year) === 0)) {
            match = item;
            break;
          }
        }
      }
      if (!match) {
        for (i = 0; i < items.length; i++) {
          if (items[i] && String(items[i].type) === mediaType) {
            match = items[i];
            break;
          }
        }
      }
      if (!match || match.id == null) return [];

      var matchId = String(match.id);
      var streamUrl = isTv
        ? apiBase +
          '/stream/' +
          matchId +
          '/episode?season=' +
          (ctx.season || 1) +
          '&episode=' +
          (ctx.episode || 1)
        : apiBase + '/stream/' + matchId;

      return ctx.fetch(streamUrl, { headers: headers }).then(function (r) {
        if (!r.ok) return [];
        return r.json().then(function (sJson) {
          if (!sJson || sJson.type !== 'success') return [];
          var sources =
            sJson.data && sJson.data.items && sJson.data.items.sources;
          if (!Array.isArray(sources) || !sources.length) return [];
          var out = [];
          sources.forEach(function (src) {
            if (!src || typeof src !== 'object') return;
            var sUrl = src.stream_url != null ? String(src.stream_url) : '';
            if (!sUrl) return;
            var rawName = src.source_name != null ? String(src.source_name) : 'Purstream';
            var cleanName = rawName
              .replace(/^\s*\|\s*/, '')
              .replace(/\s*\|\s*/g, ' · ')
              .trim();
            var sQuality = src.quality != null ? String(src.quality) : 'Auto';
            var titleQuality =
              sQuality !== 'Auto' && cleanName.indexOf(sQuality) === -1
                ? ' · ' + sQuality
                : '';
            out.push({
              url: sUrl,
              name: 'Purstream · ' + cleanName + titleQuality,
              quality: sQuality !== 'Auto' ? sQuality : '',
              headers: playHeaders,
            });
          });
          return out;
        });
      });
    })
    .catch(function () {
      return [];
    });
}
