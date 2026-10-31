// Unified live_sport plugin — catalog + resolve (strumyk)
// Peer: streamic.js. Upstream: strumyk.ca / strumyk.cv (multi-lang embeds).

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

var CATALOG_MAX = 200;
var NAME = 'Strumyk';
var SOURCE = 'strumyk';

function strumykOrigins(cfg) {
  var list = [];
  var raw = (cfg && cfg.origins) || [];
  if (Array.isArray(raw)) list = raw.slice();
  else if (raw) list = [raw];
  if (cfg && cfg.origin) list.unshift(cfg.origin);
  var out = [];
  var seen = {};
  list.forEach(function (o) {
    var s = String(o || '')
      .trim()
      .replace(/\/$/, '');
    if (!s || seen[s]) return;
    seen[s] = 1;
    out.push(s);
  });
  if (!out.length) out = ['https://strumyk.ca'];
  return out;
}

function strumykOrigin(cfg) {
  return strumykOrigins(cfg)[0];
}

function strumykHeaders(origin, cookie) {
  var headers = {
    Accept: '*/*',
    Referer: origin + '/',
    'User-Agent': ua(),
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  };
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function http(ctx) {
  return typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch.bind(ctx);
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function readBody(res) {
  if (!res) return '';
  if (res._bodyB64) {
    try {
      var bin = atob(String(res._bodyB64 || ''));
      if (bin) return bin;
    } catch (_) {}
  }
  if (typeof res.text === 'function') {
    try {
      return String(await res.text());
    } catch (_) {}
  }
  return '';
}

function cookieFromRes(res) {
  if (!res || !res.headers) return '';
  var raw = '';
  try {
    if (typeof res.headers.getSetCookie === 'function') {
      var arr = res.headers.getSetCookie();
      if (arr && arr.length) raw = arr.join(',');
    }
  } catch (_) {}
  if (!raw) {
    try {
      raw = res.headers.get('set-cookie') || res.headers.get('Set-Cookie') || '';
    } catch (_) {}
  }
  var m = String(raw).match(/PHPSESSID=([^;,\s]+)/i);
  return m ? 'PHPSESSID=' + m[1] : '';
}

/** Parse `window.SK = {…}` JSON from the post-gate homepage. */
function parseWindowSk(html) {
  var body = String(html || '');
  var i = body.indexOf('window.SK');
  if (i < 0) return null;
  var start = body.indexOf('{', i);
  if (start < 0) return null;
  var depth = 0;
  var inStr = false;
  var esc = false;
  var quote = '';
  for (var p = start; p < body.length; p++) {
    var ch = body.charAt(p);
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, p + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function skSessionFromHtml(html, origin, cookie) {
  var sk = parseWindowSk(html);
  var api = {};
  var backgrounds = {};
  var catImages = {};
  if (sk && sk.api && typeof sk.api === 'object') {
    ['L', 'M', 'J', 'X', 'O'].forEach(function (key) {
      if (sk.api[key]) api[key] = String(sk.api[key]);
    });
  }
  if (sk && sk.backgrounds && typeof sk.backgrounds === 'object') {
    Object.keys(sk.backgrounds).forEach(function (id) {
      var u = String(sk.backgrounds[id] || '').trim();
      if (u) backgrounds[id] = absApi(origin, u);
    });
  }
  if (sk && Array.isArray(sk.categories)) {
    sk.categories.forEach(function (c) {
      if (!c || !c.key) return;
      var img = String(c.image || '').trim();
      if (img) catImages[String(c.key)] = absApi(origin, img);
    });
  }
  return {
    origin: origin,
    cookie: cookie || '',
    html: html,
    api: api,
    backgrounds: backgrounds,
    catImages: catImages,
  };
}

function absApi(origin, path) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return origin + p;
}

var _strumykSess = { at: 0, sess: null };
var SESS_TTL_MS = 50000;

async function openSession(ctx, origin) {
  var fetchFn = http(ctx);
  var headers = {
    'User-Agent': ua(),
    Accept: 'text/html,application/xhtml+xml,*/*',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: origin + '/',
  };
  var res1 = await fetchFn(origin + '/', { headers: headers });
  var cookie = cookieFromRes(res1);
  var html1 = await readBody(res1);
  if (html1.indexOf('window.SK') >= 0) {
    return skSessionFromHtml(html1, origin, cookie);
  }
  // Gate page reloads after 1s — PHPSESSID alone is not enough until then.
  // Keep to one wait: Providers discover timeout is only ~3s.
  await sleep(1050);
  var headers2 = Object.assign({}, headers);
  if (cookie) headers2.Cookie = cookie;
  var res2 = await fetchFn(origin + '/', { headers: headers2 });
  var cookie2 = cookieFromRes(res2) || cookie;
  var html2 = await readBody(res2);
  if (html2.indexOf('window.SK') < 0) {
    await sleep(900);
    var res3 = await fetchFn(origin + '/', { headers: headers2 });
    cookie2 = cookieFromRes(res3) || cookie2;
    html2 = await readBody(res3);
  }
  return skSessionFromHtml(html2, origin, cookie2);
}

async function pickSession(ctx, cfg) {
  if (
    _strumykSess.sess &&
    _strumykSess.sess.api &&
    Date.now() - _strumykSess.at < SESS_TTL_MS
  ) {
    return _strumykSess.sess;
  }
  var origins = strumykOrigins(cfg);
  var last = null;
  for (var i = 0; i < origins.length; i++) {
    try {
      var sess = await openSession(ctx, origins[i]);
      last = sess;
      if (sess && sess.api && (sess.api.L || sess.api.J || sess.api.O)) {
        _strumykSess = { at: Date.now(), sess: sess };
        return sess;
      }
    } catch (_) {}
  }
  if (last && last.api && (last.api.L || last.api.J || last.api.O)) {
    _strumykSess = { at: Date.now(), sess: last };
  }
  return last;
}

async function fetchJsonArray(ctx, url, headers) {
  if (!url) return [];
  try {
    var res = await http(ctx)(url, { headers: headers || { 'User-Agent': ua() } });
    if (!res || !res.ok) return [];
    var data = null;
    if (typeof res.json === 'function') {
      try {
        data = await res.json();
      } catch (_) {}
    }
    if (data == null) {
      var body = await readBody(res);
      if (!body) return [];
      try {
        data = JSON.parse(body);
      } catch (_) {
        return [];
      }
    }
    if (Array.isArray(data)) return data;
    if (data && data.error) return [];
    if (data && Array.isArray(data.events)) return data.events;
    return [];
  } catch (_) {
    return [];
  }
}

function eventTitle(m) {
  var title = m && m.title;
  if (title && typeof title === 'object') {
    var pl = title.pl || title.en || {};
    if (pl.home && pl.away) return String(pl.home) + ' - ' + String(pl.away);
    if (pl.home) return String(pl.home);
    if (title.en && title.en.home && title.en.away) {
      return String(title.en.home) + ' - ' + String(title.en.away);
    }
    return String(title.home || title.away || title.en || title.pl || NAME);
  }
  return String((m && (m.title || m.name)) || NAME);
}

function parseTeams(m) {
  var title = m && m.title;
  if (title && typeof title === 'object') {
    var a = title.pl || title.en || {};
    return {
      home: String(a.home || '').trim(),
      away: String(a.away || '').trim(),
    };
  }
  var text = eventTitle(m);
  var dash = text.split(/\s+-\s+/);
  if (dash.length >= 2) {
    return { home: dash[0].trim(), away: dash.slice(1).join(' - ').trim() };
  }
  return { home: '', away: '' };
}

function normCategory(raw) {
  var s = String(raw || 'other').toLowerCase();
  if (
    s === 'pilkanozna' ||
    s.indexOf('football') >= 0 ||
    s.indexOf('soccer') >= 0
  ) {
    return 'football';
  }
  if (s === 'koszykowka' || s.indexOf('basket') >= 0) return 'basketball';
  if (s === 'hokej' || s.indexOf('hockey') >= 0 || s.indexOf('nhl') >= 0) {
    return 'hockey';
  }
  if (s === 'siatkowka' || s.indexOf('volley') >= 0) return 'volleyball';
  if (s === 'tenis' || s.indexOf('tennis') >= 0) return 'tennis';
  if (s === 'boks' || s.indexOf('box') >= 0) return 'boxing';
  if (s === 'mma' || s.indexOf('ufc') >= 0) return 'mma';
  if (s === 'formula1' || s === 'motorsport' || s === 'motogp' || s === 'zuzel') {
    return 'motor-sports';
  }
  if (s === 'americanfootball') return 'american-football';
  if (s === 'pilkareczna') return 'handball';
  if (s === 'baseball') return 'baseball';
  if (s === 'dart') return 'darts';
  if (s === 'snooker') return 'snooker';
  if (s === 'telewizja' || s === 'tv') return '24-7';
  return s.replace(/\s+/g, '-') || 'other';
}

function inCatalogWindow(ts) {
  if (!ts) return false;
  var ms = ts >= 1e12 ? ts : ts * 1000;
  var now = Date.now();
  return ms >= now - 24 * 3600000 && ms <= now + 7 * 24 * 3600000;
}

function isAiring(startTime, endTime) {
  var nowSec = Math.floor(Date.now() / 1000);
  var start = Number(startTime) || 0;
  if (!start) return false;
  if (endTime) return start <= nowSec && nowSec < Number(endTime);
  return start <= nowSec && start >= nowSec - 6 * 3600;
}

async function fetchAllEvents(ctx, cfg) {
  var sess = await pickSession(ctx, cfg);
  if (!sess || !sess.origin) {
    return { events: [], backgrounds: {}, catImages: {}, origin: '' };
  }
  var origin = sess.origin;
  var api = sess.api || {};
  var headers = strumykHeaders(origin, sess.cookie);
  var backgrounds = sess.backgrounds || {};
  var catImages = sess.catImages || {};
  // Signed L/M expire in ~1 min — fire immediately after SK parse.
  var urls = {
    L: absApi(origin, api.L),
    M: absApi(origin, api.M),
    J: absApi(origin, api.J || '/api/J.php'),
    X: absApi(origin, api.X || '/api/X.php'),
    O: absApi(origin, api.O || '/api/O.php'),
  };
  var parts = await Promise.all([
    fetchJsonArray(ctx, urls.L, headers),
    fetchJsonArray(ctx, urls.M, headers),
    fetchJsonArray(ctx, urls.J, headers),
    fetchJsonArray(ctx, urls.X, headers),
    fetchJsonArray(ctx, urls.O, headers),
  ]);
  var byId = {};
  var popular = {};
  parts[2].forEach(function (e) {
    if (e && e.id) popular[String(e.id)] = true;
  });
  ['L', 'M', 'J', 'X', 'O'].forEach(function (src, i) {
    (parts[i] || []).forEach(function (e) {
      if (!e || !e.id) return;
      var id = String(e.id);
      e._src = src;
      e.startTime = parseInt(e.startTime, 10) || 0;
      if (e.endTime) e.endTime = parseInt(e.endTime, 10) || 0;
      if (popular[id]) e._popular = true;
      if (!byId[id]) byId[id] = e;
      else if (e._embeds && e._embeds.length) byId[id]._embeds = e._embeds;
    });
  });
  return {
    events: Object.keys(byId).map(function (k) {
      return byId[k];
    }),
    backgrounds: backgrounds,
    catImages: catImages,
    origin: origin,
  };
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || SOURCE);
  var pack = await fetchAllEvents(ctx, cfg);
  var list = pack.events || [];
  var backgrounds = pack.backgrounds || {};
  var catImages = pack.catImages || {};

  return list
    .filter(function (m) {
      return inCatalogWindow(m.startTime ? Number(m.startTime) : 0);
    })
    .sort(function (a, b) {
      if (a._popular === true && b._popular !== true) return -1;
      if (b._popular === true && a._popular !== true) return 1;
      return Number(a.startTime || 0) - Number(b.startTime || 0);
    })
    .slice(0, CATALOG_MAX)
    .map(function (m, i) {
      var id = String(m.id || i);
      var startTime = m.startTime ? Number(m.startTime) : 0;
      var airing = isAiring(startTime, m.endTime);
      var teams = parseTeams(m);
      var rawCat = String(m.category || m.sport || '').trim();
      // Backdrop = event hero or sport image — never stretch tiny team logos.
      var poster =
        String(backgrounds[id] || '').trim() ||
        String(catImages[rawCat] || '').trim() ||
        '';
      var homeBadge =
        m.logos && m.logos.home ? String(m.logos.home).trim() : '';
      var awayBadge =
        m.logos && m.logos.away ? String(m.logos.away).trim() : '';
      var row = {
        id: 'sk_' + id,
        title: eventTitle(m),
        category: normCategory(rawCat || 'other'),
        date: startTime > 0 ? startTime : Date.now(),
        poster: poster,
        popular: m._popular === true || airing,
        airing: airing,
        viewers: 0,
        sources: [{ source: SOURCE, id: id }],
        catalog: 'forja_live',
        pluginId: pluginId,
      };
      if (teams.home) row.homeTeam = teams.home;
      if (teams.away) row.awayTeam = teams.away;
      if (homeBadge) row.homeBadge = homeBadge;
      if (awayBadge) row.awayBadge = awayBadge;
      return liveCatalogStamp(row, pluginId);
    });
}

var __resolveExtract = (function () {
  function referer(cfg) {
    return strumykOrigin(cfg) + '/';
  }

  function m3u8FromEmbedUrl(url) {
    try {
      var u = new URL(String(url || '').trim());
      var q = u.searchParams.get('url') || u.searchParams.get('src') || '';
      if (q) {
        var decoded = decodeURIComponent(q);
        if (/\.m3u8/i.test(decoded)) return decoded;
      }
    } catch (_) {}
    return '';
  }

  function embedPriority(url) {
    var u = String(url || '').toLowerCase();
    if (/\.m3u8|\.mp4/i.test(u)) return 0;
    if (u.indexOf('/shopping') >= 0) return 1;
    if (u.indexOf('embed.st') >= 0 || u.indexOf('embedindia.st') >= 0) return 1;
    if (u.indexOf('dlhd.') >= 0 || u.indexOf('daddy') >= 0 || u.indexOf('dlstreams') >= 0) {
      return 1;
    }
    if (u.indexOf('lovetier.bz') >= 0 || u.indexOf('lovecdn.ru') >= 0) return 2;
    if (u.indexOf('wideiptv') >= 0) return 1;
    if (u.indexOf('truckrefuse') >= 0 || u.indexOf('ordernap') >= 0) return 3;
    if (u.indexOf('viewembed') >= 0) return 3;
    if (u.indexOf('youtube.com') >= 0 || u.indexOf('youtu.be') >= 0) return 9;
    return 4;
  }

  function embedRows(group) {
    var embeds = group && group.embeds;
    if (!embeds) return [];
    if (Array.isArray(embeds)) return embeds;
    if (typeof embeds === 'object') {
      return Object.keys(embeds)
        .sort()
        .map(function (k) {
          return embeds[k];
        })
        .filter(Boolean);
    }
    return [];
  }

  function isSkippable(url) {
    var u = String(url || '').toLowerCase();
    if (!u || !/^https?:\/\//i.test(u)) return true;
    if (u.indexOf('youtube.com') >= 0 || u.indexOf('youtu.be') >= 0) return true;
    return false;
  }

  async function sniffUnlocked(ctx, embedUrl, pageReferer) {
    if (!ctx.live || typeof ctx.live.sniffEmbed !== 'function') return null;
    try {
      var m3u8 = await ctx.live.sniffEmbed(String(embedUrl), String(pageReferer || embedUrl));
      if (!m3u8 || !/^https?:\/\//i.test(String(m3u8))) return null;
      return {
        url: String(m3u8),
        headers: {
          Referer: pageReferer || embedUrl,
          'User-Agent': ua(),
        },
        directPlayback: preferDirectPlayback(String(m3u8)),
      };
    } catch (_) {
      return null;
    }
  }

  async function unlockEmbed(ctx, url, cfg, allowSniff) {
    var raw = String(url || '').trim();
    if (!raw || isSkippable(raw)) return null;

    var nested = m3u8FromEmbedUrl(raw);
    if (nested) {
      return {
        url: nested,
        headers: {
          Referer: referer(cfg),
          Origin: strumykOrigin(cfg),
          'User-Agent': ua(),
        },
        directPlayback: preferDirectPlayback(nested),
      };
    }

    if (isEmbedIndiaUrl(raw)) {
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
            return {
              url: String(unlockedUrl),
              headers: {
                Referer: raw,
                Origin: 'https://sportsembed.su',
                'User-Agent': ua(),
              },
              directPlayback: preferDirectPlayback(unlockedUrl),
            };
          }
        } catch (_) {}
      }
    }

    if (isDaddyLiveUrl(raw)) {
      try {
        var daddy = await resolveDaddyLiveEmbed(ctx, raw, cfg);
        if (daddy && daddy.length) return daddy[0];
      } catch (_) {}
    }

    if (isVideocdnUrl(raw)) {
      try {
        var vcdn = await resolveVideocdnEmbed(ctx, raw);
        if (vcdn && vcdn.length) return vcdn[0];
      } catch (_) {}
    }

    if (isWideiptvUrl(raw)) {
      try {
        var wide = await resolveWideiptvEmbed(ctx, raw);
        if (wide) return wide;
      } catch (_) {}
    }

    // Gated CDNs (truckrefuse / viewembed) — WebView sniff on play.
    if (allowSniff) {
      var sniffed = await sniffUnlocked(ctx, raw, referer(cfg));
      if (sniffed) return sniffed;
    }

    return null;
  }

  function streamRow(unlocked, name) {
    if (!unlocked || !unlocked.url) return null;
    return {
      url: unlocked.url,
      name: name || NAME,
      source: SOURCE,
      headers: unlocked.headers || { 'User-Agent': ua() },
      directPlayback:
        unlocked.directPlayback != null
          ? unlocked.directPlayback
          : preferDirectPlayback(unlocked.url),
    };
  }

  function discoverEmbedRow(embed, name) {
    var url = String((embed && embed.url) || '').trim();
    if (!url || isSkippable(url)) return null;
    return {
      url: url,
      name: name || NAME,
      source: SOURCE,
    };
  }

  function absEmbed(url, origin) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    var base = String(origin || '').replace(/\/$/, '');
    if (!base) return u;
    if (u.charAt(0) === '/') return base + u;
    return base + '/' + u;
  }

  function isWideiptvUrl(url) {
    try {
      var h = new URL(String(url || '').trim()).hostname.toLowerCase();
      return h === 'wideiptv.top' || h.endsWith('.wideiptv.top');
    } catch (_) {
      return false;
    }
  }

  async function resolveWideiptvEmbed(ctx, embedUrl) {
    var raw = String(embedUrl || '').trim();
    if (!raw || !isWideiptvUrl(raw)) return null;
    var origin = 'https://wideiptv.top';
    try {
      origin = new URL(raw).origin;
    } catch (_) {}
    var res = await http(ctx)(raw, {
      headers: {
        'User-Agent': ua(),
        Accept: 'text/html,application/xhtml+xml,*/*',
        Referer: origin + '/',
      },
    });
    if (!res || !res.ok) return null;
    var html = await readBody(res);
    var m =
      html.match(/streamUrl\s*:\s*"((?:\\.|[^"\\])*)"/) ||
      html.match(/streamUrl\s*:\s*'((?:\\.|[^'\\])*)'/);
    if (!m) return null;
    var m3u8 = String(m[1] || '')
      .replace(/\\\//g, '/')
      .replace(/\\u0026/gi, '&')
      .trim();
    if (!/^https?:\/\//i.test(m3u8) || !/\.m3u8/i.test(m3u8)) return null;
    return {
      url: m3u8,
      headers: {
        Referer: origin + '/',
        Origin: origin,
        'User-Agent': ua(),
      },
      directPlayback: preferDirectPlayback(m3u8),
    };
  }

  function collectPending(m, origin) {
    var pending = [];
    var seen = {};
    (m._embeds || []).forEach(function (group) {
      var lang = String(group.language || '').trim();
      embedRows(group).forEach(function (e) {
        var url = absEmbed(e.embed || e.url || '', origin);
        if (!url || seen[url] || isSkippable(url)) return;
        // Site-hosted /e/vip/* is ClearKey DASH — skip (native HLS only).
        if (/\/e\/vip\//i.test(url)) return;
        seen[url] = 1;
        var label = String(e.label || '').trim();
        var name = lang && label ? lang + ' · ' + label : lang || label || NAME;
        pending.push({ url: url, name: name, priority: embedPriority(url) });
      });
    });
    pending.sort(function (a, b) {
      return a.priority - b.priority;
    });
    return pending;
  }

  async function listEventStreams(ctx, cfg, m) {
    var origin = strumykOrigin(cfg);
    var pending = collectPending(m, origin);
    if (!pending.length) return [];

    // Providers discover budget is ~3s — unlock a few best hosts, hand off rest.
    var unlockN = Math.min(pending.length, 6);
    var unlocked = await Promise.all(
      pending.slice(0, unlockN).map(function (p) {
        return unlockEmbed(ctx, p.url, cfg, false).catch(function () {
          return null;
        });
      }),
    );

    var out = [];
    var seen = {};
    for (var i = 0; i < unlocked.length; i++) {
      var u = unlocked[i];
      if (!u) continue;
      var dedupe = String(u.url).split('?')[0];
      if (seen[dedupe]) continue;
      seen[dedupe] = 1;
      var row = streamRow(u, pending[i].name);
      if (row) out.push(row);
    }
    // Always surface remaining mirrors for unlock-on-play.
    for (var j = 0; j < pending.length; j++) {
      var handoff = discoverEmbedRow(pending[j], pending[j].name);
      if (!handoff || seen[handoff.url]) continue;
      seen[handoff.url] = 1;
      out.push(handoff);
    }
    return out;
  }

  async function resolveByEvent(ctx, cfg) {
    var eventKey = String(ctx.eventId || ctx.matchId || '')
      .replace(/^sk_/, '')
      .trim();
    var pack = await fetchAllEvents(ctx, cfg);
    var list = pack.events || [];
    if (eventKey && ctx.fixtureSearch !== true) {
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].id || '') === eventKey) {
          return listEventStreams(ctx, cfg, list[i]);
        }
      }
    }
    var mapped = list.map(function (m) {
      var teams = parseTeams(m);
      return {
        id: 'sk_' + String(m.id || ''),
        matchId: String(m.id || ''),
        title: eventTitle(m),
        homeTeam: teams.home,
        awayTeam: teams.away,
        dateMs: (Number(m.startTime) || 0) * 1000,
        _raw: m,
      };
    });
    var hit = liveFindFixtureInList(mapped, ctx);
    if (!hit || !hit._raw) return [];
    return listEventStreams(ctx, cfg, hit._raw);
  }

  async function resolveExtract(ctx) {
    var action = String(ctx.action || 'resolve');
    if (action !== 'resolve') return [];
    var cfg = Object.assign({}, ctx.config || {});
    var direct = String(ctx.url || ctx.embedUrl || ctx.iframe || '').trim();
    if (direct) {
      if (/\.m3u8(\?|$)/i.test(direct)) {
        var h = ctx.headers && typeof ctx.headers === 'object' ? ctx.headers : null;
        return [
          {
            url: direct,
            name: NAME,
            source: SOURCE,
            headers: h || {
              Referer: referer(cfg),
              'User-Agent': ua(),
            },
            directPlayback: preferDirectPlayback(direct),
          },
        ];
      }
      var unlocked = await unlockEmbed(ctx, direct, cfg, true);
      var row = streamRow(unlocked, NAME);
      return row ? [row] : [];
    }
    return resolveByEvent(ctx, cfg);
  }

  return resolveExtract;
})();

async function extract(ctx) {
  var action = String(ctx.action || '')
    .trim()
    .toLowerCase();
  if (action === 'catalog') return catalogExtract(ctx);
  if (action === 'resolve') return __resolveExtract(ctx);
  if (ctx.matchId || ctx.embedUrl || ctx.url || ctx.stream || ctx.fixtureSearch) {
    return __resolveExtract(ctx);
  }
  return catalogExtract(ctx);
}
