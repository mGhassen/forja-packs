// Real-Debrid — kind:debrid resolve

var RD_API = 'https://api.real-debrid.com/rest/1.0';

async function extract(ctx) {
  if (String(ctx.action || '') !== 'resolve') return [];
  var key = debridApiKey(ctx);
  if (!key) throw new Error('Real-Debrid not logged in');
  var magnet = debridMagnet(ctx);
  if (!magnet) throw new Error('missing magnet');
  var season = debridSeason(ctx);
  var episode = debridEpisode(ctx);
  var auth = { Authorization: 'Bearer ' + key };

  var add = await debridJson(ctx, RD_API + '/torrents/addMagnet', {
    method: 'POST',
    headers: auth,
    body: { magnet: magnet },
  });
  if (add.status !== 201) {
    throw new Error('Failed to add magnet to RD: ' + (add.text || ''));
  }
  var torrentId = add.data && add.data.id;
  if (!torrentId) throw new Error('RD: no torrent id');

  var info = null;
  var rdFiles = [];
  for (var i = 0; i < 20; i++) {
    var infoRes = await debridJson(ctx, RD_API + '/torrents/info/' + torrentId, {
      headers: auth,
    });
    info = infoRes.data || {};
    var status = String(info.status || '');
    if (
      status === 'magnet_error' ||
      status === 'error' ||
      status === 'dead' ||
      status === 'virus'
    ) {
      throw new Error('RD rejected magnet (status: ' + status + ')');
    }
    rdFiles = Array.isArray(info.files) ? info.files : [];
    if (rdFiles.length) break;
    await debridSleep(2000);
  }
  if (!rdFiles.length) throw new Error('RD never returned a file list');

  var named = rdFiles.map(function (f) {
    return { path: String(f.path || ''), size: Number(f.bytes || 0) };
  });
  var pickedIdx = debridPickFileIndex(named, season, episode);
  if (pickedIdx < 0) throw new Error('No video file found in torrent');
  var picked = rdFiles[pickedIdx];
  var pickedId = String(picked.id != null ? picked.id : '');
  var pickedPath = String(picked.path || '');
  var pickedSize = Number(picked.bytes || 0);

  var sel = await debridFetch(ctx, RD_API + '/torrents/selectFiles/' + torrentId, {
    method: 'POST',
    headers: auth,
    body: { files: pickedId },
  });
  if (sel.status !== 204 && sel.status !== 202) {
    await debridFetch(ctx, RD_API + '/torrents/selectFiles/' + torrentId, {
      method: 'POST',
      headers: auth,
      body: { files: 'all' },
    });
  }

  for (var j = 0; j < 40; j++) {
    var wait = await debridJson(ctx, RD_API + '/torrents/info/' + torrentId, {
      headers: auth,
    });
    info = wait.data || {};
    var st = String(info.status || '');
    if (st === 'downloaded') break;
    if (st === 'error' || st === 'dead' || st === 'virus') {
      throw new Error('RD download failed (status: ' + st + ')');
    }
    await debridSleep(3000);
  }
  if (String(info.status || '') !== 'downloaded') {
    throw new Error('RD download timed out');
  }

  var links = Array.isArray(info.links)
    ? info.links.filter(function (l) {
        return typeof l === 'string' && l;
      })
    : [];
  if (!links.length) throw new Error('RD returned no links');

  var targetLink = links[0];
  if (links.length > 1) {
    var selected = (Array.isArray(info.files) ? info.files : []).filter(
      function (f) {
        return Number(f.selected) === 1;
      },
    );
    var idx = -1;
    for (var k = 0; k < selected.length; k++) {
      if (String(selected[k].id) === pickedId) {
        idx = k;
        break;
      }
    }
    if (idx >= 0 && links[idx]) targetLink = links[idx];
  }

  var un = await debridJson(ctx, RD_API + '/unrestrict/link', {
    method: 'POST',
    headers: auth,
    body: { link: targetLink },
  });
  if (!un.ok) throw new Error('RD unrestrict failed: ' + (un.text || ''));
  var download = un.data && un.data.download;
  if (!download) throw new Error('RD unrestrict returned no download url');
  return debridRowFromUrl(
    download,
    (un.data && un.data.filename) || debridBasename(pickedPath),
    (un.data && un.data.filesize) || pickedSize,
  );
}
