var SPECS = {
  site: 'https://hentaini.com',
  api: 'https://admin.hentaini.com/api',
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
  var site = String(cfg.site || '').replace(/\/$/, '');
  var api = String(cfg.api || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
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

  function getJson(url) {
    return ctx
      .fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: site + '/',
        },
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      });
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
    [/\s*[:\-~–—].+$/, /\s*\(.+?\)\s*/, /\s*\[.+?\]\s*/, /\s+the\s+animation\b/i].forEach(
      function (pat) {
        var stripped = t.replace(pat, '').trim();
        if (stripped.length >= 3) out[stripped] = 1;
      },
    );
    var words = t.split(/\s+/);
    if (words.length > 3) out[words.slice(0, 3).join(' ')] = 1;
    return Object.keys(out);
  }

  function searchSeries(query) {
    var url =
      api +
      '/series?filters[title][$containsi]=' +
      encodeURIComponent(query) +
      '&pagination[pageSize]=25';
    return getJson(url).then(function (doc) {
      var list = (doc && doc.data) || [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (!item) continue;
        var id = item.id;
        var attr = item.attributes || item;
        var title = String(attr.title || '');
        var titleEng = String(attr.title_english || '');
        var slug = String(attr.url || attr.slug || '');
        if (id != null && title) out.push({ id: id, title: title, titleEnglish: titleEng, url: slug });
      }
      return out;
    });
  }

  function resolveSeries(titles) {
    var hits = {};
    var chain = Promise.resolve();
    titles.forEach(function (raw) {
      titleVariants(raw).forEach(function (q) {
        chain = chain.then(function () {
          if (Object.keys(hits).length) return;
          if (!q) return;
          return searchSeries(q).then(function (list) {
            (list || []).forEach(function (s) {
              if (!hits[s.id]) hits[s.id] = s;
            });
          });
        });
      });
    });
    return chain.then(function () {
      var ids = Object.keys(hits);
      if (!ids.length) return null;
      var querySets = titles.map(tokenSet);
      var best = null;
      var bestScore = 0;
      ids.forEach(function (id) {
        var s = hits[id];
        var combined = Object.assign({}, tokenSet(s.title), tokenSet(s.titleEnglish));
        var cKeys = Object.keys(combined);
        if (!cKeys.length) return;
        querySets.forEach(function (q) {
          var qKeys = Object.keys(q);
          if (!qKeys.length) return;
          var inter = 0;
          qKeys.forEach(function (k) {
            if (combined[k]) inter++;
          });
          var unionKeys = {};
          cKeys.forEach(function (k) {
            unionKeys[k] = 1;
          });
          qKeys.forEach(function (k) {
            unionKeys[k] = 1;
          });
          var union = Object.keys(unionKeys).length;
          var jaccard = union === 0 ? 0 : inter / union;
          if (jaccard > bestScore) {
            bestScore = jaccard;
            best = s;
          }
        });
      });
      if (bestScore < 0.45 || !best) return null;
      return best;
    });
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  return resolveSeries(titles)
    .then(function (series) {
      if (!series) return [];
      return getJson(api + '/series/' + series.id + '?populate=episodes').then(function (doc) {
        if (!doc) return [];
        var data = doc.data || {};
        var attr = data.attributes || data;
        var epContainer = attr.episodes;
        var epList =
          epContainer && epContainer.data
            ? epContainer.data
            : Array.isArray(epContainer)
              ? epContainer
              : [];
        var targetEp = null;
        for (var i = 0; i < epList.length; i++) {
          var epItem = epList[i];
          if (!epItem) continue;
          var epAttr = epItem.attributes || epItem;
          var epNum = Number(epAttr.episode_number);
          if (epNum === ep) {
            targetEp = epAttr;
            break;
          }
        }
        if (!targetEp && epList.length && ep <= epList.length) {
          var fallback = epList[ep - 1];
          if (fallback) targetEp = fallback.attributes || fallback;
        }
        if (!targetEp) return [];

        var players = [];
        var rawPlayers = targetEp.players;
        if (typeof rawPlayers === 'string') {
          try {
            players = JSON.parse(rawPlayers) || [];
          } catch (e) {
            players = [];
          }
        } else if (Array.isArray(rawPlayers)) {
          players = rawPlayers;
        }

        var hlsUrl = '';
        var mp4Url = '';
        for (var p = 0; p < players.length; p++) {
          var row = players[p];
          if (!row) continue;
          var file = String(row.file || row.url || row.link || '');
          if (!file) continue;
          if (file.indexOf('.m3u8') >= 0 && !hlsUrl) hlsUrl = file;
          else if (file.indexOf('.mp4') >= 0 && !mp4Url) mp4Url = file;
        }
        var streamUrl = hlsUrl || mp4Url;
        if (!streamUrl) return [];
        return [
          {
            url: streamUrl,
            name: 'Hentaini',
            headers: {
              'User-Agent': ua,
              Referer: site + '/',
              Origin: site,
            },
          },
        ];
      });
    })
    .catch(function () {
      return [];
    });
}
