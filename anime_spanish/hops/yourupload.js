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
      name: extra.name || cfg.name || 'YourUpload',
      quality: extra.quality || '',
      headers: extra.headers || { 'User-Agent': ua, Referer: extra.referer || url },
    };
  }
  function cf(html) {
    return /just a moment|cf-challenge|challenge-platform/i.test(String(html || ''));
  }

  return ctx
    .fetch(url, { headers: headers })
    .then(function (r) {
      return r.text();
    })
    .then(function (html) {
      if (cf(html) || /File was deleted|File Not Found|404/i.test(html)) return [];
      var unpacked = (globalThis.__engineUnpack && globalThis.__engineUnpack(html)) || html;
      var src =
        (unpacked.match(/file:\s*["'](https?:[^"']+\.mp4[^"']*)["']/) ||
          html.match(/og:video["'\s]+content=["'](https?:[^"']+)["']/i) ||
          html.match(/(https?:\/\/[^"'\s]*vidcache\.net[^"'\s]*\/video\.mp4[^"'\s]*)/i) ||
          html.match(/(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/i) ||
          [])[1];
      return src ? [row(src, { referer: url })] : [];
    })
    .catch(function () {
      return [];
    });
}
