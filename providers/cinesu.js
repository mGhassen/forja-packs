var SPECS = {
  vParam: '_v=34403446',
  nD: '4860ac8bfddb',
  aD: '224eff10e662e9635c9f671cf46351dcd69af42b1edd56f5e5fa21751f44b9c8',
  referer: 'https://cine.su/',
  origin: 'https://cine.su',
};

var LS = [17, 91, 203, 44, 8, 177, 62, 239, 119, 3, 154, 81, 28, 210, 101, 7];
var WA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var tmdbId = parseInt(String(ctx.tmdbId || ''), 10);
  if (!isFinite(tmdbId) || tmdbId <= 0) return Promise.resolve([]);

  var isTv = ctx.type === 'tv' || ctx.type === 'series';
  var season = isTv ? ctx.season || 1 : null;
  var episode = isTv ? ctx.episode || 1 : null;
  var nD = cfg.nD || SPECS.nD;
  var aD = cfg.aD || SPECS.aD;
  var vParam = cfg.vParam || SPECS.vParam;

  function ab(e) {
    var t = e >>> 0;
    t ^= t >>> 16;
    t = Math.imul(t, 2146121005) >>> 0;
    t ^= t >>> 15;
    t = Math.imul(t, 2221713035) >>> 0;
    return (t ^ (t >>> 16)) >>> 0;
  }

  function sD(e) {
    var t = aD;
    var r = e + 17;
    if (r < 32) r = 32;
    if (r > 128) r = 128;
    var n = new Uint8Array(r);
    var a = 2166136261;
    for (var s = 0; s < r; s++) {
      a ^= t.charCodeAt(s % t.length);
      a = ab((a + LS[s % LS.length] + Math.imul(2654435761, s)) >>> 0);
      n[s] = a & 255;
    }
    return n;
  }

  function iD(e) {
    var t = '';
    for (var r = 0; r < e.length; r += 3) {
      var n = e[r];
      var a = r + 1 < e.length ? e[r + 1] : null;
      var s = r + 2 < e.length ? e[r + 2] : null;
      t += WA[n >> 2];
      t += WA[((3 & n) << 4) | ((a == null ? 0 : a) >> 4)];
      if (a == null) break;
      t += WA[((15 & a) << 2) | ((s == null ? 0 : s) >> 6)];
      if (s == null) break;
      t += WA[63 & s];
    }
    return t;
  }

  function generateDirectHlsUrl(id, s, e) {
    var tv = s != null && e != null;
    var seas = tv ? s : 0;
    var ep = tv ? e : 0;
    var str = nD + ':' + (tv ? 's' : 'm') + ':' + id + ':' + seas + ':' + ep;
    var a = [];
    for (var i = 0; i < str.length; i++) a.push(str.charCodeAt(i));
    var sArr = sD(a.length);
    var buf = new Uint8Array(a.length + 2);
    buf[0] = a.length & 255;
    buf[1] = (a.length >> 8) & 255;
    var o = (2654435769 ^ a.length) >>> 0;
    for (var l = 0; l < a.length; l++) {
      o = ab((o + sArr[l % sArr.length] + LS[l % LS.length] + l) >>> 0);
      buf[l + 2] = (a[l] ^ (255 & o)) ^ sArr[(7 * l + 3) % sArr.length];
    }
    return 'https://glendale-plumbing.com/c/v1/' + iD(buf) + '/master.m3u8';
  }

  var streamUrl = generateDirectHlsUrl(tmdbId, season, episode);
  return Promise.resolve([
    {
      url: streamUrl,
      name: 'CineSu · Direct Master · 1080p',
      quality: '1080p',
      headers: {
        'User-Agent': ua,
        Referer: cfg.referer || SPECS.referer,
        Origin: cfg.origin || SPECS.origin,
      },
    },
  ]);
}
