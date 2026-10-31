// Unified live_sport plugin — catalog + resolve (timstreams)
// Catalog half (top-level)
// .top is dead; primary + mirror from site banner / mirrors page.
var SPECS = {
  origins: ['https://tim-streams.com', 'https://timstreams.co.rw'],
  // Channel genre id 2 = Sports (site Live TV).
  sportsChannelGenre: 2,
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

var GENRE_MAP = {
  1: 'football',
  2: 'motorsport',
  3: 'mma',
  4: 'hockey',
  5: 'mma',
  6: 'tennis',
  7: 'basketball',
  8: 'american-football',
  9: 'baseball',
};

function normCategory(raw) {
  var s = String(raw || 'other').toLowerCase();
  if (s.indexOf('football') >= 0 || s.indexOf('soccer') >= 0) return 'football';
  if (s.indexOf('basket') >= 0) return 'basketball';
  if (s.indexOf('hockey') >= 0 || s.indexOf('nhl') >= 0) return 'hockey';
  if (s.indexOf('mma') >= 0 || s.indexOf('ufc') >= 0) return 'mma';
  return s.replace(/\s+/g, '-');
}

function timstreamsCategory(ev) {
  var id = ev.genre;
  if (GENRE_MAP[id]) return GENRE_MAP[id];
  if (ev.genre && ev.genre.name) return normCategory(ev.genre.name);
  return 'other';
}

function timOrigins(cfg) {
  var list = [];
  var push = function (o) {
    var v = String(o || '')
      .trim()
      .replace(/\/$/, '');
    if (!v || list.indexOf(v) >= 0) return;
    list.push(v);
  };
  if (cfg && cfg.origin) push(cfg.origin);
  var fromCfg = cfg && cfg.origins;
  if (Array.isArray(fromCfg)) {
    for (var i = 0; i < fromCfg.length; i++) push(fromCfg[i]);
  } else if (fromCfg) {
    push(fromCfg);
  }
  // Legacy absolute API hosts (pre-origins config).
  ;['api', 'channelsApi', 'replaysApi'].forEach(function (key) {
    var raw = cfg && cfg[key];
    if (!raw) return;
    try {
      push(new URL(String(raw)).origin);
    } catch (_) {}
  });
  if (!list.length) {
    for (var j = 0; j < SPECS.origins.length; j++) push(SPECS.origins[j]);
  }
  return list;
}

function fetchHeaders(origin) {
  var o = String(origin || SPECS.origins[0]).replace(/\/$/, '');
  return {
    'User-Agent': ua(),
    Accept: 'application/json',
    Referer: o + '/',
    Origin: o,
  };
}

/** Kickoff ms (host schedule). Accepts ISO `time` or `date` strings. */
function parseEventTimeMs(ev) {
  var raw = ev && (ev.time || ev.date);
  if (!raw) return 0;
  if (typeof raw === 'number' && isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  var ms = Date.parse(String(raw));
  return isNaN(ms) ? 0 : ms;
}

function isAiringMs(startMs) {
  if (!startMs) return false;
  var now = Date.now();
  return startMs <= now && startMs >= now - 6 * 3600000;
}

function rowFromEvent(ev, idx, pluginId, opts) {
  var eventToken = String((ev && ev.url) || idx);
  if (!eventToken) return null;
  var startMs = parseEventTimeMs(ev);
  var alwaysOn = !!(opts && opts.alwaysOn);
  var viewers = Number((ev && ev.viewers) || 0);
  var airing = alwaysOn || isAiringMs(startMs) || viewers > 0;
  var row = {
    id: 'ts_' + eventToken,
    title: String((ev && ev.name) || 'TimStreams'),
    category: alwaysOn ? 'other' : timstreamsCategory(ev || {}),
    date: alwaysOn ? 0 : startMs > 0 ? startMs : Date.now(),
    poster: String((ev && ev.logo) || ''),
    popular:
      (ev && ev.featured === true) ||
      viewers > 100 ||
      (alwaysOn && viewers > 0),
    airing: airing,
    viewers: viewers,
    sources: [{ source: 'timstreams', id: eventToken }],
    catalog: 'forja_live',
    pluginId: pluginId,
  };
  if (alwaysOn) {
    row.alwaysLive = true;
    row.badge = '24/7';
  }
  return row;
}

async function fetchJson(ctx, url, origin) {
  var res = await ctx.fetch(url, { headers: fetchHeaders(origin) });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

/** First origin that returns JSON for `path` wins. */
async function fetchJsonFirst(ctx, path, cfg) {
  var origins = timOrigins(cfg);
  for (var i = 0; i < origins.length; i++) {
    var origin = origins[i];
    try {
      var data = await fetchJson(ctx, origin + path, origin);
      if (data) return { origin: origin, data: data };
    } catch (_) {}
  }
  return null;
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'timstreams');
  var byId = {};

  function push(row) {
    if (!row || !row.id || byId[row.id]) return;
    byId[row.id] = row;
  }

  // Scheduled / live match board (often null when site has no fixtures).
  var liveHit = await fetchJsonFirst(ctx, '/api/live-upcoming', cfg);
  var live = liveHit && liveHit.data;
  var events = live && Array.isArray(live.events) ? live.events : [];
  for (var i = 0; i < events.length; i++) {
    push(rowFromEvent(events[i], i, pluginId, null));
  }

  // Prefer same origin as schedule for channels; else walk mirrors.
  var sportsGenre = Number(
    cfg.sportsChannelGenre != null ? cfg.sportsChannelGenre : SPECS.sportsChannelGenre,
  );
  var chHit = null;
  if (liveHit && liveHit.origin) {
    try {
      var same = await fetchJson(
        ctx,
        liveHit.origin + '/api/channels',
        liveHit.origin,
      );
      if (same) chHit = { origin: liveHit.origin, data: same };
    } catch (_) {}
  }
  if (!chHit) chHit = await fetchJsonFirst(ctx, '/api/channels', cfg);
  var channels =
    chHit && chHit.data && Array.isArray(chHit.data.channels)
      ? chHit.data.channels
      : [];
  for (var j = 0; j < channels.length; j++) {
    var ch = channels[j];
    if (!ch || ch.vip === true) continue;
    if (Number(ch.genre) !== sportsGenre) continue;
    var streams = Array.isArray(ch.streams) ? ch.streams : [];
    if (!streams.length) continue;
    push(rowFromEvent(ch, j, pluginId, { alwaysOn: true }));
  }

  return Object.keys(byId)
    .map(function (k) {
      return liveCatalogStamp(byId[k], pluginId);
    })
    .sort(function (a, b) {
      if (a.airing !== b.airing) return a.airing ? -1 : 1;
      return Number(b.viewers || 0) - Number(a.viewers || 0);
    });
}


// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var SPECS = {
  origins: ['https://tim-streams.com', 'https://timstreams.co.rw'],
  embedOrigin: 'https://embed.st',
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function timOrigins(cfg) {
  var list = [];
  var push = function (o) {
    var v = String(o || '')
      .trim()
      .replace(/\/$/, '');
    if (!v || list.indexOf(v) >= 0) return;
    list.push(v);
  };
  if (cfg && cfg.origin) push(cfg.origin);
  var fromCfg = cfg && cfg.origins;
  if (Array.isArray(fromCfg)) {
    for (var i = 0; i < fromCfg.length; i++) push(fromCfg[i]);
  } else if (fromCfg) {
    push(fromCfg);
  }
  ;['api', 'channelsApi', 'replaysApi'].forEach(function (key) {
    var raw = cfg && cfg[key];
    if (!raw) return;
    try {
      push(new URL(String(raw)).origin);
    } catch (_) {}
  });
  if (!list.length) {
    for (var j = 0; j < SPECS.origins.length; j++) push(SPECS.origins[j]);
  }
  return list;
}

function primaryOrigin(cfg) {
  var list = timOrigins(cfg);
  return list[0] || SPECS.origins[0];
}

function embedReferer(raw, cfg) {
  try {
    return new URL(String(raw || '').trim()).origin + '/';
  } catch (_) {
    return primaryOrigin(cfg) + '/';
  }
}

async function fetchEvents(ctx, cfg) {
  var origins = timOrigins(cfg);
  var out = [];
  var seen = {};
  var activeOrigin = '';

  async function pull(origin, path, key) {
    try {
      var res = await ctx.fetch(origin + path, {
        headers: {
          'User-Agent': ua(),
          Accept: 'application/json',
          Referer: origin + '/',
          Origin: origin,
        },
      });
      if (!res.ok) return false;
      var data = await res.json();
      var list = [];
      if (key === 'events') {
        list = Array.isArray(data && data.events) ? data.events : [];
      } else if (key === 'channels') {
        list = Array.isArray(data && data.channels) ? data.channels : [];
      } else if (key === 'replays') {
        list = Array.isArray(data && data.replays) ? data.replays : [];
      }
      var added = 0;
      for (var i = 0; i < list.length; i++) {
        var ev = list[i];
        if (!ev) continue;
        var token = String(ev.url || '');
        if (!token || seen[token]) continue;
        seen[token] = 1;
        out.push(ev);
        added++;
      }
      return added > 0 || (key === 'events' && list.length === 0 && res.ok);
    } catch (_) {
      return false;
    }
  }

  for (var i = 0; i < origins.length; i++) {
    var origin = origins[i];
    var okEvents = await pull(origin, '/api/live-upcoming', 'events');
    if (!okEvents && out.length === 0) continue;
    activeOrigin = origin;
    await pull(origin, '/api/channels', 'channels');
    await pull(origin, '/api/replays', 'replays');
    break;
  }

  if (activeOrigin) cfg._activeOrigin = activeOrigin;
  return out;
}

function findEvent(events, eventToken) {
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (String(ev.url || '') === eventToken || String(i) === eventToken) return ev;
  }
  return null;
}

function withName(row, name) {
  if (!row) return null;
  row.name = name || row.name || 'TimStreams';
  return row;
}

async function unlockEmbed(ctx, url, cfg) {
  var raw = String(url || '').trim();
  if (!raw) return null;

  if (isEhgEmbedUrl(raw)) {
    try {
      var ehg = await resolveEhgEmbed(ctx, raw, cfg || {});
      if (ehg && ehg.length) return ehg[0];
    } catch (_) {}
  }

  if (isGasmJwEmbedUrl(raw)) {
    try {
      var india = await resolveEmbedIndia(ctx, raw, cfg);
      if (india && india.length) return india[0];
    } catch (_) {}
  }

  if (raw.indexOf('embed.st') >= 0 || parseEmbedUrl(raw, cfg)) {
    try {
      var goat = await resolveGoatEmbed(ctx, raw, cfg);
      if (goat && goat.length) return goat[0];
    } catch (_) {}
  }

  if (isSportsEmbedUrl(raw)) {
    if (ctx.live && typeof ctx.live.sportsEmbedUnlock === 'function') {
      try {
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
      } catch (_) {}
    }

    var mapped = embedStUrlFromSportsEmbed(raw);
    if (mapped) {
      try {
        var mappedGoat = await resolveGoatEmbed(ctx, mapped, cfg);
        if (mappedGoat && mappedGoat.length) return mappedGoat[0];
      } catch (_) {}
    }

    var candidates = embedStAdminCandidatesFromSportsEmbed(raw);
    for (var i = 0; i < candidates.length; i++) {
      try {
        var candidate = await resolveGoatEmbed(ctx, candidates[i], cfg);
        if (candidate && candidate.length) return candidate[0];
      } catch (_) {}
    }
  }

  if (isDaddyLiveUrl(raw)) {
    try {
      var daddy = await resolveDaddyLiveEmbed(ctx, raw, cfg);
      if (daddy && daddy.length) return daddy[0];
    } catch (_) {}
  }

  return null;
}

async function resolveUrl(ctx, url, name, cfg) {
  var raw = String(url || '').trim();
  if (!raw) return null;
  var ref = embedReferer(raw, cfg);

  if (/\.m3u8|\.mp4/i.test(raw)) {
    return {
      url: raw,
      name: name || 'TimStreams',
      headers: { Referer: ref, Origin: ref.replace(/\/$/, ''), 'User-Agent': ua() },
      directPlayback: preferDirectPlayback(raw),
    };
  }

  var unlocked = await unlockEmbed(ctx, raw, cfg || {});
  if (unlocked) return withName(unlocked, name || 'TimStreams');

  // Unlock failed — omit (never hand embed HTML to native player).
  return null;
}

async function resolveByEvent(ctx, cfg) {
  var eventToken = String(ctx.eventId || '').replace(/^ts_/, '');
  var events = await fetchEvents(ctx, cfg);
  if (cfg._activeOrigin && !cfg.origin) cfg.origin = cfg._activeOrigin;
  var ev = eventToken && ctx.fixtureSearch !== true
    ? findEvent(events, eventToken)
    : null;
  if (!ev) {
    var mapped = (events || []).map(function (e) {
      var t = e && (e.time || e.date || e.starts_at);
      var dateMs = 0;
      if (typeof t === 'number' && isFinite(t)) {
        dateMs = t > 1e12 ? t : t * 1000;
      } else if (t) {
        dateMs = Date.parse(String(t));
        if (isNaN(dateMs)) dateMs = 0;
      }
      return {
        id: String(e.id || e.event_id || e.url || ''),
        matchId: String(e.url || e.id || e.event_id || ''),
        title: String(e.title || e.name || ''),
        homeTeam: String(e.home || e.homeTeam || ''),
        awayTeam: String(e.away || e.awayTeam || ''),
        dateMs: dateMs,
        _raw: e,
      };
    });
    var hit = liveFindFixtureInList(mapped, ctx);
    if (!hit) return [];
    ev = hit._raw || findEvent(events, String(hit.matchId || hit.id || ''));
  }
  if (!ev) return [];

  var wanted = String(ctx.matchId || ctx.embedUrl || ctx.url || '').trim();
  var streams = (ev.streams || []).filter(function (st) {
    return st && !st.vip && st.url;
  });
  if (!streams.length) return [];

  var selected = streams;
  if (wanted && ctx.fixtureSearch !== true) {
    var hitSt = null;
    for (var i = 0; i < streams.length; i++) {
      var st = streams[i];
      if (String(st.name || '') === wanted || String(i) === wanted) {
        hitSt = st;
        break;
      }
      if (String(st.url || '').trim() === wanted) {
        hitSt = st;
        break;
      }
    }
    if (hitSt) selected = [hitSt];
  }

  // Providers discover: list embeds only. Unlock on play when embedUrl is set.
  var out = [];
  var seen = {};
  for (var j = 0; j < selected.length; j++) {
    var raw = String(selected[j].url || '').trim();
    if (!raw || seen[raw]) continue;
    seen[raw] = 1;
    var name = String(selected[j].name || 'TimStreams');
    if (/\.m3u8|\.mp4/i.test(raw)) {
      var ref = embedReferer(raw, cfg);
      out.push({
        url: raw,
        name: name,
        headers: { Referer: ref, Origin: ref.replace(/\/$/, ''), 'User-Agent': ua() },
        directPlayback: preferDirectPlayback(raw),
      });
      continue;
    }
    out.push({
      url: raw,
      name: name,
      headers: { Referer: embedReferer(raw, cfg), 'User-Agent': ua() },
      directPlayback: false,
    });
  }
  return out;
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  if (!cfg.origin) cfg.origin = primaryOrigin(cfg);
  var direct = String(ctx.url || ctx.embedUrl || '').trim();
  if (direct) {
    var row = await resolveUrl(ctx, direct, 'TimStreams', cfg);
    return row ? [row] : [];
  }
  return resolveByEvent(ctx, cfg);
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
