var SPECS = {
  base: 'https://2dhive.com',
  wavy: 'https://wavy.babastream.top',
  megaplay: 'https://megaplay.buzz',
};

function extract(ctx) {
  var cfg = Object.assign({}, SPECS, ctx.config || {});
  var hive = String(cfg.base || '').replace(/\/$/, '');
  var wavy = String(cfg.wavy || '').replace(/\/$/, '');
  var megaplay = String(cfg.megaplay || '').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua, Accept: '*/*' };
  var plainFetch = ctx.fetch.bind(ctx);
  var chromeFetch =
    typeof ctx.chromeFetch === 'function' ? ctx.chromeFetch.bind(ctx) : null;
  var http = chromeFetch || plainFetch;

  function getText(url, extra, client) {
    var fn = client || http;
    return fn(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      if (!r.ok) return '';
      return r.text();
    });
  }

  function getJson(url, extra) {
    return plainFetch(url, { headers: Object.assign({}, headers, extra || {}) }).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    });
  }

  function malId() {
    var fromHost = globalThis.__engineCtxMal && globalThis.__engineCtxMal(ctx);
    if (fromHost && fromHost.mal) {
      return {
        mal: Number(fromHost.mal),
        ep: Number(fromHost.ep || fromHost.mappedEp || ctx.episode || 1) || 1,
      };
    }
    var mal = Number(ctx.malId) || 0;
    if (!mal) return null;
    return {
      mal: mal,
      ep: Number(ctx.mappedEpisode || ctx.episode || 1) || 1,
    };
  }

  function cats() {
    return (
      (globalThis.__engineAudioCategories && globalThis.__engineAudioCategories(ctx)) || [
        'sub',
        'dub',
      ]
    );
  }

  function firstPlaylistUri(master, origin) {
    var lines = String(master || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (!ln || ln.charAt(0) === '#') continue;
      if (/^https?:\/\//i.test(ln)) return ln;
      if (ln.charAt(0) === '/') return origin + ln;
      return origin + '/' + ln;
    }
    return '';
  }

  function wavyRows(mal, ep, kind) {
    var page = wavy + '/' + mal + '/' + ep + '/' + kind;
    var masterUrl = wavy + '/stream.m3u8';
    var playHeaders = {
      'User-Agent': ua,
      Referer: page,
      Origin: wavy,
    };
    function fromClient(client) {
      return getText(page, { Referer: hive + '/' }, client).then(function (html) {
        if (!html || /<title>not found/i.test(html)) return [];
        return getText(masterUrl, { Referer: page, Origin: wavy }, client).then(function (master) {
          if (!master || master.indexOf('#EXTM3U') < 0) return [];
          var url = firstPlaylistUri(master, wavy) || masterUrl;
          return [
            {
              url: url,
              name: '2DHive Wavy (' + kind.toUpperCase() + ')',
              language: kind === 'dub' ? 'Dub' : 'Sub',
              headers: playHeaders,
            },
          ];
        });
      });
    }
    return fromClient(http)
      .then(function (rows) {
        if (rows && rows.length) return rows;
        if (!chromeFetch) return [];
        return fromClient(plainFetch);
      })
      .catch(function () {
        return [];
      });
  }

  function playerId(html) {
    try {
      var $ = ctx.html ? ctx.html(html) : null;
      if ($) {
        var el = $('#megaplay-player');
        if (el && el.length) {
          return el.attr('data-id') || '';
        }
      }
    } catch (e) {}
    return (
      (html.match(/id=["']megaplay-player["'][^>]*data-id=["']([^"']+)/) ||
        html.match(/data-id=["']([^"']+)["'][^>]*id=["']megaplay-player/) ||
        [])[1] || ''
    );
  }

  var MEGAPLAY_AES_KEY = 'i?LMTAx0Q6,:}50U';
  var MEGAPLAY_AES_IV = "W0;27ToaUpl_P%'c";

  function fileFromGetSources(json) {
    var file = json && json.sources && json.sources.file;
    if (typeof file === 'string' && file) return file;
    var enc = json && json.enc;
    if (!enc || typeof enc !== 'string') return '';
    try {
      var C = ctx.crypto || globalThis.CryptoJS;
      if (!C || !C.AES) return '';
      var keyHex = C.enc.Utf8.parse(MEGAPLAY_AES_KEY).toString(C.enc.Hex);
      while (keyHex.length < 64) keyHex += '00';
      var key = C.enc.Hex.parse(keyHex.substring(0, 64));
      var iv = C.enc.Utf8.parse(MEGAPLAY_AES_IV);
      var pt = C.AES.decrypt(
        { ciphertext: C.enc.Base64.parse(enc) },
        key,
        { iv: iv, mode: C.mode.CBC, padding: C.pad.Pkcs7 },
      );
      var text = C.enc.Utf8.stringify(pt);
      if (!text) return '';
      var parsed = JSON.parse(text);
      return (parsed && parsed.file) || '';
    } catch (e) {
      return '';
    }
  }

  function megaplayRows(mal, ep, kind) {
    var megaUrl = megaplay + '/stream/mal/' + mal + '/' + ep + '/' + kind;
    return getText(megaUrl, { Referer: megaUrl }, plainFetch)
      .then(function (html) {
        var id = playerId(html);
        if (!id) return [];
        var api =
          megaplay + '/stream/getSources?id=' + id + '&id=' + id + '&s=tcdn';
        return getJson(api, {
          'X-Requested-With': 'XMLHttpRequest',
          Referer: megaUrl,
          Origin: megaplay,
        }).then(function (json) {
          var file = fileFromGetSources(json);
          if (!file) return [];
          return [
            {
              url: file,
              name: '2DHive Megaplay (' + kind.toUpperCase() + ')',
              language: kind === 'dub' ? 'Dub' : 'Sub',
              headers: { 'User-Agent': ua, Referer: megaplay + '/', Origin: megaplay },
            },
          ];
        });
      })
      .catch(function () {
        return [];
      });
  }

  var id = malId();
  if (!id || !id.mal) return Promise.resolve([]);

  var tasks = [];
  cats().forEach(function (kind) {
    tasks.push(wavyRows(id.mal, id.ep, kind));
    tasks.push(megaplayRows(id.mal, id.ep, kind));
  });

  return Promise.all(tasks)
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
      if (!out.length) ctx.log('2dhive: no wavy/megaplay streams mal=' + id.mal + ' ep=' + id.ep);
      return out;
    })
    .catch(function () {
      return [];
    });
}
