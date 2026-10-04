var SPECS = {
  "base": "https://anidao.es",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = cfg.base.replace(/\/$/, '');
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var hdrs = { 'User-Agent': ua, Accept: 'text/html,*/*', Referer: base + '/' };
  var isTv = ctx.type !== 'movie';
  var epNum = isTv ? ctx.episode || 1 : 1;

  function fetchText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}) }).then(function (r) {
      return r.text();
    });
  }

  function fetchJson(url, extra) {
    return ctx
      .fetch(url, {
        headers: Object.assign({}, hdrs, extra || {}, {
          Accept: 'application/json,*/*',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      })
      .then(function (r) {
        return r.json();
      });
  }

  function decodeB64(s) {
    try {
      return atob(String(s || '').replace(/\s/g, ''));
    } catch (e) {
      return '';
    }
  }

  function slugFromWatchPath(path) {
    var m = String(path || '').match(/\/watch\/([^/?#]+)/i);
    return m ? m[1] : '';
  }

  function resolveTitle() {
    if (ctx.title) return Promise.resolve(String(ctx.title));
    var kind = isTv ? 'tv' : 'movie';
    return fetchJson(
      'https://tmdb.forjahq.xyz/3/' +
        kind +
        '/' +
        encodeURIComponent(String(ctx.tmdbId || '')) +
        '?api_key=' +
        encodeURIComponent(tmdbKey),
    ).then(function (d) {
      return d.name || d.title || '';
    });
  }

  function parseHits(html) {
    var results = [];
    var re =
      /href="(?:https?:\/\/[^"]+)?(\/watch\/([^"/?#]+))(?:\/ep-[\d.]+)?"[\s\S]{0,1200}?class="name d-title[^"]*"[^>]*>([^<]+)/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var slug = m[2];
      if (slug && !results.some(function (r) { return r.slug === slug; })) {
        results.push({ slug: slug, title: m[3].trim() });
      }
    }
    return results;
  }

  function search(query) {
    return fetchJson(
      base +
        '/wp-json/v1/aniwaves/search/suggestions?keyword=' +
        encodeURIComponent(query),
    ).then(function (data) {
      return parseHits((data && data.html) || '');
    });
  }

  function pickHit(hits, query) {
    var q = String(query || '').trim().toLowerCase();
    return (
      hits.find(function (h) {
        return String(h.title || '').trim().toLowerCase() === q;
      }) || hits[0]
    );
  }

  function episodes(slug) {
    return fetchText(base + '/watch/' + slug).then(function (html) {
      var eps = [];
      var re = /href="(?:https?:\/\/[^"]+)?\/watch\/[^"/]+\/ep-(\d+(?:\.\d+)?)"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var num = Number(m[1]);
        if (num > 0 && !eps.some(function (e) { return e.num === num; })) {
          eps.push({ num: num, href: base + '/watch/' + slug + '/ep-' + m[1] });
        }
      }
      return eps.sort(function (a, b) {
        return a.num - b.num;
      });
    });
  }

  function parseServers(html) {
    var out = [];
    var re =
      /data-server-name=["']([^"']+)["'][^>]*data-link-id=["']([^"']+)["']|data-link-id=["']([^"']+)["'][^>]*data-server-name=["']([^"']+)["']/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var name = m[1] || m[4] || 'Server';
      var id = m[2] || m[3] || '';
      if (id) out.push({ name: name, linkId: id });
    }
    if (out.length) return out;
    var re2 = /data-link-id=["']([^"']+)["']/gi;
    while ((m = re2.exec(html)) !== null) out.push({ name: 'Server', linkId: m[1] });
    return out;
  }

  function servers(watchUrl) {
    return fetchText(watchUrl).then(parseServers);
  }

  function playUrl(linkId) {
    var embed = /^https?:\/\//i.test(linkId) ? linkId : decodeB64(linkId);
    if (!embed) return '';
    var play = embed.match(/https?:\/\/(?:www\.)?(?:my\.)?1anime\.site\/play\/([a-f0-9]+)/i);
    if (play) return 'https://my.1anime.site/stream/' + play[1];
    return embed;
  }

  function resolveEmbed(s) {
    var url = playUrl(s.linkId);
    if (!url) return Promise.resolve([]);
    if (/1anime\.site\/stream\//i.test(url) || /\.m3u8|\.mp4/i.test(url)) {
      var referer = /1anime\.site/i.test(url) ? 'https://my.1anime.site/' : base + '/';
      return Promise.resolve([
        {
          url: url,
          name: 'AniDao ' + s.name,
          headers: { 'User-Agent': ua, Referer: referer },
        },
      ]);
    }
    return ctx.hop(url).then(function (rows) {
      return (rows || []).map(function (r) {
        return Object.assign({}, r, { name: r.name || 'AniDao ' + s.name });
      });
    });
  }

  return resolveTitle()
    .then(function (title) {
      if (!title) return [];
      return search(title).then(function (hits) {
        var hit = pickHit(hits, title);
        if (!hit) return [];
        return episodes(hit.slug).then(function (eps) {
          var watchUrl = base + '/watch/' + hit.slug;
          if (eps.length) {
            var ep =
              eps.find(function (e) {
                return e.num === Number(epNum);
              }) || eps[0];
            watchUrl = ep.href;
          }
          return servers(watchUrl).then(function (svs) {
            return Promise.all(svs.slice(0, 4).map(resolveEmbed)).then(function (groups) {
              return [].concat.apply([], groups);
            });
          });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
