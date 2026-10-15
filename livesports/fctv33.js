// Unified live_sport plugin — catalog + resolve (FCTV33 / MadPlay TCPWE family)
// Catalog half (top-level)
var SPECS = {
  apiBase: 'https://apis-data-defra10.tcpwe138stya.ru',
  webOrigin: 'https://jack01eo.mpanrc4imind.my',
  // CDN Referer must be a g_player_domains host (jack site origin → 403).
  playerOrigin: 'https://nadia01eo.tn76degree12ec3out.cfd',
  digit: 'seth',
  continent: 'EU',
  country: 'FR',
  language: 0,
  siteType: 2001,
  usls: 'rbp',
  // 1 football · 2 basketball · 3 tennis · 4 cricket · 5 hockey · 6 baseball · 7 american-football · 8 other
  sportTypes: [1, 2, 3, 4, 5, 6, 7, 8],
};

var SPORT_KIND = {
  1: 'football',
  2: 'basketball',
  3: 'tennis',
  4: 'cricket',
  5: 'hockey',
  6: 'baseball',
  7: 'american-football',
  8: 'other',
};

// AES-CBC token keys (CryptoJS Utf8.parse of atob strings from site chunk).
var AES_KEY = 'a7981cc9eb2f4d19dcfea57b101ecd89';
var AES_IV = '8017d3a8f1400d2f';

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
}

function apiHeaders(cfg) {
  var origin = String(cfg.webOrigin || SPECS.webOrigin).replace(/\/$/, '');
  return {
    'User-Agent': ua(),
    Origin: origin,
    Referer: origin + '/',
    Accept: 'application/json, text/plain, */*',
  };
}

function headerGet(res, name) {
  if (!res || !res.headers) return '';
  if (typeof res.headers.get === 'function') {
    return String(res.headers.get(name) || res.headers.get(name.toLowerCase()) || '');
  }
  return String(res.headers[name] || res.headers[name.toLowerCase()] || '');
}

async function resBytes(res) {
  if (typeof arrayBuffer === 'function') {
    return new Uint8Array(await arrayBuffer(res));
  }
  if (res && typeof res.arrayBuffer === 'function') {
    return new Uint8Array(await res.arrayBuffer());
  }
  var t = await res.text();
  var out = new Uint8Array(t.length);
  for (var i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 0xff;
  return out;
}

function readVarint(buf, i) {
  // Float accumulate — JS `<<` truncates at 32 bits and nukes dateMs (epoch ms).
  var x = 0;
  var mul = 1;
  while (i < buf.length) {
    var c = buf[i++];
    x += (c & 0x7f) * mul;
    if (!(c & 0x80)) return { v: x, i: i };
    mul *= 128;
    if (mul > 0x20000000000000) return null; // past Number.MAX_SAFE_INTEGER
  }
  return null;
}

function parseFields(buf) {
  var i = 0;
  var out = [];
  while (i < buf.length) {
    var tag = buf[i++];
    var field = tag >>> 3;
    var wt = tag & 7;
    if (!field || field > 500) break;
    if (wt === 0) {
      var vr = readVarint(buf, i);
      if (!vr) break;
      out.push({ f: field, t: 'v', v: vr.v });
      i = vr.i;
    } else if (wt === 2) {
      var lr = readVarint(buf, i);
      if (!lr || i + lr.v > buf.length) break;
      i = lr.i;
      out.push({ f: field, t: 'b', v: buf.subarray(i, i + lr.v) });
      i += lr.v;
    } else if (wt === 5) {
      i += 4;
    } else if (wt === 1) {
      i += 8;
    } else {
      break;
    }
  }
  return out;
}

function pbStr(bytes) {
  try {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i];
      if (c < 32 || c > 126) return null;
      s += String.fromCharCode(c);
    }
    return s || null;
  } catch (_) {
    return null;
  }
}

function nestedName(bytes) {
  var fields = parseFields(bytes);
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].f === 2 && fields[i].t === 'b') {
      var s = pbStr(fields[i].v);
      if (s) return s;
    }
  }
  return pbStr(bytes);
}

function parseEntity(bytes) {
  var fields = parseFields(bytes);
  var id = 0;
  var name = '';
  var logo = '';
  for (var i = 0; i < fields.length; i++) {
    var it = fields[i];
    if (it.f === 1 && it.t === 'v' && !id) id = it.v;
    if (it.f === 3 && it.t === 'b') {
      var n = nestedName(it.v);
      if (n) name = n;
    }
    if (it.f === 4 && it.t === 'b') {
      var u = pbStr(it.v);
      if (u && /^https?:\/\//i.test(u)) logo = u.replace(/!w\d+$/, '');
    }
  }
  return { id: id, name: name, logo: logo };
}

function parseMatch(bytes) {
  var fields = parseFields(bytes);
  var matchId = 0;
  var sportType = 0;
  var dateMs = 0;
  var status = 0;
  var title = '';
  var entities = [];
  for (var i = 0; i < fields.length; i++) {
    var it = fields[i];
    if (it.f === 1 && it.t === 'v' && !matchId) matchId = it.v;
    else if (it.f === 2 && it.t === 'v' && !sportType) sportType = it.v;
    else if (it.f === 2 && it.t === 'b') {
      var t = pbStr(it.v);
      if (t) title = t;
    } else if (it.f === 3 && it.t === 'v') dateMs = it.v;
    else if (it.f === 4 && it.t === 'v') status = it.v;
    else if (it.f === 10 && it.t === 'b') entities.push(parseEntity(it.v));
  }
  if (!matchId) return null;
  // entities: [league, home, away] (league may be first named competition)
  var league = entities[0] || {};
  var home = entities[1] || {};
  var away = entities[2] || {};
  if (!title && home.name && away.name) title = home.name + ' vs ' + away.name;
  if (!title) title = league.name || String(matchId);
  return {
    matchId: matchId,
    sportType: sportType || 1,
    dateMs: dateMs,
    status: status,
    title: title,
    league: league.name || '',
    home: home,
    away: away,
  };
}

function parseStreamRow(bytes) {
  var fields = parseFields(bytes);
  var streamId = 0;
  var sportType = 0;
  var name = '';
  var streamStatus = 0;
  var priority = 0;
  var siteType = 0;
  for (var i = 0; i < fields.length; i++) {
    var it = fields[i];
    if (it.f === 1 && it.t === 'v') streamId = it.v;
    else if (it.f === 2 && it.t === 'v') sportType = it.v;
    else if (it.f === 3 && it.t === 'b') name = pbStr(it.v) || name;
    else if (it.f === 5 && it.t === 'v') streamStatus = it.v;
    else if (it.f === 8 && it.t === 'v') priority = it.v;
    else if (it.f === 9 && it.t === 'v') siteType = it.v;
  }
  if (!streamId) return null;
  return {
    streamId: streamId,
    sportType: sportType || 1,
    name: name || ('CH ' + streamId),
    streamStatus: streamStatus,
    priority: priority,
    siteType: siteType || 2001,
  };
}

function unwrapLivePayload(buf) {
  var top = parseFields(buf);
  for (var i = 0; i < top.length; i++) {
    if (top[i].f === 10 && top[i].t === 'b') return parseFields(top[i].v);
  }
  return top;
}

function parseLiveMatches(buf) {
  var inner = unwrapLivePayload(buf);
  var rows = [];
  for (var i = 0; i < inner.length; i++) {
    if (inner[i].f !== 1 || inner[i].t !== 'b') continue;
    var m = parseMatch(inner[i].v);
    if (m) rows.push(m);
  }
  return rows;
}

function parseDetailStreams(buf) {
  // Envelope field 10 → repeated field 2 = stream rows (field 1 = match).
  var inner = unwrapLivePayload(buf);
  var streams = [];
  for (var i = 0; i < inner.length; i++) {
    if (inner[i].f !== 2 || inner[i].t !== 'b') continue;
    var s = parseStreamRow(inner[i].v);
    if (s && s.streamId) streams.push(s);
  }
  return streams;
}

function parseBsMap(buf) {
  var map = {};
  var i = 0;
  while (i < buf.length - 35) {
    if (buf[i] === 0x08 && buf[i + 2] === 0x12 && buf[i + 3] === 0x20) {
      var code = buf[i + 1];
      var sig = '';
      for (var j = 0; j < 32; j++) sig += String.fromCharCode(buf[i + 4 + j]);
      if (/^[0-9a-f]{32}$/.test(sig)) {
        map[code] = sig;
        i += 36;
        continue;
      }
    }
    i++;
  }
  return map;
}

function orderedParamsJson(params) {
  var order = ['matchId', 'leagueId', 'seasonId', 'sportType', 'language', 'stream'];
  var parts = [];
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue;
    var v = params[k];
    var vv =
      typeof v === 'boolean' ? (v ? 'true' : 'false') : typeof v === 'string' ? JSON.stringify(v) : String(v);
    parts.push('"' + k + '":' + vv);
  }
  return '{' + parts.join(',') + '}';
}

function md5Hex6(ctx, s) {
  var C = ctx.crypto || globalThis.CryptoJS;
  if (!C || !C.MD5) throw new Error('md5 unavailable');
  return C.MD5(String(s)).toString(C.enc.Hex).slice(0, 6);
}

function rot47(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var o = s.charCodeAt(i);
    if (o >= 33 && o <= 126) out += String.fromCharCode(33 + ((o - 33 + 47) % 94));
    else out += s.charAt(i);
  }
  return out;
}

function decodeStreamUrl(enc) {
  var raw = rot47(String(enc || ''));
  var url = raw.length > 8 ? raw.slice(8) : raw;
  var idx = url.indexOf('.m3u8');
  if (idx >= 0) url = url.slice(0, idx + 5);
  return url;
}

function enCbcToken(ctx, rbSession) {
  var C = ctx.crypto || globalThis.CryptoJS;
  if (!C || !C.AES) throw new Error('aes unavailable');
  var enc = C.AES.encrypt(String(rbSession || ''), C.enc.Utf8.parse(AES_KEY), {
    iv: C.enc.Utf8.parse(AES_IV),
    mode: C.mode.CBC,
    padding: C.pad.Pkcs7,
  });
  return encodeURIComponent(enc.ciphertext.toString(C.enc.Base64)) + 'a';
}

function signMil(decUrl, token) {
  var u = new URL(String(decUrl));
  return u.origin + '/token-' + token + u.pathname + (u.search || '');
}

async function handshake(ctx, cfg) {
  var base = String(cfg.apiBase || SPECS.apiBase).replace(/\/$/, '');
  var h = apiHeaders(cfg);
  try {
    await ctx.fetch(base + '/api-cf/common/timesync', { headers: h });
  } catch (_) {}
  try {
    await ctx.fetch(base + '/api-cf/user/info', { headers: h });
  } catch (_) {}
}

async function fetchBs(ctx, cfg, code, query) {
  var base = String(cfg.apiBase || SPECS.apiBase).replace(/\/$/, '');
  var q = 'code=' + code + (query ? '&' + query : '');
  var res = await ctx.fetch(base + '/api/common/bs?' + q, { headers: apiHeaders(cfg) });
  if (!res.ok) return '';
  var map = parseBsMap(await resBytes(res));
  return map[code] || '';
}

async function sfverFetch(ctx, cfg, path, params, code, extraQuery) {
  var base = String(cfg.apiBase || SPECS.apiBase).replace(/\/$/, '');
  var qParts = [];
  Object.keys(params || {}).forEach(function (k) {
    var v = params[k];
    qParts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v === true ? 'true' : v === false ? 'false' : String(v)));
  });
  if (extraQuery) qParts.push(extraQuery);
  var qs = qParts.join('&');
  var sig = await fetchBs(ctx, cfg, code, qs);
  if (!sig) return null;
  var js = orderedParamsJson(params);
  var ver = 'sfver' + md5Hex6(ctx, js) + sig;
  var url = base + '/' + ver + path + (qs ? '?' + qs : '');
  var res = await ctx.fetch(url, { headers: apiHeaders(cfg) });
  if (!res.ok) return null;
  return await resBytes(res);
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'fctv33');
  await handshake(ctx, cfg);

  var sportTypes = Array.isArray(cfg.sportTypes) ? cfg.sportTypes : SPECS.sportTypes;
  var language = Number(cfg.language != null ? cfg.language : SPECS.language);
  var byId = {};

  for (var si = 0; si < sportTypes.length; si++) {
    var sportType = Number(sportTypes[si]);
    if (!sportType) continue;
    try {
      var params = { sportType: sportType, language: language, stream: true };
      var body = await sfverFetch(
        ctx,
        cfg,
        '/api/match/live',
        params,
        100,
        '',
      );
      if (!body || !body.length) continue;
      var list = parseLiveMatches(body);
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        // 10000+ = finished; keep upcoming (0) + live (101) and unknown
        if (m.status >= 10000) continue;
        if (byId[m.matchId]) continue;
        byId[m.matchId] = m;
      }
    } catch (_) {}
  }

  var rows = [];
  Object.keys(byId).forEach(function (k) {
    var m = byId[k];
    var kind = SPORT_KIND[m.sportType] || 'other';
    var row = {
      id: 'fctv_' + m.matchId,
      title: m.title,
      category: kind,
      date: m.dateMs || 0,
      airing: m.status === 101,
      popular: m.status === 101,
      sources: [{ source: 'fctv33', id: m.sportType + ':' + m.matchId }],
      catalog: 'forja_live',
      pluginId: pluginId,
      sportType: m.sportType,
    };
    if (m.home && m.home.name) row.homeTeam = m.home.name;
    if (m.away && m.away.name) row.awayTeam = m.away.name;
    if (m.home && m.home.logo) row.homeBadge = m.home.logo;
    if (m.away && m.away.logo) row.awayBadge = m.away.logo;
    if (m.home && m.home.logo) row.poster = m.home.logo;
    else if (m.away && m.away.logo) row.poster = m.away.logo;
    if (m.league) row.league = m.league;
    rows.push(row);
  });

  return rows.map(function (r) {
    return liveCatalogStamp(r, pluginId);
  });
}

// Resolve half
var __resolveExtract = (function () {
  async function fetchStreamDetail(ctx, cfg, matchId, sportType, stream) {
    var base = String(cfg.apiBase || SPECS.apiBase).replace(/\/$/, '');
    var params = {
      streamId: stream.streamId,
      matchId: matchId,
      sportType: sportType,
      language: Number(cfg.language != null ? cfg.language : SPECS.language),
      continent: String(cfg.continent || SPECS.continent),
      country: String(cfg.country || SPECS.country),
      digit: String(cfg.digit || SPECS.digit),
      siteType: Number(stream.siteType || cfg.siteType || SPECS.siteType),
      usls: String(cfg.usls || SPECS.usls),
    };
    var q = Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
      })
      .join('&');
    // stream/detail is NOT in the sfver V-map — unsigned path.
    var res = await ctx.fetch(base + '/api/stream/detail?' + q, { headers: apiHeaders(cfg) });
    if (!res.ok) return null;
    var rb = headerGet(res, 'rb-session');
    if (!rb) return null;
    var body = await resBytes(res);
    var enc = extractEncryptedUrl(body);
    if (!enc) return null;
    var dec = decodeStreamUrl(enc);
    if (!/^https?:\/\//i.test(dec)) return null;
    var token = enCbcToken(ctx, rb);
    var mil = signMil(dec, token);
    var player = String(cfg.playerOrigin || SPECS.playerOrigin).replace(/\/$/, '');
    return {
      url: mil,
      name: stream.name || ('CH ' + stream.streamId),
      source: 'fctv33',
      id: String(matchId),
      headers: {
        Referer: player + '/',
        Origin: player,
        'User-Agent': ua(),
      },
      directPlayback: typeof preferDirectPlayback === 'function' ? preferDirectPlayback(mil) : true,
    };
  }

  function extractEncryptedUrl(buf) {
    // longest printable run that ROT47-decodes to http…m3u8
    var best = '';
    var cur = '';
    for (var i = 0; i < buf.length; i++) {
      var c = buf[i];
      if (c >= 32 && c <= 126) {
        cur += String.fromCharCode(c);
      } else {
        if (cur.length > best.length) {
          var d = decodeStreamUrl(cur);
          if (/^https?:\/\//i.test(d) && d.indexOf('.m3u8') >= 0) best = cur;
        }
        cur = '';
      }
    }
    if (cur.length > best.length) {
      var d2 = decodeStreamUrl(cur);
      if (/^https?:\/\//i.test(d2) && d2.indexOf('.m3u8') >= 0) best = cur;
    }
    return best;
  }

  async function listChannels(ctx, cfg, matchId, sportType) {
    var language = Number(cfg.language != null ? cfg.language : SPECS.language);
    var params = {
      matchId: Number(matchId),
      sportType: Number(sportType) || 1,
      language: language,
      stream: true,
    };
    var body = await sfverFetch(ctx, cfg, '/api/match/detail', params, 102, '');
    if (!body) return [];
    var streams = parseDetailStreams(body);
    streams.sort(function (a, b) {
      return (a.priority || 0) - (b.priority || 0);
    });
    return streams.filter(function (s) {
      return !s.streamStatus || s.streamStatus === 1;
    });
  }

  async function resolveByMatch(ctx, cfg, matchId, sportType) {
    await handshake(ctx, cfg);
    var channels = await listChannels(ctx, cfg, matchId, sportType);
    if (!channels.length) return [];
    var out = [];
    for (var i = 0; i < channels.length; i++) {
      try {
        var row = await fetchStreamDetail(ctx, cfg, matchId, sportType || channels[i].sportType, channels[i]);
        if (row && row.url) out.push(row);
      } catch (_) {}
    }
    return out;
  }

  async function resolveByFixture(ctx, cfg) {
    // Reuse catalog scrape then fixture match.
    var catCtx = Object.assign({}, ctx, { action: 'catalog' });
    var rows = await catalogExtract(catCtx);
    var list = rows.map(function (r) {
      var src = r.sources && r.sources[0] && r.sources[0].id;
      var ref = parseMatchRef(src) || parseMatchRef(r.id);
      return {
        id: r.id,
        matchId: ref ? ref.matchId : String(r.id || '').replace(/^fctv_/, ''),
        title: r.title,
        homeTeam: r.homeTeam,
        awayTeam: r.awayTeam,
        dateMs: Number(r.date || r.startsAt || 0) || 0,
        category: r.category,
        sportType: (ref && ref.sportType) || r.sportType || 1,
      };
    });
    var hit = typeof liveFindFixtureInList === 'function' ? liveFindFixtureInList(list, ctx) : null;
    if (!hit) return [];
    return resolveByMatch(
      ctx,
      cfg,
      hit.matchId || String(hit.id || '').replace(/^fctv_/, ''),
      hit.sportType || 1,
    );
  }

  function parseMatchRef(raw) {
    var s = String(raw || '')
      .replace(/^fctv_/, '')
      .trim();
    var m = s.match(/^(\d+):(\d+)$/);
    if (m) return { sportType: Number(m[1]), matchId: m[2] };
    if (/^\d+$/.test(s)) return { sportType: 1, matchId: s };
    return null;
  }

  async function resolveExtract(ctx) {
    var action = String(ctx.action || 'resolve');
    if (action !== 'resolve') return [];
    var cfg = Object.assign({}, SPECS, ctx.config || {});
    var ref =
      parseMatchRef(ctx.matchId) ||
      parseMatchRef(ctx.id) ||
      parseMatchRef(ctx.stream && ctx.stream.id);
    var sportType =
      (ref && ref.sportType) ||
      Number(ctx.sportType || (ctx.config && ctx.config.sportType) || 0) ||
      1;
    var sid = ref ? ref.matchId : '';
    if (!sid || ctx.fixtureSearch === true) {
      return resolveByFixture(ctx, cfg);
    }
    var unlocked = await resolveByMatch(ctx, cfg, sid, sportType);
    if (unlocked.length) return unlocked;
    return resolveByFixture(ctx, cfg);
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
