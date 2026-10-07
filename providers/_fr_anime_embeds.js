// French anime sites (VoirAnime, Anime-Sama, …): shared title matching + embed unwrap. Pack prelude.

var FR_ANIME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

// `language` must be sub/dub: it is the field the host's Anime SUB/DUB filter reads after
// mapping. Labels name the audio; the subbed label avoids "VOSTFR"/"FRENCH", which the
// Sources chips read as French audio.
var FR_ANIME_LANGS = {
  vf: { language: 'dub', tag: '(DUB)', label: 'French dub' },
  vostfr: { language: 'sub', tag: '(SUB)', label: 'Japanese · sous-titres FR' },
};

var FR_ANIME_HOST_NAMES = {
  'ansembed.net': 'Vidmoly',
  'smoothpre.com': 'StreamWish',
  'minochinos.com': 'StreamWish',
  'dingtezuni.com': 'StreamWish',
  'video.sibnet.ru': 'Sibnet',
  'sendvid.com': 'Sendvid',
  'uqload.vc': 'Uqload',
  'lpayer.embed4me.com': 'Embed4me',
};

function frAnimeNormalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function frAnimeDecodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function frAnimeSeasonFromTitle(t) {
  var s = String(t || '');
  var m =
    s.match(/\bseason\s*(\d+)/i) || s.match(/\b(\d+)(?:st|nd|rd|th)\s*season/i) || s.match(/\bsaison\s*(\d+)/i);
  if (m) return Number(m[1]);
  if (/\bsecond\s+season\b/i.test(s)) return 2;
  if (/\bthird\s+season\b/i.test(s)) return 3;
  return 0;
}

function frAnimeStripSeason(t) {
  return String(t || '')
    .replace(/\b(?:season|saison)\s*\d+\b/gi, '')
    .replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, '')
    .replace(/\b(?:second|third)\s+season\b/gi, '')
    .replace(/[\s:–-]+$/, '')
    .trim();
}

function frAnimeTitles(ctx) {
  var out = [];
  var seen = {};
  function add(t) {
    t = frAnimeStripSeason(t);
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  }
  add(ctx.titleEnglish);
  add(ctx.title);
  add(ctx.titleRomaji);
  add(ctx.originalTitle);
  if (Array.isArray(ctx.titles)) ctx.titles.forEach(add);
  return out;
}

function frAnimeWantedSeason(ctx) {
  var fromTitle =
    frAnimeSeasonFromTitle(ctx.title) ||
    frAnimeSeasonFromTitle(ctx.titleEnglish) ||
    frAnimeSeasonFromTitle(ctx.titleRomaji);
  return fromTitle || Number(ctx.season || 1) || 1;
}

function frAnimeEpisode(ctx) {
  return ctx.type === 'movie' ? 1 : Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
}

// Site searches match title substrings, so also try the head before ':' and the first two words.
function frAnimeQueries(titles) {
  var out = [];
  function add(q) {
    q = String(q || '').trim();
    if (q && out.indexOf(q) < 0) out.push(q);
  }
  titles.forEach(function (t) {
    add(t);
    var head = t.split(/\s*[:–]\s*|\s+-\s+/)[0].trim();
    add(head);
    var words = head.split(/\s+/);
    if (words.length > 2) add(words.slice(0, 2).join(' '));
  });
  return out;
}

// names: [title, …alt names] → 1 exact · 0.9 exact before ':' · 0.7 prefix · 0.5 substring · 0
function frAnimeScore(names, titles) {
  var best = 0;
  names.forEach(function (name) {
    var h = frAnimeNormalize(frAnimeStripSeason(name));
    if (!h) return;
    var head = frAnimeNormalize(String(name).split(/\s*[:–]\s*|\s+-\s+/)[0]);
    titles.forEach(function (t) {
      var n = frAnimeNormalize(t);
      if (!n) return;
      if (h === n) best = Math.max(best, 1);
      else if (head === n) best = Math.max(best, 0.9);
      else if (h.indexOf(n) === 0 || n.indexOf(h) === 0) best = Math.max(best, 0.7);
      else if (h.indexOf(n) >= 0 || n.indexOf(h) >= 0) best = Math.max(best, 0.5);
    });
  });
  return best;
}

// search(query) → Promise<[{ slug, names }]>; resolves the best slug or null.
function frAnimeFindSlug(titles, search) {
  var chain = Promise.resolve(null);
  frAnimeQueries(titles).forEach(function (q) {
    chain = chain.then(function (found) {
      if (found && found.score >= 1) return found;
      return search(q)
        .catch(function () {
          return [];
        })
        .then(function (hits) {
          hits.forEach(function (h) {
            var s = frAnimeScore(h.names, titles);
            if (s >= 0.5 && (!found || s > found.score)) found = { slug: h.slug, score: s };
          });
          return found;
        });
    });
  });
  return chain.then(function (found) {
    return found ? found.slug : null;
  });
}

function frAnimeHost(url) {
  var m = String(url || '').match(/^https?:\/\/([^/:#?]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function frAnimeHostName(url) {
  var h = frAnimeHost(url);
  if (FR_ANIME_HOST_NAMES[h]) return FR_ANIME_HOST_NAMES[h];
  var bare = h.replace(/^www\./, '').split('.')[0];
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : 'Lecteur';
}

function frAnimeUnpack(source) {
  var s = String(source || '');
  var m = s.match(
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/,
  );
  if (!m) return '';
  var p = m[1].replace(/\\'/g, "'");
  var a = parseInt(m[2], 10);
  var c = parseInt(m[3], 10);
  var k = m[4].split('|');
  function enc(n) {
    return (n < a ? '' : enc(Math.floor(n / a))) + ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  }
  while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + enc(c) + '\\b', 'g'), k[c]);
  return p;
}

function frAnimeFetchText(ctx, url, referer) {
  return ctx
    .fetch(url, { headers: { 'User-Agent': FR_ANIME_UA, Referer: referer, Accept: 'text/html,*/*' } })
    .then(function (r) {
      return r.text();
    });
}

// JWPlayer embeds (Vidmoly white-label, StreamWish family): plain `sources:` or packed `links={…}`.
function frAnimeResolveJw(ctx, embedUrl, referer) {
  var origin = (embedUrl.match(/^https?:\/\/[^/]+/i) || [''])[0].toLowerCase();
  return frAnimeFetchText(ctx, embedUrl, referer).then(function (html) {
    var file = (html.match(/sources:\s*\[\s*\{\s*file:\s*["'](https?:[^"']+)["']/) || [])[1];
    if (!file) {
      var js = frAnimeUnpack(html);
      var lm = js.match(/links\s*=\s*(\{[^}]*\})/);
      if (lm) {
        try {
          var links = JSON.parse(lm[1]);
          file = links.hls2 || links.hls4 || links.hls3 || '';
          if (file && file.charAt(0) === '/') file = origin + file;
        } catch (e) {}
      }
      if (!file) file = (js.match(/file:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/) || [])[1];
    }
    return file ? [{ url: file, headers: { 'User-Agent': FR_ANIME_UA, Referer: origin + '/', Origin: origin } }] : [];
  });
}

function frAnimeResolveSibnet(ctx, embedUrl, referer) {
  return frAnimeFetchText(ctx, embedUrl, referer).then(function (html) {
    var src = (html.match(/player\.src\(\[\{\s*src:\s*["']([^"']+)["']/) || [])[1];
    if (!src) return [];
    var url = /^https?:/i.test(src) ? src : 'https://video.sibnet.ru' + (src.charAt(0) === '/' ? '' : '/') + src;
    return [{ url: url, headers: { 'User-Agent': FR_ANIME_UA, Referer: embedUrl } }];
  });
}

function frAnimeResolveEmbed(ctx, embedUrl, referer) {
  if (/(^|\.)sibnet\.ru$/.test(frAnimeHost(embedUrl))) {
    return frAnimeResolveSibnet(ctx, embedUrl, referer).catch(function () {
      return [];
    });
  }
  return ctx
    .hop(embedUrl)
    .then(function (rows) {
      return rows && rows.length ? rows : frAnimeResolveJw(ctx, embedUrl, referer);
    })
    .catch(function () {
      return frAnimeResolveJw(ctx, embedUrl, referer);
    })
    .catch(function () {
      return [];
    });
}

// readers: { vf: [embedUrl…], vostfr: [embedUrl…] } → stream rows tagged VF (DUB) / VOSTFR (SUB).
function frAnimeRows(ctx, provider, readers, referer) {
  var jobs = [];
  Object.keys(FR_ANIME_LANGS).forEach(function (lang) {
    var urls = readers[lang];
    if (!Array.isArray(urls)) return;
    var meta = FR_ANIME_LANGS[lang];
    urls.forEach(function (raw, i) {
      var embed = String(raw || '').trim();
      if (!/^https?:\/\//i.test(embed)) return;
      jobs.push(
        frAnimeResolveEmbed(ctx, embed, referer).then(function (rows) {
          return rows.map(function (r) {
            return Object.assign({}, r, {
              name: provider + ' [' + (r.name || frAnimeHostName(embed)) + '] ' + meta.tag,
              title: meta.label + ' · Lecteur ' + (i + 1),
              language: meta.language,
            });
          });
        }),
      );
    });
  });
  return Promise.all(jobs).then(function (groups) {
    var seen = {};
    return [].concat.apply([], groups).filter(function (r) {
      if (!r || !r.url || seen[r.url]) return false;
      seen[r.url] = true;
      return true;
    });
  });
}
