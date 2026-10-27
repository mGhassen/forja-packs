var SPECS = {
  base: 'https://tvanime.tv',
  mirrors: ['https://tvanime.tv', 'https://animev1.com'],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var mirrors = Array.isArray(cfg.mirrors) && cfg.mirrors.length ? cfg.mirrors : [base];
  var ep = esAnimeEpisode(ctx);
  var titles = esAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  function searchAt(origin, query) {
    return esAnimeFetchText(
      ctx,
      origin + '/directorio?q=' + encodeURIComponent(query),
      origin + '/',
    ).then(function (html) {
      var hits = [];
      var seen = {};
      var re = /href=["']((?:https?:\/\/[^"']+)?\/anime\/([^"'/?#]+))["']/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = decodeURIComponent(m[2] || '').trim();
        if (!slug || seen[slug] || /episodio/i.test(slug)) continue;
        seen[slug] = true;
        var url = m[1];
        if (url.indexOf('http') !== 0) url = origin + url;
        hits.push({ slug: slug, name: slug.replace(/-/g, ' '), url: url, origin: origin });
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

  function scrape(hit) {
    var origin = String(hit.origin || base).replace(/\/$/, '');
    var epUrl = origin + '/anime/' + hit.slug + '/episodio/episodio-' + ep;
    return esAnimeFetchText(ctx, epUrl, hit.url || origin + '/').then(function (html) {
      if (!html) return [];
      var meta = esAnimeLangMeta(
        hit.name + ' ' + hit.slug + ' ' + String(html).slice(0, 2500),
      );
      var embeds = [];
      var seen = {};
      var re = /data-server-url=["']([^"']+)["']/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var url = m[1];
        if (!/^https?:\/\//i.test(url) || seen[url]) continue;
        seen[url] = true;
        var host = '';
        try {
          host = new URL(url).hostname.replace(/^www\./, '');
        } catch (e) {
          host = 'Server';
        }
        embeds.push({
          url: url,
          server: host,
          meta: meta,
          referer: epUrl,
        });
      }
      // Fallback: known embed hosts in page.
      if (!embeds.length) {
        var re2 =
          /https?:\/\/(?:www\.)?(?:mega\.nz|voe\.sx|mp4upload\.com|filemoon\.[a-z]+|uqload\.[a-z]+)[^"'\\\s<>]+/gi;
        while ((m = re2.exec(html)) !== null) {
          if (seen[m[0]]) continue;
          seen[m[0]] = true;
          embeds.push({ url: m[0], server: 'Embed', meta: meta, referer: epUrl });
        }
      }
      return embeds;
    });
  }

  function collect(query) {
    return searchAll(query).then(function (hits) {
      var hit = esAnimePick(hits, titles);
      if (!hit) return [];
      return scrape(hit);
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
      return esAnimeHopAll(ctx, 'AnimeV1', embeds);
    })
    .catch(function () {
      return [];
    });
}
