var SPECS = {
  origin: 'https://watchhentai.net',
};

var STOPWORDS = {
  a: 1,
  an: 1,
  the: 1,
  of: 1,
  and: 1,
  or: 1,
  to: 1,
  in: 1,
  on: 1,
  at: 1,
  for: 1,
  with: 1,
  by: 1,
  from: 1,
  is: 1,
  it: 1,
  no: 1,
  wa: 1,
  ga: 1,
  ni: 1,
  o: 1,
  wo: 1,
  de: 1,
  mo: 1,
  ka: 1,
  ya: 1,
  na: 1,
  e: 1,
  he: 1,
  te: 1,
  ne: 1,
  animation: 1,
  anime: 1,
  motion: 1,
  ova: 1,
  ona: 1,
  tv: 1,
  special: 1,
  version: 1,
  edition: 1,
  dubbed: 1,
  subbed: 1,
  sub: 1,
  dub: 1,
  uncensored: 1,
  censored: 1,
  episode: 1,
  ep: 1,
  season: 1,
  side: 1,
  part: 1,
  arc: 1,
  chapter: 1,
  vol: 1,
  volume: 1,
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var hdrs = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };

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

  function getText(url, referer) {
    var h = Object.assign({}, hdrs);
    if (referer) h.Referer = referer;
    return ctx.fetch(url, { headers: h }).then(function (r) {
      if (!r.ok) return '';
      return r.text();
    });
  }

  function decodeEntities(s) {
    return String(s || '')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&#8217;/g, '\u2019')
      .replace(/&#8220;/g, '\u201C')
      .replace(/&#8221;/g, '\u201D')
      .replace(/&#8211;/g, '\u2013')
      .replace(/&#8212;/g, '\u2014')
      .replace(/&#8230;/g, '\u2026')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function tokens(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(function (t) {
        return t.length > 1 && !STOPWORDS[t];
      });
  }

  function tokenSet(s) {
    var set = {};
    tokens(s).forEach(function (t) {
      set[t] = 1;
    });
    return set;
  }

  function titleVariants(t) {
    var out = {};
    t = String(t || '').trim();
    if (t) out[t] = 1;
    var pats = [/[:–—]/, /\s+~/, /\s+-\s+/, /\s*\(/, /\s*\//, /\s+(?:side|part|arc)\s+/i];
    pats.forEach(function (pat) {
      var m = pat.exec(t);
      if (m && m.index > 0) out[t.slice(0, m.index).trim()] = 1;
    });
    var deco = t.replace(
      /\s+(?:the\s+)?(?:animation|motion\s+anime|anime|ova|ona|special)\s*$/i,
      '',
    );
    if (deco !== t) out[deco.trim()] = 1;
    var words = t.split(/\s+/);
    if (words.length > 2) out[words.slice(0, 2).join(' ')] = 1;
    if (words.length > 3) out[words.slice(0, 3).join(' ')] = 1;
    return Object.keys(out).filter(Boolean);
  }

  function parseHits(html) {
    var start = html.indexOf('csearch');
    if (start < 0) return [];
    var end = html.indexOf('class="sidebar', start);
    if (end < 0 || end <= start) return [];
    var region = html.slice(start, end);
    var re =
      /<div class="result-item"><article>[\s\S]*?<div class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/gi;
    var hits = [];
    var m;
    while ((m = re.exec(region)) !== null) {
      hits.push({ url: m[1], title: decodeEntities(m[2].trim()) });
    }
    return hits;
  }

  function scoreHit(hit, qSets) {
    var r = tokenSet(hit.title);
    var rKeys = Object.keys(r);
    if (!rKeys.length) return 0;
    var best = 0;
    qSets.forEach(function (q) {
      var qKeys = Object.keys(q);
      if (!qKeys.length) return;
      var inter = 0;
      qKeys.forEach(function (k) {
        if (r[k]) inter++;
      });
      if (!inter) return;
      var union = rKeys.length + qKeys.length - inter;
      var j = inter / union;
      if (j > best) best = j;
    });
    return best;
  }

  function findSeries(titles) {
    var allVariants = {};
    titles.forEach(function (t) {
      titleVariants(t).forEach(function (v) {
        if (v) allVariants[v] = 1;
      });
    });
    var ordered = Object.keys(allVariants).sort(function (a, b) {
      return a.length - b.length;
    });
    var qSets = ordered.map(tokenSet).filter(function (s) {
      return Object.keys(s).length > 0;
    });
    if (!qSets.length) return Promise.resolve(null);

    var tried = {};
    var allHits = [];
    var chain = Promise.resolve();
    ordered.slice(0, 4).forEach(function (q) {
      chain = chain.then(function () {
        var key = q.toLowerCase();
        if (tried[key]) return;
        tried[key] = 1;
        return getText(origin + '/?s=' + encodeURIComponent(q)).then(function (html) {
          if (!html) return;
          var hits = parseHits(html);
          hits.forEach(function (h) {
            if (!allHits.some(function (x) { return x.url === h.url; })) allHits.push(h);
          });
        });
      });
    });

    return chain.then(function () {
      if (!allHits.length) return null;
      var best = null;
      var bestScore = -1;
      var bestLen = 1 << 30;
      allHits.forEach(function (h) {
        var s = scoreHit(h, qSets);
        var len = tokens(h.title).length;
        if (s > bestScore || (s === bestScore && len < bestLen)) {
          bestScore = s;
          best = h;
          bestLen = len;
        }
      });
      if (!best || bestScore < 0.5) return null;
      return best.url;
    });
  }

  function pickEpisode(seriesHtml) {
    var re = /\/videos\/([a-z0-9\-]+-episode-(\d+)[a-z0-9\-]*)\/?/gi;
    var matching = [];
    var m;
    var seen = {};
    while ((m = re.exec(seriesHtml)) !== null) {
      var path = '/videos/' + m[1] + '/';
      if (seen[path]) continue;
      seen[path] = 1;
      if (String(m[2]) === String(ep)) matching.push(path);
    }
    if (!matching.length) return null;
    matching.sort(function (a, b) {
      function score(u) {
        var s = 0;
        if (u.indexOf('dubbed') >= 0) s -= 100;
        if (u.indexOf('uncensored') >= 0) s -= 10;
        return s;
      }
      return score(a) - score(b);
    });
    return origin + matching[0];
  }

  function extractJwUrl(videoHtml) {
    var m = videoHtml.match(
      /(?:data-litespeed-src|src)\s*=\s*['"](https?:\/\/watchhentai\.net\/jwplayer\/\?source=[^'"]+)/i,
    );
    return m ? decodeEntities(m[1]) : null;
  }

  function pickBestSource(jwHtml) {
    var all = [];
    var re = /file\s*:\s*["'](https?:\/\/[^"']+\.mp4)["']/gi;
    var m;
    while ((m = re.exec(jwHtml)) !== null) all.push(m[1]);
    if (!all.length) return null;
    var qualified = all.filter(function (u) {
      return /_\d+p\.mp4$/i.test(u);
    });
    if (qualified.length) {
      qualified.sort(function (a, b) {
        var qa = parseInt((a.match(/_(\d+)p\.mp4$/i) || [])[1] || '0', 10);
        var qb = parseInt((b.match(/_(\d+)p\.mp4$/i) || [])[1] || '0', 10);
        return qb - qa;
      });
      return qualified[0];
    }
    return all[0];
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  return findSeries(titles)
    .then(function (seriesUrl) {
      if (!seriesUrl) return [];
      return getText(seriesUrl).then(function (seriesHtml) {
        if (!seriesHtml) return [];
        var videoUrl = pickEpisode(seriesHtml);
        if (!videoUrl) return [];
        return getText(videoUrl, origin).then(function (videoHtml) {
          if (!videoHtml) return [];
          var jwUrl = extractJwUrl(videoHtml);
          if (!jwUrl) return [];
          return getText(jwUrl, videoUrl).then(function (jwHtml) {
            if (!jwHtml) return [];
            var stream = pickBestSource(jwHtml);
            if (!stream) return [];
            return [
              {
                url: stream,
                name: 'WatchHentai',
                headers: {
                  'User-Agent': ua,
                  Referer: origin + '/',
                  Origin: origin,
                },
              },
            ];
          });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
