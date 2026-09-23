var SPECS = {
  origin: 'https://hindmovie.icu',
  mvlink: 'https://mvlink.blog',
  hshare: 'https://hshare.ink',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || SPECS.origin).replace(/\/$/, '');
  var mvlinkBase = String(cfg.mvlink || SPECS.mvlink).replace(/\/$/, '');
  var hshareBase = String(cfg.hshare || SPECS.hshare).replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var defaultHeaders = {
    'User-Agent': ua,
    Accept: 'application/json, text/html, */*',
  };

  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var title = ctx.title || '';
  var year = ctx.year ? parseInt(String(ctx.year).substring(0, 4), 10) : null;
  var season = ctx.season || null;
  var episode = ctx.episode || null;
  var imdbId = ctx.imdbId ? String(ctx.imdbId) : '';
  var splashCookie = null;

  function getCleanTitle(raw) {
    var s = String(raw || '').toLowerCase();
    s = s.replace(/download/g, '');
    s = s.replace(
      /\b(dual audio|multi audio|hindi|english|tamil|telugu|malayalam|korean|japanese|chinese|spanish|french|italian|german)\b/g,
      '',
    );
    s = s.replace(/\b(480p|720p|1080p|2160p|4k|2k|hd|fhd|uhd)\b/g, '');
    s = s.replace(
      /\b(web-?dl|web-?dlrip|web-?rip|brrip|bdrip|bluray|blu-?ray|hdtv|tvrip|dvdrip|camrip|hdrip)\b/g,
      '',
    );
    s = s.replace(/\b(x264|x265|hevc|10bit|12bit|aac|ac3|dd5\.1|ddp5\.1|atmos|dts)\b/g, '');
    s = s.replace(/\b(season|saison|staffel)\s*\d+(?:\s*(?:-|to)\s*\d+)?\b/g, '');
    s = s.replace(/\bs\d+(?:\s*(?:-|to)\s*\d+)?\b/g, '');
    s = s.replace(/\b(episode|episodes|ep)\s*\d+(?:\s*(?:-|to)\s*\d+)?\s*(added|update|updated)?\b/g, '');
    s = s.replace(/\b(complete|all episodes|pack|batch)\b/g, '');
    s = s.replace(/\b(movie|film|part\s*\d+|vol\s*\d+|volume\s*\d+)\b/g, '');
    s = s.replace(/\b(unrated|extended|directors cut|uncut|18)\b/g, '');
    s = s.replace(/\b(19\d{2}|20\d{2})\b/g, '');
    s = s.replace(/[^a-z0-9]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^(the|a|an)\s+/, '');
    return s;
  }

  function extractYear(s) {
    var m = String(s || '').match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function isStrictMatch(targetTitle, targetYear, postTitle, postYear) {
    var c1 = getCleanTitle(targetTitle);
    var c2 = getCleanTitle(postTitle);
    if (!c1 || !c2) return false;
    if (c1 === c2) return true;
    if (targetYear != null && postYear != null && Math.abs(targetYear - postYear) > 1) return false;
    return c1.indexOf(c2) === 0 || c2.indexOf(c1) === 0;
  }

  function extractSeasonHtml(html, seas) {
    var seasonRegex = /(?:Season|Saison|Staffel)\s+0*(\d+)\b/gi;
    var matches = [];
    var m;
    while ((m = seasonRegex.exec(html))) {
      var startIdx = html.lastIndexOf('<', m.index);
      if (startIdx < 0 || m.index - startIdx > 500) startIdx = m.index;
      var tagPrefix = html.substring(startIdx, Math.min(m.index + 50, html.length)).toLowerCase();
      if (tagPrefix.indexOf('download') >= 0 || tagPrefix.indexOf('episode') >= 0) continue;
      var sNum = parseInt(m[1], 10);
      if (isFinite(sNum)) matches.push({ season: sNum, index: startIdx });
    }
    if (!matches.length) return html;
    var matched = matches.filter(function (e) {
      return e.season === seas;
    });
    if (!matched.length) return html;
    var startIndex = matched[0].index;
    var endIndex = html.length;
    for (var i = 0; i < matches.length; i++) {
      if (matches[i].index > startIndex && matches[i].season !== seas) {
        endIndex = matches[i].index;
        break;
      }
    }
    return html.substring(startIndex, endIndex);
  }

  function parseQuality(context) {
    var c = String(context || '').toLowerCase();
    if (c.indexOf('2160p') >= 0 || c.indexOf('4k') >= 0 || c.indexOf('uhd') >= 0) return '2160p';
    if (c.indexOf('1440p') >= 0 || c.indexOf('2k') >= 0) return '1440p';
    if (c.indexOf('1080p') >= 0 || c.indexOf('fhd') >= 0) return '1080p';
    if (c.indexOf('720p') >= 0 || c.indexOf('hd') >= 0) return '720p';
    if (c.indexOf('480p') >= 0 || c.indexOf('sd') >= 0) return '480p';
    return '1080p';
  }

  function b64urlEncode(str) {
    var b64 =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(str)))
        : ctx.crypto.enc.Base64.stringify(ctx.crypto.enc.Utf8.parse(str));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64Decode(raw) {
    var t = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    try {
      if (ctx.crypto && ctx.crypto.enc) {
        return ctx.crypto.enc.Utf8.stringify(ctx.crypto.enc.Base64.parse(t));
      }
      return decodeURIComponent(escape(atob(t)));
    } catch (e) {
      return '';
    }
  }

  function searchWPJson(query) {
    return ctx
      .fetch(
        origin + '/wp-json/wp/v2/posts?search=' + encodeURIComponent(query) + '&per_page=100',
        { headers: defaultHeaders },
      )
      .then(function (r) {
        return r.json();
      })
      .then(function (decoded) {
        return Array.isArray(decoded) ? decoded : [];
      })
      .catch(function () {
        return [];
      });
  }

  function headerGet(r, name) {
    if (!r || !r.headers) return '';
    if (typeof r.headers.getSetCookie === 'function' && name.toLowerCase() === 'set-cookie') {
      return (r.headers.getSetCookie() || []).join('; ');
    }
    if (r.headers.get) return r.headers.get(name) || r.headers.get(name.toLowerCase()) || '';
    return '';
  }

  function getWithCookieAndRedirects(url, referer, cookie, maxHops) {
    maxHops = maxHops || 5;
    var currentUrl = url;
    var hop = 0;

    function step() {
      if (hop++ >= maxHops) return Promise.resolve(null);
      var hdrs = { 'User-Agent': ua, Referer: referer };
      if (cookie) hdrs.Cookie = cookie;
      return ctx.fetch(currentUrl, { headers: hdrs, redirect: 'manual' }).then(function (res) {
        if (res.status >= 300 && res.status < 400) {
          var loc = headerGet(res, 'location');
          if (loc) {
            try {
              currentUrl = new URL(loc, currentUrl).href;
            } catch (e) {
              currentUrl = loc;
            }
            return step();
          }
        }
        return res.text().then(function (body) {
          return { status: res.status, body: body, headers: res.headers, url: currentUrl };
        });
      });
    }
    return step().catch(function () {
      return null;
    });
  }

  function solveHShareChallenge(rUrl, html, referer) {
    try {
      var uMatch = html.match(/var\s+U\s*=\s*\[([\s\S]*?)\];/);
      if (!uMatch) return Promise.resolve(null);
      var u = [];
      var um;
      var ure = /'([^']*)'/g;
      while ((um = ure.exec(uMatch[1]))) u.push(um[1]);

      var rotMatch = html.match(/\}\(a0w\s*,\s*(0x[0-9a-fA-F]+|\d+)\)\);/);
      if (!rotMatch) return Promise.resolve(null);
      var targetR = parseInt(rotMatch[1], 10);

      var baseMatch = html.match(/e\s*=\s*e\s*-\s*(0x[0-9a-fA-F]+|\d+);/);
      if (!baseMatch) return Promise.resolve(null);
      var baseOffset = parseInt(baseMatch[1], 10);

      var mapMatch = html.match(/var\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\}\s*,\s*a\s*=\s*a0e/);
      var a0qMap = {};
      if (mapMatch) {
        mapMatch[2].split(',').forEach(function (pair) {
          var parts = pair.split(':');
          if (parts.length === 2) a0qMap[parts[0].trim()] = parseInt(parts[1].trim(), 10);
        });
      }

      var exprMatch = html.match(/var\s+e\s*=\s*([^;]+);\s*if\s*\(\s*e\s*===\s*r\s*\)/);
      if (!exprMatch) return Promise.resolve(null);
      var exprStr = exprMatch[1];

      function parseIntLeading(s) {
        var m = String(s).match(/^-?\d+/);
        return m ? parseInt(m[0], 10) : 0;
      }

      function a(code) {
        var idx = code - baseOffset;
        if (idx < 0 || idx >= u.length) return '';
        return u[idx];
      }

      function evalTerm(term) {
        var mults = term.split('*');
        var termVal = 1;
        for (var mi = 0; mi < mults.length; mi++) {
          var mTrim = mults[mi].trim();
          var isNeg = mTrim.indexOf('(-') === 0 || mTrim.charAt(0) === '-';
          var callMatch = mTrim.match(/a\((0x[0-9a-fA-F]+|[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/);
          var code = 0;
          if (callMatch) {
            var arg = callMatch[1];
            if (arg.indexOf('.') >= 0) code = a0qMap[arg.split('.')[1]] || 0;
            else code = parseInt(arg, 10);
          }
          var strVal = a(code);
          var intVal = parseIntLeading(strVal);
          var divMatch = mTrim.match(/\/\s*(0x[0-9a-fA-F]+|\d+)/);
          var divisor = divMatch ? parseInt(divMatch[1], 10) : 1;
          var partVal = intVal / divisor;
          if (isNeg) partVal = -partVal;
          termVal *= partVal;
        }
        return termVal;
      }

      var terms = exprStr.replace(/\+-/g, '-').split('+');
      var iterations = 0;
      while (iterations < 200) {
        var sum = 0;
        for (var ti = 0; ti < terms.length; ti++) {
          var t = terms[ti];
          if (t.indexOf('-') >= 0 && t.indexOf('(-') < 0) {
            var sub = t.split('-');
            sum += evalTerm(sub[0]);
            for (var si = 1; si < sub.length; si++) {
              if (sub[si]) sum -= evalTerm(sub[si]);
            }
          } else {
            sum += evalTerm(t);
          }
        }
        if (Math.round(sum) === targetR) break;
        u.push(u.shift());
        iterations++;
      }

      var a0gMatch = html.match(
        /var\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\}\s*;\s*setTimeout\s*\(\s*function\s*\(\)\s*\{/,
      );
      var a0gMap = {};
      if (a0gMatch) {
        a0gMatch[2].split(',').forEach(function (pair) {
          var parts = pair.split(':');
          if (parts.length === 2) a0gMap[parts[0].trim()] = parseInt(parts[1].trim(), 10);
        });
      }

      function parseDigits(expr) {
        var parts = expr.split(/\)\s*\+\s*\(/);
        var s = '';
        for (var i = 0; i < parts.length; i++) {
          var count = (parts[i].match(/!\+\[\]|!!\[\]/g) || []).length;
          s += String(count);
        }
        return parseInt(s, 10) || 0;
      }

      var rDigitsMatch = html.match(/r=\+\(([\s\S]*?)\),\s*w=/);
      var xDigitsMatch = html.match(/x=\+\(([\s\S]*?)\),\s*s=/);
      if (!rDigitsMatch || !xDigitsMatch) return Promise.resolve(null);
      var wsidchk = String(parseDigits(rDigitsMatch[1]) + parseDigits(xDigitsMatch[1]));

      var wActionMatch = html.match(/W\s*=\s*'(\/[a-zA-Z0-9]+)'/);
      if (!wActionMatch) return Promise.resolve(null);
      var actionPath = wActionMatch[1];

      var pDataMatch = html.match(/P\s*=\s*'([^']+)'/);
      if (!pDataMatch) return Promise.resolve(null);
      var pdata = pDataMatch[1];

      var tsMatch =
        html.match(/'ts'\s*,\s*'(\d+)'/) ||
        html.match(/'ts'\s*,\s*[^=]+(?:'value'|L\([^)]+\))\s*=\s*'(\d+)'/) ||
        html.match(/E\[L\([^)]+\)\]\s*=\s*'(\d+)'/);
      var ts = (tsMatch && tsMatch[1]) || String(Math.floor(Date.now() / 1000));

      var idStmtMatch = html.match(/o\['value'\]\s*=\s*([^;,]+)[;,]/);
      var idVal = '';
      if (idStmtMatch) {
        var pieces = idStmtMatch[1].split('+');
        for (var pi = 0; pi < pieces.length; pi++) {
          var pTrim = pieces[pi].trim();
          if (pTrim.charAt(0) === "'" && pTrim.charAt(pTrim.length - 1) === "'") {
            idVal += pTrim.substring(1, pTrim.length - 1);
          } else {
            var lMatch = pTrim.match(/L\((0x[0-9a-fA-F]+|[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\)/);
            if (lMatch) {
              var larg = lMatch[1];
              var lcode = 0;
              if (larg.indexOf('.') >= 0) lcode = a0gMap[larg.split('.')[1]] || 0;
              else lcode = parseInt(larg, 10);
              idVal += a(lcode);
            }
          }
        }
      }

      var challengeUrl =
        hshareBase +
        actionPath +
        '?wsidchk=' +
        wsidchk +
        '&pdata=' +
        encodeURIComponent(pdata) +
        '&id=' +
        encodeURIComponent(idVal) +
        '&ts=' +
        ts +
        '&cttl=0';

      return ctx
        .fetch(challengeUrl, {
          redirect: 'manual',
          headers: {
            'User-Agent': ua,
            Referer: rUrl,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        })
        .then(function (chalRes) {
          var cookieHeader = headerGet(chalRes, 'set-cookie');
          var locationHeader = headerGet(chalRes, 'location');
          var cookie = cookieHeader ? cookieHeader.split(';')[0] : '';
          if (cookie) splashCookie = cookie;
          var finalTarget = locationHeader
            ? /^https?:/i.test(locationHeader)
              ? locationHeader
              : hshareBase + locationHeader
            : rUrl;
          return getWithCookieAndRedirects(finalTarget, rUrl, cookie).then(function (finalRes) {
            if (finalRes && finalRes.status === 200) return finalRes.body;
            return null;
          });
        });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function fetchRPageWithBypass(rUrl, referer) {
    var cached = splashCookie
      ? getWithCookieAndRedirects(rUrl, referer, splashCookie).then(function (cachedRes) {
          if (cachedRes && cachedRes.status === 200 && cachedRes.body.indexOf('wsidchk') < 0) {
            return cachedRes.body;
          }
          return null;
        })
      : Promise.resolve(null);

    return cached.then(function (hit) {
      if (hit) return hit;
      return getWithCookieAndRedirects(rUrl, referer).then(function (initialRes) {
        if (!initialRes || initialRes.status !== 200) return null;
        if (initialRes.body.indexOf('wsidchk') < 0) return initialRes.body;
        return solveHShareChallenge(rUrl, initialRes.body, referer);
      });
    });
  }

  function appendTimestamp(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 's=' + Date.now();
  }

  function resolveHCloudUrl(hcloudUrl, referer) {
    try {
      var uri = new URL(hcloudUrl);
      var rawParam = uri.searchParams.get('url');
      if (!rawParam) return Promise.resolve(null);
      var decoded = b64Decode(rawParam);
      if (!/^https?:/i.test(decoded)) return Promise.resolve(null);
      if (decoded.indexOf('.workers.dev') >= 0 || decoded.indexOf('.powerly.dev') >= 0) {
        return Promise.resolve(appendTimestamp(decoded));
      }
      var nestedMatch = decoded.match(/url=([^&]+)/i);
      if (nestedMatch) {
        var nestedDecoded = b64Decode(nestedMatch[1]);
        if (
          nestedDecoded.indexOf('.workers.dev') >= 0 ||
          nestedDecoded.indexOf('.powerly.dev') >= 0
        ) {
          return Promise.resolve(appendTimestamp(nestedDecoded));
        }
      }
      return ctx
        .fetch(decoded, { headers: { 'User-Agent': ua, Referer: referer } })
        .then(function (r) {
          return r.text();
        })
        .then(function (body) {
          var match = body.match(/href="([^"]+\.(?:workers\.dev|powerly\.dev)[^"]+)"/i);
          return match ? appendTimestamp(match[1]) : null;
        })
        .catch(function () {
          return null;
        });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function buildStreamRow(url, quality, rawFileName, serverLabel) {
    var nameLower = String(rawFileName || url).toLowerCase();
    var audioBadge = 'Single-Audio';
    if (
      nameLower.indexOf('dual') >= 0 ||
      (nameLower.indexOf('hindi') >= 0 && nameLower.indexOf('english') >= 0)
    ) {
      audioBadge = 'Dual-Audio';
    } else if (nameLower.indexOf('multi') >= 0) audioBadge = 'Multi-Audio';
    else if (nameLower.indexOf('hindi') >= 0) audioBadge = 'Hindi';
    else if (nameLower.indexOf('tamil') >= 0) audioBadge = 'Tamil';
    else if (nameLower.indexOf('telugu') >= 0) audioBadge = 'Telugu';
    else if (nameLower.indexOf('english') >= 0) audioBadge = 'English';

    return {
      url: url,
      name: 'HindMoviez · ' + quality + ' · ' + audioBadge + ' · ' + serverLabel,
      quality: quality,
      headers: defaultHeaders,
    };
  }

  function bypassHShareAPI(hshareId, mvlinkUrl) {
    var b64 = b64urlEncode(hshareId);
    return ctx
      .fetch(mvlinkBase + '/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: mvlinkUrl,
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': ua,
        },
        body: 'action=hindshare_sign&d=' + encodeURIComponent(b64),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        if (json && json.success === true && json.data && json.data.url) return String(json.data.url);
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function resolveHShare(hshareId, mvlinkUrl, quality, targetTitle) {
    return bypassHShareAPI(hshareId, mvlinkUrl).then(function (rUrl) {
      if (!rUrl) return [];
      return fetchRPageWithBypass(rUrl, mvlinkUrl).then(function (downloadHtml) {
        if (!downloadHtml) return [];
        var nameMatch = downloadHtml.match(/Name:\s*([^<]+)/i);
        var rawFileName = nameMatch ? nameMatch[1].trim() : '';
        var hcloudRe = /href="([^"]+hcloud\.ink[^"]+)"/gi;
        var hcloudUrls = [];
        var hm;
        while ((hm = hcloudRe.exec(downloadHtml))) hcloudUrls.push(hm[1]);
        if (!hcloudUrls.length) return [];

        return Promise.all(
          hcloudUrls.map(function (hcloudUrl, idx) {
            return resolveHCloudUrl(hcloudUrl, rUrl).then(function (directUrl) {
              if (!directUrl) return null;
              return buildStreamRow(directUrl, quality, rawFileName, 'Server ' + (idx + 1));
            });
          }),
        ).then(function (rows) {
          return rows.filter(Boolean);
        });
      });
    });
  }

  function processMvlink(mvlinkUrl, quality, targetTitle) {
    return ctx
      .fetch(mvlinkUrl, { headers: { 'User-Agent': ua, Referer: origin + '/' } })
      .then(function (r) {
        return r.text();
      })
      .then(function (mvHtml) {
        var hshareRe =
          /href="(?:https:\/\/hshare\.ink\/\?id=([^"]+)|https:\/\/hshare\.ink\/dl\/([^"]+))"/gi;
        var hshareIds = [];
        var m;
        while ((m = hshareRe.exec(mvHtml))) {
          var id = m[1] || m[2];
          if (id) {
            try {
              hshareIds.push(decodeURIComponent(id));
            } catch (e) {
              hshareIds.push(id);
            }
          }
        }
        if (!hshareIds.length) return [];

        if (isTv && episode != null) {
          var epIdx = episode - 1;
          if (epIdx >= 0 && epIdx < hshareIds.length) {
            return resolveHShare(hshareIds[epIdx], mvlinkUrl, quality, targetTitle).then(function (
              stream,
            ) {
              if (stream.length) return stream;
              return resolveAllHShares(hshareIds, mvlinkUrl, quality, targetTitle);
            });
          }
        }
        return resolveAllHShares(hshareIds, mvlinkUrl, quality, targetTitle);
      })
      .catch(function () {
        return [];
      });
  }

  function resolveAllHShares(hshareIds, mvlinkUrl, quality, targetTitle) {
    if (!isTv) {
      // Movies: stop after first successful quality stream
      var chain = Promise.resolve([]);
      hshareIds.forEach(function (id) {
        chain = chain.then(function (acc) {
          if (acc.length) return acc;
          return resolveHShare(id, mvlinkUrl, quality, targetTitle);
        });
      });
      return chain;
    }
    return Promise.all(
      hshareIds.map(function (id) {
        return resolveHShare(id, mvlinkUrl, quality, targetTitle);
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  var cleanTitle = getCleanTitle(title);
  var postsPromise =
    imdbId && imdbId.indexOf('tt') === 0
      ? searchWPJson(imdbId).then(function (posts) {
          if (posts.length) return posts;
          return cleanTitle ? searchWPJson(cleanTitle) : [];
        })
      : cleanTitle
        ? searchWPJson(cleanTitle)
        : Promise.resolve([]);

  return postsPromise
    .then(function (posts) {
      if (!posts.length) return [];

      var matchedPost = null;
      if (imdbId) {
        for (var i = 0; i < posts.length; i++) {
          var content = (((posts[i].content || {}).rendered) || '').toString();
          if (content.indexOf(imdbId) >= 0) {
            matchedPost = posts[i];
            break;
          }
        }
      }
      if (!matchedPost) {
        for (var j = 0; j < posts.length; j++) {
          var postTitle = (((posts[j].title || {}).rendered) || '').toString();
          var postYear = extractYear(postTitle);
          if (isStrictMatch(title, year, postTitle, postYear)) {
            matchedPost = posts[j];
            break;
          }
        }
      }
      if (!matchedPost) {
        var targetClean = getCleanTitle(title);
        for (var k = 0; k < posts.length; k++) {
          var pt = (((posts[k].title || {}).rendered) || '').toString();
          var pClean = getCleanTitle(pt);
          if (pClean.indexOf(targetClean) >= 0 || targetClean.indexOf(pClean) >= 0) {
            matchedPost = posts[k];
            break;
          }
        }
      }
      if (!matchedPost) return [];

      var contentHtml = (((matchedPost.content || {}).rendered) || '').toString();
      var postTitleRendered = (((matchedPost.title || {}).rendered) || title).toString();
      if (isTv && season != null) {
        var seasonHtml = extractSeasonHtml(contentHtml, season);
        if (seasonHtml) contentHtml = seasonHtml;
      }

      var mvlinkRe = /href="(https?:\/\/mvlink\.blog\/(?:web\/)?\d+)"/gi;
      var mvLinks = [];
      var mm;
      while ((mm = mvlinkRe.exec(contentHtml))) {
        var url = mm[1];
        var startIdx = Math.max(0, mm.index - 500);
        var preceding = contentHtml.substring(startIdx, mm.index);
        var quality = parseQuality(preceding);
        if (quality === '480p') continue;
        mvLinks.push({ url: url, quality: quality });
      }
      if (!mvLinks.length) return [];

      return Promise.all(
        mvLinks.map(function (mv) {
          return processMvlink(mv.url, mv.quality, postTitleRendered);
        }),
      ).then(function (groups) {
        var seen = {};
        var rows = [];
        for (var gi = 0; gi < groups.length; gi++) {
          var part = groups[gi] || [];
          for (var ri = 0; ri < part.length; ri++) {
            if (seen[part[ri].url]) continue;
            seen[part[ri].url] = true;
            rows.push(part[ri]);
          }
        }
        return rows;
      });
    })
    .catch(function () {
      return [];
    });
}
