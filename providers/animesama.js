var SPECS = {
  base: 'https://anime-sama.to',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var isMovie = ctx.type === 'movie';
  var epNum = frAnimeEpisode(ctx);

  function fetchText(url) {
    return frAnimeFetchText(ctx, url, base + '/');
  }

  function search(query) {
    return ctx
      .fetch(base + '/template-php/defaut/fetch.php', {
        method: 'POST',
        headers: {
          'User-Agent': FR_ANIME_UA,
          Referer: base + '/',
          Origin: base,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: 'query=' + encodeURIComponent(query),
      })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        var hits = [];
        var re = /<a\s+href="[^"]*\/catalogue\/([^"\/]+)\/?"[\s\S]*?search-result-title">([^<]*)<\/h3>(?:\s*<p[^>]*search-result-subtitle">([^<]*)<\/p>)?/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
          var names = [frAnimeDecodeEntities(m[2]).trim()];
          frAnimeDecodeEntities(m[3] || '')
            .split(',')
            .forEach(function (n) {
              if (n.trim()) names.push(n.trim());
            });
          hits.push({ slug: m[1], names: names });
        }
        return hits;
      });
  }

  // panneauAnime("Saison 1", "saison1/vostfr") — skip the commented template line.
  function parsePanels(html) {
    var panels = [];
    var clean = html.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    var re = /panneauAnime\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
    var m;
    while ((m = re.exec(clean)) !== null) {
      if (m[1] === 'nom') continue;
      var dir = m[2].replace(/\/[^/]*$/, '');
      // Long runners split one numbering into sagas: "Saga 10 … [Episode 878 à 1088]".
      var range = m[1].match(/episodes?\s*(\d+)\s*(?:à|a|-)\s*(\d+|\.\.\.)/i);
      panels.push({
        name: m[1].trim(),
        dir: dir,
        from: range ? Number(range[1]) : 0,
        to: range ? (range[2] === '...' ? Infinity : Number(range[2])) : 0,
      });
    }
    return panels;
  }

  function isExtra(name) {
    return /film|oav|ova|kai|special|sp[eé]cial|director/i.test(name);
  }

  function pickPanel(panels) {
    if (isMovie) {
      return (
        panels.find(function (p) {
          return /^films?$/i.test(p.name);
        }) || null
      );
    }
    var want = frAnimeWantedSeason(ctx);
    if (want === 1) {
      var saga = panels.find(function (p) {
        return p.from && epNum >= p.from && epNum <= p.to;
      });
      if (saga) return saga;
    }
    var exact = panels.find(function (p) {
      return p.dir === 'saison' + want;
    });
    if (exact) return exact;
    if (want !== 1) return null;
    // Long runners list one numbered run ("Avec Fillers") instead of "Saison 1".
    return (
      panels.find(function (p) {
        return !isExtra(p.name);
      }) || null
    );
  }

  // episodes.js: var eps1 = [...]; var eps2 = [...]; — one array per player, index = episode - 1.
  function parseEpisodes(js) {
    var players = [];
    var re = /var\s+eps\d+\s*=\s*\[([\s\S]*?)\]\s*;/g;
    var m;
    while ((m = re.exec(js)) !== null) {
      var urls = [];
      var ur = /['"]([^'"]*)['"]/g;
      var u;
      while ((u = ur.exec(m[1])) !== null) urls.push(u[1].trim());
      players.push(urls);
    }
    return players;
  }

  function readersFor(slug, panel, lang) {
    return fetchText(base + '/catalogue/' + slug + '/' + panel.dir + '/' + lang + '/episodes.js')
      .then(function (js) {
        if (!/var\s+eps\d+/.test(js)) return [];
        var players = parseEpisodes(js);
        // Film panels can hold several films; only a single film maps unambiguously.
        if (isMovie && players.some(function (p) {
          return p.length !== 1;
        })) return [];
        return players
          .map(function (p) {
            return p[panel.from ? epNum - panel.from : epNum - 1] || '';
          })
          .filter(Boolean);
      })
      .catch(function () {
        return [];
      });
  }

  var titles = frAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  return frAnimeFindSlug(titles, search)
    .then(function (slug) {
      if (!slug) return [];
      return fetchText(base + '/catalogue/' + slug + '/').then(function (html) {
        var panel = pickPanel(parsePanels(html));
        if (!panel) return [];
        return Promise.all([readersFor(slug, panel, 'vf'), readersFor(slug, panel, 'vostfr')]).then(function (r) {
          return frAnimeRows(ctx, 'Anime-Sama', { vf: r[0], vostfr: r[1] }, base + '/');
        });
      });
    })
    .catch(function () {
      return [];
    });
}
