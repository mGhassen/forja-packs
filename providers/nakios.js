// Nakios (nakios.rent): French VF / VOSTFR streams keyed by TMDB id. Pack prelude: _fr_anime_embeds.js.
var SPECS = {
  domain: 'https://nakios.rent',
  apiBase: 'https://api.nakios.rent',
};

var NAKIOS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// VOSTFR and VO have original audio: no `language`, so Sources chips do not read them as French audio.
var NAKIOS_LANGS = {
  vf: { title: 'VF', language: 'French' },
  vff: { title: 'VFF', language: 'French' },
  vfq: { title: 'VFQ', language: 'French' },
  vostfr: { title: 'VOSTFR', language: '' },
  vo: { title: 'VO', language: '' },
  multi: { title: 'MULTI', language: 'French' },
};

function nakiosLangKey(raw) {
  var k = String(raw || '').toLowerCase();
  if (k === '' || k === 'french' || k === 'truefrench') return 'vf';
  if (k.indexOf('vostfr') === 0) return 'vostfr';
  if (k.indexOf('vo') === 0 || k === 'english') return 'vo';
  return NAKIOS_LANGS[k] ? k : 'vf';
}

function nakiosQuality(raw) {
  var q = String(raw || '');
  return (q.match(/\b(2160p|4K|1080p|720p|480p|360p)\b/i) || [])[1] || '';
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var domain = String(cfg.domain || '').replace(/\/$/, '');
  var api = String(cfg.apiBase || '').replace(/\/$/, '');
  var tmdb = String(ctx.tmdbId || '').trim();
  var isTv = ctx.type === 'tv';
  var season = Number(ctx.season) || 1;
  var episode = Number(ctx.episode) || 1;
  if (!api || !/^\d+$/.test(tmdb)) return Promise.resolve([]);

  var path = isTv ? '/api/sources/tv/' + tmdb + '/' + season + '/' + episode : '/api/sources/movie/' + tmdb;
  var playHeaders = { 'User-Agent': NAKIOS_UA, Referer: domain + '/' };

  return ctx
    .fetch(api + path, {
      headers: { 'User-Agent': NAKIOS_UA, Accept: 'application/json', Origin: domain, Referer: domain + '/' },
    })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      var sources = d && d.success && Array.isArray(d.sources) ? d.sources : [];
      var direct = [];
      var embeds = [];
      var seen = {};
      sources.forEach(function (s) {
        var url = s && s.url ? String(s.url).trim() : '';
        if (!/^https?:\/\//i.test(url) || seen[url]) return;
        seen[url] = true;
        var meta = NAKIOS_LANGS[nakiosLangKey(s.lang)];
        var label = String(s.provider || s.name || 'Nakios');
        if (s.isEmbed) {
          embeds.push({ url: url, meta: meta, label: label });
          return;
        }
        var quality = nakiosQuality(s.quality);
        var row = {
          url: url,
          name: 'Nakios · ' + label,
          title: meta.title + (quality ? ' · ' + quality : ''),
          headers: playHeaders,
        };
        if (quality) row.quality = quality;
        if (meta.language) row.language = meta.language;
        direct.push(row);
      });

      return Promise.all(
        embeds.map(function (e) {
          return frAnimeResolveEmbed(ctx, e.url, domain + '/').then(function (rows) {
            return (rows || []).map(function (r) {
              var out = Object.assign({}, r, {
                name: 'Nakios · ' + e.label + ' [' + (r.name || frAnimeHostName(e.url)) + ']',
                title: e.meta.title + (r.quality ? ' · ' + r.quality : ''),
              });
              if (e.meta.language) out.language = e.meta.language;
              else delete out.language;
              return out;
            });
          });
        }),
      ).then(function (groups) {
        return direct.concat([].concat.apply([], groups));
      });
    })
    .catch(function () {
      return [];
    });
}
