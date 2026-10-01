function search(ctx) {
  var cfg = Object.assign({}, ctx.config || {});
  var query = String(ctx.query || '').trim();
  if (!query) return Promise.resolve([]);
  var source = String(cfg.source || 'TorrentGalaxy');
  var base = String(cfg.base || 'https://torrentgalaxy.info').replace(/\/$/, '');
  var ua =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
  var headers = { 'User-Agent': ua };
  var maxDetail = Number(cfg.maxDetail || 25) || 25;

  function searchUrl() {
    return base + '/get-posts/keywords:' + encodeURIComponent(query);
  }

  function parseListing(html) {
    var $ = ctx.html(html);
    var rows = [];
    $('.tgxtable .tgxtablerow').each(function (_, tr) {
      var link = $(tr).find('.tgxtablecell.clickable-row a[title]').first();
      if (!link.length) return;
      var name = (link.attr('title') || '').trim();
      var href = link.attr('href') || '';
      if (!name || !href) return;
      var size =
        ($(tr).find('.badge-secondary').first().text() || '').trim() || 'Unknown';
      var seeders = '0';
      var green = $(tr).find('font[color="green"] b').first();
      if (green.length) seeders = green.text().trim() || '0';
      var postUrl = href.indexOf('http') === 0 ? href : base + href;
      rows.push({
        name: name,
        size: size,
        seeders: seeders,
        postUrl: postUrl,
      });
    });
    return rows;
  }

  function magnetFromDetail(html, name) {
    var $ = ctx.html(html);
    var magnet = ($('a[href^="magnet:"]').first().attr('href') || '').trim();
    if (!magnet) {
      var m = String(html || '').match(/href=["'](magnet:\?[^"']+)["']/i);
      magnet = m ? m[1] : '';
    }
    if (!magnet) return null;
    var hashM = magnet.match(/urn:btih:([a-zA-Z0-9]+)/i);
    if (hashM && hashM[1] && magnet.indexOf('&') < 0) {
      magnet = magnetFromHash(hashM[1], name);
    }
    return {
      name: name,
      magnet: magnet,
      seeders: '0',
      size: 'Unknown',
      source: source,
    };
  }

  function fetchDetail(item) {
    return fetchText(ctx, item.postUrl, headers)
      .then(function (html) {
        var row = magnetFromDetail(html, item.name);
        if (!row) return null;
        row.seeders = item.seeders || '0';
        row.size = item.size || 'Unknown';
        row.source = source;
        return row;
      })
      .catch(function () {
        return null;
      });
  }

  return fetchText(ctx, searchUrl(), headers)
    .then(function (html) {
      var listed = parseListing(html).slice(0, maxDetail);
      if (!listed.length) return [];
      return Promise.all(
        listed.map(function (item) {
          return fetchDetail(item);
        }),
      ).then(function (rows) {
        return rows.filter(Boolean);
      });
    })
    .catch(function () {
      return [];
    });
}
