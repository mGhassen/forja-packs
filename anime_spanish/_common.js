// Shared helpers for Spanish anime extractors. Pack prelude.

var ES_ANIME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function esAnimeTitles(ctx) {
  var out = [];
  var seen = {};
  function add(t) {
    t = String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  }
  function expand(t) {
    t = String(t || '').trim();
    if (!t) return;
    add(t);
    // "BLEACH: Sennen … - Kashin-tan" → also try head / tail tokens sites index.
    var head = t.split(/[:|/]/)[0].trim();
    if (head && head.length >= 3) add(head);
    var dash = t.split(/\s+-\s+/);
    if (dash.length > 1) {
      add(dash[0].trim());
      add(dash[dash.length - 1].trim());
    }
    var noParen = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (noParen !== t) add(noParen);
  }
  expand(ctx.title);
  expand(ctx.titleEnglish);
  expand(ctx.titleRomaji);
  expand(ctx.originalTitle);
  if (Array.isArray(ctx.titles)) ctx.titles.forEach(expand);
  return out;
}

function esAnimeNormalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function esAnimeScore(query, name) {
  var q = esAnimeNormalize(query);
  var n = esAnimeNormalize(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.indexOf(q) === 0) return 90;
  if (n.indexOf(q) >= 0) return 75;
  if (q.indexOf(n) >= 0) return 60;
  // Token overlap — picks "…kashin-tan" over sibling cour seasons.
  var tokens = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(function (t) {
      return t.length >= 4;
    });
  var hit = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (n.indexOf(tokens[i]) >= 0) hit++;
  }
  return hit ? hit * 12 : 0;
}

function esAnimePick(hits, queryOrTitles) {
  if (!hits || !hits.length) return null;
  var titles = Array.isArray(queryOrTitles) ? queryOrTitles : [queryOrTitles];
  var best = null;
  var bestScore = -1;
  for (var i = 0; i < hits.length; i++) {
    var label = hits[i].name || hits[i].slug || '';
    var score = 0;
    for (var t = 0; t < titles.length; t++) {
      var s = esAnimeScore(titles[t], label);
      if (s > score) score = s;
      s = esAnimeScore(titles[t], hits[i].slug || '');
      if (s > score) score = s;
    }
    if (score > bestScore) {
      bestScore = score;
      best = hits[i];
    }
  }
  return bestScore > 0 ? best : hits[0];
}

function esAnimeLangMeta(text, force) {
  if (force === 'dub') {
    return { language: 'dub', tag: '(DUB)', label: 'Latino' };
  }
  if (force === 'sub') {
    return { language: 'sub', tag: '(SUB)', label: 'Sub ES' };
  }
  var s = String(text || '').toLowerCase();
  if (/\b(catalan|catalán)\b/.test(s)) {
    return { language: 'dub', tag: '(DUB)', label: 'Catalán' };
  }
  if (
    /\b(latino|castellano|doblaje|audio[\s-]?latino|español[\s-]?latino|espanol[\s-]?latino|audio[\s-]?español|audio[\s-]?espanol)\b/.test(
      s,
    )
  ) {
    return { language: 'dub', tag: '(DUB)', label: 'Latino' };
  }
  // Explicit sub markers on Spanish sites.
  if (
    /\b(sub[\s-]?espa[nñ]ol|subtitulado|sub[\s-]?esp|vose|subtitulos)\b/.test(s)
  ) {
    return { language: 'sub', tag: '(SUB)', label: 'Sub ES' };
  }
  return { language: 'sub', tag: '(SUB)', label: 'Sub ES' };
}

function esAnimeCategoryOk(ctx, meta) {
  var cat = String((ctx && ctx.category) || '')
    .toLowerCase()
    .trim();
  if (cat === 'dub' && meta.language !== 'dub') return false;
  if (cat === 'sub' && meta.language !== 'sub') return false;
  return true;
}

function esAnimeWantDub(ctx) {
  return (
    String((ctx && ctx.category) || '')
      .toLowerCase()
      .trim() === 'dub'
  );
}

function esAnimeWantSub(ctx) {
  return (
    String((ctx && ctx.category) || '')
      .toLowerCase()
      .trim() === 'sub'
  );
}

/** Extra search strings when hub filter is Spanish dub. */
function esAnimeDubQueries(titles) {
  var out = [];
  var seen = {};
  function add(t) {
    t = String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  }
  (titles || []).forEach(function (t) {
    add(t + ' latino');
    add(t + ' castellano');
    add(t + ' audio latino');
  });
  return out;
}

function esAnimeIsLatinoHit(hit) {
  var blob = String((hit && (hit.slug || '')) + ' ' + (hit && (hit.name || ''))).toLowerCase();
  return /\b(latino|castellano|audio-latino|doblaje)\b/.test(blob);
}

function esAnimeHex2a(hex) {
  var h = String(hex || '').replace(/[^0-9a-f]/gi, '');
  if (!h || h.length % 2) return '';
  var out = '';
  for (var i = 0; i < h.length; i += 2) {
    out += String.fromCharCode(parseInt(h.substr(i, 2), 16));
  }
  return out;
}

function esAnimeA2hex(str) {
  return Array.prototype.map
    .call(String(str || ''), function (c) {
      return ('0' + c.charCodeAt(0).toString(16)).slice(-2);
    })
    .join('');
}

function esAnimeIsEmbedPage(url) {
  var u = String(url || '');
  if (!/^https?:\/\//i.test(u)) return true;
  // Reject file-host HTML shells only — hop CDN / m3u8 / mp4 URLs pass.
  if (/\.(m3u8|mp4|mkv|webm)(\?|#|$)/i.test(u)) return false;
  return /(?:filemoon|voe\.|mp4upload|uqload|mixdrop|mxdrop|lulu(?:vdo|stream|vid)|doo+d(?:ster|stream)?|streamwish|streamtape|streamsb|embedsb|filelions|vidhide|yourupload\.com|ok\.ru|mega\.nz|abyssplayer|rpmvid|listeamed|dsvplay|ds2play|bysesu|hqq\.tv|tioanime\.com\/embed)/i.test(
    u,
  );
}

function esAnimeNormalizeEmbed(url) {
  var u = String(url || '').trim();
  if (!u) return '';
  if (u.indexOf('//') === 0) u = 'https:' + u;
  // Keep bysesukior / byse mirrors on their own host — Filemoon hop hits /api/videos/{code}/ there.
  u = u
    .replace(/^https?:\/\/uqload\.(cx|is|net)\//i, 'https://uqload.com/')
    .replace(/^https?:\/\/uqload\.to\//i, 'https://uqload.com/')
    .replace(/^https?:\/\/mixdrop\.ps\//i, 'https://mxdrop.top/')
    .replace(/^https?:\/\/mxdrop\.to\//i, 'https://mixdrop.to/')
    .replace(/^https?:\/\/www\.mp4upload\.com\//i, 'https://www.mp4upload.com/');
  return u;
}

// Byse geo-stamps dead edges (esp. *-waw-*.r66nv9ed.com). Same signed path
// serves from the moscow sprintcdn mirror — apply after every hop.
function esAnimeRewriteSprintCdn(url) {
  var u = String(url || '');
  if (!u) return u;
  return u.replace(
    /^https?:\/\/(?:edge\d+-[a-z0-9-]+-)?sprintcdn\.r66nv9ed\.com\//i,
    'https://edge1-moscow-sprintcdn.owphbf24.com/',
  );
}

function esAnimeFetchText(ctx, url, referer) {
  var http =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch.bind(ctx);
  return http(url, {
    headers: {
      'User-Agent': ES_ANIME_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      Referer: referer || url,
    },
  }).then(function (r) {
    if (!r || !r.ok) return '';
    return r.text().then(function (t) {
      return t || '';
    });
  });
}

function esAnimePostForm(ctx, url, body, referer) {
  return ctx
    .fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': ES_ANIME_UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: '*/*',
        Origin: String(url).replace(/\/[^/]*$/, ''),
        Referer: referer || url,
      },
      body: body,
    })
    .then(function (r) {
      if (!r || !r.ok) return '';
      return r.text().then(function (t) {
        return t || '';
      });
    });
}

function esAnimeFollowRedirect(ctx, url, referer) {
  return ctx
    .fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': ES_ANIME_UA,
        Referer: referer || url,
        Accept: 'text/html,*/*',
      },
    })
    .then(function (r) {
      if (!r) return '';
      var loc =
        (r.headers && (r.headers.get('location') || r.headers.get('Location'))) || '';
      if (loc) {
        if (loc.indexOf('//') === 0) loc = 'https:' + loc;
        if (loc.indexOf('/') === 0) {
          try {
            loc = new URL(url).origin + loc;
          } catch (e) {}
        }
        return loc;
      }
      if (r.url && String(r.url) !== String(url)) return String(r.url);
      return r.text().then(function (html) {
        var m = String(html || '').match(
          /(?:iframe|location|src)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
        );
        return m ? m[1] : '';
      });
    })
    .catch(function () {
      return '';
    });
}

function esAnimeHopAll(ctx, brand, embeds) {
  return Promise.all(
    (embeds || []).map(function (e) {
      var url = esAnimeNormalizeEmbed(e.url);
      if (!url) return Promise.resolve([]);
      var meta = e.meta || esAnimeLangMeta(e.server || '');
      if (!esAnimeCategoryOk(ctx, meta)) return Promise.resolve([]);
      var label =
        brand +
        ' [' +
        (e.server || 'Server') +
        ' · ' +
        meta.label +
        '] ' +
        meta.tag;
      function stamp(rows) {
        return (rows || [])
          .map(function (r) {
            var play = esAnimeRewriteSprintCdn(r && r.url ? String(r.url) : '');
            // Never ship file-host HTML embeds to the player.
            if (!play || esAnimeIsEmbedPage(play)) return null;
            return Object.assign({}, r, {
              url: play,
              name: label,
              title: meta.label,
              language: meta.language, // sub | dub — Sources chips; ES filter keeps both
            });
          })
          .filter(Boolean);
      }
      // Direct play URLs (archive.org mp4, CDN m3u8, …) — skip hop.
      if (!esAnimeIsEmbedPage(url)) {
        return Promise.resolve(
          stamp([
            {
              url: url,
              headers: e.referer
                ? { Referer: e.referer, 'User-Agent': ES_ANIME_UA }
                : undefined,
            },
          ]),
        );
      }
      if (typeof ctx.hop !== 'function') return Promise.resolve([]);
      return ctx
        .hop(url)
        .then(function (rows) {
          return stamp(rows);
        })
        .catch(function () {
          return [];
        });
    }),
  ).then(function (groups) {
    var seen = {};
    return [].concat.apply([], groups).filter(function (r) {
      if (!r || !r.url || seen[r.url]) return false;
      seen[r.url] = true;
      return true;
    });
  });
}

function esAnimeEpisode(ctx) {
  return Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
}

function esAnimeParseOptHtml(html) {
  var out = [];
  var re =
    /<li\b([^>]*)>[\s\S]*?(?:<span[^>]*>|<i[^>]*>)([^<]+)/gi;
  var m;
  while ((m = re.exec(String(html || ''))) !== null) {
    var attrs = m[1] || '';
    var server = String(m[2] || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!server) continue;
    var enc = (attrs.match(/\bencrypt=["']([^"']+)["']/i) || [])[1] || '';
    var data = (attrs.match(/\bdata=["']([^"']+)["']/i) || [])[1] || '';
    var url = data || esAnimeHex2a(enc);
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url: url, server: server });
  }
  if (!out.length) {
    var re2 = /encrypt=["']([0-9a-f]+)["'][^>]*title=["']([^"']+)["']/gi;
    while ((m = re2.exec(String(html || ''))) !== null) {
      var u = esAnimeHex2a(m[1]);
      if (/^https?:\/\//i.test(u)) out.push({ url: u, server: m[2] });
    }
  }
  return out;
}
