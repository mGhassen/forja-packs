var SPECS = {
  base: 'https://latanime.org',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ep = esAnimeEpisode(ctx);
  var titles = esAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  function search(query) {
    return esAnimeFetchText(
      ctx,
      base + '/buscar?q=' + encodeURIComponent(query),
      base + '/',
    ).then(function (html) {
      var hits = [];
      var seen = {};
      var re = /href=["'](https?:\/\/latanime\.org\/anime\/([^"'/?#]+))["']/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = decodeURIComponent(m[2] || '').trim();
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        hits.push({
          slug: slug,
          name: slug.replace(/-/g, ' '),
          url: m[1],
        });
      }
      return hits;
    });
  }

  function episodeUrl(slug) {
    // Series pages use /ver/{slug}-episodio-{n}
    return base + '/ver/' + slug + '-episodio-' + ep;
  }

  function scrapeServers(hit) {
    var epUrl = episodeUrl(hit.slug);
    return esAnimeFetchText(ctx, epUrl, hit.url || base + '/').then(function (html) {
      if (!html) return [];
      var meta = esAnimeLangMeta(
        hit.name + ' ' + hit.slug + ' ' + String(html).slice(0, 2500),
        esAnimeIsLatinoHit(hit) ? 'dub' : '',
      );
      var embeds = [];
      var re =
        /<a\b[^>]*class="[^"]*play-video[^"]*"[^>]*data-player=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var raw = m[1];
        var server = String(m[2] || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        var url = '';
        try {
          url = atob(raw);
        } catch (e) {
          url = '';
        }
        if (!/^https?:\/\//i.test(url)) continue;
        embeds.push({
          url: url,
          server: server || 'Server',
          meta: meta,
          referer: epUrl,
        });
      }
      return embeds;
    });
  }

  function collect(query) {
    return search(query).then(function (hits) {
      if (!hits.length) return [];
      var ranked = hits
        .map(function (h) {
          var score = 0;
          for (var i = 0; i < titles.length; i++) {
            score = Math.max(
              score,
              esAnimeScore(titles[i], h.name),
              esAnimeScore(titles[i], h.slug),
            );
          }
          if (esAnimeIsLatinoHit(h)) score += 8;
          return { hit: h, score: score };
        })
        .filter(function (x) {
          return x.score >= 24;
        })
        .sort(function (a, b) {
          return b.score - a.score;
        });
      var picked = [];
      var seen = {};
      ranked.forEach(function (x) {
        if (seen[x.hit.slug]) return;
        if (picked.length >= 4) return;
        seen[x.hit.slug] = true;
        picked.push(x.hit);
      });
      if (!picked.length) {
        var one = esAnimePick(hits, titles);
        if (one) picked.push(one);
      }
      return Promise.all(picked.map(scrapeServers)).then(function (groups) {
        return [].concat.apply([], groups);
      });
    });
  }

  var queries = titles.concat(esAnimeDubQueries(titles));
  var chain = Promise.resolve([]);
  queries.forEach(function (title) {
    chain = chain.then(function (acc) {
      if (acc.length) return acc;
      return collect(title).catch(function () {
        return [];
      });
    });
  });

  return chain
    .then(function (embeds) {
      return esAnimeHopAll(ctx, 'Latanime', embeds);
    })
    .catch(function () {
      return [];
    });
}
