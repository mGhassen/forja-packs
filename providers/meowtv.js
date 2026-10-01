var SPECS = {
  origin: 'https://meowtv.ru',
  api: 'https://api.meowtv.ru',
  enc: 'https://enc-dec.app/api',
  // Site player chips (2026-09): ticket-gated /streams + enc-dec.
  servers: [
    { id: 'dcloud', label: 'Dcloud' },
    { id: 'acme', label: 'Acme' },
    { id: 'tik', label: 'TCloud' },
    { id: 'ipcloud', label: 'IPcloud' },
    { id: 'turkce', label: 'Türkçe', movieOnly: true },
    { id: 'hindiv3', label: 'Hindi v3' },
  ],
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var origin = String(cfg.origin || '').replace(/\/$/, '');
  var api = String(cfg.api || '').replace(/\/$/, '');
  var enc = String(cfg.enc || '').replace(/\/$/, '');
  var servers = Array.isArray(cfg.servers) ? cfg.servers : [];
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  var baseHeaders = {
    'User-Agent': ua,
    Origin: origin,
    Referer: origin + '/',
    Accept: 'application/json, text/plain, */*',
  };
  var tmdbId = String(ctx.tmdbId);
  var isMovie = ctx.type === 'movie';

  function validate(j) {
    if (!j || j.status !== 200) return null;
    return j.result;
  }

  function walk(o, urls) {
    if (!o) return;
    if (typeof o === 'string' && /^https?:/i.test(o)) urls.push(o);
    else if (Array.isArray(o))
      o.forEach(function (e) {
        walk(e, urls);
      });
    else if (typeof o === 'object') {
      ['url', 'file', 'src', 'stream', 'link'].forEach(function (k) {
        if (o[k]) walk(o[k], urls);
      });
    }
  }

  function playHeaders(extra) {
    var h = { 'User-Agent': ua, Referer: origin + '/', Origin: origin };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) {
        if (extra[k] != null && String(extra[k]).trim()) h[k] = String(extra[k]);
      });
    }
    return h;
  }

  function toRows(payload, name, language) {
    var urls = [];
    walk(payload, urls);
    var fromPayload =
      payload && typeof payload === 'object' && payload.headers && typeof payload.headers === 'object'
        ? payload.headers
        : null;
    return Promise.all(
      urls.map(function (u) {
        if (/\.m3u8|\.mp4/i.test(u)) {
          var row = {
            url: u,
            name: name || 'MeowTV',
            headers: playHeaders(fromPayload),
          };
          if (language) row.language = language;
          return Promise.resolve([row]);
        }
        return ctx.hop(u);
      }),
    ).then(function (groups) {
      return [].concat.apply([], groups);
    });
  }

  // Tickets are single-use and UA-bound (mint UA must match stream GET).
  function mintTicket() {
    return ctx
      .fetch(api + '/streams/ticket', {
        method: 'POST',
        headers: Object.assign({}, baseHeaders, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({}),
      })
      .then(function (r) {
        if (!r.ok) {
          ctx.log('ticket http ' + r.status);
          return null;
        }
        return r.json();
      })
      .then(function (j) {
        var t = j && typeof j.ticket === 'string' ? j.ticket.trim() : '';
        return t || null;
      })
      .catch(function (e) {
        ctx.log('ticket err ' + (e && e.message ? e.message : e));
        return null;
      });
  }

  function fetchEncrypted(path, ticket) {
    var headers = Object.assign({}, baseHeaders);
    if (ticket) headers['x-stream-ticket'] = ticket;
    return ctx.fetch(api + path, { headers: headers }).then(function (r) {
      if (!r.ok) {
        return r
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            var err = (body && body.error) || '';
            var e = new Error(err || 'http ' + r.status);
            e.status = r.status;
            e.body = body;
            throw e;
          });
      }
      return r.json();
    });
  }

  function decrypt(data) {
    return ctx
      .fetch(enc + '/dec-meowtv', {
        method: 'POST',
        headers: Object.assign({}, baseHeaders, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ data: data }),
      })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        return validate(j);
      });
  }

  ctx.log('start tmdb=' + tmdbId + ' type=' + (isMovie ? 'movie' : 'tv') + ' servers=' + servers.length);

  var tasks = servers.slice(0, 8).map(function (server) {
    var sid = server && (server.id || server);
    if (!sid) return Promise.resolve([]);
    if (server && server.movieOnly && !isMovie) return Promise.resolve([]);

    var path = isMovie
      ? '/streams/movie/' + encodeURIComponent(tmdbId) + '?s=' + encodeURIComponent(sid)
      : '/streams/tv/' +
        encodeURIComponent(tmdbId) +
        '/' +
        encodeURIComponent(ctx.season || 1) +
        '/' +
        encodeURIComponent(ctx.episode || 1) +
        '?s=' +
        encodeURIComponent(sid);
    var label = (server && server.label) || sid;

    function once() {
      return mintTicket().then(function (ticket) {
        if (!ticket) {
          ctx.log('server ' + sid + ' no ticket');
          return [];
        }
        return fetchEncrypted(path, ticket).then(function (data) {
          if (!data || (Array.isArray(data) && !data.length)) {
            ctx.log('server ' + sid + ' empty');
            return [];
          }
          return decrypt(data).then(function (payload) {
            if (!payload) {
              ctx.log('server ' + sid + ' decrypt miss');
              return [];
            }
            var lang =
              payload && typeof payload === 'object' && payload.language
                ? String(payload.language)
                : '';
            return toRows(payload, 'MeowTV ' + label, lang);
          });
        });
      });
    }

    return once()
      .catch(function (e) {
        var msg = (e && e.message ? e.message : String(e)) || '';
        if (/ticket|signature|UA mismatch|already used/i.test(msg)) {
          ctx.log('server ' + sid + ' retry after ' + msg);
          return once();
        }
        ctx.log('server ' + sid + ' err ' + msg);
        return [];
      })
      .catch(function (e) {
        ctx.log('server ' + sid + ' err ' + (e && e.message ? e.message : e));
        return [];
      });
  });

  return Promise.all(tasks).then(function (groups) {
    var out = [];
    var seen = {};
    groups.forEach(function (rows) {
      (rows || []).forEach(function (row) {
        var key = String(row && row.url || '');
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(row);
      });
    });
    ctx.log('streams=' + out.length);
    return out;
  });
}
