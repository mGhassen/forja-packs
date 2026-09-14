// TorBox — kind:debrid resolve

var TB_API = 'https://api.torbox.app/v1/api/torrents';

async function extract(ctx) {
  if (String(ctx.action || '') !== 'resolve') return [];
  var key = debridApiKey(ctx);
  if (!key) throw new Error('TorBox API Key not set');
  var magnet = debridMagnet(ctx);
  if (!magnet) throw new Error('missing magnet');
  var season = debridSeason(ctx);
  var episode = debridEpisode(ctx);
  var auth = { Authorization: 'Bearer ' + key };

  var create = await debridJson(ctx, TB_API + '/createtorrent', {
    method: 'POST',
    headers: auth,
    body: { magnet: magnet },
  });
  if (create.data && create.data.success === false) {
    throw new Error(
      'TorBox failed: ' +
        ((create.data && create.data.detail) || 'unknown error'),
    );
  }
  var torrentId =
    create.data && create.data.data && create.data.data.torrent_id;
  if (torrentId == null) throw new Error('TorBox: no torrent id');

  var info = null;
  for (var i = 0; i < 20; i++) {
    var infoRes = await debridJson(
      ctx,
      TB_API + '/mylist?id=' + torrentId + '&bypass_cache=true',
      { headers: auth },
    );
    info = (infoRes.data && infoRes.data.data) || {};
    if (info.download_finished === true || info.download_state === 'cached') {
      break;
    }
    if (info.download_state === 'error') {
      throw new Error('TorBox Download failed');
    }
    await debridSleep(3000);
  }

  var rawFiles = Array.isArray(info.files) ? info.files : [];
  if (!rawFiles.length) throw new Error('TorBox returned no files');
  var named = rawFiles.map(function (f) {
    return { path: String(f.name || ''), size: Number(f.size || 0) };
  });
  var pickedIdx = debridPickFileIndex(named, season, episode);
  if (pickedIdx < 0) throw new Error('No video file found in torrent');
  var picked = rawFiles[pickedIdx];
  var fileId = picked.id;
  if (fileId == null) throw new Error('TorBox: no file id');
  var permalink =
    'https://api.torbox.app/v1/api/torrents/requestdl?token=' +
    encodeURIComponent(key) +
    '&torrent_id=' +
    encodeURIComponent(String(torrentId)) +
    '&file_id=' +
    encodeURIComponent(String(fileId)) +
    '&redirect=true';
  return debridRowFromUrl(
    permalink,
    String(picked.name || 'video'),
    Number(picked.size || 0),
  );
}
