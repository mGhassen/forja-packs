var SPECS = {
  "origin": "https://animekai.be",
  "megaplay": "https://megaplay.buzz",
  "vidwish": "https://vidwish.live",
  "megacloud": "https://megacloud.bloggy.click",
  "vidtube": "https://vidtube.site"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var megaplay = String(cfg.megaplay || '').replace(/\/$/, '');
  var vidwish = String(cfg.vidwish || '').replace(/\/$/, '');
  var megacloud = String(cfg.megacloud || '').replace(/\/$/, '');
  var vidtube = String(cfg.vidtube || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Accept: '*/*' };
  var title = String(ctx.title || '');
  var malId = Number(ctx.malId) || 0;
  var anilistId = Number(ctx.anilistId) || 0;
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var cats =
    (globalThis.__engineAudioCategories &&
      globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  function getJson(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    });
  }

  function getText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      if (!r.ok) return '';
      return r.text();
    });
  }

  function playerId(html) {
    try {
      var $ = ctx.html ? ctx.html(html) : null;
      if ($) {
        var el = $('#megaplay-player');
        if (el && el.length) {
          return { id: el.attr('data-id') || '', real: el.attr('data-realid') || '' };
        }
      }
    } catch (e) {}
    return {
      id:
        (html.match(/id=["']megaplay-player["'][^>]*data-id=["']([^"']+)/) ||
          html.match(/data-id=["']([^"']+)["'][^>]*id=["']megaplay-player/) ||
          [])[1] || '',
      real: (html.match(/data-realid=["']([^"']+)/) || [])[1] || '',
    };
  }

  // MegaPlay getSources: plaintext sources.file OR AES-CBC `enc` (newclient.min.js).
  // Prefer s=tcdn — default CDN (imgnex) 403s outside their player; tcdn → akirax works.
  var MEGAPLAY_AES_KEY = 'i?LMTAx0Q6,:}50U';
  var MEGAPLAY_AES_IV = "W0;27ToaUpl_P%'c";

  function fileFromGetSources(json) {
    var file = json && json.sources && json.sources.file;
    if (typeof file === 'string' && file) return file;
    var enc = json && json.enc;
    if (!enc || typeof enc !== 'string') return '';
    try {
      var C = ctx.crypto || globalThis.CryptoJS;
      if (!C || !C.AES) return '';
      var keyHex = C.enc.Utf8.parse(MEGAPLAY_AES_KEY).toString(C.enc.Hex);
      while (keyHex.length < 64) keyHex += '00';
      var key = C.enc.Hex.parse(keyHex.substring(0, 64));
      var iv = C.enc.Utf8.parse(MEGAPLAY_AES_IV);
      var pt = C.AES.decrypt(
        { ciphertext: C.enc.Base64.parse(enc) },
        key,
        { iv: iv, mode: C.mode.CBC, padding: C.pad.Pkcs7 },
      );
      var text = C.enc.Utf8.stringify(pt);
      if (!text) return '';
      var parsed = JSON.parse(text);
      return (parsed && parsed.file) || '';
    } catch (e) {
      return '';
    }
  }

  function getSourcesUrl(host, id) {
    return host + '/stream/getSources?id=' + id + '&id=' + id + '&s=tcdn';
  }

  function extractSources(apiUrl, referer, host, name, kind) {
    return getJson(apiUrl, {
      'X-Requested-With': 'XMLHttpRequest',
      Referer: referer,
      Origin: host,
    })
      .then(function (json) {
        var file = fileFromGetSources(json);
        if (!file) return [];
        if (file.indexOf('mewstream.buzz') >= 0) {
          var tracks = json.tracks || [];
          var replacementHost = '1oe.lostproject.club';
          for (var i = 0; i < tracks.length; i++) {
            var tUrl = tracks[i] && tracks[i].file;
            if (tUrl && tUrl.indexOf('mewstream.buzz') < 0) {
              try {
                replacementHost = new URL(tUrl).host;
                break;
              } catch (e) {}
            }
          }
          try {
            var parsed = new URL(file);
            parsed.host = replacementHost;
            file = parsed.toString();
          } catch (e) {}
        }
        return [
          {
            url: file,
            name: 'AnimeKai [' + name + '] (' + kind.toUpperCase() + ')',
            language: kind === 'dub' ? 'Dub' : 'Sub',
            headers: { 'User-Agent': ua, Referer: host + '/', Origin: host },
          },
        ];
      })
      .catch(function () {
        return [];
      });
  }

  function scrapeMegaPage(pageUrl, kind) {
    return getText(pageUrl, { Referer: origin + '/' }).then(function (html) {
      if (!html) return [];
      var ids = playerId(html);
      var tasks = [];
      if (ids.id) {
        tasks.push(
          extractSources(
            getSourcesUrl(megaplay, ids.id),
            pageUrl,
            megaplay,
            'MegaPlay',
            kind,
          ),
        );
      }
      if (ids.real) {
        var vidPage = vidwish + '/stream/s-2/' + ids.real + '/' + kind;
        tasks.push(
          getText(vidPage, { Referer: pageUrl }).then(function (vidHtml) {
            var v = playerId(vidHtml);
            if (!v.id) return [];
            return extractSources(
              getSourcesUrl(vidwish, v.id),
              vidPage,
              vidwish,
              'Vidwish',
              kind,
            );
          }),
        );
        var mcPage = megacloud + '/stream/s-3/' + ids.real + '/' + kind;
        tasks.push(
          getText(mcPage, { Referer: pageUrl }).then(function (mcHtml) {
            var m = playerId(mcHtml);
            if (!m.id) return [];
            return extractSources(
              getSourcesUrl(megacloud, m.id),
              mcPage,
              megacloud,
              'MegaCloud',
              kind,
            );
          }),
        );
        var vtPage = vidtube + '/stream/s-2/' + ids.real + '/' + kind;
        tasks.push(
          getText(vtPage, { Referer: pageUrl }).then(function (vtHtml) {
            var v = playerId(vtHtml);
            if (!v.id) return [];
            return extractSources(
              getSourcesUrl(vidtube, v.id),
              vtPage,
              vidtube,
              'VidTube',
              kind,
            );
          }),
        );
      }
      return Promise.all(tasks).then(function (groups) {
        return [].concat.apply([], groups);
      });
    });
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function pickSlug(html) {
    var links = html.match(/\/watch\/[a-z0-9\-]+/gi) || [];
    if (!links.length) return '';
    var want = norm(title);
    var best = '';
    var bestScore = -1;
    var seen = {};
    for (var i = 0; i < links.length; i++) {
      var path = links[i].toLowerCase();
      if (seen[path]) continue;
      seen[path] = true;
      var slug = path.replace(/^\/watch\//, '');
      var score = 0;
      var slugNorm = norm(slug.replace(/-/g, ' '));
      if (want && slugNorm === want) score = 100;
      else if (want && slugNorm.indexOf(want) >= 0) score = 80;
      else if (want && want.indexOf(slugNorm) >= 0) score = 60;
      else if (want) {
        var parts = want.split(' ');
        var hit = 0;
        for (var p = 0; p < parts.length; p++) {
          if (parts[p] && slugNorm.indexOf(parts[p]) >= 0) hit++;
        }
        score = hit;
      }
      if (score > bestScore) {
        bestScore = score;
        best = slug;
      }
    }
    return bestScore > 0 ? best : '';
  }

  function serversFromWatchHtml(html) {
    var out = [];
    var re =
      /class=["'][^"']*server[^"']*["'][^>]*data-url=["']([^"']+)["'][^>]*(?:data-id=["'](sub|dub)["'])?/gi;
    var m;
    while ((m = re.exec(html))) {
      out.push({ url: m[1], kind: (m[2] || 'sub').toLowerCase() });
    }
    // Also catch servers nested under lang-group data-id.
    var groupRe =
      /data-id=["'](sub|dub)["'][\s\S]{0,4000}?data-url=["']([^"']+)["']/gi;
    while ((m = groupRe.exec(html))) {
      out.push({ url: m[2], kind: m[1].toLowerCase() });
    }
    var seen = {};
    return out.filter(function (row) {
      if (!row.url || seen[row.url]) return false;
      seen[row.url] = true;
      return true;
    });
  }

  function streamsFromSite() {
    if (!title || !origin) return Promise.resolve([]);
    return getText(origin + '/browse?keyword=' + encodeURIComponent(title), {
      Referer: origin + '/',
    }).then(function (browseHtml) {
      var slug = pickSlug(browseHtml || '');
      if (!slug) return [];
      return getText(origin + '/watch/' + slug + '/ep-' + ep, {
        Referer: origin + '/watch/' + slug,
      }).then(function (watchHtml) {
        var servers = serversFromWatchHtml(watchHtml || '');
        if (!servers.length) return [];
        var allow = {};
        cats.forEach(function (k) {
          allow[k] = true;
        });
        return Promise.all(
          servers
            .filter(function (s) {
              return !!allow[s.kind];
            })
            .map(function (s) {
              if (/megaplay\.buzz\/stream\//i.test(s.url)) {
                return scrapeMegaPage(s.url, s.kind);
              }
              return Promise.resolve([]);
            }),
        ).then(function (groups) {
          return [].concat.apply([], groups);
        });
      });
    });
  }

  function streamsFromIds() {
    var fromMal = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (!malId && fromMal && fromMal.mal) malId = Number(fromMal.mal) || 0;
    if (!malId && !anilistId) return Promise.resolve([]);

    var pages = [];
    cats.forEach(function (kind) {
      if (anilistId > 0) {
        pages.push({
          url: megaplay + '/stream/ani/' + anilistId + '/' + ep + '/' + kind,
          kind: kind,
        });
      }
      if (malId > 0) {
        pages.push({
          url: megaplay + '/stream/mal/' + malId + '/' + ep + '/' + kind,
          kind: kind,
        });
      }
    });

    return Promise.all(
      pages.map(function (p) {
        return scrapeMegaPage(p.url, p.kind).catch(function () {
          return [];
        });
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  function dedupe(rows) {
    var seen = {};
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.url || seen[r.url]) return;
      seen[r.url] = true;
      out.push(r);
    });
    return out;
  }

  if (!title && !malId && !anilistId) return [];

  // Prefer MAL/AniList MegaPlay (what animekai.be embeds). Browse slugs are
  // season-blind and can map "Season 2" onto the original series page.
  return streamsFromIds()
    .then(function (idRows) {
      if (idRows && idRows.length) return idRows;
      return streamsFromSite();
    })
    .then(dedupe)
    .catch(function () {
      return [];
    });
}
