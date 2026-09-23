var SPECS = {
  base: 'https://animeslayer.to',
  flareUrl: 'https://patrimoines-en-mouvement.org/lib/flare/v3.php',
  xorKeyServers: 'AQWXZSCED@@POIUYTRR159',
  xorKeyHref: 'asxwqa147',
  fallbackName: 'KwQdDUVLRBELIQgCEhY=',
  fallbackBool: 'no',
  fallbackSan: 'KwQdDUVLRBELIQgCEhY=',
  fallbackMwsem: 'U29yY2VyeSBGaWdodCxKdWp1dHN1IEthaXNlbixKSks=',
};

var DISPLAY_NAMES = {
  wit: 'Zen-2',
  rift: 'Zen',
  riftv2: 'Zen V2',
  shof: 'Shof',
  blkom: 'Blkom',
  animeify: 'Animeify',
  topcinema: 'TopCinema',
  kuudere: 'Kuudere',
};

var SERVER_ORDER = ['wit', 'rift', 'riftv2', 'shof', 'blkom', 'animeify', 'kuudere', 'topcinema'];

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var flareCache = null;

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

  function decodeHref(encoded) {
    return xorDecrypt(encoded, cfg.xorKeyHref || SPECS.xorKeyHref);
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

  function postForm(url, body) {
    return ctx
      .fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': ua,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: base,
          Referer: base + '/',
          Accept: 'application/json, text/plain, */*',
        },
        body: body,
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
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
    if (!c) return 0;
    var best = 0;
    queries.forEach(function (q) {
      var n = String(q || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
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

  function parseEpisodes(html) {
    var block = html.match(/const\s+episodes\s*=\s*\[([\s\S]*?)\];/);
    if (!block) return [];
    var body = block[1];
    var re =
      /\{\s*n\s*:\s*(\d+)\s*,\s*title\s*:\s*"([^"]*)"\s*,\s*href\s*:\s*"([^"]*)"\s*,\s*desc\s*:\s*"([^"]*)"\s*,\s*views\s*:\s*"([^"]*)"\s*,\s*thumb\s*:\s*"([^"]*)"\s*\}/g;
    var eps = [];
    var m;
    while ((m = re.exec(body)) !== null) {
      var watchPath = decodeHref(m[3]) || '';
      eps.push({
        number: parseInt(m[1], 10) || 0,
        title: m[2] || '',
        watchPath: watchPath,
      });
    }
    return eps;
  }

  function getFlare() {
    if (flareCache) return Promise.resolve(flareCache);
    return getText(cfg.flareUrl || SPECS.flareUrl, {
      Referer: base + '/',
      Accept: 'application/json,*/*',
    }).then(function (raw) {
      var j = JSON.parse(raw);
      if (!j || !j.first || !j.sec) throw new Error('flare');
      flareCache = { first: String(j.first), sec: String(j.sec) };
      return flareCache;
    });
  }

  function discoverServers(watchPath) {
    var hashIdx = watchPath.indexOf('#');
    var path = hashIdx >= 0 ? watchPath.slice(0, hashIdx) : watchPath;
    var frag = hashIdx >= 0 ? watchPath.slice(hashIdx + 1) : '';
    if (!frag) return Promise.resolve([]);
    var segs = path.split('-');
    var pe = segs.length > 1 ? segs[segs.length - 1] : '';
    if (!pe) return Promise.resolve([]);

    return getFlare().then(function (flare) {
      var name = cfg.fallbackName || SPECS.fallbackName;
      var san = cfg.fallbackSan || SPECS.fallbackSan;
      var mwsem = cfg.fallbackMwsem || SPECS.fallbackMwsem;
      var boolStr = cfg.fallbackBool || SPECS.fallbackBool;

      return getText(base + path)
        .then(function (pageHtml) {
          function pluck(key) {
            var m = pageHtml.match(new RegExp('const\\s+' + key + '\\s*=\\s*"([^"]*)"'));
            return m ? m[1] : '';
          }
          var n = pluck('name');
          var s = pluck('san');
          var m = pluck('mwsem');
          var b = pluck('bool');
          if (n) name = n;
          if (s) san = s;
          if (m) mwsem = m;
          if (b) boolStr = b;
        })
        .catch(function () {})
        .then(function () {
          return postForm(
            flare.first,
            'pe=' + encodeURIComponent(pe) + '&hash=' + encodeURIComponent(frag),
          );
        })
        .then(function (r1) {
          var j1 = JSON.parse(r1);
          var aid = String(j1.a || '');
          var binfo = String(j1.b || '');
          var cep = String(j1.c || '');
          var dkeyn = String(j1.d || '');
          if (!dkeyn || !aid || !binfo) return [];
          var secBody = {
            keyn: dkeyn,
            name: name,
            pe: cep,
            bool: boolStr,
            id: aid,
            info: binfo,
            san: san,
            mwsem: mwsem,
          };
          var encoded = Object.keys(secBody)
            .map(function (k) {
              return encodeURIComponent(k) + '=' + encodeURIComponent(secBody[k]);
            })
            .join('&');
          return postForm(flare.sec, encoded).then(function (r2) {
            var j2 = JSON.parse(r2);
            var rawServers = j2.servers;
            var servers = {};
            if (rawServers && typeof rawServers === 'object' && !Array.isArray(rawServers)) {
              Object.keys(rawServers).forEach(function (k) {
                servers[k] = rawServers[k];
              });
            } else if (Array.isArray(rawServers)) {
              rawServers.forEach(function (entry, i) {
                if (entry && typeof entry === 'object') {
                  var sn = String(entry.name || entry.key || entry.server || entry.id || '');
                  var enc = String(entry.enc || entry.value || entry.url || entry.data || '');
                  if (sn && enc) servers[sn] = enc;
                  else {
                    var keys = Object.keys(entry);
                    if (keys.length === 1) servers[keys[0]] = String(entry[keys[0]] || '');
                  }
                } else if (typeof entry === 'string') {
                  servers['srv' + i] = entry;
                }
              });
            }
            var out = [];
            Object.keys(servers).forEach(function (sname) {
              var encStr = String(servers[sname] || '');
              if (!encStr) return;
              var url = decryptServer(encStr);
              if (!url || url.indexOf('http') !== 0) return;
              out.push({
                name: sname,
                displayName: DISPLAY_NAMES[sname.toLowerCase()] || titleCase(sname),
                iframeUrl: url,
              });
            });
            return out;
          });
        });
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
      return getText(base + '/title/' + slug).then(function (html) {
        var eps = parseEpisodes(html);
        var target = null;
        for (var i = 0; i < eps.length; i++) {
          if (eps[i].number === ep) {
            target = eps[i];
            break;
          }
        }
        if (!target && eps.length && ep <= eps.length) target = eps[ep - 1];
        if (!target || !target.watchPath) return [];
        return discoverServers(target.watchPath).then(function (servers) {
          if (!servers.length) return [];
          return scrapeAll(servers).then(toRows);
        });
      });
    })
    .catch(function () {
      return [];
    });
}
