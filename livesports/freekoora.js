// Unified live_sport plugin — catalog + resolve (freekoora.online → shotkoora channels)
// Catalog half (top-level)
var SPECS = {
  origin: 'https://freekoora.online',
  // Match cards link here; data-servers iframes unlock to native HLS.
  playerOrigin: 'https://x1.shotkoora.live',
  // Schedule times are Cairo (UTC+2, no DST).
  tzOffsetMin: 120,
  schedulePaths: ['/matches-today/', '/matches-tomorrow/'],
};

function ua() {
  return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
}

function fkHtmlText(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function fkUnescape(s) {
  return String(s || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function fkDecodeHexEscapes(s) {
  return String(s || '').replace(/\\x([0-9a-fA-F]{2})/g, function (_, h) {
    return String.fromCharCode(parseInt(h, 16));
  });
}

function fkChannelSlug(href) {
  var raw = String(href || '').trim();
  if (!raw) return '';
  try {
    var path = new URL(raw).pathname.replace(/\/+$/, '');
    var parts = path.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  } catch (_) {
    var m = raw.match(/\/([a-zA-Z0-9_-]+)\/?(?:\?|$)/);
    return m ? m[1] : '';
  }
}

function fkParseDateMs(dateStr, timeStr, tzOffsetMin) {
  var d = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var t = String(timeStr || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return 0;
  var tz = Number(tzOffsetMin || 0);
  var absUtc = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
  );
  return absUtc - tz * 60000;
}

function fkSlugPart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]+/g, '')
    .slice(0, 40);
}

/** Homepage / day pages → fixture objects (channel slug is the resolve handoff). */
function fkParseMatches(html, cfg) {
  var out = [];
  var seen = {};
  var re = /<div class="AY_Match\s+([^"]*)">([\s\S]*?)<\/a>\s*<\/div>/g;
  var m;
  while ((m = re.exec(String(html || '')))) {
    var cls = String(m[1] || '');
    var body = m[2] || '';
    var link = body.match(/<a\s+href="([^"]+)"[^>]*title="([^"]*)"/i);
    if (!link) continue;
    var href = String(link[1] || '').trim();
    var titleAttr = fkHtmlText(link[2]);
    var channel = fkChannelSlug(href);
    if (!channel) continue;

    var teams = [];
    var nameRe = /<div class="TM_Name">([\s\S]*?)<\/div>/g;
    var nm;
    while ((nm = nameRe.exec(body))) {
      var name = fkHtmlText(nm[1]);
      if (name) teams.push(name);
    }
    var home = teams[0] || '';
    var away = teams[1] || '';
    var time = '';
    var tm = body.match(/<span class=['"]MT_Time['"]>([^<]+)<\/span>/i);
    if (tm) time = fkHtmlText(tm[1]);
    var dateStr = '';
    var dm = titleAttr.match(/بتاريخ\s+(\d{4}-\d{2}-\d{2})/);
    if (dm) dateStr = dm[1];
    var tour = '';
    var tr = body.match(/<div class="TourName">([\s\S]*?)<\/div>/i);
    if (tr) tour = fkHtmlText(tr[1]);

    var badges = [];
    var imgRe = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*alt="([^"]*)"/gi;
    var im;
    while ((im = imgRe.exec(body))) {
      var src = String(im[1] || '');
      if (!src || src.indexOf('data:') === 0) continue;
      badges.push(src);
    }

    var dateMs = fkParseDateMs(dateStr, time, cfg.tzOffsetMin);
    var airing = /\blive\b|\bgools\b/i.test(cls);
    var finished = /\bfinished\b/i.test(cls);
    var key =
      (dateStr || 'd') +
      '_' +
      channel +
      '_' +
      fkSlugPart(home) +
      '_' +
      fkSlugPart(away);
    if (seen[key]) continue;
    seen[key] = 1;

    var title =
      home && away
        ? home + ' vs ' + away
        : titleAttr || channel;
    out.push({
      key: key,
      channel: channel,
      href: href,
      title: title,
      homeTeam: home,
      awayTeam: away,
      dateMs: dateMs,
      airing: airing,
      finished: finished,
      tour: tour,
      homeBadge: badges[0] || '',
      awayBadge: badges[1] || '',
    });
  }
  return out;
}

async function fkFetchSchedule(ctx, cfg) {
  var origin = String(cfg.origin || SPECS.origin).replace(/\/$/, '');
  var paths = Array.isArray(cfg.schedulePaths) ? cfg.schedulePaths : SPECS.schedulePaths;
  var all = [];
  var seen = {};
  for (var i = 0; i < paths.length; i++) {
    var path = String(paths[i] || '').trim();
    if (!path) continue;
    if (path.charAt(0) !== '/') path = '/' + path;
    try {
      var res = await ctx.fetch(origin + path, {
        headers: { 'User-Agent': ua(), Referer: origin + '/' },
      });
      if (!res.ok) continue;
      var events = fkParseMatches(await res.text(), cfg);
      for (var j = 0; j < events.length; j++) {
        var ev = events[j];
        if (seen[ev.key]) continue;
        seen[ev.key] = 1;
        all.push(ev);
      }
    } catch (_) {}
  }
  return { origin: origin, events: all };
}

function fkCatalogRow(ev, pluginId) {
  var row = {
    id: 'fk_' + ev.key,
    title: ev.title,
    category: 'football',
    date: ev.dateMs || 0,
    airing: !!ev.airing,
    sources: [{ source: 'freekoora', id: ev.channel }],
    catalog: 'forja_live',
    pluginId: pluginId,
  };
  if (ev.homeTeam) row.homeTeam = ev.homeTeam;
  if (ev.awayTeam) row.awayTeam = ev.awayTeam;
  if (ev.homeBadge) row.homeBadge = ev.homeBadge;
  if (ev.awayBadge) row.awayBadge = ev.awayBadge;
  if (ev.homeBadge) row.poster = ev.homeBadge;
  if (ev.tour) row.league = ev.tour;
  if (ev.finished) row.ended = true;
  return liveCatalogStamp(row, pluginId);
}

async function catalogExtract(ctx) {
  var action = String(ctx.action || 'catalog');
  if (action !== 'catalog') return [];

  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var pluginId = String(cfg.pluginId || cfg.providerId || 'freekoora');
  var home = await fkFetchSchedule(ctx, cfg);
  return home.events.map(function (ev) {
    return fkCatalogRow(ev, pluginId);
  });
}

// Resolve half (closed scope — no name collisions with catalog)
var __resolveExtract = (function () {
var NAME = 'Free Koora';
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
    var text = String((await res.text()) || '').replace(/^\s+/, '');
    if (text.indexOf('#EXTM3U') !== 0) return false;
    return /^[^#\s]/m.test(text);
  } catch (_) {
    return false;
  }
}

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

function expandPlayerHtml(html) {
  var text = String(html || '');
  var out = text;
  var re = /document\.write\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*\)/g;
  var m;
  while ((m = re.exec(text))) {
    out += '\n' + fkDecodeHexEscapes(m[2]);
  }
  return out;
}

function findM3u8Candidates(html, baseUrl) {
  var text = expandPlayerHtml(html);
  var out = [];
  var seen = {};
  var re = /https?:\/\/[^\s"'<>]+/gi;
  var m;
  while ((m = re.exec(text))) {
    var u = String(m[0] || '').replace(/[),;]+$/, '');
    if (!/\.m3u8(\?|$)/i.test(u) && !/\/proxy\.php\?stream=/i.test(u)) continue;
    var abs = absUrl(u, baseUrl) || u;
    if (seen[abs]) continue;
    seen[abs] = 1;
    out.push(abs);
  }
  return out;
}

function isSkippableIframe(url) {
  var u = String(url || '');
  if (!u) return true;
  if (/\/embed\/?\s*$/i.test(u.split('?')[0])) return true;
  if (/\/ad\d*\.html|instreams\.click\/ad|acscdn|llvpn|tawk\.to/i.test(u)) return true;
  return false;
}

function isAssetUrl(url) {
  return /\.(?:css|js|mjs|png|jpe?g|gif|webp|svg|woff2?)(?:\?|$)/i.test(
    String(url || ''),
  );
}

function nextPlayerIframe(html, baseUrl) {
  var text = expandPlayerHtml(html);
  var re = /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi;
  var m;
  while ((m = re.exec(text))) {
    var u = absUrl(m[1], baseUrl);
    if (!u || isSkippableIframe(u) || isAssetUrl(u)) continue;
    // Skip self-referential / same-page stubs.
    if (u.indexOf('+q+u+q+') >= 0) continue;
    return u;
  }
  // Nested Alba player pages only (`/albaplayer/{slug}/`), not plugin assets.
  var alba = text.match(
    /https?:\/\/[^"'<\s]+\/albaplayer\/[a-zA-Z0-9_-]+\/?(?:\?[^"'<\s]*)?/i,
  );
  if (alba) {
    var a = absUrl(alba[0], baseUrl);
    if (a && !isSkippableIframe(a) && !isAssetUrl(a)) return a;
  }
  return '';
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

async function unlockDirectM3u8(ctx, html, pageUrl) {
  var candidates = findM3u8Candidates(html, pageUrl);
  if (!candidates.length) return null;
  var headers = playHeaders(pageUrl);
  for (var i = 0; i < candidates.length; i++) {
    var u = candidates[i];
    var h = headers;
    // syria-player proxy wants its own origin as referer.
    if (/syria-player\.info/i.test(u)) {
      h = playHeaders(u);
    }
    if (await liveM3u8(ctx, u, h)) {
      return { url: u, headers: h };
    }
  }
  return null;
}

async function sniffUnlocked(ctx, embedUrl, referer) {
  if (!ctx.live || typeof ctx.live.sniffEmbed !== 'function') return null;
  var raw = String(embedUrl || '').trim();
  if (!raw) return null;
  try {
    var m3u8 = await ctx.live.sniffEmbed(raw, String(referer || raw));
    if (!m3u8 || !/^https?:\/\//i.test(String(m3u8))) return null;
    return { url: String(m3u8), headers: playHeaders(raw) };
  } catch (_) {
    return null;
  }
}

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
      var res = await ctx.fetch(url, {
        headers: { 'User-Agent': ua(), Referer: ref || url },
      });
      if (!res.ok) break;
      html = await res.text();
    } catch (_) {
      break;
    }

    var direct = await unlockDirectM3u8(ctx, html, url);
    if (direct) return direct;

    var cfgM = String(html || '').match(/_econfig\s*=\s*'([A-Za-z0-9+/=]+)'/);
    if (cfgM) {
      var conf = decodeEconfig(cfgM[1]);
      if (conf) {
        var m3u8 = String(conf.stream_url_nop2p || conf.stream_url || '').trim();
        if (/^https?:\/\//i.test(m3u8)) {
          var headers = playHeaders(url);
          if (await liveM3u8(ctx, m3u8, headers)) {
            return { url: m3u8, headers: headers };
          }
        }
      }
    }

    var fromJw = await unlockStreamUrls(ctx, html, url);
    if (fromJw) return fromJw;

    var next = nextPlayerIframe(html, url);
    if (!next || next === url) break;
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
  var sniffed = await sniffUnlocked(ctx, lastUrl, ref || referer);
  if (sniffed) return sniffed;
  if (lastUrl !== embedUrl) {
    sniffed = await sniffUnlocked(ctx, embedUrl, referer);
    if (sniffed) return sniffed;
  }
  return null;
}

function parseDataServers(html) {
  var m = String(html || '').match(/data-servers="([^"]+)"/i);
  if (!m) return [];
  try {
    var raw = JSON.parse(fkUnescape(m[1]));
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (s, i) {
        var url = String((s && s.url) || '').trim();
        if (!url) return null;
        return {
          url: url,
          label: String((s && s.name) || '').trim() || 'Server ' + (i + 1),
        };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function channelLabel(html, slug) {
  var m = String(html || '').match(
    /ys-player-widget__name">\s*<strong[^>]*>([\s\S]*?)<\/strong>/i,
  );
  if (m) {
    var name = fkHtmlText(m[1]);
    if (name) return name;
  }
  return String(slug || 'channel');
}

function streamRow(ctx, unlocked, label) {
  return {
    url: unlocked.url,
    name: NAME + ' · ' + label,
    source: 'freekoora',
    headers: unlocked.headers,
    directPlayback: preferDirectPlayback(unlocked.url),
    viewers: Number(ctx.viewers || 0),
  };
}

function playerPageUrl(cfg, channel) {
  var origin = String(cfg.playerOrigin || SPECS.playerOrigin).replace(/\/$/, '');
  var slug = String(channel || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!slug) return '';
  return origin + '/' + slug + '/';
}

function channelFromMatchId(raw) {
  var id = String(raw || '').trim();
  if (!id) return '';
  // Catalog id: fk_<date>_<channel>_<home>_<away>
  if (id.indexOf('fk_') === 0) {
    var parts = id.slice(3).split('_');
    if (parts.length >= 2) return parts[1];
  }
  // Opaque source id is the channel slug (b2, o1, bx1, …).
  if (/^[a-zA-Z0-9_-]+$/.test(id)) return id;
  return fkChannelSlug(id);
}

async function findEvent(ctx, cfg) {
  var home = await fkFetchSchedule(ctx, cfg);
  if (!home.events.length) return null;
  var list = home.events.map(function (ev) {
    return {
      id: 'fk_' + ev.key,
      matchId: ev.channel,
      title: ev.title,
      homeTeam: ev.homeTeam || '',
      awayTeam: ev.awayTeam || '',
      dateMs: ev.dateMs,
      ev: ev,
    };
  });

  var key = String(ctx.matchId || '').replace(/^fk_/, '');
  var channel = channelFromMatchId(ctx.matchId);
  var hit = null;
  if (channel && ctx.fixtureSearch !== true) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].ev.channel === channel) {
        // Prefer airing fixture on a shared channel slot.
        if (list[i].ev.airing) {
          hit = list[i];
          break;
        }
        if (!hit) hit = list[i];
      }
    }
    if (!hit && key) {
      for (var j = 0; j < list.length; j++) {
        if (list[j].ev.key === key || list[j].id === 'fk_' + key) {
          hit = list[j];
          break;
        }
      }
    }
  }
  if (!hit) hit = liveFindFixtureInList(list, ctx);
  if (!hit) {
    // Channel-only resolve (no fixture soft-match) still works.
    if (channel) return { channel: channel, ev: null };
    return null;
  }
  return { channel: hit.ev.channel, ev: hit.ev };
}

async function listChannelStreams(ctx, cfg, channel) {
  var pageUrl = playerPageUrl(cfg, channel);
  if (!pageUrl) return [];
  var res = await ctx.fetch(pageUrl, {
    headers: { 'User-Agent': ua(), Referer: String(cfg.origin || SPECS.origin) + '/' },
  });
  if (!res.ok) return [];
  var html = await res.text();
  var servers = parseDataServers(html);
  if (!servers.length) return [];
  var labelBase = channelLabel(html, channel);

  var unlocked = await Promise.all(
    servers.map(function (s) {
      return unlockEmbed(ctx, s.url, pageUrl, false).catch(function () {
        return null;
      });
    }),
  );

  var out = [];
  var seen = {};
  for (var i = 0; i < servers.length; i++) {
    var u = unlocked[i];
    if (!u) continue;
    var dedupe = u.url.split('?')[0];
    if (seen[dedupe]) continue;
    seen[dedupe] = 1;
    var label = labelBase;
    if (servers[i].label && servers[i].label !== 'متعدد') {
      label += ' · ' + servers[i].label;
    } else {
      label += ' · S' + (i + 1);
    }
    out.push(streamRow(ctx, u, label));
  }
  return out;
}

async function resolveStream(ctx, cfg) {
  var raw = String(ctx.embedUrl || ctx.url || ctx.iframe || '').trim();
  if (raw) {
    if (/\.m3u8(\?|$)/i.test(raw) || /\/proxy\.php\?stream=/i.test(raw)) {
      var h = ctx.headers && typeof ctx.headers === 'object' ? ctx.headers : null;
      return [
        {
          url: raw,
          name: NAME,
          source: 'freekoora',
          headers: h || playHeaders(raw),
          directPlayback: preferDirectPlayback(raw),
          viewers: Number(ctx.viewers || 0),
        },
      ];
    }
    var unlocked = await unlockEmbed(ctx, raw, playerPageUrl(cfg, channelFromMatchId(ctx.matchId)) || cfg.playerOrigin + '/', true);
    if (unlocked) return [streamRow(ctx, unlocked, 'Link')];
    return [];
  }

  var found = await findEvent(ctx, cfg);
  if (!found || !found.channel) return [];
  return listChannelStreams(ctx, cfg, found.channel);
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
