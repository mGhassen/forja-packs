// Unified live_sport plugin — catalog + resolve (timstreams)
// Catalog half (top-level)
var SPECS = {
  origin: 'https://timst.cfd',
  api: 'https://timst.cfd/api/live-upcoming',
  channelsApi: 'https://timst.cfd/api/channels',
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

function apiBase(cfg) {
  var api = String((cfg && cfg.api) || SPECS.api).replace(/\/$/, '');
  var cut = api.lastIndexOf('/api/');
  if (cut > 0) return api.slice(0, cut + 4);
  return String((cfg && cfg.origin) || SPECS.origin).replace(/\/$/, '') + '/api';
}

function fetchHeaders() {
  return {
    'User-Agent': ua(),
    Accept: 'application/json',
    Referer: SPECS.origin + '/',
    Origin: SPECS.origin,
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

async function fetchJson(ctx, url) {
  var res = await ctx.fetch(url, { headers: fetchHeaders() });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'timstreams');
  var base = apiBase(cfg);
  var byId = {};

  function push(row) {
    if (!row || !row.id || byId[row.id]) return;
    byId[row.id] = row;
  }

  // Scheduled / live match board (often null when site has no fixtures).
  var live = await fetchJson(ctx, String(cfg.api || base + '/live-upcoming'));
  var events = live && Array.isArray(live.events) ? live.events : [];
  for (var i = 0; i < events.length; i++) {
    push(rowFromEvent(events[i], i, pluginId, null));
  }

  // Site still lists sports Live TV when Events is empty — catalog those.
  var sportsGenre = Number(
    cfg.sportsChannelGenre != null ? cfg.sportsChannelGenre : SPECS.sportsChannelGenre,
  );
  var chPayload = await fetchJson(
    ctx,
    String(cfg.channelsApi || base + '/channels'),
  );
  var channels =
    chPayload && Array.isArray(chPayload.channels) ? chPayload.channels : [];
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
  origin: 'https://timst.cfd',
  api: 'https://timst.cfd/api/live-upcoming',
  channelsApi: 'https://timst.cfd/api/channels',
  replaysApi: 'https://timst.cfd/api/replays',
  embedOrigin: 'https://embed.st',
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function embedReferer(raw) {
  try {
    return new URL(String(raw || '').trim()).origin + '/';
  } catch (_) {
    return 'https://timst.cfd/';
  }
}

function apiBase(cfg) {
  var api = String((cfg && cfg.api) || SPECS.api).replace(/\/$/, '');
  var cut = api.lastIndexOf('/api/');
  if (cut > 0) return api.slice(0, cut + 4);
  return String((cfg && cfg.origin) || SPECS.origin).replace(/\/$/, '') + '/api';
}

async function fetchEvents(ctx, cfg) {
  var base = apiBase(cfg);
  var headers = {
    'User-Agent': ua(),
    Accept: 'application/json',
    Referer: 'https://timst.cfd/',
    Origin: 'https://timst.cfd',
  };
  var out = [];
  var seen = {};

  async function pull(url, key) {
    try {
      var res = await ctx.fetch(url, { headers: headers });
      if (!res.ok) return;
      var data = await res.json();
      var list = [];
      if (key === 'events') {
        list = Array.isArray(data && data.events) ? data.events : [];
      } else if (key === 'channels') {
        list = Array.isArray(data && data.channels) ? data.channels : [];
      } else if (key === 'replays') {
        list = Array.isArray(data && data.replays) ? data.replays : [];
      }
      for (var i = 0; i < list.length; i++) {
        var ev = list[i];
        if (!ev) continue;
        var token = String(ev.url || '');
        if (!token || seen[token]) continue;
        seen[token] = 1;
        out.push(ev);
      }
    } catch (_) {}
  }

  await pull(String(cfg.api || base + '/live-upcoming'), 'events');
  await pull(String(cfg.channelsApi || base + '/channels'), 'channels');
  await pull(String(cfg.replaysApi || base + '/replays'), 'replays');
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
  var ref = embedReferer(raw);

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
      var ref = embedReferer(raw);
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
      headers: { Referer: embedReferer(raw), 'User-Agent': ua() },
      directPlayback: false,
    });
  }
  return out;
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, SPECS, ctx.config || {});
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
