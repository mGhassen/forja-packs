var SPECS = {
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49",
  "embedApi": "https://net27.cc/api/embed-tmdb/",
  "embedReferer": "https://net27.cc/",
  "playReferer": "https://videodownloader.site/",
  "platforms": [
    "netflix",
    "primevideo",
    "hotstar",
    "disney"
  ],
  "domains": [
    "aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==",
    "aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=",
    "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo="
  ]
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var tmdbKey = cfg.tmdbKey;
  var embedApi = cfg.embedApi.replace(/\/?$/, '/');
  var embedReferer = cfg.embedReferer;
  var playReferer = cfg.playReferer;
  var directUa =
    cfg.directUserAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  var domains = Array.isArray(cfg.domains) ? cfg.domains : [];
  var platforms = Array.isArray(cfg.platforms) ? cfg.platforms : [];
  var platformMap = {
    netflix: 'nf',
    primevideo: 'pv',
    hotstar: 'hs',
    disney: 'hs',
  };
  var baseHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Requested-With': 'NetmirrorNewTV v1.0',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
    Accept: 'application/json, text/plain, */*',
  };

  function log(msg) {
    try {
      if (typeof ctx.log === 'function') ctx.log(String(msg));
    } catch (_) {}
  }

  function safeAtob(encoded) {
    return ctx.crypto.enc.Utf8.stringify(ctx.crypto.enc.Base64.parse(encoded));
  }

  function getJson(url, headers) {
    return ctx.fetch(url, { headers: headers }).then(function (r) {
      return r.json();
    });
  }

  function buildHeaders(ott, extra) {
    return Object.assign({}, baseHeaders, { Ott: ott }, extra || {});
  }

  function isPlayableLink(url) {
    if (!url || typeof url !== 'string') return false;
    var u = url.trim();
    if (!/^https?:\/\//i.test(u)) return false;
    var lower = u.toLowerCase();
    return (
      lower.indexOf('.m3u8') >= 0 ||
      lower.indexOf('.mp4') >= 0 ||
      lower.indexOf('.mkv') >= 0 ||
      lower.indexOf('/hls/') >= 0 ||
      lower.indexOf('/resource/') >= 0 ||
      lower.indexOf('/bt/') >= 0 ||
      lower.indexOf('sign=') >= 0
    );
  }

  function mapCaptions(captions) {
    var out = [];
    (captions || []).forEach(function (cap) {
      if (!cap || !cap.url) return;
      var url = cap.url;
      if (url.charAt(0) === '/') url = 'https://net27.cc' + url;
      out.push({
        url: url,
        language: cap.lang || 'en',
        name: cap.name || cap.lang || 'English',
      });
    });
    return out;
  }

  function hasDirectStreams(data) {
    if (!data || data.ok !== true) return false;
    if (data.error) return false;
    if (data.mp4) return true;
    return Array.isArray(data.streams) && data.streams.length > 0;
  }

  // D3adly / All-in-One-Nuvio primary path — net27 embed API (not NewTV).
  // Live embed-tmdb requires `se`/`ep` for TV — `s`/`e` are ignored (always S1E1).
  function fetchFromNetflixDirect() {
    var tmdbId = String(ctx.tmdbId || '').trim();
    if (!tmdbId) return Promise.resolve([]);
    var season = ctx.season || 1;
    var episode = ctx.episode || 1;
    var apiUrl =
      ctx.type !== 'movie'
        ? embedApi +
          encodeURIComponent(tmdbId) +
          '?type=tv&se=' +
          encodeURIComponent(String(season)) +
          '&ep=' +
          encodeURIComponent(String(episode))
        : embedApi + encodeURIComponent(tmdbId);
    return getJson(apiUrl, {
      Accept: 'application/json, text/plain, */*',
      Referer: embedReferer,
      'User-Agent': directUa,
    })
      .then(function (data) {
        if (!hasDirectStreams(data)) {
          log(
            'embed miss tmdb=' +
              tmdbId +
              (data && data.error ? ' err=' + data.error : ''),
          );
          return [];
        }
        var playHeaders = {
          Referer: playReferer,
          'User-Agent': directUa,
        };
        var subtitles = mapCaptions(data.captions);
        var rows = [];
        if (data.streams && data.streams.length) {
          data.streams.forEach(function (stream) {
            if (!stream || !stream.url) return;
            var q = stream.resolution ? String(stream.resolution) + 'p' : 'Auto';
            rows.push({
              url: stream.url,
              name: 'NetMirror (Netflix) - ' + q,
              quality: q,
              headers: playHeaders,
              subtitles: subtitles.length ? subtitles : undefined,
            });
          });
        } else if (data.mp4) {
          rows.push({
            url: data.mp4,
            name: 'NetMirror (Netflix) - Auto',
            quality: 'Auto',
            headers: playHeaders,
            subtitles: subtitles.length ? subtitles : undefined,
          });
        }
        log('embed ok tmdb=' + tmdbId + ' streams=' + rows.length);
        return rows;
      })
      .catch(function (e) {
        log('embed fail ' + (e && e.message ? e.message : e));
        return [];
      });
  }

  function decodeApiOrigin(tokenHash) {
    if (!tokenHash) return '';
    try {
      var decoded = safeAtob(tokenHash).replace(/\/$/, '');
      // check.php → https://net52.cc/mobile/home?app=1
      // checknewtv.php → https://tv.imgcdn.kim
      var m = String(decoded).match(/^(https?:\/\/[^\/\s?#]+)/i);
      return m ? m[1].replace(/\/$/, '') : decoded;
    } catch (_) {
      return '';
    }
  }

  function probeDiscovery(url, headers) {
    return getJson(url, headers)
      .then(function (data) {
        return data && data.token_hash ? decodeApiOrigin(data.token_hash) : '';
      })
      .catch(function () {
        return '';
      });
  }

  function resolveApiUrl() {
    var cached = globalThis.__netmirrorApiBase;
    if (cached) return Promise.resolve(cached);

    // Prefer app check.php (live → net52.cc). checknewtv.php still points at
    // dead tv.imgcdn.kim — probe only a few hosts, in parallel, fail fast.
    var probes = [
      probeDiscovery('https://mobiledetect.app/check.php', {
        'User-Agent': 'okhttp/4.9.2',
        Accept: 'application/json',
      }),
      probeDiscovery('https://mobiledetects.com/check.php', {
        'User-Agent': 'okhttp/4.9.2',
        Accept: 'application/json',
      }),
    ];
    var ntvHeaders = Object.assign({}, baseHeaders, {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });
    domains.slice(0, 4).forEach(function (encoded) {
      try {
        var base = safeAtob(encoded).replace(/\/$/, '');
        probes.push(probeDiscovery(base + '/checknewtv.php', ntvHeaders));
      } catch (_) {}
    });

    return Promise.all(probes).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i]) {
          globalThis.__netmirrorApiBase = results[i];
          log('newtv base=' + results[i]);
          return results[i];
        }
      }
      log('newtv discovery miss');
      return '';
    });
  }

  function tmdbTitle() {
    var kind = ctx.type === 'movie' ? 'movie' : 'tv';
    return getJson(
      'https://tmdb.forjahq.xyz/3/' +
        kind +
        '/' +
        encodeURIComponent(String(ctx.tmdbId || '')) +
        '?api_key=' +
        encodeURIComponent(tmdbKey),
      {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    ).then(function (d) {
      return ctx.type === 'movie' ? d.title : d.name;
    });
  }

  function parseEpNum(ep) {
    if (ep.ep) return parseInt(ep.ep, 10);
    if (ep.epNum) return parseInt(String(ep.epNum).replace('E', ''), 10);
    return null;
  }

  function parseSeasonNum(ep, fallback) {
    if (fallback) return fallback;
    if (ep.sNum) return parseInt(String(ep.sNum).replace('S', ''), 10);
    return null;
  }

  function fetchEpisodesPage(apiBase, ott, seasonId, page, seasonNumber) {
    var out = [];
    function walk(pg) {
      return getJson(
        apiBase +
          '/newtv/episodes.php?id=' +
          encodeURIComponent(seasonId) +
          '&page=' +
          encodeURIComponent(String(pg)),
        buildHeaders(ott),
      ).then(function (data) {
        (data.episodes || []).filter(Boolean).forEach(function (ep) {
          out.push({
            id: ep.id,
            s:
              seasonNumber ||
              (ep.sNum ? parseInt(String(ep.sNum).replace('S', ''), 10) : null),
            ep: parseEpNum(ep),
          });
        });
        if (data.nextPageShow === 1) return walk(pg + 1);
        return out;
      });
    }
    return walk(page);
  }

  function resolveEpisodeId(apiBase, ott, postData, targetSeason, targetEpisode) {
    var seasons = postData.season || [];
    var seasonIdx = Math.max(0, targetSeason - 1);
    var seasonEntry = seasons[seasonIdx];
    var seasonId = seasonEntry && seasonEntry.id;
    if (!seasonId && seasonIdx === 0) seasonId = postData.nextPageSeason;
    if (!seasonId && seasons.length === 1 && seasons[0].id) {
      seasonId = seasons[0].id;
    }

    var activeSeasonNum = null;
    var selectedIdx = postData.season
      ? postData.season.findIndex(function (s) {
          return s.selected === true;
        })
      : -1;
    if (selectedIdx >= 0) activeSeasonNum = selectedIdx + 1;

    var episodes = [];
    (postData.episodes || []).filter(Boolean).forEach(function (ep) {
      var row = {
        id: ep.id,
        s: parseSeasonNum(ep, activeSeasonNum || targetSeason),
        ep: parseEpNum(ep),
      };
      if (row.s === targetSeason) episodes.push(row);
    });

    function findIn(list) {
      for (var i = 0; i < (list || []).length; i++) {
        var ep = list[i];
        if (ep && ep.s === targetSeason && ep.ep === targetEpisode) return ep.id;
      }
      return null;
    }

    var found = findIn(episodes);
    if (found) return Promise.resolve(found);
    if (!seasonId) return Promise.resolve(null);

    return fetchEpisodesPage(apiBase, ott, seasonId, 1, targetSeason).then(
      function (more) {
        return findIn(episodes.concat(more || []));
      },
    );
  }

  function fetchFromPlatform(apiBase, platformKey, title) {
    var ott = platformMap[platformKey];
    return getJson(
      apiBase + '/newtv/search.php?s=' + encodeURIComponent(title),
      buildHeaders(ott),
    )
      .then(function (searchData) {
        if (!searchData.searchResult || !searchData.searchResult.length) {
          return [];
        }
        var contentId = searchData.searchResult[0].id;
        return getJson(
          apiBase +
            '/newtv/post.php?id=' +
            encodeURIComponent(String(contentId)),
          buildHeaders(ott, { Lastep: '', Usertoken: '' }),
        ).then(function (postData) {
          var targetId = contentId;
          if (ctx.type !== 'movie') {
            return resolveEpisodeId(
              apiBase,
              ott,
              postData,
              ctx.season || 1,
              ctx.episode || 1,
            ).then(function (episodeId) {
              if (!episodeId) return [];
              targetId = episodeId;
              return getJson(
                apiBase +
                  '/newtv/player.php?id=' +
                  encodeURIComponent(String(targetId)),
                buildHeaders(ott, { Usertoken: '' }),
              );
            });
          }
          var isSeries =
            postData.type === 't' ||
            ((postData.episodes || []).filter(Boolean).length > 0);
          if (isSeries) return [];
          targetId = postData.main_id || contentId;
          return getJson(
            apiBase +
              '/newtv/player.php?id=' +
              encodeURIComponent(String(targetId)),
            buildHeaders(ott, { Usertoken: '' }),
          );
        });
      })
      .then(function (response) {
        // Live player may return status=otp (or other) while still providing video_link.
        if (!response || !response.video_link || !isPlayableLink(response.video_link)) {
          return [];
        }
        return [
          {
            url: response.video_link,
            name: 'NetMirror (' + platformKey + ')',
            quality: 'Auto',
            headers: Object.assign({}, buildHeaders(ott), {
              Referer: response.referer || apiBase,
            }),
          },
        ];
      })
      .catch(function () {
        return [];
      });
  }

  function fetchViaNewTv() {
    return Promise.all([resolveApiUrl(), tmdbTitle()])
      .then(function (pair) {
        var apiBase = pair[0];
        var title = pair[1] || String(ctx.title || '').trim();
        if (!apiBase || !title) return [];
        var preferred = cfg.preferredPlatform;
        var ordered = platforms.slice();
        if (preferred && preferred !== 'all' && ordered.indexOf(preferred) >= 0) {
          ordered = [preferred].concat(
            ordered.filter(function (p) {
              return p !== preferred;
            }),
          );
        }
        var chain = Promise.resolve([]);
        ordered.forEach(function (platformKey) {
          chain = chain.then(function (rows) {
            if (rows.length) return rows;
            return fetchFromPlatform(apiBase, platformKey, title);
          });
        });
        return chain;
      })
      .catch(function () {
        return [];
      });
  }

  return fetchFromNetflixDirect().then(function (rows) {
    if (rows.length) return rows;
    return fetchViaNewTv();
  });
}
