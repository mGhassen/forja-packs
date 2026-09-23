var SPECS = {
  "base": "https://moviesmod.ai.in",
  "domainsUrl": "https://raw.githubusercontent.com/mGhassen/forja-packs/main/domains.json",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var fallback = cfg.base;
  var domainsUrl = cfg.domainsUrl;
  var tmdbKey = cfg.tmdbKey;
  var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var hdrs = { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9', Connection: 'keep-alive' };
  var isTv = ctx.type !== 'movie';

  function fetchText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}) }).then(function (r) { return r.text(); });
  }

  function latestDomain() {
    return ctx.fetch(domainsUrl, { headers: { 'User-Agent': ua } }).then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.moviesmod) || fallback; })
      .catch(function () { return fallback; });
  }

  function getTmdb() {
    var kind = isTv ? 'tv' : 'movie';
    return ctx.fetch(
      'https://tmdb.forjahq.xyz/3/' + kind + '/' + encodeURIComponent(String(ctx.tmdbId || '')) +
        '?api_key=' + encodeURIComponent(tmdbKey) + '&append_to_response=external_ids',
      { headers: { 'User-Agent': ua, Accept: 'application/json' } },
    ).then(function (r) { return r.json(); })
      .then(function (d) {
        var title = isTv ? (d.name || d.original_name) : (d.title || d.original_title);
        var date = (d.release_date || d.first_air_date) || '';
        return { title: title, year: date.substring(0, 4), imdbId: (d.external_ids && d.external_ids.imdb_id) || null };
      });
  }

  function getQuality(str) {
    if (!str) return 'Unknown';
    var m = str.match(/(\d{3,4})[pP]/);
    if (m) return m[1] + 'p';
    if (/4K|UHD/i.test(str)) return '2160p';
    return 'Unknown';
  }

  function getBaseUrl(url) {
    try { var u = new URL(url); return u.protocol + '//' + u.host; } catch (e) { return ''; }
  }

  function fixUrl(url, domain) {
    if (!url) return '';
    var cleaned = String(url).replace(/\\\//g, '/');
    if (/^https?:/i.test(cleaned)) return cleaned;
    if (cleaned.startsWith('//')) return 'https:' + cleaned;
    if (cleaned.startsWith('/')) return domain + cleaned;
    return domain + '/' + cleaned;
  }

  function formBody(data) {
    return Object.keys(data).map(function (k) {
      return k + '=' + encodeURIComponent(data[k] == null ? '' : data[k]);
    }).join('&');
  }

  function readForm($root, selector) {
    var $f = $root(selector).first();
    var action = $f.attr('action') || '';
    var data = {};
    $f.find('input').each(function () {
      var name = $root(this).attr('name');
      if (name) data[name] = $root(this).attr('value') || '';
    });
    return { action: action, data: data };
  }

  function isSidLink(url) {
    if (!url) return false;
    if (/[?&]sid=/i.test(url)) return true;
    return /unblockedgames|examzculture|creativeexpressionsblog|thenaukriadda|examdegree/i.test(url);
  }

  function redirectFromHtml(html) {
    var body = String(html || '');
    var loc = body.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i)
      || body.match(/replace\(\s*["']([^"']+)["']\s*\)/);
    if (loc) return loc[1].replace(/\\\//g, '/');
    var meta = body.match(/url=([^"'>\s]+)/i);
    return meta ? meta[1].replace(/['"]/g, '') : null;
  }

  function bypassLandingFrom(html1, url) {
    var host = getBaseUrl(url);
    var $1 = ctx.html(html1);
    var form1 = readForm($1, 'form#landing');
    if (!form1.action) return Promise.resolve(null);
    return ctx.fetch(form1.action, {
      method: 'POST',
      headers: Object.assign({}, hdrs, { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url }),
      body: formBody(form1.data),
    }).then(function (r) { return r.text(); }).then(function (html2) {
      var $2 = ctx.html(html2);
      var form2 = readForm($2, 'form#landing');
      if (!form2.action) return null;
      return ctx.fetch(form2.action, {
        method: 'POST',
        headers: Object.assign({}, hdrs, { 'Content-Type': 'application/x-www-form-urlencoded', Referer: form1.action }),
        body: formBody(form2.data),
      }).then(function (r) { return r.text(); }).then(function (html3) {
        var body = String(html3 || '');
        var cookieM = body.match(/s_\d+\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
        var linkM = body.match(/setAttribute\(\s*["']href["']\s*,\s*["']([^"']+)["']\)/);
        if (cookieM && linkM) {
          var goUrl = fixUrl(linkM[1], host);
          return fetchText(goUrl, { Cookie: cookieM[1] + '=' + cookieM[2], Referer: form2.action }).then(function (html4) {
            return redirectFromHtml(html4);
          });
        }
        var skM = body.match(/\?go=([^"'\s]+)/);
        if (!skM) return redirectFromHtml(body);
        var skToken = skM[1];
        var wpHttp2 = form2.data['_wp_http2'] || '';
        return fetchText(host + '?go=' + skToken, { Cookie: skToken + '=' + wpHttp2 }).then(function (html4) {
          var metaM = redirectFromHtml(html4);
          if (!metaM) return null;
          if (/driveseed|driveleech|video-seed|video-gen/i.test(metaM)) return metaM;
          return fetchText(metaM).then(function (html5) {
            var pm = redirectFromHtml(html5);
            if (!pm || pm === '/404') return metaM;
            return fixUrl(pm, getBaseUrl(metaM));
          });
        });
      });
    });
  }

  function bypassLpLandFrom(html1, url) {
    var host = getBaseUrl(url);
    var $1 = ctx.html(html1);
    var form1 = readForm($1, 'form#lp-land');
    if (!form1.action && !form1.data._lp_http) return Promise.resolve(null);
    var action1 = fixUrl(form1.action || host + '/', host);
    return ctx.fetch(action1, {
      method: 'POST',
      headers: Object.assign({}, hdrs, { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url }),
      body: formBody(form1.data),
    }).then(function (r) { return r.text(); }).then(function (html2) {
      var $2 = ctx.html(html2);
      var form2 = readForm($2, 'form[id^="lp-s"][id$="-form"]');
      if (!form2.action) return null;
      var action2 = fixUrl(form2.action, host);
      return ctx.fetch(action2, {
        method: 'POST',
        headers: Object.assign({}, hdrs, { 'Content-Type': 'application/x-www-form-urlencoded', Referer: action1 }),
        body: formBody(form2.data),
      }).then(function (r) { return r.text(); }).then(function (html3) {
        var body = String(html3 || '');
        var cookieM = body.match(/sc\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
        var linkM = body.match(/setAttribute\(\s*["']href["']\s*,\s*["']([^"']+)["']\)/);
        if (!cookieM || !linkM) return null;
        var goUrl = fixUrl(linkM[1], host);
        var cookieVal = cookieM[2].replace(/\\\//g, '/');
        return fetchText(goUrl, { Cookie: cookieM[1] + '=' + cookieVal, Referer: action2 }).then(function (html4) {
          return redirectFromHtml(html4);
        });
      });
    });
  }

  function bypassHrefli(url) {
    return fetchText(url).then(function (html) {
      if (/id=["']lp-land["']|_lp_http/i.test(html)) return bypassLpLandFrom(html, url);
      return bypassLandingFrom(html, url);
    }).catch(function () { return null; });
  }

  function extractVideoSeed(url) {
    var hostname;
    try { hostname = new URL(url).hostname; } catch (e) { return Promise.resolve(null); }
    var token = (url.split('?url=')[1] || '').trim();
    if (!token) {
      // Path-token CDNs (cdn.video-gen.xyz/<hash>) are already direct.
      if (/video-gen|video-seed|video-leech|workers\.dev|r2\.dev/i.test(url)) {
        return Promise.resolve(url);
      }
      return Promise.resolve(null);
    }
    return ctx.fetch('https://' + hostname + '/api', {
      method: 'POST',
      headers: Object.assign({}, hdrs, { 'Content-Type': 'application/x-www-form-urlencoded', 'x-token': hostname, Referer: url }),
      body: 'keys=' + encodeURIComponent(token),
    }).then(function (r) { return r.text(); })
      .then(function (text) {
        var m = text.match(/url":"([^"]+)"/);
        return m ? m[1].replace(/\\\//g, '/') : null;
      }).catch(function () { return null; });
  }

  function extractDriveseed(url) {
    var pageUrl = url;
    var p1 = /[?&]key=|\/r\?/i.test(url)
      ? fetchText(url).then(function (h) {
          var m = redirectFromHtml(h);
          if (m && m !== '/404') {
            pageUrl = fixUrl(m, getBaseUrl(url));
            return fetchText(pageUrl);
          }
          return h;
        })
      : fetchText(pageUrl);
    return p1.then(function (html) {
      var $ = ctx.html(html);
      var qualityText = $('li.list-group-item').first().text() || '';
      var size = $('li:nth-child(3)').text().replace('Size : ', '').trim();
      var quality = getQuality(qualityText);
      var base = getBaseUrl(pageUrl);
      var streams = [];
      var tasks = [];
      $('div.text-center > a').each(function () {
        var a = $(this);
        var text = a.text().toLowerCase();
        var href = a.attr('href');
        if (!href) return;
        if (text.indexOf('instant') >= 0) {
          var abs = fixUrl(href, base);
          if (/video-seed|video-gen|video-leech/i.test(abs) || /[?&]url=/i.test(abs)) {
            tasks.push(extractVideoSeed(abs).then(function (u) {
              if (u) streams.push({ name: 'Driveseed Instant', url: u, quality: quality, size: size });
            }).catch(function () {}));
          } else {
            tasks.push(ctx.fetch(abs, { headers: Object.assign({}, hdrs, { Referer: pageUrl }) }).then(function (r) {
              var fu = r.url || abs;
              if (fu.indexOf('url=') >= 0) streams.push({ name: 'Driveseed Instant', url: fu.split('url=')[1], quality: quality, size: size });
              else if (fu && !/driveseed|driveleech/i.test(fu)) streams.push({ name: 'Driveseed Instant', url: fu, quality: quality, size: size });
            }).catch(function () {}));
          }
        } else if (text.indexOf('direct links') >= 0) {
          var directUrl = fixUrl(href, base);
          if (directUrl.indexOf('type=') < 0) directUrl += (directUrl.indexOf('?') >= 0 ? '&' : '?') + 'type=1';
          tasks.push(fetchText(directUrl, { Referer: pageUrl }).then(function (ch) {
            var $d = ctx.html(ch);
            $d('a.btn-success, a[href*="workers.dev"], a[href*="workerseed"]').each(function () {
              var link = $d(this).attr('href');
              if (link && /^https?:/i.test(link)) {
                streams.push({ name: 'Driveseed Direct', url: link, quality: quality, size: size });
              }
            });
          }).catch(function () {}));
        } else if (text.indexOf('resume cloud') >= 0 || text.indexOf('worker') >= 0) {
          tasks.push(fetchText(fixUrl(href, base), { Referer: pageUrl }).then(function (ch) {
            var link = ctx.html(ch)('a.btn-success').first().attr('href');
            if (link) streams.push({ name: 'Driveseed Cloud', url: link, quality: quality, size: size });
          }).catch(function () {}));
        } else if (text.indexOf('cloud download') >= 0) {
          streams.push({ name: 'Driveseed Cloud', url: fixUrl(href, base), quality: quality, size: size });
        }
      });
      return Promise.all(tasks).then(function () { return streams; });
    }).catch(function () { return []; });
  }

  function processLink(url, referer, quality) {
    return fetchText(url, { Referer: referer }).then(function (html) {
      var $ = ctx.html(html);
      var hrefs = [];
      $('a[href*="driveseed.org"], a[href*="driveleech"], a[href*="unblockedgames"], a[href*="examzculture"], a[href*="creativeexpressionsblog"], a[href*="thenaukriadda"], a[href*="examdegree"], a[href*="?sid="]').each(function () {
        hrefs.push($(this).attr('href'));
      });
      var unique = hrefs.filter(function (u, i) { return u && hrefs.indexOf(u) === i; });
      return Promise.all(unique.map(function (link) {
        var p = isSidLink(link) ? bypassHrefli(link) : Promise.resolve(link);
        return p.then(function (final) {
          if (!final || isSidLink(final) || !/driveseed|driveleech/i.test(final)) return [];
          return extractDriveseed(final).then(function (streams) {
            return streams.map(function (s) {
              return {
                name: 'MoviesMod [' + s.name + ']',
                url: s.url,
                quality: s.quality || quality,
                size: s.size || undefined,
              };
            });
          });
        });
      })).then(function (groups) { return [].concat.apply([], groups); });
    }).catch(function () { return []; });
  }

  return Promise.all([getTmdb(), latestDomain()]).then(function (pair) {
    var info = pair[0];
    var mainUrl = pair[1].replace(/\/$/, '');
    if (!info || !info.title) return [];
    var q = info.title;
    if (isTv && ctx.season) q += ' Season ' + ctx.season;
    var searchUrl = mainUrl + '/?s=' + encodeURIComponent(q);
    return fetchText(searchUrl).then(function (html) {
      var $ = ctx.html(html);
      var targetUrl = '';
      $('article.gridlove-post, article.latestPost, #content_box article').each(function () {
        if (targetUrl) return;
        var title = $('h1.sanket, h2.title a', this).text() || $('a', this).attr('title') || '';
        var href = $('div.entry-image > a, h2.title a, a', this).first().attr('href');
        if (href && title.toLowerCase().indexOf(info.title.toLowerCase()) >= 0) targetUrl = href;
      });
      if (!targetUrl) targetUrl = $('#content_box article > a').first().attr('href');
      if (!targetUrl) return [];
      return fetchText(targetUrl).then(function (pageHtml) {
        var $p = ctx.html(pageHtml);
        var content = $p('.thecontent, .entry-content, #content_box');
        var hTag = isTv ? 'h3' : 'h4';
        var aTag = isTv ? 'Episode' : 'Download';
        var sTag = isTv ? '(S0?' + String(ctx.season || 1) + '|Season ' + (ctx.season || 1) + ')' : '';
        var qualityRegex = new RegExp((sTag ? sTag + '.*' : '') + '(480p|720p|1080p|2160p)', 'i');
        var tasks = [];
        content.find(hTag).each(function () {
          var text = $p(this).text();
          if (!qualityRegex.test(text) || text.indexOf('MoviesMod') >= 0) return;
          var quality = getQuality(text);
          var linkEl = $p(this).nextAll('p, div').find('a.maxbutton, a.maxbutton-1, a:contains("' + aTag + '")').first();
          var href = linkEl.attr('href');
          if (href) tasks.push(processLink(href, targetUrl, quality));
        });
        return Promise.all(tasks).then(function (groups) {
          return [].concat.apply([], groups);
        });
      });
    });
  }).catch(function () { return []; });
}
