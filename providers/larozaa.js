var SPECS = {
  bootstrap: 'https://laaroza.lat',
  mirrors: [
    'https://laaroza.lat',
    'https://laaroza.website',
    'https://laaroza.space',
    'https://laaroza.pics',
  ],
};

var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function headers(referer) {
  var h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  return h;
}

function origin(url) {
  try {
    var u = new URL(String(url || ''));
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

function isLarozaHost(host) {
  return /la+r+o+z+a/i.test(String(host || ''));
}

function html(ctx, raw) {
  if (!ctx || typeof ctx.html !== 'function') return null;
  try {
    return ctx.html(raw);
  } catch (e) {
    return null;
  }
}

function resolveBase(ctx, cfg) {
  var boots = [cfg.bootstrap]
    .concat(Array.isArray(cfg.mirrors) ? cfg.mirrors : [])
    .map(function (b) {
      return String(b || '').replace(/\/$/, '');
    })
    .filter(Boolean);
  var seen = {};
  var ordered = [];
  for (var i = 0; i < boots.length; i++) {
    if (seen[boots[i]]) continue;
    seen[boots[i]] = true;
    ordered.push(boots[i]);
  }

  function attempt(index) {
    if (index >= ordered.length) {
      return Promise.resolve(ordered[0] || 'https://laaroza.website');
    }
    var boot = ordered[index];
    return ctx
      .fetch(boot + '/', { headers: headers(boot + '/') })
      .then(function (res) {
        var o = origin(res.url || boot);
        var host = '';
        try {
          host = new URL(o).host;
        } catch (e) {}
        if (o && isLarozaHost(host)) return o;
        return attempt(index + 1);
      })
      .catch(function () {
        return attempt(index + 1);
      });
  }

  return attempt(0);
}

function fetchHtml(ctx, url, referer) {
  return ctx
    .fetch(url, { headers: headers(referer || origin(url) + '/') })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text().then(function (body) {
        return { html: body, url: res.url || url };
      });
    });
}

function parseVideoId(raw) {
  raw = String(raw || '').trim();
  if (raw.indexOf('larozaa:') === 0) return raw.substring(8);
  if (raw.indexOf('ep:') === 0) return raw.substring(3);
  return raw;
}

function pushServer(items, seen, embedUrl, referer, name) {
  embedUrl = String(embedUrl || '').trim();
  if (!embedUrl || seen[embedUrl]) return;
  seen[embedUrl] = true;
  items.push({
    embedUrl: embedUrl,
    referer: referer,
    name: name || 'Server ' + (items.length + 1),
  });
}

function collectLarozaServers($, rawHtml, playUrl, playReferer) {
  var items = [];
  var seen = {};
  if ($) {
    $('.WatchList li').each(function () {
      var item = $(this);
      var embedUrl = item.attr('data-embed-url') || '';
      if (!embedUrl) return;
      var name = (item.text() || '').trim();
      pushServer(items, seen, embedUrl, playUrl || playReferer, name);
    });
    if (!items.length) {
      var iframe = $('iframe[src]').first();
      var src = iframe.length ? iframe.attr('src') || '' : '';
      if (src && src.indexOf('new_ads') < 0) {
        pushServer(items, seen, src, playUrl || playReferer, 'Server 1');
      }
    }
  }
  if (!items.length && rawHtml) {
    var re = /data-embed-url="([^"]+)"/gi;
    var m;
    while ((m = re.exec(rawHtml))) {
      pushServer(items, seen, m[1], playUrl || playReferer, 'Server ' + (items.length + 1));
    }
  }
  return items;
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// Vidara-family players: POST `/api/stream` → `streaming_url` (HLS).
var VIDARA_HOSTS = ['vidara.to'];

function resolveVidara(ctx, server) {
  var code = /\/e\/([A-Za-z0-9]+)/.exec(server.embedUrl);
  if (!code) return Promise.resolve([]);
  var o = origin(server.embedUrl);
  var h = headers(server.embedUrl);
  h['Content-Type'] = 'application/json';
  h.Origin = o;
  return ctx
    .fetch(o + '/api/stream', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ filecode: code[1], device: 'web', codecs: [] }),
    })
    .then(function (res) {
      return res.json();
    })
    .then(function (j) {
      var url = j && j.streaming_url;
      if (!url) return [];
      return [arabicDirectRow(url, server.name, server.embedUrl)];
    })
    .catch(function () {
      return [];
    });
}

/**
 * One server → stream rows. Packed / JW pages unpack here; Vidara uses its
 * API; VOE, Vidmoly, Mixdrop and DoodStream go to the shared hops.
 */
function resolveServer(ctx, server) {
  return arabicResolveEmbed(ctx, server.embedUrl, server.referer, server.name)
    .then(function (row) {
      if (row) return [row];
      if (VIDARA_HOSTS.indexOf(hostOf(server.embedUrl)) >= 0) {
        return resolveVidara(ctx, server);
      }
      if (typeof ctx.hop !== 'function') return [];
      return ctx.hop(server.embedUrl).then(function (rows) {
        return (rows || []).map(function (r) {
          return Object.assign({}, r, { name: server.name, title: server.name });
        });
      });
    })
    .catch(function () {
      return [];
    });
}

function resolveServers(ctx, servers) {
  return Promise.all(
    servers.map(function (s) {
      return resolveServer(ctx, s);
    }),
  ).then(function (lists) {
    var out = [];
    for (var i = 0; i < lists.length; i++) out = out.concat(lists[i]);
    if (!out.length) {
      ctx.log('larozaa: no direct streams from ' + servers.length + ' server(s)');
    }
    return out;
  });
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var videoId = parseVideoId(cfg.videoId || '');
  if (!videoId) {
    ctx.log('larozaa: missing videoId');
    return Promise.resolve([]);
  }

  return resolveBase(ctx, cfg)
    .then(function (base) {
      var playUrl = base + '/play.php?vid=' + encodeURIComponent(videoId);
      // play.php is gated — Referer must be the watch page, not bare origin.
      var playReferer = base + '/video.php?vid=' + encodeURIComponent(videoId);
      return fetchHtml(ctx, playUrl, playReferer).then(function (got) {
        var $ = html(ctx, got.html);
        var servers = collectLarozaServers($, got.html, playUrl, playReferer);
        if (!servers.length) {
          // Older / alternate path: embed.php carries the first iframe.
          var embedUrl = base + '/embed.php?vid=' + encodeURIComponent(videoId);
          return fetchHtml(ctx, embedUrl, playReferer).then(function (emb) {
            var $e = html(ctx, emb.html);
            var fromEmbed = collectLarozaServers($e, emb.html, embedUrl, playReferer);
            return resolveServers(ctx, fromEmbed);
          });
        }
        return resolveServers(ctx, servers);
      });
    })
    .catch(function (e) {
      ctx.log('larozaa extract error: ' + (e && e.message ? e.message : e));
      return [];
    });
}
