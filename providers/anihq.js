var SPECS = {
  base: 'https://anihq.cc',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function titleCandidates() {
    var out = [];
    var seen = {};
    function add(t) {
      t = String(t || '').trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    add(ctx.title);
    add(ctx.titleEnglish);
    add(ctx.titleRomaji);
    add(ctx.originalTitle);
    if (Array.isArray(ctx.titles)) ctx.titles.forEach(add);
    return out;
  }

  function cleanSlug(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function getText(url, extra) {
    return ctx
      .fetch(url, { headers: Object.assign({ 'User-Agent': ua }, extra || {}) })
      .then(function (r) {
        if (!r.ok) return '';
        return r.text();
      });
  }

  function findVoe(html) {
    var m =
      html.match(/data-video=["'](https?:\/\/[^"']*voe[^"']*)["']/i) ||
      html.match(/href=["'](https?:\/\/[^"']*voe[^"']*)["']/i);
    return m ? m[1] : '';
  }

  function scrapeTitle(title, kind) {
    var isDub = kind === 'dub';
    var typeSuffix = isDub ? 'english-dubbed' : 'english-subbed';
    var clean = cleanSlug(title);
    if (!clean) return Promise.resolve([]);
    var directUrl = base + '/watch/' + clean + '-episode-' + ep + '-' + typeSuffix + '/';

    return getText(directUrl)
      .then(function (html) {
        if (html && findVoe(html)) return html;
        return getText(base + '/search?keyword=' + encodeURIComponent(title)).then(function (
          sHtml,
        ) {
          if (!sHtml) return '';
          var re = new RegExp(
            'href="(https://anihq\\.cc/watch/[^\"]+-episode-' +
              ep +
              '-' +
              typeSuffix +
              '/)"',
            'i',
          );
          var m = sHtml.match(re);
          if (!m) return '';
          return getText(m[1]);
        });
      })
      .then(function (html) {
        if (!html) return [];
        var voeUrl = findVoe(html);
        if (!voeUrl) return [];
        return ctx.hop(voeUrl).then(function (rows) {
          return (rows || []).map(function (r) {
            return Object.assign({}, r, {
              name: 'AniHQ (VOE) (' + kind.toUpperCase() + ')',
              language: isDub ? 'Dub' : 'Sub',
              quality: r.quality || '1080p',
              headers: Object.assign(
                { 'User-Agent': ua, Referer: base + '/' },
                r.headers || {},
              ),
            });
          });
        });
      })
      .catch(function () {
        return [];
      });
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  function tryTitles(kind) {
    var chain = Promise.resolve([]);
    titles.forEach(function (title) {
      chain = chain.then(function (acc) {
        if (acc.length) return acc;
        return scrapeTitle(title, kind);
      });
    });
    return chain;
  }

  return Promise.all(
    cats.map(function (kind) {
      return tryTitles(kind === 'dub' ? 'dub' : 'sub');
    }),
  ).then(function (groups) {
    var seen = {};
    var out = [];
    groups.forEach(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || !r.url || seen[r.url]) return;
        seen[r.url] = true;
        out.push(r);
      });
    });
    return out;
  });
}
