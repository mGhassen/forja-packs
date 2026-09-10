// Unified live_sport plugin — catalog + resolve (streamic)
// Catalog half (top-level)
function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

var CATALOG_MAX = 120;

function streamicOrigin(cfg) {
  return String((cfg && cfg.origin) || 'https://streamic.st').replace(/\/$/, '');
}

function streamicHeaders(cfg) {
  var origin = streamicOrigin(cfg);
  var headers = {
    Accept: '*/*',
    Referer: origin + '/',
    'User-Agent': ua(),
  };
  var ssig = String((cfg && cfg.ssig) || 'bytmo8xialhem066').trim();
  if (ssig) headers['X-SSIG'] = ssig;
  return headers;
}

function hexByte(n) {
  var hex = (n & 0xff).toString(16);
  return hex.length < 2 ? '0' + hex : hex;
}

function utf8FromBinary(bin) {
  if (!bin) return '';
  if (typeof TextDecoder !== 'undefined') {
    try {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {}
  }
  try {
    return decodeURIComponent(
      bin
        .split('')
        .map(function (c) {
          return '%' + hexByte(c.charCodeAt(0));
        })
        .join('')
    );
  } catch (_) {
    try {
      return decodeURIComponent(escape(bin));
    } catch (e2) {
      return bin;
    }
  }
}

function b64decodeUTF8(b64) {
  var raw = String(b64 || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '');
  if (!raw) return '';
  try {
    return utf8FromBinary(atob(raw));
  } catch (_) {
    return '';
  }
}

function parseStreamicEventsBody(body) {
  var trimmed = String(body || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!trimmed) return [];
  if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
    var direct = JSON.parse(trimmed);
    return Array.isArray(direct) ? direct : direct.events || direct.streams || [];
  }
  var decoded = b64decodeUTF8(trimmed);
  if (!decoded) return [];
  var data = JSON.parse(decoded);
  return Array.isArray(data) ? data : data.events || data.streams || [];
}

async function readFetchBody(res) {
  if (!res) return '';
  if (res._bodyB64) {
    try {
      var bin = atob(String(res._bodyB64 || ''));
      var fromB64 = '';
      for (var i = 0; i < bin.length; i++) fromB64 += bin.charAt(i);
      if (fromB64) return fromB64.trim();
    } catch (_) {}
  }
  if (typeof res.text === 'function') {
    try {
      var text = await res.text();
      if (text) return String(text).trim();
    } catch (_) {}
  }
  return '';
}

function eventTitle(m) {
  var title = m && m.title;
  if (title && typeof title === 'object') {
    if (title.pl && title.pl.home && title.pl.away) {
      return String(title.pl.home) + ' - ' + String(title.pl.away);
    }
    return String(title.home || title.away || title.en || title.pl || '');
  }
  return String((m && (m.title || m.name)) || 'Streamic');
}

function parseTeams(m) {
  var title = m && m.title;
  if (title && typeof title === 'object' && title.pl) {
    return {
      home: String(title.pl.home || '').trim(),
      away: String(title.pl.away || '').trim(),
    };
  }
  var text = eventTitle(m);
  var dash = text.split(/\s+-\s+/);
  if (dash.length >= 2) {
    return {
      home: dash[0].trim(),
      away: dash.slice(1).join(' - ').trim(),
    };
  }
  return { home: '', away: '' };
}

function normCategory(raw) {
  var s = String(raw || 'other').toLowerCase();
  if (s.indexOf('football') >= 0 || s.indexOf('soccer') >= 0) return 'football';
  if (s.indexOf('pilkanozna') >= 0 || s.indexOf('pilka') >= 0) return 'football';
  if (s.indexOf('basket') >= 0) return 'basketball';
  if (s.indexOf('hockey') >= 0 || s.indexOf('nhl') >= 0) return 'hockey';
  if (s.indexOf('mma') >= 0 || s.indexOf('ufc') >= 0) return 'mma';
  return s.replace(/\s+/g, '-');
}

function inCatalogWindow(ts) {
  if (!ts) return false;
  var ms = ts >= 1e12 ? ts : ts * 1000;
  var now = Date.now();
  return ms >= now - 24 * 3600000 && ms <= now + 7 * 24 * 3600000;
}

function isAiring(startTime) {
  if (!startTime) return false;
  var nowSec = Math.floor(Date.now() / 1000);
  return startTime <= nowSec && startTime >= nowSec - 6 * 3600;
}

async function fetchPopularList(ctx, cfg) {
  var origin = streamicOrigin(cfg);
  var api = (cfg && cfg.popularApi) || origin + '/api/J.php';
  try {
    var res = await ctx.fetch(api, { headers: streamicHeaders(cfg) });
    if (!res.ok) return [];
    var data = await res.json();
    return Array.isArray(data) ? data : data.events || data.streams || [];
  } catch (_) {
    return [];
  }
}

async function fetchMainList(ctx, cfg) {
  var origin = streamicOrigin(cfg);
  var api = (cfg && cfg.api) || origin + '/api/getEvents.php';
  try {
    var res = await ctx.fetch(api, { headers: streamicHeaders(cfg) });
    if (!res.ok) return [];
    var body = await readFetchBody(res);
    if (!body) return [];
    return parseStreamicEventsBody(body);
  } catch (_) {
    return [];
  }
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'streamic');
  var popular = await fetchPopularList(ctx, cfg);
  var main = await fetchMainList(ctx, cfg);
  var byId = {};

  popular.forEach(function (m, i) {
    if (!m) return;
    var id = String(m.id || 'pop_' + i);
    m._popular = true;
    byId[id] = m;
  });
  main.forEach(function (m, i) {
    if (!m) return;
    var id = String(m.id || 'evt_' + i);
    if (!byId[id]) byId[id] = m;
  });

  return Object.keys(byId)
    .map(function (k) {
      return byId[k];
    })
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
      var airing = isAiring(startTime);
      var teams = parseTeams(m);
      var row = {
        id: 'sic_' + id,
        title: eventTitle(m),
        category: normCategory(m.sport || m.category || 'other'),
        date: startTime > 0 ? startTime : Date.now(),
        poster: '',
        popular: m._popular === true || airing,
        airing: airing,
        viewers: 0,
        sources: [{ source: 'streamic', id: id }],
        catalog: 'forja_live',
        pluginId: pluginId,
      };
      if (teams.home) row.homeTeam = teams.home;
      if (teams.away) row.awayTeam = teams.away;
      return liveCatalogStamp(row, pluginId);
    });
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function streamicOrigin(cfg) {
  return String((cfg && cfg.origin) || 'https://streamic.st').replace(/\/$/, '');
}

function streamicHeaders(cfg) {
  var origin = streamicOrigin(cfg);
  var headers = {
    Accept: '*/*',
    Referer: origin + '/',
    'User-Agent': ua(),
  };
  var ssig = String((cfg && cfg.ssig) || 'bytmo8xialhem066').trim();
  if (ssig) headers['X-SSIG'] = ssig;
  return headers;
}

function streamicReferer(cfg) {
  return streamicOrigin(cfg) + '/';
}

function hexByte(n) {
  var hex = (n & 0xff).toString(16);
  return hex.length < 2 ? '0' + hex : hex;
}

function utf8FromBinary(bin) {
  if (!bin) return '';
  if (typeof TextDecoder !== 'undefined') {
    try {
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      return new TextDecoder('utf-8').decode(bytes);
    } catch (_) {}
  }
  try {
    return decodeURIComponent(
      bin
        .split('')
        .map(function (c) {
          return '%' + hexByte(c.charCodeAt(0));
        })
        .join('')
    );
  } catch (_) {
    try {
      return decodeURIComponent(escape(bin));
    } catch (e2) {
      return bin;
    }
  }
}

function b64decodeUTF8(b64) {
  var raw = String(b64 || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '');
  if (!raw) return '';
  try {
    return utf8FromBinary(atob(raw));
  } catch (_) {
    return '';
  }
}

function parseStreamicEventsBody(body) {
  var trimmed = String(body || '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!trimmed) return [];
  if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
    var direct = JSON.parse(trimmed);
    return Array.isArray(direct) ? direct : direct.events || direct.streams || [];
  }
  var decoded = b64decodeUTF8(trimmed);
  if (!decoded) return [];
  var data = JSON.parse(decoded);
  return Array.isArray(data) ? data : data.events || data.streams || [];
}

async function readFetchBody(res) {
  if (!res) return '';
  if (res._bodyB64) {
    try {
      var bin = atob(String(res._bodyB64 || ''));
      var fromB64 = '';
      for (var i = 0; i < bin.length; i++) fromB64 += bin.charAt(i);
      if (fromB64) return fromB64.trim();
    } catch (_) {}
  }
  if (typeof res.text === 'function') {
    try {
      var text = await res.text();
      if (text) return String(text).trim();
    } catch (_) {}
  }
  return '';
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
  if (u.indexOf('embed.st') >= 0 || u.indexOf('embedindia.st') >= 0) return 1;
  if (u.indexOf('embed/') >= 0 && u.indexOf('admin/') >= 0) return 1;
  if (u.indexOf('dlhd.pk') >= 0 || u.indexOf('dlive.sx') >= 0 || u.indexOf('daddy.php') >= 0) {
    return 1;
  }
  if (u.indexOf('strmi.buzz') >= 0 || u.indexOf('strm.buzz') >= 0) return 2;
  if (u.indexOf('streami.fit') >= 0) return 2;
  if (u.indexOf('lovetier.bz') >= 0 || u.indexOf('lovecdn.ru') >= 0) return 3;
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

async function unlockEmbed(ctx, url, cfg) {
  var raw = String(url || '').trim();
  if (!raw) return null;

  var nested = m3u8FromEmbedUrl(raw);
  if (nested) {
    return {
      url: nested,
      name: 'Streamic',
      headers: {
        Referer: streamicReferer(cfg),
        Origin: streamicOrigin(cfg),
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

function withName(row, name) {
  if (!row) return null;
  row.name = name || row.name || 'Streamic';
  return row;
}

async function resolveUrl(ctx, url, name, cfg) {
  var raw = String(url || '').trim();
  if (!raw) return null;
  var ref = streamicReferer(cfg);

  if (/\.m3u8|\.mp4/i.test(raw)) {
    return {
      url: raw,
      name: name || 'Streamic',
      headers: {
        Referer: ref,
        Origin: streamicOrigin(cfg),
        'User-Agent': ua(),
      },
      directPlayback: preferDirectPlayback(raw),
    };
  }

  var unlocked = await unlockEmbed(ctx, raw, cfg);
  if (unlocked) return withName(unlocked, name || 'Streamic');

  // Unlock failed — omit (never hand embed HTML to native player).
  return null;
}

async function mapWithConcurrency(items, limit, fn) {
  if (!items.length) return [];
  var out = new Array(items.length);
  var index = 0;
  async function worker() {
    while (index < items.length) {
      var i = index++;
      out[i] = await fn(items[i], i);
    }
  }
  var workers = [];
  var count = Math.max(1, Math.min(limit, items.length));
  for (var w = 0; w < count; w++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

async function collectEmbeds(ctx, m, cfg) {
  var pending = [];
  var seen = {};
  (m._embeds || []).forEach(function (group) {
    var lang = String(group.language || '').trim();
    embedRows(group).forEach(function (e) {
      var url = String(e.embed || e.url || '').trim();
      if (!url || seen[url]) return;
      seen[url] = 1;
      var label = String(e.label || '').trim();
      var name = lang && label ? lang + ' · ' + label : lang || label || 'Streamic';
      pending.push({ url: url, name: name, priority: embedPriority(url) });
    });
  });
  if (!pending.length) {
    var direct = String(m.url || m.link || '').trim();
    if (direct) pending.push({ url: direct, name: 'Streamic', priority: embedPriority(direct) });
  }
  pending.sort(function (a, b) {
    return a.priority - b.priority;
  });

  var resolved = await mapWithConcurrency(pending, 4, function (item) {
    return resolveUrl(ctx, item.url, item.name, cfg);
  });
  var out = [];
  for (var i = 0; i < resolved.length; i++) {
    var row = resolved[i];
    if (row && row.url) out.push(row);
  }
  return out;
}

async function fetchPopularList(ctx, cfg) {
  var origin = streamicOrigin(cfg);
  var api = (cfg && cfg.popularApi) || origin + '/api/J.php';
  try {
    var res = await ctx.fetch(api, { headers: streamicHeaders(cfg) });
    if (!res.ok) return [];
    var data = await res.json();
    return Array.isArray(data) ? data : data.events || data.streams || [];
  } catch (_) {
    return [];
  }
}

async function fetchMainList(ctx, cfg) {
  var origin = streamicOrigin(cfg);
  var api = (cfg && cfg.api) || origin + '/api/getEvents.php';
  try {
    var res = await ctx.fetch(api, { headers: streamicHeaders(cfg) });
    if (!res.ok) return [];
    var body = await readFetchBody(res);
    if (!body) return [];
    return parseStreamicEventsBody(body);
  } catch (_) {
    return [];
  }
}

async function fetchList(ctx, cfg) {
  var popular = await fetchPopularList(ctx, cfg);
  var main = await fetchMainList(ctx, cfg);
  var byId = {};
  popular.forEach(function (m, i) {
    if (!m) return;
    var id = String(m.id || 'pop_' + i);
    m._popular = true;
    byId[id] = m;
  });
  main.forEach(function (m, i) {
    if (!m) return;
    var id = String(m.id || 'evt_' + i);
    if (!byId[id]) byId[id] = m;
    else if (m._embeds && m._embeds.length) byId[id]._embeds = m._embeds;
  });
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}

async function resolveByEvent(ctx, cfg) {
  var eventKey = String(ctx.eventId || ctx.matchId || '').replace(/^sic_/, '');
  var list = await fetchList(ctx, cfg);
  if (eventKey && ctx.fixtureSearch !== true) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (String(m.id || i) === eventKey) {
        return collectEmbeds(ctx, m, cfg);
      }
    }
  }
  var hit = liveFindFixtureInList(list, ctx);
  if (!hit) return [];
  return collectEmbeds(ctx, hit, cfg);
}

async function resolveExtract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, ctx.config || {});
  var direct = String(ctx.url || ctx.embedUrl || '').trim();
  if (direct) {
    var row = await resolveUrl(ctx, direct, 'Streamic', cfg);
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
