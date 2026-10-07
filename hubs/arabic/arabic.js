// Arabic hub — Larozaa only (protocol 1).
// Playback: provider `larozaa` (types: arabic). Host surface: arabic.

var ARABIC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

var ARABIC_DEFAULTS = {
  // Live origin first — older hosts chain 6–12 redirects (engine maxRedirects=8).
  bootstrap: 'https://laaroza.lat',
  mirrors: [
    'https://laaroza.lat',
    'https://laaroza.website',
    'https://laaroza.space',
    'https://laaroza.pics',
  ],
};

/** Upstream page cap per rail — Larozaa lists run to hundreds of pages. */
var ARABIC_RAIL_MAX_PAGES = 200;

function arabicSection(id, label, cat, kind) {
  return { id: id, label: label, cat: cat, kind: kind };
}

/**
 * Every Larozaa section, in hub order. Each one is a Category option and a
 * rail. Series sections list episodes (grouped into shows); film sections
 * list one card per film.
 */
var ARABIC_SECTIONS = [
  arabicSection('series', 'مسلسلات عربية', 'arabic-series46', 'series'),
  arabicSection('movies', 'أفلام عربية', 'arabic-movies35', 'movie'),
  arabicSection('turkish', 'مسلسلات تركية', 'turkish-3isk-seriess48', 'series'),
  arabicSection('ramadan', 'رمضان 2026', 'ramadan-2026', 'series'),
  arabicSection('foreign_series', 'مسلسلات أجنبية', 'english-series10', 'series'),
  arabicSection('foreign_movies', 'أفلام أجنبية', 'all_movies_13', 'movie'),
  arabicSection('indian_series', 'مسلسلات هندية', '11indian-series', 'series'),
  arabicSection('indian', 'أفلام هندية', 'indian-movies9', 'movie'),
  arabicSection('asian_series', 'مسلسلات آسيوية', '6-asya', 'series'),
  arabicSection('asian_movies', 'أفلام آسيوية', '6-asian-movies', 'movie'),
  arabicSection('anime_series', 'أنمي · مسلسلات', '6-anime-series', 'series'),
  arabicSection('anime_movies', 'أنمي · أفلام', 'anime-movies-7', 'movie'),
  arabicSection('dubbed', 'أفلام مدبلجة', '7-aflammdblgh', 'movie'),
  arabicSection('turkish_movies', 'أفلام تركية', '8-aflam3isk', 'movie'),
  arabicSection('tv_programs', 'برامج تلفزيونية', 'tv-programs12', 'series'),
  arabicSection('plays', 'مسرحيات', 'masrh-5', 'movie'),
];

// Old section ids the site now redirects (saved Category filters).
var ARABIC_CAT_ALIASES = {
  'turkish-3isk-seriess47': 'turkish-3isk-seriess48',
};

// Batched through `feed` on open; the other rails lazy-load via `rail`.
var ARABIC_FEED_RAILS = ['trending', 'latest', 'series', 'movies', 'turkish'];

// Sticky last-good origin for this JS VM (mirror walk is expensive).
var _arabicLarozaSticky = '';
var _arabicLarozaResolved = null;
var _arabicLarozaResolvePromise = null;

function arabicCatFilter(value) {
  return { op: 'eq', field: 'cat', value: String(value) };
}

function arabicSectionForCat(cat) {
  cat = ARABIC_CAT_ALIASES[String(cat)] || String(cat);
  for (var i = 0; i < ARABIC_SECTIONS.length; i++) {
    if (ARABIC_SECTIONS[i].cat === cat) return ARABIC_SECTIONS[i];
  }
  return null;
}

function arabicSectionForRail(rail) {
  for (var i = 0; i < ARABIC_SECTIONS.length; i++) {
    if (ARABIC_SECTIONS[i].id === String(rail)) return ARABIC_SECTIONS[i];
  }
  return null;
}

/** Categories menu — series sections first, then films. */
function arabicCategoryOptions() {
  var series = ARABIC_SECTIONS.filter(function (s) {
    return s.kind === 'series';
  });
  var films = ARABIC_SECTIONS.filter(function (s) {
    return s.kind === 'movie';
  });
  return series.concat(films).map(function (s) {
    return { id: s.id, label: s.label, filter: arabicCatFilter(s.cat) };
  });
}

function arabicFilters() {
  return {
    menus: [
      {
        id: 'films',
        label: 'Films',
        filter: { op: 'eq', field: 'type', value: 'movie' },
      },
      {
        id: 'series',
        label: 'Series',
        filter: { op: 'eq', field: 'type', value: 'series' },
      },
    ],
    fields: [
      { field: 'cat', label: 'Category', options: arabicCategoryOptions() },
    ],
  };
}

/** Chrome filter → { section (or ad-hoc), type: movie|series|'' }. */
function arabicChromeOf(params) {
  var filter = params && params.filter;
  var cat = hubFilterValue(filter, 'cat');
  // `kind` — menu field before `type` (layout showWhenType reads `type`).
  var type = String(
    hubFilterValue(filter, 'type') || hubFilterValue(filter, 'kind') || '',
  ).toLowerCase();
  if (type === 'tv') type = 'series';
  var section = null;
  if (cat) {
    section =
      arabicSectionForCat(cat) ||
      arabicSection(String(cat), String(cat), String(cat), 'series');
  }
  return { section: section, type: type };
}

function arabicPageOf(params) {
  return Number(params && params.page) > 0 ? Number(params.page) : 1;
}

function arabicLimitOf(params, fallback) {
  var n = Number(params && params.limit);
  if (n > 0) return n;
  n = Number(fallback);
  return n > 0 ? n : 24;
}

function arabicWithPage(path, page) {
  page = Number(page) > 0 ? Number(page) : 1;
  path = String(path || '');
  if (/[?&]page=\d+/i.test(path)) {
    return path.replace(/([?&]page=)\d+/i, '$1' + page);
  }
  if (path.indexOf('?') >= 0) return path + '&page=' + page;
  return path + '?page=' + page;
}

/** Pager links appear as `?page=N`, `&page=N`, or HTML-escaped `&amp;page=N`. */
function arabicHtmlHasNextPage(html, page) {
  var next = (Number(page) || 1) + 1;
  return new RegExp('(?:[?&]|&amp;)page=' + next + '([^0-9]|$)').test(
    String(html || ''),
  );
}

/** Search helper shape — `{ items, pageSize, hasMore }`, no clamping. */
function arabicPageResult(raw, limit, hasMore) {
  return {
    items: Array.isArray(raw) ? raw : [],
    pageSize: Number(limit) > 0 ? Number(limit) : 24,
    hasMore: !!hasMore,
  };
}

function arabicHeaders(referer) {
  var h = {
    'User-Agent': ARABIC_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  return h;
}

function arabicAbs(base, url) {
  url = String(url || '').trim();
  if (!url || url.indexOf('data:') === 0) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  base = String(base || '').replace(/\/$/, '');
  if (url.charAt(0) === '/') return base + url;
  return base + '/' + url;
}

/** Larozaa movie titles: "مشاهدة فيلم …" or "فيلم Mayday…" — not episodes. */
function arabicIsLarozaMovieTitle(title) {
  title = String(title || '');
  if (title.indexOf('الحلقة') >= 0) return false;
  return /مشاهدة\s*فيلم/.test(title) || /(?:^|\s)فيلم\b/.test(title);
}

function arabicLarozaSerieIdFromHtml(html) {
  html = String(html || '');
  var m =
    /view-serie1?\.php\?ser=([a-zA-Z0-9]+)/.exec(html) ||
    /[?&]ser=([a-zA-Z0-9]+)/.exec(html);
  return m ? m[1] : '';
}

function arabicOrigin(url) {
  try {
    var u = new URL(String(url || ''));
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

function arabicIsLarozaHost(host) {
  // Live hosts rotate spelling: larozaa.bond → laaroza.pics, larozza.yachts, …
  return /la+r+o+z+a/i.test(String(host || ''));
}

function arabicHtml(ctx, html) {
  if (!ctx || typeof ctx.html !== 'function') return null;
  try {
    return ctx.html(html);
  } catch (e) {
    return null;
  }
}

function arabicEnsureLaroza(ctx, cfg) {
  if (_arabicLarozaResolved && _arabicLarozaResolved.origin) {
    return Promise.resolve(_arabicLarozaResolved);
  }
  if (_arabicLarozaResolvePromise) return _arabicLarozaResolvePromise;

  var boots = [_arabicLarozaSticky, cfg.bootstrap]
    .concat(Array.isArray(cfg.mirrors) ? cfg.mirrors : [])
    .map(function (b) {
      return String(b || '').replace(/\/$/, '');
    })
    .filter(Boolean);
  var seen = {};
  var ordered = [];
  for (var i = 0; i < boots.length; i++) {
    if (seen[boots[i]]) continue;
    seen[boots[i]] = true;
    ordered.push(boots[i]);
  }

  function attempt(index) {
    if (index >= ordered.length) {
      var fallback = ordered[0] || 'https://laaroza.website';
      return Promise.resolve({ origin: fallback, splashHtml: '' });
    }
    var boot = ordered[index];
    // Hit `/` only — long mirror chains exceed engine maxRedirects (8).
    // Keep splash HTML so feed home scrape skips a second `/` fetch.
    return ctx
      .fetch(boot + '/', { headers: arabicHeaders(boot + '/') })
      .then(function (res) {
        var origin = arabicOrigin(res.url || boot);
        var host = '';
        try {
          host = new URL(origin).host;
        } catch (e) { }
        if (!(origin && arabicIsLarozaHost(host))) {
          return attempt(index + 1);
        }
        return res.text().then(function (html) {
          return { origin: origin, splashHtml: String(html || '') };
        });
      })
      .catch(function () {
        return attempt(index + 1);
      });
  }

  _arabicLarozaResolvePromise = attempt(0)
    .then(function (resolved) {
      _arabicLarozaResolved = resolved;
      _arabicLarozaSticky = resolved.origin;
      _arabicLarozaResolvePromise = null;
      return resolved;
    })
    .catch(function (e) {
      _arabicLarozaResolvePromise = null;
      throw e;
    });
  return _arabicLarozaResolvePromise;
}

function arabicResolveLaroza(ctx, cfg) {
  return arabicEnsureLaroza(ctx, cfg).then(function (r) {
    return r.origin;
  });
}

/** `<META HTTP-EQUIV="Refresh" CONTENT="0;URL=…">` — Larozaa's moved-page stub. */
function arabicMetaRefreshUrl(html, base) {
  html = String(html || '');
  if (html.length > 2048) return '';
  var m = /http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i.exec(
    html,
  );
  return m ? arabicAbs(base, m[1]) : '';
}

function arabicFetchHtml(ctx, url, referer, hops) {
  hops = hops || 0;
  return ctx
    .fetch(url, { headers: arabicHeaders(referer || arabicOrigin(url) + '/') })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.text().then(function (html) {
        var finalUrl = res.url || url;
        var next = hops < 2 ? arabicMetaRefreshUrl(html, arabicOrigin(finalUrl)) : '';
        if (next && next !== finalUrl) {
          return arabicFetchHtml(ctx, next, referer, hops + 1);
        }
        return { html: html, url: finalUrl };
      });
    });
}

function arabicImg($, el, base) {
  if (!el || !el.length) return '';
  var poster = el.attr('data-echo') || el.attr('data-src') || '';
  if (!poster || poster.indexOf('data:') === 0) poster = el.attr('src') || '';
  if (poster.indexOf('data:') === 0) poster = '';
  return arabicAbs(base, poster);
}

function arabicMeta(source, id, title, poster, opts) {
  opts = opts || {};
  title = String(title || '').trim();
  if (!title || !id) return null;
  var ids = {};
  ids[source] = String(id);
  if (opts.url) ids.url = String(opts.url);
  var open = {
    surface: 'arabic',
    id: String(id),
    source: String(source),
    extract: {
      resolveType: 'arabic',
      panelCategory: 'arabic',
      ctx: {
        videoId: String(id),
        source: String(source),
      },
    },
  };
  if (opts.url) open.url = String(opts.url);
  if (opts.isMovie) open.movie = true;
  var meta = {
    id: source + ':' + id,
    type: 'arabic',
    name: title,
    poster: String(poster || ''),
    ids: ids,
    open: open,
  };
  if (opts.isMovie) meta.badge = 'MOVIE';
  if (opts.description) meta.description = String(opts.description);
  return meta;
}

/** "مشاهدة فيلم X 2024 مترجم HD اون لاين" → "X 2024" (keeps مدبلج). */
function arabicCleanMovieTitle(title) {
  return String(title || '')
    .replace(/^مشاهدة\s+/, '')
    .replace(/^(فيلم|مسرحية)\s+/, '')
    .replace(
      /(\s+(كامل(ة)?|مترجم(ة)?|اون\s*لاين|أون\s*لاين|HD))+\s*$/i,
      '',
    )
    .trim();
}

/** "مسلسل X" / "انمي X" / "برنامج X" → "X". */
function arabicCleanShowTitle(title) {
  return String(title || '')
    .replace(/^(مسلسل|انمي|أنمي|برنامج)\s+/, '')
    .trim();
}

// Grids only — side boxes (`.series-links`, footer `.catfootr`) are anchors
// outside these list items.
var ARABIC_CARD_ITEMS = [
  'li[class*="col-xs-6"]',
  'ul[class*="pm-ul"] > li',
  'ul.lr-series-grid > li',
];

function arabicParseLarozaCards(ctx, html, base, isMovie) {
  var $ = arabicHtml(ctx, html);
  var out = [];
  var seen = {};
  if (!$) return arabicParseLarozaCardsRegex(html, base, isMovie);
  $(ARABIC_CARD_ITEMS.join(', ')).each(function () {
    var card = $(this);
    var a = card
      .find('a[href*="video.php"], a[href*="serie"], a[href*="ser="]')
      .first();
    if (!a.length) return;
    var href = a.attr('href') || '';
    var title = String(a.attr('title') || '').trim() ||
      String(card.find('h3').first().text() || a.text() || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!title) return;
    var poster = arabicImg($, card.find('img').first(), base);
    var ser = /(?:\?|&)ser=([^&]+)/.exec(href);
    var vid = /(?:\?|&)vid=([^&]+)/.exec(href);
    var id = '';
    var movie = !ser && (!!isMovie || arabicIsLarozaMovieTitle(title));
    if (ser) id = ser[1];
    else if (vid) id = movie ? vid[1] : 'ep:' + vid[1];
    if (!id || seen[id]) return;
    seen[id] = true;
    var meta = arabicMeta(
      'larozaa',
      id,
      movie ? arabicCleanMovieTitle(title) : ser ? arabicCleanShowTitle(title) : title,
      poster,
      {
        isMovie: movie && String(id).indexOf('ep:') !== 0,
        url: arabicAbs(base, href),
      },
    );
    if (meta) out.push(meta);
  });
  return out;
}

function arabicParseLarozaCardsRegex(html, base, isMovie) {
  var out = [];
  var seen = {};
  var re =
    /<li[^>]*>[\s\S]*?<a[^>]+href="([^"]*(?:video\.php|serie\.php|[?&]ser=)[^"]*)"[^>]*(?:title="([^"]*)")?[\s\S]*?<\/li>/gi;
  var m;
  while ((m = re.exec(html))) {
    var block = m[0] || '';
    var href = m[1] || '';
    var title = (m[2] || '').trim();
    if (!title) {
      var tm = /title="([^"]+)"/i.exec(block);
      if (tm) title = (tm[1] || '').trim();
    }
    var poster = '';
    var echo = /data-echo="(https?:\/\/[^"]+)"/i.exec(block);
    if (echo) poster = echo[1];
    if (!poster) {
      var src = /(?:data-src|src)="(https?:\/\/[^"]+)"/i.exec(block);
      if (src) poster = src[1];
    }
    poster = arabicAbs(base, poster);
    if (!title) continue;
    var ser = /(?:\?|&)ser=([^&]+)/.exec(href);
    var vid = /(?:\?|&)vid=([^&]+)/.exec(href);
    var id = '';
    var movie = !ser && (!!isMovie || arabicIsLarozaMovieTitle(title));
    if (ser) id = ser[1];
    else if (vid) id = movie ? vid[1] : 'ep:' + vid[1];
    if (!id || seen[id]) continue;
    seen[id] = true;
    var meta = arabicMeta(
      'larozaa',
      id,
      movie ? arabicCleanMovieTitle(title) : title,
      poster,
      {
        isMovie: movie && String(id).indexOf('ep:') !== 0,
        url: arabicAbs(base, href),
      },
    );
    if (meta) out.push(meta);
  }
  return out;
}

/** Episode cards → one card per show (earliest episode on the page). */
function arabicGroupLarozaSearch(items) {
  var episodeRe = /\s*الحلقة\s+\S+.*$/;
  var trailerRe = /\s*(HD|مترجم(ة)?|مدبلج(ة)?|اون لاين)\s*$/;
  function epNum(t) {
    var m = /الحلقة\s+(\d+)/.exec(t);
    return m ? Number(m[1]) : 9999;
  }
  function clean(t) {
    return String(t || '')
      .replace(episodeRe, '')
      .replace(trailerRe, '')
      .trim();
  }
  function norm(t) {
    return clean(t).toLowerCase().replace(/\s+/g, ' ').trim();
  }
  var repByKey = {};
  var repEp = {};
  var i;
  for (i = 0; i < items.length; i++) {
    var s = items[i];
    var t = s.name || '';
    if (t.indexOf('الحلقة') < 0) continue;
    var key = norm(t);
    if (!key) continue;
    var n = epNum(t);
    var rawId = String((s.ids && s.ids.larozaa) || '').replace(/^ep:/, '');
    if (!repByKey[key] || n < (repEp[key] || 9999)) {
      repByKey[key] = arabicMeta(
        'larozaa',
        'ep:' + rawId,
        arabicCleanShowTitle(clean(t)),
        s.poster,
        { url: s.ids && s.ids.url },
      );
      repEp[key] = n;
    }
  }
  var out = [];
  var seenShow = {};
  var seenOther = {};
  for (i = 0; i < items.length; i++) {
    s = items[i];
    t = s.name || '';
    if (t.indexOf('الحلقة') >= 0) {
      key = norm(t);
      if (!key || seenShow[key]) continue;
      seenShow[key] = true;
      if (repByKey[key]) out.push(repByKey[key]);
    } else {
      var mid = String((s.ids && s.ids.larozaa) || s.id);
      if (seenOther[mid]) continue;
      seenOther[mid] = true;
      out.push(s);
    }
  }
  return out;
}

/** One upstream page → { items, hasMore } (hasMore from the site pager). */
function arabicFetchList(ctx, cfg, path, page, parse) {
  return arabicResolveLaroza(ctx, cfg).then(function (base) {
    var url = base + arabicWithPage(path, page);
    return arabicFetchHtml(ctx, url, base + '/').then(function (got) {
      var origin = arabicOrigin(got.url) || base;
      return {
        items: parse(got.html, origin) || [],
        hasMore: arabicHtmlHasNextPage(got.html, page),
      };
    });
  });
}

/**
 * Card pages → rail page. `span` upstream pages back one rail page (a page
 * of 40 daily episodes collapses to a few shows); `group` folds episodes
 * into shows; `type` keeps only films or only series.
 */
function arabicCardList(ctx, cfg, path, page, opts) {
  opts = opts || {};
  var span = Number(opts.span) > 1 ? Number(opts.span) : 1;
  var jobs = [];
  for (var p = (page - 1) * span + 1; p <= page * span; p++) {
    jobs.push(
      arabicFetchList(ctx, cfg, path, p, function (html, origin) {
        return arabicParseLarozaCards(ctx, html, origin, !!opts.movie);
      }),
    );
  }
  return Promise.all(jobs).then(function (got) {
    var items = [];
    for (var i = 0; i < got.length; i++) items = items.concat(got[i].items);
    if (opts.group) items = arabicGroupLarozaSearch(items);
    if (opts.type === 'movie' || opts.type === 'series') {
      var wantMovie = opts.type === 'movie';
      items = items.filter(function (m) {
        return (m.badge === 'MOVIE') === wantMovie;
      });
    }
    return { items: items, hasMore: got[got.length - 1].hasMore };
  });
}

function arabicSectionPath(section, sortby) {
  return (
    '/category.php?cat=' +
    encodeURIComponent(section.cat) +
    (sortby ? '&sortby=' + sortby : '')
  );
}

/** One page of a section — films as-is, series grouped into shows. */
function arabicSectionList(ctx, cfg, section, page, sortby) {
  var movie = section.kind === 'movie';
  return arabicCardList(ctx, cfg, arabicSectionPath(section, sortby), page, {
    movie: movie,
    group: !movie,
    span: movie ? 1 : 3,
  });
}

/** Every show on the site, newest first. */
function arabicAllSeries(ctx, cfg, page) {
  return arabicCardList(ctx, cfg, '/moslslat4.php', page, {});
}

/** Newest Arabic and foreign films, interleaved. */
function arabicLatestMovies(ctx, cfg, page) {
  return Promise.all([
    arabicSectionList(ctx, cfg, arabicSectionForRail('movies'), page),
    arabicSectionList(ctx, cfg, arabicSectionForRail('foreign_movies'), page),
  ]).then(function (pages) {
    var a = pages[0].items;
    var b = pages[1].items;
    var mixed = [];
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if (i < a.length) mixed.push(a[i]);
      if (i < b.length) mixed.push(b[i]);
    }
    return { items: mixed, hasMore: pages[0].hasMore || pages[1].hasMore };
  });
}

/**
 * Rail id → one page. A chosen Category narrows the hub to that section:
 * other section rails come back empty (host hides them).
 */
function arabicRailList(ctx, cfg, rail, params) {
  var page = arabicPageOf(params);
  var chrome = arabicChromeOf(params);
  var none = Promise.resolve({ items: [], hasMore: false });

  if (rail === 'trending' || rail === 'latest') {
    if (chrome.section) {
      return arabicSectionList(
        ctx,
        cfg,
        chrome.section,
        page,
        rail === 'trending' ? 'views' : '',
      );
    }
    if (chrome.type === 'movie') return arabicLatestMovies(ctx, cfg, page);
    return arabicCardList(
      ctx,
      cfg,
      rail === 'trending' ? '/topvideos1.php' : '/newvideos1.php',
      page,
      { group: true, span: 2, type: chrome.type },
    );
  }
  if (rail === 'all_series') {
    if (chrome.section || chrome.type === 'movie') return none;
    return arabicAllSeries(ctx, cfg, page);
  }
  var section = arabicSectionForRail(rail);
  if (!section) return null;
  if (chrome.section && chrome.section.cat !== section.cat) return none;
  if (chrome.type && chrome.type !== section.kind) return none;
  return arabicSectionList(ctx, cfg, section, page);
}

function arabicRailItems(ctx, cfg, params) {
  var rail = String(params.rail || '');
  var load = arabicRailList(ctx, cfg, rail, params);
  if (!load) {
    return Promise.resolve(
      hubFail('rail', 'INVALID_PARAMS', 'unknown rail ' + rail),
    );
  }
  return load
    .then(function (page) {
      return hubItems(
        'rail',
        page.items,
        { maxAge: 600, swr: 3600 },
        { pageSize: arabicLimitOf(params, 24), hasMore: !!page.hasMore },
      );
    })
    .catch(function (e) {
      return hubFail('rail', 'UPSTREAM', e && e.message, true);
    });
}

/** First page of each feed rail — same lists `rail` pages through next. */
function arabicFeed(ctx, cfg, params) {
  var first = Object.assign({}, params, { page: 1 });
  return Promise.all(
    ARABIC_FEED_RAILS.map(function (rail) {
      return arabicRailList(ctx, cfg, rail, first).catch(function () {
        return { items: [] };
      });
    }),
  ).then(function (pages) {
    var rails = {};
    var any = false;
    for (var i = 0; i < ARABIC_FEED_RAILS.length; i++) {
      rails[ARABIC_FEED_RAILS[i]] = pages[i].items;
      if (pages[i].items.length) any = true;
    }
    if (!any) return hubFail('feed', 'UPSTREAM', 'no Larozaa rails loaded', true);
    return hubOk('feed', { rails: rails }, { maxAge: 600, swr: 3600 });
  });
}


function arabicParseShowRef(params) {
  var raw = String(params.id || '').trim();
  var source = String(params.source || '').trim() || 'larozaa';
  var rest = raw;
  var colon = raw.indexOf(':');
  if (colon > 0) {
    var head = raw.substring(0, colon);
    if (head === 'larozaa') {
      source = 'larozaa';
      rest = raw.substring(colon + 1);
    } else if (head === 'brstej' || head === 'dimatoon') {
      // Wrong hub — do not rewrite as Larozaa.
      source = head;
      rest = raw.substring(colon + 1);
    }
  }
  var fullId =
    source === 'larozaa' ? 'larozaa:' + rest : source + ':' + rest;
  var url = String(params.url || '').trim();
  var isMovie =
    params.movie === true ||
    params.movie === 'true' ||
    params.isMovie === true;
  return {
    raw: raw,
    fullId: fullId,
    source: source,
    rest: rest,
    url: url,
    isMovie: isMovie,
  };
}

function arabicEpThumb($, a, base) {
  var img = a.find('img').first();
  if (!img.length) {
    var parent = a.parent();
    if (parent && parent.length) img = parent.find('img').first();
  }
  return arabicImg($, img, base);
}

function arabicMergeEpByVid(byId, order, vid, title, poster) {
  var existing = byId[vid];
  if (!existing) {
    order.push(vid);
    byId[vid] = { title: title, poster: poster };
  } else {
    if (!existing.title && title) existing.title = title;
    if (!existing.poster && poster) existing.poster = poster;
  }
}

function arabicLarozaEpisodesFromAnchors($, anchors, base) {
  var byId = {};
  var order = [];
  anchors.each(function () {
    var a = $(this);
    var href = a.attr('href') || '';
    var m = /vid=([^&]+)/.exec(href);
    if (!m) return;
    var vid = m[1];
    var title = (a.text() || '').trim();
    var poster = arabicEpThumb($, a, base);
    arabicMergeEpByVid(byId, order, vid, title, poster);
  });
  var videos = [];
  var reversed = order.slice().reverse();
  for (var i = 0; i < reversed.length; i++) {
    var vid = reversed[i];
    var e = byId[vid];
    var epTitle = e.title;
    if (!epTitle) epTitle = 'الحلقة ' + (i + 1);
    videos.push({
      id: 'larozaa:' + vid,
      title: epTitle,
      season: 1,
      episode: i + 1,
      thumbnail: e.poster || '',
    });
  }
  return videos;
}

/** Show page meta: h1 title, og/`.ls-description` synopsis, og:image poster. */
function arabicShowHead($, base) {
  var title = String($('h1').first().text() || '').replace(/\s+/g, ' ').trim();
  if (!title) {
    title = String($('meta[property="og:title"]').attr('content') || '')
      .replace(/\s*-\s*فيديو لاروزا.*$/, '')
      .trim();
  }
  var description = String($('.ls-description').first().text() || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!description) {
    description = String(
      $('meta[property="og:description"]').attr('content') || '',
    ).trim();
  }
  var poster = arabicAbs(base, $('meta[property="og:image"]').attr('content') || '');
  return {
    title: arabicCleanShowTitle(title),
    description: description,
    poster: poster,
  };
}

/** Current show page: `section.ls-season-panel[data-season]` → `article.ls-card`. */
function arabicParseLsSeasons($, base, poster) {
  var videos = [];
  var seen = {};
  $('section.ls-season-panel').each(function (si) {
    var panel = $(this);
    var season = Number(panel.attr('data-season'));
    if (!(season >= 0)) season = si + 1;
    panel.find('article.ls-card').each(function (ei) {
      var card = $(this);
      var a = card.find('a[href*="video.php"]').first();
      var m = /vid=([^&"]+)/.exec(a.attr('href') || '');
      if (!m || seen[m[1]]) return;
      seen[m[1]] = true;
      var n = Number(card.attr('data-episode')) || ei + 1;
      videos.push({
        id: 'larozaa:' + m[1],
        title: 'الحلقة ' + n,
        season: season,
        episode: n,
        thumbnail: arabicImg($, card.find('img').first(), base) || poster || '',
      });
    });
  });
  return videos;
}

function arabicParseLarozaShowHtml(ctx, html, base, seasonOffset) {
  var $ls = arabicHtml(ctx, html);
  if ($ls && $ls('section.ls-season-panel').length) {
    var head = arabicShowHead($ls, base);
    return {
      title: head.title,
      poster: head.poster,
      description: head.description,
      videos: arabicParseLsSeasons($ls, base, head.poster),
    };
  }

  var $ = arabicHtml(ctx, html);
  var title = '';
  var poster = '';
  var description = '';
  var videos = [];
  seasonOffset = seasonOffset || 0;
  if (!$) {
    return { title: title, poster: poster, description: description, videos: videos };
  }

  var titleEl = $('h2').first();
  if (!titleEl.length) titleEl = $('h1').first();
  title = (titleEl.text() || '').trim();

  var posterImg = $('img[src*="uploads/thumbs"]').first();
  if (!posterImg.length) posterImg = $('img[data-echo*="uploads/thumbs"]').first();
  if (posterImg.length) {
    poster = arabicImg($, posterImg, base);
  }

  var descEl = $('.pm-video-content').first();
  if (!descEl.length) descEl = $('.description').first();
  if (!descEl.length) descEl = $('.story').first();
  description = (descEl.text() || '').trim();

  var seasonButtons = $('.SeasonsBoxUL button.tablinks');
  if (seasonButtons.length) {
    seasonButtons.each(function (si) {
      var seasonNum = seasonOffset + si + 1;
      var tabId = 'Season' + (si + 1);
      var seasonDiv = $('#' + tabId);
      if (!seasonDiv.length) return;
      var byId = {};
      var order = [];
      seasonDiv.find('a[href*="video.php"]').each(function () {
        var a = $(this);
        var href = a.attr('href') || '';
        var m = /vid=([^&]+)/.exec(href);
        if (!m) return;
        arabicMergeEpByVid(
          byId,
          order,
          m[1],
          (a.text() || '').trim(),
          arabicEpThumb($, a, base),
        );
      });
      var reversed = order.slice().reverse();
      for (var i = 0; i < reversed.length; i++) {
        var vid = reversed[i];
        var e = byId[vid];
        videos.push({
          id: 'larozaa:' + vid,
          title: e.title || 'الحلقة ' + (i + 1),
          season: seasonNum,
          episode: i + 1,
          thumbnail: e.poster || '',
        });
      }
    });
  } else {
    var flat = arabicLarozaEpisodesFromAnchors(
      $,
      $('a[href*="video.php"]'),
      base,
    );
    for (var j = 0; j < flat.length; j++) {
      flat[j].season = seasonOffset + 1;
      videos.push(flat[j]);
    }
  }

  return { title: title, poster: poster, description: description, videos: videos };
}

function arabicDetailsLarozaMovieFromPage(ctx, ref, got, vid, pageUrl) {
  var origin = arabicOrigin(got.url) || '';
  var $ = arabicHtml(ctx, got.html);
  var title = '';
  var poster = '';
  var description = '';
  if ($) {
    var titleEl = $('h1, h2').first();
    title = (titleEl.text() || '').replace(/\s+/g, ' ').trim();
    poster = arabicAbs(origin, $('meta[property="og:image"]').attr('content') || '');
    if (!poster) {
      var posterImg = $(
        'img[src*="uploads/thumbs"], img[data-echo*="uploads/thumbs"]',
      ).first();
      if (posterImg.length) poster = arabicImg($, posterImg, origin);
    }
    var descEl = $('.pm-video-description, .pm-video-content').first();
    description = (descEl.text() || '').replace(/\s+/g, ' ').trim() ||
      String($('meta[property="og:description"]').attr('content') || '').trim();
  }
  if (!title) {
    var tm = /<title[^>]*>([^<]+)/i.exec(got.html);
    if (tm) {
      title = String(tm[1] || '')
        .replace(/\s*[-|].*$/, '')
        .trim();
    }
  }
  title = arabicCleanMovieTitle(title);
  var id = String(vid || ref.rest || '').replace(/^ep:/, '');
  var meta = arabicMeta('larozaa', id, title || id, poster, {
    description: description,
    isMovie: true,
    url: ref.url || pageUrl,
  });
  if (!meta) {
    return hubFail('details', 'NOT_FOUND', 'arabic id ' + ref.fullId);
  }
  meta.id = 'larozaa:' + id;
  meta.description = description || '';
  meta.videos = [
    {
      id: 'larozaa:' + id,
      title: title || id,
      season: 1,
      episode: 1,
      thumbnail: poster || '',
    },
  ];
  return hubOk('details', { meta: meta }, { maxAge: 900, swr: 3600 });
}

function arabicDetailsLaroza(ctx, cfg, ref) {
  return arabicResolveLaroza(ctx, cfg).then(function (base) {
    var rest = ref.rest;
    if (ref.isMovie && rest && rest.indexOf('ep:') !== 0) {
      var movieUrl = base + '/video.php?vid=' + encodeURIComponent(rest);
      return arabicFetchHtml(ctx, movieUrl, base + '/').then(function (got) {
        return arabicDetailsLarozaMovieFromPage(ctx, ref, got, rest, movieUrl);
      });
    }

    if (rest.indexOf('ep:') === 0) {
      var epVid = rest.substring(3);
      var epUrl = base + '/video.php?vid=' + encodeURIComponent(epVid);
      return arabicFetchHtml(ctx, epUrl, base + '/').then(function (got) {
        var serId = arabicLarozaSerieIdFromHtml(got.html);
        if (!serId) {
          // Movies on newvideos use video.php but no serie link — open as movie.
          return arabicDetailsLarozaMovieFromPage(ctx, ref, got, epVid, epUrl);
        }
        var url =
          base + '/view-serie1.php?ser=' + encodeURIComponent(serId);
        return arabicFetchHtml(ctx, url, base + '/').then(function (show) {
          var origin = arabicOrigin(show.url) || base;
          var parsed = arabicParseLarozaShowHtml(ctx, show.html, origin, 0);
          var name = parsed.title || rest || ref.fullId;
          var meta = arabicMeta('larozaa', serId, name, parsed.poster || '', {
            description: parsed.description,
            isMovie: false,
            url: ref.url,
          });
          if (!meta) {
            return hubFail('details', 'NOT_FOUND', 'arabic id ' + ref.fullId);
          }
          // Stable show id once resolved (not the episode stub).
          meta.id = 'larozaa:' + serId;
          meta.description = parsed.description || '';
          meta.videos = parsed.videos || [];
          return hubOk('details', { meta: meta }, { maxAge: 900, swr: 3600 });
        });
      });
    }

    var url = base + '/view-serie1.php?ser=' + encodeURIComponent(rest);
    return arabicFetchHtml(ctx, url, base + '/').then(function (got) {
      var origin = arabicOrigin(got.url) || base;
      var parsed = arabicParseLarozaShowHtml(ctx, got.html, origin, 0);
      if (!parsed.videos.length) {
        // A film id opened without `movie` (Continue Watching, deep link).
        var filmUrl = base + '/video.php?vid=' + encodeURIComponent(rest);
        return arabicFetchHtml(ctx, filmUrl, base + '/').then(function (film) {
          return arabicDetailsLarozaMovieFromPage(ctx, ref, film, rest, filmUrl);
        });
      }
      var name = parsed.title || rest || ref.fullId;
      var meta = arabicMeta('larozaa', rest, name, parsed.poster || '', {
        description: parsed.description,
        isMovie: false,
        url: ref.url,
      });
      if (!meta) {
        return hubFail('details', 'NOT_FOUND', 'arabic id ' + ref.fullId);
      }
      meta.id = ref.fullId;
      meta.description = parsed.description || '';
      meta.videos = parsed.videos || [];
      return hubOk('details', { meta: meta }, { maxAge: 900, swr: 3600 });
    });
  });
}

function arabicDetails(ctx, cfg, params) {
  var ref = arabicParseShowRef(params);
  if (!ref.rest && !ref.raw) {
    return Promise.resolve(
      hubFail('details', 'INVALID_PARAMS', 'details needs params.id'),
    );
  }
  if (ref.source && ref.source !== 'larozaa') {
    return Promise.resolve(
      hubFail(
        'details',
        'INVALID_PARAMS',
        'arabic hub is Larozaa-only (got ' + ref.source + ')',
      ),
    );
  }
  return arabicDetailsLaroza(ctx, cfg, ref).catch(function (e) {
    return hubFail('details', 'UPSTREAM', e && e.message, true);
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var cfg = hubConfig(ctx, ARABIC_DEFAULTS);
  var params = hubParams(ctx);

  if (action === 'layout') {
    return hubOk('layout', arabicLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'filters') {
    return hubOk('filters', arabicFilters(), { maxAge: 86400 });
  }
  if (action === 'feed') {
    return arabicFeed(ctx, cfg, params).catch(function (e) {
      return hubFail('feed', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'details') {
    return arabicDetails(ctx, cfg, params);
  }
  if (action === 'search') {
    return arabicSearch(ctx, cfg, params).catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'rail') {
    return arabicRailItems(ctx, cfg, params);
  }
  return hubFail(action, 'INVALID_ACTION', 'arabic hub has no action ' + action);
}
