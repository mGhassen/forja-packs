var SPECS = {
  watchUrl: 'https://luna-stream.me/anime/watch/21/gogoanime/1',
  actionFetchSources: 'afb0491c5516f9fff5fcb464d627638df76062f8',
  origin: 'https://luna-stream.me',
};

var PROVIDERS = [
  { id: 'megaplay', name: 'Helios' },
  { id: 'gogoanime', name: 'Quasar' },
  { id: 'zoro', name: 'Zenith' },
  { id: 'anibd', name: 'Nova' },
  { id: 'pahe', name: 'Polaris' },
  { id: 'animepahe', name: 'Vega' },
];

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var watchUrl = String(cfg.watchUrl || '');
  var actionId = String(cfg.actionFetchSources || '');
  var origin = String(cfg.origin || 'https://luna-stream.me').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function parseRsc(text) {
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('1:') === 0) {
        try {
          var parsed = JSON.parse(lines[i].substring(2));
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) {}
      }
    }
    return null;
  }

  function cleanUrl(raw) {
    return String(raw || '').replace(
      'https://api.luna-stream.mehttps://api.luna-stream.me',
      'https://api.luna-stream.me',
    );
  }

  function scrapeProvider(al, p, subtype) {
    return ctx
      .fetch(watchUrl, {
        method: 'POST',
        headers: {
          'User-Agent': ua,
          'Next-Action': actionId,
          'Content-Type': 'text/plain;charset=UTF-8',
          Accept: 'text/x-component',
          Referer: watchUrl,
          Origin: origin,
        },
        body: JSON.stringify([al, p.id, String(ep), ep, subtype, null]),
      })
      .then(function (r) {
        if (!r.ok) return [];
        return r.text();
      })
      .then(function (body) {
        var parsed = parseRsc(body);
        if (!parsed || !Array.isArray(parsed.sources)) return [];
        var rows = [];
        for (var i = 0; i < parsed.sources.length; i++) {
          var s = parsed.sources[i];
          if (!s || !s.url) continue;
          var url = cleanUrl(s.url);
          if (!url) continue;
          var format = String(s.type || '').toLowerCase();
          var isHls =
            format === 'hls' ||
            format === 'm3u8' ||
            url.indexOf('.m3u8') >= 0 ||
            url.indexOf('.txt') >= 0;
          rows.push({
            url: url,
            name: 'Luna (' + p.name + ') (' + subtype.toUpperCase() + ')',
            quality: s.quality || '1080p',
            language: subtype === 'dub' ? 'Dub' : 'Sub',
            type: isHls ? 'hls' : 'mp4',
            headers: {
              'User-Agent': ua,
              Referer: origin + '/',
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

  var tasks = [];
  cats.forEach(function (kind) {
    var subtype = kind === 'dub' ? 'dub' : 'sub';
    PROVIDERS.forEach(function (p) {
      tasks.push(scrapeProvider(al, p, subtype));
    });
  });

  return Promise.all(tasks).then(function (groups) {
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
