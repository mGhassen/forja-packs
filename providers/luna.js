var SPECS = {
  api: 'https://api.luna-stream.me',
  origin: 'https://luna-stream.me',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var api = String(cfg.api || '').replace(/\/$/, '');
  var origin = String(cfg.origin || 'https://luna-stream.me').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var hdrs = {
    'User-Agent': ua,
    Accept: 'application/json,*/*',
    Referer: origin + '/',
    Origin: origin,
  };
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function anilistId() {
    var al = Number(ctx.anilistId) || 0;
    if (!al && globalThis.__engineCtxAnilist) al = Number(globalThis.__engineCtxAnilist(ctx)) || 0;
    return al;
  }

  function title() {
    return String(ctx.title || ctx.englishTitle || ctx.romajiTitle || '').trim();
  }

  function fetchJson(url) {
    return ctx.fetch(url, { headers: hdrs }).then(function (r) {
      if (!r.ok) return null;
      return r.json().catch(function () {
        return null;
      });
    });
  }

  function absUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') return api + u;
    return api + '/' + u;
  }

  function itemTitle(item) {
    if (!item) return '';
    var t = item.title;
    if (t && typeof t === 'object') t = t.romaji || t.english || t.userPreferred || t.name || '';
    return String(t || item.name || '').trim();
  }

  function searchHits(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.results)) return data.results;
    return [];
  }

  function pickHit(hits, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!hits.length) return null;
    if (!q) return hits[0];
    return (
      hits.find(function (h) {
        return itemTitle(h).toLowerCase() === q;
      }) || hits[0]
    );
  }

  function tracksFrom(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t) continue;
      var file = absUrl(t.url || t.file || t.proxyUrl);
      if (!file) continue;
      var kind = String(t.kind || '').toLowerCase();
      if (kind === 'thumbnails' || kind === 'thumbnail') continue;
      out.push({
        url: file,
        language: t.lang || t.label || 'und',
        name: t.label || 'Subtitles',
      });
    }
    return out;
  }

  function rowsFrom(payload, name, subtype) {
    if (!payload || payload.success === false) return [];
    var data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    var sources = data.sources;
    if (!Array.isArray(sources)) return [];
    var baseHeaders = Object.assign(
      { 'User-Agent': ua, Referer: origin + '/' },
      data.headers && typeof data.headers === 'object' ? data.headers : {},
    );
    var subs = tracksFrom(data.tracks || data.subtitles);
    var rows = [];
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (!s) continue;
      var url = absUrl(s.proxyUrl || s.url);
      if (!url || /^javascript:/i.test(url)) continue;
      if (/\/embed/i.test(url) && String(s.type || '').toLowerCase() === 'iframe') continue;
      var format = String(s.type || '').toLowerCase();
      var isHls =
        s.isM3U8 === true ||
        format === 'hls' ||
        format === 'm3u8' ||
        url.indexOf('.m3u8') >= 0 ||
        url.indexOf('mpegurl') >= 0;
      var row = {
        url: url,
        name: 'Luna (' + name + ') (' + String(subtype || 'sub').toUpperCase() + ')',
        quality: s.quality || 'auto',
        language: subtype === 'dub' ? 'Dub' : 'Sub',
        type: isHls ? 'hls' : 'mp4',
        headers: baseHeaders,
      };
      if (subs.length) row.subtitles = subs;
      rows.push(row);
    }
    return rows;
  }

  function anilistSources(path, name, al, subtype) {
    return fetchJson(
      api +
        path +
        '?id=' +
        encodeURIComponent(String(al)) +
        '&epNum=' +
        encodeURIComponent(String(ep)) +
        '&subType=' +
        encodeURIComponent(subtype),
    ).then(function (json) {
      return rowsFrom(json, name, subtype);
    });
  }

  function aniwavesSources(query, subtype) {
    if (!query) return Promise.resolve([]);
    return fetchJson(api + '/anime/aniwaves/search?q=' + encodeURIComponent(query)).then(function (json) {
      var hit = pickHit(searchHits(json), query);
      var id = hit && (hit.id || hit.awId);
      if (!id) return [];
      return fetchJson(
        api +
          '/anime/aniwaves/sources?awId=' +
          encodeURIComponent(String(id)) +
          '&epNum=' +
          encodeURIComponent(String(ep)) +
          '&subType=' +
          encodeURIComponent(subtype),
      ).then(function (src) {
        return rowsFrom(src, 'Nova', subtype);
      });
    });
  }

  function animeggSources(query, subtype) {
    if (!query) return Promise.resolve([]);
    return fetchJson(api + '/anime/animegg/search?q=' + encodeURIComponent(query)).then(function (json) {
      var hit = pickHit(searchHits(json), query);
      var id = hit && hit.id;
      if (!id) return [];
      return fetchJson(api + '/anime/animegg/episodes/' + encodeURIComponent(String(id))).then(function (epsJson) {
        var eps = searchHits(epsJson);
        var epId = '';
        for (var i = 0; i < eps.length; i++) {
          var e = eps[i];
          if (!e) continue;
          if (Number(e.number) === ep) {
            epId = e.id;
            break;
          }
        }
        if (!epId) {
          var suffix = '-episode-' + ep;
          for (var j = 0; j < eps.length; j++) {
            if (String((eps[j] && eps[j].id) || '').indexOf(suffix) >= 0) {
              epId = eps[j].id;
              break;
            }
          }
        }
        if (!epId) epId = String(id) + '-episode-' + ep;
        return fetchJson(
          api +
            '/anime/animegg/sources?id=' +
            encodeURIComponent(String(id)) +
            '&episodeId=' +
            encodeURIComponent(String(epId)) +
            '&subType=' +
            encodeURIComponent(subtype),
        ).then(function (src) {
          return rowsFrom(src, 'Pulsar', subtype);
        });
      });
    });
  }

  var al = anilistId();
  var q = title();
  if (!al && !q) return Promise.resolve([]);

  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  var tasks = [];
  cats.forEach(function (kind) {
    var subtype = kind === 'dub' ? 'dub' : 'sub';
    if (al) {
      tasks.push(anilistSources('/anime/megaplay/sources', 'Zenith', al, subtype));
      tasks.push(anilistSources('/anime/anidb/sources', 'Polaris', al, subtype));
    }
    if (q) {
      tasks.push(aniwavesSources(q, subtype));
      tasks.push(animeggSources(q, subtype));
    }
  });

  return Promise.all(
    tasks.map(function (p) {
      return p.catch(function () {
        return [];
      });
    }),
  ).then(function (groups) {
    var seen = {};
    var out = [];
    groups.forEach(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || !r.url || seen[r.url]) return;
        seen[r.url] = true;
        out.push(r);
      });
    });
    return out;
  });
}
