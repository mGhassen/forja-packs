// Unified live_sport plugin — catalog + resolve (watchfooty)
// Catalog half
function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

var CATALOG_MAX = 120;
var API_ORIGIN = 'https://api.watchfooty.st';
var SITE_ORIGIN = 'https://watchfooty.st';
var LIVE_API = API_ORIGIN + '/api/v1/matches/live';
var ALL_API = API_ORIGIN + '/api/v1/matches/all';
// REST /matches/live has no viewers — site exposes them on tRPC popular live (+ ticker).
var TRPC_NULL_INPUT = encodeURIComponent(JSON.stringify({ '0': { json: null } }));
var POPULAR_LIVE_TRPC =
  SITE_ORIGIN +
  '/api/trpc/sports.getPopularLiveMatches?batch=1&input=' +
  TRPC_NULL_INPUT;
var TICKER_TRPC =
  SITE_ORIGIN + '/api/trpc/ticker.getItems?batch=1&input=' + TRPC_NULL_INPUT;

function inCatalogWindow(ts, live) {
  if (live) return true;
  if (!ts) return false;
  var ms = ts >= 1e12 ? ts : ts * 1000;
  var now = Date.now();
  return ms >= now - 3 * 3600000 && ms <= now + 24 * 3600000;
}

function absUrl(path) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return API_ORIGIN + p;
}

function normSport(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (!s) return 'football';
  if (s.indexOf('soccer') >= 0) return 'football';
  if (s.indexOf('american') >= 0 && s.indexOf('football') >= 0) {
    return 'american-football';
  }
  return s.replace(/\s+/g, '-');
}

function toRow(pluginId, item, airing, viewers) {
  var mid = item.matchId;
  var title =
    item.title ||
    ((item.teams && item.teams.home && item.teams.home.name) || 'Home') +
      ' vs ' +
      ((item.teams && item.teams.away && item.teams.away.name) || 'Away');
  var v = Number(viewers || 0);
  if (!(v > 0)) v = 0;
  return {
    id: 'wf_' + mid,
    title: title,
    category: normSport(item.sport),
    date: item.timestamp ? Number(item.timestamp) : Date.now(),
    poster: absUrl(item.poster),
    popular: airing || v > 50,
    airing: airing,
    viewers: v,
    sources: [{ source: 'watchfooty', id: String(mid) }],
    catalog: 'forja_live',
    pluginId: pluginId,
  };
}

async function fetchList(ctx, url) {
  var res = await ctx.fetch(url, { headers: { 'User-Agent': ua() } });
  if (!res.ok) return [];
  var list = await res.json();
  return Array.isArray(list) ? list : [];
}

function trpcJson(batch) {
  return (
    batch &&
    batch[0] &&
    batch[0].result &&
    batch[0].result.data &&
    batch[0].result.data.json
  );
}

function bumpViewers(map, id, n) {
  var key = String(id || '').trim();
  var count = Number(n || 0);
  if (!key || !(count > 0)) return;
  var prev = map[key] || 0;
  if (count > prev) map[key] = count;
}

/** Match-level concurrent viewers — not on /api/v1/matches/live. */
async function fetchViewerCounts(ctx) {
  var out = {};
  var headers = {
    'User-Agent': ua(),
    Accept: 'application/json',
    Referer: SITE_ORIGIN + '/',
  };

  try {
    var popRes = await ctx.fetch(POPULAR_LIVE_TRPC, { headers: headers });
    if (popRes.ok) {
      var popList = trpcJson(await popRes.json());
      if (Array.isArray(popList)) {
        for (var i = 0; i < popList.length; i++) {
          var m = popList[i];
          if (!m) continue;
          bumpViewers(out, m.id || m.matchId, m.viewerCount);
        }
      }
    }
  } catch (_) {}

  try {
    var tickRes = await ctx.fetch(TICKER_TRPC, { headers: headers });
    if (tickRes.ok) {
      var tick = trpcJson(await tickRes.json());
      var items = tick && tick.items;
      if (Array.isArray(items)) {
        for (var j = 0; j < items.length; j++) {
          var it = items[j];
          if (!it || it.type !== 'live') continue;
          var idMatch = String(it.id || '').match(/^live-(.+)$/);
          var watchMatch = String(it.label || '').match(
            /·\s*([\d,]+)\s*watching/i,
          );
          if (!idMatch || !watchMatch) continue;
          bumpViewers(out, idMatch[1], String(watchMatch[1]).replace(/,/g, ''));
        }
      }
    }
  } catch (_) {}

  return out;
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = ctx.config || {};
  var pluginId = String(cfg.pluginId || cfg.providerId || 'watchfooty');
  var byId = {};
  var viewersById = await fetchViewerCounts(ctx);

  // Keep stream-less airing rows — Status → Airing shows them; play may still fail.
  var liveList = await fetchList(ctx, cfg.api || LIVE_API);
  for (var i = 0; i < liveList.length; i++) {
    var item = liveList[i];
    var statusLive = item.status === 'in' || item.status === 'live';
    if (!statusLive) continue;
    var mid = String(item.matchId);
    byId[mid] = toRow(pluginId, item, true, viewersById[mid] || 0);
  }

  // Upcoming schedule (pre only) — skip post/finished.
  if (!cfg.api) {
    var allList = await fetchList(ctx, ALL_API);
    for (var j = 0; j < allList.length; j++) {
      var u = allList[j];
      if (u.status !== 'pre') continue;
      if (!inCatalogWindow(u.timestamp ? Number(u.timestamp) : 0, false)) continue;
      var id = String(u.matchId);
      if (!byId[id]) byId[id] = toRow(pluginId, u, false, viewersById[id] || 0);
    }
  }

  return Object.keys(byId)
    .map(function (k) {
      return liveCatalogStamp(byId[k], pluginId);
    })
    .sort(function (a, b) {
      var liveA = a.airing ? 0 : 1;
      var liveB = b.airing ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      var va = Number(a.viewers || 0);
      var vb = Number(b.viewers || 0);
      if (va !== vb) return vb - va;
      return Number(a.date || 0) - Number(b.date || 0);
    })
    .slice(0, CATALOG_MAX);
}

// Resolve half
var WATCHFOOTY_REFERER = 'https://watchfooty.st/';
var WATCHFOOTY_SOURCE_PRIORITY = {
  delta: 0,
  echo: 1,
  sigma: 2,
  pro: 3,
  platinum: 4,
  deluxe: 5,
  hd: 6,
  regular: 7,
};

function watchfootySourceRank(source) {
  var key = String(source || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(WATCHFOOTY_SOURCE_PRIORITY, key)
    ? WATCHFOOTY_SOURCE_PRIORITY[key]
    : 99;
}

async function resolveWatchfootyEmbed(ctx, embed) {
  var url = String(embed || '').trim();
  if (!url) return [];

  if (/\.m3u8|\.mp4/i.test(url)) {
    var headers = { Referer: WATCHFOOTY_REFERER, 'User-Agent': ua() };
    try {
      var u = new URL(url);
      if (u.host.toLowerCase().indexOf('wfty.st') >= 0) {
        var segs = u.pathname.split('/').filter(Boolean);
        if (segs.length >= 8 && segs[0] === 'secure') {
          headers = {
            Referer:
              'https://sportsembed.su/embed/' +
              segs[5] +
              '/' +
              segs[3] +
              '/' +
              segs[2] +
              '/' +
              segs[4],
            Origin: 'https://sportsembed.su',
            'User-Agent': ua(),
          };
        }
      }
    } catch (_) {}
    return [
      {
        url: url,
        headers: headers,
        directPlayback: preferDirectPlayback(url),
      },
    ];
  }

  if (!isSportsEmbedUrl(url)) return [];

  // delta/echo/admin sportsembed rows mirror embed.st GOAT — try that first.
  var mapped = embedStUrlFromSportsEmbed(url);
  if (mapped) {
    try {
      var unlocked = await resolveGoatEmbed(ctx, mapped, ctx.config || {});
      if (unlocked) return unlocked;
    } catch (_) {}
  }

  var candidates = embedStAdminCandidatesFromSportsEmbed(url);
  for (var i = 0; i < candidates.length; i++) {
    try {
      var candidate = await resolveGoatEmbed(ctx, candidates[i], ctx.config || {});
      if (candidate) return candidate;
    } catch (_) {}
  }

  // sigma/pro/hd/… are sportsembed-only — unlock via stream-lock.wasm (same as TimStreams).
  if (ctx.live && typeof ctx.live.sportsEmbedUnlock === 'function') {
    try {
      var unlockedUrl = await ctx.live.sportsEmbedUnlock(url);
      if (unlockedUrl) {
        var origin = '';
        try {
          origin = new URL(url).origin;
        } catch (_) {}
        return [
          {
            url: String(unlockedUrl),
            headers: {
              Referer: url,
              Origin: origin || 'https://sportsembed.su',
              'User-Agent': ua(),
            },
            directPlayback: preferDirectPlayback(unlockedUrl),
          },
        ];
      }
    } catch (_) {}
  }

  return [];
}

async function resolveWatchfootyMatch(ctx, mid) {
  var res = await ctx.fetch('https://api.watchfooty.st/api/v1/match/' + mid, {
    headers: { 'User-Agent': ua(), Accept: 'application/json' },
  });
  if (!res.ok) return [];
  var data = await res.json();
  var match = Array.isArray(data) ? data[0] : data;
  var streams = ((match && match.streams) || []).slice();
  streams.sort(function (a, b) {
    return watchfootySourceRank(a && a.source) - watchfootySourceRank(b && b.source);
  });

  // Providers discover: list embeds only. Unlock on play when embedUrl is set.
  var out = [];
  var seen = {};
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || !s.url) continue;
    var embed = String(s.url).trim();
    if (!embed || seen[embed]) continue;
    seen[embed] = 1;
    var label = 'WatchFooty';
    if (s.source) label += ' ' + s.source;
    if (s.quality) label += ' ' + s.quality;
    out.push({
      url: embed,
      name: label,
      source: String(s.source || ''),
      quality: String(s.quality || ''),
      headers: { Referer: WATCHFOOTY_REFERER, 'User-Agent': ua() },
      directPlayback: false,
    });
  }
  return out;
}

async function resolveWatchfootyByFixture(ctx) {
  var live = [];
  var all = [];
  try {
    live = await (
      await ctx.fetch('https://api.watchfooty.st/api/v1/matches/live', {
        headers: { 'User-Agent': ua(), Accept: 'application/json' },
      })
    ).json();
  } catch (_) {}
  try {
    all = await (
      await ctx.fetch('https://api.watchfooty.st/api/v1/matches/all', {
        headers: { 'User-Agent': ua(), Accept: 'application/json' },
      })
    ).json();
  } catch (_) {}
  var list = []
    .concat(Array.isArray(live) ? live : [])
    .concat(Array.isArray(all) ? all : []);
  var hit = liveFindFixtureInList(list, ctx);
  if (!hit) return [];
  var mid = String(hit.matchId || hit.id || '').replace(/^wf_/, '');
  if (!mid) return [];
  return resolveWatchfootyMatch(ctx, mid);
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];

  var embed = String(ctx.embedUrl || ctx.url || '').trim();
  if (embed) {
    // Unlock-on-tap: never fall through to full match (that padded 15 junk rows).
    return resolveWatchfootyEmbed(ctx, embed);
  }

  var mid = String(ctx.matchId || '').replace(/^wf_/, '');
  if (mid && ctx.fixtureSearch !== true) {
    return resolveWatchfootyMatch(ctx, mid);
  }
  return resolveWatchfootyByFixture(ctx);
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
