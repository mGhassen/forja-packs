var SPECS = {
  "base": "https://anidb.se",
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var hdrs = { 'User-Agent': ua, Referer: base + '/', Accept: 'text/html,application/xhtml+xml' };
  var isTv = ctx.type !== 'movie';
  var epNum = isTv ? ctx.episode || 1 : 1;

  function fetchText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}) }).then(function (r) {
      return r.text();
    });
  }

  function fetchJson(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}, { Accept: 'application/json' }) }).then(function (r) {
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

  function resolveMal() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost) {
      return fetchJson(jikan + '/' + fromHost.malId)
        .then(function (j) {
          return {
            ep: fromHost.mappedEp || epNum,
            title: (j && j.data && j.data.title) || fromHost.title || ctx.title || '',
          };
        })
        .catch(function () {
          return { ep: fromHost.mappedEp || epNum, title: fromHost.title || ctx.title || '' };
        });
    }
    if (!isTv) {
      return fetchJson(
        'https://tmdb.forjahq.xyz/3/movie/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
      )
        .then(function (d) {
          var title = d.title || d.original_title || '';
          if (!title) return null;
          return { ep: 1, title: title };
        })
        .catch(function () {
          return null;
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
      if (!imdbId) return ctx.title ? { ep: epNum, title: String(ctx.title) } : null;
      return fetchJson(
        mapApi +
          '?id=' +
          encodeURIComponent(imdbId) +
          '&s=' +
          encodeURIComponent(String(ctx.season || 1)) +
          '&e=' +
          encodeURIComponent(String(epNum)),
      )
        .then(function (m) {
          if (!m || !m.mal_id) return ctx.title ? { ep: epNum, title: String(ctx.title) } : null;
          return fetchJson(jikan + '/' + m.mal_id).then(function (j) {
            return {
              ep: m.mal_episode || epNum,
              title: (j && j.data && j.data.title) || String(ctx.title || ''),
            };
          });
        })
        .catch(function () {
          return ctx.title ? { ep: epNum, title: String(ctx.title) } : null;
        });
    });
  }

  function searchAjax(query) {
    return ctx
      .fetch(base + '/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': ua,
          Origin: base,
          Referer: base + '/',
        },
        body: 'action=ts_ac_do_search&ts_ac_query=' + encodeURIComponent(query),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var results = [];
        var items = (((data || {}).anime || [])[0] || {}).all || [];
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var slugM = (item.post_link || '').match(/\/anime\/([^/]+)\/?$/);
          if (!slugM) continue;
          results.push({ slug: slugM[1], text: item.post_title || slugM[1].replace(/-/g, ' ') });
        }
        return results;
      })
      .catch(function () {
        return [];
      });
  }

  function searchHtml(query) {
    return fetchText(base + '/?s=' + encodeURIComponent(query)).then(function (html) {
      var results = [];
      var seen = {};
      var re = /class="bsx">\s*<a href="([^"]+)"[^>]*title="([^"]+)"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var slugM = m[1].match(/\/anime\/([^/]+)\/?$/);
        if (!slugM || seen[slugM[1]]) continue;
        seen[slugM[1]] = true;
        results.push({ slug: slugM[1], text: decodeEntities(m[2]) });
      }
      return results;
    });
  }

  function search(query) {
    return searchAjax(query).then(function (rows) {
      return rows.length ? rows : searchHtml(query);
    });
  }

  function pickSlug(results, query) {
    if (!results.length) return null;
    var target = normalize(query);
    for (var i = 0; i < results.length; i++) {
      var n = normalize(results[i].text);
      if (n === target || n.indexOf(target) >= 0 || target.indexOf(n) >= 0) return results[i].slug;
    }
    return results[0].slug;
  }

  function scrapeSeries(slug) {
    return fetchText(base + '/anime/' + slug + '/').then(function (html) {
      var episodes = [];
      var seen = {};
      var re =
        /<li\b[^>]*data-index="\d+"[^>]*>[\s\S]*?<a\s+href="(https?:\/\/[^"]+)"[\s\S]*?<div\s+class="epl-num">([^<]+)<\/div>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var n = parseFloat(String(m[2]).trim());
        var number = Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
        if (number === null || seen[number]) continue;
        seen[number] = true;
        episodes.push({ number: number, epUrl: decodeEntities(m[1]) });
      }
      return episodes;
    });
  }

  function episodePageUrl(slug, number, audio) {
    var suf = audio === 'dub' ? 'english-dubbed' : 'english-subbed';
    return base + '/' + slug + '-episode-' + number + '-' + suf + '/';
  }

  function scrapeEmbeds(epUrl) {
    return fetchText(epUrl).then(function (html) {
      var streams = [];
      var re = /<option\s+value="([A-Za-z0-9+/=]+)"[^>]*>([^<]+)<\/option>/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        var serverName = m[2].trim();
        if (!serverName || /select video server/i.test(serverName) || !m[1]) continue;
        try {
          var decoded = decodeEntities(atob(m[1]));
          var srcM =
            decoded.match(/data-src=["'](https?:\/\/[^"']+)["']/i) ||
            decoded.match(/src=["'](https?:\/\/[^"']+)["']/i);
          if (!srcM) continue;
          streams.push({ url: srcM[1], server: serverName });
        } catch (e) {}
      }
      if (!streams.length) {
        var iframeRe = /<(?:iframe|video)[^>]+(?:src|data-src)=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
        while ((m = iframeRe.exec(html)) !== null) {
          streams.push({ url: m[1], server: 'Direct' });
        }
      }
      return streams;
    });
  }

  function isDirectFile(url) {
    return /\.(mp4|m3u8)(\?|$)/i.test(url);
  }

  function languageLabel(audio) {
    return audio === 'dub' ? 'Dub' : 'Sub';
  }

  function resolveEmbeds(embeds, audio) {
    return Promise.all(
      embeds.map(function (stream) {
        var url = stream.url;
        if (isDirectFile(url)) {
          return Promise.resolve([
            {
              url: url,
              name: 'AniDbApp ' + stream.server,
              headers: { 'User-Agent': ua, Referer: base + '/' },
              language: languageLabel(audio),
            },
          ]);
        }
        return ctx.hop(url).then(function (rows) {
          return rows.length
            ? rows.map(function (r) {
                return Object.assign({}, r, {
                  name: 'AniDbApp ' + (stream.server || 'embed'),
                  language: languageLabel(audio),
                });
              })
            : [];
        });
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  function playEpisode(slug, episodes, number, audio) {
    var listed = audio === 'sub'
      ? episodes.find(function (e) {
          return e.number === number;
        })
      : null;
    var epUrl = listed ? listed.epUrl : episodePageUrl(slug, number, audio);
    return scrapeEmbeds(epUrl).then(function (embeds) {
      return embeds.length ? resolveEmbeds(embeds, audio) : [];
    });
  }

  return resolveMal()
    .then(function (mapped) {
      if (!mapped) return [];
      var query = (mapped.title || String(ctx.title || '')).split(':')[0].trim();
      if (!query) return [];
      return search(query).then(function (results) {
        var slug = pickSlug(results, query);
        if (!slug) return [];
        var cats =
          (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) || ['sub', 'dub'];
        return scrapeSeries(slug).then(function (episodes) {
          function tryAudio(audio) {
            return playEpisode(slug, episodes, mapped.ep, audio);
          }
          var first = cats[0] || 'sub';
          return tryAudio(first).then(function (rows) {
            if (rows.length || cats.length < 2) return rows;
            return tryAudio(cats[1]);
          });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
