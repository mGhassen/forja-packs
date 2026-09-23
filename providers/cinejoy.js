var SPECS = {
  "origin": "https://cinejoy.pk",
  "api": "https://api.wing.st",
  "enc": "https://enc-dec.app/api",
  "tmdbKey": "1865f43a0549ca50d341dd9ab8b29f49"
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = cfg.origin.replace(/\/$/, '');
  var api = cfg.api.replace(/\/$/, '');
  var enc = cfg.enc.replace(/\/$/, '');
  var tmdbKey = cfg.tmdbKey;
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var headers = {
    Accept: '*/*',
    Origin: origin,
    Referer: origin + '/',
    'User-Agent': ua,
  };
  var isTv = ctx.type !== 'movie';

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  function base64urlDecodeBin(s) {
    var t = String(s || '')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    while (t.length % 4) t += '=';
    try {
      return atob(t);
    } catch (e) {
      return '';
    }
  }

  function base64urlEncodeBin(bin) {
    var b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function responseBin(r) {
    if (r && r._bodyB64) {
      try {
        return atob(String(r._bodyB64));
      } catch (e) {
        return '';
      }
    }
    return r.arrayBuffer().then(function (buf) {
      var view = new Uint8Array(buf);
      var out = '';
      for (var i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
      return out;
    });
  }

  function walk(o, urls) {
    if (!o) return;
    if (typeof o === 'string' && /^https?:/i.test(o)) urls.push(o);
    else if (Array.isArray(o)) o.forEach(function (e) { walk(e, urls); });
    else if (typeof o === 'object') {
      ['url', 'file', 'src', 'stream', 'link', 'source', 'playlist', 'data'].forEach(
        function (k) {
          if (o[k]) walk(o[k], urls);
        },
      );
    }
  }

  function toRows(payload, label) {
    var urls = [];
    walk(payload, urls);
    return Promise.all(
      urls.map(function (u) {
        if (/\.m3u8|\.mp4/i.test(u)) {
          return Promise.resolve([
            {
              url: u,
              name: 'CineJoy' + (label ? ' ' + label : ''),
              headers: { 'User-Agent': ua, Referer: origin + '/' },
            },
          ]);
        }
        return ctx.hop(u).then(function (rows) {
          return rows.map(function (r) {
            return Object.assign({}, r, { name: 'CineJoy' + (label ? ' ' + label : '') });
          });
        });
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  function fetchJson(url, extra) {
    return ctx
      .fetch(url, { headers: Object.assign({}, headers, extra || {}) })
      .then(function (r) {
        return r.json();
      });
  }

  function fetchMeta() {
    var kind = isTv ? 'tv' : 'movie';
    return fetchJson(
      'https://tmdb.forjahq.xyz/3/' +
        kind +
        '/' +
        encodeURIComponent(String(ctx.tmdbId || '')) +
        '?api_key=' +
        encodeURIComponent(tmdbKey) +
        '&append_to_response=external_ids',
    ).then(function (d) {
      var title = d.name || d.title || d.original_name || d.original_title || '';
      var year = ((d.first_air_date || d.release_date || '').match(/\d{4}/) || [])[0] || String(ctx.year || '');
      var imdb = (d.external_ids && d.external_ids.imdb_id) || ctx.imdbId || '';
      if (!title || !year) throw new Error('meta');
      return {
        title: title,
        year: year,
        imdb: imdb,
        tmdb: String(ctx.tmdbId || ''),
        type: isTv ? 'series' : 'movie',
        season: String(ctx.season || 1),
        episode: String(ctx.episode || 1),
      };
    });
  }

  function buildApiUrl(meta, server) {
    var q =
      'title=' +
      encodeURIComponent(meta.title) +
      '&type=' +
      encodeURIComponent(meta.type) +
      '&year=' +
      encodeURIComponent(meta.year) +
      '&imdb=' +
      encodeURIComponent(meta.imdb || '') +
      '&tmdb=' +
      encodeURIComponent(meta.tmdb) +
      '&server=' +
      encodeURIComponent(server);
    if (isTv) {
      q += '&season=' + encodeURIComponent(meta.season) + '&episode=' + encodeURIComponent(meta.episode);
    }
    return api + '/?' + q;
  }

  function resolveServer(meta, server) {
    var apiUrl = buildApiUrl(meta, server);
    return ctx
      .fetch(enc + '/enc-cinejoy?url=' + encodeURIComponent(apiUrl), { headers: headers })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var encResult = validate(j);
        if (!encResult || !encResult.data || !encResult.state) return [];
        var bin = base64urlDecodeBin(encResult.data);
        if (!bin) return [];
        // bodyB64 — encrypted gate payload has null bytes; latin1 body dies in the JSON bridge.
        var gateB64 = btoa(bin);
        return ctx
          .fetch(api + '/g', {
            method: 'POST',
            headers: Object.assign({}, headers, { 'Content-Type': 'application/octet-stream' }),
            bodyB64: gateB64,
          })
          .then(function (r) {
            if (!r.ok) {
              ctx.log('cinejoy ' + server + ' /g http ' + r.status);
              return [];
            }
            return Promise.resolve(responseBin(r)).then(function (raw) {
              if (!raw) {
                ctx.log('cinejoy ' + server + ' /g empty');
                return [];
              }
              return ctx
                .fetch(enc + '/dec-cinejoy', {
                  method: 'POST',
                  headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }),
                  body: JSON.stringify({
                    text: base64urlEncodeBin(raw),
                    state: encResult.state,
                  }),
                })
                .then(function (dr) {
                  return dr.json();
                })
                .then(function (dj) {
                  var payload = validate(dj);
                  if (!payload) {
                    ctx.log('cinejoy ' + server + ' dec fail');
                    return [];
                  }
                  return toRows(payload, server);
                });
            });
          });
      })
      .catch(function (e) {
        ctx.log('cinejoy ' + server + ' err ' + (e && e.message ? e.message : e));
        return [];
      });
  }

  return fetchMeta()
    .then(function (meta) {
      ctx.log('cinejoy meta ' + meta.title + ' ' + meta.year);
      return fetchJson(api + '/servers').then(function (sj) {
        var servers = ((sj && sj.servers) || [])
          .map(function (s) {
            return s && (s.name || s.id || s);
          })
          .filter(Boolean);
        ctx.log('cinejoy servers ' + servers.join(','));
        if (!servers.length) return [];
        return Promise.all(servers.slice(0, 6).map(function (name) { return resolveServer(meta, name); })).then(
          function (groups) {
            var out = [].concat.apply([], groups);
            ctx.log('cinejoy streams=' + out.length);
            return out;
          },
        );
      });
    })
    .catch(function (e) {
      ctx.log('cinejoy meta err ' + (e && e.message ? e.message : e));
      return [];
    });
}
