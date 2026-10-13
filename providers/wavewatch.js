// Wavewatch (wavewatch.cc): French VF / VFQ / VOSTFR server list from its Playerix page, keyed by TMDB id.
// Pack prelude: _fr_anime_embeds.js.
var SPECS = {
  apiBase: 'https://apis.wavewatch.cc',
  maxEmbeds: 40,
};

var WAVEWATCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

// VOSTFR and VO have original audio: no `language`, so Sources chips do not read them as French audio.
var WAVEWATCH_LANGS = {
  vf: { title: 'VF', language: 'French' },
  vfq: { title: 'VFQ', language: 'French' },
  vostfr: { title: 'VOSTFR', language: '' },
  multi: { title: 'MULTI', language: 'French' },
  vo: { title: 'VO', language: '' },
};

// Hosts with no resolver in this pack (SPA players, per-hostname obfuscation, dead hosts).
var WAVEWATCH_SKIP_HOSTS =
  /(^|\.)(fembed\.com|multiup\.us|younetu\.org|uptostream\.link|upvid\.co|bysebuho\.com|embedseek\.com|fsvid\.lol|vidzy\.cc|blinkflux\.lol|upn\.one|waaw\.to|upns\.pro|lecteurvideo\.com)$/;

function wavewatchLangKey(raw) {
  var k = String(raw || '').toLowerCase();
  if (k.indexOf('vostfr') >= 0) return 'vostfr';
  if (k.indexOf('vfq') >= 0) return 'vfq';
  if (k.indexOf('vf') >= 0) return 'vf';
  if (k.indexOf('multi') >= 0) return 'multi';
  return 'vo';
}

function wavewatchDecode(b64) {
  var s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try {
    return atob(s);
  } catch (e) {
    return '';
  }
}

// Each `<button class="src">` carries the base64 target in `u=`, its format and a language tag.
// Direct m3u8/mp4 must stay on `playerix.php?px=1&u=…` — the peeled CDN host is CF-walled.
function wavewatchParse(html) {
  var out = [];
  var re = /<button class="src"([\s\S]*?)<\/button>/g;
  var m;
  while ((m = re.exec(html))) {
    var block = m[1];
    var raw = ((block.match(/data-url="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
    var fmt = ((block.match(/data-fmt="([^"]*)"/) || [])[1] || '').toLowerCase();
    var alive = (block.match(/data-alive="([^"]*)"/) || [])[1];
    var lang = (block.match(/class="lang">([^<]*)</) || [])[1] || '';
    var b64 = (raw.match(/[?&]u=([^&]+)/) || [])[1];
    var target = wavewatchDecode(b64 ? decodeURIComponent(b64) : '').trim();
    if (alive === '0' || !/^https?:\/\//i.test(target)) continue;
    var proxied = (fmt === 'm3u8' || fmt === 'mp4') && /[?&]px=1(?:&|$)/.test(raw);
    out.push({
      url: proxied ? raw : target,
      hostUrl: target,
      fmt: fmt,
      lang: wavewatchLangKey(lang),
    });
  }
  return out;
}

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = String(cfg.apiBase || '').replace(/\/$/, '');
  var tmdb = String(ctx.tmdbId || '').trim();
  var isTv = ctx.type === 'tv';
  var season = Number(ctx.season) || 1;
  var episode = Number(ctx.episode) || 1;
  if (!api || !/^\d+$/.test(tmdb)) return Promise.resolve([]);

  var page = isTv
    ? api + '/playerix.php?type=tv&id=' + tmdb + '&s=' + season + '&e=' + episode
    : api + '/playerix.php?type=movie&id=' + tmdb;
  var playHeaders = { 'User-Agent': WAVEWATCH_UA, Referer: api + '/' };

  return ctx
    .fetch(page, { headers: { 'User-Agent': WAVEWATCH_UA, Referer: 'https://wwembed.wavewatch.cc/' } })
    .then(function (r) {
      return r.ok ? r.text() : '';
    })
    .then(function (html) {
      var seen = {};
      var direct = [];
      var embeds = [];
      wavewatchParse(html).forEach(function (s) {
        var dedupe = s.hostUrl || s.url;
        if (seen[dedupe]) return;
        seen[dedupe] = true;
        var meta = WAVEWATCH_LANGS[s.lang];
        if (s.fmt === 'm3u8' || s.fmt === 'mp4') {
          var row = {
            url: s.url,
            name: 'Wavewatch · ' + frAnimeHostName(s.hostUrl || s.url),
            title: meta.title,
            headers: playHeaders,
          };
          if (meta.language) row.language = meta.language;
          direct.push(row);
          return;
        }
        if (WAVEWATCH_SKIP_HOSTS.test(frAnimeHost(s.hostUrl || s.url))) return;
        embeds.push({ url: s.url, hostUrl: s.hostUrl || s.url, meta: meta });
      });

      var picked = embeds.slice(0, Number(cfg.maxEmbeds) || SPECS.maxEmbeds);
      return Promise.all(
        picked.map(function (e) {
          return frAnimeResolveEmbed(ctx, e.url, api + '/').then(function (rows) {
            return (rows || []).map(function (r) {
              var out = Object.assign({}, r, {
                name: 'Wavewatch · ' + (r.name || frAnimeHostName(e.hostUrl)),
                title: e.meta.title + (r.quality ? ' · ' + r.quality : ''),
              });
              if (e.meta.language) out.language = e.meta.language;
              else delete out.language;
              return out;
            });
          });
        }),
      ).then(function (groups) {
        var out = {};
        return direct.concat([].concat.apply([], groups)).filter(function (r) {
          if (!r || !r.url || out[r.url]) return false;
          out[r.url] = true;
          return true;
        });
      });
    })
    .catch(function () {
      return [];
    });
}
