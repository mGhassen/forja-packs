var SPECS = {
  "api": "https://a.111477.xyz",
  "stOrigin": "https://st.111477.xyz",
  "tmdbKey": "439c478a771f35c05022f9feabcca01c",
  "limit": 3,
  "sort": "file-desc",
  "rateLimitWaitMs": 7200,
  "rateLimitRetries": 4
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = String(cfg.api).replace(/\/$/, '') + '/';
  var stOrigin = String(cfg.stOrigin).replace(/\/$/, '');
  var tmdbKey = cfg.tmdbKey;
  var limit = parseInt(cfg.limit, 10);
  var sort = cfg.sort;
  var rateLimitWaitMs = parseInt(cfg.rateLimitWaitMs, 10);
  if (!(rateLimitWaitMs > 0)) rateLimitWaitMs = 7200;
  var rateLimitRetries = parseInt(cfg.rateLimitRetries, 10);
  if (!(rateLimitRetries > 0)) rateLimitRetries = 4;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isTv = ctx.type !== 'movie';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
  };

  ctx.log('start tmdb=' + ctx.tmdbId + ' type=' + (isTv ? 'tv' : 'movie') + ' imdb=' + (ctx.imdbId || ''));

  // PlayTorrio path: st.111477.xyz Stremio-protocol addon → workers.dev/d/… URLs.
  // Do NOT scrape a.111477 HTML file links (those redirect to p.111477/bulk → CF).
  function generateManifestBaseUrl() {
    var config = api;
    if (sort && sort !== 'none') config += '::sort=' + sort;
    if (limit > 0 && limit !== 5) config += '::limit=' + limit;
    if (tmdbKey) config += '::tmdb=' + tmdbKey;
    var bytes = unescape(encodeURIComponent(config));
    var b64 = btoa(bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    return stOrigin + '/config/' + b64;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isRateLimited(status, body) {
    if (status === 429 || (status >= 500 && status < 600)) return true;
    var text = String(body || '');
    if (text.length >= 65536) return false;
    return /error\s*(?:code:?\s*)?1015|you are being rate limited/i.test(text);
  }

  function qualityWithCodecs(str) {
    if (!str) return 'Unknown';
    var qm = String(str).match(/(\d{3,4})[pP]/);
    var base = qm ? qm[1] + 'p' : 'Unknown';
    var low = String(str).toLowerCase();
    var codecs = [];
    if (/dv|dolby vision/i.test(low)) codecs.push('DV');
    if (/hdr10\+/i.test(low)) codecs.push('HDR10+');
    else if (/hdr10|hdr/i.test(low)) codecs.push('HDR');
    if (/remux/i.test(low)) codecs.push('REMUX');
    if (/imax/i.test(low)) codecs.push('IMAX');
    return codecs.length ? base + ' | ' + codecs.join(' | ') : base;
  }

  function sizeFromTitle(str) {
    var m = String(str || '').match(/\[a11\s+([^\]]+)\]/i);
    return m ? m[1].trim() : undefined;
  }

  function rowsFromStreams(streams) {
    var out = [];
    var seen = {};
    for (var i = 0; i < streams.length; i++) {
      var item = streams[i];
      if (!item || typeof item !== 'object') continue;
      var url = item.url ? String(item.url).trim() : '';
      if (!url || url.indexOf('http') !== 0) continue;
      if (seen[url]) continue;
      seen[url] = true;
      var rawTitle = item.title ? String(item.title) : '';
      var rawName = item.name ? String(item.name) : '111477';
      out.push({
        name: rawName || '111477',
        url: url,
        quality: qualityWithCodecs(rawTitle),
        size: sizeFromTitle(rawTitle),
        title: rawTitle || undefined,
        headers: {
          'User-Agent': ua,
          Accept: '*/*',
        },
        probe: 'skip',
      });
    }
    return out;
  }

  function fetchOnce(endpoint) {
    return ctx.fetch(endpoint, { headers: headers }).then(function (r) {
      return r.text().then(function (body) {
        return { status: r.status, body: body };
      });
    });
  }

  function fetchStreamsForId(addonBase, id) {
    var endpoint;
    if (isTv) {
      var s = ctx.season || 1;
      var e = ctx.episode || 1;
      endpoint = addonBase + '/stream/series/' + id + ':' + s + ':' + e + '.json';
    } else {
      endpoint = addonBase + '/stream/movie/' + id + '.json';
    }
    ctx.log('addon ' + endpoint.slice(0, 140));

    function attempt(n) {
      return fetchOnce(endpoint).then(function (res) {
        ctx.log('addon http ' + res.status + (n > 1 ? ' try=' + n : ''));
        if (res.status === 200) {
          try {
            var data = JSON.parse(res.body || '{}');
            var streams = data && data.streams ? data.streams : [];
            ctx.log('addon streams=' + streams.length + ' id=' + id);
            return rowsFromStreams(streams);
          } catch (e) {
            ctx.log('addon json fail id=' + id);
            return [];
          }
        }
        if (isRateLimited(res.status, res.body) && n <= rateLimitRetries) {
          ctx.log('addon rate-limit wait ' + rateLimitWaitMs + 'ms try=' + n);
          return sleep(rateLimitWaitMs).then(function () {
            return attempt(n + 1);
          });
        }
        return [];
      });
    }

    return attempt(1);
  }

  function resolveIds() {
    var ids = [];
    var imdb = ctx.imdbId ? String(ctx.imdbId).trim() : '';
    if (imdb && imdb.indexOf('tt') === 0) ids.push(imdb);
    if (ctx.tmdbId) ids.push('tmdb:' + String(ctx.tmdbId));
    return ids;
  }

  function run() {
    var ids = resolveIds();
    if (!ids.length) {
      ctx.log('no imdb/tmdb id');
      return Promise.resolve([]);
    }
    var addonBase = generateManifestBaseUrl();
    ctx.log('manifest ' + addonBase.slice(0, 100));
    var chain = Promise.resolve([]);
    ids.forEach(function (id) {
      chain = chain.then(function (acc) {
        if (acc.length) return acc;
        return fetchStreamsForId(addonBase, id).catch(function (e) {
          ctx.error(e && e.message ? e.message : e);
          return [];
        });
      });
    });
    return chain;
  }

  return run().catch(function (e) {
    ctx.error(e && e.message ? e.message : e);
    return [];
  });
}
