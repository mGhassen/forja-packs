var SPECS = {
  api: 'https://api.wecollege.net',
  origin: 'https://www.movy.bz',
  servers: [
    { endpoint: 'miami', name: 'Miami', note: 'Original audio (Up to 4K)' },
    { endpoint: 'seattle', name: 'Seattle', note: 'Original audio' },
    { endpoint: 'denver', name: 'Denver', note: 'Original audio' },
    { endpoint: 'chicago', name: 'Chicago', note: 'Original audio' },
    { endpoint: 'dallas', name: 'Dallas', note: 'Original audio' },
    { endpoint: 'atlanta', name: 'Atlanta', note: 'Original audio' },
    { endpoint: 'houston', name: 'Houston', note: 'Original audio' },
    { endpoint: 'austin', name: 'Austin', note: 'Original audio' },
    { endpoint: 'boston', name: 'Boston', note: 'Original audio' },
    { endpoint: 'munich', name: 'Munich', note: 'German audio', extra: 'language=german' },
    { endpoint: 'berlin', name: 'Berlin', note: 'German audio' },
    { endpoint: 'paris', name: 'Paris', note: 'French audio' },
    { endpoint: 'delhi', name: 'Delhi', note: 'Hindi audio' },
    { endpoint: 'cancun', name: 'Cancun', note: 'Spanish audio' },
  ],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = String(cfg.api || '').replace(/\/$/, '');
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var servers = cfg.servers || [];
  if (!api || !origin) return Promise.resolve([]);

  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: origin + '/',
  };

  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = String(ctx.tmdbId || '');
  if (!tmdbId) return Promise.resolve([]);

  function formatQuality(raw) {
    var lower = String(raw || '').toLowerCase();
    if (lower.indexOf('2160') >= 0 || lower.indexOf('4k') >= 0) return '4K';
    if (lower.indexOf('1080') >= 0) return '1080p';
    if (lower.indexOf('720') >= 0) return '720p';
    if (lower.indexOf('480') >= 0) return '480p';
    if (lower.indexOf('360') >= 0) return '360p';
    return raw || 'Auto';
  }

  function probe(server, seed) {
    var q =
      'title=' +
      encodeURIComponent(ctx.title || '') +
      '&mediaType=' +
      mediaType +
      '&tmdbId=' +
      encodeURIComponent(tmdbId) +
      '&enc=2&seed=' +
      encodeURIComponent(seed);
    if (ctx.year) q += '&year=' + encodeURIComponent(String(ctx.year).substring(0, 4));
    if (isTv) {
      q += '&seasonId=' + (ctx.season || 1) + '&episodeId=' + (ctx.episode || 1);
    }
    if (ctx.imdbId) q += '&imdbId=' + encodeURIComponent(String(ctx.imdbId));
    if (server.extra) q += '&' + server.extra;

    return ctx
      .fetch(api + '/' + server.endpoint + '/sources?' + q, { headers: headers })
      .then(function (r) {
        return r.text();
      })
      .then(function (body) {
        body = (body || '').trim();
        if (!body || body.charAt(0) === '<') return [];
        try {
          var parsed = JSON.parse(__engineStreamDecrypt(body, seed, tmdbId));
          var srcs = (parsed && parsed.sources) || [];
          var out = [];
          var note = String(server.note || '');
          var isSpecificAudio =
            note.toLowerCase().indexOf('audio') >= 0 && note.toLowerCase().indexOf('original') < 0;
          var langLabel = isSpecificAudio ? note.split(' ')[0] : '';
          for (var i = 0; i < srcs.length; i++) {
            var s = srcs[i];
            if (!s || typeof s !== 'object') continue;
            var url = (s.url || '').toString();
            if (!url) continue;
            var quality = formatQuality(s.quality || 'Auto');
            out.push({
              url: url,
              name: isSpecificAudio
                ? 'Movy - ' + server.name + ' · ' + langLabel
                : 'Movy - ' + server.name,
              quality: quality,
              headers: playHeaders,
            });
          }
          return out;
        } catch (e) {
          return [];
        }
      })
      .catch(function () {
        return [];
      });
  }

  return ctx
    .fetch(api + '/seed?mediaId=' + encodeURIComponent(tmdbId), { headers: headers })
    .then(function (r) {
      return r.json();
    })
    .then(function (seedJson) {
      var seed = seedJson && seedJson.seed;
      if (!seed) return [];
      return Promise.all(
        servers.map(function (server) {
          return probe(server, seed);
        }),
      ).then(function (chunks) {
        var seen = {};
        var rows = [];
        for (var i = 0; i < chunks.length; i++) {
          var part = chunks[i] || [];
          for (var j = 0; j < part.length; j++) {
            var row = part[j];
            if (seen[row.url]) continue;
            seen[row.url] = true;
            rows.push(row);
          }
        }
        return rows;
      });
    })
    .catch(function () {
      return [];
    });
}
