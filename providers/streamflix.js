var SPECS = {
  "api": "https://api.streamflix.app",
  "configPath": "/config/config-streamflix2.json",
  "tmdbKey": "439c478a771f35c05022f9feabcca01c"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = cfg.api.replace(/\/$/, '');
  var configPath = String(cfg.configPath || '/config/config-streamflix2.json');
  if (configPath.charAt(0) !== '/') configPath = '/' + configPath;
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    Referer: api + '/',
  };
  var isTv = ctx.type !== 'movie';
  var tmdbId = String(ctx.tmdbId || '').trim();

  function getJson(url) {
    return ctx.fetch(url, { headers: headers }).then(function (r) {
      return r.json();
    });
  }

  function uniqueBases() {
    var out = [];
    var seen = {};
    for (var i = 0; i < arguments.length; i++) {
      (arguments[i] || []).forEach(function (base) {
        var k = String(base || '')
          .trim()
          .replace(/\/$/, '');
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(k);
      });
    }
    return out;
  }

  function rowsFrom(bases, path, quality) {
    return (bases || [])
      .filter(Boolean)
      .map(function (base) {
        return {
          url: String(base).replace(/\/$/, '') + '/' + String(path).replace(/^\//, ''),
          name: 'StreamFlix',
          quality: quality || '',
          headers: { 'User-Agent': ua, Referer: api + '/' },
        };
      });
  }

  function tmdbTitle() {
    if (String(ctx.title || '').trim()) {
      return Promise.resolve({ title: String(ctx.title).trim(), year: String(ctx.year || '').substring(0, 4) });
    }
    var kind = isTv ? 'tv' : 'movie';
    return getJson(
      'https://tmdb.forjahq.xyz/3/' +
        kind +
        '/' +
        encodeURIComponent(tmdbId) +
        '?api_key=' +
        encodeURIComponent(tmdbKey),
    ).then(function (d) {
      return {
        title: (isTv ? d.name : d.title) || '',
        year: String((isTv ? d.first_air_date : d.release_date) || '').substring(0, 4),
      };
    });
  }

  function normTitle(t) {
    return String(t || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Catalog mixes movies and shows, and TMDB ids overlap across the two.
  // Match only entries of the requested kind: by TMDB id, else by exact title (+ year when known).
  function pickBest(catalog, meta) {
    var sameKind = catalog.filter(function (item) {
      return !!(item && item.isTV) === isTv;
    });
    if (tmdbId) {
      var byTmdb = sameKind.filter(function (item) {
        return String(item.tmdb || '') === tmdbId;
      })[0];
      if (byTmdb) return byTmdb;
    }
    var q = normTitle(meta.title);
    if (!q) return null;
    var year = String(meta.year || '');
    return (
      sameKind.filter(function (item) {
        if (normTitle(item.moviename) !== q) return false;
        return !year || !item.movieyear || String(item.movieyear) === year;
      })[0] || null
    );
  }

  // CDN answers 307 → 404 for missing files; keep only rows that resolve.
  function liveRows(rows) {
    return Promise.all(
      rows.map(function (row) {
        return ctx
          .fetch(row.url, { method: 'HEAD', headers: row.headers })
          .then(function (r) {
            return r && r.ok ? row : null;
          })
          .catch(function () {
            return null;
          });
      }),
    ).then(function (out) {
      return out.filter(Boolean);
    });
  }

  return Promise.all([getJson(api + '/data.json'), getJson(api + configPath), tmdbTitle()])
    .then(function (triple) {
      var catalog = (triple[0] && triple[0].data) || [];
      var config = triple[1] || {};
      var meta = triple[2] || {};
      var best = pickBest(catalog, meta);
      if (!best) return [];
      if (!isTv) {
        if (!best.movielink) return [];
        var movieBases = uniqueBases(config.premium, config.movies, config.download);
        return liveRows(rowsFrom(movieBases, best.movielink, '1080p'));
      }
      var tvBases = uniqueBases(config.premium, config.tv, config.download);
      if (!tvBases.length || !best.moviekey) return [];
      var s = ctx.season || 1;
      var e = ctx.episode || 1;
      return liveRows(rowsFrom(tvBases, 'tv/' + best.moviekey + '/s' + s + '/episode' + e + '.mkv', '1080p'));
    })
    .catch(function () {
      return [];
    });
}
