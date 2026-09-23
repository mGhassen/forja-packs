var SPECS = {
  origin: 'https://api.peestream.in',
  referer: 'https://peestream.in/',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var referer = String(cfg.referer || 'https://peestream.in/');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json',
    Referer: referer,
  };
  var playHeaders = { 'User-Agent': ua };
  var isTv = ctx.type === 'tv';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';
  if (!tmdbId) return Promise.resolve([]);

  var providers = [
    { id: 'vaplayer', name: 'Zephyr' },
    { id: 'castle', name: 'Atlas' },
    { id: 'hera', name: 'Luna' },
    { id: 'multivid', name: 'Volt' },
    { id: 'netmirror', name: 'Echo' },
    { id: 'vidsuper-castle', name: 'Rift' },
    { id: 'vidsuper-vixsrc', name: 'Quill' },
  ];

  function fetchProvider(p) {
    var qs =
      'q=' +
      encodeURIComponent(tmdbId) +
      '&type=' +
      encodeURIComponent(mediaType) +
      '&provider=' +
      encodeURIComponent(p.id);
    if (isTv) {
      qs +=
        '&season=' +
        encodeURIComponent(String(ctx.season || 1)) +
        '&episode=' +
        encodeURIComponent(String(ctx.episode || 1));
    }
    return ctx
      .fetch(origin + '/api/search?' + qs, { headers: headers })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.results)) return [];
        var rows = [];
        data.results.forEach(function (result) {
          if (!result || !Array.isArray(result.streams)) return;
          result.streams.forEach(function (stream) {
            if (!stream || typeof stream !== 'object') return;
            var sUrl = stream.url != null ? String(stream.url) : '';
            if (!sUrl) return;
            var quality =
              stream.quality != null ? String(stream.quality) : '1080p';
            rows.push({
              url: sUrl,
              name: 'FRAME ' + p.name + ' · ' + quality,
              quality: quality,
              headers: playHeaders,
            });
          });
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  return Promise.all(providers.map(fetchProvider))
    .then(function (groups) {
      return [].concat.apply([], groups);
    })
    .catch(function () {
      return [];
    });
}
