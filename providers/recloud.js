var SPECS = {
  base: 'https://cdn.4animo.xyz',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function getText(url, extra) {
    return ctx
      .fetch(url, { headers: Object.assign({ 'User-Agent': ua, Accept: '*/*' }, extra || {}) })
      .then(function (r) {
        if (!r.ok) return '';
        return r.text();
      });
  }

  function getJson(url, extra) {
    return ctx
      .fetch(url, {
        headers: Object.assign(
          { 'User-Agent': ua, Accept: 'application/json, text/plain, */*' },
          extra || {},
        ),
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      });
  }

  function abs(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return base + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function tracksFrom(data) {
    var out = [];
    var list = data && data.tracks;
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item) continue;
      var file = abs(item.file || item.url || '');
      if (!file) continue;
      out.push({
        url: file,
        language: item.label || item.lang || 'und',
        name: item.label || 'Subtitles',
      });
    }
    return out;
  }

  function scrape(al, kind) {
    var cat = kind === 'dub' ? 'dub' : 'sub';
    var embedUrl = base + '/embed/ani/' + al + '/' + ep + '/' + cat + '?k=1';
    return getText(embedUrl, {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      Referer: 'https://google.com/',
    })
      .then(function (html) {
        if (!html) return [];
        var m = html.match(/var\s+sourcesUrl\s*=\s*['"]([^'"]+)['"]/);
        if (!m) return [];
        var sourcesUrl = abs(m[1]);
        return getJson(sourcesUrl, { Referer: embedUrl }).then(function (data) {
          if (!data || !Array.isArray(data.sources) || !data.sources.length) return [];
          var filePath = data.sources[0] && data.sources[0].file;
          var streamUrl = abs(filePath || '');
          if (!streamUrl) return [];
          var row = {
            url: streamUrl,
            name: 'ReCloud (' + cat.toUpperCase() + ')',
            language: cat === 'dub' ? 'Dub' : 'Sub',
            headers: {
              Referer: base + '/',
              Origin: base,
              'User-Agent': ua,
            },
          };
          var subs = tracksFrom(data);
          if (subs.length) row.subtitles = subs;
          return [row];
        });
      })
      .catch(function () {
        return [];
      });
  }

  var al = anilistId();
  if (!al) return Promise.resolve([]);

  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  return Promise.all(
    cats.map(function (kind) {
      return scrape(al, kind);
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
