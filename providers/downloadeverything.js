var SPECS = {
  slave: 'https://slave.downloadeverythingfromeverywhere.com/',
  origin: 'https://downloadeverythingfromeverywhere.com',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var slave = String(cfg.slave || SPECS.slave);
  var origin = String(cfg.origin || SPECS.origin).replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
  var headers = {
    'User-Agent': ua,
    Origin: origin,
    Referer: origin + '/',
    'Content-Type': 'application/json',
  };
  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var title = String(ctx.title || '').trim();
  var tmdbId = ctx.tmdbId ? String(ctx.tmdbId) : '';
  var imdbId = ctx.imdbId ? String(ctx.imdbId) : '';
  var season = ctx.season || null;
  var episode = ctx.episode || null;
  if (!title && !tmdbId && !imdbId) return Promise.resolve([]);

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function parseHits(body) {
    var hits = [];
    String(body || '')
      .split(/\r?\n/)
      .forEach(function (line) {
        line = line.trim();
        if (!line) return;
        try {
          var parsed = JSON.parse(line);
          if (!parsed || parsed.t !== 'hit' || !Array.isArray(parsed.links)) return;
          var site = String(parsed.site || 'DownloadEverything');
          parsed.links.forEach(function (l) {
            if (!l || typeof l !== 'object') return;
            hits.push(Object.assign({ site: site }, l));
          });
        } catch (e) {}
      });
    return hits;
  }

  function skipUrl(rawUrl) {
    return /111477\.xyz|vadapav\.mov|driveseed\.org|new3\.gdflix\.io|rapidrar\.cr|megaup\.net|telegram\.dog|\bt\.me\b/i.test(
      rawUrl,
    );
  }

  function qualityFromTags(tags) {
    tags = Array.isArray(tags) ? tags : [];
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i] || '');
      if (/2160p|4k|1080p|720p|480p/i.test(t)) return t;
    }
    return '1080p';
  }

  function resolveHubCloud(hubUrl) {
    return ctx
      .fetch(hubUrl, {
        headers: { 'User-Agent': ua, Referer: origin + '/' },
        redirect: 'follow',
      })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        var hubPhp = (html.match(/https?:\/\/[^\s"<>]*\/hubcloud\.php\?[^\s"<>]*/i) || [])[0];
        if (!hubPhp) return null;
        return ctx
          .fetch(hubPhp, { headers: { 'User-Agent': ua, Referer: hubUrl } })
          .then(function (r) {
            return r.text();
          })
          .then(function (phpBody) {
            var r2 = (phpBody.match(
              /https?:\/\/[a-zA-Z0-9.\-_]+\.r2\.cloudflarestorage\.com\/[^\s"<>]+/i,
            ) || [])[0];
            if (r2) return r2.replace(/&amp;/g, '&');
            var pixel = (phpBody.match(/https?:\/\/pixel\.hubcloud\.[a-z]+\/\?id=[^\s"<>]+/i) ||
              [])[0];
            return pixel || null;
          });
      })
      .catch(function () {
        return null;
      });
  }

  function collectInputs(formHtml) {
    var params = {};
    var re =
      /<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi;
    var m;
    while ((m = re.exec(formHtml)) !== null) {
      params[m[1]] = m[2];
    }
    var re2 =
      /<input[^>]+value=["']([^"']*)["'][^>]+name=["']([^"']+)["']/gi;
    while ((m = re2.exec(formHtml)) !== null) {
      params[m[2]] = m[1];
    }
    return params;
  }

  function formBody(params) {
    return Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      })
      .join('&');
  }

  function cookieFrom(res) {
    try {
      if (typeof res.headers.get === 'function') {
        var c = res.headers.get('set-cookie') || res.headers.get('Set-Cookie') || '';
        return c ? String(c).split(';')[0] : '';
      }
    } catch (e) {}
    return '';
  }

  function resolveClicknUpload(clicknUrl) {
    return ctx
      .fetch(clicknUrl, { headers: { 'User-Agent': ua, Referer: origin + '/' } })
      .then(function (r1) {
        return r1.text().then(function (html1) {
          var form1 = (html1.match(
            /<form[^>]+method=["']POST["'][^>]*>([\s\S]*?)<\/form>/i,
          ) || [])[1];
          if (!form1) return null;
          var params1 = collectInputs(form1);
          params1.method_free = 'Slow Download';
          var cookies = cookieFrom(r1);
          return ctx
            .fetch(clicknUrl, {
              method: 'POST',
              headers: Object.assign(
                {
                  'User-Agent': ua,
                  Referer: clicknUrl,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                cookies ? { Cookie: cookies } : {},
              ),
              body: formBody(params1),
            })
            .then(function (r2) {
              return r2.text().then(function (html2) {
                var form2 = (html2.match(
                  /<form[^>]+method=["']POST["'][^>]*>([\s\S]*?)<\/form>/i,
                ) || [])[1];
                if (!form2) return null;
                var params2 = collectInputs(form2);
                params2.down_script = '1';
                return sleep(4500).then(function () {
                  return ctx
                    .fetch(clicknUrl, {
                      method: 'POST',
                      headers: Object.assign(
                        {
                          'User-Agent': ua,
                          Referer: clicknUrl,
                          'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        cookies ? { Cookie: cookies } : {},
                      ),
                      body: formBody(params2),
                    })
                    .then(function (r3) {
                      return r3.text();
                    })
                    .then(function (html3) {
                      var direct =
                        (html3.match(/https?:\/\/[a-zA-Z0-9.\-_:]+\/d\/[a-zA-Z0-9_\-/]+/) ||
                          [])[0] ||
                        (html3.match(/window\.open\(["'](https?:\/\/[^"']+)["']\)/) || [])[1];
                      if (!direct) return null;
                      if (/clicknupload\./i.test(direct) && direct.indexOf('/d/') < 0) return null;
                      return direct;
                    });
                });
              });
            });
        });
      })
      .catch(function () {
        return null;
      });
  }

  function resolveItem(item) {
    var rawUrl = String((item && item.url) || '');
    if (!rawUrl || skipUrl(rawUrl)) return Promise.resolve(null);

    var provider = String((item && item.site) || 'DownloadEverything');
    var streamHeaders = { 'User-Agent': ua };
    var chain;

    if (/hakunaymatata\.com/i.test(rawUrl)) {
      chain = Promise.resolve({
        url: rawUrl,
        provider: 'Moviebox',
        headers: { 'User-Agent': 'Lavf/60.16.100' },
      });
    } else if (/pixeldrain\.(?:dev|com)/i.test(rawUrl)) {
      var pd = rawUrl.match(/pixeldrain\.(?:dev|com)\/(?:u|l)\/([a-zA-Z0-9_-]+)/i);
      chain = pd
        ? Promise.resolve({
            url: 'https://pixeldrain.com/api/file/' + pd[1],
            provider: 'Pixeldrain',
            headers: streamHeaders,
          })
        : Promise.resolve(null);
    } else if (/hubcloud\.|vcloud\.zip/i.test(rawUrl)) {
      chain = resolveHubCloud(rawUrl).then(function (u) {
        return u ? { url: u, provider: 'HubCloud', headers: streamHeaders } : null;
      });
    } else if (/clicknupload\./i.test(rawUrl)) {
      chain = resolveClicknUpload(rawUrl).then(function (u) {
        return u ? { url: u, provider: 'ClicknUpload', headers: streamHeaders } : null;
      });
    } else if (
      /\.(?:mp4|mkv)(?:\?|$)/i.test(rawUrl) &&
      !/\.cyou\/res\//i.test(rawUrl) &&
      !skipUrl(rawUrl)
    ) {
      chain = ctx
        .fetch(rawUrl, { method: 'HEAD', headers: { 'User-Agent': ua } })
        .then(function (check) {
          if (check.status === 200 || check.status === 206 || check.status === 302) {
            return {
              url: rawUrl,
              provider: String((item && item.site) || 'DirectStream'),
              headers: streamHeaders,
            };
          }
          return null;
        })
        .catch(function () {
          return null;
        });
    } else {
      chain = Promise.resolve(null);
    }

    return chain.then(function (resolved) {
      if (!resolved || !resolved.url) return null;
      var tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
      var quality = qualityFromTags(tags);
      var rawTitle = String(item.name || item.release || title || 'Stream');
      return {
        url: resolved.url,
        name: '[' + resolved.provider + '] ' + rawTitle,
        quality: quality,
        headers: resolved.headers || streamHeaders,
      };
    });
  }

  var payload = {
    mode: isTv ? 'series' : 'movie',
    title: title,
  };
  if (ctx.year) payload.year = String(ctx.year).substring(0, 4);
  if (tmdbId) payload.tmdb_id = tmdbId;
  if (imdbId) payload.imdb_id = imdbId;
  if (isTv && season != null) payload.season = season;
  if (isTv && episode != null) payload.episode = episode;

  return ctx
    .fetch(slave, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    })
    .then(function (r) {
      return r.text();
    })
    .then(function (body) {
      var hits = parseHits(body);
      if (!hits.length) return [];
      return Promise.all(
        hits.map(function (item) {
          return resolveItem(item).catch(function () {
            return null;
          });
        }),
      ).then(function (rows) {
        var seen = {};
        var out = [];
        rows.forEach(function (row) {
          if (!row || !row.url || seen[row.url]) return;
          seen[row.url] = true;
          out.push(row);
        });
        return out;
      });
    })
    .catch(function () {
      return [];
    });
}
