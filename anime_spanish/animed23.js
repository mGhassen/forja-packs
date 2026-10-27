var SPECS = {
  base: 'https://animed23.com',
  containerOrigin: 'https://animed23.online',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var containerOrigin = String(cfg.containerOrigin || 'https://animed23.online').replace(
    /\/$/,
    '',
  );
  var ep = esAnimeEpisode(ctx);
  var season = Number(ctx.season) || 1;
  var titles = esAnimeTitles(ctx);
  if (!titles.length) return Promise.resolve([]);

  function langMeta(code) {
    var c = String(code || '').toUpperCase();
    if (c === 'LAT') return { language: 'dub', tag: '(DUB)', label: 'Latino' };
    if (c === 'CAST' || c === 'CAT') {
      return { language: 'dub', tag: '(DUB)', label: c === 'CAT' ? 'Catalán' : 'Castellano' };
    }
    return { language: 'sub', tag: '(SUB)', label: 'Sub ES' };
  }

  function search(query) {
    return esAnimeFetchText(
      ctx,
      base + '/?s=' + encodeURIComponent(query),
      base + '/',
    ).then(function (html) {
      var hits = [];
      var seen = {};
      var re = /href=["'](https?:\/\/animed23\.com\/anime\/([^"'/?#]+)\/?)["']/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slug = decodeURIComponent(m[2] || '').trim();
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        hits.push({ slug: slug, name: slug.replace(/-/g, ' '), url: m[1] });
      }
      return hits;
    });
  }

  function pickHit(hits) {
    if (!hits || !hits.length) return null;
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
        var slug = String(h.slug || '').toLowerCase();
        var m = slug.match(/temporada-(\d+)/);
        if (m) {
          var sn = Number(m[1]);
          if (sn === season) score += 40;
          else score -= 20;
        } else if (season === 1) {
          score += 8;
        } else {
          score -= 10;
        }
        if (/\b(ova|oav|movie|pelicula|film)\b/.test(slug)) score -= 25;
        return { hit: h, score: score };
      })
      .filter(function (x) {
        return x.score >= 24;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    return ranked.length ? ranked[0].hit : esAnimePick(hits, titles);
  }

  function chapterHtml(slug) {
    var url = base + '/capitulo/' + slug + '-ep-' + ep + '/';
    return esAnimeFetchText(ctx, url, base + '/').then(function (html) {
      return { url: url, html: html || '' };
    });
  }

  function containerId(html) {
    var m =
      html.match(/animed23\.online\/container\.php\?id=([A-Za-z0-9_-]+)/i) ||
      html.match(/\b(D23-[A-F0-9]+)\b/i) ||
      html.match(/data-container=["']([^"']+)["']/i);
    return m ? m[1] : '';
  }

  function parseLangOptions(html) {
    var langs = [];
    var seen = {};
    var re =
      /container\.php\?id=[^"'>\s]+[?&]lang=([A-Za-z]+)|d23-language-option[^>]*>\s*<span>\s*([A-Za-z]+)/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var code = String(m[1] || m[2] || '')
        .toUpperCase()
        .trim();
      if (!code || seen[code]) continue;
      seen[code] = true;
      langs.push(code);
    }
    return langs.length ? langs : ['SUB', 'LAT', 'CAST'];
  }

  function parsePlayerTabs(html, meta) {
    var out = [];
    var seen = {};
    var re = /<[^>]+data-player-url=["']([^"']+)["'][^>]*>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var tag = m[0];
      var url = String(m[1] || '').trim();
      if (!url || seen[url]) continue;
      // Skip download-only / dead mega shells — hop or direct play only.
      if (/mediafire\.com|fireload\.com|terabox\.com|gofile\.io/i.test(url)) continue;
      seen[url] = true;
      var label =
        (tag.match(/data-player-label=["']([^"']+)["']/i) || [])[1] ||
        (tag.match(/title=["']([^"']+)["']/i) || [])[1] ||
        'Server';
      var kind = (tag.match(/data-player-kind=["']([^"']+)["']/i) || [])[1] || '';
      out.push({
        url: url,
        server: String(label).trim() + (kind === 'video' ? ' · Direct' : ''),
        meta: meta,
      });
    }
    return out;
  }

  function loadLang(container, code, referer) {
    var meta = langMeta(code);
    var url =
      containerOrigin +
      '/container.php?id=' +
      encodeURIComponent(container) +
      '&open=1&lang=' +
      encodeURIComponent(code);
    return esAnimeFetchText(ctx, url, referer || containerOrigin + '/').then(function (html) {
      if (!html || /is-language-select|Selecciona el idioma/i.test(html)) return [];
      return parsePlayerTabs(html, meta);
    });
  }

  function scrape(hit) {
    return chapterHtml(hit.slug).then(function (page) {
      if (!page.html || /página no encontrada|page not found/i.test(page.html)) {
        return [];
      }
      // Soft redirects to a different episode number → reject.
      var titleEp = (page.html.match(/ep\.\s*(\d+)/i) || [])[1];
      if (titleEp && Number(titleEp) !== ep) return [];
      var id = containerId(page.html);
      if (!id) return [];
      // Discover available langs from the language-select shell.
      return esAnimeFetchText(
        ctx,
        containerOrigin +
          '/container.php?id=' +
          encodeURIComponent(id) +
          '&open=1',
        page.url,
      ).then(function (langHtml) {
        var langs = parseLangOptions(langHtml || '');
        return Promise.all(
          langs.map(function (code) {
            return loadLang(id, code, page.url).catch(function () {
              return [];
            });
          }),
        ).then(function (groups) {
          return [].concat.apply([], groups);
        });
      });
    });
  }

  function collect(query) {
    return search(query).then(function (hits) {
      var hit = pickHit(hits);
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
      return esAnimeHopAll(ctx, 'AnimeD23', embeds);
    })
    .catch(function () {
      return [];
    });
}
