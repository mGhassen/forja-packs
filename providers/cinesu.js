// Koddo (koddo.ch): TMDB → /v1/search + embed_ref → native HLS on CDN pool.
var SPECS = {
  site: 'https://koddo.ch',
  lang: 'en',
  referer: 'https://koddo.ch/',
  origin: 'https://koddo.ch',
  // Primary stream hosts from Koddo's player bundle (XOR-decoded).
  streamHosts: [
    'arachnidly.click',
    'exogenous.click',
    'openarachnid.click',
    'theexogenous.click',
    'tryarachnid.click',
    'tryexogenous.click',
    'usearachnid.click',
    'useexogenous.click',
    'galaxyapp.click',
    'galaxyhq.click',
    'galaxyly.click',
    'getgalaxy.click',
    'getnebula.click',
    'nebulaapp.click',
    'getstellar.click',
    'meetgalaxy.click',
    'meetstellar.click',
    'nebulahq.click',
    'opengalaxy.click',
    'opennebula.click',
    'openstellar.click',
    'nebulaly.click',
    'stellarlabs.click',
    'stellarhub.click',
    'stellarhq.click',
    'stellarapp.click',
    'stellarly.click',
    'thegalaxy.click',
    'thenebula.click',
    'thestellar.click',
    'trygalaxy.click',
    'trystellar.click',
    'usegalaxy.click',
    'usenebula.click',
    'usestellar.click',
    'trynebula.click',
  ],
};

var EMBED_KEY = [17, 43, 91, 7];
var TITLE_ID_RE = /^[a-z0-9]{8}$/;

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var site = String(cfg.site || SPECS.site).replace(/\/$/, '');
  var lang = String(cfg.lang || SPECS.lang || 'en');
  var referer = cfg.referer || SPECS.referer;
  var origin = cfg.origin || SPECS.origin;
  var hosts = Array.isArray(cfg.streamHosts) && cfg.streamHosts.length
    ? cfg.streamHosts
    : SPECS.streamHosts;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var http =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch.bind(ctx);

  var tmdbId = parseInt(String(ctx.tmdbId || ''), 10);
  if (!isFinite(tmdbId) || tmdbId <= 0) return Promise.resolve([]);

  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var season = isTv ? Math.max(1, parseInt(ctx.season, 10) || 1) : 0;
  var episode = isTv ? Math.max(1, parseInt(ctx.episode, 10) || 1) : 0;
  var wantKind = isTv ? 'series' : 'movie';
  var wantYear = ctx.year != null ? String(ctx.year).slice(0, 4) : '';
  var title = String(ctx.title || ctx.englishTitle || '').trim();
  if (!title) return Promise.resolve([]);

  var jsonHeaders = {
    'User-Agent': ua,
    Accept: 'application/json',
    Referer: referer,
    Origin: origin,
  };
  var htmlHeaders = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml',
    Referer: referer,
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: referer,
    Origin: origin,
  };

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function decodeEmbedRef(arr, titleId) {
    if (!Array.isArray(arr) || !arr.length || !TITLE_ID_RE.test(titleId) || !/[a-z]/.test(titleId)) {
      return 0;
    }
    var out = '';
    for (var i = 0; i < arr.length; i++) {
      out += String.fromCharCode(
        Number(arr[i]) ^ EMBED_KEY[i % EMBED_KEY.length] ^ titleId.charCodeAt(i % titleId.length),
      );
    }
    var m = /^([1-9]\d*):([a-z0-9]{8})$/.exec(out);
    if (!m || m[2] !== titleId) return 0;
    var n = Number(m[1]);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  }

  function embedFromPayload(obj, titleId) {
    if (!obj || typeof obj !== 'object') return 0;
    var ref = obj.embed_ref || obj.embedRef;
    return Array.isArray(ref) ? decodeEmbedRef(ref, titleId) : 0;
  }

  function embedFromHtml(html, titleId) {
    var m =
      /embed_ref\\":(\[[^\]]+\])/.exec(html) ||
      /embed_ref":(\[[^\]]+\])/.exec(html) ||
      /embedRef\\":(\[[^\]]+\])/.exec(html);
    if (!m) return 0;
    try {
      return decodeEmbedRef(JSON.parse(m[1]), titleId);
    } catch (e) {
      return 0;
    }
  }

  function hashHost(seed) {
    var t = 0x811c9dc5;
    for (var i = 0; i < seed.length; i++) {
      t ^= 255 & seed.charCodeAt(i);
      t = Math.imul(t, 0x1000193) >>> 0;
    }
    t ^= t >>> 16;
    t = Math.imul(t, 0x7feb352d) >>> 0;
    t ^= t >>> 15;
    t = Math.imul(t, 0x846ca68b) >>> 0;
    return (t ^ (t >>> 16)) >>> 0;
  }

  function pickHost(titleKey) {
    var best = '';
    var bestScore = -1;
    for (var i = 0; i < hosts.length; i++) {
      var h = String(hosts[i] || '')
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .toLowerCase();
      if (!h) continue;
      var score = hashHost(titleKey + '@' + h);
      if (score > bestScore || (score === bestScore && h < best)) {
        bestScore = score;
        best = h;
      }
    }
    return best || String(hosts[0] || 'arachnidly.click');
  }

  function streamToken(titleId) {
    return isTv ? titleId + '.' + season + '.' + episode : titleId;
  }

  function streamRow(titleId) {
    var token = streamToken(titleId);
    var host = pickHost(token);
    return {
      url: 'https://' + host + '/c/v1/' + encodeURIComponent(token) + '/master.m3u8',
      name: 'Koddo · Direct Master',
      quality: '1080p',
      headers: playHeaders,
    };
  }

  function getJson(path) {
    return http(site + path, { headers: jsonHeaders })
      .then(function (r) {
        return r && r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function getText(path) {
    return http(site + path, { headers: htmlHeaders })
      .then(function (r) {
        return r && r.ok ? r.text() : '';
      })
      .catch(function () {
        return '';
      });
  }

  function verifyTitleId(titleId) {
    var apiPath = isTv
      ? '/v1/series/' + encodeURIComponent(titleId) + '?lang=' + encodeURIComponent(lang)
      : '/v1/movies/' + encodeURIComponent(titleId) + '?lang=' + encodeURIComponent(lang);
    var watchPath = isTv
      ? '/' + lang + '/watch-tv/' + encodeURIComponent(titleId)
      : '/' + lang + '/watch-movie/' + encodeURIComponent(titleId);

    return getJson(apiPath).then(function (detail) {
      var fromApi = embedFromPayload(detail, titleId);
      if (fromApi === tmdbId) return titleId;
      return getText(watchPath).then(function (html) {
        return embedFromHtml(html, titleId) === tmdbId ? titleId : '';
      });
    });
  }

  function rankCandidates(results) {
    var want = norm(title);
    var scored = [];
    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (!item || typeof item !== 'object') continue;
      var id = String(item.id || '').trim();
      var kind = String(item.kind || '').toLowerCase();
      if (!TITLE_ID_RE.test(id) || !/[a-z]/.test(id)) continue;
      if (kind && kind !== wantKind) continue;
      var year = item.year != null ? String(item.year).slice(0, 4) : '';
      if (wantYear && year && year !== wantYear) continue;
      var name = norm(item.name || item.title || '');
      if (!name) continue;
      var score = 0;
      if (name === want) score += 100;
      else if (name.indexOf(want) === 0 || want.indexOf(name) === 0) score += 60;
      else if (name.indexOf(want) >= 0 || want.indexOf(name) >= 0) score += 30;
      else continue;
      if (wantYear && year === wantYear) score += 20;
      scored.push({ id: id, score: score });
    }
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    var out = [];
    var seen = {};
    for (var j = 0; j < scored.length && out.length < 8; j++) {
      if (seen[scored[j].id]) continue;
      seen[scored[j].id] = true;
      out.push(scored[j].id);
    }
    return out;
  }

  var searchPath =
    '/v1/search/' + encodeURIComponent(title) + '?lang=' + encodeURIComponent(lang);

  return getJson(searchPath)
    .then(function (data) {
      var results =
        data && Array.isArray(data.results)
          ? data.results
          : data && Array.isArray(data.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : [];
      var ids = rankCandidates(results);
      if (!ids.length) return [];

      var chain = Promise.resolve('');
      ids.forEach(function (id) {
        chain = chain.then(function (hit) {
          if (hit) return hit;
          return verifyTitleId(id);
        });
      });
      return chain;
    })
    .then(function (titleId) {
      return titleId ? [streamRow(titleId)] : [];
    })
    .catch(function () {
      return [];
    });
}
