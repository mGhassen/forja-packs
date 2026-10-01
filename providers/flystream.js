var SPECS = {
  origin: 'https://flystream.net',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Accept: 'application/json',
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: origin + '/',
  };
  var isTv = ctx.type === 'tv';
  var title = String(ctx.title || '');
  var tmdbId = ctx.tmdbId != null && String(ctx.tmdbId).trim() ? String(ctx.tmdbId).trim() : '';
  var imdbId = ctx.imdbId ? String(ctx.imdbId) : '';
  var year = ctx.year != null ? String(ctx.year) : '';

  function randomViewer() {
    var hex = '';
    for (var i = 0; i < 32; i++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
  }

  var params = {
    type: isTv ? 'tv' : 'movie',
    viewerId: randomViewer(),
    title: title,
  };
  if (tmdbId) params.tmdbId = tmdbId;
  if (imdbId) params.imdb = imdbId;
  if (year) params.year = year;
  if (isTv) {
    params.season = String(ctx.season || 1);
    params.episode = String(ctx.episode || 1);
  }

  var qs = Object.keys(params)
    .map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    })
    .join('&');

  return ctx
    .fetch(origin + '/api/streams?' + qs, { headers: headers })
    .then(function (r) {
      if (!r.ok) return [];
      return r.json();
    })
    .then(function (data) {
      if (!data || !Array.isArray(data.streams)) return [];
      var out = [];
      data.streams.forEach(function (s) {
        if (!s || typeof s !== 'object') return;
        var rawUrl = s.url != null ? String(s.url) : '';
        if (!rawUrl) return;
        var url = rawUrl.charAt(0) === '/' ? origin + rawUrl : rawUrl;
        if (!/^https?:\/\//i.test(url)) return;
        var quality = s.quality != null ? String(s.quality) : 'Auto';
        var codec = s.videoCodec != null ? String(s.videoCodec) : '';
        var size = s.size != null ? String(s.size) : '';
        var name = s.name != null ? String(s.name) : s.title != null ? String(s.title) : title;
        var descParts = [];
        if (quality) descParts.push(quality);
        if (codec) descParts.push(codec.toUpperCase());
        if (size) descParts.push(size);
        out.push({
          url: url,
          name: 'FlyStream ' + name + (descParts.length ? ' · ' + descParts.join(' · ') : ''),
          quality: quality !== 'Auto' ? quality : '',
          headers: playHeaders,
        });
      });
      return out;
    })
    .catch(function () {
      return [];
    });
}
