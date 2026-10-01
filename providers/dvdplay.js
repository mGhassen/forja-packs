var SPECS = {
  "base": "https://mallumv.space",
  "name": "DVDPlay",
  "domainsUrl": "https://raw.githubusercontent.com/mGhassen/forja-packs/main/domains.json",
  "tmdbKey": "439c478a771f35c05022f9feabcca01c"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var fallback = String(cfg.base || '').replace(/\/$/, '');
  var domainsUrl = cfg.domainsUrl;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  var isTv = ctx.type !== 'movie';
  var tmdbKey = cfg.tmdbKey;
  var title = '';
  var year = '';
  var base = fallback;

  function abs(url, from) {
    if (!url) return '';
    if (/^https?:/i.test(url)) return url;
    try {
      return new URL(url, from || base + '/').toString();
    } catch (e) {
      return url;
    }
  }

  function encodePathUrl(url) {
    try {
      var u = new URL(url);
      u.pathname = u.pathname
        .split('/')
        .map(function (seg) {
          return encodeURIComponent(decodeURIComponent(seg));
        })
        .join('/');
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function fetchText(url, extraHeaders) {
    return ctx
      .fetch(encodePathUrl(url), { headers: Object.assign({}, headers, extraHeaders || {}) })
      .then(function (r) {
        return r.text();
      });
  }

  function latestDomain() {
    return ctx
      .fetch(domainsUrl, { headers: { 'User-Agent': ua } })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        return String((j && (j.dvdplay || j.mallumv)) || fallback).replace(/\/$/, '');
      })
      .catch(function () {
        return fallback;
      });
  }

  function titleMeta() {
    var t = String(ctx.title || '').trim();
    var y = String(ctx.year || '').trim();
    if (t) return Promise.resolve({ title: t, year: y });
    return ctx
      .fetch(
        'https://tmdb.forjahq.xyz/3/' +
          (isTv ? 'tv' : 'movie') +
          '/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
        { headers: { Accept: 'application/json', 'User-Agent': ua } },
      )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        return {
          title: (isTv ? d.name : d.title) || '',
          year: String((isTv ? d.first_air_date : d.release_date) || '').substring(0, 4),
        };
      });
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/s\d{1,2}e\d{1,2}/g, ' ')
      .replace(/season\s*\d+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function similarity(a, b) {
    var aw = normalize(a).split(' ').filter(Boolean);
    var bw = normalize(b).split(' ').filter(Boolean);
    if (!aw.length || !bw.length) return 0;
    var hit = 0;
    aw.forEach(function (w) {
      if (w.length > 2 && bw.indexOf(w) >= 0) hit += 1;
    });
    return hit / Math.max(aw.length, bw.length);
  }

  function scoreCandidate(label) {
    var score = similarity(title, label);
    if (year && String(label).indexOf(year) >= 0) score += 0.25;
    if (isTv) {
      var seasonToken = 'season ' + String(ctx.season || 1);
      if (normalize(label).indexOf(seasonToken) >= 0) score += 0.3;
    }
    return score;
  }

  function qualityOf(str) {
    if (/2160|4k|uhd/i.test(str)) return '4K';
    if (/1080/i.test(str)) return '1080p';
    if (/720/i.test(str)) return '720p';
    if (/480/i.test(str)) return '480p';
    return 'Unknown';
  }

  function pixelize(url) {
    var m = String(url || '').match(/pixeldrain\.(?:net|dev)\/(?:u|api\/file)\/([A-Za-z0-9]+)/i);
    if (m) return 'https://pixeldrain.net/api/file/' + m[1];
    return url;
  }

  function resolveHubCloud(url) {
    return fetchText(url, { Referer: base + '/' })
      .then(function (html) {
        var $ = ctx.html ? ctx.html(html) : null;
        var next = '';
        if ($) {
          $('a[href]').each(function () {
            if (next) return;
            var href = $(this).attr('href') || '';
            var text = ($(this).text() || '').toLowerCase();
            if (/hubcloud\.php/i.test(href) || /generate direct download/i.test(text)) {
              next = abs(href, url);
            }
          });
        }
        if (!next) {
          var m = String(html || '').match(/https?:\/\/[^"'<\s]+hubcloud\.php[^"'<\s]*/i);
          if (m) next = m[0];
        }
        var page = next ? fetchText(next, { Referer: url }) : Promise.resolve(html);
        return page.then(function (pageHtml) {
          var out = [];
          var seen = {};
          function push(u, label) {
            u = pixelize(u);
            if (!u || seen[u]) return;
            if (!/pixeldrain\.net\/api\/file\/|r2\.cloudflarestorage\.com|workers\.dev|r2\.dev|pixel\.hubcloud/i.test(u)) {
              return;
            }
            seen[u] = true;
            out.push({ url: u, label: label || 'HubCloud' });
          }
          var $p = ctx.html ? ctx.html(pageHtml) : null;
          if ($p) {
            $p('a[href]').each(function () {
              var href = $p(this).attr('href') || '';
              var text = ($p(this).text() || '').trim();
              if (!href) return;
              if (/download|pixel|10gbps|fsl|s3|server|r2/i.test(text) || /pixeldrain|r2\.|workers\.dev|hubcloud|cloudflarestorage/i.test(href)) {
                push(abs(href, next || url), text || 'HubCloud');
              }
            });
          }
          String(pageHtml || '').replace(/https?:\/\/[^"'<\s]+/gi, function (u) {
            push(u, 'HubCloud');
            return u;
          });
          return out;
        });
      })
      .catch(function () {
        return [];
      });
  }

  function directize(url, qualityHint) {
    if (!url) return Promise.resolve([]);
    var decoded = abs(url).replace(/&amp;/g, '&');
    var q = qualityOf(qualityHint || decoded);
    if (/pixeldrain\.(?:net|dev)\//i.test(decoded)) {
      return Promise.resolve([
        {
          url: pixelize(decoded),
          name: 'DVDPlay - Pixeldrain - ' + q,
          quality: q,
          headers: { 'User-Agent': ua, Referer: base + '/' },
        },
      ]);
    }
    if (/r2\.cloudflarestorage\.com|video-downloads\.googleusercontent\.com|pixeldrain\.net\/api\/file\//i.test(decoded)) {
      return Promise.resolve([
        {
          url: decoded,
          name: 'DVDPlay - Direct - ' + q,
          quality: q,
          headers: { 'User-Agent': ua, Referer: base + '/' },
        },
      ]);
    }
    if (/hubcloud\./i.test(decoded) || /hubcloud\.php/i.test(decoded)) {
      return resolveHubCloud(decoded).then(function (items) {
        return items.map(function (it) {
          var label = /pixel/i.test(it.label)
            ? 'Pixeldrain'
            : /10gbps/i.test(it.label)
              ? '10Gbps'
              : /fsl/i.test(it.label)
                ? 'FSLv2'
                : 'HubCloud';
          return {
            url: it.url,
            name: 'DVDPlay - ' + label + ' - ' + q,
            quality: q,
            headers: { 'User-Agent': ua, Referer: base + '/' },
          };
        });
      });
    }
    return Promise.resolve([]);
  }

  function search() {
    var q = encodeURIComponent(title.trim());
    return fetchText(base + '/search.php?q=' + q, { Referer: base + '/' }).then(function (html) {
      if (/No Result Found\. Showing Recent Movies/i.test(html)) return [];
      var candidates = [];
      var $ = ctx.html ? ctx.html(html) : null;
      if ($) {
        $('a[href*="movie/"]').each(function () {
          var href = $(this).attr('href') || '';
          var text = ($(this).text() || '').replace(/\s+/g, ' ').trim();
          if (!href || !text) return;
          var url = abs(href, base + '/');
          if (!/\/movie\/\d+\//i.test(url)) return;
          var score = scoreCandidate(text);
          if (score > 0.2) candidates.push({ url: url, title: text, score: score });
        });
      }
      if (!candidates.length) {
        var re = /href=["'](movie\/\d+\/[^"']+\.xhtml)["'][^>]*>[\s\S]*?»\s*([^<]+)/gi;
        var m;
        while ((m = re.exec(html)) !== null) {
          var url2 = abs(m[1], base + '/');
          var text2 = String(m[2] || '').replace(/\s+/g, ' ').trim();
          var score2 = scoreCandidate(text2);
          if (score2 > 0.2) candidates.push({ url: url2, title: text2, score: score2 });
        }
      }
      candidates.sort(function (a, b) {
        return b.score - a.score;
      });
      return candidates.slice(0, 3);
    });
  }

  function extractFromPage(pageUrl) {
    return fetchText(pageUrl, { Referer: base + '/' }).then(function (html) {
      var internals = [];
      var $ = ctx.html ? ctx.html(html) : null;
      if ($) {
        $('a[href*="/internal/"]').each(function () {
          var href = $(this).attr('href') || '';
          var text = ($(this).text() || '').replace(/\s+/g, ' ').trim();
          if (!href) return;
          internals.push({ url: abs(href, pageUrl), label: text || href });
        });
      }
      if (!internals.length) {
        String(html || '').replace(/href=["'](\/internal\/[^"']+)["']/gi, function (_, p) {
          internals.push({ url: abs(p, pageUrl), label: p });
          return _;
        });
      }
      var limited = internals.slice(0, 8);
      return Promise.all(
        limited.map(function (item) {
          return fetchText(item.url, { Referer: pageUrl })
            .then(function (innerHtml) {
              var hosts = [];
              var $i = ctx.html ? ctx.html(innerHtml) : null;
              if ($i) {
                $i('a[href]').each(function () {
                  var href = $i(this).attr('href') || '';
                  if (/pixeldrain\.|hubcloud\.|hubcloud\.php/i.test(href)) {
                    hosts.push(abs(href, item.url));
                  }
                });
              }
              String(innerHtml || '').replace(/https?:\/\/[^"'<\s]+/gi, function (u) {
                if (/pixeldrain\.|hubcloud\./i.test(u)) hosts.push(u);
                return u;
              });
              var seenH = {};
              hosts = hosts.filter(function (u) {
                if (!u || seenH[u]) return false;
                seenH[u] = true;
                return true;
              });
              return Promise.all(
                hosts.slice(0, 4).map(function (u) {
                  return directize(u, item.label);
                }),
              ).then(function (chunks) {
                return [].concat.apply([], chunks);
              });
            })
            .catch(function () {
              return [];
            });
        }),
      ).then(function (chunks) {
        var out = [];
        var seen = {};
        [].concat.apply([], chunks).forEach(function (s) {
          if (!s || !s.url || seen[s.url]) return;
          seen[s.url] = true;
          out.push(s);
        });
        return out;
      });
    });
  }

  return Promise.all([titleMeta(), latestDomain()])
    .then(function (pair) {
      title = pair[0].title;
      year = pair[0].year;
      base = pair[1] || fallback;
      headers.Referer = base + '/';
      if (!title) return [];
      return search();
    })
    .then(function (matches) {
      if (!matches || !matches.length) return [];
      return extractFromPage(matches[0].url);
    })
    .catch(function () {
      return [];
    });
}
