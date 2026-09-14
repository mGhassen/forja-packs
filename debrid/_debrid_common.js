// Shared helpers for kind:debrid plugins.

function debridSleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function debridBasename(path) {
  var p = String(path || '');
  var parts = p.split(/[/\\]/);
  return parts[parts.length - 1] || p || 'video';
}

function debridIsVideoPath(path) {
  return /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|m2ts|mpg|mpeg)(\?|$)/i.test(
    String(path || ''),
  );
}

function debridPickFileIndex(files, season, episode) {
  var list = Array.isArray(files) ? files : [];
  if (!list.length) return -1;
  var s = season == null ? 0 : Number(season);
  var e = episode == null ? 0 : Number(episode);
  if (s > 0 && e > 0) {
    var re = new RegExp(
      '[Ss]' +
        String(s).padStart(2, '0') +
        '[Ee]' +
        String(e).padStart(2, '0') +
        '|[Ss]' +
        s +
        '[Ee]' +
        e +
        '|\\b' +
        s +
        'x' +
        String(e).padStart(2, '0') +
        '\\b',
      'i',
    );
    for (var i = 0; i < list.length; i++) {
      var path = String(list[i].path || list[i].name || '');
      if (debridIsVideoPath(path) && re.test(path)) return i;
    }
  }
  var best = -1;
  var bestSize = -1;
  for (var j = 0; j < list.length; j++) {
    var p2 = String(list[j].path || list[j].name || '');
    if (!debridIsVideoPath(p2) && list.length > 1) continue;
    var sz = Number(list[j].size || 0);
    if (sz >= bestSize) {
      bestSize = sz;
      best = j;
    }
  }
  if (best >= 0) return best;
  return 0;
}

function debridApiKey(ctx) {
  var cfg = (ctx && ctx.config) || {};
  return String(cfg.apiKey || cfg.api_key || '').trim();
}

function debridMagnet(ctx) {
  return String(
    (ctx && (ctx.magnet || (ctx.params && ctx.params.magnet))) || '',
  ).trim();
}

function debridSeason(ctx) {
  var v = ctx && (ctx.season != null ? ctx.season : ctx.params && ctx.params.season);
  var n = Number(v);
  return n > 0 ? n : null;
}

function debridEpisode(ctx) {
  var v =
    ctx && (ctx.episode != null ? ctx.episode : ctx.params && ctx.params.episode);
  var n = Number(v);
  return n > 0 ? n : null;
}

function debridForm(pairs) {
  var out = [];
  for (var i = 0; i < pairs.length; i++) {
    out.push(
      encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]),
    );
  }
  return out.join('&');
}

async function debridFetch(ctx, url, opts) {
  opts = opts || {};
  var headers = Object.assign({}, opts.headers || {});
  var method = String(opts.method || 'GET').toUpperCase();
  var body = opts.body;
  if (body && typeof body === 'object' && !(typeof body === 'string')) {
    body = debridForm(
      Object.keys(body).map(function (k) {
        return [k, body[k]];
      }),
    );
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  var res = await ctx.fetch(url, {
    method: method,
    headers: headers,
    body: body,
  });
  return res;
}

async function debridJson(ctx, url, opts) {
  var res = await debridFetch(ctx, url, opts);
  var text = '';
  try {
    text = await res.text();
  } catch (_) {
    text = '';
  }
  var data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = null;
  }
  return { ok: !!res.ok, status: res.status, data: data, text: text };
}

function debridRowFromUrl(url, name, size) {
  var row = { url: String(url || '').trim(), name: String(name || 'video') };
  if (size != null && Number(size) > 0) row.size = Number(size);
  return [row];
}
