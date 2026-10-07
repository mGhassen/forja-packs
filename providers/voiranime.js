var SPECS = {
  base: 'https://voiranime.rip',
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
        var re = /<a\s+href="\/([^"\/]+)\/"\s+class="va-search-result"[\s\S]*?va-search-result-title">([^<]*)<\/span>/gi;
        var m;
        while ((m = re.exec(html)) !== null) hits.push({ slug: m[1], names: [frAnimeDecodeEntities(m[2]).trim()] });
        return hits;
      });
  }

  function parseSeasons(html) {
    var seasons = [];
    var m = html.match(/"containsSeason":(\[[\s\S]*?\])\}<\/script>/);
    if (!m) return seasons;
    try {
      JSON.parse(m[1]).forEach(function (s) {
        var path = String(s.url || '').replace(/^https?:\/\/[^/]+/, '');
        if (path) seasons.push({ name: String(s.name || '').trim(), path: path, count: Number(s.numberOfEpisodes) || 0 });
      });
    } catch (e) {}
    return seasons;
  }

  function isExtra(name) {
    return /film|oav|ova|kai|special|sp[eé]cial|director/i.test(name);
  }

  function pickSeason(seasons) {
    if (isMovie) {
      // Only a single-film season maps unambiguously to one movie.
      return (
        seasons.find(function (s) {
          return /^films?$/i.test(s.name) && s.count === 1;
        }) || null
      );
    }
    var want = frAnimeWantedSeason(ctx);
    if (want === 1) {
      // Long runners split one numbering into sagas: "Saga 10 … [Episode 878 à 1088]".
      var saga = seasons.find(function (s) {
        var r = s.name.match(/episodes?\s*(\d+)\s*(?:à|a|-)\s*(\d+|\.\.\.)/i);
        return r && epNum >= Number(r[1]) && (r[2] === '...' || epNum <= Number(r[2]));
      });
      if (saga) return saga;
    }
    var exact = seasons.find(function (s) {
      var m = s.name.match(/^saison\s*(\d+)$/i);
      return m && Number(m[1]) === want;
    });
    if (exact) return exact;
    if (want !== 1) return null;
    // Long runners list one numbered run ("Avec Fillers") instead of "Saison 1".
    return (
      seasons.find(function (s) {
        return !isExtra(s.name) && !/^saison\s*\d+$/i.test(s.name);
      }) || null
    );
  }

  function findEpisodePath(seasonHtml, seasonPath) {
    var re = /<a\s+href="([^"]+\/episode-(\d+)\/[a-z]+\/)"\s+class="episode-card"/gi;
    var m;
    while ((m = re.exec(seasonHtml)) !== null) {
      if (Number(m[2]) === epNum && m[1].indexOf(seasonPath) === 0) return m[1];
    }
    return null;
  }

  function parseJson(html, re) {
    var m = html.match(re);
    if (!m) return null;
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      return null;
    }
  }

  // Standalone film pages: filmUrls = { vf, vostfr } or { single } with animeData.languages.
  function filmReaders(html) {
    var urls = parseJson(html, /const\s+filmUrls\s*=\s*(\{[\s\S]*?\});/);
    if (!urls) return null;
    var readers = {};
    Object.keys(urls).forEach(function (k) {
      var lang = k;
      if (k === 'single') {
        var langs = (html.match(/languages:\s*\[([^\]]*)\]/) || [])[1] || '';
        if (/"VF"/i.test(langs) && !/VOSTFR/i.test(langs)) lang = 'vf';
        else if (/VOSTFR/i.test(langs) && !/"VF"/i.test(langs)) lang = 'vostfr';
        else return;
      }
      if (urls[k]) readers[lang] = [urls[k]];
    });
    return readers;
  }

  function fromSeries(html) {
    var season = pickSeason(parseSeasons(html));
    if (!season) return Promise.resolve({});
    return fetchText(base + season.path).then(function (seasonHtml) {
      var epPath = findEpisodePath(seasonHtml, season.path);
      if (!epPath) return {};
      return fetchText(base + epPath).then(function (epHtml) {
        return parseJson(epHtml, /const\s+readers\s*=\s*(\{[\s\S]*?\});/) || {};
      });
    });
  }

  var titles = frAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  return frAnimeFindSlug(titles, search)
    .then(function (slug) {
      if (!slug) return [];
      return fetchText(base + '/' + slug + '/')
        .then(function (html) {
          var film = filmReaders(html);
          if (film) return isMovie ? film : {};
          return fromSeries(html);
        })
        .then(function (readers) {
          return frAnimeRows(ctx, 'VoirAnime', readers, base + '/');
        });
    })
    .catch(function () {
      return [];
    });
}
