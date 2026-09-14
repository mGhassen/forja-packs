// AllDebrid — kind:debrid resolve

var AD_API = 'https://api.alldebrid.com/v4';

function adDecode(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.status === 'error') {
    var err = body.error || {};
    throw new Error(
      'AllDebrid: ' +
        String(err.code != null ? err.code : '') +
        ' - ' +
        String(err.message || 'unknown error'),
    );
  }
  return body.data != null ? body.data : null;
}

function adFlatten(nodes, prefix, out) {
  if (!Array.isArray(nodes)) return;
  for (var i = 0; i < nodes.length; i++) {
    var obj = nodes[i];
    if (!obj || typeof obj !== 'object') continue;
    var name = String(obj.n || '');
    if (Array.isArray(obj.e)) {
      var next = prefix ? prefix + '/' + name : name;
      adFlatten(obj.e, next, out);
    } else {
      out.push({
        path: prefix ? prefix + '/' + name : name,
        size: Number(obj.s || 0),
        link: String(obj.l || ''),
      });
    }
  }
}

async function extract(ctx) {
  if (String(ctx.action || '') !== 'resolve') return [];
  var key = debridApiKey(ctx);
  if (!key) throw new Error('AllDebrid API key not set');
  var magnet = debridMagnet(ctx);
  if (!magnet) throw new Error('missing magnet');
  var season = debridSeason(ctx);
  var episode = debridEpisode(ctx);
  var auth = { Authorization: 'Bearer ' + key };

  var up = await debridJson(ctx, AD_API + '/magnet/upload', {
    method: 'POST',
    headers: auth,
    body: { 'magnets[]': magnet },
  });
  var upData = adDecode(up.data);
  var magnets = (upData && upData.magnets) || [];
  var first = magnets[0];
  if (!first) throw new Error('AllDebrid: empty magnet upload response');
  if (first.error) {
    throw new Error(
      'AllDebrid: ' +
        String(first.error.code != null ? first.error.code : '') +
        ' - ' +
        String(first.error.message || 'error'),
    );
  }
  var magnetId = first.id;
  if (magnetId == null) throw new Error('AllDebrid: no magnet id returned');

  for (var i = 0; i < 40; i++) {
    var st = await debridJson(ctx, 'https://api.alldebrid.com/v4.1/magnet/status', {
      method: 'POST',
      headers: auth,
      body: { id: String(magnetId) },
    });
    var stData = adDecode(st.data);
    var mags = stData && stData.magnets;
    var magObj = Array.isArray(mags) ? mags[0] : mags;
    var code = magObj && magObj.statusCode != null ? Number(magObj.statusCode) : -1;
    if (code === 4) break;
    if (code >= 5) {
      throw new Error(
        'AllDebrid magnet failed: ' +
          String((magObj && magObj.status) || 'error') +
          ' (code ' +
          code +
          ')',
      );
    }
    await debridSleep(3000);
  }

  var filesRes = await debridJson(ctx, AD_API + '/magnet/files', {
    method: 'POST',
    headers: auth,
    body: { 'id[]': String(magnetId) },
  });
  var filesData = adDecode(filesRes.data);
  var filesMagnets = (filesData && filesData.magnets) || [];
  var filesObj = filesMagnets[0];
  if (!filesObj) throw new Error('AllDebrid: empty files response');
  if (filesObj.error) {
    throw new Error(
      'AllDebrid files: ' +
        String(filesObj.error.code != null ? filesObj.error.code : '') +
        ' - ' +
        String(filesObj.error.message || 'error'),
    );
  }
  var flat = [];
  adFlatten(filesObj.files || [], '', flat);
  if (!flat.length) throw new Error('AllDebrid: no files in magnet');

  var named = flat.map(function (f) {
    return { path: f.path, size: f.size };
  });
  var pickIdx = debridPickFileIndex(named, season, episode);
  if (pickIdx < 0) throw new Error('AllDebrid: no video file found in torrent');
  var picked = flat[pickIdx];
  if (!picked.link) throw new Error('AllDebrid: picked file has no unlock link');

  var un = await debridJson(ctx, AD_API + '/link/unlock', {
    method: 'POST',
    headers: auth,
    body: { link: picked.link },
  });
  var unData = adDecode(un.data);
  if (unData && unData.delayed != null) {
    throw new Error('AllDebrid returned a delayed link (not supported)');
  }
  var dl = unData && unData.link;
  if (!dl) throw new Error('AllDebrid unlock returned no link');
  return debridRowFromUrl(
    dl,
    (unData && unData.filename) || debridBasename(picked.path),
    (unData && unData.filesize) || picked.size,
  );
}
