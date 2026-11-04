// DoodStream + mirrors (doply / playmogo / vide0 / ds2play…). CloudStream-style pass_md5.
function extract(ctx) {
  var url = String((ctx && ctx.url) || '');
  if (!url) return Promise.resolve([]);
  var cfg = ctx.config || {};
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var chromeFetch =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : null;
  var http = chromeFetch || ctx.fetch.bind(ctx);

  function row(u, extra) {
    extra = extra || {};
    return {
      url: u,
      name: extra.name || cfg.name || 'Doodstream',
      quality: extra.quality || '',
      headers: extra.headers || {
        'User-Agent': ua,
        Referer: extra.referer || 'https://dood.li/',
      },
    };
  }
  function cf(html) {
    return /just a moment|cf-challenge|challenge-platform/i.test(String(html || ''));
  }
  function abs(u, base) {
    if (!u) return '';
    if (/^https?:/i.test(u)) return u;
    try {
      return new URL(u, base).toString();
    } catch (e) {
      return u;
    }
  }
  function originOf(u) {
    try {
      return new URL(u).origin;
    } catch (e) {
      return '';
    }
  }
  function rand(n) {
    var c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var o = '';
    for (var i = 0; i < n; i++) o += c.charAt(Math.floor(Math.random() * c.length));
    return o;
  }
  function videoId(u) {
    var m =
      String(u).match(/\/(?:e|d)\/([A-Za-z0-9]+)/i) ||
      String(u).match(/[?&]id=([A-Za-z0-9]+)/i);
    return m ? m[1] : '';
  }
  function qualityFrom(html) {
    var title = (String(html).match(/<title[^>]*>([^<]+)/i) || [])[1] || '';
    return (title.match(/\b(\d{3,4}p)\b/i) || [])[1] || '';
  }

  // Prefer mirrors that are less often sinkholed / CF-gated than doply/playmogo.
  var id = videoId(url);
  var candidates = [];
  if (id) {
    candidates.push('https://vide0.net/e/' + id);
    candidates.push('https://ds2play.com/e/' + id);
    candidates.push('https://dsvplay.com/e/' + id);
  }
  candidates.push(url.replace(/\/d\//i, '/e/'));

  function unlockOne(embedUrl) {
    var headers = {
      'User-Agent': ua,
      Referer: embedUrl,
      Accept: 'text/html,application/xhtml+xml',
    };
    return http(embedUrl, { headers: headers, redirect: 'follow' })
      .then(function (r) {
        var finalUrl = String((r && r.url) || embedUrl);
        return r.text().then(function (html) {
          return { html: html, finalUrl: finalUrl };
        });
      })
      .then(function (page) {
        var html = String(page.html || '');
        if (cf(html) || /video you are looking for is not found|file was deleted/i.test(html)) {
          return [];
        }
        var passPath = (html.match(/\/pass_md5\/[^'"]+/) || [])[0] || '';
        if (!passPath) {
          passPath = (html.match(/\$\.get\(['"]([^'"]*\/pass_md5\/[^'"]*)['"]/) || [])[1] || '';
        }
        if (!passPath) return [];
        if (passPath.charAt(0) !== '/' && !/^https?:/i.test(passPath)) {
          passPath = '/' + passPath;
        }
        var origin = originOf(page.finalUrl) || originOf(embedUrl);
        var passUrl = abs(passPath, origin + '/');
        // CloudStream: token = last segment of pass_md5 path.
        var token = passUrl.split('/').pop() || '';
        var tokMatch = html.match(/token=([a-zA-Z0-9]+)/);
        if (tokMatch && tokMatch[1]) token = tokMatch[1];
        if (!token) return [];

        return http(passUrl, {
          headers: {
            'User-Agent': ua,
            Referer: page.finalUrl,
            Accept: '*/*',
          },
        }).then(function (r) {
          return r.text().then(function (base) {
            base = String(base || '').trim();
            if (!base || !/^https?:\/\//i.test(base) || /reload/i.test(base)) return [];
            var direct = base + rand(10) + '?token=' + token + '&expiry=' + Date.now();
            return [
              row(direct, {
                name: 'Doodstream',
                quality: qualityFrom(html),
                referer: origin + '/',
              }),
            ];
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  function tryNext(i) {
    if (i >= candidates.length) return Promise.resolve([]);
    return unlockOne(candidates[i]).then(function (rows) {
      if (rows && rows.length) return rows;
      return tryNext(i + 1);
    });
  }

  return tryNext(0);
}
