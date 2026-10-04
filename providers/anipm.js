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
    var lang = kind === 'dub' ? 'dub' : 'sub';
    var url =
      base +
      '/api/anime/playback-bootstrap/anilist/' +
      al +
      '?ep=' +
      encodeURIComponent(String(ep)) +
      '&lang=' +
      lang +
      '&backup=1';

    return ctx
      .fetch(url, {
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
        var rows = [];
        var langLabel = lang.toUpperCase();

        var be = data.backupEmbed;
        if (be && be.available) {
          if (be.direct && be.direct.stream) {
            rows.push({
              url: be.direct.stream,
              name: 'AniPM (' + langLabel + ')',
              quality: '1080p',
              language: lang === 'dub' ? 'Dub' : 'Sub',
              headers: {
                'User-Agent': ua,
                Referer: base + '/',
                Origin: base,
              },
            });
          }
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
