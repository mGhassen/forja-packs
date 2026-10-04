var SPECS = {
  "base": "https://anineko.cc",
  "mapApi": "https://id-mapping-api-malid.hf.space/api/resolve",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49",
  "jikan": "https://api.jikan.moe/v4/anime"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = cfg.base.replace(/\/$/, '');
  var mapApi = cfg.mapApi;
  var jikan = cfg.jikan;
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var hdrs = { 'User-Agent': ua, Referer: base + '/', Accept: 'text/html,application/xhtml+xml' };
  var isTv = ctx.type !== 'movie';

  function fetchText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}) }).then(function (r) {
      return r.text();
    });
  }

  function fetchJson(url) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, { Accept: 'application/json' }) }).then(function (r) {
      return r.json();
    });
  }

  function normalize(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  function decodeEntities(s) {
    return String(s || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function absUrl(u, origin) {
    u = decodeEntities(String(u || '').trim());
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('/') === 0) return String(origin || base).replace(/\/$/, '') + u;
    return u;
  }

  function b64Decode(s) {
    try {
      return decodeURIComponent(escape(atob(String(s || '').replace(/\s/g, ''))));
    } catch (e) {
      try {
        return atob(String(s || ''));
      } catch (e2) {
        return '';
      }
    }
  }

  function originOf(u) {
    try {
      return new URL(u).origin;
    } catch (e) {
      return base;
    }
  }

  function titleAndMapping() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost) {
      return fetchJson(jikan + '/' + fromHost.malId)
        .then(function (j) {
          return {
            title: (j && j.data && j.data.title) || fromHost.title || ctx.title || '',
            mappedEp: fromHost.mappedEp,
          };
        })
        .catch(function () {
          return {
            title: fromHost.title || ctx.title || '',
            mappedEp: fromHost.mappedEp,
          };
        });
    }
    if (!isTv) {
      return fetchJson(
        'https://tmdb.forjahq.xyz/3/movie/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
      ).then(function (d) {
        return { title: d.title || d.original_title || '', mappedEp: 1 };
      });
    }
    var imdbP = ctx.imdbId
      ? Promise.resolve(String(ctx.imdbId))
      : fetchJson(
          'https://tmdb.forjahq.xyz/3/tv/' +
            encodeURIComponent(String(ctx.tmdbId || '')) +
            '/external_ids?api_key=' +
            encodeURIComponent(tmdbKey),
        )
          .then(function (d) {
            return (d && d.imdb_id) || '';
          })
          .catch(function () {
            return '';
          });
    return imdbP.then(function (imdbId) {
      if (!imdbId) return { title: '', mappedEp: ctx.episode || 1 };
      return fetchJson(
        mapApi +
          '?id=' +
          encodeURIComponent(imdbId) +
          '&s=' +
          encodeURIComponent(String(ctx.season || 1)) +
          '&e=' +
          encodeURIComponent(String(ctx.episode || 1)),
      )
        .then(function (mapping) {
          if (!mapping || !mapping.mal_id) return { title: '', mappedEp: ctx.episode || 1 };
          return fetchJson(jikan + '/' + mapping.mal_id).then(function (j) {
            return {
              title: (j && j.data && j.data.title) || '',
              mappedEp: mapping.mal_episode || ctx.episode || 1,
            };
          });
        })
        .catch(function () {
          return { title: '', mappedEp: ctx.episode || 1 };
        });
    });
  }

  function searchSlug(query) {
    return fetchText(base + '/browse?keyword=' + encodeURIComponent(query)).then(function (html) {
      var results = [];
      var re = /<a\b[^>]*class=["'][^"']*ak-card[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var hrefM = m[0].match(/href=["']([^"']+)["']/i);
        var href = hrefM ? hrefM[1] : '';
        var slugM = href.match(/\/watch\/([^/?#]+)/);
        if (!slugM) continue;
        var titleM = m[0].match(/ak-card-title[^>]*>([\s\S]*?)<\//i);
        var jpM = m[0].match(/data-jp=["']([^"']+)["']/i);
        var text = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : slugM[1].replace(/-/g, ' ');
        results.push({ slug: slugM[1], text: text, jp: jpM ? jpM[1] : '' });
      }
      if (!results.length) {
        var re2 = /\/watch\/([^/?#]+)/gi;
        while ((m = re2.exec(html)) !== null) results.push({ slug: m[1], text: query, jp: '' });
      }
      if (!results.length) return null;
      var target = normalize(query);
      for (var i = 0; i < results.length; i++) {
        var n = normalize(results[i].text);
        var njp = normalize(results[i].jp);
        if (n === target || njp === target || n.indexOf(target) >= 0 || njp.indexOf(target) >= 0) return results[i].slug;
      }
      return results[0].slug;
    });
  }

  function isDirectPlay(url) {
    return /\.m3u8(\?|$)/i.test(url) || /\.mp4(\?|$)/i.test(url) || /\/stream\//i.test(url);
  }

  function extractStream(embedUrl, depth) {
    embedUrl = absUrl(embedUrl);
    if (!embedUrl) return Promise.resolve(null);
    if (depth > 4) return Promise.resolve(null);
    if (isDirectPlay(embedUrl)) return Promise.resolve(embedUrl);
    return fetchText(embedUrl, { Referer: base + '/' }).then(function (html) {
      var srcM = html.match(/<source[^>]+src=["']([^"']+)["']/i);
      if (srcM) {
        var src = absUrl(srcM[1], originOf(embedUrl));
        if (src) return src;
      }
      var playM = html.match(/https?:\/\/[^"'\\\s]+\/play\/[a-z0-9]+/i);
      if (playM) return extractStream(playM[0], (depth || 0) + 1);
      var iframeM = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (iframeM) {
        var next = absUrl(iframeM[1], originOf(embedUrl));
        var vidM = next.match(/[?&]vid=([^&]+)/);
        if (vidM) {
          var inner = b64Decode(decodeURIComponent(vidM[1]));
          if (inner) next = absUrl(inner);
        }
        if (next && next !== embedUrl) return extractStream(next, (depth || 0) + 1);
      }
      var hlsM = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
      if (hlsM) return decodeEntities(hlsM[1]);
      return null;
    });
  }

  function scrapeEpisodeWatch(seriesSlug, epSlug, audio) {
    var watchUrl =
      base +
      '/watch/' +
      seriesSlug +
      '/' +
      epSlug +
      (audio === 'dub' ? '?type=dub' : '');
    return fetchText(watchUrl, { Referer: base + '/' }).then(function (html) {
      var byAudio = { sub: [], dub: [] };
      var panelRe = /<div\b[^>]*class=["'][^"']*type[^"']*["'][^>]*data-type=["']([^"']+)["'][^>]*>([\s\S]*?)<\/div>/gi;
      var pm;
      while ((pm = panelRe.exec(html)) !== null) {
        var panelAudio = pm[1].toLowerCase().indexOf('dub') >= 0 ? 'dub' : 'sub';
        var btnRe = /data-link-id=["']([^"']+)["']/gi;
        var bm;
        while ((bm = btnRe.exec(pm[2])) !== null) byAudio[panelAudio].push(decodeEntities(bm[1]));
      }
      if (!byAudio.sub.length && !byAudio.dub.length) {
        var all = html.match(/data-link-id=["']([^"']+)["']/gi) || [];
        all.forEach(function (attr) {
          var idM = attr.match(/data-link-id=["']([^"']+)["']/i);
          if (idM) byAudio.sub.push(decodeEntities(idM[1]));
        });
      }
      var embeds = byAudio[audio] && byAudio[audio].length ? byAudio[audio] : byAudio.sub || [];
      return Promise.all(
        embeds.slice(0, 4).map(function (raw) {
          var decoded = /^https?:\/\//i.test(raw) || raw.indexOf('//') === 0 ? raw : b64Decode(raw);
          var embed = absUrl(decoded);
          return extractStream(embed, 0)
            .then(function (play) {
              if (play) {
                return [
                  {
                    url: play,
                    name: 'AniNeko',
                    headers: { 'User-Agent': ua, Referer: originOf(play) + '/' },
                    language: audio === 'dub' ? 'Dub' : 'Sub',
                  },
                ];
              }
              if (!embed) return [];
              return ctx.hop(embed).then(function (rows) {
                return (rows || []).map(function (r) {
                  return Object.assign({}, r, { name: 'AniNeko embed', language: audio === 'dub' ? 'Dub' : 'Sub' });
                });
              });
            })
            .catch(function () {
              return [];
            });
        }),
      ).then(function (groups) {
        return [].concat.apply([], groups);
      });
    });
  }

  return titleAndMapping()
    .then(function (state) {
      var query = state.title || String(ctx.title || '');
      if (!query) return [];
      return searchSlug(query.split(':')[0].trim()).then(function (slug) {
        if (!slug) return [];
        var epSlug = 'ep-' + state.mappedEp;
        var cats =
          (globalThis.__engineAudioCategories &&
            globalThis.__engineAudioCategories(ctx)) ||
          ['sub', 'dub'];
        var first = cats[0] || 'sub';
        return scrapeEpisodeWatch(slug, epSlug, first).then(function (rows) {
          if (rows.length || cats.length < 2) return rows;
          return scrapeEpisodeWatch(slug, epSlug, cats[1]);
        });
      });
    })
    .then(function (rows) {
      return rows && rows.length ? rows : [];
    })
    .catch(function () {
      return [];
    });
}
