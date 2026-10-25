// Brstej hub — browse / search / details (protocol 1).
// Aflem hub — scrape Brstej (brstej.com → live host). Playback: provider `brstej`.
// Host surface: arabic.

var BRSTEJ_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Vanity entry — EngineJS follows redirects; first success pins the live host.
var BRSTEJ_DEFAULTS = {
  origin: 'https://brstej.com',
};

/** Final origin after redirect (e.g. brsteej.beer). Skips hops on later calls. */
var brstejLiveOrigin = '';

var BRSTEJ_FEED_RAILS = ['spotlight', 'latest', 'top'];

/** Upstream page cap per rail — Brstej lists run to hundreds of pages. */
var BRSTEJ_RAIL_MAX_PAGES = 200;

function brstejCatFilter(value) {
  return { op: 'eq', field: 'cat', value: String(value) };
}

function brstejCategory(id, label, cat, kind) {
  return {
    id: id,
    label: label,
    cat: cat,
    kind: kind,
    filter: brstejCatFilter(cat),
  };
}

/**
 * Every Brstej section, in hub order. Each one is a filter option and a rail.
 * Series sections page through `cat03.php?type=series`; movie sections page
 * through the category movie grid.
 */
var BRSTEJ_CATEGORY_OPTIONS = [
  brstejCategory('ramadan', 'رمضان 2026', 'ramdan2026', 'series'),
  brstejCategory('turkish', 'مسلسلات تركية', 'ty9-2025', 'series'),
  brstejCategory('movies_ar', 'أفلام عربية', 'aflam02-2024', 'movie'),
  brstejCategory('egyptian', 'مسلسلات مصرية', 'eg8-2025', 'series'),
  brstejCategory('shami', 'مسلسلات شامية', 'syy5-2025', 'series'),
  brstejCategory('movies_foreign', 'أفلام أجنبية', 'aflamajnby3-2024', 'movie'),
  brstejCategory('gulf', 'مسلسلات خليجية', '5a7-2024', 'series'),
  brstejCategory('arabic', 'مسلسلات عربية', 'arab8-2025', 'series'),
  brstejCategory('prestige', 'مسلسلات برستيج', 'prss7-2025', 'series'),
  brstejCategory('movies_tr', 'أفلام تركية', 'turkish3-movies2024', 'movie'),
  brstejCategory('foreign', 'مسلسلات أجنبية', 'english1-2025', 'series'),
  brstejCategory('asian', 'مسلسلات آسيوية', 'asia', 'series'),
  brstejCategory('indian', 'مسلسلات هندية', '2ind2-2025', 'series'),
  brstejCategory('movies_in', 'أفلام هندية', 'hindi1-moviess', 'movie'),
  brstejCategory('anime', 'مسلسلات أنمي', 'anmei', 'series'),
  brstejCategory('movies_anime', 'أفلام أنمي', 'anime1', 'movie'),
  brstejCategory('tv', 'برامج تلفزيونية', 'tv4-2024', 'series'),
  brstejCategory('ramadan_2025', 'رمضان 2025', 'ramadan2-2025', 'series'),
  brstejCategory('ramadan_2024', 'رمضان 2024', 'ramdan1-2024', 'series'),
  brstejCategory('ramadan_2023', 'رمضان 2023', 'ramda1-2023', 'series'),
  brstejCategory('ramadan_2022', 'رمضان 2022', 'rm42-2022', 'series'),
  brstejCategory('series_2021', 'مسلسلات 2021', 'rmdan31-2021', 'series'),
];

function brstejFilters() {
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
      {
        field: 'cat',
        label: 'Category',
        // Series sections first, then films (rails interleave them).
        options: BRSTEJ_CATEGORY_OPTIONS.filter(function (o) {
          return o.kind === 'series';
        })
          .concat(
            BRSTEJ_CATEGORY_OPTIONS.filter(function (o) {
              return o.kind === 'movie';
            }),
          )
          .map(function (o) {
            return { id: o.id, label: o.label, filter: o.filter };
          }),
      },
    ],
  };
}

function brstejOptionForCat(cat) {
  for (var i = 0; i < BRSTEJ_CATEGORY_OPTIONS.length; i++) {
    if (BRSTEJ_CATEGORY_OPTIONS[i].cat === String(cat)) {
      return BRSTEJ_CATEGORY_OPTIONS[i];
    }
  }
  return null;
}

function brstejOptionForRail(rail) {
  for (var i = 0; i < BRSTEJ_CATEGORY_OPTIONS.length; i++) {
    if (BRSTEJ_CATEGORY_OPTIONS[i].id === String(rail)) {
      return BRSTEJ_CATEGORY_OPTIONS[i];
    }
  }
  return null;
}

/** Chrome filter → { cat option or ad-hoc cat, type: movie|series|'' }. */
function brstejChromeOf(params) {
  var filter = params && params.filter;
  var cat = hubFilterValue(filter, 'cat');
  // `kind` — menu field before `type` (layout showWhenType reads `type`).
  var type = String(
    hubFilterValue(filter, 'type') || hubFilterValue(filter, 'kind') || '',
  ).toLowerCase();
  if (type === 'tv') type = 'series';
  var opt = null;
  if (cat) {
    opt = brstejOptionForCat(cat) ||
      brstejCategory(String(cat), String(cat), String(cat), 'series');
  }
  return { opt: opt, type: type };
}

function brstejBase(cfg) {
  if (brstejLiveOrigin) return brstejLiveOrigin;
  return String(cfg.origin || cfg.brstej || BRSTEJ_DEFAULTS.origin).replace(
    /\/$/,
    '',
  );
}

function brstejRememberOrigin(url) {
  var o = brstejOrigin(url);
  if (o) brstejLiveOrigin = o;
}

function brstejHeaders(referer) {
  var h = {
    'User-Agent': BRSTEJ_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  return h;
}

function brstejAbs(base, url) {
  url = String(url || '').trim();
  if (!url || url.indexOf('data:') === 0) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf('//') === 0) return 'https:' + url;
  base = String(base || '').replace(/\/$/, '');
  if (url.charAt(0) === '/') return base + url;
  return base + '/' + url;
}

function brstejOrigin(url) {
  try {
    var u = new URL(String(url || ''));
    return u.protocol + '//' + u.host;
  } catch (e) {
    return '';
  }
}

function brstejHtml(ctx, raw) {
  if (!ctx || typeof ctx.html !== 'function') return null;
  try {
    return ctx.html(raw);
  } catch (e) {
    return null;
  }
}

function brstejFetchHtml(ctx, url, referer) {
  return ctx
    .fetch(url, { headers: brstejHeaders(referer || brstejOrigin(url) + '/') })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      var finalUrl = res.url || url;
      brstejRememberOrigin(finalUrl);
      return res.text().then(function (html) {
        return { html: html, url: finalUrl };
      });
    });
}

function brstejImg($, el, base) {
  if (!el || !el.length) return '';
  var poster = el.attr('data-echo') || el.attr('data-src') || '';
  if (!poster || poster.indexOf('data:') === 0) poster = el.attr('src') || '';
  if (poster.indexOf('data:') === 0) poster = '';
  return brstejAbs(base, poster);
}

/** Prefer og/articles (early in page) over related-thumbs blocks. */
function brstejPickPoster($, base) {
  var og = $('meta[property="og:image"]').first();
  if (og.length) {
    var ogUrl = (og.attr('content') || '').trim();
    if (ogUrl) return brstejAbs(base, ogUrl);
  }
  var thumbMeta = $('meta[itemprop="thumbnailUrl"]').first();
  if (thumbMeta.length) {
    var thumb = (thumbMeta.attr('content') || '').trim();
    if (thumb) return brstejAbs(base, thumb);
  }
  var selectors = [
    'img[data-echo*="uploads/articles"]',
    'img[src*="uploads/articles"]',
    'img[data-echo*="uploads/thumbs"]',
    'img[src*="uploads/thumbs"]',
    'img[data-src*="uploads/articles"]',
    'img[data-src*="uploads/thumbs"]',
  ];
  for (var i = 0; i < selectors.length; i++) {
    var img = $(selectors[i]).first();
    if (!img.length) continue;
    var url = brstejImg($, img, base);
    if (url) return url;
  }
  return '';
}

function brstejCleanText(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Category chips that are site chrome, not genres. */
var BRSTEJ_GENRE_SKIP = {
  'حلقات التجهيز': true,
  'افلام': true,
  'الأقسام': true,
};

function brstejPickStoryParagraph($) {
  var panel = $('.pwr-panel.pwr-description').first();
  if (!panel.length) return '';
  var story = '';
  panel.find('h2, h3, .pwr-heading, .pwr-title').each(function () {
    if (story) return;
    var head = brstejCleanText($(this).text());
    if (head.indexOf('قصة') < 0) return;
    var p = $(this).nextAll('p').first();
    var text = brstejCleanText(p.text());
    if (text.length > 40) story = text;
  });
  if (story) return story;

  var first = brstejCleanText(panel.find('p').first().text());
  if (!first) return '';
  // Film SEO blurb embeds the plot after "حول :".
  var m =
    /(?:تدور\s*)?قصة\s*(?:المسلسل|الفيلم)\s*حول\s*:\s*(.+)$/i.exec(first) ||
    /قصة\s*(?:المسلسل|الفيلم)\s*:\s*(.+)$/i.exec(first);
  if (m) {
    var plot = brstejCleanText(m[1])
      .replace(/\s*(?:فيلم|مسلسلات?)\s+.+\s+على\s+فيديو\s+برستيج\s*$/i, '')
      .trim();
    if (plot.length > 40) return plot;
  }
  if (first.length > 80) return first;
  return '';
}

function brstejPickDescription($) {
  var story = brstejPickStoryParagraph($);
  if (story) return story;

  var pds = $('p.pds-description, .pds-description').first();
  if (pds.length) {
    var pdsText = brstejCleanText(pds.text());
    if (pdsText.length > 40) return pdsText;
  }

  var sels = [
    '.pwr-panel.pwr-description p',
    '.pm-video-description',
    '.description',
    '.story',
    '.txtv',
  ];
  for (var j = 0; j < sels.length; j++) {
    var el = $(sels[j]).first();
    if (!el.length) continue;
    var text = brstejCleanText(el.text());
    if (text.length > 40) return text;
  }

  var metas = [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[itemprop="description"]',
  ];
  for (var i = 0; i < metas.length; i++) {
    var m = $(metas[i]).first();
    if (!m.length) continue;
    var c = brstejCleanText(m.attr('content') || '');
    if (c) return c;
  }
  return '';
}

function brstejPickEpisodeOverview($) {
  var panel = $('.pwr-panel.pwr-description').first();
  if (!panel.length) return '';
  var overview = '';
  panel.find('h2, h3, .pwr-heading, .pwr-title').each(function () {
    if (overview) return;
    var head = brstejCleanText($(this).text());
    if (head.indexOf('وصف') < 0) return;
    var p = $(this).nextAll('p').first();
    var text = brstejCleanText(p.text());
    if (text.length > 40) overview = text;
  });
  return overview;
}

function brstejPickGenres($) {
  var out = [];
  var seen = {};
  $('dl.pwr-meta').each(function () {
    var dl = $(this);
    dl.find('dt').each(function () {
      var label = brstejCleanText($(this).text());
      if (label.indexOf('الأقسام') < 0 && label.indexOf('اقسام') < 0) return;
      var dd = $(this).next('dd');
      if (!dd.length) return;
      dd.find('a').each(function () {
        var g = brstejCleanText($(this).text());
        if (!g || BRSTEJ_GENRE_SKIP[g] || seen[g]) return;
        seen[g] = true;
        out.push(g);
      });
    });
  });
  return out;
}

function brstejPickRuntime(rawHtml) {
  var m = /duration_str\s*:\s*"([^"]+)"/.exec(String(rawHtml || ''));
  return m ? String(m[1] || '').trim() : '';
}

function brstejFormatRuntime(str) {
  var parts = String(str || '')
    .split(':')
    .map(function (p) {
      return Number(p);
    });
  if (parts.length === 3 && !isNaN(parts[0])) {
    var h = parts[0];
    var m = parts[1] || 0;
    if (h > 0) return h + 'h' + (m ? ' ' + m + 'm' : '');
    return m + 'm';
  }
  if (parts.length === 2 && !isNaN(parts[0])) {
    var mins = parts[0];
    var secs = parts[1] || 0;
    if (mins >= 60) {
      return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    }
    if (mins > 0) return mins + 'm';
    if (secs > 0) return secs + 's';
  }
  return '';
}

function brstejPickYear() {
  var texts = [];
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i]) texts.push(String(arguments[i]));
  }
  var blob = texts.join(' ');
  var years = blob.match(/20[1-3]\d/g);
  return years && years.length ? years[years.length - 1] : '';
}

function brstejReleaseInfo(year, runtimeStr) {
  var bits = [];
  if (year) bits.push(String(year));
  var rt = brstejFormatRuntime(runtimeStr);
  if (rt) bits.push(rt);
  return bits.join(' • ');
}

function brstejPickDlValue($, labels) {
  var want = {};
  for (var i = 0; i < labels.length; i++) want[labels[i]] = true;
  var found = '';
  $('dl.pwr-meta dt').each(function () {
    if (found) return;
    var label = brstejCleanText($(this).text());
    if (!want[label]) return;
    var dd = $(this).next('dd');
    found = brstejCleanText(dd.text());
  });
  return found;
}

function brstejApplyPageInfo(out, $, rawHtml) {
  out.description = brstejPickDescription($);
  out.genres = brstejPickGenres($);
  out.runtime = brstejPickRuntime(rawHtml);
  out.year = brstejPickYear(
    out.title,
    (out.genres || []).join(' '),
    $('h1').first().text(),
  );
  out.releaseInfo = brstejReleaseInfo(out.year, out.runtime);
  out.episodeOverview = brstejPickEpisodeOverview($);
  var epNo = brstejPickDlValue($, ['رقم الحلقة']);
  var seasonNo = brstejPickDlValue($, ['الموسم']);
  if (epNo) out.episode = Number(epNo) || null;
  if (seasonNo) out.pageSeason = Number(seasonNo) || null;
  var seriesName = brstejPickDlValue($, ['المسلسل']);
  if (seriesName) out.seriesName = seriesName;
}

function brstejFillVideoThumbs(videos, poster) {
  poster = String(poster || '').trim();
  if (!poster || !videos || !videos.length) return;
  for (var i = 0; i < videos.length; i++) {
    if (!videos[i].thumbnail) videos[i].thumbnail = poster;
  }
}

function brstejMeta(id, title, poster, opts) {
  opts = opts || {};
  title = String(title || '').trim();
  if (!title || !id) return null;
  var open = {
    surface: 'arabic',
    id: String(id),
    source: 'brstej',
    extract: {
      resolveType: 'arabic',
      panelCategory: 'arabic',
      ctx: {
        videoId: String(id),
        source: 'brstej',
      },
    },
  };
  if (opts.url) open.url = String(opts.url);
  var meta = {
    id: 'brstej:' + id,
    type: 'arabic',
    name: title,
    poster: String(poster || ''),
    ids: { brstej: String(id) },
    open: open,
  };
  if (opts.url) meta.ids.url = String(opts.url);
  if (opts.description) meta.description = String(opts.description);
  return meta;
}

function brstejStripPrefix(title) {
  return String(title || '')
    .replace(/^مسلسل\s+/, '')
    .trim();
}

function brstejStripEpisode(title) {
  var t = String(title || '').replace(/\s*الحلقة\s+.*$/, '');
  t = t.replace(/\s*(HD|مترجم(ة)?|مدبلج(ة)?)\s*$/, '');
  return t.trim();
}

function brstejNormTitle(title) {
  return brstejStripPrefix(brstejStripEpisode(title))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function brstejSerieHrefId(href) {
  // Site switched numeric ids → hex (e.g. series1.php?id=eb59ad819).
  var m = /(?:view-serie|series1)\.php\?id=([A-Za-z0-9_-]+)/.exec(
    String(href || ''),
  );
  return m ? m[1] : '';
}

/** Episode / film page ids — watch.php redirects to video.php on the new host. */
function brstejWatchVid(href) {
  var m = /(?:watch|video)\.php\?vid=([^&"'\s]+)/i.exec(String(href || ''));
  return m ? m[1] : '';
}

function brstejEpisodeHrefSel(prefix) {
  prefix = prefix || '';
  return (
    prefix +
    'a[href*="video.php"], ' +
    prefix +
    'a[href*="watch.php"]'
  );
}

/** Pager links appear as `?page=N`, `&page=N`, or HTML-escaped `&amp;page=N`. */
function brstejHtmlHasNextPage(html, page) {
  var next = (Number(page) || 1) + 1;
  return new RegExp('(?:[?&]|&amp;)page=' + next + '([^0-9]|$)').test(
    String(html || ''),
  );
}

function brstejText(el) {
  return el && el.length
    ? String(el.text() || '').replace(/\s+/g, ' ').trim()
    : '';
}

// Series grids only — every page also carries a fixed footer of series links
// and site-wide pinned blocks, so never match bare `series1.php` anchors.
var BRSTEJ_SERIE_CARDS = [
  'article.psd-card',
  'ul.pcg-all-series-grid li',
];

function brstejParseSerieCards(ctx, html, base) {
  var $ = brstejHtml(ctx, html);
  var out = [];
  var seen = {};
  if (!$) return out;
  $(BRSTEJ_SERIE_CARDS.join(', ')).each(function () {
    var card = $(this);
    var a = card.find('h3 a[href*="series1.php"]').first();
    if (!a.length) a = card.find('a[href*="series1.php"]').first();
    if (!a.length) return;
    var href = a.attr('href') || '';
    var id = brstejSerieHrefId(href);
    if (!id || seen[id]) return;
    var title =
      String(a.attr('title') || '').trim() ||
      brstejText(card.find('h3').first()) ||
      brstejText(a);
    title = brstejStripPrefix(title);
    if (!title) return;
    seen[id] = true;
    var meta = brstejMeta(
      'serie:' + id,
      title,
      brstejImg($, card.find('img').first(), base),
      { url: brstejAbs(base, href) },
    );
    if (meta) out.push(meta);
  });
  return out;
}

// Paginated episode / movie grids per page template. Skips pinned
// "featured", "discover" and "popular" side blocks that repeat on every page.
var BRSTEJ_EPISODE_CARDS = [
  'ul.pcg-episodes-grid li',
  '.pln-grid article.pln-card',
  'ul.prs-grid article.prs-card',
  '.pmc-results-grid article.pmc-card',
  'li[class*="col-xs-6"]',
];

function brstejParseEpisodeCards(ctx, html, base) {
  var $ = brstejHtml(ctx, html);
  var out = [];
  var seen = {};
  if (!$) return out;
  $(BRSTEJ_EPISODE_CARDS.join(', ')).each(function () {
    var card = $(this);
    var a = card.find('h3 a[href*="video.php"], h3 a[href*="watch.php"]').first();
    if (!a.length) {
      a = card.find('a[href*="video.php"][title], a[href*="watch.php"][title]').first();
    }
    if (!a.length) {
      a = card.find('a[href*="video.php"], a[href*="watch.php"]').first();
    }
    if (!a.length) return;
    var href = a.attr('href') || '';
    var vid = brstejWatchVid(href);
    if (!vid || seen[vid]) return;
    var title =
      brstejText(a) ||
      String(a.attr('title') || '').trim() ||
      String(card.find('a[aria-label]').first().attr('aria-label') || '').trim();
    if (!title) return;
    seen[vid] = true;
    var meta = brstejMeta(
      'watch:' + vid,
      title,
      brstejImg($, card.find('img').first(), base),
      { url: brstejAbs(base, href) },
    );
    if (meta) out.push(meta);
  });
  return out;
}

function brstejPageOf(params) {
  return Number(params && params.page) > 0 ? Number(params.page) : 1;
}

function brstejLimitOf(params, fallback) {
  var n = Number(params && params.limit);
  if (n > 0) return n;
  n = Number(fallback);
  return n > 0 ? n : 24;
}

function brstejWithPage(path, page) {
  page = Number(page) > 0 ? Number(page) : 1;
  path = String(path || '');
  if (/[?&]page=\d+/i.test(path)) {
    return path.replace(/([?&]page=)\d+/i, '$1' + page);
  }
  if (path.indexOf('?') >= 0) return path + '&page=' + page;
  return path + '?page=' + page;
}

function brstejIsMovieTitle(title) {
  title = String(title || '');
  if (title.indexOf('الحلقة') >= 0) return false;
  return /مشاهدة\s*فيلم/.test(title) || /(?:^|\s)فيلم\b/.test(title);
}

function brstejStripMoviePrefix(title) {
  return String(title || '')
    .replace(/^مشاهدة\s*فيلم\s+/i, '')
    .replace(/^فيلم\s+/i, '')
    .replace(/\s*(اون\s*لاين|كامل|HD).*$/i, '')
    .trim();
}

/** Episode cards → one card per show on this page; movies stay one card each. */
function brstejGroupCategoryCards(episodes, asMovies) {
  var byKey = {};
  var order = [];
  for (var i = 0; i < (episodes || []).length; i++) {
    var ep = episodes[i];
    if (!ep || !ep.name) continue;
    var movie = asMovies || brstejIsMovieTitle(ep.name);
    if (movie) {
      var mid = (ep.ids && ep.ids.brstej) || '';
      if (!mid || byKey[mid]) continue;
      order.push(mid);
      byKey[mid] = brstejMeta(
        mid.indexOf('watch:') === 0 ? mid : 'watch:' + mid,
        brstejStripMoviePrefix(ep.name),
        ep.poster,
        { url: ep.ids && ep.ids.url },
      );
      if (byKey[mid]) byKey[mid].badge = 'MOVIE';
      continue;
    }
    var key = brstejNormTitle(ep.name);
    if (!key) continue;
    if (!byKey[key]) {
      order.push(key);
      byKey[key] = brstejMeta(
        ep.ids.brstej,
        brstejStripPrefix(brstejStripEpisode(ep.name)),
        ep.poster,
        { url: ep.ids.url },
      );
    }
  }
  var out = [];
  for (var j = 0; j < order.length; j++) {
    if (byKey[order[j]]) out.push(byKey[order[j]]);
  }
  return out;
}

/** One upstream page → { items, hasMore } (hasMore from the site pager). */
function brstejFetchList(ctx, cfg, path, page, parse) {
  var base = brstejBase(cfg);
  var url = base + brstejWithPage(path, page);
  return brstejFetchHtml(ctx, url, base + '/').then(function (got) {
    var origin = brstejOrigin(got.url) || base;
    return {
      items: parse(got.html, origin) || [],
      hasMore: brstejHtmlHasNextPage(got.html, page),
    };
  });
}

/** Every show on the site, newest first (`moslslat.php` — site typo). */
function brstejAllSeries(ctx, cfg, page) {
  return brstejFetchList(ctx, cfg, '/moslslat.php', page, function (html, origin) {
    return brstejParseSerieCards(ctx, html, origin);
  });
}

/**
 * Episode-grid pages grouped into shows; `type` keeps only movies or series.
 * `span` upstream pages back one rail page — a page of daily episodes
 * collapses to a handful of shows.
 */
function brstejEpisodeList(ctx, cfg, path, page, opts) {
  opts = opts || {};
  var span = Number(opts.span) > 1 ? Number(opts.span) : 1;
  var pages = [];
  for (var p = (page - 1) * span + 1; p <= page * span; p++) {
    pages.push(
      brstejFetchList(ctx, cfg, path, p, function (html, origin) {
        return brstejParseEpisodeCards(ctx, html, origin);
      }),
    );
  }
  return Promise.all(pages).then(function (got) {
    var episodes = [];
    for (var i = 0; i < got.length; i++) episodes = episodes.concat(got[i].items);
    var grouped = brstejGroupCategoryCards(episodes, !!opts.asMovies);
    if (opts.type === 'movie' || opts.type === 'series') {
      var wantMovie = opts.type === 'movie';
      grouped = grouped.filter(function (m) {
        return (m.badge === 'MOVIE') === wantMovie;
      });
    }
    return { items: grouped, hasMore: got[got.length - 1].hasMore };
  });
}

function brstejCategoryPath(opt) {
  return '/cat03.php?cat=' + encodeURIComponent(opt.cat);
}

/** Concat without repeats — same id, or same show title from another page type. */
function brstejConcatUnique(a, b) {
  var seen = {};
  var out = [];
  var all = (a || []).concat(b || []);
  for (var i = 0; i < all.length; i++) {
    var m = all[i];
    if (!m || !m.id) continue;
    var title = 'title:' + brstejNormTitle(m.name);
    if (seen[m.id] || seen[title]) continue;
    seen[m.id] = true;
    seen[title] = true;
    out.push(m);
  }
  return out;
}

/**
 * One page of a section. Series sections page the section's show index.
 * A one-page index (older and smaller sections) misses shows, so those
 * continue into the section's episode grid.
 */
function brstejCategoryList(ctx, cfg, opt, page) {
  var path = brstejCategoryPath(opt);
  if (opt.kind === 'movie') {
    return brstejEpisodeList(ctx, cfg, path, page, { asMovies: true });
  }
  return brstejFetchList(
    ctx,
    cfg,
    path + '&type=series',
    page,
    function (html, origin) {
      return brstejParseSerieCards(ctx, html, origin);
    },
  ).then(function (got) {
    var thin = page === 1 ? !got.hasMore : got.items.length === 0;
    if (!thin) return got;
    return brstejEpisodeList(ctx, cfg, path, page).then(function (eps) {
      return {
        items: page === 1 ? brstejConcatUnique(got.items, eps.items) : eps.items,
        hasMore: eps.hasMore,
      };
    });
  });
}

/** Newest Arabic and foreign films, interleaved. */
function brstejLatestMovies(ctx, cfg, page) {
  var ids = ['movies_ar', 'movies_foreign'];
  return Promise.all(
    ids.map(function (id) {
      return brstejCategoryList(ctx, cfg, brstejOptionForRail(id), page);
    }),
  ).then(function (pages) {
    var a = pages[0].items;
    var b = pages[1].items;
    var mixed = [];
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if (i < a.length) mixed.push(a[i]);
      if (i < b.length) mixed.push(b[i]);
    }
    return {
      items: brstejConcatUnique(mixed, []),
      hasMore: pages[0].hasMore || pages[1].hasMore,
    };
  });
}

/**
 * Rail id → one page. A chosen Category narrows the hub to that section:
 * other section rails come back empty (host hides them).
 */
function brstejRailList(ctx, cfg, rail, params) {
  var page = brstejPageOf(params);
  var chrome = brstejChromeOf(params);
  var none = Promise.resolve({ items: [], hasMore: false });
  // `series` — ranked rail id in layouts cached before `top`.
  if (rail === 'series') rail = 'top';

  if (rail === 'spotlight' || rail === 'latest') {
    if (chrome.opt) {
      return rail === 'latest' && chrome.opt.kind === 'series'
        ? brstejEpisodeList(ctx, cfg, brstejCategoryPath(chrome.opt), page, {
          span: 2,
        })
        : brstejCategoryList(ctx, cfg, chrome.opt, page);
    }
    if (chrome.type === 'movie') return brstejLatestMovies(ctx, cfg, page);
    if (rail === 'spotlight') return brstejAllSeries(ctx, cfg, page);
    return brstejEpisodeList(ctx, cfg, '/new-videos.php', page, {
      type: chrome.type,
      span: 2,
    });
  }
  if (rail === 'top') {
    // Most-viewed is episode traffic — films barely register there.
    if (chrome.opt || chrome.type === 'movie') return none;
    return brstejEpisodeList(ctx, cfg, '/topvideos.php', page, {
      type: chrome.type,
      span: 3,
    });
  }
  if (rail === 'all_series') {
    if (chrome.opt || chrome.type === 'movie') return none;
    return brstejAllSeries(ctx, cfg, page);
  }
  var opt = brstejOptionForRail(rail);
  if (!opt) return null;
  if (chrome.opt && chrome.opt.cat !== opt.cat) return none;
  if (chrome.type && chrome.type !== opt.kind) return none;
  return brstejCategoryList(ctx, cfg, opt, page);
}

function brstejRailItems(ctx, cfg, params) {
  var rail = String(params.rail || '');
  var load = brstejRailList(ctx, cfg, rail, params);
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
        {
          pageSize: brstejLimitOf(params, 24),
          hasMore: !!page.hasMore,
        },
      );
    })
    .catch(function (e) {
      return hubFail('rail', 'UPSTREAM', e && e.message, true);
    });
}

function brstejFeed(ctx, cfg, params) {
  var limit = brstejLimitOf(params, 24);
  var first = Object.assign({}, params, { page: 1 });
  return Promise.all(
    BRSTEJ_FEED_RAILS.map(function (rail) {
      return brstejRailList(ctx, cfg, rail, first);
    }),
  )
    .then(function (pages) {
      var rails = {};
      for (var i = 0; i < BRSTEJ_FEED_RAILS.length; i++) {
        rails[BRSTEJ_FEED_RAILS[i]] = hubClampList(pages[i].items, limit);
      }
      return hubOk('feed', { rails: rails }, { maxAge: 600, swr: 3600 });
    })
    .catch(function (e) {
      return hubFail('feed', 'UPSTREAM', e && e.message, true);
    });
}

function brstejEpThumb($, a, base) {
  var img = a.find('img').first();
  if (!img.length) {
    var parent = a.parent();
    if (parent && parent.length) img = parent.find('img').first();
  }
  return brstejImg($, img, base);
}

function brstejMergeEpByVid(byId, order, vid, title, poster) {
  var existing = byId[vid];
  if (!existing) {
    order.push(vid);
    byId[vid] = { title: title, poster: poster };
  } else {
    if (!existing.title && title) existing.title = title;
    if (!existing.poster && poster) existing.poster = poster;
  }
}

function brstejEpisodeNumber(title) {
  var t = String(title || '');
  var m =
    /الحلقة\s+(\d+)/.exec(t) ||
    /<em>\s*(\d+)/.exec(t) ||
    /\b(\d{1,3})\b/.exec(t);
  return m ? Number(m[1]) : null;
}

function brstejParseEpisodeAnchors($, anchors, base) {
  var byId = {};
  var order = [];
  anchors.each(function () {
    var a = $(this);
    var href = a.attr('href') || '';
    var vid = brstejWatchVid(href);
    if (!vid) return;
    var t = (a.attr('title') || '').trim();
    if (!t) {
      var em = a.find('em').first();
      if (em.length) t = 'الحلقة ' + (em.text() || '').trim();
      else t = (a.text() || '').replace(/\s+/g, ' ').trim();
    }
    brstejMergeEpByVid(byId, order, vid, t, brstejEpThumb($, a, base));
  });
  var list = [];
  for (var i = 0; i < order.length; i++) {
    var vid = order[i];
    var e = byId[vid];
    list.push({
      id: 'brstej:watch:' + vid,
      title: e.title || '',
      season: 1,
      episode: i + 1,
      thumbnail: e.poster || '',
      _n: brstejEpisodeNumber(e.title),
    });
  }
  list.sort(function (a, b) {
    if (a._n == null && b._n == null) return 0;
    if (a._n == null) return 1;
    if (b._n == null) return -1;
    return a._n - b._n;
  });
  for (i = 0; i < list.length; i++) {
    list[i].episode = i + 1;
    delete list[i]._n;
  }
  return list;
}

function brstejAppendPdsSeasons($, base, out) {
  var sections = $('section.pds-season');
  if (!sections.length) return;
  sections.each(function (si) {
    var section = $(this);
    var idAttr = section.attr('id') || '';
    var idMatch = /pds-season-(\d+)/.exec(idAttr);
    var heading = (section.find('h3').first().text() || '').trim();
    var headMatch = /الموسم\s+(\d+)/.exec(heading);
    var seasonNum = idMatch
      ? Number(idMatch[1])
      : headMatch
        ? Number(headMatch[1])
        : si + 1;
    var eps = brstejParseEpisodeAnchors(
      $,
      section.find(brstejEpisodeHrefSel()),
      base,
    );
    for (var i = 0; i < eps.length; i++) {
      eps[i].season = seasonNum;
      out.videos.push(eps[i]);
    }
  });
}

/** Watch pages: `.pwr-season-panel` per season, tab label "الموسم N". */
function brstejAppendPwrSeasons($, base, out) {
  $('.pwr-season-panel').each(function (si) {
    var panel = $(this);
    var label = brstejText(panel.find('.pwr-season-fallback').first());
    var tabId = panel.attr('aria-labelledby') || '';
    if (tabId) label = brstejText($('#' + tabId).first()) || label;
    var m = /الموسم\s+(\d+)/.exec(label);
    var seasonNum = m ? Number(m[1]) : si + 1;
    var eps = brstejParseEpisodeAnchors(
      $,
      panel.find(brstejEpisodeHrefSel()),
      base,
    );
    for (var i = 0; i < eps.length; i++) {
      eps[i].season = seasonNum;
      out.videos.push(eps[i]);
    }
  });
}

function brstejAttachEpisodeOverview(out) {
  if (!out || !out.episodeOverview || !out.videos || !out.videos.length) return;
  var ep = Number(out.episode);
  var season = Number(out.pageSeason) || 1;
  for (var i = 0; i < out.videos.length; i++) {
    var v = out.videos[i];
    if (!v) continue;
    if (ep && Number(v.episode) === ep && Number(v.season || 1) === season) {
      v.overview = out.episodeOverview;
      return;
    }
  }
  // Fall back: stamp the first video when numbers are missing.
  if (!out.videos[0].overview) out.videos[0].overview = out.episodeOverview;
}

function brstejParseSerieHtml(ctx, html, base) {
  var $ = brstejHtml(ctx, html);
  var out = { title: '', poster: '', description: '', videos: [] };
  if (!$) return out;

  var title = ($('h1').first().text() || $('h2').first().text() || '').trim();
  out.title = brstejStripPrefix(title);
  out.poster = brstejPickPoster($, base);
  brstejApplyPageInfo(out, $, html);

  var seasonButtons = $('.SeasonsBoxUL button.tablinks');
  if (seasonButtons.length) {
    seasonButtons.each(function (si) {
      var seasonNum = si + 1;
      var seasonDiv = $('#Season' + seasonNum);
      if (!seasonDiv.length) return;
      var eps = brstejParseEpisodeAnchors(
        $,
        seasonDiv.find(brstejEpisodeHrefSel()),
        base,
      );
      for (var i = 0; i < eps.length; i++) {
        eps[i].season = seasonNum;
        out.videos.push(eps[i]);
      }
    });
  } else {
    var eps = brstejParseEpisodeAnchors(
      $,
      $('#pm-grid').find(brstejEpisodeHrefSel()),
      base,
    );
    for (var j = 0; j < eps.length; j++) out.videos.push(eps[j]);
  }
  if (!out.videos.length) brstejAppendPdsSeasons($, base, out);
  brstejFillVideoThumbs(out.videos, out.poster);
  if (out.videos.length) {
    var epsBit = out.videos.length + ' eps';
    if (!out.releaseInfo) {
      out.releaseInfo = out.year ? out.year + ' • ' + epsBit : epsBit;
    } else if (out.releaseInfo.indexOf('eps') < 0) {
      out.releaseInfo += ' • ' + epsBit;
    }
  }
  return out;
}

function brstejParseWatchHtml(ctx, html, base) {
  var $ = brstejHtml(ctx, html);
  var out = { title: '', poster: '', description: '', videos: [] };
  if (!$) return out;

  var nameMeta = $('meta[itemprop="name"]').first();
  var title = nameMeta.length
    ? (nameMeta.attr('content') || '').trim()
    : ($('h1').first().text() || '').trim();
  out.title = brstejStripPrefix(brstejStripEpisode(title));
  out.poster = brstejPickPoster($, base);
  brstejApplyPageInfo(out, $, html);
  if (out.seriesName) out.title = brstejStripPrefix(out.seriesName);

  var seasonLis = $('.SeasonsBoxUL li[data-serie]');
  if (seasonLis.length) {
    seasonLis.each(function (si) {
      var li = $(this);
      var n = li.attr('data-serie') || String(si + 1);
      var seasonNum = Number(n) || si + 1;
      var epDiv = $('.SeasonsEpisodes[data-serie="' + n + '"]');
      var eps = epDiv.length
        ? brstejParseEpisodeAnchors($, epDiv.find(brstejEpisodeHrefSel()), base)
        : [];
      for (var i = 0; i < eps.length; i++) {
        eps[i].season = seasonNum;
        out.videos.push(eps[i]);
      }
    });
  } else {
    var eps = brstejParseEpisodeAnchors(
      $,
      $('.SeasonsEpisodes').find(brstejEpisodeHrefSel()),
      base,
    );
    for (var j = 0; j < eps.length; j++) out.videos.push(eps[j]);
  }
  if (!out.videos.length) brstejAppendPdsSeasons($, base, out);
  if (!out.videos.length) brstejAppendPwrSeasons($, base, out);
  // A film's watch page has no episode list.
  if (!out.videos.length && brstejIsMovieTitle(title)) {
    out.movie = true;
    out.title = brstejStripMoviePrefix(title);
  }
  brstejFillVideoThumbs(out.videos, out.poster);
  brstejAttachEpisodeOverview(out);
  return out;
}

function brstejParseShowRef(params) {
  var raw = String(params.id || '').trim();
  var source = String(params.source || '').trim();
  var rest = raw;
  var colon = raw.indexOf(':');
  if (colon > 0) {
    var head = raw.substring(0, colon);
    if (head === 'brstej') {
      source = 'brstej';
      rest = raw.substring(colon + 1);
    }
  }
  if (!source) source = 'brstej';
  return {
    raw: raw,
    fullId: 'brstej:' + rest,
    source: source,
    rest: rest,
    url: String(params.url || '').trim(),
  };
}

function brstejDetails(ctx, cfg, params) {
  var ref = brstejParseShowRef(params);
  if (!ref.rest && !ref.raw) {
    return Promise.resolve(
      hubFail('details', 'INVALID_PARAMS', 'details needs params.id'),
    );
  }
  var base = brstejBase(cfg);
  var showId = ref.rest;
  var url;
  var fromWatch = false;
  if (showId.indexOf('watch:') === 0) {
    url = base + '/video.php?vid=' + encodeURIComponent(showId.substring(6));
    fromWatch = true;
  } else if (showId.indexOf('serie:') === 0) {
    url = base + '/series1.php?id=' + encodeURIComponent(showId.substring(6));
  } else {
    url = base + '/series1.php?id=' + encodeURIComponent(showId);
  }
  return brstejFetchHtml(ctx, url, base + '/')
    .then(function (got) {
      var origin = brstejOrigin(got.url) || base;
      var parsed = fromWatch
        ? brstejParseWatchHtml(ctx, got.html, origin)
        : brstejParseSerieHtml(ctx, got.html, origin);
      var name = parsed.title || showId;
      var poster = parsed.poster || '';
      var meta = brstejMeta(showId, name, poster, {
        description: parsed.description,
        url: ref.url || url,
      });
      if (!meta) {
        return hubFail('details', 'NOT_FOUND', 'brstej id ' + ref.fullId);
      }
      meta.id = ref.fullId;
      meta.description = parsed.description || '';
      meta.background = poster;
      meta.videos = parsed.videos || [];
      if (parsed.genres && parsed.genres.length) meta.genres = parsed.genres;
      if (parsed.releaseInfo) meta.releaseInfo = parsed.releaseInfo;
      if (parsed.movie) meta.badge = 'MOVIE';
      return hubOk('details', { meta: meta }, { maxAge: 900, swr: 3600 });
    })
    .catch(function (e) {
      return hubFail('details', 'UPSTREAM', e && e.message, true);
    });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var cfg = hubConfig(ctx, BRSTEJ_DEFAULTS);
  var params = hubParams(ctx);

  if (action === 'layout') {
    return hubOk('layout', brstejLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'filters') {
    return hubOk('filters', brstejFilters(), { maxAge: 86400 });
  }
  if (action === 'feed') {
    return brstejFeed(ctx, cfg, params);
  }
  if (action === 'details') {
    return brstejDetails(ctx, cfg, params);
  }
  if (action === 'search') {
    return brstejSearch(ctx, cfg, params).catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'rail') {
    return brstejRailItems(ctx, cfg, params);
  }
  return hubFail(action, 'INVALID_ACTION', 'aflem hub has no action ' + action);
}
