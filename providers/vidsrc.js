var SPECS = {
  "api": "https://data.vidsrc.sh/api.php",
  "origin": "https://vidsrc.sh",
  "wasmProxy": "https://api.allorigins.win/get?disableCache=true&url="
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = cfg.api;
  var site = String(cfg.origin || '').replace(/\/$/, '');
  var wasmProxy = cfg.wasmProxy || '';
  if (!api || !site) return Promise.resolve([]);
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var isMovie = ctx.type === 'movie';
  var tmdb = ctx.tmdbId != null ? String(ctx.tmdbId).trim() : '';
  var imdb = ctx.imdbId != null ? String(ctx.imdbId).trim() : '';
  if (!tmdb && !imdb) return Promise.resolve([]);
  var season = ctx.season || 1;
  var episode = ctx.episode || 1;
  var idQuery = tmdb
    ? 'tmdb=' + encodeURIComponent(tmdb)
    : 'imdb=' + encodeURIComponent(imdb);
  var apiUrl =
    api +
    '?type=' +
    (isMovie ? 'movie' : 'tv') +
    '&' +
    idQuery +
    '&stream_urls';
  if (!isMovie) apiUrl += '&season=' + season + '&episode=' + episode;

  var headers = {
    'User-Agent': ua,
    Accept: 'application/json, text/plain, */*',
    Referer: site + '/',
    Origin: site,
  };

  function u32(n) {
    return n >>> 0;
  }

  function readUleb(bytes, p) {
    var n = 0;
    var shift = 0;
    var b = 0;
    do {
      if (p >= bytes.length || shift > 28) return null;
      b = bytes[p++];
      n |= (b & 0x7f) << shift;
      shift += 7;
    } while (b >= 128);
    return { n: u32(n), p: p };
  }

  function readSleb(bytes, p) {
    var n = 0;
    var shift = 0;
    var b = 0;
    do {
      if (p >= bytes.length || shift > 28) return null;
      b = bytes[p++];
      n |= (b & 0x7f) << shift;
      shift += 7;
    } while (b >= 128);
    if (shift < 32 && b & 0x40) n |= ~0 << shift;
    return { n: n | 0, p: p };
  }

  function bytesFromB64(s) {
    var bin = atob(String(s || '').replace(/\s/g, ''));
    var out = new Uint8Array(bin.length);
    var i;
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  function isWasm(bytes) {
    return (
      bytes &&
      bytes.length > 8 &&
      bytes[0] === 0 &&
      bytes[1] === 0x61 &&
      bytes[2] === 0x73 &&
      bytes[3] === 0x6d
    );
  }

  function readU32(mem, off) {
    if (!mem || off < 0 || off + 4 > mem.length) return null;
    return u32(
      mem[off] | (mem[off + 1] << 8) | (mem[off + 2] << 16) | (mem[off + 3] << 24),
    );
  }

  function sectionMap(bytes) {
    if (!isWasm(bytes)) return null;
    var p = 8;
    var map = {};
    while (p < bytes.length) {
      var id = bytes[p++];
      var sz = readUleb(bytes, p);
      if (!sz) return null;
      p = sz.p;
      map[id] = bytes.subarray(p, p + sz.n);
      p += sz.n;
    }
    return map;
  }

  function dataMemory(section) {
    if (!section) return null;
    var count = readUleb(section, 0);
    if (!count) return null;
    var p = count.p;
    var mem = new Uint8Array(4096);
    var si;
    for (si = 0; si < count.n; si++) {
      if (p >= section.length) return null;
      var flags = section[p++];
      var off = 0;
      if (flags === 2) {
        var memIdx = readUleb(section, p);
        if (!memIdx) return null;
        p = memIdx.p;
      }
      if (flags === 0 || flags === 2) {
        if (section[p] !== 0x41) return null;
        p++;
        var o = readSleb(section, p);
        if (!o) return null;
        p = o.p;
        if (section[p++] !== 0x0b) return null;
        off = o.n >>> 0;
      } else if (flags !== 1) {
        return null;
      }
      var ln = readUleb(section, p);
      if (!ln) return null;
      p = ln.p;
      if (flags !== 1) {
        var end = off + ln.n;
        if (end > 262144) return null;
        if (end > mem.length) {
          var grown = new Uint8Array(end);
          grown.set(mem);
          mem = grown;
        }
        mem.set(section.subarray(p, p + ln.n), off);
      }
      p += ln.n;
    }
    return mem;
  }

  function skipBlockType(bytes, p) {
    var b = bytes[p];
    if (b === 0x40 || b === 0x7f || b === 0x7e || b === 0x7d || b === 0x7c) return p + 1;
    var s = readSleb(bytes, p);
    return s ? s.p : -1;
  }

  function keyPairs(section) {
    if (!section) return null;
    var count = readUleb(section, 0);
    if (!count) return null;
    var p = count.p;
    var fi;
    for (fi = 0; fi < count.n; fi++) {
      var sz = readUleb(section, p);
      if (!sz) return null;
      p = sz.p;
      var body = section.subarray(p, p + sz.n);
      p += sz.n;
      var pairs = pairsIn(body);
      if (pairs && pairs.length >= 8) return pairs.slice(0, 8);
    }
    return null;
  }

  function pairsIn(body) {
    var q = 0;
    var groups = readUleb(body, q);
    if (!groups) return null;
    q = groups.p;
    var g;
    for (g = 0; g < groups.n; g++) {
      var n = readUleb(body, q);
      if (!n) return null;
      q = n.p + 1;
    }
    var seen = false;
    var pairs = [];
    var recent = [];
    while (q < body.length) {
      var op = body[q++];
      var imm = null;
      var extra = 0;
      if (op === 0x02 || op === 0x03 || op === 0x04) {
        q = skipBlockType(body, q);
        if (q < 0) return null;
      } else if (op === 0x0c || op === 0x0d || op === 0x10) {
        var br = readUleb(body, q);
        if (!br) return null;
        q = br.p;
        imm = br.n;
      } else if (op === 0x0e) {
        var nt = readUleb(body, q);
        if (!nt) return null;
        q = nt.p;
        var ti;
        for (ti = 0; ti < nt.n; ti++) {
          var lab = readUleb(body, q);
          if (!lab) return null;
          q = lab.p;
        }
        var def = readUleb(body, q);
        if (!def) return null;
        q = def.p;
      } else if (op === 0x11) {
        var ty = readUleb(body, q);
        if (!ty) return null;
        var tb = readUleb(body, ty.p);
        if (!tb) return null;
        q = tb.p;
      } else if (op >= 0x20 && op <= 0x24) {
        var loc = readUleb(body, q);
        if (!loc) return null;
        q = loc.p;
        imm = loc.n;
      } else if (op === 0x41) {
        var c = readSleb(body, q);
        if (!c) return null;
        q = c.p;
        imm = c.n;
        if ((imm >>> 0) === 1634760805) seen = true;
      } else if (op >= 0x28 && op <= 0x3e) {
        var al = readUleb(body, q);
        if (!al) return null;
        var of = readUleb(body, al.p);
        if (!of) return null;
        q = of.p;
        extra = of.n;
      } else if (op === 0x3f || op === 0x40) {
        q++;
      } else if (
        op === 0x0b ||
        op === 0x05 ||
        op === 0x0f ||
        op === 0x1a ||
        op === 0x1b ||
        (op >= 0x45 && op <= 0xc4)
      ) {
        // no immediate
      } else {
        return null;
      }
      recent.push({ op: op, imm: imm, extra: extra });
      if (recent.length > 5) recent.shift();
      if (seen && op === 0x73 && recent.length === 5) {
        var a = recent[0];
        var b = recent[1];
        var cnst = recent[2];
        var d = recent[3];
        if (a.op === 0x41 && b.op === 0x28 && cnst.op === 0x41 && d.op === 0x28) {
          pairs.push([(a.imm + b.extra) >>> 0, (cnst.imm + d.extra) >>> 0]);
          if (pairs.length >= 8) return pairs;
        }
      }
    }
    return seen ? pairs : null;
  }

  function keyFromWasm(bytes) {
    var secs = sectionMap(bytes);
    if (!secs) return null;
    var mem = dataMemory(secs[11]);
    var pairs = keyPairs(secs[10]);
    if (!mem || !pairs) return null;
    var key = new Uint8Array(32);
    var i;
    for (i = 0; i < 8; i++) {
      var left = readU32(mem, pairs[i][0]);
      var right = readU32(mem, pairs[i][1]);
      if (left == null || right == null) return null;
      var w = u32(left ^ right);
      key[i * 4] = w & 255;
      key[i * 4 + 1] = (w >>> 8) & 255;
      key[i * 4 + 2] = (w >>> 16) & 255;
      key[i * 4 + 3] = (w >>> 24) & 255;
    }
    return key;
  }

  function rotl(x, n) {
    x = u32(x);
    return u32((x << n) | (x >>> (32 - n)));
  }

  function quarter(s, a, b, c, d) {
    s[a] = u32(s[a] + s[b]);
    s[d] = rotl(u32(s[d] ^ s[a]), 16);
    s[c] = u32(s[c] + s[d]);
    s[b] = rotl(u32(s[b] ^ s[c]), 12);
    s[a] = u32(s[a] + s[b]);
    s[d] = rotl(u32(s[d] ^ s[a]), 8);
    s[c] = u32(s[c] + s[d]);
    s[b] = rotl(u32(s[b] ^ s[c]), 7);
  }

  function chachaBlock(key, nonce, counter) {
    var st = [
      0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
      readU32(key, 0),
      readU32(key, 4),
      readU32(key, 8),
      readU32(key, 12),
      readU32(key, 16),
      readU32(key, 20),
      readU32(key, 24),
      readU32(key, 28),
      u32(counter),
      readU32(nonce, 0),
      readU32(nonce, 4),
      u32(nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)),
    ];
    var w = st.slice();
    var i;
    for (i = 0; i < 10; i++) {
      quarter(w, 0, 4, 8, 12);
      quarter(w, 1, 5, 9, 13);
      quarter(w, 2, 6, 10, 14);
      quarter(w, 3, 7, 11, 15);
      quarter(w, 0, 5, 10, 15);
      quarter(w, 1, 6, 11, 12);
      quarter(w, 2, 7, 8, 13);
      quarter(w, 3, 4, 9, 14);
    }
    var out = new Uint8Array(64);
    for (i = 0; i < 16; i++) {
      var v = u32(w[i] + st[i]);
      out[i * 4] = v & 255;
      out[i * 4 + 1] = (v >>> 8) & 255;
      out[i * 4 + 2] = (v >>> 16) & 255;
      out[i * 4 + 3] = (v >>> 24) & 255;
    }
    return out;
  }

  function decryptUrls(enc, key) {
    if (!enc || enc.length <= 12 || !key) return [];
    var nonce = enc.subarray(0, 12);
    var ct = enc.subarray(12);
    var plain = new Uint8Array(ct.length);
    var done = 0;
    var counter = 0;
    while (done < ct.length) {
      var block = chachaBlock(key, nonce, counter++);
      var n = Math.min(64, ct.length - done);
      var i;
      for (i = 0; i < n; i++) plain[done + i] = ct[done + i] ^ block[i];
      done += n;
    }
    var text = '';
    for (var j = 0; j < plain.length; j++) text += String.fromCharCode(plain[j]);
    return text
      .split('\n')
      .map(function (line) {
        return line.trim();
      })
      .filter(function (line) {
        return /^https?:\/\//i.test(line);
      });
  }

  function textOf(res) {
    if (!res || !res.ok) return Promise.resolve('');
    return res.text().then(function (t) {
      return t || '';
    });
  }

  function wasmFromDirect(res) {
    if (!res || !res.ok) return Promise.resolve(null);
    if (typeof res.arrayBuffer === 'function') {
      return res
        .arrayBuffer()
        .then(function (buf) {
          var bytes = new Uint8Array(buf);
          return isWasm(bytes) ? bytes : null;
        })
        .catch(function () {
          return null;
        });
    }
    return textOf(res).then(function (t) {
      if (!t || t.charCodeAt(0) !== 0) return null;
      var i;
      for (i = 0; i < t.length; i++) if (t.charCodeAt(i) > 255) return null;
      var out = new Uint8Array(t.length);
      for (i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 255;
      return isWasm(out) ? out : null;
    });
  }

  function wasmFromProxy(url, attempt) {
    if (!wasmProxy) return Promise.resolve(null);
    return ctx
      .fetch(wasmProxy + encodeURIComponent(url), {
        headers: { 'User-Agent': ua, Accept: 'application/json' },
      })
      .then(function (r) {
        return r && r.ok ? r.json() : null;
      })
      .then(function (j) {
        var contents = j && j.contents != null ? String(j.contents) : '';
        var marker = 'base64,';
        var at = contents.indexOf(marker);
        if (at >= 0) contents = contents.slice(at + marker.length);
        contents = contents.replace(/\s/g, '');
        if (!contents || contents.indexOf('AGFzbQ') !== 0) {
          if ((attempt || 0) < 1) return wasmFromProxy(url, (attempt || 0) + 1);
          return null;
        }
        var bytes = bytesFromB64(contents);
        return isWasm(bytes) ? bytes : null;
      })
      .catch(function () {
        if ((attempt || 0) < 1) return wasmFromProxy(url, (attempt || 0) + 1);
        return null;
      });
  }

  function loadWasm(vs) {
    if (vs && vs.wasm) {
      try {
        var inline = bytesFromB64(vs.wasm);
        if (isWasm(inline)) return Promise.resolve(inline);
      } catch (e) {}
    }
    var url = vs && vs.wasm_url;
    if (!url) return Promise.resolve(null);
    return ctx
      .fetch(url, { headers: { 'User-Agent': ua, Accept: '*/*' } })
      .then(wasmFromDirect)
      .then(function (bytes) {
        return bytes || wasmFromProxy(url);
      });
  }

  function cleanToken(text) {
    var t = String(text || '').trim();
    if (!t || t.charAt(0) === '<' || t.length > 4096) return '';
    if (t.charAt(0) === '{' || t.charAt(0) === '[') {
      try {
        var j = JSON.parse(t);
        if (typeof j === 'string') t = j;
        else if (j && typeof j === 'object') t = String(j.token || j.data || j.result || '');
        else t = '';
      } catch (e) {
        return '';
      }
    }
    t = String(t || '').trim();
    if (!t || /\s/.test(t) || t.length < 8) return '';
    return t;
  }

  function originOf(url) {
    var m = String(url || '').match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : '';
  }

  function withToken(url, token) {
    if (url.indexOf('__TOKEN__') >= 0) return url.split('__TOKEN__').join(encodeURIComponent(token));
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
  }

  function stamp(urls) {
    var origins = [];
    var seen = {};
    urls.forEach(function (url) {
      var origin = originOf(url);
      if (origin && !seen[origin]) {
        seen[origin] = true;
        origins.push(origin);
      }
    });
    return Promise.all(
      origins.map(function (origin) {
        return ctx
          .fetch(origin + '/generate.php', {
            headers: {
              'User-Agent': ua,
              Accept: '*/*',
              Referer: origin + '/',
              Origin: origin,
            },
          })
          .then(textOf)
          .then(function (text) {
            return { origin: origin, token: cleanToken(text) };
          })
          .catch(function () {
            return { origin: origin, token: '' };
          });
      }),
    ).then(function (list) {
      var tokens = {};
      list.forEach(function (item) {
        tokens[item.origin] = item.token;
      });
      var rows = [];
      urls.forEach(function (url) {
        var origin = originOf(url);
        var token = tokens[origin];
        if (!token) return;
        rows.push({
          url: withToken(url, token),
          name: rows.length ? 'VidSrc · ' + (rows.length + 1) : 'VidSrc',
          quality: 'Auto',
          headers: {
            'User-Agent': ua,
            Referer: origin + '/',
            Origin: origin,
          },
        });
      });
      return rows;
    });
  }

  ctx.log('start ' + apiUrl);
  return ctx
    .fetch(apiUrl, { headers: headers })
    .then(function (r) {
      if (!r || !r.ok) return null;
      return r.json();
    })
    .then(function (json) {
      var data = json && json.data;
      var packed = data && data.stream_urls;
      if (!packed) return [];
      if (Array.isArray(packed)) return stamp(packed.filter(Boolean));
      if (typeof packed !== 'string') return [];
      return loadWasm(json.vs).then(function (wasm) {
        if (!wasm) {
          ctx.log('wasm missing');
          return [];
        }
        var key = keyFromWasm(wasm);
        if (!key) {
          ctx.log('key missing');
          return [];
        }
        var urls = decryptUrls(bytesFromB64(packed), key);
        ctx.log('urls=' + urls.length);
        if (!urls.length) return [];
        return stamp(urls);
      });
    })
    .catch(function (e) {
      ctx.error(e && e.message ? e.message : e);
      return [];
    });
}
