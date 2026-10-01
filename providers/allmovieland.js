var SPECS = {
  "base": "https://allmovieland.art",
  "playerJs": "https://allmovieland.link/player.js",
  "tmdbKey": "439c478a771f35c05022f9feabcca01c"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var mainUrl = cfg.base.replace(/\/$/, '');
  var playerJs = (cfg.playerJs || (mainUrl + '/player.js')).replace(/\?.*$/, '');
  var tmdbKey = cfg.tmdbKey;
  var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var hdrs = { 'User-Agent': ua, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.5' };
  var isTv = ctx.type !== 'movie';

  function fetchText(url, extra) {
    return ctx.fetch(url, { headers: Object.assign({}, hdrs, extra || {}) }).then(function (r) { return r.text(); });
  }

  function getTmdb() {
    var kind = isTv ? 'tv' : 'movie';
    return ctx.fetch(
      'https://tmdb.forjahq.xyz/3/' + kind + '/' + encodeURIComponent(String(ctx.tmdbId || '')) +
        '?api_key=' + encodeURIComponent(tmdbKey) + '&append_to_response=external_ids',
      { headers: { 'User-Agent': ua, Accept: 'application/json' } },
    ).then(function (r) { return r.json(); })
      .then(function (d) {
        var title = isTv ? d.name : d.title;
        var date = (d.release_date || d.first_air_date) || '';
        var year = date ? parseInt(date.split('-')[0], 10) : null;
        return { title: title, year: year, imdbId: (d.external_ids && d.external_ids.imdb_id) || null };
      });
  }

  function normTitle(t) {
    return String(t || '').toLowerCase()
      .replace(/\b(the|a|an)\b/g, '').replace(/[:\-_]/g, ' ')
      .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function titleScore(a, b) {
    var na = normTitle(a).split(/\s+/).filter(Boolean);
    var nb = normTitle(b).split(/\s+/).filter(Boolean);
    if (!na.length || !nb.length) return 0;
    var sb = new Set(nb);
    var inter = na.filter(function (w) { return sb.has(w); });
    var union = new Set(na.concat(nb));
    var score = inter.length / union.size;
    if (na.every(function (w) { return sb.has(w); })) score += 0.2;
    return score;
  }

  function bestMatch(info, results) {
    var best = null, bestScore = 0;
    results.forEach(function (r) {
      var score = titleScore(info.title, r.title);
      if (info.year && r.year) {
        var diff = Math.abs(info.year - r.year);
        if (diff === 0) score += 0.2;
        else if (diff <= 1) score += 0.1;
        else if (diff > 5) score -= 0.3;
      }
      if (score > bestScore && score > 0.3) { bestScore = score; best = r; }
    });
    return best;
  }

  function absUrl(href) {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href.charAt(0) === '/') return mainUrl + href;
    return mainUrl + '/' + href;
  }

  function parsePlayerHosts(text) {
    var hosts = [];
    var re = /AwsIndStreamDomain\s*=\s*['"]([^'"]+)['"]/g;
    var m;
    while ((m = re.exec(String(text || ''))) !== null) {
      var h = String(m[1] || '').replace(/\/$/, '');
      if (h && hosts.indexOf(h) < 0) hosts.push(h);
    }
    return hosts;
  }

  function loadPlayerHosts(pageHtml) {
    var fromPage = parsePlayerHosts(pageHtml);
    return Promise.all([
      fetchText(playerJs).catch(function () { return ''; }),
      fetchText(mainUrl + '/player.js').catch(function () { return ''; }),
    ]).then(function (parts) {
      var hosts = [];
      parts.concat([pageHtml || '']).forEach(function (text) {
        parsePlayerHosts(text).forEach(function (h) {
          if (hosts.indexOf(h) < 0) hosts.push(h);
        });
      });
      // Prefer live player.js hosts; keep page-inline as last resort.
      fromPage.forEach(function (h) {
        if (hosts.indexOf(h) < 0) hosts.push(h);
      });
      return hosts;
    });
  }

  function parseP3(embedHtml) {
    var raw = String(embedHtml || '');
    try {
      var embed$ = ctx.html(embedHtml);
      var picked = embed$('body > script').last().html() || '';
      if (!picked) {
        embed$('script').each(function () {
          var s = embed$(this).html() || '';
          if (/p3\s*=/.test(s) || /"file"\s*:/.test(s)) picked = s;
        });
      }
      if (picked) raw = picked;
    } catch (e) { /* fall through to full-html regex */ }
    var p3M = raw.match(/let\s+p3\s*=\s*(\{[\s\S]*?\});/) ||
      raw.match(/var\s+p3\s*=\s*(\{[\s\S]*?\});/) ||
      raw.match(/const\s+p3\s*=\s*(\{[\s\S]*?\});/);
    if (p3M) {
      try { return JSON.parse(p3M[1]); } catch (e) { /* continue */ }
    }
    var fileM = raw.match(/"file"\s*:\s*"([^"]+)"/);
    var keyM = raw.match(/"key"\s*:\s*"([^"]+)"/);
    if (fileM && keyM) {
      return { file: fileM[1].replace(/\\\//g, '/'), key: keyM[1].replace(/\\\//g, '/') };
    }
    return null;
  }

  function streamsFromPlayer(playerDomain, playId, referer) {
    var embedLink = playerDomain.replace(/\/$/, '') + '/play/' + playId;
    return fetchText(embedLink, { Referer: referer || mainUrl + '/' }).then(function (embedHtml) {
      if (/just a moment|challenge-platform|404 Not Found|Page not found/i.test(embedHtml || '')) return [];
      var json = parseP3(embedHtml);
      if (!json || !json.file || !json.key) return [];
      var fileUrl = String(json.file).replace(/\\\//g, '/');
      if (!fileUrl.startsWith('http')) fileUrl = playerDomain.replace(/\/$/, '') + fileUrl;
      return ctx.fetch(fileUrl, {
        method: 'POST',
        headers: Object.assign({}, hdrs, { 'X-CSRF-TOKEN': json.key, Referer: embedLink }),
      }).then(function (r) { return r.text(); }).then(function (fileText) {
        var parsed;
        try { parsed = JSON.parse(String(fileText || '').replace(/,\s*\]/g, ']')); } catch (e) { return []; }
        if (!Array.isArray(parsed)) return [];
        var targetFiles = [];
        if (!isTv) {
          targetFiles = parsed.filter(function (s) { return s && s.file; });
        } else {
          var seasonData = parsed.find(function (s) {
            var m = (s.title || '').match(/Season\s*(\d+)/i);
            return m ? parseInt(m[1], 10) === (ctx.season || 1) : String(s.id) === String(ctx.season || 1);
          });
          if (seasonData && seasonData.folder) {
            var ep = ctx.episode || 1;
            var epData = seasonData.folder.find(function (e) {
              var m = (e.title || '').match(/Episode\s*(\d+)/i);
              return m ? parseInt(m[1], 10) === ep : String(e.episode) === String(ep);
            });
            if (epData && epData.folder) targetFiles = epData.folder.filter(function (s) { return s && s.file; });
          }
        }
        if (!targetFiles.length) return [];
        var origin = playerDomain.replace(/\/$/, '');
        return Promise.all(targetFiles.map(function (fileObj) {
          var playlistFile = String(fileObj.file || '').replace(/^~/, '');
          if (!playlistFile) return null;
          var playlistUrl = origin + '/playlist/' + playlistFile + '.txt';
          return ctx.fetch(playlistUrl, {
            method: 'POST',
            headers: Object.assign({}, hdrs, { 'X-CSRF-TOKEN': json.key, Referer: embedLink }),
          }).then(function (r) { return r.text(); }).then(function (m3u8Url) {
            m3u8Url = (m3u8Url || '').trim();
            if (!m3u8Url.startsWith('http')) return null;
            return {
              name: 'AllMovieLand',
              url: m3u8Url,
              quality: fileObj.title || 'Unknown',
              headers: { Referer: origin + '/', Origin: origin, 'User-Agent': ua },
            };
          }).catch(function () { return null; });
        })).then(function (items) { return items.filter(Boolean); });
      });
    }).catch(function () { return []; });
  }

  function tryHosts(hosts, playId, referer) {
    var i = 0;
    function next() {
      if (i >= hosts.length) return Promise.resolve([]);
      var host = hosts[i++];
      return streamsFromPlayer(host, playId, referer).then(function (items) {
        return items.length ? items : next();
      });
    }
    return next();
  }

  function searchMatch(info) {
    // Param order matters: `?story=…&do=search` trips Cloudflare managed challenge.
    var searchUrl = mainUrl + '/?do=search&subaction=search&story=' + encodeURIComponent(info.title);
    return fetchText(searchUrl).then(function (html) {
      if (/just a moment|challenge-platform/i.test(html || '')) return null;
      var $ = ctx.html(html);
      var results = [];
      $('article.short-mid').each(function () {
        var el = $(this);
        var title = el.find('a > h3, h3.new-short__title').first().text().trim();
        var href = el.find('a.new-short__title--link, a[href*=".html"]').first().attr('href') || el.find('a').attr('href') || '';
        var ym = title.match(/\((\d{4})\)/);
        var yearText = el.find('a[href*="/year/"]').first().text().trim();
        var year = ym ? parseInt(ym[1], 10) : (yearText ? parseInt(yearText, 10) : null);
        if (title && href) results.push({ title: title, href: absUrl(href), year: year });
      });
      if (!results.length) return null;
      return bestMatch(info, results);
    });
  }

  return getTmdb().then(function (info) {
    if (!info || !info.title) return [];
    var imdbId = info.imdbId || null;

    function fromImdb(hosts) {
      if (!imdbId || !hosts.length) return Promise.resolve([]);
      return tryHosts(hosts, imdbId, mainUrl + '/');
    }

    function fromSearch(hosts) {
      return searchMatch(info).then(function (match) {
        if (!match) return [];
        return fetchText(match.href).then(function (docHtml) {
          var pageHosts = parsePlayerHosts(docHtml);
          var merged = [];
          hosts.concat(pageHosts).forEach(function (h) {
            if (h && merged.indexOf(h) < 0) merged.push(h);
          });
          var idM = String(docHtml || '').match(/src:\s*'([^']+)'/) ||
            String(docHtml || '').match(/src:\s*"([^"]+)"/);
          var playId = (idM && idM[1]) || imdbId;
          if (!playId || !merged.length) return [];
          return tryHosts(merged, playId, match.href);
        });
      });
    }

    return loadPlayerHosts('').then(function (hosts) {
      return fromImdb(hosts).then(function (items) {
        if (items.length) return items;
        return fromSearch(hosts);
      });
    });
  }).catch(function () { return []; });
}
