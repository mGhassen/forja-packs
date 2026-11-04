// Movix (movix.dog): French VF / VOSTFR aggregator keyed by TMDB id. Pack prelude: _fr_anime_embeds.js.
var SPECS = {
  apiBase: 'https://api.movix.dog',
  // Site mirrors all share the same API; first reachable base wins.
  apiBases: [
    'https://api.movix.dog',
    'https://api.movix.men',
    'https://api.movix.fun',
    'https://api.movix.show',
    'https://api.movix.date',
    'https://api.movix.chat',
    'https://api.movix.golf',
    'https://api.movix.cloud',
    'https://api.movix.cash',
    'https://api.movix.luxe',
  ],
  // Movix reads the live Frembed domain from this file; frembedBase is the fallback.
  frembedConfig: 'https://raw.githubusercontent.com/kingofthrone73-dotcom/frembed-config/main/config.json',
  frembedBase: 'https://frembed.uno',
  maxEmbeds: 60,
};

var MOVIX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// VOSTFR and VO have original audio: no `language`, so Sources chips do not read them as French audio.
var MOVIX_LANGS = {
  vf: { title: 'VF', language: 'French' },
  vff: { title: 'VFF', language: 'French' },
  vfq: { title: 'VFQ', language: 'French' },
  vostfr: { title: 'VOSTFR', language: '' },
  vo: { title: 'VO', language: '' },
  multi: { title: 'MULTI', language: 'French' },
};

// Hosts with no native resolver in this pack (SPA / captcha / extension-only).
// trakx.lol is unwrapped via redirect before hop (→ VOE / Byse / …).
var MOVIX_SKIP_HOSTS =
  /(^|\.)(fembed\.com|multiup\.us|younetu\.org|uptostream\.link|uptobox\.link|upvid\.co|upn\.one|waaw\.to|netu\.frembed\.bond|embedseek\.com|blinkflux\.lol)$/;

var MOVIX_UNWRAP_HOSTS = /(^|\.)(trakx\.lol)$/;

function movixLangKey(raw) {
  var k = String(raw || '').toLowerCase();
  if (k === 'default' || k === 'french' || k === 'truefrench') return 'vf';
  if (k.indexOf('vostfr') === 0) return 'vostfr';
  if (k.indexOf('vo') === 0 || k === 'english') return 'vo';
  return MOVIX_LANGS[k] ? k : '';
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var bases = (Array.isArray(cfg.apiBases) && cfg.apiBases.length ? cfg.apiBases : [cfg.apiBase])
    .map(function (b) {
      return String(b || '').replace(/\/$/, '');
    })
    .filter(Boolean);
  var tmdb = String(ctx.tmdbId || '').trim();
  var imdb = String(ctx.imdbId || '').trim();
  var isTv = ctx.type === 'tv';
  var season = Number(ctx.season) || 1;
  var episode = Number(ctx.episode) || 1;
  if (!bases.length || !/^\d+$/.test(tmdb)) return Promise.resolve([]);

  // No Origin / Referer: the API only rejects those when they name a non-Movix domain.
  function getJsonOn(api, path) {
    return ctx
      .fetch(api + path, { headers: { 'User-Agent': MOVIX_UA, Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }

  function pickApi(i) {
    if (i >= bases.length) return Promise.resolve(bases[0] || '');
    var api = bases[i];
    return ctx
      .fetch(api + '/api/tmdb/movie/550', { headers: { 'User-Agent': MOVIX_UA, Accept: 'application/json' } })
      .then(function (r) {
        return r && r.status ? api : pickApi(i + 1);
      })
      .catch(function () {
        return pickApi(i + 1);
      });
  }

  return pickApi(0).then(function (api) {
    if (!api) return [];

    function getJson(path) {
      return getJsonOn(api, path);
    }

    var embeds = [];
    function addEmbed(source, lang, url, referer) {
      var key = movixLangKey(lang);
      var u = String(url || '').trim();
      if (!key || !/^https?:\/\//i.test(u)) return;
      if (MOVIX_SKIP_HOSTS.test(frAnimeHost(u))) return;
      embeds.push({ source: source, lang: key, url: u, referer: referer || api + '/' });
    }
    function addLangMap(source, map, pick) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (lang) {
        var list = map[lang];
        if (!Array.isArray(list)) return;
        list.forEach(function (item) {
          addEmbed(source, lang, typeof item === 'string' ? item : item && item[pick || 'url']);
        });
      });
    }

    var direct = [];

    var jobs = [
      // Pulse / SwiftFlux HLS master.
      getJson(
        isTv
          ? '/api/purstream/tv/' + tmdb + '/stream?season=' + season + '&episode=' + episode
          : '/api/purstream/movie/' + tmdb + '/stream',
      ).then(function (d) {
        var sources = d && Array.isArray(d.sources) ? d.sources : [];
        sources.forEach(function (s) {
          var url = s && s.url ? String(s.url) : '';
          if (!/^https?:\/\//i.test(url)) return;
          var label = String(s.name || '');
          var quality = (label.match(/\b(2160p|4K|1080p|720p|480p)\b/i) || [])[1] || '';
          direct.push({
            url: url,
            name: 'Movix · Pulse',
            title: 'MULTI' + (quality ? ' · ' + quality : ''),
            quality: quality,
            language: 'French',
            headers: { 'User-Agent': MOVIX_UA },
          });
        });
      }),

      getJson(isTv ? '/api/fstream/tv/' + tmdb + '/season/' + season : '/api/fstream/movie/' + tmdb).then(
        function (d) {
          if (!d || !d.success) return;
          if (isTv) {
            var ep = d.episodes && d.episodes[String(episode)];
            addLangMap('FStream', ep && ep.languages);
          } else {
            addLangMap('FStream', d.players);
          }
        },
      ),

      // Lynx on the site UI.
      getJson(isTv ? '/api/wiflix/tv/' + tmdb + '/' + season : '/api/wiflix/movie/' + tmdb).then(function (d) {
        if (!d || !d.success) return;
        addLangMap('Wiflix', isTv ? d.episodes && d.episodes[String(episode)] : d.players);
      }),

      // Viper on the site UI.
      getJson(
        isTv ? '/api/cpasmal/tv/' + tmdb + '/' + season + '/' + episode : '/api/cpasmal/movie/' + tmdb,
      ).then(function (d) {
        addLangMap('Cpasmal', d && d.links);
      }),

      // SeekStreaming / Movix custom links (bysebuho, embedseek, …).
      getJson(
        isTv
          ? '/api/links/tv/' + tmdb + '?season=' + season + '&episode=' + episode
          : '/api/links/movie/' + tmdb,
      ).then(function (d) {
        var data = d && d.success ? d.data : null;
        var rows = Array.isArray(data) ? data : data ? [data] : [];
        rows.forEach(function (row) {
          if (isTv && row && (Number(row.season_number) !== season || Number(row.episode_number) !== episode)) {
            return;
          }
          (row && Array.isArray(row.links) ? row.links : []).forEach(function (l) {
            addEmbed('Seek', 'multi', typeof l === 'string' ? l : l && l.url);
          });
        });
      }),

      // SwiftFlow iframe players (blinkflux). MP4 resolve needs Turnstile — not used here.
      getJson(
        isTv
          ? '/api/swiftflow/tv/' + tmdb + '/season/' + season + '?episode=' + episode
          : '/api/swiftflow/movie/' + tmdb,
      ).then(function (d) {
        if (!d || !d.success) return;
        if (isTv) {
          addLangMap('SwiftFlow', d.episodes && d.episodes[String(episode)]);
        } else {
          addLangMap('SwiftFlow', d.players);
        }
      }),

      // 1jour1film (often disabled server-side; keep wired).
      getJson(
        isTv
          ? '/api/j1f/tv/' + tmdb + '/season/' + season + '?episode=' + episode
          : '/api/j1f/movie/' + tmdb,
      ).then(function (d) {
        if (!d || !d.success) return;
        if (isTv) {
          addLangMap('J1F', d.episodes && d.episodes[String(episode)]);
        } else {
          addLangMap('J1F', d.players || d.links);
        }
      }),
    ];

    // Coflix: the site's MULTI player list.
    jobs.push(
      getJson(
        isTv
          ? '/api/tmdb/tv/' + tmdb + '?season=' + season + '&episode=' + episode
          : '/api/tmdb/movie/' + tmdb,
      ).then(function (d) {
        var links = d && (isTv ? d.current_episode && d.current_episode.player_links : d.player_links);
        (Array.isArray(links) ? links : []).forEach(function (l) {
          if (l) addEmbed('Coflix', l.language || 'vf', l.decoded_url);
        });
      }),
    );

    jobs.push(movixFrembed(ctx, cfg, tmdb, isTv, season, episode, addEmbed, direct));

    if (/^tt\d+$/.test(imdb)) {
      jobs.push(
        getJson(
          isTv
            ? '/api/imdb/tv/' + imdb + '?season=' + season + '&episode=' + episode
            : '/api/imdb/movie/' + imdb,
        ).then(function (d) {
          addLangMap('FrenchCloud', d && Array.isArray(d.player_links) ? { vf: d.player_links } : null, 'link');
        }),
      );
    }

    function unwrapEmbed(e) {
      if (!MOVIX_UNWRAP_HOSTS.test(frAnimeHost(e.url))) return Promise.resolve(e);
      return ctx
        .fetch(e.url, {
          headers: { 'User-Agent': MOVIX_UA, Referer: e.referer || api + '/', Accept: 'text/html' },
          redirect: 'follow',
        })
        .then(function (r) {
          var finalUrl = String((r && r.url) || '').trim() || e.url;
          if (!/^https?:\/\//i.test(finalUrl)) return null;
          if (MOVIX_SKIP_HOSTS.test(frAnimeHost(finalUrl))) return null;
          if (MOVIX_UNWRAP_HOSTS.test(frAnimeHost(finalUrl))) return null;
          return Object.assign({}, e, { url: finalUrl });
        })
        .catch(function () {
          return null;
        });
    }

    return Promise.all(jobs)
      .then(function () {
        var seen = {};
        var picked = embeds
          .filter(function (e) {
            if (seen[e.url]) return false;
            seen[e.url] = true;
            return true;
          })
          .slice(0, Number(cfg.maxEmbeds) || SPECS.maxEmbeds);
        return Promise.all(picked.map(unwrapEmbed)).then(function (unwrapped) {
          return Promise.all(
            unwrapped.filter(Boolean).map(function (e) {
              return frAnimeResolveEmbed(ctx, e.url, e.referer).then(function (rows) {
                var meta = MOVIX_LANGS[e.lang];
                return (rows || []).map(function (r) {
                  var out = Object.assign({}, r, {
                    name: 'Movix · ' + e.source + ' [' + (r.name || frAnimeHostName(e.url)) + ']',
                    title: meta.title + (r.quality ? ' · ' + r.quality : ''),
                  });
                  if (meta.language) out.language = meta.language;
                  else delete out.language;
                  return out;
                });
              });
            }),
          );
        });
      })
      .then(function (groups) {
        var seen = {};
        return direct.concat([].concat.apply([], groups)).filter(function (r) {
          if (!r || !r.url || seen[r.url]) return false;
          seen[r.url] = true;
          return true;
        });
      })
      .catch(function () {
        return direct;
      });
  });
}

function movixFrembedFollow(ctx, base, path, lang, addEmbed, direct) {
  var url = /^https?:/i.test(path) ? path : base + path;
  return ctx
    .fetch(url, { headers: { 'User-Agent': MOVIX_UA, Referer: base + '/', Accept: 'text/html,application/json' } })
    .then(function (r) {
      var embed = String((r && r.url) || url);
      return r.text().then(function (body) {
        var text = String(body || '');
        var inner = (embed.match(/[?&]url=([^&]+)/) || [])[1];
        inner = inner ? decodeURIComponent(inner) : '';
        if (/\.mp4(\?|$)/i.test(inner)) {
          var key = movixLangKey(lang);
          var meta = MOVIX_LANGS[key] || MOVIX_LANGS.vf;
          var row = {
            url: inner,
            name: 'Movix · Frembed [' + frAnimeHostName(embed) + ']',
            title: meta.title,
            headers: { 'User-Agent': MOVIX_UA, Referer: embed },
          };
          if (meta.language) row.language = meta.language;
          direct.push(row);
          return;
        }
        // Public embed page: pull player iframes / data-url hosts for hops.
        var found = [];
        text.replace(/iframe[^>]*src=["']([^"']+)["']/gi, function (_, s) {
          found.push(s);
          return _;
        });
        text.replace(/["'](https?:\/\/[^"']+\/(?:e|embed|v)\/[^"']+)["']/gi, function (_, s) {
          found.push(s);
          return _;
        });
        text.replace(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/gi, function (_, s) {
          found.push(s);
          return _;
        });
        var seen = {};
        found.forEach(function (raw) {
          var u = String(raw || '').trim();
          if (!/^https?:\/\//i.test(u) || seen[u]) return;
          seen[u] = true;
          if (/\.m3u8(\?|$)/i.test(u)) {
            var k = movixLangKey(lang);
            var m = MOVIX_LANGS[k] || MOVIX_LANGS.vf;
            var d = {
              url: u,
              name: 'Movix · Frembed',
              title: m.title,
              headers: { 'User-Agent': MOVIX_UA, Referer: embed },
            };
            if (m.language) d.language = m.language;
            direct.push(d);
            return;
          }
          if (!MOVIX_SKIP_HOSTS.test(frAnimeHost(u))) addEmbed('Frembed', lang, u, base + '/');
        });
        if (!found.length) addEmbed('Frembed', lang, inner || embed || url, base + '/');
      });
    })
    .catch(function () {
      addEmbed('Frembed', lang, url, base + '/');
    });
}

function movixFrembedClassic(ctx, base, tmdb, isTv, season, episode, addEmbed, direct) {
  var headers = { 'User-Agent': MOVIX_UA, Accept: 'application/json' };
  var page = isTv
    ? base + '/api/series?id=' + tmdb + '&sa=' + season + '&epi=' + episode + '&idType=tmdb'
    : base + '/api/films?id=' + tmdb + '&idType=tmdb';
  var referer = base + (isTv ? '/series?id=' + tmdb : '/films?id=' + tmdb);
  return ctx
    .fetch(page, { headers: Object.assign({ Referer: referer }, headers) })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      if (!d || d.error) return 0;
      var servers = {};
      Object.keys(d).forEach(function (k) {
        var m = k.match(/^link\d*(vostfr|vo)?$/);
        if (m && typeof d[k] === 'string' && d[k]) servers[d[k]] = m[1] || 'vf';
      });
      (Array.isArray(d.links) ? d.links : []).forEach(function (l) {
        if (l && typeof l.url === 'string' && l.url) servers[l.url] = l.lang || 'vf';
      });
      var paths = Object.keys(servers);
      if (!paths.length) return 0;
      return Promise.all(
        paths.map(function (path) {
          return movixFrembedFollow(ctx, base, path, servers[path], addEmbed, direct);
        }),
      ).then(function () {
        return paths.length;
      });
    })
    .catch(function () {
      return 0;
    });
}

function movixFrembedPublic(ctx, base, tmdb, isTv, season, episode, addEmbed, direct) {
  var headers = { 'User-Agent': MOVIX_UA, Accept: 'application/json' };
  var pub = isTv
    ? base + '/api/public/v1/tv/' + tmdb + '?sa=' + season + '&epi=' + episode
    : base + '/api/public/v1/movie/' + tmdb;
  var php = isTv
    ? base + '/api/serie.php?id=' + tmdb + '&sa=' + season + '&epi=' + episode
    : base + '/api/film.php?id=' + tmdb;

  return ctx
    .fetch(pub, { headers: headers })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      var items = (d && d.result && Array.isArray(d.result.items) ? d.result.items : []) || [];
      var jobs = [];
      items.forEach(function (it) {
        var link = it && it.link ? String(it.link) : '';
        var lang = movixLangKey(it && it.version) || 'vf';
        if (link) jobs.push(movixFrembedFollow(ctx, base, link, lang, addEmbed, direct));
      });
      // Site player iframe — resolve even when public list is empty but content exists.
      if (!jobs.length && d && d.status === 200) {
        jobs.push(movixFrembedFollow(ctx, base, php, 'vf', addEmbed, direct));
      } else if (!jobs.length) {
        jobs.push(movixFrembedFollow(ctx, base, php, 'vf', addEmbed, direct));
      }
      return Promise.all(jobs);
    })
    .catch(function () {
      return movixFrembedFollow(ctx, base, php, 'vf', addEmbed, direct);
    });
}

// Frembed: classic linkN 302s, then public v1 + serie.php/film.php player.
function movixFrembed(ctx, cfg, tmdb, isTv, season, episode, addEmbed, direct) {
  var headers = { 'User-Agent': MOVIX_UA, Accept: 'application/json' };
  var fallback = String(cfg.frembedBase || '').replace(/\/$/, '');
  var baseJob = cfg.frembedConfig
    ? ctx
        .fetch(cfg.frembedConfig, { headers: headers })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (c) {
          return String((c && (c.backup || c.main)) || fallback).replace(/\/$/, '');
        })
        .catch(function () {
          return fallback;
        })
    : Promise.resolve(fallback);

  return baseJob
    .then(function (base) {
      if (!base) return null;
      return movixFrembedClassic(ctx, base, tmdb, isTv, season, episode, addEmbed, direct).then(function (n) {
        if (n > 0) return;
        return movixFrembedPublic(ctx, base, tmdb, isTv, season, episode, addEmbed, direct);
      });
    })
    .catch(function () {});
}
