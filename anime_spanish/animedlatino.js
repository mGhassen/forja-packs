var SPECS = {
  base: 'https://animedlatino.com',
  // Whole site is Latino dub — tag dub:lat for the hub filter.
  forceLang: 'lat',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ep = esAnimeEpisode(ctx);
  var season = Number(ctx.season) || 1;
  var absEp = Number(ctx.mappedEpisode || ctx.absoluteEpisode || 0) || 0;
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
      var re =
        /data-slug=["']([^"']+)["'][\s\S]{0,500}?href=["'](https?:\/\/animedlatino\.com\/(?:serie|pelicula)\/[^"']+)["'][^>]*title=["']([^"']+)["']/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = m[1];
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        hits.push({ slug: slug, url: m[2], name: m[3] || slug.replace(/-/g, ' ') });
      }
      if (!hits.length) {
        var re2 =
          /href=["'](https?:\/\/animedlatino\.com\/(?:serie|pelicula)\/([^"'/?#]+))["'][^>]*title=["']([^"']+)["']/gi;
        while ((m = re2.exec(html)) !== null) {
          var s2 = m[2];
          if (!s2 || seen[s2]) continue;
          seen[s2] = true;
          hits.push({ slug: s2, url: m[1], name: m[3] || s2.replace(/-/g, ' ') });
        }
      }
      return hits;
    });
  }

  function pickHit(hits) {
    if (!hits || !hits.length) return null;
    // Prefer TV / main series over OVA / movie / film when titles collide.
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
        var blob = String(h.slug + ' ' + h.name).toLowerCase();
        if (/\b(ova|oav|movie|pelicula|film|especial)\b/.test(blob)) score -= 25;
        if (/\(tv\)|-tv\b/.test(blob)) score += 12;
        return { hit: h, score: score };
      })
      .filter(function (x) {
        return x.score >= 24;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    if (ranked.length) return ranked[0].hit;
    return esAnimePick(hits, titles);
  }

  function episodeKeys() {
    var keys = [];
    function add(k) {
      if (!k || keys.indexOf(k) >= 0) return;
      keys.push(k);
    }
    add(season + 'x' + ep);
    if (absEp > 0) add('1x' + absEp);
    // Site catalogs many multi-cour shows as a single temporada 1xN run.
    if (season > 1) add('1x' + ep);
    if (season !== 1 || absEp !== ep) add('1x' + ep);
    return keys;
  }

  function loadEpisode(hit, key) {
    var url = base + '/ver/' + hit.slug + '/' + key;
    return esAnimeFetchText(ctx, url, hit.url || base + '/').then(function (html) {
      html = html || '';
      var ok =
        html.length > 8000 &&
        /data-url=["'][^"']*reproducir\?e=/i.test(html) &&
        !/Error 404/i.test(html);
      return ok ? { url: url, html: html } : null;
    });
  }

  function episodePage(hit) {
    var keys = episodeKeys();
    var chain = Promise.resolve(null);
    keys.forEach(function (key) {
      chain = chain.then(function (acc) {
        if (acc) return acc;
        return loadEpisode(hit, key).catch(function () {
          return null;
        });
      });
    });
    return chain.then(function (page) {
      return page || { url: '', html: '' };
    });
  }

  function resolveProxy(proxy, referer) {
    // Engine fetch always follows redirects; final URL lands on r.url.
    return ctx
      .fetch(proxy, {
        headers: {
          'User-Agent': ES_ANIME_UA,
          Referer: referer || proxy,
          Accept: 'text/html,*/*',
        },
      })
      .then(function (r) {
        if (!r) return '';
        var finalUrl = r.url ? String(r.url) : '';
        if (finalUrl && finalUrl !== proxy && /^https?:\/\//i.test(finalUrl)) {
          return finalUrl;
        }
        return esAnimeFollowRedirect(ctx, proxy, referer);
      })
      .catch(function () {
        return '';
      });
  }

  function scrapeServers(page) {
    if (!page || !page.html) return Promise.resolve([]);
    var embeds = [];
    var seen = {};
    var reBtn =
      /data-url=["'](https?:\/\/animedlatino\.com\/reproducir\?e=\d+)["'][^>]*data-servidor=["']([^"']+)["']|data-servidor=["']([^"']+)["'][^>]*data-url=["'](https?:\/\/animedlatino\.com\/reproducir\?e=\d+)["']/gi;
    var m;
    while ((m = reBtn.exec(page.html)) !== null) {
      var proxy = m[1] || m[4] || '';
      var server = String(m[2] || m[3] || '').trim();
      if (!proxy || seen[proxy]) continue;
      seen[proxy] = true;
      embeds.push({ proxy: proxy, server: server || 'Server' });
    }
    if (!embeds.length) {
      var re2 = /data-url=["'](https?:\/\/animedlatino\.com\/reproducir\?e=\d+)["']/gi;
      var i = 0;
      while ((m = re2.exec(page.html)) !== null) {
        if (seen[m[1]]) continue;
        seen[m[1]] = true;
        i += 1;
        embeds.push({ proxy: m[1], server: 'Server ' + i });
      }
    }
    var pageMeta = esAnimeLangMeta(page.html.slice(0, 2000), cfg.forceLang || 'dub');
    return Promise.all(
      embeds.map(function (e) {
        return resolveProxy(e.proxy, page.url).then(function (finalUrl) {
          if (!/^https?:\/\//i.test(finalUrl)) return null;
          // Skip dead tioanime / hqq shells that AnimedLatino still lists.
          if (/tioanime\.com\/embed|hqq\.tv\//i.test(finalUrl)) return null;
          return {
            url: finalUrl,
            server: e.server || 'Server',
            meta: pageMeta,
            referer: page.url,
          };
        });
      }),
    ).then(function (rows) {
      return rows.filter(Boolean);
    });
  }

  function collect(query) {
    return search(query).then(function (hits) {
      var hit = pickHit(hits);
      if (!hit) return [];
      var meta = esAnimeLangMeta(hit.name + ' ' + hit.slug, cfg.forceLang || 'dub');
      return episodePage(hit).then(function (page) {
        return scrapeServers(page).then(function (embeds) {
          return embeds.map(function (e) {
            return Object.assign({}, e, { meta: meta });
          });
        });
      });
    });
  }

  var chain = Promise.resolve([]);
  titles.forEach(function (title) {
    chain = chain.then(function (acc) {
      if (acc.length) return acc;
      return collect(title).catch(function () {
        return [];
      });
    });
  });

  return chain
    .then(function (embeds) {
      return esAnimeHopAll(ctx, 'AnimedLatino', embeds);
    })
    .catch(function () {
      return [];
    });
}
