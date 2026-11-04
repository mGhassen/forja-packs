// Byse (bysebuho / kaydendown / n1mwq…): GET /api/videos/{id}/ → AES-256-GCM playback.
function extract(ctx) {
  var url = String((ctx && ctx.url) || '');
  if (!url) return Promise.resolve([]);
  var cfg = ctx.config || {};
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var C = ctx.crypto || globalThis.CryptoJS;
  if (!C || !C.AES || !C.enc) return Promise.resolve([]);

  var id = '';
  var m =
    url.match(/\/(?:e|d|embed|v|sh\d*)\/([A-Za-z0-9]+)/i) ||
    url.match(/[?&](?:v|id|file_code)=([A-Za-z0-9]+)/i);
  if (m) id = m[1];
  if (!id) return Promise.resolve([]);

  var origin = '';
  try {
    origin = new URL(url).origin;
  } catch (e) {
    return Promise.resolve([]);
  }

  function b64url(s) {
    var t = String(s || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return C.enc.Base64.parse(t);
  }

  function row(u, extra) {
    extra = extra || {};
    return {
      url: u,
      name: extra.name || cfg.name || 'Byse',
      quality: extra.quality || '',
      headers: extra.headers || { 'User-Agent': ua, Referer: origin + '/' },
    };
  }

  return ctx
    .fetch(origin + '/api/videos/' + encodeURIComponent(id) + '/', {
      headers: { 'User-Agent': ua, Accept: 'application/json', Referer: url },
    })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (meta) {
      var pb = meta && meta.playback;
      var parts = pb && Array.isArray(pb.key_parts) ? pb.key_parts : [];
      if (!pb || !parts.length || !pb.iv || !pb.payload) return [];

      var ver = parseInt(String(pb.version || '').trim(), 10);
      if (!Number.isFinite(ver) || ver < 1 || ver > 30) return [];
      var a = ver;
      var b = 31 - ver;
      if (a < 1 || b < 1 || a > parts.length || b > parts.length) return [];
      var selected = [parts[a - 1], parts[b - 1]].filter(function (p) {
        return typeof p === 'string' && p.length > 0;
      });
      if (selected.length < 2) return [];

      var key = b64url(selected[0]).concat(b64url(selected[1]));
      if (!key || (key.sigBytes !== 16 && key.sigBytes !== 32)) return [];

      var plain = C.AES.decrypt(
        { ciphertext: b64url(pb.payload) },
        key,
        { iv: b64url(pb.iv), mode: C.mode.GCM, padding: C.pad.NoPadding },
      );
      var text = C.enc.Utf8.stringify(plain);
      if (!text) return [];
      var json = JSON.parse(text);
      var sources = json && Array.isArray(json.sources) ? json.sources : [];
      return sources
        .map(function (s) {
          var u = s && s.url ? String(s.url) : '';
          if (!/^https?:\/\//i.test(u)) return null;
          var q = String(s.label || s.quality || '').replace(/^x$/i, '');
          if (!q && s.height) q = String(s.height) + 'p';
          return row(u, { name: 'Byse', quality: q });
        })
        .filter(Boolean);
    })
    .catch(function () {
      return [];
    });
}
