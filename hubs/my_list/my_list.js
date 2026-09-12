// My List hub — pack owns layout/feed; host is bookmarks persist + Simkl only.

var MY_LIST_KIND_ITEMS = [
  { id: 'movie', label: 'Film' },
  { id: 'tv', label: 'Series' },
  { id: 'anime', label: 'Anime' },
  { id: 'asian_drama', label: 'Asian Drama' },
];

var MY_LIST_STATUS_TABS = [
  { id: 'plantowatch', label: 'Plan to Watch' },
  { id: 'watching', label: 'Watching' },
  { id: 'hold', label: 'On Hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'dropped', label: 'Dropped' },
];

function myListLayout() {
  return {
    pages: {
      mylist: {
        widgets: [
          kitStack(
            'page',
            { expand: true },
            [
              kitMenu('kind', MY_LIST_KIND_ITEMS, {
                toggle: true,
                focusDown: 'status',
              }),
              kitTabs('status', MY_LIST_STATUS_TABS, {
                default: 'plantowatch',
                focusUp: 'kind',
                focusDown: 'grid',
              }),
              kitList('grid', {
                kindMenu: 'kind',
                statusTab: 'status',
              }),
            ],
          ),
        ],
      },
    },
  };
}

function asInt(v) {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return v | 0;
  var n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function hideKeys(item) {
  var keys = [];
  var open = item.metaOpen || item.open || item.catalogOpen;
  if (open && typeof open === 'object') {
    var surface = open.surface != null ? String(open.surface).trim() : '';
    var id = open.id != null ? String(open.id).trim() : '';
    if (surface && id) keys.push('open:' + surface + ':' + id);
  }
  var tmdb = asInt(item.tmdbId);
  if (tmdb != null) {
    var mt = item.mediaType != null ? String(item.mediaType) : 'movie';
    if (mt === 'asian_drama') {
      var tmt = item.tmdbMediaType != null ? String(item.tmdbMediaType) : 'tv';
      keys.push('tmdb_' + (tmt === 'movie' ? 'movie' : 'tv') + '_' + tmdb);
    } else if (mt !== 'anime') {
      var norm =
        mt === 'tv' || mt === 'series' || mt === 'shows' ? 'tv' : 'movie';
      keys.push('tmdb_' + norm + '_' + tmdb);
    }
  }
  return keys;
}

function myListKindFromRow(row) {
  if (!row || typeof row !== 'object') return 'movie';
  var simkl = row._simklType != null ? String(row._simklType) : '';
  if (simkl === 'anime') return 'anime';
  var mt = row.mediaType != null ? String(row.mediaType) : 'movie';
  if (mt === 'anime') return 'anime';
  if (mt === 'asian_drama' || mt === 'drama') return 'asian_drama';
  var open = row.metaOpen || row.open || row.catalogOpen;
  if (open && typeof open === 'object') {
    if (String(open.surface || '') === 'drama') return 'asian_drama';
    var extract = open.extract;
    if (extract && typeof extract === 'object') {
      var panel = String(
        extract.panelCategory || extract.resolveType || '',
      );
      if (panel === 'drama') return 'asian_drama';
      var ctx = extract.ctx;
      if (ctx && typeof ctx === 'object' && ctx.kisskhId != null) {
        return 'asian_drama';
      }
    }
  }
  if (simkl === 'movies') return 'movie';
  if (simkl === 'shows') return 'tv';
  if (mt === 'tv' || mt === 'series') return 'tv';
  return 'movie';
}

function simklCardItem(item) {
  if (!item || typeof item !== 'object') return null;
  var media = item.show || item.movie || item.anime || item;
  if (!media || typeof media !== 'object') return null;
  var ids =
    media.ids && typeof media.ids === 'object' ? media.ids : {};
  var title = media.title != null ? String(media.title) : '';
  if (!title) return null;
  var kind = item._simklType != null ? String(item._simklType) : 'movies';
  var poster = media.poster != null ? String(media.poster) : '';
  var posterUrl = !poster
    ? ''
    : poster.indexOf('http') === 0
      ? poster
      : 'https://simkl.in/posters/' + poster + '_c.jpg';
  var year = media.year != null ? String(media.year) : '';
  return {
    title: title,
    posterPath: posterUrl,
    source: 'simkl',
    mediaType:
      kind === 'anime' ? 'anime' : kind === 'movies' ? 'movie' : 'tv',
    _simklType: kind,
    tmdbId: asInt(ids.tmdb),
    imdbId: ids.imdb != null ? String(ids.imdb) : undefined,
    voteAverage: 0,
    releaseDate: year,
  };
}

function openIdInt(openRaw) {
  if (!openRaw || typeof openRaw !== 'object') return null;
  return asInt(openRaw.id);
}

function localMatch(allLocal, item) {
  var tmdb = asInt(item.tmdbId);
  var mt = item.mediaType != null ? String(item.mediaType) : null;
  var remoteKeys = hideKeys(item);
  var remoteOpenIds = {};
  [item.tmdbId].forEach(function (v) {
    var n = asInt(v);
    if (n != null) remoteOpenIds[n] = true;
  });
  for (var i = 0; i < allLocal.length; i++) {
    var local = allLocal[i];
    var localKeys = hideKeys(local);
    var hit = false;
    for (var k = 0; k < remoteKeys.length; k++) {
      if (localKeys.indexOf(remoteKeys[k]) >= 0) {
        hit = true;
        break;
      }
    }
    if (hit) return local;
    var oid = openIdInt(local.metaOpen || local.open || local.catalogOpen);
    if (oid != null && remoteOpenIds[oid]) return local;
    if (tmdb != null && asInt(local.tmdbId) === tmdb) {
      var lmt = local.mediaType != null ? String(local.mediaType) : null;
      if (lmt === 'asian_drama' || lmt === 'drama') return local;
      if (mt == null || lmt == null || lmt === mt) return local;
      var localNorm = lmt === 'tv' || lmt === 'series' ? 'tv' : lmt;
      var itemNorm =
        mt === 'tv' || mt === 'series' || mt === 'shows' ? 'tv' : mt;
      if (localNorm === itemNorm) return local;
    }
  }
  return null;
}

function filterSimklByLocal(simklItems, allLocal, status, hiddenKeys) {
  var out = [];
  var hidden = {};
  if (Array.isArray(hiddenKeys)) {
    for (var h = 0; h < hiddenKeys.length; h++) {
      hidden[String(hiddenKeys[h])] = true;
    }
  }
  for (var i = 0; i < simklItems.length; i++) {
    var s = simklItems[i];
    var keys = hideKeys(s);
    var skip = false;
    for (var k = 0; k < keys.length; k++) {
      if (hidden[keys[k]]) {
        skip = true;
        break;
      }
    }
    if (skip) continue;
    var local = localMatch(allLocal, s);
    if (local) {
      var localStatus =
        local.listStatus != null ? String(local.listStatus) : 'plantowatch';
      if (localStatus !== status) continue;
    }
    out.push(s);
  }
  return out;
}

function mergeLocalHubs(simklItems, localForStatus) {
  var out = simklItems.slice();
  var seenTmdb = {};
  for (var i = 0; i < simklItems.length; i++) {
    var t = asInt(simklItems[i].tmdbId);
    if (t != null) seenTmdb[t] = true;
  }
  for (var j = 0; j < localForStatus.length; j++) {
    var local = localForStatus[j];
    var open = local.metaOpen || local.open || local.catalogOpen;
    var surface =
      open && typeof open === 'object' ? String(open.surface || '') : '';
    if (surface === 'anime' || local.mediaType === 'anime') {
      out.push(local);
      continue;
    }
    if (surface === 'drama' || local.mediaType === 'asian_drama') {
      var tmdbD = asInt(local.tmdbId);
      if (tmdbD != null && seenTmdb[tmdbD]) continue;
      out.push(local);
      if (tmdbD != null) seenTmdb[tmdbD] = true;
      continue;
    }
    var tmdb = asInt(local.tmdbId);
    if (tmdb != null && seenTmdb[tmdb]) continue;
    out.push(local);
    if (tmdb != null) seenTmdb[tmdb] = true;
  }
  return out;
}

function myListShapeRow(row) {
  if (!row || typeof row !== 'object') return null;
  var out = Object.assign({}, row);
  if (!out.name && out.title) out.name = out.title;
  if (!out.poster && out.posterPath) out.poster = String(out.posterPath);
  if (!out.background && (out.backdropPath || out.posterPath)) {
    out.background = String(out.backdropPath || out.posterPath);
  }
  var kind = myListKindFromRow(out);
  out.kind = kind;
  if (!out.type) out.type = kind;
  if (!out.listStatus && out.status) out.listStatus = String(out.status);
  var storedOpen = out.open || out.metaOpen || out.catalogOpen;
  if (storedOpen && typeof storedOpen === 'object') {
    out.open = storedOpen;
    out.metaOpen = storedOpen;
  }
  return out;
}

function myListLoadFeed(ctx, params) {
  var host = ctx && ctx.host;
  var bookmarks = host && host.bookmarks;
  var simkl = host && host.simkl;
  if (!bookmarks || typeof bookmarks.list !== 'function') {
    return Promise.reject(new Error('HOST_LISTS_REQUIRED'));
  }
  var status =
    (params && (params.status || params.listStatus)) || 'plantowatch';
  status = String(status);
  var hiddenKeys = (params && params.hiddenKeys) || [];

  return Promise.resolve(bookmarks.list({})).then(function (allLocal) {
    if (!Array.isArray(allLocal)) allLocal = [];
    var localForStatus = [];
    for (var i = 0; i < allLocal.length; i++) {
      var e = allLocal[i];
      var st =
        e && e.listStatus != null ? String(e.listStatus) : 'plantowatch';
      if (st === status) localForStatus.push(e);
    }

    function finish(merged) {
      var out = [];
      for (var i = 0; i < merged.length; i++) {
        var shaped = myListShapeRow(merged[i]);
        if (shaped) out.push(shaped);
      }
      return out;
    }

    if (!simkl || typeof simkl.isLoggedIn !== 'function') {
      return finish(localForStatus);
    }

    return Promise.resolve(simkl.isLoggedIn()).then(function (loggedIn) {
      if (!loggedIn || typeof simkl.watchlist !== 'function') {
        return finish(localForStatus);
      }
      return Promise.resolve(simkl.watchlist({ status: status })).then(
        function (raw) {
          if (!Array.isArray(raw)) return finish(localForStatus);
          var cards = [];
          for (var i = 0; i < raw.length; i++) {
            var card = simklCardItem(raw[i]);
            if (card) cards.push(card);
          }
          var filtered = filterSimklByLocal(
            cards,
            allLocal,
            status,
            hiddenKeys,
          );
          return finish(mergeLocalHubs(filtered, localForStatus));
        },
      );
    });
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);
  if (action === 'layout') {
    return hubOk('layout', myListLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'feed' || action === 'rail') {
    return myListLoadFeed(ctx, params).then(function (items) {
      return hubItems(action, items, { maxAge: 30, swr: 120 });
    });
  }
  return hubFail(
    action,
    'INVALID_ACTION',
    'my-list hub: layout + feed/rail only',
  );
}
