var SPECS = {
  "api": "https://api.2embed.cc",
  "embed": "https://www.2embed.cc"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = cfg.api;
  var embedBase = cfg.embed;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Referer: embedBase + '/' };
  var tmdbId = String(ctx.tmdbId);
  var mediaType = ctx.type === 'movie' ? 'movie' : 'tv';
  var season = ctx.season || 1;
  var episode = ctx.episode || 1;

  ctx.log('start tmdb=' + tmdbId + ' type=' + mediaType);

  function getText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      return r.text();
    });
  }

  function getJson(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      return r.json();
    });
  }

  function originOf(url) {
    var m = String(url || '').match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : '';
  }

  function absUrl(u, base) {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, base).toString();
    } catch (e) {
      return u;
    }
  }

  function classifyServer(url) {
    var u = String(url || '');
    if (/streamsrcs\.2embed\.cc\/swish/i.test(u)) return 'swish';
    if (/streamsrcs\.2embed\.cc\/xps/i.test(u)) return 'xps';
    if (/streamsrcs\.2embed\.cc\/vesy/i.test(u)) return 'vesy';
    if (/streamsrcs\.2embed\.cc\/vcr/i.test(u)) return 'vcr';
    if (/vidsrc\.buzz\//i.test(u)) return 'buzz';
    if (/videm\.xyz\//i.test(u)) return 'videm';
    return '';
  }

  function parseServers(html) {
    var servers = [];
    var re = /onclick="go\('(https?:\/\/[^']+)'\)"/g;
    var m;
    while ((m = re.exec(html))) {
      var type = classifyServer(m[1]);
      if (!type) continue;
      servers.push({ url: m[1], type: type });
    }
    var ds = (html.match(/data-src="([^"]+)"/) || [])[1];
    if (ds && !servers.some(function (s) { return s.url === ds; })) {
      var type = classifyServer(ds) || 'swish';
      servers.unshift({ url: ds, type: type });
    }
    return servers;
  }

  function param(url, key) {
    var m = String(url).match(new RegExp('[?&]' + key + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function resolveSrc(server) {
    var content = mediaType === 'tv' ? 'tv' : 'movie';
    if (server.type === 'swish') {
      var hash = param(server.url, 'id') || server.url.split('/').pop();
      return 'https://2vcdn.skin/e/' + hash;
    }
    if (server.type === 'xps') {
      if (mediaType === 'tv') {
        var tmdb = param(server.url, 'tmdb') || tmdbId;
        var s = param(server.url, 's') || season;
        var e = param(server.url, 'e') || episode;
        return 'https://play.xpass.top/e/tv/' + tmdb + '/' + s + '/' + e + '?autostart=true';
      }
      var imdb = param(server.url, 'imdb');
      return 'https://play.xpass.top/e/movie/' + imdb + (imdb ? '?autostart=true' : '');
    }
    if (server.type === 'vesy') {
      return 'https://player.videasy.to/' + content + '/' + (param(server.url, 'tmdb') || tmdbId);
    }
    if (server.type === 'vcr') {
      return (
        'https://vidcore.net/' +
        content +
        '/' +
        (param(server.url, 'tmdb') || tmdbId) +
        (content === 'tv' ? '/' + season + '/' + episode : '') +
        '/'
      );
    }
    return server.url;
  }

  function balanced(html, openIdx) {
    var open = html.charAt(openIdx);
    var close = open === '[' ? ']' : '}';
    var depth = 0;
    var inStr = false;
    var esc = false;
    for (var i = openIdx; i < html.length; i++) {
      var ch = html.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return html.slice(openIdx, i + 1);
      }
    }
    return '';
  }

  // xpass lists dead mirrors next to live 1x2 CDNs (NXDOMAIN / hang).
  function isDeadCdn(url) {
    return /pinecrestproductionworks\.shop|goldenmeadowproduction\.space/i.test(String(url));
  }

  function cdnRank(url) {
    var u = String(url || '');
    if (/1x2\.space\//i.test(u)) return 0;
    if (/vidsrc\.buzz\/_stream|videm\.xyz\/_stream/i.test(u)) return 0;
    if (/2vcdn\.skin\/stream\//i.test(u)) return 1;
    if (/suprox\.xpass\.top/i.test(u)) return 3;
    return 2;
  }

  function rankRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      return cdnRank(a && a.url) - cdnRank(b && b.url);
    });
  }

  function playlistRows(playlistUrl, baseUrl, referer) {
    var full = /^https?:/i.test(playlistUrl)
      ? playlistUrl
      : baseUrl.replace(/\/$/, '') + (playlistUrl.charAt(0) === '/' ? '' : '/') + playlistUrl;
    return getJson(full, { Referer: referer, Origin: baseUrl, Accept: 'application/json,*/*' })
      .then(function (data) {
        var rows = [];
        var items = data && Array.isArray(data.playlist) ? data.playlist : [];
        items.forEach(function (item) {
          (item && item.sources ? item.sources : []).forEach(function (source) {
            if (!source || !source.file) return;
            if (/\/video\/error|\/error\b/i.test(source.file)) return;
            if (!/^https?:/i.test(source.file)) return;
            if (isDeadCdn(source.file)) return;
            rows.push({
              url: source.file,
              name: '2embed ' + (source.label || source.id || ''),
              quality: source.label || '',
              headers: { 'User-Agent': ua, Referer: 'https://play.xpass.top/' },
            });
          });
        });
        return rankRows(rows);
      })
      .catch(function () {
        return [];
      });
  }

  function followXps(xpsUrl) {
    var xpsBase = 'https://play.xpass.top';
    return getText(xpsUrl, { Referer: 'https://streamsrcs.2embed.cc/' }).then(function (html) {
      var primary = '';
      var dataKey = html.indexOf('var data=');
      if (dataKey >= 0) {
        var objStart = html.indexOf('{', dataKey);
        var json = objStart >= 0 ? balanced(html, objStart) : '';
        try {
          var data = JSON.parse(json);
          if (data && typeof data.playlist === 'string') primary = data.playlist;
        } catch (e) {}
      }
      var backups = [];
      var backupsKey = html.indexOf('var backups=');
      if (backupsKey >= 0) {
        var arrStart = html.indexOf('[', backupsKey);
        var bjson = arrStart >= 0 ? balanced(html, arrStart) : '';
        try {
          backups = JSON.parse(bjson) || [];
        } catch (e2) {}
      }
      // Prefer VIP / mdata paths (1x2) before flaky FIL/WIS mirrors.
      backups = backups.slice().sort(function (a, b) {
        function pathRank(u) {
          u = String((u && u.url) || '');
          if (/\/vip\//i.test(u)) return 0;
          if (/\/mdata\//i.test(u)) return 1;
          return 2;
        }
        return pathRank(a) - pathRank(b);
      });
      var paths = [];
      if (primary) paths.push(primary);
      backups.slice(0, 12).forEach(function (b) {
        if (b && b.url) paths.push(b.url);
      });
      return Promise.all(paths.map(function (p) {
        return playlistRows(p, xpsBase, xpsUrl);
      })).then(function (groups) {
        var out = rankRows([].concat.apply([], groups));
        if (out.length) return out;
        var m3u8 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g) || [];
        return rankRows(
          m3u8
            .filter(function (u) {
              return !isDeadCdn(u);
            })
            .map(function (u) {
              return {
                url: u,
                name: '2embed',
                headers: { 'User-Agent': ua, Referer: 'https://play.xpass.top/' },
              };
            })
        );
      });
    });
  }

  function unpackHtml(html) {
    try {
      if (globalThis.__engineUnpack) return globalThis.__engineUnpack(html) || html;
    } catch (e) {}
    return html;
  }

  function followSwish(playerUrl) {
    var origin = originOf(playerUrl) || 'https://2vcdn.skin';
    return getText(playerUrl, { Referer: 'https://streamsrcs.2embed.cc/' }).then(function (html) {
      var unpacked = unpackHtml(html);
      // Prefer the site's primary playlist (hls4); fall back through mirrors.
      var preferred =
        (unpacked.match(/"hls4"\s*:\s*"([^"]+)"/) || [])[1] ||
        (unpacked.match(/"hls2"\s*:\s*"([^"]+)"/) || [])[1] ||
        (unpacked.match(/"hls3"\s*:\s*"([^"]+)"/) || [])[1] ||
        (unpacked.match(/file\s*:\s*["'](https?:[^"']+)["']/) || [])[1] ||
        (unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/) || [])[0] ||
        (html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/) || [])[0] ||
        '';
      var u = absUrl(preferred, origin + '/');
      if (u && !isDeadCdn(u) && (/\.m3u8(\?|$)/i.test(u) || /\/stream\//i.test(u) || /\.txt(\?|$)/i.test(u))) {
        return [
          {
            url: u,
            name: '2embed Swish',
            headers: { 'User-Agent': ua, Referer: origin + '/', Origin: origin },
          },
        ];
      }
      return ctx.hop(playerUrl).then(function (hopped) {
        return hopped && hopped.length ? hopped : [];
      });
    });
  }

  function parsePlayerQ(html) {
    var key = html.indexOf('var Q =');
    if (key < 0) key = html.indexOf('var Q=');
    if (key < 0) return null;
    var objStart = html.indexOf('{', key);
    if (objStart < 0) return null;
    var json = balanced(html, objStart);
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function playerApiBase(embedUrl, html) {
    var origin = originOf(embedUrl);
    var baseHref = ((html.match(/<base[^>]+href=["']([^"']+)["']/i) || [])[1] || '').trim();
    if (baseHref) {
      try {
        return new URL(baseHref, origin + '/').toString().replace(/\/?$/, '/');
      } catch (e) {}
    }
    if (/vidsrc\.buzz/i.test(origin)) return origin + '/pl/';
    return origin + '/';
  }

  function followPlayer(embedUrl) {
    var origin = originOf(embedUrl);
    return ctx
      .fetch(embedUrl, {
        headers: Object.assign({}, headers, { Referer: embedBase + '/', Origin: origin }),
      })
      .then(function (r) {
        return r.text().then(function (html) {
          var Q = parsePlayerQ(html);
          var servers =
            Q && Q.ssr && Array.isArray(Q.ssr.servers) ? Q.ssr.servers : [];
          if (!Q || !servers.length) return [];
          var apiBase = playerApiBase(embedUrl, html);
          var token = Q.t || '';
          var labelPrefix = /videm\.xyz/i.test(origin) ? '2embed Videm' : '2embed VidSrc';
          var tasks = servers.map(function (server) {
            if (!server || !server.ref) return Promise.resolve(null);
            var playUrl =
              apiBase +
              'api.php?a=play&ref=' +
              encodeURIComponent(server.ref) +
              '&t=' +
              encodeURIComponent(token);
            return ctx
              .fetch(playUrl, {
                headers: {
                  'User-Agent': ua,
                  Referer: embedUrl,
                  Origin: origin,
                  Accept: 'application/json,*/*',
                },
              })
              .then(function (pr) {
                return pr.json();
              })
              .then(function (j) {
                if (!j || !j.url) return null;
                var streamUrl = absUrl(String(j.url), origin + '/');
                if (!streamUrl) return null;
                if (/cap\.php/i.test(streamUrl)) return null;
                if (/\/video\/error|\/error\b/i.test(streamUrl)) return null;
                var chip = String(server.name || 'Server').replace(/^Server\s+/i, '');
                return {
                  url: streamUrl,
                  name: labelPrefix + ' · ' + chip,
                  headers: { 'User-Agent': ua, Referer: origin + '/', Origin: origin },
                };
              })
              .catch(function () {
                return null;
              });
          });
          return Promise.all(tasks).then(function (parts) {
            return rankRows(parts.filter(Boolean));
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  function embedPath(imdbId) {
    if (mediaType === 'movie') return '/embed/' + (imdbId || tmdbId);
    return '/embedtv/' + tmdbId + '&s=' + season + '&e=' + episode;
  }

  var imdbP =
    mediaType === 'movie'
      ? getJson(api + '/movie?tmdb_id=' + tmdbId)
          .then(function (d) {
            return (d && d.imdb_id) || ctx.imdbId || '';
          })
          .catch(function () {
            return ctx.imdbId || '';
          })
      : Promise.resolve(ctx.imdbId || '');

  return imdbP
    .then(function (imdb) {
      return getText(embedBase + embedPath(imdb));
    })
    .then(function (html) {
      var servers = parseServers(html);
      if (!servers.length) {
        ctx.error('multiembed: no embed servers');
        return [];
      }
      // Collect every listed server (and nested player chips) — do not stop at first hit.
      var order = ['swish', 'buzz', 'videm', 'xps', 'vesy', 'vcr'];
      var seenType = {};
      var tasks = [];
      order.forEach(function (type) {
        servers.forEach(function (server) {
          if (server.type !== type || seenType[type]) return;
          seenType[type] = true;
          var finalUrl = resolveSrc(server);
          var job;
          if (type === 'xps') job = followXps(finalUrl);
          else if (type === 'swish') job = followSwish(finalUrl);
          else if (type === 'buzz' || type === 'videm') job = followPlayer(finalUrl);
          else if (type === 'vcr') {
            job = ctx.hop(finalUrl).then(function (rows) {
              return rows && rows.length ? rows : [];
            });
          } else {
            job = getText(finalUrl, { Referer: 'https://streamsrcs.2embed.cc/' })
              .then(function (playerHtml) {
                var urls = playerHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g) || [];
                var rows = urls.map(function (u) {
                  return {
                    url: u,
                    name: '2embed ' + type,
                    headers: { 'User-Agent': ua, Referer: finalUrl },
                  };
                });
                if (rows.length) return rows;
                return ctx.hop(finalUrl);
              })
              .catch(function () {
                return [];
              });
          }
          tasks.push(
            Promise.resolve(job).catch(function () {
              return [];
            })
          );
        });
      });
      return Promise.all(tasks).then(function (groups) {
        var seen = {};
        var out = [];
        rankRows([].concat.apply([], groups)).forEach(function (r) {
          if (!r || !r.url || seen[r.url] || isDeadCdn(r.url)) return;
          seen[r.url] = true;
          out.push(r);
        });
        if (!out.length) ctx.error('multiembed: servers did not resolve');
        ctx.log('multiembed: servers=' + servers.length + ' streams=' + out.length);
        return out;
      });
    })
    .catch(function (e) {
      ctx.error(e && e.message ? e.message : e);
      return [];
    });
}
