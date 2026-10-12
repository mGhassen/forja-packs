// Unified live_sport plugin — catalog + resolve (BZH-Sport / bzh.lat)
// Catalog half (top-level)
var SPECS = {
  origins: ['https://bzh.lat', 'https://volkamax.club'],
  // Schedule times are fixed UTC+1 (site default, no DST shift).
  tzOffsetMin: 60,
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
}

// Site category icon id (`/assets/uploads/cat/{id}.png`) → live kind.
var BZH_CATEGORY = {
  1: 'football',
  2: 'basketball',
  3: 'tennis',
  4: 'rugby',
  5: 'handball',
  6: 'cycling',
  8: 'motor-sports',
  9: 'american-football',
  10: 'hockey',
  12: 'mma',
  13: 'other',
  14: 'athletics',
  15: 'winter-sports',
  21: 'billiards',
  22: 'fight',
  24: 'volleyball',
  25: 'padel',
  27: 'squash',
  37: 'motor-sports',
  39: 'baseball',
};

// Only these split "Home - Away" titles into teams ("Eneco Tour - Prologue" is not a fixture).
var BZH_TEAM_KINDS = {
  football: 1,
  basketball: 1,
  rugby: 1,
  handball: 1,
  'american-football': 1,
  hockey: 1,
  volleyball: 1,
  baseball: 1,
};

var BZH_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function bzhOrigins(cfg) {
  var list = Array.isArray(cfg.origins) ? cfg.origins : [cfg.origins];
  return list
    .map(function (o) {
      return String(o || '').trim().replace(/\/$/, '');
    })
    .filter(Boolean);
}

function bzhHtmlText(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function bzhParseDateMs(dateStr, timeStr, tzOffsetMin) {
  var d = String(dateStr || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  var t = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return 0;
  var mon = BZH_MONTHS[d[2].toLowerCase()];
  if (mon == null) return 0;
  var utc = Date.UTC(Number(d[3]), mon, Number(d[1]), Number(t[1]), Number(t[2]));
  return utc - Number(tzOffsetMin || 0) * 60000;
}

function bzhSplitTeams(title) {
  var parts = String(title || '').split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return null;
  var home = parts[0].trim();
  var away = parts[1].trim();
  if (!home || !away) return null;
  return { home: home, away: away };
}

/** Schedule table rows → plain event objects (path is origin-relative). */
function bzhParseSchedule(html, cfg) {
  var out = [];
  var re = /<tr class="event">([\s\S]*?)<\/tr>/g;
  var m;
  while ((m = re.exec(String(html || '')))) {
    var row = m[1];
    var tds = [];
    var tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    var td;
    while ((td = tdRe.exec(row))) tds.push(td[1]);
    if (tds.length < 6) continue;
    var link = row.match(/<a\s+href="([^"]+)"[^>]*\bk="(\d+)"/);
    if (!link) continue;
    var path = '';
    try {
      path = new URL(link[1].trim()).pathname;
    } catch (_) {
      path = link[1].trim();
    }
    if (!path) continue;
    var catM = row.match(/\/cat\/(\d+)\./);
    var kind = (catM && BZH_CATEGORY[catM[1]]) || 'other';
    var title = bzhHtmlText(tds[4]);
    var ev = {
      key: link[2],
      path: path,
      title: title,
      kind: kind,
      dateMs: bzhParseDateMs(bzhHtmlText(tds[1]), bzhHtmlText(tds[2]), cfg.tzOffsetMin),
      airing: /live\.gif/i.test(row),
    };
    if (BZH_TEAM_KINDS[kind]) {
      var teams = bzhSplitTeams(title);
      if (teams) {
        ev.homeTeam = teams.home;
        ev.awayTeam = teams.away;
      }
    }
    out.push(ev);
  }
  return out;
}

/** First mirror that serves a schedule wins. */
async function bzhFetchSchedule(ctx, cfg) {
  var origins = bzhOrigins(cfg);
  for (var i = 0; i < origins.length; i++) {
    try {
      var res = await ctx.fetch(origins[i] + '/', { headers: { 'User-Agent': ua() } });
      if (!res.ok) continue;
      var events = bzhParseSchedule(await res.text(), cfg);
      if (events.length) return { origin: origins[i], events: events };
    } catch (_) {}
  }
  return { origin: '', events: [] };
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'bzhsport');
  var schedule = await bzhFetchSchedule(ctx, cfg);
  return schedule.events.map(function (ev) {
    var row = {
      id: 'bzh_' + ev.key,
      title: ev.title,
      category: ev.kind,
      date: ev.dateMs,
      airing: ev.airing,
      sources: [{ source: 'bzhsport', id: ev.key }],
      catalog: 'forja_live',
      pluginId: pluginId,
    };
    if (ev.homeTeam) row.homeTeam = ev.homeTeam;
    if (ev.awayTeam) row.awayTeam = ev.awayTeam;
    return liveCatalogStamp(row, pluginId);
  });
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var NAME = 'BZH-Sport';
var MAX_IFRAME_HOPS = 3;

function absUrl(src, baseUrl) {
  var s = String(src || '').trim();
  if (!s) return '';
  try {
    return new URL(s, baseUrl).toString();
  } catch (_) {
    return '';
  }
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch (_) {
    return '';
  }
}

/** Event page: `embeds[i] = '<iframe src="…">'` + `titles[i] = '…'`. */
function parseEventEmbeds(html, pageUrl) {
  var text = String(html || '');
  var titles = {};
  var tRe = /titles\[(\d+)\]\s*=\s*'([^']*)'/g;
  var t;
  while ((t = tRe.exec(text))) {
    // Page script later resets `titles[0] = ''` in its no-embed fallback.
    var label = String(t[2] || '').trim();
    if (label && !titles[t[1]]) titles[t[1]] = label;
  }
  var out = [];
  var seen = {};
  var eRe = /embeds\[(\d+)\]\s*=\s*'([^']*)'/g;
  var e;
  while ((e = eRe.exec(text))) {
    var src = String(e[2] || '').match(/<iframe\b[^>]*\bsrc="([^"]+)"/i);
    if (!src) continue;
    var url = absUrl(src[1], pageUrl);
    if (!url || seen[url]) continue;
    seen[url] = 1;
    out.push({ url: url, label: titles[e[1]] || 'Link ' + (out.length + 1) });
  }
  return out;
}

/**
 * Clappr player config: base64 → 4 chunks, drop char 3 of each, base64 each,
 * reorder [2,0,3,1], join, base64 → JSON.
 */
function decodeEconfig(raw) {
  try {
    var s = atob(String(raw || ''));
    var n = Math.ceil(s.length / 4);
    var order = [2, 0, 3, 1];
    var parts = [];
    for (var i = 0; i < 4; i++) {
      var chunk = s.substr(i * n, n);
      parts[order[i]] = atob(chunk.slice(0, 3) + chunk.slice(4));
    }
    return JSON.parse(atob(parts.join('')));
  } catch (_) {
    return null;
  }
}

function playHeaders(playerUrl) {
  var origin = originOf(playerUrl);
  var h = { 'User-Agent': ua() };
  if (origin) {
    h.Referer = origin + '/';
    h.Origin = origin;
  }
  return h;
}

async function liveM3u8(ctx, url, headers) {
  try {
    var res = await ctx.fetch(url, { headers: headers });
    if (!res.ok) return false;
    var text = String(await res.text() || '').replace(/^\s+/, '');
    if (text.indexOf('#EXTM3U') !== 0) return false;
    return /^[^#\s]/m.test(text);
  } catch (_) {
    return false;
  }
}

/** Follow nested iframes until a page carries `window._econfig`. */
async function unlockEmbed(ctx, embedUrl, referer) {
  var url = embedUrl;
  var ref = referer;
  for (var hop = 0; hop <= MAX_IFRAME_HOPS && url; hop++) {
    var html;
    try {
      var res = await ctx.fetch(url, { headers: { 'User-Agent': ua(), Referer: ref } });
      if (!res.ok) return null;
      html = await res.text();
    } catch (_) {
      return null;
    }
    var cfgM = String(html || '').match(/_econfig\s*=\s*'([A-Za-z0-9+/=]+)'/);
    if (cfgM) {
      var conf = decodeEconfig(cfgM[1]);
      if (!conf) return null;
      var m3u8 = String(conf.stream_url_nop2p || conf.stream_url || '').trim();
      if (!/^https?:\/\//i.test(m3u8)) return null;
      var headers = playHeaders(url);
      if (!(await liveM3u8(ctx, m3u8, headers))) return null;
      return { url: m3u8, headers: headers };
    }
    var next = String(html || '').match(/<iframe\b[^>]*\bsrc="([^"]+)"/i);
    if (!next) return null;
    ref = url;
    url = absUrl(next[1], url);
  }
  return null;
}

function streamRow(ctx, unlocked, label) {
  return {
    url: unlocked.url,
    name: NAME + ' · ' + label,
    source: 'bzhsport',
    headers: unlocked.headers,
    directPlayback: preferDirectPlayback(unlocked.url),
    viewers: Number(ctx.viewers || 0),
  };
}

async function findEvent(ctx, cfg) {
  var schedule = await bzhFetchSchedule(ctx, cfg);
  if (!schedule.events.length) return null;
  var key = String(ctx.matchId || '').replace(/^bzh_/, '');
  var list = schedule.events.map(function (ev) {
    return {
      id: 'bzh_' + ev.key,
      matchId: ev.key,
      title: ev.title,
      homeTeam: ev.homeTeam || '',
      awayTeam: ev.awayTeam || '',
      dateMs: ev.dateMs,
      ev: ev,
    };
  });
  var hit = null;
  if (key && ctx.fixtureSearch !== true) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].matchId === key) {
        hit = list[i];
        break;
      }
    }
  }
  // Another catalog's fixture (or stale id) → soft team/title match.
  if (!hit) hit = liveFindFixtureInList(list, ctx);
  if (!hit) return null;
  return { origin: schedule.origin, ev: hit.ev };
}

async function listEventStreams(ctx, cfg) {
  var found = await findEvent(ctx, cfg);
  if (!found) return [];
  var pageUrl = found.origin + found.ev.path;
  var res = await ctx.fetch(pageUrl, { headers: { 'User-Agent': ua(), Referer: found.origin + '/' } });
  if (!res.ok) return [];
  var embeds = parseEventEmbeds(await res.text(), pageUrl);
  if (!embeds.length) return [];

  var unlocked = await Promise.all(
    embeds.map(function (e) {
      return unlockEmbed(ctx, e.url, pageUrl).catch(function () {
        return null;
      });
    }),
  );
  var out = [];
  var seen = {};
  for (var i = 0; i < embeds.length; i++) {
    var u = unlocked[i];
    if (!u) continue;
    var dedupe = u.url.split('?')[0];
    if (seen[dedupe]) continue;
    seen[dedupe] = 1;
    out.push(streamRow(ctx, u, embeds[i].label));
  }
  return out;
}

async function resolveStream(ctx, cfg) {
  var raw = String(ctx.embedUrl || ctx.url || ctx.iframe || '').trim();
  if (raw) {
    // Re-play of a row we already unlocked.
    if (/\.m3u8(\?|$)/i.test(raw)) {
      var h = ctx.headers && typeof ctx.headers === 'object' ? ctx.headers : null;
      return [
        {
          url: raw,
          name: NAME,
          source: 'bzhsport',
          headers: h || { 'User-Agent': ua() },
          directPlayback: preferDirectPlayback(raw),
          viewers: Number(ctx.viewers || 0),
        },
      ];
    }
    var unlocked = await unlockEmbed(ctx, raw, bzhOrigins(cfg)[0] + '/');
    if (unlocked) return [streamRow(ctx, unlocked, 'Link')];
  }
  return listEventStreams(ctx, cfg);
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  return resolveStream(ctx, cfg);
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
