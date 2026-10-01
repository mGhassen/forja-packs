var SPECS = {
  origin: 'https://movienig.ht',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Referer: origin + '/',
    Origin: origin,
    Accept: 'text/event-stream',
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
  var idToUse = tmdbId || imdbId;
  if (!idToUse) return Promise.resolve([]);

  var priorityServers = [
    { id: 'dallas', label: 'Dallas 4K' },
    { id: 'austin', label: 'Austin' },
    { id: 'helena', label: 'Helena' },
    { id: 'seattle', label: 'Seattle 4K' },
    { id: 'vixsrc-1', label: 'Newport Beach' },
    { id: 'tucson', label: 'Tucson' },
    { id: 'salem', label: 'Salem' },
  ];

  function buildUrl(serverId) {
    var yearQuery = year ? '&year=' + encodeURIComponent(year) : '';
    var imdbQuery = imdbId ? '&imdbId=' + encodeURIComponent(imdbId) : '';
    var encTitle = encodeURIComponent(title);
    if (isTv) {
      var s = ctx.season || 1;
      var e = ctx.episode || 1;
      return (
        origin +
        '/api/stream/v1/tv/' +
        encodeURIComponent(idToUse) +
        '/' +
        s +
        '/' +
        e +
        '?title=' +
        encTitle +
        yearQuery +
        imdbQuery +
        '&server=' +
        encodeURIComponent(serverId) +
        '&only=1'
      );
    }
    return (
      origin +
      '/api/stream/v1/movie/' +
      encodeURIComponent(idToUse) +
      '?title=' +
      encTitle +
      yearQuery +
      imdbQuery +
      '&server=' +
      encodeURIComponent(serverId) +
      '&only=1'
    );
  }

  function parseSse(body) {
    var bodyStr = String(body || '');
    if (bodyStr.indexOf('event: done') === -1) return [];
    var doneIdx = bodyStr.indexOf('event: done');
    var dataIdx = bodyStr.indexOf('data: ', doneIdx);
    if (dataIdx === -1) return [];
    var jsonStart = dataIdx + 6;
    var jsonEnd = bodyStr.indexOf('\n', jsonStart);
    var jsonText = (jsonEnd !== -1 ? bodyStr.substring(jsonStart, jsonEnd) : bodyStr.substring(jsonStart)).trim();
    var data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      return [];
    }
    return Array.isArray(data && data.sources) ? data.sources : [];
  }

  function fetchServer(server) {
    return ctx
      .fetch(buildUrl(server.id), { headers: headers })
      .then(function (r) {
        if (!r.ok) return [];
        return r.text();
      })
      .then(function (body) {
        var sources = parseSse(body);
        var rows = [];
        sources.forEach(function (src) {
          if (!src || typeof src !== 'object') return;
          var rawUrl = src.url != null ? String(src.url) : '';
          if (!rawUrl) return;
          var quality = src.quality != null ? String(src.quality) : 'Auto';
          var titleQuality = quality !== 'Auto' ? ' (' + quality + ')' : '';
          rows.push({
            url: rawUrl,
            name: 'MovieNight ' + server.label + titleQuality,
            quality: quality !== 'Auto' ? quality : '',
            headers: playHeaders,
          });
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  return Promise.all(priorityServers.map(fetchServer))
    .then(function (groups) {
      return [].concat.apply([], groups);
    })
    .catch(function () {
      return [];
    });
}
