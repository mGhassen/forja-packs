// كرتون hub — DimaToon (dima-toon.com) via WP REST + site ajax.
// Seasons (الموسم / الجزء) are grouped into one series card; details merges
// all season episodes. Playback: provider `dimatoon`. Host surface: arabic.

var CARTOON_DEFAULTS = {
  origin: 'https://www.dima-toon.com',
};

var CARTOON_FEED_RAILS = ['spotlight', 'latest', 'popular', 'episodes'];

/** Upstream page cap per rail (host default stops at 4). */
var CARTOON_RAIL_MAX_PAGES = 100;

var CARTOON_LETTERS = [
  'ا',
  'ب',
  'ت',
  'ث',
  'ج',
  'ح',
  'خ',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ع',
  'غ',
  'ف',
  'ق',
  'ك',
  'ل',
  'م',
  'ن',
  'ه',
  'و',
  'ي',
];

function cartoonLetterFilter(value) {
  return { op: 'eq', field: 'letter', value: String(value) };
}

function cartoonCategoryOptions() {
  return CARTOON_LETTERS.map(function (letter) {
    return {
      id: 'letter_' + letter,
      label: letter,
      filter: cartoonLetterFilter(letter),
    };
  });
}

function cartoonFilters() {
  return {
    fields: [
      {
        field: 'letter',
        label: 'Letter',
        options: cartoonCategoryOptions(),
      },
    ],
    // Series-only catalog — no Films / Series chrome tabs.
  };
}

/** Sort / letter key: drop leading ال, fold hamza and taa marbuta forms. */
function cartoonLetterKey(title) {
  return cartoonStripZw(title)
    .replace(/^ال/, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function cartoonFirstLetter(title) {
  return cartoonLetterKey(title).charAt(0);
}

function cartoonFilterByLetter(items, letter) {
  if (!letter) return items || [];
  var out = [];
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i];
    if (!it) continue;
    if (cartoonFirstLetter(it.name) === letter) out.push(it);
  }
  return out;
}

var CARTOON_ORDINAL = {
  الأول: 1,
  الاول: 1,
  الثاني: 2,
  الثالث: 3,
  الرابع: 4,
  الخامس: 5,
  السادس: 6,
  السابع: 7,
  الثامن: 8,
  التاسع: 9,
  العاشر: 10,
  'الحادي عشر': 11,
  'الثاني عشر': 12,
  'الثالث عشر': 13,
  'الرابع عشر': 14,
  'الخامس عشر': 15,
  'السادس عشر': 16,
  'السابع عشر': 17,
  'الثامن عشر': 18,
  'التاسع عشر': 19,
  العشرون: 20,
};

var CARTOON_ORDINAL_RE =
  '(?:الأول|الاول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\\s*عشر|الثاني\\s*عشر|الثالث\\s*عشر|الرابع\\s*عشر|الخامس\\s*عشر|السادس\\s*عشر|السابع\\s*عشر|الثامن\\s*عشر|التاسع\\s*عشر|العشرون|\\d+)';

function cartoonBase(cfg) {
  return String(cfg.origin || cfg.dimatoon || CARTOON_DEFAULTS.origin).replace(
    /\/$/,
    '',
  );
}

function cartoonHeaders(referer) {
  var h = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    Accept: 'application/json,text/html,*/*;q=0.8',
    'Accept-Language': 'ar,en;q=0.9',
  };
  if (referer) h.Referer = referer;
  return h;
}

function cartoonHtml(ctx, raw) {
  if (!ctx || typeof ctx.html !== 'function') return null;
  try {
    return ctx.html(raw);
  } catch (e) {
    return null;
  }
}

function cartoonPosterFromDescription(desc) {
  var m = /src=["']([^"']+)["']/i.exec(String(desc || ''));
  return m ? m[1] : '';
}

function cartoonStripZw(s) {
  return String(s || '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cartoonEpNumber(title) {
  var t = cartoonStripZw(title);
  var m = /الحلقة\s*(\d+)/.exec(t) || /\b(\d{1,4})\s*$/.exec(t);
  return m ? Number(m[1]) : null;
}

function cartoonOrdinalValue(raw) {
  var t = cartoonStripZw(raw).replace(/\s+/g, ' ');
  if (/^\d+$/.test(t)) return Number(t);
  if (CARTOON_ORDINAL[t] != null) return CARTOON_ORDINAL[t];
  var compact = t.replace(/\s+/g, '');
  for (var k in CARTOON_ORDINAL) {
    if (Object.prototype.hasOwnProperty.call(CARTOON_ORDINAL, k)) {
      if (k.replace(/\s+/g, '') === compact) return CARTOON_ORDINAL[k];
    }
  }
  return null;
}

/** Strip الموسم / الجزء suffix → series display title. */
function cartoonSeriesTitle(name) {
  var t = cartoonStripZw(name);
  var re = new RegExp(
    '\\s*(?:الموسم|الجزء)\\s+' + CARTOON_ORDINAL_RE + '\\s*$',
  );
  return t.replace(re, '').trim() || t;
}

function cartoonSeriesKey(name) {
  return cartoonSeriesTitle(name).toLowerCase();
}

function cartoonSeasonNumber(name) {
  var t = cartoonStripZw(name);
  var re = new RegExp(
    '(?:الموسم|الجزء)\\s+(' + CARTOON_ORDINAL_RE + ')\\s*$',
  );
  var m = re.exec(t);
  if (!m) return 1;
  return cartoonOrdinalValue(m[1]) || 1;
}

function cartoonMeta(seriesId, title, poster, opts) {
  opts = opts || {};
  title = cartoonStripZw(title);
  if (!title || !seriesId) return null;
  var id = String(seriesId);
  var url = String(opts.url || '');
  var seasonIds = Array.isArray(opts.seasonIds) ? opts.seasonIds : [];
  var open = {
    surface: 'arabic',
    id: id,
    source: 'dimatoon',
    extract: {
      resolveType: 'arabic',
      panelCategory: 'arabic',
      ctx: {
        videoId: url || id,
        source: 'dimatoon',
      },
    },
  };
  if (url) open.url = url;
  if (seasonIds.length) open.seasonIds = seasonIds;
  var meta = {
    id: 'dimatoon:' + id,
    type: 'arabic',
    name: title,
    poster: String(poster || ''),
    ids: { dimatoon: id },
    open: open,
  };
  if (url) meta.ids.url = url;
  if (opts.description) meta.description = String(opts.description);
  if (opts.badge) meta.badge = String(opts.badge);
  return meta;
}

function cartoonFetchJson(ctx, url, referer) {
  return ctx.fetch(url, { headers: cartoonHeaders(referer) }).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().then(function (data) {
      var totalPages = 1;
      try {
        var h =
          res.headers && typeof res.headers.get === 'function'
            ? res.headers.get('X-WP-TotalPages')
            : null;
        if (h) totalPages = Math.max(1, Number(h) || 1);
      } catch (e) {}
      return { data: data, totalPages: totalPages, url: res.url || url };
    });
  });
}

function cartoonTermFields(term) {
  if (!term || !term.id) return null;
  var poster = cartoonPosterFromDescription(term.description);
  var desc = String(term.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (desc.length > 280) desc = desc.substring(0, 277) + '…';
  return {
    id: Number(term.id) || term.id,
    name: cartoonStripZw(term.name || ''),
    link: term.link || '',
    poster: poster,
    description: desc,
    count: Number(term.count) || 0,
    season: cartoonSeasonNumber(term.name || ''),
    seriesTitle: cartoonSeriesTitle(term.name || ''),
    seriesKey: cartoonSeriesKey(term.name || ''),
  };
}

/** One card per series — seasons (الموسم/الجزء) collapsed. */
function cartoonGroupTerms(terms, opts) {
  opts = opts || {};
  var byKey = {};
  var order = [];
  for (var i = 0; i < (terms || []).length; i++) {
    var t = cartoonTermFields(terms[i]);
    if (!t || !t.seriesKey) continue;
    var g = byKey[t.seriesKey];
    if (!g) {
      g = {
        key: t.seriesKey,
        title: t.seriesTitle,
        seasons: [],
        maxId: 0,
        totalEps: 0,
      };
      byKey[t.seriesKey] = g;
      order.push(t.seriesKey);
    }
    g.seasons.push(t);
    g.totalEps += t.count;
    if (Number(t.id) > g.maxId) g.maxId = Number(t.id);
  }

  var groups = [];
  for (var o = 0; o < order.length; o++) {
    var group = byKey[order[o]];
    group.seasons.sort(function (a, b) {
      return a.season - b.season;
    });
    // Newest season poster (highest term id), else first season.
    var posterTerm = group.seasons[0];
    for (var s = 0; s < group.seasons.length; s++) {
      if (Number(group.seasons[s].id) === group.maxId) {
        posterTerm = group.seasons[s];
        break;
      }
    }
    var seasonIds = group.seasons.map(function (x) {
      return x.id;
    });
    var seasonCount = group.seasons.length;
    var badge =
      group.totalEps > 0
        ? group.totalEps +
          ' حلقة' +
          (seasonCount > 1 ? ' · ' + seasonCount + ' مواسم' : '')
        : seasonCount > 1
          ? seasonCount + ' مواسم'
          : '';
    var meta = cartoonMeta('series:' + group.key, group.title, posterTerm.poster, {
      url: posterTerm.link,
      description: posterTerm.description,
      badge: badge,
      seasonIds: seasonIds,
    });
    if (!meta) continue;
    meta._maxId = group.maxId;
    meta._totalEps = group.totalEps;
    groups.push(meta);
  }

  var sort = opts.sort || 'latest';
  if (sort === 'popular') {
    groups.sort(function (a, b) {
      return (b._totalEps || 0) - (a._totalEps || 0);
    });
  } else {
    groups.sort(function (a, b) {
      return (b._maxId || 0) - (a._maxId || 0);
    });
  }
  for (var c = 0; c < groups.length; c++) {
    delete groups[c]._maxId;
    delete groups[c]._totalEps;
  }
  return hubClampList(groups, opts.limit || 24);
}

function cartoonFetchTermsPage(ctx, base, page, perPage, search) {
  var url =
    base +
    '/wp-json/wp/v2/cartoon?per_page=' +
    encodeURIComponent(String(perPage || 100)) +
    '&page=' +
    encodeURIComponent(String(page)) +
    '&orderby=id&order=desc&_fields=id,name,link,description,count';
  if (search) url += '&search=' + encodeURIComponent(search);
  return cartoonFetchJson(ctx, url, base + '/');
}

function cartoonFetchAllTerms(ctx, base, opts) {
  opts = opts || {};
  var maxPages = Number(opts.maxPages) > 0 ? Number(opts.maxPages) : 5;
  var search = String(opts.search || '').trim();
  function page(n, acc) {
    return cartoonFetchTermsPage(ctx, base, n, 100, search).then(function (got) {
      var rows = Array.isArray(got.data) ? got.data : [];
      var next = acc.concat(rows);
      if (n < got.totalPages && n < maxPages && rows.length) {
        return page(n + 1, next);
      }
      return next;
    });
  }
  return page(1, []);
}

function cartoonListSeries(ctx, base, opts) {
  opts = opts || {};
  return cartoonFetchAllTerms(ctx, base, {
    search: opts.search,
    maxPages: opts.maxPages || 5,
  }).then(function (terms) {
    return cartoonGroupTerms(terms, {
      limit: opts.limit || 24,
      sort: opts.sort || 'latest',
    });
  });
}

function cartoonFetchEpisodesPage(ctx, base, cartoonId, page) {
  var url =
    base +
    '/wp-json/wp/v2/cartoon-episode?cartoon=' +
    encodeURIComponent(String(cartoonId)) +
    '&per_page=100&page=' +
    encodeURIComponent(String(page)) +
    '&orderby=date&order=asc&_fields=id,title,link,featured_media,date';
  return cartoonFetchJson(ctx, url, base + '/');
}

function cartoonFetchAllEpisodes(ctx, base, cartoonId) {
  function page(n, acc) {
    return cartoonFetchEpisodesPage(ctx, base, cartoonId, n).then(function (got) {
      var rows = Array.isArray(got.data) ? got.data : [];
      var next = acc.concat(rows);
      if (n < got.totalPages && rows.length) return page(n + 1, next);
      if (rows.length === 100) return page(n + 1, next);
      return next;
    });
  }
  return page(1, []);
}

function cartoonFetchSeasonTerms(ctx, base, seasonIds) {
  return Promise.all(
    seasonIds.map(function (id) {
      return cartoonFetchJson(
        ctx,
        base +
          '/wp-json/wp/v2/cartoon/' +
          encodeURIComponent(String(id)) +
          '?_fields=id,name,link,description,count',
        base + '/',
      )
        .then(function (got) {
          return got.data;
        })
        .catch(function () {
          return null;
        });
    }),
  ).then(function (rows) {
    return rows.filter(Boolean);
  });
}

// All season terms for this JS VM — the catalog is ~200 terms, one fetch
// serves every rail page, letter, and sort.
var CARTOON_TERMS_TTL_MS = 10 * 60 * 1000;
var _cartoonTermsMemo = null;

function cartoonAllTerms(ctx, base) {
  var now = Date.now();
  var memo = _cartoonTermsMemo;
  if (memo && memo.base === base && now - memo.at < CARTOON_TERMS_TTL_MS) {
    return memo.promise;
  }
  var promise = cartoonFetchAllTerms(ctx, base, { maxPages: 20 }).catch(
    function (e) {
      _cartoonTermsMemo = null;
      throw e;
    },
  );
  _cartoonTermsMemo = { base: base, at: now, promise: promise };
  return promise;
}

/** Every series (seasons grouped), sorted `latest` / `popular` / `name`. */
function cartoonAllSeries(ctx, base, sort) {
  return cartoonAllTerms(ctx, base).then(function (terms) {
    var list = cartoonGroupTerms(terms, {
      limit: 100000,
      sort: sort === 'popular' ? 'popular' : 'latest',
    });
    if (sort === 'name') {
      list.sort(function (a, b) {
        var x = cartoonLetterKey(a.name);
        var y = cartoonLetterKey(b.name);
        return x < y ? -1 : x > y ? 1 : 0;
      });
    }
    return list;
  });
}

function cartoonPageSlice(list, page, limit) {
  var start = (page - 1) * limit;
  return {
    items: list.slice(start, start + limit),
    hasMore: start + limit < list.length,
  };
}

/** Recent-episode pages read per rail page — daily uploads cluster on few shows. */
var CARTOON_RECENT_SPAN = 4;

/**
 * Series with the newest episodes, newest first. Each rail page reads
 * [CARTOON_RECENT_SPAN] pages of 100 recent episodes and maps them back to
 * their series.
 */
function cartoonRecentSeries(ctx, base, page) {
  var jobs = [];
  for (
    var p = (page - 1) * CARTOON_RECENT_SPAN + 1;
    p <= page * CARTOON_RECENT_SPAN;
    p++
  ) {
    jobs.push(
      cartoonFetchJson(
        ctx,
        base +
          '/wp-json/wp/v2/cartoon-episode?per_page=100&page=' +
          encodeURIComponent(String(p)) +
          '&orderby=date&order=desc&_fields=id,cartoon',
        base + '/',
      ).catch(function () {
        return { data: [], totalPages: 0 };
      }),
    );
  }
  return Promise.all([Promise.all(jobs), cartoonAllTerms(ctx, base)]).then(
    function (got) {
      var rows = [];
      var totalPages = 0;
      for (var j = 0; j < got[0].length; j++) {
        if (Array.isArray(got[0][j].data)) rows = rows.concat(got[0][j].data);
        totalPages = Math.max(totalPages, got[0][j].totalPages || 0);
      }
      var keyByTerm = {};
      for (var t = 0; t < got[1].length; t++) {
        keyByTerm[got[1][t].id] = cartoonSeriesKey(got[1][t].name || '');
      }
      var series = cartoonGroupTerms(got[1], { limit: 100000 });
      var byKey = {};
      for (var s = 0; s < series.length; s++) {
        byKey[series[s].open.id.substring(7)] = series[s];
      }
      var out = [];
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var key = keyByTerm[(rows[i].cartoon || [])[0]];
        if (!key || seen[key] || !byKey[key]) continue;
        seen[key] = true;
        out.push(byKey[key]);
      }
      return {
        items: out,
        hasMore: page * CARTOON_RECENT_SPAN < totalPages,
      };
    },
  );
}

/** Rail id → one page of series. Letter filter narrows every rail. */
function cartoonRailList(ctx, cfg, rail, params) {
  var base = cartoonBase(cfg);
  var limit = Number(params.limit) > 0 ? Number(params.limit) : 24;
  var page = Number(params.page) > 0 ? Number(params.page) : 1;
  var letter = hubFilterValue(params.filter, 'letter');
  var type = String(
    hubFilterValue(params.filter, 'type') || hubFilterValue(params.filter, 'kind') || '',
  );
  if (type === 'movie') return Promise.resolve({ items: [], hasMore: false });

  if (rail === 'episodes') {
    return cartoonRecentSeries(ctx, base, page).then(function (got) {
      return {
        items: cartoonFilterByLetter(got.items, letter),
        hasMore: got.hasMore,
      };
    });
  }
  var sort = {
    spotlight: 'latest',
    latest: 'latest',
    popular: 'popular',
    all: 'name',
  }[rail];
  if (!sort) return null;
  return cartoonAllSeries(ctx, base, sort).then(function (list) {
    return cartoonPageSlice(cartoonFilterByLetter(list, letter), page, limit);
  });
}

function cartoonRail(ctx, cfg, params) {
  var rail = String(params.rail || params.id || '').trim();
  var load = cartoonRailList(ctx, cfg, rail, params);
  if (!load) {
    return Promise.resolve(
      hubFail('rail', 'INVALID_PARAMS', 'unknown rail ' + rail),
    );
  }
  var limit = Number(params.limit) > 0 ? Number(params.limit) : 24;
  return load
    .then(function (page) {
      return hubItems(
        'rail',
        page.items,
        { maxAge: 600, swr: 3600 },
        { pageSize: limit, hasMore: !!page.hasMore },
      );
    })
    .catch(function (e) {
      return hubFail('rail', 'UPSTREAM', e && e.message, true);
    });
}

/** First page of each feed rail — the same lists `rail` pages through. */
function cartoonFeed(ctx, cfg, params) {
  var first = Object.assign({}, params, { page: 1 });
  return Promise.all(
    CARTOON_FEED_RAILS.map(function (rail) {
      return cartoonRailList(ctx, cfg, rail, first).catch(function () {
        return { items: [] };
      });
    }),
  ).then(function (pages) {
    var rails = {};
    for (var i = 0; i < CARTOON_FEED_RAILS.length; i++) {
      rails[CARTOON_FEED_RAILS[i]] = pages[i].items;
    }
    return hubOk('feed', { rails: rails }, { maxAge: 600, swr: 3600 });
  });
}


function cartoonParseSeasonIds(params) {
  var raw = params.seasonIds;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map(function (x) {
        return Number(x) || x;
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return cartoonParseSeasonIds({ seasonIds: parsed });
    } catch (e) {}
  }
  return [];
}

function cartoonResolveSeries(ctx, base, params) {
  var raw = String(params.id || '').trim();
  if (raw.indexOf('dimatoon:') === 0) raw = raw.substring(9);
  var seasonIds = cartoonParseSeasonIds(params);
  var url = String(params.url || '').trim();

  if (raw.indexOf('series:') === 0) {
    var key = raw.substring(7);
    if (seasonIds.length) {
      return cartoonFetchSeasonTerms(ctx, base, seasonIds).then(function (terms) {
        return { seriesKey: key, terms: terms, url: url };
      });
    }
    return cartoonAllTerms(ctx, base).then(function (all) {
      var matched = [];
      for (var i = 0; i < all.length; i++) {
        if (cartoonSeriesKey(all[i].name || '') === key) matched.push(all[i]);
      }
      return { seriesKey: key, terms: matched, url: url };
    });
  }

  // Legacy single-season id / URL — expand to full series siblings.
  if (/^\d+$/.test(raw) || seasonIds.length === 1) {
    var seedId = /^\d+$/.test(raw) ? raw : seasonIds[0];
    return cartoonFetchJson(
      ctx,
      base +
        '/wp-json/wp/v2/cartoon/' +
        encodeURIComponent(String(seedId)) +
        '?_fields=id,name,link,description,count',
      base + '/',
    ).then(function (got) {
      var seed = got.data;
      if (!seed || !seed.id) return { seriesKey: '', terms: [], url: url };
      var key = cartoonSeriesKey(seed.name || '');
      return cartoonAllTerms(ctx, base).then(function (all) {
        var matched = [];
        for (var i = 0; i < all.length; i++) {
          if (cartoonSeriesKey(all[i].name || '') === key) matched.push(all[i]);
        }
        if (!matched.length) matched = [seed];
        return { seriesKey: key, terms: matched, url: url || seed.link || '' };
      });
    });
  }

  // URL-as-id from older search hits.
  var showUrl = url || raw;
  if (!/^https?:\/\//i.test(showUrl)) {
    return Promise.resolve({ seriesKey: '', terms: [], url: showUrl });
  }
  var slug = '';
  try {
    var u = new URL(showUrl);
    var parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'cartoon' && parts[1]) {
      try {
        slug = decodeURIComponent(parts[1]);
      } catch (e) {
        slug = parts[1];
      }
    }
  } catch (e) {}
  if (!slug) return Promise.resolve({ seriesKey: '', terms: [], url: showUrl });
  return cartoonFetchJson(
    ctx,
    base +
      '/wp-json/wp/v2/cartoon?slug=' +
      encodeURIComponent(slug) +
      '&_fields=id,name,link,description,count',
    base + '/',
  ).then(function (got) {
    var rows = Array.isArray(got.data) ? got.data : [];
    if (!rows.length) return { seriesKey: '', terms: [], url: showUrl };
    var seed = rows[0];
    var key = cartoonSeriesKey(seed.name || '');
    return cartoonAllTerms(ctx, base).then(function (all) {
      var matched = [];
      for (var i = 0; i < all.length; i++) {
        if (cartoonSeriesKey(all[i].name || '') === key) matched.push(all[i]);
      }
      if (!matched.length) matched = [seed];
      return { seriesKey: key, terms: matched, url: showUrl };
    });
  });
}

function cartoonVideosFromSeason(ctx, base, term) {
  var season = cartoonSeasonNumber(term.name || '');
  return cartoonFetchAllEpisodes(ctx, base, term.id).then(function (eps) {
    var videos = [];
    for (var i = 0; i < (eps || []).length; i++) {
      var ep = eps[i];
      var title = cartoonStripZw(
        (ep.title && ep.title.rendered) || ep.title || '',
      );
      var href = ep.link || '';
      if (!href || !title) continue;
      var n = cartoonEpNumber(title);
      videos.push({
        id: 'dimatoon:' + href,
        title: title,
        season: season,
        episode: n != null ? n : i + 1,
        thumbnail: '',
      });
    }
    return videos;
  });
}

function cartoonDetails(ctx, cfg, params) {
  var base = cartoonBase(cfg);
  return cartoonResolveSeries(ctx, base, params).then(function (ref) {
    if (!ref.terms || !ref.terms.length) {
      return hubFail('details', 'INVALID_PARAMS', 'cartoon details needs id');
    }
    var fields = ref.terms.map(cartoonTermFields).filter(Boolean);
    fields.sort(function (a, b) {
      return a.season - b.season;
    });
    var seriesTitle = fields[0].seriesTitle;
    var seriesKey = ref.seriesKey || fields[0].seriesKey;
    var seasonIds = fields.map(function (f) {
      return f.id;
    });
    var totalEps = 0;
    for (var i = 0; i < fields.length; i++) totalEps += fields[i].count;

    return Promise.all(
      ref.terms.map(function (term) {
        return cartoonVideosFromSeason(ctx, base, term);
      }),
    ).then(function (parts) {
      var videos = [];
      for (var p = 0; p < parts.length; p++) {
        videos = videos.concat(parts[p] || []);
      }
      videos.sort(function (a, b) {
        if ((a.season || 1) !== (b.season || 1)) {
          return (a.season || 1) - (b.season || 1);
        }
        return (a.episode || 0) - (b.episode || 0);
      });

      var posterTerm = fields[fields.length - 1];
      var badge =
        totalEps > 0
          ? totalEps +
            ' حلقة' +
            (fields.length > 1 ? ' · ' + fields.length + ' مواسم' : '')
          : '';
      var meta = cartoonMeta('series:' + seriesKey, seriesTitle, posterTerm.poster, {
        url: ref.url || posterTerm.link,
        description: posterTerm.description,
        badge: badge,
        seasonIds: seasonIds,
      });
      if (!meta) {
        return hubFail('details', 'NOT_FOUND', 'cartoon series ' + seriesKey);
      }
      for (var v = 0; v < videos.length; v++) {
        if (!videos[v].thumbnail) videos[v].thumbnail = posterTerm.poster || '';
      }
      meta.videos = videos;
      return hubOk('details', { meta: meta }, { maxAge: 900, swr: 3600 });
    });
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var cfg = hubConfig(ctx, CARTOON_DEFAULTS);
  var params = hubParams(ctx);

  if (action === 'layout') {
    return hubOk('layout', cartoonLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'filters') {
    return hubOk('filters', cartoonFilters(), { maxAge: 86400 });
  }
  if (action === 'feed') {
    return cartoonFeed(ctx, cfg, params).catch(function (e) {
      return hubFail('feed', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'rail') {
    return cartoonRail(ctx, cfg, params);
  }
  if (action === 'search') {
    return cartoonSearch(ctx, cfg, params).catch(function (e) {
      return hubFail('search', 'UPSTREAM', e && e.message, true);
    });
  }
  if (action === 'details') {
    return cartoonDetails(ctx, cfg, params).catch(function (e) {
      return hubFail('details', 'UPSTREAM', e && e.message, true);
    });
  }
  return hubFail(action || 'unknown', 'UNSUPPORTED', 'unsupported action');
}
