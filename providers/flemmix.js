// Flemmix (flemmix.rip): French VF / VOSTFR films and series, matched by title. Pack prelude: _fr_anime_embeds.js.
var SPECS = {
  domain: 'https://flemmix.rip',
  tmdbBase: 'https://tmdb.forjahq.xyz/3',
  tmdbKey: '1865f43a0549ca50d341dd9ab8b29f49',
  maxSearchPages: 3,
};

var FLEMMIX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// The site's bot shield wants the cookie its inline script sets.
var FLEMMIX_COOKIE = 'h_check=25';

// VOSTFR has original audio: no `language`, so Sources chips do not read it as French audio.
var FLEMMIX_LANGS = {
  vf: { title: 'VF', language: 'French' },
  vostfr: { title: 'VOSTFR', language: '' },
};

var FLEMMIX_FILM_PATH = /^\/(film-en-streaming|film-ancien|films-prochainement)\//;

// Vidara players: POST `/api/stream` → `streaming_url` (HLS).
var FLEMMIX_VIDARA_HOSTS = { 'vidara.to': 1 };

function flemmixNorm(s) {
  return frAnimeDecodeEntities(String(s || ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(\d{4}\)\s*$/, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// DLE matches whole stored words: "grey's" never matches, so words with apostrophes are dropped.
function flemmixQuery(title) {
  var words = frAnimeDecodeEntities(String(title || ''))
    .replace(/\(\d{4}\)\s*$/, '')
    .split(/\s+/)
    .filter(function (w) {
      return w && !/['’`]/.test(w);
    })
    .map(function (w) {
      return w.replace(/[.,:;!?"()[\]{}«»…–—\-/]+/g, ' ').trim();
    })
    .filter(Boolean);
  return words.join(' ').trim();
}

function flemmixLang(raw) {
  return /vostfr/i.test(String(raw || '')) ? 'vostfr' : 'vf';
}

function flemmixDecodeLink(v) {
  try {
    var url = atob(String(v || '')).replace(/[a-zA-Z]/g, function (c) {
      var base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26));
    });
    return /^https?:\/\//i.test(url) ? url : '';
  } catch (e) {
    return '';
  }
}

// `<a data-v="…"><span>Host</span></a>` → [{ url, label }].
function flemmixLinks(html) {
  var out = [];
  var re = /data-v="([^"]+)"[^>]*>\s*<span[^>]*>([^<]*)<\/span>/g;
  var m;
  while ((m = re.exec(String(html || '')))) {
    var url = flemmixDecodeLink(m[1]);
    if (url) out.push({ url: url, label: frAnimeDecodeEntities(m[2]).trim() });
  }
  return out;
}

function flemmixFetch(ctx, url, opts) {
  var o = opts || {};
  var headers = Object.assign(
    { 'User-Agent': FLEMMIX_UA, Cookie: FLEMMIX_COOKIE, Accept: 'text/html,*/*' },
    o.headers || {},
  );
  return ctx
    .fetch(url, { method: o.method || 'GET', headers: headers, body: o.body })
    .then(function (r) {
      return r.ok ? r.text() : '';
    })
    .catch(function () {
      return '';
    });
}

function flemmixTmdbTitles(ctx, cfg) {
  var titles = [];
  function add(t) {
    var s = String(t || '').trim();
    if (s && titles.indexOf(s) < 0) titles.push(s);
  }
  var tmdb = String(ctx.tmdbId || '').trim();
  var done = Promise.resolve(null);
  if (/^\d+$/.test(tmdb) && cfg.tmdbBase && cfg.tmdbKey) {
    var kind = ctx.type === 'tv' ? 'tv' : 'movie';
    done = ctx
      .fetch(
        String(cfg.tmdbBase).replace(/\/$/, '') + '/' + kind + '/' + tmdb +
          '?language=fr-FR&api_key=' + encodeURIComponent(cfg.tmdbKey),
        { headers: { Accept: 'application/json' } },
      )
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
  }
  return done.then(function (d) {
    var year = String(ctx.year || '').slice(0, 4);
    if (d) {
      add(d.title || d.name);
      add(ctx.title);
      add(d.original_title || d.original_name);
      if (!year) year = String(d.release_date || d.first_air_date || '').slice(0, 4);
    } else {
      add(ctx.title);
    }
    return { titles: titles, year: Number(year) || 0 };
  });
}

// One search results page → [{ path, name, year, season, lang }]. Skips the hidden recommendations block.
function flemmixParseResults(html) {
  var h = String(html || '');
  var a = h.indexOf('id="no-results-rec"');
  if (a >= 0) {
    var b = h.indexOf('<script', a);
    h = h.slice(0, a) + (b >= 0 ? h.slice(b) : '');
  }
  var out = [];
  h.split('class="mov clearfix"').slice(1).forEach(function (blk) {
    var m = blk.match(/class="mov-t nowrap" href="([^"]+)">([^<]+)</);
    if (!m) return;
    var path = '';
    try {
      path = new URL(m[1]).pathname;
    } catch (e) {
      return;
    }
    var sai = (blk.match(/class="block-sai">([^<]*)</) || [])[1] || '';
    var season = Number((sai.match(/Saison\s+(\d+)/i) || [])[1]) || 0;
    var langRaw = sai || (blk.match(/class="nbloc1">([^<]*)</) || [])[1] || '';
    out.push({
      path: path,
      name: flemmixNorm(m[2]),
      year: Number((blk.match(/Date de sortie:<\/div>\s*<div class="ml-desc">\s*(\d{4})/) || [])[1]) || 0,
      film: FLEMMIX_FILM_PATH.test(path),
      season: season,
      lang: flemmixLang(langRaw),
    });
  });
  var total = Number((h.match(/Trouvé\s+(\d+)\s+résultat/) || [])[1]) || 0;
  return { items: out, total: total };
}

function flemmixSearch(ctx, cfg, query) {
  var domain = cfg.domain;
  var maxPages = Math.max(1, Number(cfg.maxSearchPages) || 1);
  var all = [];
  function page(n) {
    var body =
      'do=search&subaction=search&full_search=1&titleonly=3' +
      '&search_start=' + n + '&result_from=' + ((n - 1) * 20 + 1) +
      '&story=' + encodeURIComponent(query);
    return flemmixFetch(ctx, domain + '/index.php?do=search', {
      method: 'POST',
      body: body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: domain + '/' },
    }).then(function (html) {
      var res = flemmixParseResults(html);
      all = all.concat(res.items);
      if (res.items.length && n < maxPages && n * 20 < res.total) return page(n + 1);
      return all;
    });
  }
  return page(1);
}

function flemmixFindPages(ctx, cfg, want) {
  var isTv = ctx.type === 'tv';
  var season = Number(ctx.season) || 1;
  var names = want.titles.map(flemmixNorm).filter(Boolean);
  var queries = [];
  want.titles.forEach(function (t) {
    var q = flemmixQuery(t);
    if (q && queries.indexOf(q) < 0) queries.push(q);
  });

  function pick(items) {
    var seen = {};
    return items.filter(function (it) {
      if (seen[it.path] || names.indexOf(it.name) < 0) return false;
      if (isTv) {
        if (it.film || (it.season || 1) !== season) return false;
      } else {
        if (!it.film) return false;
        if (want.year && it.year && Math.abs(want.year - it.year) > 1) return false;
      }
      seen[it.path] = true;
      return true;
    });
  }

  function next(i) {
    if (i >= queries.length) return Promise.resolve([]);
    return flemmixSearch(ctx, cfg, queries[i]).then(function (items) {
      var hits = pick(items);
      return hits.length ? hits : next(i + 1);
    });
  }
  return next(0);
}

// Film page: one host list, language from "Version". Season page: `epNvf` / `epNvs` blocks.
function flemmixPageEmbeds(html, page, ctx) {
  var h = String(html || '');
  if (ctx.type !== 'tv') {
    var start = h.indexOf('<div class="tabs-sel linkstab"');
    var end = h.indexOf('<div class="tabs-b video-box"', start);
    var tabs = start >= 0 ? h.slice(start, end > start ? end : undefined) : '';
    // Main hosts are in the film's "Version"; a nested `vostfr-links` block holds VOSTFR mirrors.
    var split = tabs.indexOf('<div class="vostfr-links"');
    var version = (h.match(/itemprop="inLanguage">([^<]*)</) || [])[1] || '';
    var lang = version ? flemmixLang(version) : page.lang;
    var main = flemmixLinks(split >= 0 ? tabs.slice(0, split) : tabs).map(function (l) {
      return { url: l.url, label: l.label, lang: lang };
    });
    var vost = split >= 0 ? flemmixLinks(tabs.slice(split)) : [];
    return main.concat(
      vost.map(function (l) {
        return { url: l.url, label: '', lang: 'vostfr' };
      }),
    );
  }
  var ep = Number(ctx.episode) || 1;
  var out = [];
  [
    ['vf', 'vf'],
    ['vs', 'vostfr'],
  ].forEach(function (pair) {
    var re = new RegExp('<div class="ep' + ep + pair[0] + '"[^>]*>([\\s\\S]*?)</div>');
    var blk = h.match(re);
    if (!blk) return;
    flemmixLinks(blk[1]).forEach(function (l) {
      out.push({ url: l.url, label: '', lang: pair[1] });
    });
  });
  return out;
}

function flemmixResolveVidara(ctx, embedUrl) {
  var code = /\/e\/([A-Za-z0-9]+)/.exec(embedUrl);
  var origin = (embedUrl.match(/^https?:\/\/[^/]+/i) || [''])[0];
  if (!code || !origin) return Promise.resolve([]);
  return ctx
    .fetch(origin + '/api/stream', {
      method: 'POST',
      headers: {
        'User-Agent': FLEMMIX_UA,
        'Content-Type': 'application/json',
        Origin: origin,
        Referer: embedUrl,
      },
      body: JSON.stringify({ filecode: code[1], device: 'web', codecs: [] }),
    })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      var url = j && j.streaming_url;
      if (!url) return [];
      return [{ url: url, headers: { 'User-Agent': FLEMMIX_UA, Referer: origin + '/', Origin: origin } }];
    })
    .catch(function () {
      return [];
    });
}

function flemmixResolveEmbed(ctx, embedUrl, referer) {
  if (FLEMMIX_VIDARA_HOSTS[frAnimeHost(embedUrl)]) return flemmixResolveVidara(ctx, embedUrl);
  return frAnimeResolveEmbed(ctx, embedUrl, referer);
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  cfg.domain = String(cfg.domain || '').replace(/\/$/, '');
  if (!cfg.domain) return Promise.resolve([]);
  var referer = cfg.domain + '/';

  return flemmixTmdbTitles(ctx, cfg)
    .then(function (want) {
      if (!want.titles.length) return [];
      return flemmixFindPages(ctx, cfg, want);
    })
    .then(function (pages) {
      return Promise.all(
        pages.map(function (page) {
          return flemmixFetch(ctx, cfg.domain + page.path, { headers: { Referer: referer } }).then(function (html) {
            return flemmixPageEmbeds(html, page, ctx);
          });
        }),
      );
    })
    .then(function (groups) {
      var seen = {};
      var embeds = [].concat.apply([], groups).filter(function (e) {
        if (seen[e.url]) return false;
        seen[e.url] = true;
        return true;
      });
      return Promise.all(
        embeds.map(function (e) {
          var meta = FLEMMIX_LANGS[e.lang];
          var host = e.label && !/^lecteur\s*\d*$/i.test(e.label) ? e.label : frAnimeHostName(e.url);
          return flemmixResolveEmbed(ctx, e.url, referer).then(function (rows) {
            return (rows || []).map(function (r) {
              var out = Object.assign({}, r, {
                name: 'Flemmix · ' + host,
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
      return [].concat.apply([], groups).filter(function (r) {
        if (!r || !r.url || seen[r.url]) return false;
        seen[r.url] = true;
        return true;
      });
    })
    .catch(function () {
      return [];
    });
}
