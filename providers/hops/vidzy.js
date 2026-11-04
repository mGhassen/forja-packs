// Vidzy / fsvid-style JW embed: sources:[{src:"…m3u8"}] on the page.
function extract(ctx) {
  var url = String((ctx && ctx.url) || '');
  if (!url) return Promise.resolve([]);
  var cfg = ctx.config || {};
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var chromeFetch =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : null;
  var http = chromeFetch || ctx.fetch.bind(ctx);
  var headers = {
    'User-Agent': ua,
    Referer: url,
    Accept: 'text/html,application/xhtml+xml',
  };

  function row(u, extra) {
    extra = extra || {};
    var origin = '';
    try {
      origin = new URL(url).origin + '/';
    } catch (e) {}
    return {
      url: u,
      name: extra.name || cfg.name || 'Vidzy',
      quality: extra.quality || '',
      headers: extra.headers || { 'User-Agent': ua, Referer: origin || url },
    };
  }
  function cf(html) {
    return /just a moment|cf-challenge|challenge-platform/i.test(String(html || ''));
  }

  return http(url, { headers: headers, redirect: 'follow' })
    .then(function (r) {
      return r.text();
    })
    .then(function (html) {
      html = String(html || '');
      if (cf(html) || /403 Forbidden|File Not Found/i.test(html)) return [];
      var src =
        (html.match(/sources:\s*\[\s*\{\s*src:\s*["'](https?:[^"']+)["']/) ||
          html.match(/file:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/) ||
          html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/) ||
          [])[1] ||
        '';
      if (!src || /troll\/master\.m3u8/i.test(src)) return [];
      var q = (html.match(/\b(2160|1080|720|480|360)p\b/i) || [])[0] || '';
      return [row(src, { name: 'Vidzy', quality: q })];
    })
    .catch(function () {
      return [];
    });
}
