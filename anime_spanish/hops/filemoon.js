function extract(ctx) {
  var url = String((ctx && ctx.url) || '');
  if (!url) return Promise.resolve([]);
  var cfg = ctx.config || {};
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Referer: url, Accept: 'text/html,application/xhtml+xml' };
  function row(u, extra) {
    extra = extra || {};
    return {
      url: u,
      name: extra.name || cfg.name || '',
      quality: extra.quality || '',
      headers: extra.headers || { 'User-Agent': ua, Referer: extra.referer || url },
    };
  }
  function cf(html) {
    return /just a moment|cf-challenge|challenge-platform/i.test(String(html || ''));
  }
  function abs(u, base) {
    if (!u) return '';
    if (/^https?:/i.test(u)) return u;
    try {
      return new URL(u, base).toString();
    } catch (e) {
      return u;
    }
  }

  function codeOf(u) {
    var m = String(u || '').match(/\/(?:e|d|v|f)\/([A-Za-z0-9]+)/i);
    return m ? m[1] : '';
  }

  function originOf(u) {
    try {
      return new URL(u).origin;
    } catch (e) {
      return '';
    }
  }

  function rewriteCdn(play) {
    var u = String(play || '');
    if (!u) return u;
    return u.replace(
      /^https?:\/\/(?:edge\d+-[a-z0-9-]+-)?sprintcdn\.r66nv9ed\.com\//i,
      'https://edge1-moscow-sprintcdn.owphbf24.com/',
    );
  }

  // Byse / Filemoon SPA: GET /api/videos/{code}/ → AES-256-GCM playback blob.
  function decryptPlayback(pb) {
    var CryptoJS = (ctx && ctx.crypto) || globalThis.CryptoJS;
    if (!CryptoJS || !pb || !Array.isArray(pb.key_parts) || !pb.key_parts.length) return null;
    try {
      function b64urlParse(s) {
        return CryptoJS.enc.Base64.parse(
          String(s || '')
            .replace(/-/g, '+')
            .replace(/_/g, '/'),
        );
      }
      var ver = parseInt(String(pb.version || '').trim(), 10);
      var parts = pb.key_parts;
      var selected = parts;
      if (ver === ver && ver >= 1 && ver <= 20) {
        var a = ver;
        var b = 31 - ver;
        if (a >= 1 && b >= 1 && a <= parts.length && b <= parts.length) {
          selected = [parts[a - 1], parts[b - 1]];
        }
      }
      var keyHex = selected
        .filter(function (p) {
          return typeof p === 'string' && p;
        })
        .map(function (p) {
          return CryptoJS.enc.Hex.stringify(b64urlParse(p));
        })
        .join('');
      if (!keyHex) return null;
      var iv = b64urlParse(pb.iv);
      var ct = b64urlParse(pb.payload);
      var pt = CryptoJS.AES.decrypt(
        { ciphertext: ct },
        CryptoJS.enc.Hex.parse(keyHex),
        { iv: iv, mode: CryptoJS.mode.GCM },
      );
      var text = CryptoJS.enc.Utf8.stringify(pt);
      return text ? JSON.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  function fromApi() {
    var code = codeOf(url);
    var origin = originOf(url);
    if (!code || !origin) return Promise.resolve([]);
    var api = origin + '/api/videos/' + encodeURIComponent(code) + '/';
    return ctx
      .fetch(api, {
        headers: {
          'User-Agent': ua,
          Accept: 'application/json',
          Referer: url,
        },
      })
      .then(function (r) {
        if (!r || !r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.playback) return [];
        var decoded = decryptPlayback(data.playback);
        if (!decoded || !Array.isArray(decoded.sources)) return [];
        return decoded.sources
          .map(function (s) {
            var play = rewriteCdn(s && s.url ? String(s.url) : '');
            if (!/^https?:\/\//i.test(play)) return null;
            return row(play, {
              name: 'Filemoon',
              quality: s.label || s.quality || '',
              referer: origin + '/',
            });
          })
          .filter(Boolean);
      })
      .catch(function () {
        return [];
      });
  }

  function fromHtml() {
    return ctx
      .fetch(url, { headers: headers })
      .then(function (r) {
        return r.text();
      })
      .then(function (html) {
        if (cf(html) || /Page not found/i.test(html)) return [];
        // SPA shell — no scrapeable player; API path already tried.
        if (/Byse Frontend|videoPagesBundle|id="root"/i.test(html)) return [];
        var iframes = [];
        String(html).replace(/iframe[^>]*src=["']([^"']+)["']/gi, function (_, s) {
          iframes.push(s);
          return _;
        });
        if (iframes.length) {
          var next = abs(iframes[iframes.length - 1], url);
          return ctx.hop(next);
        }
        var unpacked = (globalThis.__engineUnpack && globalThis.__engineUnpack(html)) || html;
        var file =
          (unpacked.match(/file:\s*["'](https?:[^"']+)["']/) ||
            unpacked.match(/src:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/) ||
            [])[1];
        return file ? [row(file, { name: 'Filemoon' })] : [];
      })
      .catch(function () {
        return [];
      });
  }

  return fromApi().then(function (rows) {
    if (rows && rows.length) return rows;
    return fromHtml();
  });
}
