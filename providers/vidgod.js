var SPECS = {
  "redisUrl": "https://vidnest-redis-fell-prism-rest.cloud.layerbase.dev/",
  "redisAuth": "Bearer ve8z9XSKatu74M7FjLU8eQ29",
  "origin": "https://vidgod.space",
  "servers": [
    {
      "name": "Pulsar",
      "key": "pulsar",
      "base": "https://vidnest-extractor.vividdubbing.workers.dev/api",
      "param": "prime"
    },
    {
      "name": "Orion",
      "key": "orion",
      "base": "https://404-vidnest.lofiserver.workers.dev/api",
      "param": "gama"
    },
    {
      "name": "Stellar",
      "key": "stellar",
      "base": "https://404-vidnest.lofiserver.workers.dev/api",
      "param": "sigma"
    }
  ]
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var redisUrl = cfg.redisUrl;
  var redisAuth = cfg.redisAuth;
  var origin = cfg.origin || 'https://vidgod.space';
  var servers = Array.isArray(cfg.servers) ? cfg.servers : SPECS.servers;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var mediaType = isTv ? 'tv' : 'movie';
  var tmdbId = String(ctx.tmdbId || '').trim();
  if (!tmdbId) return Promise.resolve([]);
  var season = ctx.season || 1;
  var episode = ctx.episode || 1;

  function getFromCache(serverKey) {
    var cacheKey =
      mediaType === 'tv'
        ? serverKey + ':' + mediaType + ':' + tmdbId + ':' + season + ':' + episode
        : serverKey + ':' + mediaType + ':' + tmdbId;
    return ctx
      .fetch(redisUrl, {
        method: 'POST',
        headers: {
          Authorization: redisAuth,
          'Content-Type': 'application/json',
          Accept: '*/*',
          Origin: origin,
          Referer: origin + '/',
          'User-Agent': ua,
        },
        body: JSON.stringify(['GET', cacheKey]),
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (data) {
          if (!data || data.result == null) return null;
          var rawResult = data.result;
          var parsed =
            typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
          if (
            parsed &&
            typeof parsed === 'object' &&
            Array.isArray(parsed.streams) &&
            parsed.streams.length
          ) {
            return parsed;
          }
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function fetchFromWorker(srv) {
    var base = String(srv.base || '').replace(/\/$/, '');
    var param = srv.param;
    var endpoint =
      mediaType === 'movie'
        ? base + '/movie/' + tmdbId + '?server=' + encodeURIComponent(param)
        : base +
          '/tv/' +
          tmdbId +
          '/' +
          season +
          '/' +
          episode +
          '?server=' +
          encodeURIComponent(param);
    return ctx
      .fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          Origin: origin,
          Referer: origin + '/',
          'User-Agent': ua,
        },
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json().then(function (data) {
          if (
            data &&
            typeof data === 'object' &&
            Array.isArray(data.streams) &&
            data.streams.length
          ) {
            return data;
          }
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function resolveServer(srv) {
    return getFromCache(srv.key).then(function (cached) {
      if (cached) {
        return { serverName: srv.name, streams: cached.streams };
      }
      return fetchFromWorker(srv).then(function (live) {
        if (!live) return null;
        return { serverName: srv.name, streams: live.streams };
      });
    });
  }

  return Promise.all(servers.map(resolveServer))
    .then(function (results) {
      var rows = [];
      var playHeaders = {
        'User-Agent': ua,
        Referer: origin + '/',
        Origin: origin,
      };
      results.forEach(function (r) {
        if (!r || !Array.isArray(r.streams)) return;
        r.streams.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var streamUrl = item.url != null ? String(item.url) : '';
          if (!streamUrl) return;
          var quality = String(item.quality || '1080p');
          rows.push({
            url: streamUrl,
            name: 'VidGod · ' + r.serverName + ' · ' + quality,
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
