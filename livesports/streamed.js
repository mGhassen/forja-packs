// Unified live_sport plugin — catalog + resolve (streamed)
// Catalog half
var SPECS = {
  "origin": "https://streamed.pk",
  "embedOrigin": "https://embed.st"
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function streamedHeaders() {
  return {
    Accept: 'application/json',
    Origin: 'https://streamed.pk',
    Referer: 'https://streamed.pk/',
    'User-Agent': ua(),
  };
}

function streamedOrigin(cfg) {
  return cfg.origin.replace(/\/$/, '');
}

async function fetchJson(ctx, path, cfg) {
  var base = streamedOrigin(cfg);
  var res = await ctx.fetch(base + path, { headers: streamedHeaders() });
  if (!res.ok) throw new Error('streamed ' + path + ' ' + res.status);
  return res.json();
}

function matchRow(m, pluginId) {
  var date = Number(m.date || 0);
  return {
    id: String(m.id || ''),
    title: String(m.title || ''),
    category: String(m.category || 'other'),
    date: date > 1e12 ? date : date * 1000,
    poster: String(m.poster || ''),
    popular: m.popular === true,
    airing: m.airing === true,
    viewers: Number(m.viewers || 0),
    sources: (m.sources || []).map(function (s) {
      return { source: String(s.source || ''), id: String(s.id || '') };
    }),
    catalog: 'forja_live',
    pluginId: pluginId,
  };
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'streamed');
  var all = await fetchJson(ctx, '/api/matches/all', cfg);
  var live = await fetchJson(ctx, '/api/matches/live', cfg);
  var byId = {};
  (Array.isArray(all) ? all : []).forEach(function (m) {
    if (m && m.id) byId[m.id] = m;
  });
  (Array.isArray(live) ? live : []).forEach(function (m) {
    if (!m || !m.id) return;
    m.airing = true;
    byId[m.id] = m;
  });
  return Object.keys(byId).map(function (k) {
    return liveCatalogStamp(matchRow(byId[k], pluginId), pluginId);
  });
}

// Resolve half
var SPECS = {
  "origin": "https://streamed.pk",
  "embedOrigin": "https://embed.st"
};

async function resolveStream(ctx, cfg) {
  var embedUrl = String(ctx.embedUrl || ctx.url || '').trim();
  var slot = parseEmbedUrl(embedUrl, cfg);
  if (!slot) {
    if (ctx.source && ctx.matchId && ctx.stream) {
      slot = {
        origin: embedOrigin(cfg),
        source: String(ctx.source),
        id: String(ctx.matchId),
        stream: String(ctx.stream),
        path: ctx.source + '/' + ctx.matchId + '/' + ctx.stream,
      };
    }
  }
  if (!slot) throw new Error('streamed resolve: missing embed slot');

  // Golf: /fetch returns a goat body but lock.wasm never yields m3u8 (Node OOB /
  // WebView empty JW). Scrape embedhd → exposestrat.st instead.
  if (slot.source === 'golf') {
    var golfUrl = await resolveGolf(ctx, slot, cfg);
    return [
      {
        url: golfUrl,
        headers: golfPlaybackHeaders(),
      },
    ];
  }

  var fetched = await postFetch(ctx, slot, cfg);
  var m3u8 = '';
  if (ctx.live && typeof ctx.live.goatUnlock === 'function') {
    m3u8 = await ctx.live.goatUnlock(fetched.bodyHex, fetched.goat, slot);
  }
  if (!m3u8) throw new Error('goat unlock failed');
  var headers = playbackHeadersForSlot(slot, cfg);
  var src = String(slot.source || '').toLowerCase();
  if (src === 'echo' || src === 'streamed') {
    if (!(await probePlayableM3u8(ctx, m3u8, headers))) {
      throw new Error('goat m3u8 not playable');
    }
  }
  return [
    {
      url: m3u8,
      headers: headers,
      directPlayback: preferDirectPlayback(m3u8),
    },
  ];
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  return resolveStream(ctx, Object.assign({}, SPECS, ctx.config || {}));
}

async function extract(ctx) {
  var action = String(ctx.action || '').trim().toLowerCase();
  if (action === 'catalog') return catalogExtract(ctx);
  if (action === 'resolve') return resolveExtract(ctx);
  // Default: prefer resolve when match/embed context is present.
  if (ctx.matchId || ctx.embedUrl || ctx.url || ctx.stream || ctx.fixtureSearch) {
    return resolveExtract(ctx);
  }
  return catalogExtract(ctx);
}
