var SPECS = {
  base: 'https://kaa.lt',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Referer: base + '/',
    Origin: base,
  };
  var playHeaders = {
    'User-Agent': ua,
    Referer: 'https://krussdomi.com/',
    Origin: 'https://krussdomi.com',
  };
  var title = String(ctx.title || '');
  var epNum = ctx.type === 'movie' ? 1 : ctx.episode || 1;

  function getJson(url, opts) {
    return ctx.fetch(url, Object.assign({ headers: headers }, opts || {})).then(function (r) {
      return r.json();
    });
  }

  function decodeEntities(s) {
    return String(s || '')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/\\\//g, '/');
  }

  function absUrl(u) {
    u = String(u || '')
      .trim()
      .replace(/^https:\/\/\//, 'https://');
    if (u.indexOf('//') === 0) return 'https:' + u;
    return u;
  }

  function playerUrl(src) {
    var url = absUrl(src);
    if (/\/vast/i.test(url)) {
      url = url.replace(/\/vast[^?]*/i, '/cat-player/player');
    }
    return url;
  }

  function extractManifest(html) {
    var decoded = decodeEntities(html);
    var m =
      decoded.match(/"manifest"\s*:\s*\[\s*\d+\s*,\s*"(?:https?:)?(\/\/[^"]+master\.m3u8)"/i) ||
      decoded.match(/((?:https?:)?\/\/[a-z0-9.-]*krussdomi\.com\/[^"'\\\s<>]+master\.m3u8)/i);
    if (!m) return '';
    return absUrl(m[1] || m[0]);
  }

  function extractSubtitles(html) {
    var decoded = decodeEntities(html);
    var out = [];
    var seen = {};
    var re = /"language"\s*:\s*\[\s*\d+\s*,\s*"([^"]+)"\][\s\S]{0,400}?"name"\s*:\s*\[\s*\d+\s*,\s*"([^"]+)"\][\s\S]{0,400}?"src"\s*:\s*\[\s*\d+\s*,\s*"([^"]+)"\]/g;
    var hit;
    while ((hit = re.exec(decoded))) {
      var src = absUrl(hit[3]);
      if (!src || seen[src]) continue;
      seen[src] = true;
      out.push({ url: src, lang: hit[1] || 'en', name: hit[2] || hit[1] || 'Subtitles' });
    }
    return out;
  }

  function resolveServer(server) {
    var src = server && server.src;
    if (!src) return Promise.resolve(null);
    var url = playerUrl(src);
    return ctx
      .fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          Referer: base + '/',
        },
      })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        var manifest = extractManifest(html);
        if (!manifest) return null;
        var row = {
          url: manifest,
          name: server.name || 'KickAssAnime',
          headers: playHeaders,
          language: 'Sub',
          pngStrip: 'auto',
        };
        var subs = extractSubtitles(html);
        if (subs.length) row.subtitles = subs;
        return row;
      })
      .catch(function () {
        return null;
      });
  }

  function search() {
    var q = title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return Promise.resolve([]);
    return getJson(base + '/api/fsearch', {
      method: 'POST',
      body: JSON.stringify({ page: 1, query: q }),
    }).then(function (data) {
      return Array.isArray(data && data.result) ? data.result : [];
    });
  }

  function pick(results) {
    var q = title.toLowerCase();
    var best = null;
    var bestScore = 0;
    results.forEach(function (r) {
      var en = String(r.title_en || '').toLowerCase();
      var jp = String(r.title || '').toLowerCase();
      var score = 0;
      if (en && q.indexOf(en) >= 0) score = en.length;
      else if (en && en.indexOf(q) >= 0) score = q.length;
      else if (jp && q.indexOf(jp) >= 0) score = jp.length / 2;
      if (ctx.year && Number(r.year) === Number(ctx.year)) score += 10;
      if (ctx.type === 'movie' && String(r.type || '').toLowerCase() === 'movie') score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    });
    return best && best.slug ? best : results[0];
  }

  function episodeSlug(showSlug, showInfo) {
    if (showInfo && showInfo.type === 'movie') {
      var m = String(showInfo.watch_uri || '').match(/\/(ep-\d+-[a-f0-9]+)$/i);
      return m ? m[1] : '';
    }
    return getJson(base + '/api/show/' + showSlug + '/episodes?ep=' + epNum + '&lang=ja-JP').then(
      function (d) {
        var list = Array.isArray(d && d.result) ? d.result : [];
        var hit = null;
        list.forEach(function (e) {
          if (Number(e.episode_number) === Number(epNum)) hit = e;
        });
        if (!hit && list[0]) hit = list[0];
        return hit ? 'ep-' + hit.episode_number + '-' + hit.slug : '';
      },
    );
  }

  if (!title) return [];

  return search()
    .then(function (results) {
      var show = pick(results);
      if (!show || !show.slug) return [];
      return getJson(base + '/api/show/' + show.slug).then(function (info) {
        return Promise.resolve(episodeSlug(show.slug, info)).then(function (full) {
          if (!full) return [];
          return getJson(base + '/api/show/' + show.slug + '/episode/' + full).then(function (ep) {
            var servers = Array.isArray(ep && ep.servers) ? ep.servers : [];
            return Promise.all(servers.map(resolveServer)).then(function (rows) {
              return rows.filter(function (r) {
                return r && r.url;
              });
            });
          });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
