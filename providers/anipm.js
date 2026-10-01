var SPECS = {
  base: 'https://ani.pm',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function scrape(al, kind) {
    var cat = kind === 'dub' ? 'dub' : 'sub';
    var params = {
      ep: String(ep),
      anilistId: String(al),
    };
    var title = String(ctx.title || ctx.titleEnglish || ctx.titleRomaji || '').trim();
    if (title) params.title = title;
    var qs = Object.keys(params)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      })
      .join('&');

    return ctx
      .fetch(base + '/api/anime/src/servers?' + qs, {
        headers: {
          'User-Agent': ua,
          Referer: base + '/',
          Accept: 'application/json',
        },
      })
      .then(function (r) {
        if (!r.ok) return [];
        return r.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') return [];
        var list = data[cat];
        if (!Array.isArray(list)) return [];
        var rows = [];
        for (var i = 0; i < list.length; i++) {
          var srv = list[i];
          if (!srv || !srv.url) continue;
          var streamUrl = String(srv.url).charAt(0) === '/' ? base + srv.url : srv.url;
          if (!streamUrl) continue;
          rows.push({
            url: streamUrl,
            name: 'AniPM (' + (srv.provider || 'AniPM') + ') (' + cat.toUpperCase() + ')',
            quality: '1080p',
            language: cat === 'dub' ? 'Dub' : 'Sub',
            headers: {
              'User-Agent': ua,
              Referer: base + '/',
              Origin: base,
            },
          });
        }
        return rows;
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
