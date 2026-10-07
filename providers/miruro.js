var SPECS = {
  bases: [
    'https://www.miruro.to',
    'https://www.miruro.tv',
    'https://www.miruro.bz',
    'https://www.miruro.ru',
    'https://www.miruro.cx',
  ],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var bases = (Array.isArray(cfg.bases) ? cfg.bases : []).map(function (b) {
    return String(b).replace(/\/$/, '');
  });
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var isEpisodic = ctx.type !== 'movie';
  var epNum = isEpisodic
    ? Number(ctx.mappedEpisode || ctx.episode || 1) || 1
    : 1;
  var http =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : ctx.fetch.bind(ctx);
  var CATALOG_XOR = 'miruro/catalog';

  function hdrs(base) {
    return {
      'User-Agent': ua,
      Referer: base + '/',
      Origin: base,
      Accept: 'application/json, application/octet-stream, */*',
    };
  }

  function bytesFromRes(r) {
    if (r && typeof r.arrayBuffer === 'function') {
      return r.arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    }
    return r.text().then(function (t) {
      var s = String(t || '');
      var out = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
      return out;
    });
  }

  function xorCatalog(bytes) {
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ CATALOG_XOR.charCodeAt(i % CATALOG_XOR.length);
    }
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    var step = 0x8000;
    for (var i = 0; i < bytes.length; i += step) {
      var end = i + step < bytes.length ? i + step : bytes.length;
      var chunk = [];
      for (var j = i; j < end; j++) chunk.push(bytes[j]);
      s += String.fromCharCode.apply(null, chunk);
    }
    return btoa(s);
  }

  function decodeCatalog(bytes) {
    if (!bytes || !bytes.length) return null;
    if (bytes[0] === 0x7b) {
      try {
        var raw = '';
        for (var i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
        return JSON.parse(raw);
      } catch (e) {}
    }
    var xored = xorCatalog(bytes);
    if (ctx.crypto && ctx.crypto.decodePipe) {
      var decoded = ctx.crypto.decodePipe(bytesToB64(xored), '');
      if (decoded) return decoded;
    }
    return null;
  }

  function catalogGet(base, pathAndQuery) {
    var url = base + '/api/' + String(pathAndQuery).replace(/^\//, '');
    return http(url, { headers: hdrs(base) })
      .then(function (r) {
        if (!r.ok) return null;
        var ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '').toLowerCase();
        if (ct.indexOf('json') >= 0 && ct.indexOf('octet-stream') < 0) {
          return r.json().catch(function () {
            return null;
          });
        }
        return bytesFromRes(r).then(function (bytes) {
          return decodeCatalog(bytes);
        });
      })
      .catch(function () {
        return null;
      });
  }

  function catalogAny(pathAndQuery) {
    var chain = Promise.resolve(null);
    bases.forEach(function (base) {
      chain = chain.then(function (found) {
        if (found) return found;
        return catalogGet(base, pathAndQuery).then(function (data) {
          if (data) data._base = base;
          return data;
        });
      });
    });
    return chain;
  }

  function anilistId() {
    if (ctx.anilistId) return Number(ctx.anilistId) || 0;
    var fromHost = globalThis.__engineCtxAnilist && globalThis.__engineCtxAnilist(ctx);
    return fromHost ? Number(fromHost) || 0 : 0;
  }

  function malId() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost && fromHost.mal) return Number(fromHost.mal) || 0;
    if (ctx.malId) return Number(ctx.malId) || 0;
    return 0;
  }

  function titleOf(item) {
    var t = item && item.title;
    if (!t) return '';
    if (typeof t === 'string') return t;
    return t.english || t.romaji || t.native || '';
  }

  function lookupAnime() {
    var al = anilistId();
    var mal = malId();
    var q = String(ctx.title || '').trim();
    var first = al
      ? catalogAny('v1/anime?anilist_id_in=' + encodeURIComponent(String(al)) + '&limit=100')
      : mal
        ? catalogAny('v1/anime?mal_id_in=' + encodeURIComponent(String(mal)) + '&limit=100')
        : q
          ? catalogAny(
              'v1/anime?q=' +
                encodeURIComponent(q) +
                '&limit=8&sort=' +
                encodeURIComponent('-popularity'),
            )
          : Promise.resolve(null);
    return first.then(function (data) {
      var rows = data && Array.isArray(data.data) ? data.data : [];
      if (!rows.length) return null;
      var hit = rows[0];
      if (q) {
        var needle = q.toLowerCase();
        var scored = rows
          .map(function (row) {
            var t = titleOf(row).toLowerCase();
            var n = t === needle ? 100 : t.indexOf(needle) >= 0 || needle.indexOf(t) >= 0 ? 80 : 0;
            return { row: row, n: n };
          })
          .sort(function (a, b) {
            return b.n - a.n;
          });
        if (scored[0] && scored[0].n > 0) hit = scored[0].row;
      }
      if (!hit || !hit.id) return null;
      hit._base = data._base;
      return hit;
    });
  }

  function wantedTracks() {
    var cats =
      (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
      ['sub', 'dub'];
    var out = {};
    cats.forEach(function (c) {
      out[String(c).toLowerCase()] = true;
    });
    if (out.sub) out.ssub = true;
    return out;
  }

  function cap(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // Host reads "[Server]" as the row's server chip — same names as the site.
  function serverLabel(pname, sname) {
    var p = cap(pname);
    var s = String(sname || '').trim();
    if (!s || /^(hls|mp4|dash|file|default|main|src|stream)$/i.test(s)) return p;
    if (s.toLowerCase() === p.toLowerCase()) return p;
    return p + ' ' + cap(s);
  }

  function flattenPlay(play, base) {
    var tracks = play && Array.isArray(play.tracks) ? play.tracks : [];
    var want = wantedTracks();
    var out = [];
    var seen = {};
    tracks.forEach(function (track) {
      var cat = String((track && track.track) || '').toLowerCase();
      if (!want[cat]) return;
      var lang = cat === 'dub' ? 'Dub' : 'Sub';
      var providers = (track && track.providers) || [];
      providers.forEach(function (prov) {
        var pname = String((prov && (prov.provider || prov.name)) || 'src');
        ((prov && prov.servers) || []).forEach(function (server) {
          var sname = String((server && (server.server || server.name)) || 'HLS');
          var sh = (server && server.headers) || {};
          var referer = String(sh.Referer || sh.referer || sh.Origin || sh.origin || '') || base + '/';
          var origin = String(sh.Origin || sh.origin || '');
          ((server && server.streams) || []).forEach(function (stream) {
            if (!stream) return;
            var t = String(stream.format || stream.type || '').toLowerCase();
            if (t === 'iframe' || t === 'embed' || t === 'html' || t === 'player') return;
            var u = String(stream.url || stream.file || '');
            if (!/^https?:/i.test(u)) return;
            if (t && t !== 'hls' && t !== 'file' && t !== 'mp4' && t !== 'dash') {
              if (!/\.m3u8|\.mp4|\/hls|master\.m3u8/i.test(u)) return;
            }
            if (seen[u]) return;
            seen[u] = true;
            var headers = { 'User-Agent': ua, Referer: referer };
            if (origin) headers.Origin = origin;
            out.push({
              url: u,
              name: 'Miruro [' + serverLabel(pname, sname) + '] (' + cat.toUpperCase() + ')',
              language: lang,
              headers: headers,
            });
          });
        });
      });
    });
    return out;
  }

  return lookupAnime()
    .then(function (anime) {
      if (!anime || !anime.id) return [];
      var base = anime._base || bases[0];
      return catalogGet(
        base,
        'v1/anime/' + encodeURIComponent(anime.id) + '/episodes/' + encodeURIComponent(String(epNum)) + '/play',
      ).then(function (play) {
        if (!play) return [];
        return flattenPlay(play, base);
      });
    })
    .catch(function () {
      return [];
    });
}
