// Unified live_sport plugin — catalog + resolve (streamfree)
// Catalog half (top-level)
var SPECS = {
  "origin": "https://streamfree.top"
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function absUrl(origin, path) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return origin + p;
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'streamfree');
  var origin = cfg.origin.replace(/\/$/, '');
  var res = await ctx.fetch(origin + '/streams', { headers: { 'User-Agent': ua() } });
  if (!res.ok) return [];
  var data = await res.json();
  var rows = [];
  Object.keys(data.streams || {}).forEach(function (category) {
    (data.streams[category] || []).forEach(function (s) {
      var id = s.stream_key || s.id;
      if (!id) return;
      var team1 = s.team1 || {};
      var team2 = s.team2 || {};
      var homeBadge = String(team1.logo || '');
      var awayBadge = String(team2.logo || '');
      // Relative `/thumbnails/...` — without origin, Dart prefixes Streamed CDN.
      var poster = absUrl(origin, s.thumbnail_url) || homeBadge || awayBadge;
      var viewers = Number(s.viewers || 0);
      var row = {
        id: 'sf_' + id,
        title: String(s.name || ''),
        category: String(category).toLowerCase(),
        date: s.match_timestamp ? Number(s.match_timestamp) * 1000 : 0,
        poster: poster,
        popular: viewers > 50,
        airing: viewers > 0,
        viewers: viewers,
        sources: [{ source: 'streamfree', id: String(id) }],
        catalog: 'forja_live',
        pluginId: pluginId,
      };
      if (team1.name) row.homeTeam = String(team1.name);
      if (team2.name) row.awayTeam = String(team2.name);
      if (homeBadge) row.homeBadge = homeBadge;
      if (awayBadge) row.awayBadge = awayBadge;
      rows.push(row);
    });
  });
  return rows.map(function (r) { return liveCatalogStamp(r, pluginId); });
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var SPECS = {
  origin: 'https://streamfree.top',
  // Embed pages + signed /live playlists moved off the schedule origin.
  streamOrigin: 'https://strmfree.st',
  embedOrigin: 'https://embed.st',
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
}

function tokenQuery(info) {
  // Web player order: _t &_e &_n (signed playlist auth).
  return (
    '_t=' +
    encodeURIComponent(String(info._t)) +
    '&_e=' +
    encodeURIComponent(String(info._e)) +
    '&_n=' +
    encodeURIComponent(String(info._n))
  );
}

/**
 * Site `/api/v1/sources/{key}` returns absolute embeds, typically
 * `https://strmfree.st/embed/{category}/{stream_key}{quality}{sourceSuffix?}`.
 * Suffix 2–5 = backup Direct sources.
 */
function parseSourceEmbed(url, sid) {
  try {
    var folder = String(url || '')
      .split('?')[0]
      .split('/')
      .pop();
    if (!folder || folder.indexOf(sid) !== 0) return null;
    var rest = folder.slice(sid.length);
    var m = rest.match(/^(540p|720p|1080p|2160p)([2-5]?)$/);
    if (!m) return null;
    return {
      quality: m[1],
      source: m[2] || '1',
      suffix: m[2] || '',
      variant: folder,
      url: String(url),
      category: embedPathCategory(url),
    };
  } catch (_) {
    return null;
  }
}

/** `/embed/{category}/{variant}` → category; else ''. */
function embedPathCategory(url) {
  try {
    var parts = new URL(String(url || '')).pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' && parts.length >= 3) return String(parts[1] || '');
  } catch (_) {}
  return '';
}

function playerRefererFor(origin, category, sid) {
  var cat = String(category || 'soccer').trim() || 'soccer';
  return origin.replace(/\/$/, '') + '/player/' + cat + '/' + sid;
}

async function fetchEmbedTokens(ctx, embedUrl, referer) {
  var res = await ctx.fetch(embedUrl, {
    headers: {
      'User-Agent': ua(),
      Referer: referer || embedUrl,
    },
  });
  if (!res.ok) return null;
  var html = await res.text();
  var tok = html.match(/_0x\s*=\s*(.*?);/s);
  if (!tok) return null;
  try {
    return JSON.parse(tok[1]);
  } catch (_) {
    return null;
  }
}

async function resolveServerPath(ctx, hostOrigin, sid, embedUrl) {
  try {
    var keyRes = await ctx.fetch(hostOrigin + '/get-stream-key/' + sid, {
      headers: {
        'User-Agent': ua(),
        Referer: embedUrl,
        Origin: hostOrigin,
      },
    });
    if (keyRes.ok) {
      var key = await keyRes.json();
      if (key && key.is_external && key.external_url) {
        return { external: String(key.external_url) };
      }
      // Match website: non-origin → /live-cdn/, else /live/{variant}/.
      if (key && key.server_name && key.server_name !== 'origin') {
        return { prefix: '/live-cdn/' };
      }
    }
  } catch (_) {}
  return { prefix: '/live/' };
}

function embedHostOrigin(embedUrl, fallbackOrigin) {
  try {
    return new URL(embedUrl).origin;
  } catch (_) {
    return fallbackOrigin;
  }
}

function deriveStreamKey(embedUrl) {
  try {
    var folder = String(embedUrl || '')
      .split('?')[0]
      .split('/')
      .pop();
    var m = String(folder || '').match(/^(.+?)(540p|720p|1080p|2160p)/);
    return m ? m[1] : '';
  } catch (_) {
    return '';
  }
}

async function listStreamfreeTop(ctx, cfg) {
  var origin = cfg.origin.replace(/\/$/, '');
  var cat = String(ctx.category || (ctx.config && ctx.config.category) || 'soccer');
  var sid = String(ctx.matchId || '').replace(/^sf_/, '');
  if (!sid) return [];

  var playerReferer = playerRefererFor(origin, cat, sid);
  var sourcesRes = await ctx.fetch(origin + '/api/v1/sources/' + sid, {
    headers: {
      'User-Agent': ua(),
      Referer: playerReferer,
      Accept: 'application/json',
    },
  });
  if (!sourcesRes.ok) return [];
  var payload = await sourcesRes.json();
  var rawSources = Array.isArray(payload && payload.sources) ? payload.sources : [];
  if (!rawSources.length) return [];

  var viewers = Number(ctx.viewers || 0);
  var out = [];
  var seen = {};

  for (var i = 0; i < rawSources.length; i++) {
    var rawUrl = String(rawSources[i] || '').trim();
    var parsed = parseSourceEmbed(rawUrl, sid);
    if (!parsed) continue;
    // Keep absolute strmfree.st embeds — schedule-origin /embed/{variant} 404s.
    var embedUrl =
      /^https?:\/\//i.test(parsed.url) ? parsed.url : origin + '/embed/' + parsed.variant;
    if (seen[embedUrl]) continue;
    seen[embedUrl] = 1;
    var label = 'StreamFree ' + parsed.quality;
    if (parsed.suffix) label += ' · src ' + parsed.suffix;
    var rowCat = parsed.category || cat;
    out.push({
      url: embedUrl,
      name: label,
      source: 'streamfree',
      id: sid,
      quality: parsed.quality,
      headers: {
        Referer: playerRefererFor(origin, rowCat, sid),
        'User-Agent': ua(),
      },
      directPlayback: false,
      viewers: viewers,
    });
  }
  return out;
}

/**
 * Prefer the live embed host URL. Old Providers rows used
 * streamfree.top/embed/{variant} which now 404s.
 */
async function canonicalStreamfreeEmbed(ctx, cfg, embedUrl, sid, parsed) {
  var raw = String(embedUrl || '').trim();
  if (!raw) return '';
  if (/strmfree\.st/i.test(raw) && /\/embed\//i.test(raw)) return raw;

  var listed = await listStreamfreeTop(
    Object.assign({}, ctx, { matchId: sid, fixtureSearch: false }),
    cfg,
  );
  if (parsed && parsed.variant) {
    for (var i = 0; i < listed.length; i++) {
      if (String(listed[i].url || '').indexOf(parsed.variant) >= 0) {
        return String(listed[i].url);
      }
    }
  }
  if (listed.length) return String(listed[0].url || '');
  return raw;
}

async function unlockStreamfreeEmbed(ctx, cfg, embedUrl) {
  var origin = cfg.origin.replace(/\/$/, '');
  var streamOrigin = String(cfg.streamOrigin || 'https://strmfree.st').replace(/\/$/, '');
  var cat = String(ctx.category || (ctx.config && ctx.config.category) || 'soccer');
  var sid = String(ctx.matchId || '').replace(/^sf_/, '');
  var raw = String(embedUrl || '').trim();
  if (!raw) return [];

  // Goat/embed.st unlock-on-play.
  if (raw.indexOf('embed.st') >= 0 || parseEmbedUrl(raw, cfg)) {
    try {
      var goat = await resolveGoatEmbed(ctx, raw, cfg);
      if (goat && goat.length) {
        var viewers = Number(ctx.viewers || 0);
        return goat.map(function (row) {
          row.viewers = viewers;
          return row;
        });
      }
    } catch (_) {}
    return [];
  }

  if (!sid) sid = deriveStreamKey(raw);
  if (!sid) return [];

  var parsed = parseSourceEmbed(raw, sid);
  if (!parsed) {
    try {
      var variant = raw.split('?')[0].split('/').pop();
      parsed = parseSourceEmbed(streamOrigin + '/embed/' + cat + '/' + variant, sid);
      if (!parsed) parsed = parseSourceEmbed(origin + '/embed/' + variant, sid);
    } catch (_) {}
  }
  if (!parsed) return [];

  var embed = await canonicalStreamfreeEmbed(ctx, cfg, raw, sid, parsed);
  if (!embed) return [];
  // Re-parse after canonicalization (category path may differ).
  var canonParsed = parseSourceEmbed(embed, sid) || parsed;
  var rowCat = canonParsed.category || embedPathCategory(embed) || cat;
  var playerReferer = playerRefererFor(origin, rowCat, sid);

  var tokens = await fetchEmbedTokens(ctx, embed, playerReferer);
  if (!tokens) return [];
  var m3uInfo = tokens[canonParsed.quality];
  if (!m3uInfo || typeof m3uInfo !== 'object') return [];

  var hostOrigin = embedHostOrigin(embed, streamOrigin);
  var server = await resolveServerPath(ctx, hostOrigin, sid, embed);
  var url;
  if (server.external) {
    url = server.external;
  } else {
    url =
      hostOrigin +
      (server.prefix || '/live/') +
      sid +
      canonParsed.quality +
      canonParsed.suffix +
      '/index.m3u8?' +
      tokenQuery(m3uInfo);
  }
  var label = 'StreamFree ' + canonParsed.quality;
  if (canonParsed.suffix) label += ' · src ' + canonParsed.suffix;
  return [
    {
      url: url,
      name: label,
      headers: { Referer: embed, Origin: hostOrigin, 'User-Agent': ua() },
      directPlayback: preferDirectPlayback(url),
      viewers: Number(ctx.viewers || 0),
    },
  ];
}

async function resolveStreamfreeByFixture(ctx, cfg) {
  var origin = cfg.origin.replace(/\/$/, '');
  var res = await ctx.fetch(origin + '/streams', { headers: { 'User-Agent': ua() } });
  if (!res.ok) return [];
  var data = await res.json();
  var list = [];
  Object.keys(data.streams || {}).forEach(function (category) {
    (data.streams[category] || []).forEach(function (s) {
      var id = s.stream_key || s.id;
      if (!id) return;
      list.push({
        id: 'sf_' + id,
        matchId: String(id),
        title: String(
          s.name ||
            s.title ||
            ((s.team1 && s.team1.name) || '') + ' vs ' + ((s.team2 && s.team2.name) || ''),
        ),
        homeTeam: String((s.team1 && s.team1.name) || ''),
        awayTeam: String((s.team2 && s.team2.name) || ''),
        dateMs: Number(s.match_timestamp ? s.match_timestamp * 1000 : s.start_time || s.date || 0) || 0,
        category: String(category || 'soccer'),
      });
    });
  });
  var hit = liveFindFixtureInList(list, ctx);
  if (!hit) return [];
  var next = Object.assign({}, ctx, {
    matchId: String(hit.matchId || hit.id || '').replace(/^sf_/, ''),
    category: hit.category || ctx.category,
    fixtureSearch: false,
  });
  return listStreamfreeTop(next, cfg);
}

async function resolveStream(ctx, cfg) {
  var embed = String(ctx.embedUrl || ctx.url || ctx.iframe || '').trim();
  if (embed) {
    var unlocked = await unlockStreamfreeEmbed(ctx, cfg, embed);
    if (unlocked.length) return unlocked;
  }
  var sid = String(ctx.matchId || '').replace(/^sf_/, '');
  if (!sid || ctx.fixtureSearch === true) {
    return resolveStreamfreeByFixture(ctx, cfg);
  }
  var listed = await listStreamfreeTop(ctx, cfg);
  if (listed.length) return listed;
  // Wrong/stale matchId (e.g. another catalog's id) — fall back to fixture search.
  return resolveStreamfreeByFixture(ctx, cfg);
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
