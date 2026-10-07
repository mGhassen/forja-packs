var SPECS = {
  base: 'https://animezid.cam',
};

var AZ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// Site watch servers we can turn into native streams, best first. MegaMax lists
// mirrors per quality; VidTube and Uqload are packed JW pages.
var AZ_SERVER_ORDER = ['megamax', 'vidtube', 'uqload'];

// MegaMax mirror drivers, best first. `unpack` = packed page read here; the rest go to hops.
var AZ_MIRRORS = {
  uqload: { name: 'Uqload', unpack: true },
  lulustream: { name: 'LuluStream', unpack: true },
  voe: { name: 'Voe' },
  mp4upload: { name: 'Mp4Upload' },
  doodstream: { name: 'DoodStream' },
  mixdrop: { name: 'Mixdrop' },
};
var AZ_MIRROR_ORDER = ['uqload', 'lulustream', 'voe', 'mp4upload', 'doodstream', 'mixdrop'];
var AZ_MIRRORS_PER_QUALITY = 2;
var AZ_EPISODES_PER_PAGE = 60;
var AZ_MAX_SEASON_PAGES = 25;

var AZ_AUDIO = {
  dub: { tag: '(DUB)', language: 'Arabic' },
  sub: { tag: '(SUB)', language: 'Arabic Sub' },
};

function azNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/uu/g, 'u')
    .replace(/ou/g, 'o');
}

function azDecode(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Latin name + year from a mixed Arabic/Latin card title, e.g. "فيلم موانا | Moana 2016 مدبلج".
function azLatinName(raw) {
  var latin = String(raw || '')
    .replace(/[^\x00-\x7f]+/g, ' ')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var year = '';
  var ym = latin.match(/\s((?:19|20)\d{2})$/);
  if (ym) {
    year = ym[1];
    latin = latin.slice(0, ym.index).trim();
  }
  return { name: latin, norm: azNorm(latin), year: year };
}

function azAudioOf(label) {
  if (/مدبلج|الدبلجة/.test(label)) return 'dub';
  return 'sub';
}

// "Title Season 2" / "Title 2nd Season" → { base: "Title", season: 2 }.
function azSplitSeason(title) {
  var t = String(title || '');
  var m = t.match(/^(.*?)[\s:]+(?:season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+season)\s*$/i);
  if (!m) return { base: t, season: 0 };
  return { base: m[1].trim(), season: parseInt(m[2] || m[3], 10) || 0 };
}

function azScore(norm, queries) {
  if (!norm) return 0;
  var best = 0;
  queries.forEach(function (q) {
    if (!q) return;
    if (norm === q) best = Math.max(best, 1);
    else if (norm.indexOf(q) >= 0 || q.indexOf(norm) >= 0) {
      var ratio = Math.min(norm.length, q.length) / Math.max(norm.length, q.length);
      if (ratio >= 0.85) best = Math.max(best, 0.8);
    }
  });
  return best;
}

function azRandomSid() {
  var chars = '0123456789abcdef';
  var out = '';
  for (var i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * 16));
  return out;
}

// Tier from either side, so 1440x1080 (4:3) and 1918x802 (scope) both read 1080p.
function azQualityFromResolution(res, label) {
  var parts = String(res || '').split('x');
  var w = parseInt(parts[0], 10) || 0;
  var h = parseInt(parts[1], 10) || 0;
  var tier = Math.max(
    w >= 3800 ? 2160 : w >= 1900 ? 1080 : w >= 1270 ? 720 : w >= 850 ? 480 : w > 0 ? 360 : 0,
    h >= 2000 ? 2160 : h >= 1000 ? 1080 : h >= 700 ? 720 : h >= 460 ? 480 : h > 0 ? 360 : 0,
  );
  if (tier) return tier + 'p';
  var m = String(label || '').match(/(\d{3,4})p/);
  return m ? m[1] + 'p' : '';
}

function azQualityRank(q) {
  var m = String(q || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var isMovie = ctx.type === 'movie';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  var wantYear = String(ctx.year || '').slice(0, 4);
  var sid = azRandomSid();
  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) || ['sub', 'dub'];

  function headers(extra) {
    return Object.assign(
      {
        'User-Agent': AZ_UA,
        Accept: 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'ar,en;q=0.8',
        Cookie: 'PHPSESSID=' + sid,
      },
      extra || {},
    );
  }

  function getText(url, extra) {
    return ctx.fetch(url, { headers: headers(extra) }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function absUrl(href) {
    href = azDecode(href);
    if (href.indexOf('//') === 0) return 'https:' + href;
    if (href.indexOf('/') === 0) return base + href;
    return href;
  }

  // ---- title candidates -------------------------------------------------

  var forcedSeason = 0;
  var queries = [];
  var queryNorms = [];
  (function () {
    var seen = {};
    var raw = [ctx.title, ctx.titleEnglish, ctx.titleRomaji, ctx.originalTitle];
    if (Array.isArray(ctx.titles)) raw = raw.concat(ctx.titles);
    raw.forEach(function (t) {
      t = String(t || '').trim();
      if (!t) return;
      var split = isMovie ? { base: t, season: 0 } : azSplitSeason(t);
      if (split.season && !forcedSeason) forcedSeason = split.season;
      var n = azNorm(split.base);
      if (!n || seen[n]) return;
      seen[n] = true;
      queries.push(split.base);
      queryNorms.push(n);
    });
  })();

  // ---- search -----------------------------------------------------------

  function parseCards(html) {
    var out = [];
    var re = /class="az-card__link"\s+href="([^"]+)"\s+aria-label="([^"]+)"/g;
    var m;
    while ((m = re.exec(html)) !== null) {
      var href = absUrl(m[1]);
      var label = azDecode(m[2]);
      var series = href.indexOf('/series/') >= 0;
      var movie = !series && /watch\.php\?vid=/.test(href) && /فيلم/.test(label) && !/الحلقة/.test(label);
      if (!series && !movie) continue;
      var title = label.replace(/^(?:فتح|مشاهدة)\s+(?:مسلسل|فيلم)\s+/, '');
      var latin = azLatinName(title);
      var slugNorm = '';
      if (series) {
        var slug = (href.match(/\/series\/([^/?#]+)/) || [])[1] || '';
        try {
          slug = decodeURIComponent(slug);
        } catch (e) {}
        slugNorm = azNorm(slug.replace(/-(?:arabic|dubbed|dub|sub|subbed)\b/g, '').replace(/-\d+$/, ''));
      }
      out.push({
        href: href,
        kind: series ? 'series' : 'movie',
        audio: azAudioOf(label),
        norm: latin.norm,
        slugNorm: slugNorm,
        year: latin.year,
        vid: (href.match(/vid=([A-Za-z0-9]+)/) || [])[1] || '',
      });
    }
    return out;
  }

  // Site search matches the exact phrase, so "Series: Subtitle" falls back to each half.
  function splitTerms() {
    var out = [];
    queries.slice(0, 3).forEach(function (q) {
      q.split(/\s*[:\-–]\s+/).forEach(function (part) {
        part = part.trim();
        if (part.length >= 4 && part !== q && out.indexOf(part) < 0) out.push(part);
      });
    });
    return out.slice(0, 4);
  }

  function search() {
    var seen = {};
    var all = [];
    function run(terms) {
      return terms.reduce(function (chain, q) {
        return chain.then(function () {
          return getText(base + '/search.php?keywords=' + encodeURIComponent(q))
            .then(function (html) {
              parseCards(html).forEach(function (c) {
                if (seen[c.href]) return;
                seen[c.href] = true;
                all.push(c);
              });
            })
            .catch(function () {});
        });
      }, Promise.resolve());
    }
    return run(queries.slice(0, 3))
      .then(function () {
        if (!all.length) return run(splitTerms());
      })
      .then(function () {
        return all;
      });
  }

  // Dub series are often titled in Arabic only; their page description names the original title.
  function descriptionMatches(card) {
    return getText(card.href)
      .then(function (html) {
        var d = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
        var parts = azDecode(d).split(/[^\x00-\x7f]+|\|/);
        for (var i = 0; i < parts.length; i++) {
          if (azScore(azNorm(parts[i]), queryNorms) >= 1) return html;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function pickTitle(cards, audio) {
    var kind = isMovie ? 'movie' : 'series';
    var pool = cards.filter(function (c) {
      return c.kind === kind && c.audio === audio;
    });
    var scored = pool
      .map(function (c) {
        var s = Math.max(azScore(c.norm, queryNorms), azScore(c.slugNorm, queryNorms));
        if (isMovie && wantYear && c.year) {
          // Site movie titles add series numbering ("the Movie 3: …"); trust that only with a matching year.
          if (c.year === wantYear && s < 0.8) {
            var bare = c.norm.replace(/\d+/g, '');
            queryNorms.forEach(function (q) {
              if (bare && bare === q.replace(/\d+/g, '')) s = 0.8;
            });
          }
          s += c.year === wantYear ? 0.1 : -0.3;
        }
        return { card: c, score: s };
      })
      .filter(function (x) {
        return x.score >= 0.8;
      })
      .sort(function (a, b) {
        return b.score - a.score;
      });
    if (scored.length) return Promise.resolve({ card: scored[0].card, html: null });
    if (isMovie || audio !== 'dub') return Promise.resolve(null);
    var unnamed = pool
      .filter(function (c) {
        return !c.norm;
      })
      .slice(0, 3);
    return unnamed.reduce(function (chain, c) {
      return chain.then(function (found) {
        if (found) return found;
        return descriptionMatches(c).then(function (html) {
          return html ? { card: c, html: html } : null;
        });
      });
    }, Promise.resolve(null));
  }

  // ---- episodes ---------------------------------------------------------

  function parseSeasons(html, seriesUrl) {
    var out = [];
    var re = /class="az-card__link"\s+href="([^"]+\/season\/(\d+)\/)"/g;
    var m;
    var seen = {};
    while ((m = re.exec(html)) !== null) {
      var n = parseInt(m[2], 10);
      if (seen[n]) continue;
      seen[n] = true;
      var card = html.slice(re.lastIndex, re.lastIndex + 2000).split('</article>')[0];
      var count = (card.match(/(\d+)\s*حلقة/) || [])[1];
      out.push({ number: n, url: absUrl(m[1]), count: parseInt(count, 10) || 0 });
    }
    out.sort(function (a, b) {
      return a.number - b.number;
    });
    if (!out.length) out.push({ number: 1, url: seriesUrl, count: 0 });
    return out;
  }

  function parseEpisodes(html) {
    var out = [];
    var re = /href="[^"]*watch\.php\?vid=([A-Za-z0-9]+)"[^>]*aria-label="([^"]*الحلقة\s+(\d+)[^"]*)"/g;
    var m;
    while ((m = re.exec(html)) !== null) out.push({ vid: m[1], number: parseInt(m[3], 10) });
    return out;
  }

  function pageUrl(seasonUrl, page) {
    return page <= 1 ? seasonUrl : seasonUrl + (seasonUrl.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  }

  // Episode labels are either absolute (One Piece arcs) or restart each season.
  function findInSeason(season, absolute, local) {
    var tried = {};
    var maxPage = 1;
    function scan(page) {
      tried[page] = true;
      return getText(pageUrl(season.url, page)).then(function (html) {
        var re = /[?&]page=(\d+)/g;
        var m;
        while ((m = re.exec(html)) !== null) maxPage = Math.max(maxPage, parseInt(m[1], 10) || 1);
        var eps = parseEpisodes(html);
        var hit = null;
        for (var i = 0; i < eps.length && !hit; i++) if (eps[i].number === absolute) hit = eps[i];
        for (var j = 0; j < eps.length && !hit; j++) if (eps[j].number === local) hit = eps[j];
        return hit;
      });
    }
    var guess = Math.max(1, Math.floor((local - 1) / AZ_EPISODES_PER_PAGE) + 1);
    return scan(guess)
      .catch(function () {
        return null;
      })
      .then(function (hit) {
        if (hit) return hit;
        var page = 1;
        function next() {
          while (tried[page]) page++;
          if (page > Math.min(maxPage, AZ_MAX_SEASON_PAGES)) return null;
          return scan(page).then(function (h) {
            return h || next();
          });
        }
        return next();
      });
  }

  function findEpisode(seriesUrl, seriesHtml) {
    var load = seriesHtml ? Promise.resolve(seriesHtml) : getText(seriesUrl);
    return load.then(function (html) {
      var seasons = parseSeasons(html, seriesUrl);
      var season = seasons[seasons.length - 1];
      var offset = 0;
      if (forcedSeason) {
        season =
          seasons.filter(function (s) {
            return s.number === forcedSeason;
          })[0] || null;
        if (!season) return null;
        return findInSeason(season, ep, ep);
      }
      for (var i = 0; i < seasons.length; i++) {
        if (!seasons[i].count || ep <= offset + seasons[i].count) {
          season = seasons[i];
          break;
        }
        offset += seasons[i].count;
      }
      if (season === seasons[seasons.length - 1] && seasons.length > 1 && ep > offset + season.count) {
        offset = 0;
        for (var k = 0; k < seasons.length - 1; k++) offset += seasons[k].count;
      }
      return findInSeason(season, ep, ep - offset);
    });
  }

  // ---- playback ---------------------------------------------------------

  function postJson(url, body, csrf) {
    return ctx
      .fetch(url, {
        method: 'POST',
        headers: headers({
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Playback-CSRF': csrf,
          Origin: base,
          Referer: base + '/',
        }),
        body: JSON.stringify(body),
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return j || {};
        });
      });
  }

  function openSession(vid) {
    return getText(base + '/play.php?vid=' + encodeURIComponent(vid), { Referer: base + '/' }).then(function (html) {
      var csrf = (html.match(/data-playback-csrf="([^"]+)"/) || [])[1];
      if (!csrf) throw new Error('no csrf');
      return postJson(base + '/web-playback/sessions', { content_id: vid }, csrf).then(function (s) {
        if (!s.session_id || !Array.isArray(s.sources)) throw new Error('no session');
        return { id: s.session_id, csrf: csrf, sources: s.sources };
      });
    });
  }

  // One-use launch grant → 302 to the embed. Returns the embed URL and page.
  function launch(session, source) {
    var url =
      base +
      '/web-playback/sessions/' +
      encodeURIComponent(session.id) +
      '/sources/' +
      encodeURIComponent(source.id) +
      '/resolve';
    return postJson(url, {}, session.csrf).then(function (j) {
      var l = String(j.launch_url || '');
      if (l.indexOf('/web-playback/launch/') < 0) throw new Error('no launch');
      return ctx.fetch(absUrl(l), { headers: headers({ Referer: base + '/' }) }).then(function (r) {
        return r.text().then(function (html) {
          return { url: String(r.url || ''), html: html };
        });
      });
    });
  }

  function unpackRow(embedUrl, html, serverName) {
    var direct = arabicExtractFromEmbedHtml(html);
    return direct ? arabicDirectRow(direct, serverName, embedUrl) : null;
  }

  function resolveMirror(mirror, referer) {
    var meta = AZ_MIRRORS[mirror.driver];
    var url = absUrl(mirror.link);
    if (meta.unpack) {
      return arabicResolveEmbed(ctx, url, referer, meta.name).then(function (row) {
        return row ? [row] : [];
      });
    }
    return ctx.hop(url).then(function (rows) {
      return (rows || []).map(function (r) {
        return Object.assign({}, r, { name: meta.name });
      });
    });
  }

  function megamaxRows(embed) {
    var origin = '';
    try {
      origin = new URL(embed.url).origin;
    } catch (e) {
      return Promise.resolve([]);
    }
    var page = embed.html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
    var version = '';
    var component = 'files/mirror/video';
    try {
      var data = JSON.parse(page[1]);
      version = String(data.version || '');
      component = String(data.component || component);
    } catch (e) {}
    return ctx
      .fetch(embed.url, {
        headers: {
          'User-Agent': AZ_UA,
          Accept: 'text/html, application/xhtml+xml',
          Referer: embed.url,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Inertia': 'true',
          'X-Inertia-Version': version,
          'X-Inertia-Partial-Data': 'streams',
          'X-Inertia-Partial-Component': component,
        },
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var streams = (j && j.props && j.props.streams) || {};
        var groups = Array.isArray(streams.data) ? streams.data : [];
        return Promise.all(
          groups.map(function (g) {
            var quality = azQualityFromResolution(g.resolution, g.label);
            var mirrors = (g.mirrors || [])
              .map(function (m) {
                return { driver: String(m.driver || '').toLowerCase(), link: String(m.link || '') };
              })
              .filter(function (m) {
                return AZ_MIRRORS[m.driver] && m.link;
              })
              .sort(function (a, b) {
                return AZ_MIRROR_ORDER.indexOf(a.driver) - AZ_MIRROR_ORDER.indexOf(b.driver);
              });
            var found = [];
            return mirrors
              .reduce(function (chain, m) {
                return chain.then(function () {
                  if (found.length >= AZ_MIRRORS_PER_QUALITY) return;
                  return resolveMirror(m, origin + '/')
                    .then(function (rows) {
                      if (rows.length) found.push(rows[0]);
                    })
                    .catch(function () {});
                });
              }, Promise.resolve())
              .then(function () {
                return found.map(function (r) {
                  return Object.assign({}, r, { quality: quality });
                });
              });
          }),
        );
      })
      .then(function (groups) {
        return [].concat.apply([], groups);
      })
      .catch(function () {
        return [];
      });
  }

  function vidtubeRows(embed) {
    var u;
    try {
      u = new URL(embed.url);
    } catch (e) {
      return Promise.resolve([]);
    }
    var code = u.pathname.replace(/\.html$/, '').split('/').pop().split('-').pop();
    if (!code) return Promise.resolve([]);
    return ctx
      .fetch(u.origin + '/dl', {
        method: 'POST',
        headers: {
          'User-Agent': AZ_UA,
          Referer: embed.url,
          Origin: u.origin,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'op=embed&file_code=' + encodeURIComponent(code) + '&auto=1&referer=' + encodeURIComponent(base + '/'),
      })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        var row = unpackRow(embed.url, html, 'VidTube');
        return row ? [row] : [];
      })
      .catch(function () {
        return [];
      });
  }

  function serverRows(server, embed) {
    if (server === 'megamax') return megamaxRows(embed);
    if (server === 'vidtube') return vidtubeRows(embed);
    var row = unpackRow(embed.url, embed.html, 'Uqload');
    return Promise.resolve(row ? [row] : []);
  }

  // The site rate-limits launches, so servers are tried one at a time until one plays.
  function streamsFor(vid) {
    return openSession(vid).then(function (session) {
      var servers = session.sources
        .filter(function (s) {
          return s.type === 'embedded_web';
        })
        .map(function (s) {
          return { source: s, key: String(s.provider || '').toLowerCase() };
        })
        .filter(function (s) {
          return AZ_SERVER_ORDER.indexOf(s.key) >= 0;
        })
        .sort(function (a, b) {
          return AZ_SERVER_ORDER.indexOf(a.key) - AZ_SERVER_ORDER.indexOf(b.key);
        });
      return servers.reduce(function (chain, s) {
        return chain.then(function (rows) {
          if (rows.length) return rows;
          return launch(session, s.source)
            .then(function (embed) {
              return serverRows(s.key, embed);
            })
            .catch(function () {
              return [];
            });
        });
      }, Promise.resolve([]));
    });
  }

  function rowsForAudio(cards, audio) {
    return pickTitle(cards, audio)
      .then(function (pick) {
        if (!pick) return [];
        var target = isMovie ? Promise.resolve({ vid: pick.card.vid }) : findEpisode(pick.card.href, pick.html);
        return target.then(function (hit) {
          if (!hit || !hit.vid) return [];
          return streamsFor(hit.vid);
        });
      })
      .then(function (rows) {
        var a = AZ_AUDIO[audio];
        return rows.map(function (r) {
          var q = r.quality ? ' • ' + r.quality : '';
          return Object.assign({}, r, {
            name: 'AnimeZid [' + (r.name || 'Server') + ']' + q + ' ' + a.tag,
            title: r.title || r.name || '',
            language: a.language,
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  if (!queries.length) return Promise.resolve([]);

  return search()
    .then(function (cards) {
      if (!cards.length) return [];
      return cats.reduce(function (chain, audio) {
        return chain.then(function (acc) {
          if (!AZ_AUDIO[audio]) return acc;
          return rowsForAudio(cards, audio).then(function (rows) {
            return acc.concat(rows);
          });
        });
      }, Promise.resolve([]));
    })
    .then(function (rows) {
      var seen = {};
      return rows
        .filter(function (r) {
          if (!r || !r.url || seen[r.url]) return false;
          seen[r.url] = true;
          return true;
        })
        .sort(function (a, b) {
          return azQualityRank(b.quality) - azQualityRank(a.quality);
        });
    })
    .catch(function () {
      return [];
    });
}
