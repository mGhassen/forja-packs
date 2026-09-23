var SPECS = {
  base: 'https://123animehub.cc',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var season = ctx.season != null ? Number(ctx.season) : null;

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

  function getJson(url, extra) {
    return ctx
      .fetch(url, {
        headers: Object.assign(
          {
            'User-Agent': ua,
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: base + '/',
          },
          extra || {},
        ),
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      });
  }

  function getText(url, extra) {
    return ctx
      .fetch(url, { headers: Object.assign({ 'User-Agent': ua }, extra || {}) })
      .then(function (r) {
        if (!r.ok) return '';
        return r.text().then(function (text) {
          return { text: text, headers: r.headers };
        });
      });
  }

  function searchSlugs(titles) {
    var chain = Promise.resolve([]);
    titles.forEach(function (title) {
      chain = chain.then(function (acc) {
        if (acc.length) return acc;
        var clean = String(title)
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!clean) return acc;
        var url =
          base +
          '/ajax/film/search?keyword=' +
          encodeURIComponent(clean) +
          '&_=' +
          Date.now();
        return getJson(url).then(function (data) {
          if (!data || !data.html) return acc;
          var slugs = [];
          var re = /href="\/anime\/([^"]+)"/g;
          var m;
          while ((m = re.exec(String(data.html))) !== null) {
            if (m[1] && slugs.indexOf(m[1]) < 0) slugs.push(m[1]);
          }
          return slugs;
        });
      });
    });
    return chain;
  }

  function findEmbed(slugs) {
    var chain = Promise.resolve(null);
    slugs.forEach(function (slug) {
      chain = chain.then(function (found) {
        if (found) return found;
        var epr = season != null ? slug + '/' + season + '/' + ep : slug + '/' + ep;
        var url =
          base +
          '/ajax/episode/info?epr=' +
          encodeURIComponent(epr) +
          '&ts=1&_=' +
          Date.now();
        return getJson(url, { Referer: base + '/anime/' + slug }).then(function (data) {
          return data && data.target ? String(data.target) : null;
        });
      });
    });
    return chain;
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  return searchSlugs(titles)
    .then(function (slugs) {
      if (!slugs.length) return [];
      return findEmbed(slugs).then(function (targetEmbed) {
        if (!targetEmbed) return [];
        var embedMatch = targetEmbed.match(/\/embed-[^/]+\/([A-Za-z0-9+/=]+)$/);
        if (!embedMatch) return [];
        var sourceId = embedMatch[1];
        var origin;
        try {
          origin = new URL(targetEmbed).origin;
        } catch (e) {
          return [];
        }
        return getText(targetEmbed).then(function (embedRes) {
          if (!embedRes || !embedRes.text) return [];
          var reqHeaders = {
            Referer: targetEmbed,
            Accept: '*/*',
            'User-Agent': ua,
          };
          var setCookie =
            (embedRes.headers &&
              (embedRes.headers.get('set-cookie') || embedRes.headers.get('Set-Cookie'))) ||
            '';
          if (setCookie) reqHeaders.Cookie = String(setCookie).split(';')[0].trim();
          return ctx
            .fetch(origin + '/hs/getSources?id=' + encodeURIComponent(sourceId), {
              headers: reqHeaders,
            })
            .then(function (r) {
              if (!r.ok) return [];
              return r.json();
            })
            .then(function (srcData) {
              if (!srcData) return [];
              var streamUrl = '';
              if (typeof srcData.sources === 'string' && srcData.sources) {
                streamUrl = srcData.sources;
              } else if (Array.isArray(srcData.sources) && srcData.sources.length) {
                var first = srcData.sources[0];
                streamUrl = (first && (first.file || first.src || first.url)) || '';
              }
              if (!streamUrl) return [];
              return [
                {
                  url: streamUrl,
                  name: '123Anime (EchoVideo)',
                  quality: '1080p',
                  headers: {
                    Referer: 'https://play2.echovideo.ru/',
                    Origin: 'https://play2.echovideo.ru',
                    'User-Agent': ua,
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
