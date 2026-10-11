// Movix (movix.college): French VF / VOSTFR aggregator keyed by TMDB id. Pack prelude: _fr_anime_embeds.js.
var SPECS = {
  apiBase: 'https://api.movix.luxe',
  // Movix reads the live Frembed domain from this file; frembedBase is the fallback.
  frembedConfig: 'https://raw.githubusercontent.com/kingofthrone73-dotcom/frembed-config/main/config.json',
  frembedBase: 'https://frembed.bar',
  maxEmbeds: 40,
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

// Hosts with no resolver in this pack (SPA players, per-hostname obfuscation, dead hosts).
var MOVIX_SKIP_HOSTS =
  /(^|\.)(fembed\.com|trakx\.lol|multiup\.us|younetu\.org|uptostream\.link|upvid\.co|bysebuho\.com|embedseek\.com|fsvid\.lol|vidzy\.cc|blinkflux\.lol|upn\.one|waaw\.to|netu\.frembed\.bond)$/;

function movixLangKey(raw) {
  var k = String(raw || '').toLowerCase();
  if (k === 'default' || k === 'french' || k === 'truefrench') return 'vf';
  if (k.indexOf('vostfr') === 0) return 'vostfr';
  if (k.indexOf('vo') === 0 || k === 'english') return 'vo';
  return MOVIX_LANGS[k] ? k : '';
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = String(cfg.apiBase || '').replace(/\/$/, '');
  var tmdb = String(ctx.tmdbId || '').trim();
  var imdb = String(ctx.imdbId || '').trim();
  var isTv = ctx.type === 'tv';
  var season = Number(ctx.season) || 1;
  var episode = Number(ctx.episode) || 1;
  if (!api || !/^\d+$/.test(tmdb)) return Promise.resolve([]);

  // No Origin / Referer: the API only rejects those when they name a non-Movix domain.
  function getJson(path) {
    return ctx
      .fetch(api + path, { headers: { 'User-Agent': MOVIX_UA, Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
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
    // Pulse: direct HLS master with French + original audio tracks.
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

    getJson(isTv ? '/api/wiflix/tv/' + tmdb + '/' + season : '/api/wiflix/movie/' + tmdb).then(function (d) {
      if (!d || !d.success) return;
      addLangMap('Wiflix', isTv ? d.episodes && d.episodes[String(episode)] : d.players);
    }),

    getJson(
      isTv ? '/api/cpasmal/tv/' + tmdb + '/' + season + '/' + episode : '/api/cpasmal/movie/' + tmdb,
    ).then(function (d) {
      addLangMap('Cpasmal', d && d.links);
    }),

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
          addEmbed('Movix', 'multi', typeof l === 'string' ? l : l && l.url);
        });
      });
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
      return Promise.all(
        picked.map(function (e) {
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
}

// Frembed: each `linkN[vostfr|vo]` is a /api/stream URL that 302s to the file host.
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
          if (!d || d.error) return null;
          var servers = {};
          Object.keys(d).forEach(function (k) {
            var m = k.match(/^link\d*(vostfr|vo)?$/);
            if (m && typeof d[k] === 'string' && d[k]) servers[d[k]] = m[1] || 'vf';
          });
          (Array.isArray(d.links) ? d.links : []).forEach(function (l) {
            if (l && typeof l.url === 'string' && l.url) servers[l.url] = l.lang || 'vf';
          });
          return Promise.all(
            Object.keys(servers).map(function (path) {
              var url = /^https?:/i.test(path) ? path : base + path;
              return ctx
                .fetch(url, { headers: { 'User-Agent': MOVIX_UA, Referer: base + '/' } })
                .then(function (r) {
                  var embed = String((r && r.url) || '');
                  if (!embed || embed === url) return;
                  var inner = (embed.match(/[?&]url=([^&]+)/) || [])[1];
                  inner = inner ? decodeURIComponent(inner) : '';
                  if (/\.mp4(\?|$)/i.test(inner)) {
                    var lang = movixLangKey(servers[path]);
                    var meta = MOVIX_LANGS[lang] || MOVIX_LANGS.vf;
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
                  addEmbed('Frembed', servers[path], inner || embed, base + '/');
                })
                .catch(function () {});
            }),
          );
        });
    })
    .catch(function () {});
}
