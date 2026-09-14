// Debrid-Link — kind:debrid resolve

var DL_API = 'https://debrid-link.com/api/v2/seedbox';

function dlDecode(body) {
  if (!body || body.success !== true) {
    throw new Error(
      'Debrid-Link: ' + String((body && body.error) || 'unknown error'),
    );
  }
  return body;
}

function dlExtractFiles(torrent) {
  var out = [];
  var files = torrent && Array.isArray(torrent.files) ? torrent.files : [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || typeof f !== 'object') continue;
    out.push({
      path: String(f.name || ''),
      size: Number(f.size || 0),
      link: String(f.downloadUrl || ''),
    });
  }
  return out;
}

async function extract(ctx) {
  if (String(ctx.action || '') !== 'resolve') return [];
  var key = debridApiKey(ctx);
  if (!key) throw new Error('Debrid-Link API key not set');
  var magnet = debridMagnet(ctx);
  if (!magnet) throw new Error('missing magnet');
  var season = debridSeason(ctx);
  var episode = debridEpisode(ctx);
  var auth = {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  };

  var add = await debridJson(ctx, DL_API + '/add', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ url: magnet, async: true }),
  });
  // debridJson stringifies objects — for JSON body we already stringified.
  // Fix: debridFetch treats string body as-is. Good.
  var addBody = dlDecode(add.data);
  var torrent = addBody.value;
  if (!torrent) throw new Error('Debrid-Link: no torrent id returned');
  var torrentId = torrent.id;
  if (!torrentId) throw new Error('Debrid-Link: no torrent id returned');

  var files = dlExtractFiles(torrent);
  var ready = files.length > 0 && files.every(function (f) { return !!f.link; });

  for (var i = 0; i < 40; i++) {
    if (ready) break;
    await debridSleep(3000);
    var st = await debridJson(ctx, DL_API + '/list?ids=' + encodeURIComponent(torrentId), {
      headers: { Authorization: 'Bearer ' + key },
    });
    var stBody = dlDecode(st.data);
    var list = Array.isArray(stBody.value) ? stBody.value : [];
    if (list[0]) {
      files = dlExtractFiles(list[0]);
      ready = files.length > 0 && files.every(function (f) { return !!f.link; });
    }
  }

  if (!files.length) throw new Error('Debrid-Link: no files in torrent');
  if (!ready) throw new Error('Debrid-Link: torrent not ready after 120s');

  var named = files.map(function (f) {
    return { path: f.path, size: f.size };
  });
  var pickIdx = debridPickFileIndex(named, season, episode);
  if (pickIdx < 0) {
    throw new Error('Debrid-Link: no video file found in torrent');
  }
  var picked = files[pickIdx];
  if (!picked.link) {
    throw new Error('Debrid-Link: picked file has no download link');
  }
  return debridRowFromUrl(picked.link, debridBasename(picked.path), picked.size);
}
