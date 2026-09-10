// Unified live_sport plugin — catalog + resolve (timstreams)
// Catalog half (top-level)
var SPECS = {
  "api": "https://timst.cfd/api/live-upcoming"
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

function parseEventTime(ev) {
  if (!ev.time) return 0;
  var ms = Date.parse(String(ev.time));
  if (isNaN(ms)) return 0;
  return Math.floor(ms / 1000);
}

function isAiring(startTime) {
  if (!startTime) return false;
  var nowSec = Math.floor(Date.now() / 1000);
  return startTime <= nowSec && startTime >= nowSec - 6 * 3600;
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'timstreams');
  var api = cfg.api;
  var res = await ctx.fetch(api, { headers: { 'User-Agent': ua(), Accept: 'application/json' } });
  if (!res.ok) return [];
  var data = await res.json();
  var rows = [];
  (data.events || []).forEach(function (ev, idx) {
    var eventToken = String(ev.url || idx);
    if (!eventToken) return;
    var startTime = parseEventTime(ev);
    var airing = isAiring(startTime);
    rows.push({
      id: 'ts_' + eventToken,
      title: String(ev.name || 'TimStreams event'),
      category: timstreamsCategory(ev),
      date: startTime > 0 ? startTime : Date.now(),
      poster: String(ev.logo || ''),
      popular: ev.featured === true || (ev.viewers ? Number(ev.viewers) > 100 : false),
      airing: airing,
      viewers: Number(ev.viewers || 0),
      sources: [{ source: 'timstreams', id: eventToken }],
      catalog: 'forja_live',
      pluginId: pluginId,
    });
  });
  return rows.map(function (r) { return liveCatalogStamp(r, pluginId); });
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var SPECS = {
  "api": "https://timst.cfd/api/live-upcoming",
  "embedOrigin": "https://embed.st"
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

async function fetchEvents(ctx, cfg) {
  var api = cfg.api;
  var res = await ctx.fetch(api, { headers: { 'User-Agent': ua(), Accept: 'application/json' } });
  if (!res.ok) return [];
  var data = await res.json();
  return data.events || [];
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
      return {
        id: String(e.id || e.event_id || ''),
        matchId: String(e.id || e.event_id || ''),
        title: String(e.title || e.name || ''),
        homeTeam: String(e.home || e.homeTeam || ''),
        awayTeam: String(e.away || e.awayTeam || ''),
        dateMs: Number(e.date || e.starts_at || 0) || 0,
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

  var out = [];
  for (var j = 0; j < selected.length; j++) {
    var row = await resolveUrl(
      ctx,
      String(selected[j].url),
      String(selected[j].name || 'TimStreams'),
      cfg,
    );
    if (row) out.push(row);
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
