// Unified live_sport plugin — catalog + resolve (BZH-Sport / volkamax.club)
// Catalog half (top-level)
// bzh.lat apex redirects away from the schedule; volkamax is the live mirror.
var SPECS = {
  origins: ['https://volkamax.club', 'https://bzh.lat'],
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
  var t = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!t) return 0;
  var tz = Number(tzOffsetMin || 0);
  var hour = Number(t[1]);
  var min = Number(t[2]);
  // Near-term rows use French labels instead of DD-Mon-YYYY.
  var label = String(dateStr || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '');
  var dayOffset = null;
  if (label === 'aujourdhui') dayOffset = 0;
  else if (label === 'demain') dayOffset = 1;
  if (dayOffset != null) {
    // Calendar day in site TZ (fixed UTC+tz), then convert back to UTC ms.
    var siteNow = new Date(Date.now() + tz * 60000);
    var utc =
      Date.UTC(
        siteNow.getUTCFullYear(),
        siteNow.getUTCMonth(),
        siteNow.getUTCDate() + dayOffset,
        hour,
        min,
      ) -
      tz * 60000;
    return utc;
  }
  var d = String(dateStr || '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!d) return 0;
  var mon = BZH_MONTHS[d[2].toLowerCase()];
  if (mon == null) return 0;
  var absUtc = Date.UTC(Number(d[3]), mon, Number(d[1]), hour, min);
  return absUtc - tz * 60000;
}

function bzhSplitTeams(title) {
  var parts = String(title || '').split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return null;
  var home = parts[0].trim();
  var away = parts[1].trim();
  if (!home || !away) return null;
  return { home: home, away: away };
}

function bzhPathOf(href) {
  var raw = String(href || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).pathname;
  } catch (_) {
    return raw.indexOf('/') === 0 ? raw.split('?')[0] : '';
  }
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
    var path = bzhPathOf(link[1]);
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

/** Sidebar `#channels` → always-on TV rows (path is the stable id). */
function bzhParseChannels(html) {
  var out = [];
  var seen = {};
  var panel = String(html || '').match(
    /id=["']channels["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i,
  );
  var block = panel ? panel[1] : '';
  var re =
    /<div class="channels">\s*<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
  var m;
  while ((m = re.exec(block))) {
    var path = bzhPathOf(m[1]);
    if (!path || path === '/' || seen[path]) continue;
    var title = bzhHtmlText(m[2]);
    if (!title) continue;
    seen[path] = 1;
    out.push({
      key: path,
      path: path,
      title: title,
      kind: 'other',
      dateMs: 0,
      airing: true,
      alwaysOn: true,
    });
  }
  return out;
}

/** First mirror that serves schedule and/or channels wins. */
async function bzhFetchHome(ctx, cfg) {
  var origins = bzhOrigins(cfg);
  for (var i = 0; i < origins.length; i++) {
    try {
      var res = await ctx.fetch(origins[i] + '/', { headers: { 'User-Agent': ua() } });
      if (!res.ok) continue;
      var html = await res.text();
      var events = bzhParseSchedule(html, cfg);
      var channels = bzhParseChannels(html);
      if (events.length || channels.length) {
        return { origin: origins[i], events: events, channels: channels };
      }
    } catch (_) {}
  }
  return { origin: '', events: [], channels: [] };
}

function bzhCatalogRow(ev, pluginId) {
  var alwaysOn = !!ev.alwaysOn;
  var row = {
    id: 'bzh_' + (alwaysOn ? 'ch_' + String(ev.path || '').replace(/^\//, '') : ev.key),
    title: ev.title,
    category: alwaysOn ? 'other' : ev.kind,
    date: alwaysOn ? 0 : ev.dateMs,
    airing: alwaysOn ? true : !!ev.airing,
    sources: [{ source: 'bzhsport', id: ev.key }],
    catalog: 'forja_live',
    pluginId: pluginId,
  };
  if (alwaysOn) {
    row.alwaysLive = true;
    row.badge = '24/7';
  }
  if (ev.homeTeam) row.homeTeam = ev.homeTeam;
  if (ev.awayTeam) row.awayTeam = ev.awayTeam;
  return liveCatalogStamp(row, pluginId);
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'bzhsport');
  var home = await bzhFetchHome(ctx, cfg);
  var rows = home.events.map(function (ev) {
    return bzhCatalogRow(ev, pluginId);
  });
  for (var i = 0; i < home.channels.length; i++) {
    rows.push(bzhCatalogRow(home.channels[i], pluginId));
  }
  return rows;
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

/** JWPlayer pages (xstream.st): `const streamUrls=["…m3u8",…]`. */
function parseStreamUrls(html) {
  var m = String(html || '').match(/streamUrls\s*=\s*(\[[^\]]*\])/);
  if (!m) return [];
  try {
    var raw = m[1].replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    });
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (u) {
        return String(u || '').trim();
      })
      .filter(function (u) {
        return /^https?:\/\//i.test(u) && /\.m3u8(\?|$)/i.test(u);
      });
  } catch (_) {
    return [];
  }
}

async function unlockStreamUrls(ctx, html, pageUrl) {
  var urls = parseStreamUrls(html);
  if (!urls.length) return null;
  var headers = playHeaders(pageUrl);
  for (var i = 0; i < urls.length; i++) {
    if (await liveM3u8(ctx, urls[i], headers)) {
      return { url: urls[i], headers: headers };
    }
  }
  return null;
}

function isSkippableIframe(url) {
  var u = String(url || '');
  if (!u) return true;
  // Empty holdfold stub (`/embed/` with no id) and 1×1 ad frames.
  if (/\/embed\/?\s*$/i.test(u.split('?')[0])) return true;
  if (/\/ad\d*\.html|instreams\.click\/ad/i.test(u)) return true;
  return false;
}

/** Prefer a real player iframe; skip ads / empty stubs. */
function nextPlayerIframe(html, baseUrl) {
  var re = /<iframe\b[^>]*\bsrc="([^"]+)"/gi;
  var m;
  while ((m = re.exec(String(html || '')))) {
    var u = absUrl(m[1], baseUrl);
    if (!u || isSkippableIframe(u)) continue;
    return u;
  }
  return '';
}

async function sniffUnlocked(ctx, embedUrl, referer) {
  if (!ctx.live || typeof ctx.live.sniffEmbed !== 'function') return null;
  var raw = String(embedUrl || '').trim();
  if (!raw) return null;
  try {
    var m3u8 = await ctx.live.sniffEmbed(raw, String(referer || raw));
    if (!m3u8 || !/^https?:\/\//i.test(String(m3u8))) return null;
    var headers = playHeaders(raw);
    return { url: String(m3u8), headers: headers };
  } catch (_) {
    return null;
  }
}

/**
 * Follow nested iframes until a playable page:
 * holdfold `_econfig`, xstream JW `streamUrls`, daddy, or WebView sniff
 * (zonalive → ordernap / truckrefuse often 403 ctx.fetch).
 * `allowSniff` only on unlock-on-play — Providers discover is EngineJS + 3s.
 */
async function unlockEmbed(ctx, embedUrl, referer, allowSniff) {
  var url = String(embedUrl || '').trim();
  if (!url || isSkippableIframe(url)) return null;
  if (isDaddyLiveUrl(url)) {
    try {
      var daddy = await resolveDaddyLiveEmbed(ctx, url, {});
      if (daddy && daddy.length && daddy[0].url) {
        return {
          url: daddy[0].url,
          headers: daddy[0].headers || playHeaders(url),
        };
      }
    } catch (_) {}
  }
  if (isVideocdnUrl(url)) {
    try {
      var vcdn = await resolveVideocdnEmbed(ctx, url);
      if (vcdn && vcdn.length && vcdn[0].url) {
        return {
          url: vcdn[0].url,
          headers: vcdn[0].headers || playHeaders(url),
        };
      }
    } catch (_) {}
  }
  var ref = referer;
  var lastUrl = url;
  for (var hop = 0; hop <= MAX_IFRAME_HOPS && url; hop++) {
    lastUrl = url;
    var html;
    try {
      var res = await ctx.fetch(url, { headers: { 'User-Agent': ua(), Referer: ref } });
      if (!res.ok) break;
      html = await res.text();
    } catch (_) {
      break;
    }
    var cfgM = String(html || '').match(/_econfig\s*=\s*'([A-Za-z0-9+/=]+)'/);
    if (cfgM) {
      var conf = decodeEconfig(cfgM[1]);
      if (!conf) break;
      var m3u8 = String(conf.stream_url_nop2p || conf.stream_url || '').trim();
      if (!/^https?:\/\//i.test(m3u8)) break;
      var headers = playHeaders(url);
      if (!(await liveM3u8(ctx, m3u8, headers))) break;
      return { url: m3u8, headers: headers };
    }
    var fromJw = await unlockStreamUrls(ctx, html, url);
    if (fromJw) return fromJw;
    var next = nextPlayerIframe(html, url);
    if (!next) break;
    if (isDaddyLiveUrl(next)) {
      try {
        var daddyNext = await resolveDaddyLiveEmbed(ctx, next, {});
        if (daddyNext && daddyNext.length && daddyNext[0].url) {
          return {
            url: daddyNext[0].url,
            headers: daddyNext[0].headers || playHeaders(next),
          };
        }
      } catch (_) {}
    }
    ref = url;
    url = next;
  }
  if (!allowSniff) return null;
  // Gated CDN embeds (ordernap / truckrefuse) — WebView resource sniff.
  var sniffed = await sniffUnlocked(ctx, lastUrl, ref || referer);
  if (sniffed) return sniffed;
  if (lastUrl !== embedUrl) {
    sniffed = await sniffUnlocked(ctx, embedUrl, referer);
    if (sniffed) return sniffed;
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

function bzhMatchKey(ev, key) {
  var k = String(key || '');
  if (!k || !ev) return false;
  if (String(ev.key) === k) return true;
  var path = String(ev.path || '');
  if (!path) return false;
  if (path === k || path === '/' + k) return true;
  // Catalog id uses `bzh_ch_<slug>` for always-on channels.
  if (k.indexOf('ch_') === 0 && path === '/' + k.slice(3)) return true;
  return false;
}

async function findEvent(ctx, cfg) {
  var home = await bzhFetchHome(ctx, cfg);
  var all = home.events.concat(home.channels || []);
  if (!all.length) return null;
  var key = String(ctx.matchId || '').replace(/^bzh_/, '');
  var list = all.map(function (ev) {
    return {
      id: 'bzh_' + (ev.alwaysOn ? 'ch_' + String(ev.path || '').replace(/^\//, '') : ev.key),
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
      if (bzhMatchKey(list[i].ev, key)) {
        hit = list[i];
        break;
      }
    }
  }
  // Another catalog's fixture (or stale id) → soft team/title match.
  if (!hit) hit = liveFindFixtureInList(list, ctx);
  if (!hit) return null;
  return { origin: home.origin, ev: hit.ev };
}

function discoverEmbedRow(ctx, embed) {
  var url = String((embed && embed.url) || '').trim();
  if (!url || isSkippableIframe(url)) return null;
  return {
    url: url,
    name: NAME + ' · ' + (embed.label || 'Link'),
    source: 'bzhsport',
    viewers: Number(ctx.viewers || 0),
  };
}

async function listEventStreams(ctx, cfg) {
  var found = await findEvent(ctx, cfg);
  if (!found) return [];
  var pageUrl = found.origin + found.ev.path;
  var res = await ctx.fetch(pageUrl, { headers: { 'User-Agent': ua(), Referer: found.origin + '/' } });
  if (!res.ok) return [];
  var embeds = parseEventEmbeds(await res.text(), pageUrl);
  if (!embeds.length) return [];

  // Providers discover: fast HTTP unlock only (EngineJS, short timeout).
  var unlocked = await Promise.all(
    embeds.map(function (e) {
      return unlockEmbed(ctx, e.url, pageUrl, false).catch(function () {
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
  if (out.length) return out;
  // Hand off player pages for unlock-on-play (WebView sniff / daddy).
  for (var j = 0; j < embeds.length; j++) {
    var row = discoverEmbedRow(ctx, embeds[j]);
    if (!row || seen[row.url]) continue;
    seen[row.url] = 1;
    out.push(row);
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
    var unlocked = await unlockEmbed(ctx, raw, bzhOrigins(cfg)[0] + '/', true);
    if (unlocked) return [streamRow(ctx, unlocked, 'Link')];
    return [];
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
