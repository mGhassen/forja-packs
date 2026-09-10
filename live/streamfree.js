var SPECS = {
  origin: 'https://streamfree.top',
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
 * Site `/api/v1/sources/{key}` returns embed URLs whose last path segment is
 * `{stream_key}{quality}{sourceSuffix?}` (suffix 2–5 = backup Direct sources).
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
    };
  } catch (_) {
    return null;
  }
}

async function fetchEmbedTokens(ctx, embedUrl, referer) {
  var html = await (
    await ctx.fetch(embedUrl, {
      headers: {
        'User-Agent': ua(),
        Referer: referer || embedUrl,
      },
    })
  ).text();
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
      // Match website: cdn → /live-cdn/, else /live-origin/.
      if (key && key.server_name && key.server_name !== 'origin') {
        return { prefix: '/live-cdn/' };
      }
    }
  } catch (_) {}
  return { prefix: '/live-origin/' };
}

function embedHostOrigin(embedUrl, fallbackOrigin) {
  try {
    return new URL(embedUrl).origin;
  } catch (_) {
    return fallbackOrigin;
  }
}

async function resolveStreamfreeTop(ctx, cfg) {
  var origin = cfg.origin.replace(/\/$/, '');
  var cat = String(ctx.category || (ctx.config && ctx.config.category) || 'soccer');
  var sid = String(ctx.matchId || '').replace(/^sf_/, '');
  if (!sid) return [];

  var playerReferer = origin + '/player/' + cat + '/' + sid;
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
  var tokenCache = {};
  var serverCache = {};

  for (var i = 0; i < rawSources.length; i++) {
    var parsed = parseSourceEmbed(rawSources[i], sid);
    if (!parsed) continue;

    var quality = parsed.quality;
    var suffix = parsed.suffix;
    // Site iframe uses same-origin /embed/{variant}; API may return strmfree.st.
    var embedUrl = origin + '/embed/' + parsed.variant;

    if (!tokenCache[parsed.variant]) {
      tokenCache[parsed.variant] = await fetchEmbedTokens(ctx, embedUrl, playerReferer);
      // Fallback to absolute API host if same-origin embed is blocked.
      if (!tokenCache[parsed.variant] && parsed.url.indexOf('http') === 0) {
        tokenCache[parsed.variant] = await fetchEmbedTokens(ctx, parsed.url, playerReferer);
        if (tokenCache[parsed.variant]) embedUrl = parsed.url;
      }
    }
    var tokens = tokenCache[parsed.variant];
    if (!tokens) continue;

    var m3uInfo = tokens[quality];
    if (!m3uInfo || typeof m3uInfo !== 'object') continue;

    var hostOrigin = embedHostOrigin(embedUrl, origin);
    var cacheKey = hostOrigin + '|' + suffix;
    if (!serverCache[cacheKey]) {
      serverCache[cacheKey] = await resolveServerPath(ctx, hostOrigin, sid, embedUrl);
    }
    var server = serverCache[cacheKey];
    var url;
    if (server.external) {
      url = server.external;
    } else {
      url =
        hostOrigin +
        (server.prefix || '/live-origin/') +
        sid +
        quality +
        suffix +
        '/index.m3u8?' +
        tokenQuery(m3uInfo);
    }
    if (seen[url]) continue;
    seen[url] = 1;

    var label = 'StreamFree ' + quality;
    if (suffix) label += ' · src ' + suffix;

    out.push({
      url: url,
      name: label,
      headers: { Referer: embedUrl, Origin: hostOrigin, 'User-Agent': ua() },
      directPlayback: preferDirectPlayback(url),
      viewers: viewers,
    });
  }

  return out;
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
  return resolveStreamfreeTop(next, cfg);
}

async function resolveStream(ctx, cfg) {
  var embed = String(ctx.embedUrl || ctx.url || ctx.iframe || '').trim();
  if (embed && (embed.indexOf('embed.st') >= 0 || parseEmbedUrl(embed, cfg))) {
    try {
      var goat = await resolveGoatEmbed(ctx, embed, cfg);
      if (goat && goat.length) {
        var viewers = Number(ctx.viewers || 0);
        return goat.map(function (row) {
          row.viewers = viewers;
          return row;
        });
      }
    } catch (_) {}
  }
  var sid = String(ctx.matchId || '').replace(/^sf_/, '');
  if (!sid || ctx.fixtureSearch === true) {
    return resolveStreamfreeByFixture(ctx, cfg);
  }
  return resolveStreamfreeTop(ctx, cfg);
}

async function extract(ctx) {
  var action = String(ctx.action || 'resolve');
  if (action !== 'resolve') return [];
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  return resolveStream(ctx, cfg);
}
