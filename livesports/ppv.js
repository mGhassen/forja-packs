// Unified live_sport plugin — catalog + resolve (ppv)
// Catalog half (top-level)
var SPECS = {
  "webOrigin": "https://ppv.st",
  "apis": [
    "https://api.ppv.st/api/streams",
    "https://api.ppv.cx/api/streams",
    "https://api.ppv.is/api/streams",
    "https://api.ppv.lc/api/streams",
    "https://api.ppv.tj/api/streams",
    "https://api.ppvs.pk/api/streams",
    "https://api.ppv.rw/api/streams",
    "https://api.ppv.ms/api/streams",
    "https://api.ppv.bi/api/streams",
    "https://api.ppv.ug/api/streams"
  ]
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function originForApi(api, fallback) {
  try {
    var host = new URL(String(api || '')).hostname || '';
    if (host.indexOf('api.') === 0) return 'https://' + host.slice(4);
  } catch (_) {}
  return String(fallback || SPECS.webOrigin || 'https://ppv.st').replace(/\/$/, '');
}

function ppvHeaders(cfg) {
  var origin = cfg.webOrigin.replace(/\/$/, '');
  return {
    Accept: 'application/json',
    Origin: origin,
    Referer: origin + '/',
    'User-Agent': ua(),
  };
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'ppv');
  var apis = cfg.apis || SPECS.apis.slice();
  for (var i = 0; i < apis.length; i++) {
    try {
      var headers = ppvHeaders({
        webOrigin: originForApi(apis[i], cfg.webOrigin),
      });
      var res = await ctx.fetch(apis[i], { headers: headers });
      if (!res.ok) continue;
      var data = await res.json();
      if (!data || data.success !== true || !Array.isArray(data.streams)) continue;
      var rows = [];
      data.streams.forEach(function (cat) {
        var category = String(cat.category || 'Other');
        (cat.streams || []).forEach(function (s) {
          if (s.id == null) return;
          var starts = Number(s.starts_at || 0);
          rows.push({
            id: 'ppv_' + String(s.id),
            title: String(s.name || ''),
            category: category.toLowerCase().replace(/\s+/g, '-'),
            date: starts > 0 ? starts * 1000 : 0,
            poster: String(s.poster || ''),
            popular: Number(s.viewers || 0) > 50,
            airing: Number(s.viewers || 0) > 0,
            viewers: Number(s.viewers || 0),
            starts_at: Number(s.starts_at || 0),
            ends_at: Number(s.ends_at || 0),
            category_name: category,
            always_live: s.always_live === true,
            sources: [{
              source: 'ppv',
              id: String(s.id),
            }],
            catalog: 'forja_live',
            pluginId: pluginId,
          });
        });
      });
      if (rows.length) {
        return rows.map(function (r) {
          return liveCatalogStamp(r, pluginId);
        });
      }
    } catch (e) {
      ctx.error(e);
    }
  }
  return [];
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var SPECS = {
  "webOrigin": "https://ppv.st",
  "apis": [
    "https://api.ppv.st/api/streams",
    "https://api.ppv.cx/api/streams",
    "https://api.ppv.is/api/streams",
    "https://api.ppv.lc/api/streams",
    "https://api.ppv.tj/api/streams",
    "https://api.ppvs.pk/api/streams",
    "https://api.ppv.rw/api/streams",
    "https://api.ppv.ms/api/streams",
    "https://api.ppv.bi/api/streams",
    "https://api.ppv.ug/api/streams"
  ]
};

function defaultPpvApis() {
  return SPECS.apis.slice();
}

function originForApi(api, fallback) {
  try {
    var host = new URL(String(api || '')).hostname || '';
    if (host.indexOf('api.') === 0) return 'https://' + host.slice(4);
  } catch (_) {}
  return String(fallback || SPECS.webOrigin || 'https://ppv.st').replace(/\/$/, '');
}

function ppvHeaders(cfg) {
  var origin = ((cfg && cfg.webOrigin) || 'https://ppv.st').replace(/\/$/, '');
  return {
    Accept: 'application/json',
    Origin: origin,
    Referer: origin + '/',
    'User-Agent': ua(),
  };
}

function ppvIframesFromDetail(data) {
  if (!data) return [];
  var sources = data.sources;
  if (!Array.isArray(sources)) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (!s) continue;
    var url = String(s.data || s.url || '').trim();
    if (!url || !/^https?:/i.test(url) || seen[url]) continue;
    seen[url] = 1;
    out.push(url);
  }
  return out;
}

function ppvPlayableUrl(data) {
  if (!data) return '';
  var fields = [data.m3u8, data.source, data.vip_mpegts];
  for (var i = 0; i < fields.length; i++) {
    var url = String(fields[i] || '').trim();
    if (url && /\.m3u8|\.mp4/i.test(url)) return url;
  }
  return '';
}

async function unlockPpvEmbed(ctx, iframe, cfg, headers) {
  var raw = String(iframe || '').trim();
  if (!raw) return null;
  // Direct HLS from the detail API is handled above; embed pages must unlock
  // to a native URL — never hand iframe HTML to the player.
  if (/\.m3u8|\.mp4/i.test(raw)) {
    return {
      url: raw,
      headers: headers || ppvHeaders(cfg),
      directPlayback: true,
    };
  }
  try {
    if (isEmbedIndiaUrl(raw)) {
      var embedIndia = await resolveEmbedIndia(ctx, raw, cfg);
      if (embedIndia && embedIndia.length) return embedIndia[0];
    }
    if (raw.indexOf('embed.st') >= 0) {
      var embedResolved = await resolveGoatEmbed(ctx, raw, cfg);
      if (embedResolved && embedResolved.length) return embedResolved[0];
    }
    if (isSportsEmbedUrl(raw) && ctx.live && typeof ctx.live.sportsEmbedUnlock === 'function') {
      var unlockedUrl = await ctx.live.sportsEmbedUnlock(raw);
      if (unlockedUrl) {
        var origin = '';
        try {
          origin = new URL(raw).origin;
        } catch (_) {}
        return {
          url: String(unlockedUrl),
          headers: {
            Referer: raw,
            Origin: origin || 'https://sportsembed.su',
            'User-Agent': ua(),
          },
          directPlayback: preferDirectPlayback(unlockedUrl),
        };
      }
    }
  } catch (_) {}
  return null;
}

async function listPpv(ctx, cfg) {
  var streamId = String(ctx.matchId || (cfg && cfg.streamId) || '').replace(/^ppv_/, '');
  var headers = ppvHeaders(cfg);
  var out = [];
  var seen = {};

  if (!streamId) return out;

  var apis = (cfg && cfg.apis) || defaultPpvApis();
  for (var i = 0; i < apis.length; i++) {
    try {
      var apiHeaders = ppvHeaders({
        webOrigin: originForApi(apis[i], cfg && cfg.webOrigin),
      });
      var base = apis[i].replace(/\/$/, '');
      var detail = await ctx.fetch(base + '/' + streamId, { headers: apiHeaders });
      if (!detail.ok) continue;
      var body = await detail.json();
      if (!body || body.success !== true || !body.data) continue;
      headers = apiHeaders;
      var direct = ppvPlayableUrl(body.data);
      if (direct && !seen[direct]) {
        seen[direct] = 1;
        out.push({
          url: direct,
          name: 'PPV',
          headers: headers,
          directPlayback: true,
        });
      }
      var fromDetail = ppvIframesFromDetail(body.data);
      for (var j = 0; j < fromDetail.length; j++) {
        var embed = fromDetail[j];
        if (!embed || seen[embed]) continue;
        seen[embed] = 1;
        out.push({
          url: embed,
          name: 'PPV',
          headers: headers,
          directPlayback: false,
        });
      }
      break;
    } catch (_) {}
  }
  return out;
}

async function resolvePpvByFixture(ctx, cfg) {
  var apis = (cfg && cfg.apis) || defaultPpvApis();
  var list = [];
  for (var i = 0; i < apis.length; i++) {
    try {
      var headers = ppvHeaders({
        webOrigin: originForApi(apis[i], cfg && cfg.webOrigin),
      });
      var res = await ctx.fetch(apis[i], { headers: headers });
      if (!res.ok) continue;
      var data = await res.json();
      if (!data || data.success !== true || !Array.isArray(data.streams)) continue;
      data.streams.forEach(function (cat) {
        (cat.streams || []).forEach(function (s) {
          if (s.id == null) return;
          list.push({
            id: 'ppv_' + String(s.id),
            matchId: String(s.id),
            title: String(s.name || ''),
            homeTeam: '',
            awayTeam: '',
            dateMs: Number(s.starts_at || 0) ? Number(s.starts_at) * 1000 : 0,
          });
        });
      });
      break;
    } catch (_) {}
  }
  var hit = liveFindFixtureInList(list, ctx);
  if (!hit) return [];
  return listPpv(
    Object.assign({}, ctx, {
      matchId: String(hit.matchId || hit.id || '').replace(/^ppv_/, ''),
      fixtureSearch: false,
    }),
    cfg,
  );
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, SPECS, ctx.config || {});

  // Unlock-on-play only when an embed URL is set. Providers discover lists.
  var embed = String(ctx.embedUrl || ctx.iframe || ctx.url || '').trim();
  if (embed) {
    var row = await unlockPpvEmbed(ctx, embed, cfg, ppvHeaders(cfg));
    return row && row.url ? [row] : [];
  }

  var mid = String(ctx.matchId || '').replace(/^ppv_/, '');
  if (!mid || ctx.fixtureSearch === true) {
    return resolvePpvByFixture(ctx, cfg);
  }
  return listPpv(ctx, cfg);
}
  return resolveExtract;
})();

async function extract(ctx) {
  var action = String(ctx.action || '').trim().toLowerCase();
  if (action === 'catalog') return catalogExtract(ctx);
  if (action === 'resolve') return __resolveExtract(ctx);
  if (ctx.matchId || ctx.embedUrl || ctx.url || ctx.stream || ctx.fixtureSearch) {
    return __resolveExtract(ctx);
  }
  return catalogExtract(ctx);
}
