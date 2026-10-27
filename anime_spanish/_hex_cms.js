// OtakusTV / VerAnimes / AnimeYT share the hex-encrypt player CMS.

function esHexCmsExtract(ctx, specs) {
  var cfg = Object.assign({}, specs, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var mirrors = Array.isArray(cfg.mirrors) && cfg.mirrors.length ? cfg.mirrors : [base];
  var backend = String(cfg.backend || '/backend');
  var brand = String(cfg.brand || 'Spanish');
  var ep = esAnimeEpisode(ctx);
  var titles = esAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  function withBase(origin, path) {
    if (/^https?:\/\//i.test(path)) return path;
    return String(origin).replace(/\/$/, '') + (path.indexOf('/') === 0 ? path : '/' + path);
  }

  function searchAt(origin, query) {
    var url =
      withBase(origin, cfg.searchPath || '/animes?buscar=') +
      encodeURIComponent(query);
    return esAnimeFetchText(ctx, url, origin + '/').then(function (html) {
      var hits = [];
      var seen = {};
      var re = /href=["']([^"']*\/anime\/([^"'/?#]+))["'][^>]*>([\s\S]*?)<\/a>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = decodeURIComponent(m[2] || '').trim();
        if (!slug || seen[slug] || /\.(webp|jpg|png|gif)$/i.test(slug)) continue;
        if (/episodio|episode/i.test(slug)) continue;
        var name = String(m[3] || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!name) name = slug.replace(/-/g, ' ');
        seen[slug] = true;
        hits.push({ slug: slug, name: name, origin: origin });
      }
      if (!hits.length) {
        var re2 = /(?:href=["']|\.\/)anime\/([a-z0-9-]+)/gi;
        while ((m = re2.exec(html)) !== null) {
          var s2 = m[1];
          if (!s2 || seen[s2] || /episodio/i.test(s2)) continue;
          seen[s2] = true;
          hits.push({ slug: s2, name: s2.replace(/-/g, ' '), origin: origin });
        }
      }
      return hits;
    });
  }

  function searchAll(query) {
    var chain = Promise.resolve([]);
    mirrors.forEach(function (origin) {
      chain = chain.then(function (acc) {
        if (acc.length) return acc;
        return searchAt(String(origin).replace(/\/$/, ''), query).catch(function () {
          return [];
        });
      });
    });
    return chain;
  }

  function episodeUrl(hit) {
    var origin = hit.origin || base;
    var path;
    if (cfg.episodeStyle === 'animeyt') {
      path = '/anime/' + hit.slug + '-episodio-' + ep;
    } else {
      path = '/ver/' + hit.slug + '-' + ep;
    }
    return withBase(origin, path);
  }

  function loadServers(hit) {
    var origin = String(hit.origin || base).replace(/\/$/, '');
    var epUrl = episodeUrl(hit);
    var meta = esAnimeLangMeta(
      hit.name + ' ' + hit.slug,
      cfg.forceLang || (esAnimeIsLatinoHit(hit) ? 'dub' : ''),
    );
    return esAnimeFetchText(ctx, epUrl, origin + '/').then(function (html) {
      if (!html) return [];
      // Re-tag from episode page copy (Sub Español vs Latino) when slug was ambiguous.
      var pageMeta = esAnimeLangMeta(
        hit.name + ' ' + hit.slug + ' ' + String(html).slice(0, 2500),
        cfg.forceLang || (esAnimeIsLatinoHit(hit) ? 'dub' : ''),
      );
      var enc =
        (html.match(/class="opt"[^>]*data-encrypt=["']([0-9a-f]+)["']/i) ||
          html.match(/data-encrypt=["']([0-9a-f]+)["']/i) ||
          [])[1] || '';
      if (!enc) {
        // Build encrypt from data-i on series shortcuts when present on ep page.
        var id = (html.match(/data-i=["'](\d+)["']/i) || [])[1];
        if (id) enc = esAnimeA2hex(id + '-' + ep);
      }
      if (!enc) return [];
      return esAnimePostForm(
        ctx,
        withBase(origin, backend),
        'acc=opt&i=' + encodeURIComponent(enc),
        epUrl,
      ).then(function (optHtml) {
        return esAnimeParseOptHtml(optHtml).map(function (s) {
          return {
            url: s.url,
            server: s.server,
            meta: pageMeta,
            referer: epUrl,
          };
        });
      });
    });
  }

  function collectForQuery(query) {
    return searchAll(query).then(function (hits) {
      if (!hits.length) return [];
      // Rank against every title candidate so cour seasons match (kashin vs soukoku).
      // ES chip includes Sub ES + Latino — prefer latino siblings when present.
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
      if (!ranked.length) {
        var one = esAnimePick(hits, titles);
        ranked = one ? [{ hit: one, score: 1 }] : [];
      }
      var picked = [];
      var seenSlug = {};
      ranked.forEach(function (x) {
        if (seenSlug[x.hit.slug]) return;
        var isLangVariant = esAnimeIsLatinoHit(x.hit);
        if (picked.length && !isLangVariant && x.score < ranked[0].score) return;
        seenSlug[x.hit.slug] = true;
        picked.push(x.hit);
      });
      if (!picked.length && ranked[0]) picked.push(ranked[0].hit);
      return Promise.all(picked.slice(0, 4).map(loadServers)).then(function (groups) {
        return [].concat.apply([], groups);
      });
    });
  }

  // Always fan out latino search queries so dub variants land under the same ES chip.
  var queries = titles.concat(esAnimeDubQueries(titles));
  var chain = Promise.resolve([]);
  queries.forEach(function (title) {
    chain = chain.then(function (acc) {
      if (acc.length) return acc;
      return collectForQuery(title).catch(function () {
        return [];
      });
    });
  });

  return chain
    .then(function (embeds) {
      return esAnimeHopAll(ctx, brand, embeds);
    })
    .catch(function () {
      return [];
    });
}
