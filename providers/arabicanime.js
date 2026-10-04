var SPECS = {
  base: 'https://animeslayer.to',
  secPath: '/api/v1/sec.php',
  xorKeyServers: 'AQWXZSCED@@POIUYTRR159',
};

var DISPLAY_NAMES = {
  x3: 'Sibnet',
  x4: 'Zen-FHD',
  x8: 'Blkom',
  x9: 'Zen-HD',
  x13: 'Mega',
  wit: 'Zen-2',
  rift: 'Zen',
  riftv2: 'Zen V2',
  shof: 'Shof',
  blkom: 'Blkom',
  animeify: 'Animeify',
  topcinema: 'TopCinema',
  kuudere: 'Kuudere',
};

var SERVER_ORDER = ['x4', 'x9', 'x8', 'x3', 'wit', 'rift', 'riftv2', 'shof', 'blkom', 'animeify', 'kuudere', 'topcinema'];

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function titleCandidates() {
    var out = [];
    var seen = {};
    function add(t) {
      t = String(t || '').trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    add(ctx.title);
    add(ctx.titleEnglish);
    add(ctx.titleRomaji);
    add(ctx.originalTitle);
    if (Array.isArray(ctx.titles)) ctx.titles.forEach(add);
    return out;
  }

  function xorDecrypt(data, key) {
    try {
      var bin = atob(String(data || '').trim());
      var out = '';
      for (var i = 0; i < bin.length; i++) {
        out += String.fromCharCode(bin.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  function decryptServer(enc) {
    return xorDecrypt(enc, cfg.xorKeyServers || SPECS.xorKeyServers);
  }

  function getText(url, extra) {
    return ctx
      .fetch(url, {
        headers: Object.assign(
          {
            'User-Agent': ua,
            Accept: 'text/html,*/*',
            'Accept-Language': 'ar,en;q=0.8',
          },
          extra || {},
        ),
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
  }

  function titleCase(s) {
    s = String(s || '');
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function qualityRank(q) {
    var m = String(q || '').match(/(\d{3,4})/);
    return m ? parseInt(m[1], 10) || 0 : 0;
  }

  function searchAnime(query) {
    return getText(base + '/api/search.php?q=' + encodeURIComponent(query))
      .then(function (body) {
        try {
          var raw = JSON.parse(body);
          if (!Array.isArray(raw)) return [];
          return raw
            .map(function (item) {
              if (!item) return null;
              var href = String(item.href || '');
              if (!href) return null;
              var slug = href.indexOf('/title/') === 0 ? href.slice(7) : href.replace(/^\/+/, '');
              return {
                slug: slug,
                title: String(item.title || slug).trim(),
              };
            })
            .filter(Boolean);
        } catch (e) {
          return [];
        }
      })
      .catch(function () {
        return [];
      });
  }

  function scoreTitle(candidate, queries) {
    var c = String(candidate || '')
      .toLowerCase()
      .replace(/[^a-z0-9؀-ۿ]+/g, '');
    if (!c) return 0;
    var best = 0;
    queries.forEach(function (q) {
      var n = String(q || '')
        .toLowerCase()
        .replace(/[^a-z0-9؀-ۿ]+/g, '');
      if (!n) return;
      if (c === n) best = Math.max(best, 1);
      else if (c.indexOf(n) >= 0 || n.indexOf(c) >= 0) best = Math.max(best, 0.7);
    });
    return best;
  }

  function resolveSlug(titles) {
    var chain = Promise.resolve(null);
    titles.forEach(function (q) {
      chain = chain.then(function (found) {
        if (found) return found;
        return searchAnime(q).then(function (hits) {
          if (!hits.length) return null;
          var best = hits[0];
          var bestScore = scoreTitle(best.title, titles);
          hits.forEach(function (h) {
            var s = scoreTitle(h.title, titles);
            if (s > bestScore) {
              bestScore = s;
              best = h;
            }
          });
          return best && bestScore >= 0.5 ? best.slug : hits[0].slug;
        });
      });
    });
    return chain;
  }

  function parseWatchPage(html) {
    var result = { name: '', bool: '0', mwsem: '1', secUrl: '', episodes: [] };

    var nm = html.match(/const\s+name\s*=\s*"([^"]*)"/);
    if (nm) result.name = nm[1];

    var bm = html.match(/const\s+bool\s*=\s*("([^"]*)"|(\d+))/);
    if (bm) result.bool = bm[2] || bm[3] || '0';

    var mm = html.match(/const\s+mwsem\s*=\s*"([^"]*)"/);
    if (mm) result.mwsem = mm[1];

    var sm = html.match(/const\s+secUrl\s*=\s*"([^"]*)"/);
    if (sm) result.secUrl = sm[1];

    var block = html.match(/const\s+episodesData\s*=\s*\[([\s\S]*?)\];/);
    if (block) {
      var re = /\{\s*[\s\S]*?id\s*:\s*"(\d+)"[\s\S]*?watchUrl\s*:\s*"([^"]*)"[\s\S]*?\}/g;
      var m;
      while ((m = re.exec(block[1])) !== null) {
        result.episodes.push({
          number: parseInt(m[1], 10) || 0,
          watchUrl: m[2],
        });
      }
    }

    return result;
  }

  function discoverServers(watchPage, episodeToken) {
    var secUrl = watchPage.secUrl || (cfg.secPath || SPECS.secPath);
    if (secUrl.indexOf('http') !== 0) secUrl = base + secUrl;

    var params =
      'name=' + encodeURIComponent(watchPage.name) +
      '&pe=' + encodeURIComponent(episodeToken) +
      '&bool=' + encodeURIComponent(watchPage.bool) +
      '&mwsem=' + encodeURIComponent(watchPage.mwsem);

    return getText(secUrl + '?' + params, {
      Referer: base + '/',
      Accept: 'application/json,*/*',
    }).then(function (raw) {
      var j = JSON.parse(raw);
      var out = [];
      var rawServers = j.servers || {};

      if (rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)) {
        Object.keys(rawServers).forEach(function (sname) {
          var encStr = String(rawServers[sname] || '');
          if (!encStr) return;
          var url = decryptServer(encStr);
          if (!url || url.indexOf('http') !== 0) return;
          if (url.indexOf('/vfail.php') >= 0) return;
          out.push({
            name: sname,
            displayName: DISPLAY_NAMES[sname.toLowerCase()] || titleCase(sname),
            iframeUrl: url,
          });
        });
      }

      if (j.data) {
        var autoUrl = decryptServer(j.data);
        if (autoUrl && autoUrl.indexOf('http') === 0 && autoUrl.indexOf('/vfail.php') < 0) {
          var autoName = j.auto || 'auto';
          var alreadyHas = out.some(function (s) { return s.iframeUrl === autoUrl; });
          if (!alreadyHas) {
            out.unshift({
              name: autoName,
              displayName: DISPLAY_NAMES[String(autoName).toLowerCase()] || titleCase(autoName),
              iframeUrl: autoUrl,
            });
          }
        }
      }

      return out;
    });
  }

  function parseVideos(server, html) {
    var origin = '';
    try {
      var u = new URL(server.iframeUrl);
      origin = u.protocol + '//' + u.host;
    } catch (e) {}
    var headers = {
      'User-Agent': ua,
      Referer: origin ? origin + '/' : '',
    };
    if (origin) headers.Origin = origin;
    var out = [];
    var seen = {};
    var blockRe =
      /src\s*:\s*['"]([^'"]+)['"](?:[^{}]*?label\s*:\s*['"]([^'"]*)['"])?(?:[^{}]*?res\s*:\s*['"]?([0-9a-zA-Z]+)['"]?)?/gim;
    var m;
    while ((m = blockRe.exec(html)) !== null) {
      var url = (m[1] || '').trim();
      if (!url || url.indexOf('http') !== 0 || seen[url]) continue;
      seen[url] = 1;
      var label = (m[2] || '').trim();
      var res = (m[3] || '').trim();
      var quality = label || (res ? res + 'p' : '');
      var type = url.toLowerCase().indexOf('.m3u8') >= 0 ? 'hls' : 'video';
      out.push({
        server: server,
        url: url,
        quality: quality,
        type: type,
        headers: headers,
      });
    }
    out.sort(function (a, b) {
      return qualityRank(b.quality) - qualityRank(a.quality);
    });
    return out;
  }

  function scrapeOne(server) {
    var host = '';
    try {
      host = new URL(server.iframeUrl).host.toLowerCase();
    } catch (e) {}
    if (host.indexOf('mega.nz') >= 0 || host.indexOf('mega.co.nz') >= 0) {
      return Promise.resolve([]);
    }
    return getText(server.iframeUrl, {
      Referer: base + '/',
      Accept: 'text/html,*/*',
    })
      .then(function (html) {
        var direct = parseVideos(server, html);
        if (direct.length) return direct;
        return ctx.hop(server.iframeUrl).then(function (rows) {
          return (rows || []).map(function (r) {
            return {
              server: server,
              url: r.url,
              quality: r.quality || '',
              type: 'video',
              headers: Object.assign({}, r.headers || {}, {
                'User-Agent': ua,
              }),
            };
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  function scrapeAll(servers) {
    return Promise.all(
      servers.map(function (s) {
        return scrapeOne(s);
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  function toRows(hits) {
    function rank(name) {
      var i = SERVER_ORDER.indexOf(String(name || '').toLowerCase());
      return i < 0 ? 999 : i;
    }
    var sorted = hits.slice().sort(function (a, b) {
      var ra = rank(a.server.name);
      var rb = rank(b.server.name);
      if (ra !== rb) return ra - rb;
      return qualityRank(b.quality) - qualityRank(a.quality);
    });
    var out = [];
    var seen = {};
    sorted.forEach(function (h) {
      if (!h || !h.url || seen[h.url]) return;
      seen[h.url] = 1;
      var qLabel = h.quality ? ' • ' + h.quality : '';
      out.push({
        url: h.url,
        name: 'ArabicAnime [' + h.server.displayName + ']' + qLabel,
        quality: h.quality || '',
        language: 'Arabic',
        headers: h.headers,
      });
    });
    return out;
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  return resolveSlug(titles)
    .then(function (slug) {
      if (!slug) return [];
      return getText(base + '/e/' + slug).then(function (html) {
        var wp = parseWatchPage(html);
        if (!wp.name || !wp.episodes.length) return [];

        var target = null;
        for (var i = 0; i < wp.episodes.length; i++) {
          if (wp.episodes[i].number === ep) {
            target = wp.episodes[i];
            break;
          }
        }
        if (!target && wp.episodes.length && ep <= wp.episodes.length) target = wp.episodes[ep - 1];
        if (!target || !target.watchUrl) return [];

        return discoverServers(wp, target.watchUrl).then(function (servers) {
          if (!servers.length) return [];
          return scrapeAll(servers).then(toRows);
        });
      });
    })
    .catch(function () {
      return [];
    });
}
