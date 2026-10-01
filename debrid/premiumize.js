// Premiumize — kind:debrid resolve

var PM_API = 'https://www.premiumize.me/api';

async function pmWalkFolder(ctx, apiKey, folderId, prefix, out) {
  var res = await debridJson(ctx, PM_API + '/folder/list', {
    method: 'POST',
    body: { apikey: apiKey, id: folderId },
  });
  var body = res.data || {};
  if (body.status !== 'success') {
    throw new Error(
      'Premiumize folder/list: ' + String(body.message || 'error'),
    );
  }
  var content = Array.isArray(body.content) ? body.content : [];
  for (var i = 0; i < content.length; i++) {
    var node = content[i];
    if (!node || typeof node !== 'object') continue;
    var name = String(node.name || '');
    var path = prefix ? prefix + '/' + name : name;
    if (node.type === 'folder' && node.id) {
      await pmWalkFolder(ctx, apiKey, String(node.id), path, out);
    } else {
      var stream = node.stream_link ? String(node.stream_link) : '';
      var link = stream || String(node.link || '');
      out.push({ path: path, size: Number(node.size || 0), link: link });
    }
  }
}

async function extract(ctx) {
  if (String(ctx.action || '') !== 'resolve') return [];
  var key = debridApiKey(ctx);
  if (!key) throw new Error('Premiumize API key not set');
  var magnet = debridMagnet(ctx);
  if (!magnet) throw new Error('missing magnet');
  var season = debridSeason(ctx);
  var episode = debridEpisode(ctx);

  var files = [];
  var dl = await debridJson(ctx, PM_API + '/transfer/directdl', {
    method: 'POST',
    body: { apikey: key, src: magnet },
  });
  if (dl.data && dl.data.status === 'success') {
    var content = Array.isArray(dl.data.content) ? dl.data.content : [];
    for (var i = 0; i < content.length; i++) {
      var node = content[i];
      if (!node || typeof node !== 'object') continue;
      var path = String(node.path || node.name || '');
      var stream = node.stream_link ? String(node.stream_link) : '';
      var link = stream || String(node.link || '');
      files.push({ path: path, size: Number(node.size || 0), link: link });
    }
  }

  if (!files.length) {
    var create = await debridJson(ctx, PM_API + '/transfer/create', {
      method: 'POST',
      body: { apikey: key, src: magnet },
    });
    var createBody = create.data || {};
    if (createBody.status !== 'success') {
      throw new Error(
        'Premiumize create: ' + String(createBody.message || 'error'),
      );
    }
    var transferId = createBody.id;
    if (!transferId) throw new Error('Premiumize: no transfer id returned');

    var folderId = null;
    for (var j = 0; j < 40; j++) {
      await debridSleep(3000);
      var list = await debridJson(ctx, PM_API + '/transfer/list', {
        method: 'POST',
        body: { apikey: key },
      });
      var listBody = list.data || {};
      if (listBody.status !== 'success') {
        throw new Error(
          'Premiumize list: ' + String(listBody.message || 'error'),
        );
      }
      var transfers = Array.isArray(listBody.transfers) ? listBody.transfers : [];
      var mine = null;
      for (var t = 0; t < transfers.length; t++) {
        if (String(transfers[t].id) === String(transferId)) {
          mine = transfers[t];
          break;
        }
      }
      if (!mine) throw new Error('Premiumize: transfer disappeared');
      var status = String(mine.status || '');
      if (status === 'finished' || status === 'seeding') {
        folderId = mine.folder_id ? String(mine.folder_id) : null;
        break;
      }
      if (
        status === 'error' ||
        status === 'deleted' ||
        status === 'banned'
      ) {
        throw new Error(
          'Premiumize transfer failed: ' +
            status +
            ' (' +
            String(mine.message || '') +
            ')',
        );
      }
    }
    if (!folderId) {
      throw new Error('Premiumize: transfer did not finish in time');
    }
    await pmWalkFolder(ctx, key, folderId, '', files);
  }

  if (!files.length) throw new Error('Premiumize: no files in torrent');
  var named = files.map(function (f) {
    return { path: f.path, size: f.size };
  });
  var pickIdx = debridPickFileIndex(named, season, episode);
  if (pickIdx < 0) {
    throw new Error('Premiumize: no video file found in torrent');
  }
  var picked = files[pickIdx];
  if (!picked.link) {
    throw new Error('Premiumize: picked file has no download link');
  }
  return debridRowFromUrl(picked.link, debridBasename(picked.path), picked.size);
}
