var SPECS = {
  base: 'https://ani.pm',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;
  // embed.settlar.io sits behind Cloudflare and 403s the plain client's TLS fingerprint.
  var cfFetch = typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch;

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  // Settlar proxy paths wrap the upstream URL: /backup/v1/{h|v}/<base64url>.<sig>.<ext>.
  // The proxy only answers browser fingerprints; the upstream CDN plays with the embed host as referer.
  function unwrap(url) {
    var m = /\/backup\/v1\/[hv]\/([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\.(?:m3u8|vtt)$/.exec(String(url || ''));
    if (!m) return '';
    try {
      var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var out = atob(b64);
      return /^https?:\/\//.test(out) ? out : '';
    } catch (e) {
      return '';
    }
  }

  function originOf(url) {
    var m = /^(https?:\/\/[^/]+)/.exec(String(url || ''));
    return m ? m[1] : '';
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
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        var be = data && data.backupEmbed;
        if (!be || !be.available || !be.direct || !be.direct.stream) return [];
        if (be.language && be.language !== lang) return [];
        var embedOrigin = originOf(be.url);
        if (!embedOrigin) return [];

        // direct.stream is a JSON descriptor ({ master, tracks }), not media.
        return cfFetch(be.direct.stream, {
          headers: {
            'User-Agent': ua,
            Referer: base + '/',
            Origin: base,
            Accept: 'application/json',
          },
        })
          .then(function (r) {
            if (!r.ok) return null;
            return r.json();
          })
          .then(function (desc) {
            var master = unwrap(desc && desc.master);
            if (!master) return [];
            var subtitles = [];
            (desc.tracks || []).forEach(function (t) {
              var su = t && unwrap(t.url);
              if (!su) return;
              subtitles.push({ url: su, lang: t.lang || t.label || 'Unknown', label: t.label || '' });
            });
            return [
              {
                url: master,
                name: 'AniPM (' + lang.toUpperCase() + ')',
                language: lang === 'dub' ? 'Dub' : 'Sub',
                headers: {
                  'User-Agent': ua,
                  Referer: embedOrigin + '/',
                  Origin: embedOrigin,
                },
                subtitles: subtitles,
                pngStrip: 'auto',
              },
            ];
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
