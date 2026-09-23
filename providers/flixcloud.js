var SPECS = {
  origin: 'https://flixcloud.cc',
  enc: 'https://enc-dec.app/api',
  name: 'FlixCloud',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = cfg.origin;
  var enc = cfg.enc;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Referer: origin + '/' };
  var plainFetch = ctx.fetch.bind(ctx);
  var chromeFetch =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : null;

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  function pageUrl() {
    var page = (ctx.url || '').trim();
    if (!page || !/flixcloud\./i.test(page)) return '';
    return page;
  }

  function extractDataBlock(html) {
    if (!html) return null;
    if (
      /Just a moment|challenge-platform|Performing security verification|cf-browser-verification/i.test(
        html,
      )
    ) {
      return { error: 'cloudflare' };
    }
    var marker = html.search(/type:\s*"data"\s*,\s*data:\s*\{/);
    if (marker < 0) marker = html.search(/type:\s*'data'\s*,\s*data:\s*\{/);
    if (marker < 0) return { error: 'missing' };
    var start = html.indexOf('{', html.indexOf('data:', marker));
    if (start < 0) return { error: 'missing' };
    var depth = 0;
    var inStr = false;
    var quote = '';
    var esc = false;
    for (var i = start; i < html.length; i++) {
      var ch = html.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === quote) inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = true;
        quote = ch;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          var raw = html.slice(start, i + 1);
          try {
            return { data: new Function('return (' + raw + ')')() };
          } catch (e) {
            return { error: 'parse' };
          }
        }
      }
    }
    return { error: 'missing' };
  }

  function playableUrl(resolved, tokenContext) {
    var stream = resolved && resolved.stream;
    if (!stream) return '';
    var ctxObj = (resolved && resolved.context) || tokenContext || {};
    var wPayload = typeof ctxObj.w_payload === 'string' ? ctxObj.w_payload : '';
    // CDN master is AES-wrapped; players need enc-dec parse-flixcloud.
    if (!wPayload) return stream;
    return (
      enc +
      '/parse-flixcloud?url=' +
      encodeURIComponent(stream) +
      '&w_payload=' +
      encodeURIComponent(wPayload)
    );
  }

  function subtitleRows(list) {
    if (!Array.isArray(list) || !list.length) return undefined;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s) continue;
      var url = typeof s === 'string' ? s : s.url || s.file || s.src || '';
      if (!/^https?:\/\//i.test(url)) continue;
      out.push({
        url: url,
        language: (s.language || s.lang || s.label || '').toString(),
      });
    }
    return out.length ? out : undefined;
  }

  function fetchHtml(page) {
    function one(http) {
      return http(page, { headers: headers }).then(function (r) {
        return r.text();
      });
    }
    // Prefer Chrome TLS fingerprint; fall back to plain fetch if no data.
    var first = chromeFetch ? one(chromeFetch) : one(plainFetch);
    return first.then(function (html) {
      var block = extractDataBlock(html);
      if (block && block.data) return html;
      if (!chromeFetch) return html;
      ctx.log('flixcloud: chrome page miss, retry plain fetch');
      return one(plainFetch);
    });
  }

  var page = pageUrl();
  if (!page) {
    ctx.error('flixcloud: embed url required (hop-only; use ReAnime)');
    return [];
  }

  var http = chromeFetch || plainFetch;

  return fetchHtml(page)
    .then(function (html) {
      var block = extractDataBlock(html);
      if (!block || !block.data) {
        ctx.error(
          'flixcloud: page data ' +
            ((block && block.error) || 'missing') +
            ' (len=' +
            (html ? html.length : 0) +
            ')',
        );
        return [];
      }
      var data = block.data;
      var subs = subtitleRows(data.subtitles);
      delete data.subtitles;
      return http(enc + '/dec-flixcloud?type=token', {
        method: 'POST',
        headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: data }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (j) {
          var token = validate(j);
          if (!token || !token.token) {
            ctx.error('flixcloud: enc-dec token failed');
            return [];
          }
          return http(origin + '/api/m3u8/' + token.token, { headers: headers })
            .then(function (r) {
              return r.json();
            })
            .then(function (streamResponse) {
              if (!streamResponse || streamResponse.error) {
                ctx.error(
                  'flixcloud: m3u8 ' +
                    (streamResponse && streamResponse.error
                      ? streamResponse.error
                      : 'empty'),
                );
                return [];
              }
              return http(enc + '/dec-flixcloud?type=stream', {
                method: 'POST',
                headers: Object.assign({}, headers, {
                  'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                  data: {
                    context: token.context,
                    stream_response: streamResponse,
                  },
                }),
              })
                .then(function (r) {
                  return r.json();
                })
                .then(function (sj) {
                  var resolved = validate(sj);
                  var stream = playableUrl(resolved, token.context);
                  if (!stream) {
                    ctx.error('flixcloud: stream decrypt empty');
                    return [];
                  }
                  var row = {
                    url: stream,
                    name: cfg.name || 'FlixCloud',
                    headers: { 'User-Agent': ua, Referer: origin + '/' },
                  };
                  if (subs) row.subtitles = subs;
                  ctx.log('flixcloud: ok ' + stream.slice(0, 80));
                  return [row];
                });
            });
        });
    })
    .catch(function (e) {
      ctx.error(e && e.message ? e.message : e);
      return [];
    });
}
