var SPECS = {
  "base": "https://aniwaves.ru",
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
          Accept: extra && extra.Accept ? extra.Accept : 'application/json,*/*',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      });
  }

  function decodeEntities(s) {
    return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (_, n) {
      return String.fromCharCode(Number(n));
    });
  }

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function scoreTitle(query, title) {
    var needle = normalize(query);
    var hay = normalize(title);
    if (!needle || !hay) return 0;
    if (hay === needle) return 100;
    var ratio = Math.min(needle.length, hay.length) / Math.max(needle.length, hay.length);
    if (hay.indexOf(needle) === 0 || needle.indexOf(hay) === 0) return ratio >= 0.6 ? 80 : Math.floor(ratio * 60);
    if (hay.indexOf(needle) >= 0 || needle.indexOf(hay) >= 0) return ratio >= 0.6 ? 60 : Math.floor(ratio * 45);
    return 0;
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
      return (d && (d.name || d.title)) || '';
    });
  }

  function search(query) {
    return fetchText(base + '/filter?keyword=' + encodeURIComponent(query)).then(function (html) {
      var results = [];
      var seen = {};
      var re = /class="name d-title"[^>]*href="\/watch\/([^"?#]+)"[^>]*>([^<]+)/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        if (seen[m[1]]) continue;
        seen[m[1]] = true;
        results.push({ slug: m[1], title: m[2].trim() });
      }
      if (!results.length) {
        var re2 = /href="\/watch\/([^"?#]+)"[^>]*class="name d-title"[^>]*>([^<]+)/gi;
        while ((m = re2.exec(html)) !== null) {
          if (seen[m[1]]) continue;
          seen[m[1]] = true;
          results.push({ slug: m[1], title: m[2].trim() });
        }
      }
      if (!results.length) {
        var re3 = /href="\/watch\/([^"?#]+)"/gi;
        while ((m = re3.exec(html)) !== null) {
          if (seen[m[1]]) continue;
          seen[m[1]] = true;
          results.push({ slug: m[1], title: query });
        }
      }
      results.sort(function (a, b) {
        return scoreTitle(query, b.title) - scoreTitle(query, a.title);
      });
      return results;
    });
  }

  function watchId(slug) {
    var direct = String(slug).match(/-(\d{3,})$/);
    if (direct) return Promise.resolve(direct[1]);
    return search(String(slug).replace(/-/g, ' ')).then(function (hits) {
      var hit = hits.find(function (h) {
        return h.slug.indexOf(slug) >= 0;
      }) || hits[0];
      var m = hit && String(hit.slug).match(/-(\d+)$/);
      return m ? m[1] : null;
    });
  }

  function episodes(slug, id) {
    return fetchJson(base + '/ajax/episode/list/' + id, { Referer: base + '/watch/' + slug }).then(function (data) {
      var html = (data && (data.result || data.html)) || '';
      var eps = [];
      var re = /data-ids="([^"]+)"[^>]*data-num="(\d+(?:\.\d+)?)"/gi;
      var m;
      while ((m = re.exec(html)) !== null) {
        eps.push({ ids: decodeEntities(m[1]), num: Number(m[2]) });
      }
      if (!eps.length) {
        var re2 = /data-num="(\d+(?:\.\d+)?)"[^>]*data-ids="([^"]+)"/gi;
        while ((m = re2.exec(html)) !== null) eps.push({ ids: decodeEntities(m[2]), num: Number(m[1]) });
      }
      return eps;
    });
  }

  function servers(ids) {
    var q = decodeEntities(ids);
    if (!/^\d+(?:&eps=[\d.]+)?$/.test(q)) return Promise.resolve([]);
    return fetchJson(base + '/ajax/server/list?servers=' + q).then(function (data) {
      var html = (data && (data.result || data.html)) || '';
      var out = [];
      var parts = String(html).split(/<div class="type"/i);
      parts.forEach(function (part, i) {
        var audio = 'sub';
        if (i > 0) {
          var tm = part.match(/^[^>]*data-type="([^"]+)"/i);
          if (tm) audio = String(tm[1]).toLowerCase();
        }
        var re = /data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gi;
        var m;
        while ((m = re.exec(part)) !== null) {
          out.push({
            linkId: m[1],
            audio: audio,
            name: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || 'Server',
          });
        }
      });
      if (!out.length) {
        var re2 = /data-link-id="([^"]+)"/gi;
        var m2;
        while ((m2 = re2.exec(html)) !== null) out.push({ linkId: m2[1], name: 'Server', audio: 'sub' });
      }
      return out;
    });
  }

  function echoPlaylist(embed) {
    var m = String(embed || '').match(/^(https?:\/\/[^/]+)\/(embed-\d+)\/([^/?#]+)/i);
    if (!m) return Promise.resolve('');
    var origin = m[1];
    var embedPath = m[2];
    var id = m[3];
    var page = origin + '/' + embedPath + '/' + id + '?v=1&asi=0&autoPlay=0&ao=0';
    return fetchJson(origin + '/' + embedPath + '/getSources?id=' + encodeURIComponent(id), {
      Referer: page,
      Origin: origin,
      Accept: '*/*',
    })
      .then(function (data) {
        if (!data) return '';
        if (typeof data.sources === 'string' && data.sources) return data.sources;
        if (Array.isArray(data.sources) && data.sources[0]) {
          var first = data.sources[0];
          return (first && (first.file || first.src || first.url)) || '';
        }
        return data.url || data.link || '';
      })
      .catch(function () {
        return '';
      });
  }

  function embed(linkId) {
    if (/^https?:\/\//i.test(linkId)) return Promise.resolve(linkId);
    return fetchJson(base + '/ajax/sources?id=' + encodeURIComponent(linkId) + '&asi=0&autoPlay=0')
      .then(function (data) {
        var body = (data && (data.result || data)) || {};
        return body.url || body.link || '';
      })
      .catch(function () {
        return '';
      });
  }

  function rowsFromServer(s) {
    var lang = s.audio === 'dub' ? 'Dub' : s.audio === 'raw' ? 'Raw' : 'Sub';
    var label = 'AniWaves ' + s.name + ' ' + lang;
    return embed(s.linkId).then(function (url) {
      if (!url) return [];
      function row(playUrl, extra) {
        extra = extra || {};
        return {
          url: playUrl,
          name: extra.name || label,
          language: lang,
          headers: extra.headers || { 'User-Agent': ua, Referer: base + '/' },
        };
      }
      if (/\.m3u8|\.mp4/i.test(url)) return [row(url)];
      if (/echovideo\.ru/i.test(url)) {
        return echoPlaylist(url).then(function (play) {
          if (!play) return [];
          var origin = 'https://play.echovideo.ru';
          try {
            origin = new URL(url).origin;
          } catch (e) {}
          return [
            row(play, {
              headers: { 'User-Agent': ua, Referer: origin + '/', Origin: origin },
            }),
          ];
        });
      }
      return ctx.hop(url).then(function (rows) {
        return (rows || []).map(function (r) {
          return Object.assign({}, r, { name: r.name || label, language: lang });
        });
      });
    });
  }

  return resolveTitle()
    .then(function (title) {
      if (!title) return [];
      return search(title).then(function (hits) {
        var hit = hits[0];
        if (!hit) return [];
        return watchId(hit.slug).then(function (id) {
          if (!id) return [];
          return episodes(hit.slug, id).then(function (eps) {
            var ep =
              eps.find(function (e) {
                return e.num === Number(epNum);
              }) || eps[0];
            if (!ep) return [];
            return servers(ep.ids).then(function (svs) {
              return Promise.all(svs.slice(0, 6).map(rowsFromServer)).then(function (groups) {
                var seen = {};
                var out = [];
                ;[].concat.apply([], groups).forEach(function (r) {
                  if (!r || !r.url || seen[r.url]) return;
                  seen[r.url] = true;
                  out.push(r);
                });
                return out;
              });
            });
          });
        });
      });
    })
    .catch(function () {
      return [];
    });
}
