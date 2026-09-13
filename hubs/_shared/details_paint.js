// Shared hub details paint — upcoming / premiereLabel.
// Source of truth. Sync into each hub `_kit.js` via sync_details_paint.sh.
// Pack owns these fields; host only reads them.

function hubParseIsoDate(raw) {
  var s = String(raw || '').trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return '';
}

function hubIsFutureIsoDate(iso) {
  var s = hubParseIsoDate(iso);
  if (!s) return false;
  var parts = s.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var d = Number(parts[2]);
  if (!(y > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  var air = new Date(y, m - 1, d);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return air.getTime() > today.getTime();
}

function hubFormatDisplayDate(iso) {
  var s = hubParseIsoDate(iso);
  if (!s) return '';
  var parts = s.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var m = Number(parts[1]);
  var d = Number(parts[2]);
  var y = Number(parts[0]);
  if (!(m >= 1 && m <= 12)) return s;
  return months[m - 1] + ' ' + d + ', ' + y;
}

function hubMetaIsMovie(meta) {
  if (!meta) return false;
  if (meta.open && meta.open.movie === true) return true;
  if (String(meta.badge || '').toUpperCase() === 'MOVIE') return true;
  if (String(meta.type || '').toLowerCase() === 'movie') return true;
  if (String(meta.tmdbMediaType || '').toLowerCase() === 'movie') return true;
  return false;
}

function hubVideoNotAiredYet(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.aired === false) return true;
  var air = hubParseIsoDate(v.airDate || v.air_date || '');
  return !!(air && hubIsFutureIsoDate(air));
}

function hubVideoHasAirSignal(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.aired === false) return true;
  return !!hubParseIsoDate(v.airDate || v.air_date || '');
}

/** Pack owns upcoming / premiereLabel — host only reads these fields. */
function hubStampDetailsPaint(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  var videos = Array.isArray(meta.videos) ? meta.videos : [];
  var status = String(meta.status || '').trim().toUpperCase();
  var premiere = hubParseIsoDate(meta.premiereDate || '');
  if (!premiere) {
    var bit = String(meta.releaseInfo || '').split(' • ')[0].trim();
    premiere = hubParseIsoDate(bit);
  }
  var earliest = '';
  for (var i = 0; i < videos.length; i++) {
    var day = hubParseIsoDate(videos[i].airDate || videos[i].air_date || '');
    if (!day) continue;
    if (!earliest || day < earliest) earliest = day;
  }
  var labelIso = premiere || earliest;
  var upcoming = status === 'NOT_YET_RELEASED';
  var isMovie = hubMetaIsMovie(meta);
  if (!upcoming && !isMovie && videos.length) {
    var dated = [];
    for (var j = 0; j < videos.length; j++) {
      if (hubVideoHasAirSignal(videos[j])) dated.push(videos[j]);
    }
    if (dated.length) {
      var allFuture = true;
      for (var k = 0; k < dated.length; k++) {
        if (!hubVideoNotAiredYet(dated[k])) {
          allFuture = false;
          break;
        }
      }
      if (allFuture) upcoming = true;
    }
  }
  if (!upcoming && labelIso && hubIsFutureIsoDate(labelIso)) {
    if (isMovie || !videos.length) upcoming = true;
  }
  meta.upcoming = !!upcoming;
  if (upcoming && !status) meta.status = 'NOT_YET_RELEASED';
  if (labelIso) {
    meta.premiereDate = meta.premiereDate || labelIso;
    meta.premiereLabel = hubFormatDisplayDate(labelIso);
  } else if (!meta.premiereLabel) {
    meta.premiereLabel = '';
  }
  return meta;
}
