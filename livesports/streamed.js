// Unified live_sport plugin — catalog + resolve (streamed)
// Catalog half (top-level)
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

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var SPECS = {
  "origin": "https://streamed.pk",
  "embedOrigin": "https://embed.st"
};

function isGoatSource(source) {
  switch (String(source || '')
    .trim()
    .toLowerCase()) {
    case 'admin':
    case 'delta':
    case 'golf':
    case 'ppv':
    case 'bravo':
      return true;
    default:
      return false;
  }
}

async function listStreamsForSlot(ctx, cfg, source, id) {
  var src = String(source || '').trim();
  var mid = String(id || '').trim();
  if (!src || !mid) return [];
  if (src.toLowerCase() === 'echo') return [];
  if (!isGoatSource(src)) return [];

  var out = [];
  var seen = {};
  try {
    var list = await fetchJson(
      ctx,
      '/api/stream/' + encodeURIComponent(src) + '/' + encodeURIComponent(mid),
      cfg,
    );
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s) continue;
        var embed = String(s.embedUrl || s.embed_url || '').trim();
        if (!embed || seen[embed]) continue;
        seen[embed] = 1;
        var streamNo =
          Number(s.streamNo || s.stream || out.length + 1) || out.length + 1;
        var label = 'Streamed ' + src;
        if (s.language) label += ' ' + s.language;
        if (s.hd === true) label += ' HD';
        out.push({
          url: embed,
          id: mid,
          name: label,
          source: src,
          language: String(s.language || ''),
          hd: s.hd === true,
          viewers: Number(s.viewers || 0),
          streamNo: streamNo,
          directPlayback: false,
        });
      }
    }
  } catch (_) {}

  // Same as Rust streamed_streams — invent embed.st when API is empty.
  if (!out.length) {
    var fallback = embedOrigin(cfg) + '/embed/' + src + '/' + mid + '/1';
    out.push({
      url: fallback,
      id: mid,
      name: 'Streamed ' + src,
      source: src,
      language: '',
      hd: false,
      viewers: 0,
      streamNo: 1,
      directPlayback: false,
    });
  }
  return out;
}

async function listStreamsForMatch(ctx, cfg, match) {
  if (!match) return [];
  var sources = Array.isArray(match.sources) ? match.sources : [];
  var out = [];
  var seen = {};
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (!s) continue;
    var rows = await listStreamsForSlot(
      ctx,
      cfg,
      s.source,
      s.id || match.id,
    );
    for (var j = 0; j < rows.length; j++) {
      if (seen[rows[j].url]) continue;
      seen[rows[j].url] = 1;
      out.push(rows[j]);
    }
  }
  return out;
}

async function loadMatchById(ctx, cfg) {
  var all = await fetchJson(ctx, '/api/matches/all', cfg);
  var live = await fetchJson(ctx, '/api/matches/live', cfg);
  var byId = {};
  (Array.isArray(all) ? all : []).forEach(function (m) {
    if (m && m.id) byId[m.id] = m;
  });
  (Array.isArray(live) ? live : []).forEach(function (m) {
    if (!m || !m.id) return;
    byId[m.id] = m;
  });
  return byId;
}

async function resolveDiscover(ctx, cfg) {
  var byId = await loadMatchById(ctx, cfg);
  var list = Object.keys(byId).map(function (k) {
    var m = byId[k];
    var date = Number(m.date || 0);
    return {
      id: String(m.id || ''),
      matchId: String(m.id || ''),
      title: String(m.title || ''),
      homeTeam: '',
      awayTeam: '',
      dateMs: date > 1e12 ? date : date * 1000,
      sources: m.sources || [],
    };
  });

  var mid = String(ctx.matchId || '').trim();
  var src = String(ctx.source || '').trim();

  // Owned goat slot — list that source only (no unlock).
  if (mid && isGoatSource(src) && ctx.fixtureSearch !== true) {
    return listStreamsForSlot(ctx, cfg, src, mid);
  }

  var hit = null;
  if (mid && ctx.fixtureSearch !== true) {
    hit = byId[mid] || null;
    if (!hit) {
      for (var k in byId) {
        if (!Object.prototype.hasOwnProperty.call(byId, k)) continue;
        var m = byId[k];
        var srcs = m.sources || [];
        for (var i = 0; i < srcs.length; i++) {
          if (String(srcs[i].id || '') === mid) {
            hit = m;
            break;
          }
        }
        if (hit) break;
      }
    }
  }
  if (!hit) {
    var soft = liveFindFixtureInList(list, ctx);
    if (soft) hit = byId[soft.id] || soft;
  }
  if (!hit) return [];
  return listStreamsForMatch(ctx, cfg, hit);
}

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
  var cfg = Object.assign({}, SPECS, ctx.config || {});

  // Unlock-on-play only when an embed URL is set. Providers discover lists.
  var embed = String(ctx.embedUrl || ctx.url || '').trim();
  if (embed) {
    return resolveStream(ctx, cfg);
  }
  return resolveDiscover(ctx, cfg);
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
