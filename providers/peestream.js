var SPECS = {
  "baseUrl": "https://providers.peestream.in"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var baseUrl = String(cfg.baseUrl || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = String(ctx.tmdbId || '').trim();
  var title = String(ctx.title || '').trim();
  if (!tmdbId) return Promise.resolve([]);

  function scrapeSse() {
    var params = [
      'type=' + encodeURIComponent(mediaType),
      'tmdbId=' + encodeURIComponent(tmdbId),
      'title=' + encodeURIComponent(title),
    ];
    if (ctx.year != null && String(ctx.year)) {
      params.push('releaseYear=' + encodeURIComponent(String(ctx.year)));
    }
    if (ctx.imdbId) {
      params.push('imdbId=' + encodeURIComponent(String(ctx.imdbId)));
    }
    if (isTv) {
      params.push('season=' + encodeURIComponent(String(ctx.season || 1)));
      params.push('episode=' + encodeURIComponent(String(ctx.episode || 1)));
    }
    var scrapeUri = baseUrl + '/scrape?' + params.join('&');

    return ctx
      .fetch(scrapeUri, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/event-stream',
          Referer: baseUrl + '/',
        },
      })
      .then(function (r) {
        if (!r.ok) return [];
        return r.text();
      })
      .then(function (body) {
        var rows = [];
        var events = String(body || '').split('\n\n');
        events.forEach(function (ev) {
          if (ev.indexOf('event: completed') < 0) return;
          var match = ev.match(/data:\s*(.+)/);
          if (!match || !match[1]) return;
          try {
            var parsed = JSON.parse(match[1].trim());
            if (!parsed || typeof parsed !== 'object' || !parsed.stream) return;
            var stream = parsed.stream;
            if (typeof stream !== 'object') return;
            var streamUrl =
              (stream.playlist && String(stream.playlist)) ||
              (stream.url && String(stream.url)) ||
              (stream.file && String(stream.file)) ||
              '';
            if (!streamUrl) return;
            var sourceId = String(parsed.sourceId || 'Poseidon');
            var quality = String(stream.quality || '1080p');
            var reqHeaders;
            if (stream.headers && typeof stream.headers === 'object') {
              reqHeaders = {};
              Object.keys(stream.headers).forEach(function (k) {
                reqHeaders[k] = String(stream.headers[k]);
              });
            } else {
              reqHeaders = { 'User-Agent': ua };
            }
            rows.push({
              url: streamUrl,
              name: 'PeeStream · ' + sourceId + ' · ' + quality,
              quality: quality,
              headers: reqHeaders,
            });
          } catch (e) {}
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  function searchFallback() {
    var params = [
      'q=' + encodeURIComponent(title),
      'type=' + encodeURIComponent(mediaType),
      'tmdbId=' + encodeURIComponent(tmdbId),
    ];
    if (isTv) {
      params.push('season=' + encodeURIComponent(String(ctx.season || 1)));
      params.push('episode=' + encodeURIComponent(String(ctx.episode || 1)));
    }
    return ctx
      .fetch(baseUrl + '/api/search?' + params.join('&'), {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          Referer: baseUrl + '/',
        },
      })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.results)) return [];
        var rows = [];
        data.results.forEach(function (result) {
          if (!result || typeof result !== 'object') return;
          var pName = String(
            result.providerName || result.provider || 'PeeStream',
          );
          if (!Array.isArray(result.streams)) return;
          result.streams.forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            var streamUrl = st.url != null ? String(st.url) : '';
            if (!streamUrl) return;
            var stName = String(st.name || pName);
            var quality = String(st.quality || '1080p');
            rows.push({
              url: streamUrl,
              name: 'PeeStream · ' + stName + ' · ' + quality,
              quality: quality,
              headers: { 'User-Agent': ua },
            });
          });
        });
        return rows;
      })
      .catch(function () {
        return [];
      });
  }

  return scrapeSse()
    .then(function (rows) {
      if (rows && rows.length) return rows;
      return searchFallback();
    })
    .catch(function () {
      return [];
    });
}
