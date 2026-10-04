var SPECS = {
  "base": "https://anizone.to",
  "mapApi": "https://id-mapping-api-malid.hf.space/api/resolve",
  "jikan": "https://api.jikan.moe/v4/anime",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = cfg.base.replace(/\/$/, '');
  var tmdbKey = cfg.tmdbKey;
  var mapApi = cfg.mapApi;
  var jikan = cfg.jikan;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Referer: base + '/' };
  var isTv = ctx.type !== 'movie';

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

  function normalize(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  /** Collapse Season 2 / 2nd Season / Second Season / II into a comparable key. */
  function seasonNormalize(str) {
    var s = normalize(str);
    s = s
      .replace(/secondseason/g, 'season2')
      .replace(/thirdseason/g, 'season3')
      .replace(/fourthseason/g, 'season4')
      .replace(/fifthseason/g, 'season5')
      .replace(/(\d+)(?:st|nd|rd|th)season/g, 'season$1')
      .replace(/season(\d+)/g, 's$1')
      .replace(/([a-z])ii$/g, '$1s2')
      .replace(/([a-z])iii$/g, '$1s3')
      .replace(/([a-z])iv$/g, '$1s4');
    return s;
  }

  /**
   * Alpine embeds JSON inside a JS single-quoted string:
   * quotes as \u0022, unicode inside values as \\uXXXX.
   * Evaluate those escapes like JS, then JSON.parse.
   */
  function decodeAlpineJson(escaped) {
    var s = String(escaped || '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) !== '\\') {
        out += s.charAt(i);
        continue;
      }
      var n = s.charAt(++i);
      if (n === 'u' && /^[0-9a-fA-F]{4}/.test(s.slice(i + 1, i + 5))) {
        out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
        i += 4;
      } else if (n === 'n') out += '\n';
      else if (n === 'r') out += '\r';
      else if (n === 't') out += '\t';
      else out += n;
    }
    return JSON.parse(out);
  }

  /** Pull the string arg from the first `JSON.parse('...')` after `needle`. */
  function extractJsonParseArg(html, needle) {
    var src = String(html || '');
    var idx = needle ? src.indexOf(needle) : 0;
    if (idx < 0) return null;
    var start = src.indexOf("JSON.parse('", idx);
    if (start < 0) return null;
    start += "JSON.parse('".length;
    var out = '';
    for (var i = start; i < src.length; i++) {
      var ch = src.charAt(i);
      if (ch === '\\') {
        out += ch + src.charAt(i + 1);
        i++;
        continue;
      }
      if (ch === "'") return out;
      out += ch;
    }
    return null;
  }

  function titleAndMapping() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost) {
      // Host already has title + mapped ep — skip Jikan (often slow/rate-limited).
      return Promise.resolve({
        title: fromHost.title || ctx.title || '',
        mappedEp: fromHost.mappedEp,
        mapping: { mal_id: fromHost.malId, mal_episode: fromHost.mappedEp },
      });
    }
    if (!isTv) {
      return getJson(
        'https://tmdb.forjahq.xyz/3/movie/' +
          encodeURIComponent(String(ctx.tmdbId || '')) +
          '?api_key=' +
          encodeURIComponent(tmdbKey),
      ).then(function (d) {
        return { title: d.title || d.original_title || '', mappedEp: 1, mapping: null };
      });
    }
    var imdbP = ctx.imdbId
      ? Promise.resolve(String(ctx.imdbId))
      : getJson(
          'https://tmdb.forjahq.xyz/3/tv/' +
            encodeURIComponent(String(ctx.tmdbId || '')) +
            '/external_ids?api_key=' +
            encodeURIComponent(tmdbKey),
        )
          .then(function (d) {
            return (d && d.imdb_id) || '';
          })
          .catch(function () {
            return '';
          });
    return imdbP.then(function (imdbId) {
      if (!imdbId) return { title: ctx.title || '', mappedEp: ctx.episode || 1, mapping: null };
      return getJson(
        mapApi +
          '?id=' +
          encodeURIComponent(imdbId) +
          '&s=' +
          encodeURIComponent(String(ctx.season || 1)) +
          '&e=' +
          encodeURIComponent(String(ctx.episode || 1)),
      )
        .then(function (mapping) {
          if (!mapping || !mapping.mal_id) {
            return { title: ctx.title || '', mappedEp: ctx.episode || 1, mapping: null };
          }
          return getJson(jikan + '/' + mapping.mal_id)
            .then(function (j) {
              return {
                title:
                  (j && j.data && j.data.title) ||
                  mapping.anime_title ||
                  ctx.title ||
                  '',
                mappedEp: mapping.mal_episode || ctx.episode || 1,
                mapping: mapping,
              };
            })
            .catch(function () {
              return {
                title: mapping.anime_title || ctx.title || '',
                mappedEp: mapping.mal_episode || ctx.episode || 1,
                mapping: mapping,
              };
            });
        })
        .catch(function () {
          return { title: ctx.title || '', mappedEp: ctx.episode || 1, mapping: null };
        });
    });
  }

  function parseSearchCards(html) {
    var cards = [];
    var raw = extractJsonParseArg(html, 'items:');
    if (!raw) {
      // Older Alpine shape (pre-redesign) — keep as fallback.
      var $search = ctx.html(html);
      $search('[x-data*="anmTitles"]').each(function (_, el) {
        var href = $search(el).find('a[href*="/anime/"]').first().attr('href');
        if (!href) return;
        var parts = href.split('/');
        var slug = parts[parts.length - 1] || parts[parts.length - 2];
        var xData = $search(el).attr('x-data') || '';
        var titles = {};
        var defaultTitle = (xData.match(/window\.getTitle\(this\.anmTitles,\s*'([^']+)'\)/) || [])[1];
        if (defaultTitle) titles[defaultTitle] = true;
        var jsonMatch = xData.match(/JSON\.parse\('([^']+)'\)/);
        if (jsonMatch) {
          try {
            var parsed = decodeAlpineJson(jsonMatch[1]);
            Object.keys(parsed || {}).forEach(function (k) {
              if (parsed[k]) titles[parsed[k]] = true;
            });
          } catch (e) {}
        }
        if (slug) cards.push({ slug: slug, titles: Object.keys(titles) });
      });
      return cards;
    }
    try {
      var items = decodeAlpineJson(raw);
      (items || []).forEach(function (it) {
        if (!it || !it.slug) return;
        var titles = {};
        if (it.main_title) titles[it.main_title] = true;
        var list = it.title_list || {};
        Object.keys(list).forEach(function (k) {
          if (list[k]) titles[list[k]] = true;
        });
        cards.push({ slug: String(it.slug), titles: Object.keys(titles) });
      });
    } catch (e) {}
    return cards;
  }

  function inferSeason(title, fallback) {
    var s = String(title || '');
    var m =
      s.match(/(\d+)(?:st|nd|rd|th)\s*season/i) ||
      s.match(/season\s*(\d+)/i) ||
      s.match(/\bsecond\s*season\b/i) ||
      s.match(/\bthird\s*season\b/i);
    if (m) {
      if (/second/i.test(m[0])) return 2;
      if (/third/i.test(m[0])) return 3;
      return parseInt(m[1], 10) || fallback;
    }
    if (/\bII\b/.test(s)) return 2;
    if (/\bIII\b/.test(s)) return 3;
    if (/\bIV\b/.test(s)) return 4;
    return fallback;
  }

  function seasonSuffix(key) {
    var m = String(key || '').match(/s(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }

  function matchCard(cards, animeTitle, baseTitle, season) {
    var target = seasonNormalize(animeTitle);
    var targetNoSub = seasonNormalize(String(animeTitle).split(':')[0]);
    var normalizedBase = seasonNormalize(
      String(baseTitle || '').replace(/\s*(\d+(?:st|nd|rd|th)\s*)?season\s*\d*/gi, '').trim(),
    );
    var wantSeason = seasonSuffix(target) || seasonSuffix(targetNoSub) || season || 1;

    function titleFitsSeason(normTitle) {
      var cardSeason = seasonSuffix(normTitle);
      if (wantSeason <= 1) return cardSeason == null || cardSeason === 1;
      return cardSeason === wantSeason;
    }

    // Exact season-normalized title.
    for (var i = 0; i < cards.length; i++) {
      for (var j = 0; j < cards[i].titles.length; j++) {
        var normTitle = seasonNormalize(cards[i].titles[j]);
        var normTitleNoSub = seasonNormalize(String(cards[i].titles[j]).split(':')[0]);
        if (normTitle === target || normTitleNoSub === targetNoSub) return cards[i].slug;
      }
    }

    // Same season + shares the base title (avoid "blackclovers2" ⊃ "blackclover").
    var best = null;
    var bestScore = -1;
    for (var c = 0; c < cards.length; c++) {
      for (var t = 0; t < cards[c].titles.length; t++) {
        var n = seasonNormalize(cards[c].titles[t]);
        if (!titleFitsSeason(n)) continue;
        var baseHit =
          (normalizedBase && n.indexOf(normalizedBase) >= 0) ||
          (normalizedBase && normalizedBase.indexOf(n) >= 0 && n.length >= 6);
        if (!baseHit && n.indexOf(target) < 0) continue;
        var score = n.length;
        if (n === target || n === targetNoSub) score += 1000;
        if (seasonSuffix(n) === wantSeason && wantSeason > 1) score += 100;
        if (score > bestScore) {
          bestScore = score;
          best = cards[c].slug;
        }
      }
    }
    if (best) return best;

    // Last resort: first card that fits the season filter.
    for (var k = 0; k < cards.length; k++) {
      var ok = cards[k].titles.some(function (title) {
        return titleFitsSeason(seasonNormalize(title));
      });
      if (ok) return cards[k].slug;
    }
    return null;
  }

  function parsePlayer(html) {
    var raw = extractJsonParseArg(html, 'vidstackPlayer');
    if (raw) {
      try {
        var data = decodeAlpineJson(raw);
        var masterUrl = data && data.src ? String(data.src) : '';
        if (masterUrl) {
          var subtitles = [];
          (data.subtitles || []).forEach(function (sub) {
            if (!sub || !sub.file) return;
            subtitles.push({
              url: String(sub.file),
              lang: String(sub.language || sub.title || 'en'),
            });
          });
          return { url: masterUrl, subtitles: subtitles };
        }
      } catch (e) {}
    }
    // Legacy <media-player src="..."> / bare master.m3u8 fallback.
    var $ep = ctx.html(html);
    var legacy =
      $ep('media-player').attr('src') ||
      (String(html).match(/https:\\?\/\\?\/[^"'\\\s]+\/master\.m3u8/) || [])[0];
    if (legacy) {
      legacy = String(legacy).replace(/\\\//g, '/');
      var subs = [];
      $ep('track').each(function (_, el) {
        var src = $ep(el).attr('src');
        var kind = $ep(el).attr('kind');
        if (src && (kind === 'subtitles' || kind === 'captions' || /\.ass$|\.vtt$/i.test(src))) {
          subs.push({ url: src, lang: $ep(el).attr('srclang') || 'en' });
        }
      });
      return { url: legacy, subtitles: subs };
    }
    return null;
  }

  function detectFormat(html) {
    var format = 'Sub';
    var $ep = ctx.html(html);
    $ep('button, div, span').each(function (_, el) {
      var text = $ep(el).text();
      if (text.indexOf('Audio:') >= 0 || /Japanese|English/.test(text)) {
        var chunk = text.slice(0, 200);
        var hasJapanese = chunk.indexOf('Japanese') >= 0;
        var hasEnglish = chunk.indexOf('English') >= 0;
        if (hasEnglish && !hasJapanese) format = 'Dub';
        else if (hasEnglish && hasJapanese) format = 'Sub & Dub';
      }
    });
    if (/Japanese/i.test(html) && !/Audio:[\s\S]{0,80}English/i.test(html)) format = 'Sub';
    return format;
  }

  function searchQueryFrom(state) {
    var raw =
      (state.mapping && state.mapping.anime_title) ||
      String(state.title || ctx.title || '').split(':')[0].trim();
    // Broader search: "Black Clover Season 2" → "Black Clover"
    return String(raw)
      .replace(/\s*(\d+(?:st|nd|rd|th)\s*)?season\s*\d*/gi, '')
      .replace(/\s+(II|III|IV|V)$/i, '')
      .replace(/\s+second$/i, '')
      .trim() || raw;
  }

  return titleAndMapping()
    .then(function (state) {
      if (!state.title && !ctx.title) return [];
      if (!state.title) state.title = ctx.title || '';
      var searchQuery = searchQueryFrom(state);
      return getText(base + '/anime?search=' + encodeURIComponent(searchQuery)).then(function (searchHtml) {
        var cards = parseSearchCards(searchHtml);
        if (!cards.length) return [];
        var season = inferSeason(state.title, ctx.season || 1);
        var animeSlug = isTv
          ? matchCard(
              cards,
              state.title,
              (state.mapping && state.mapping.anime_title) ||
                String(state.title).replace(/\s*(\d+(?:st|nd|rd|th)\s*)?season\s*\d*/gi, '').trim() ||
                state.title,
              season,
            )
          : (function () {
              var target = seasonNormalize(state.title);
              for (var i = 0; i < cards.length; i++) {
                for (var j = 0; j < cards[i].titles.length; j++) {
                  var n = seasonNormalize(cards[i].titles[j]);
                  if (n === target || n.indexOf(target) >= 0 || target.indexOf(n) >= 0) {
                    return cards[i].slug;
                  }
                }
              }
              return cards[0] ? cards[0].slug : null;
            })();
        if (!animeSlug) return [];
        return getText(base + '/anime/' + animeSlug + '/' + state.mappedEp).then(function (episodeHtml) {
          var player = parsePlayer(episodeHtml);
          if (!player || !player.url) return [];
          return [
            {
              url: player.url,
              name: 'AniZone',
              quality: 'Multi',
              headers: headers,
              subtitles: player.subtitles || [],
              language: detectFormat(episodeHtml),
            },
          ];
        });
      });
    })
    .catch(function () {
      return [];
    });
}
