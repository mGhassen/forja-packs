var SPECS = {
  base: 'https://dulo.mov',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || SPECS.base).replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var playbackHeaders = {
    'User-Agent': ua,
    Referer: base + '/',
    Origin: base,
  };
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  var season = Number(ctx.season || 1) || 1;
  var episode = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var title = String(ctx.title || ctx.titleEnglish || ctx.titleRomaji || '').trim();

  function encodeQs(params) {
    return Object.keys(params)
      .filter(function (k) {
        return params[k] !== '' && params[k] != null;
      })
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
      })
      .join('&');
  }

  function qualityFromLabel(label) {
    var text = String(label || '');
    if (/\b4k\b/i.test(text) || /\b2160p\b/i.test(text)) return '2160p';
    var m = text.match(/\b(\d{3,4})p\b/i);
    return m ? m[1] + 'p' : '1080p';
  }

  function subtitlesFrom(item) {
    var caps = item && Array.isArray(item.captions) ? item.captions : [];
    var rows = [];
    for (var i = 0; i < caps.length; i++) {
      var cap = caps[i];
      var url = cap && String(cap.url || '');
      if (!url || url.indexOf('http') !== 0) continue;
      rows.push({
        url: url,
        lang: String(cap.display || cap.language || 'Unknown'),
      });
    }
    return rows;
  }

  function parsePayload(data, seen) {
    var rows = [];
    var list = data && Array.isArray(data.sources) ? data.sources : [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var url = String(item.url || '');
      if (!url || url.indexOf('http') !== 0 || seen[url]) continue;
      seen[url] = true;
      var label = String(item.label || 'Source');
      var row = {
        url: url,
        name: 'Dulo Anime · ' + label,
        quality: qualityFromLabel(label),
        headers: playbackHeaders,
      };
      var subs = subtitlesFrom(item);
      if (subs.length) row.subtitles = subs;
      rows.push(row);
    }
    return rows;
  }

  function getJson(path) {
    return ctx
      .fetch(base + path, {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          Referer: base + '/',
          Origin: base,
        },
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().catch(function () {
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function fetchSources(path, extra, seen, attemptsLeft) {
    var params = {
      tmdbId: tmdbId,
      type: 'tv',
      seasonId: String(season),
      episodeId: String(episode),
    };
    Object.assign(params, extra || {});
    return getJson(path + '?' + encodeQs(params)).then(function (data) {
      var rows = parsePayload(data, seen);
      var pending = !!(data && data.pending);
      if (pending && attemptsLeft > 0) {
        return delay(rows.length ? 4000 : 2500).then(function () {
          return fetchSources(path, extra, seen, attemptsLeft - 1).then(function (more) {
            return rows.concat(more);
          });
        });
      }
      return rows;
    });
  }

  var extra = { progressive: 'true', anime: 'true' };
  if (title) extra.title = title;
  var seasonEpisodes = Number(ctx.seasonEpisodes || 0) || 0;
  if (seasonEpisodes > 0) extra.seasonEpisodes = String(seasonEpisodes);

  var seen = {};
  return Promise.all([
    fetchSources('/api/sources/additional', extra, seen, 3),
  ])
    .then(function (groups) {
      var out = [];
      for (var i = 0; i < groups.length; i++) {
        if (groups[i] && groups[i].length) out = out.concat(groups[i]);
      }
      return out;
    })
    .catch(function () {
      return [];
    });
}
