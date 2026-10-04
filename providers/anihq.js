var SPECS = {
  base: 'https://anihq.cc',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var base = String(cfg.base || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  var hdrs = {
    'User-Agent': ua,
    Accept: 'text/html,application/json,*/*',
    Referer: base + '/',
  };
  var ep = Number(ctx.mappedEpisode || ctx.episode || 1) || 1;

  function titleCandidates() {
    var out = [];
    var seen = {};
    function add(t) {
      t = String(t || '').trim();
      if (!t || seen[t]) return;
      seen[t] = true;
      out.push(t);
    }
    add(ctx.title);
    add(ctx.titleEnglish);
    add(ctx.titleRomaji);
    add(ctx.originalTitle);
    if (Array.isArray(ctx.titles)) ctx.titles.forEach(add);
    return out;
  }

  function cleanSlug(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function decodeB64(s) {
    try {
      return atob(String(s || '').replace(/\s/g, ''));
    } catch (e) {
      return '';
    }
  }

  function getText(url, extra) {
    return ctx
      .fetch(url, { headers: Object.assign({}, hdrs, extra || {}) })
      .then(function (r) {
        if (!r.ok) return '';
        return r.text();
      });
  }

  function searchNonce(html) {
    var m = String(html || '').match(/"search_actions"\s*:\s*"([^"]+)"/);
    return m ? m[1] : '';
  }

  function findEmbeds(html) {
    var out = [];
    var seen = {};
    function add(u) {
      u = String(u || '').trim();
      if (!u || seen[u]) return;
      seen[u] = true;
      out.push(u);
    }
    var re =
      /(?:data-video|data-src|src|href)=["'](https?:\/\/[^"']*(?:voe|filemoon|dood|streamtape|mixdrop)[^"']*)["']/gi;
    var m;
    while ((m = re.exec(html)) !== null) add(m[1]);
    var embedRe = /data-embed-id=["']([^"']+)["']/gi;
    while ((m = embedRe.exec(html)) !== null) {
      var raw = m[1];
      var parts = raw.split(':');
      var decoded = decodeB64(parts.length > 1 ? parts.slice(1).join(':') : raw);
      if (/^https?:\/\//i.test(decoded)) add(decoded);
    }
    return out;
  }

  function scoreHit(query, title, slug, wantSuf) {
    var q = normalize(query);
    var t = normalize(String(title || '').replace(/english\s+(subbed|dubbed)/i, ''));
    var core = String(slug || '').replace(/-english-(subbed|dubbed)$/i, '');
    var qSlug = cleanSlug(query);
    var n = 0;
    if (wantSuf && String(slug || '').toLowerCase().indexOf(wantSuf) >= 0) n += 40;
    if (core === qSlug) n += 100;
    else if (qSlug && core.indexOf(qSlug) === 0 && core.length - qSlug.length < 8) n += 70;
    else if (t === q) n += 90;
    else if (t.indexOf(q) === 0 || q.indexOf(t) === 0) n += 50;
    else if (t.indexOf(q) >= 0) n += 25;
    return n;
  }

  function parseSearchHits(html) {
    var hits = [];
    var re = /href="(https?:\/\/[^"]+\/anime-show\/([^"/]+)\/?)"[^>]*title="([^"]+)"/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      hits.push({ slug: m[2], title: m[3], href: m[1] });
    }
    return hits;
  }

  function instantSearch(query, nonce) {
    if (!query || !nonce) return Promise.resolve([]);
    return ctx
      .fetch(
        base +
          '/wp-admin/admin-ajax.php?action=instant_search&query=' +
          encodeURIComponent(query) +
          '&nonce=' +
          encodeURIComponent(nonce),
        {
          headers: Object.assign({}, hdrs, { 'X-Requested-With': 'XMLHttpRequest' }),
        },
      )
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var html = data && data.data && data.data.html;
        return parseSearchHits(html || '');
      })
      .catch(function () {
        return [];
      });
  }

  function pickHit(hits, query, typeSuffix) {
    if (!hits.length) return null;
    var ranked = hits.slice().sort(function (a, b) {
      return scoreHit(query, b.title, b.slug, typeSuffix) - scoreHit(query, a.title, a.slug, typeSuffix);
    });
    return scoreHit(query, ranked[0].title, ranked[0].slug, typeSuffix) >= 50 ? ranked[0] : null;
  }

  function watchUrlFromSlug(slug, typeSuffix) {
    var core = String(slug || '').replace(/-english-(subbed|dubbed)$/i, '');
    if (!core) return '';
    return base + '/watch/' + core + '-episode-' + ep + '-' + typeSuffix + '/';
  }

  function hopEmbeds(urls, kind, isDub) {
    return Promise.all(
      urls.map(function (u) {
        return ctx.hop(u).then(function (rows) {
          return (rows || []).map(function (r) {
            return Object.assign({}, r, {
              name: 'AniHQ (VOE) (' + kind.toUpperCase() + ')',
              language: isDub ? 'Dub' : 'Sub',
              quality: r.quality || '1080p',
              headers: Object.assign({ 'User-Agent': ua, Referer: base + '/' }, r.headers || {}),
            });
          });
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

  function scrapeTitle(title, kind, nonceHint) {
    var isDub = kind === 'dub';
    var typeSuffix = isDub ? 'english-dubbed' : 'english-subbed';
    var clean = cleanSlug(title);
    if (!clean) return Promise.resolve([]);
    var directUrl = base + '/watch/' + clean + '-episode-' + ep + '-' + typeSuffix + '/';

    return getText(directUrl).then(function (html) {
      var nonce = searchNonce(html) || nonceHint || '';
      var embeds = findEmbeds(html);
      if (embeds.length) return hopEmbeds(embeds, kind, isDub);
      return instantSearch(title, nonce).then(function (hits) {
        var hit = pickHit(hits, title, typeSuffix);
        if (!hit) return [];
        var watchUrl = watchUrlFromSlug(hit.slug, typeSuffix);
        if (!watchUrl) return [];
        return getText(watchUrl).then(function (epHtml) {
          var found = findEmbeds(epHtml);
          if (!found.length) return [];
          return hopEmbeds(found, kind, isDub);
        });
      });
    });
  }

  var titles = titleCandidates();
  if (!titles.length) return Promise.resolve([]);

  var cats =
    (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) ||
    ['sub', 'dub'];

  function tryTitles(kind, nonceHint) {
    var chain = Promise.resolve([]);
    titles.forEach(function (title) {
      chain = chain.then(function (acc) {
        if (acc.length) return acc;
        return scrapeTitle(title, kind, nonceHint);
      });
    });
    return chain;
  }

  return getText(base + '/')
    .catch(function () {
      return '';
    })
    .then(function (home) {
      var nonce = searchNonce(home);
      return Promise.all(
        cats.map(function (kind) {
          return tryTitles(kind === 'dub' ? 'dub' : 'sub', nonce);
        }),
      );
    })
    .then(function (groups) {
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
    })
    .catch(function () {
      return [];
    });
}
