// TMDB hydrate for My List legacy rows — companion to my-list-hub.
// Host schedules this after MetaRuntime feed returns (background enrich cache).

function myListTmdbAbs(path, size) {
  var p = String(path || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return 'https://image.tmdb.org/t/p/' + (size || 'w500') + p;
}

function myListPickTitleLogo(images) {
  var logos = images && Array.isArray(images.logos) ? images.logos : [];
  if (!logos.length) return '';
  var en = null;
  var nul = null;
  var first = null;
  for (var i = 0; i < logos.length; i++) {
    var L = logos[i];
    if (!L || !L.file_path) continue;
    if (!first) first = L;
    var lang = L.iso_639_1;
    if (lang === 'en' && !en) en = L;
    if ((lang == null || lang === '') && !nul) nul = L;
  }
  var chosen = en || nul || first;
  return chosen ? myListTmdbAbs(chosen.file_path, 'w500') : '';
}

function myListNeedsEnrich(row) {
  if (!row || typeof row !== 'object') return false;
  var tmdbId = Number(row.tmdbId);
  if (!(tmdbId > 0)) return false;
  // Hydrate missing art/meta even when anilistId / kisskhId / catalogOpen
  // are set — those skip only blocked TMDB poster fill before.
  var poster = String(row.posterPath || row.poster || '').trim();
  var title = String(row.title || '').trim();
  var vote = row.voteAverage;
  var logo = String(row.logo || '').trim();
  return (
    !poster ||
    !title ||
    vote == null ||
    Number(vote) === 0 ||
    !logo
  );
}

function myListMediaType(row) {
  var kind = String(row._simklType || '');
  var mt = String(row.mediaType || 'movie');
  var tmdbMt = String(row.tmdbMediaType || '').trim();
  if (tmdbMt === 'tv' || tmdbMt === 'movie') return tmdbMt;
  // Anime / drama / Simkl shows map to TMDB tv.
  if (
    kind === 'anime' ||
    kind === 'shows' ||
    mt === 'anime' ||
    mt === 'tv' ||
    mt === 'series' ||
    mt === 'asian_drama' ||
    mt === 'drama'
  ) {
    return 'tv';
  }
  return 'movie';
}

function myListApplyTmdbDetails(row, data, mediaType) {
  if (!row || !data) return row;
  var next = Object.assign({}, row);
  var title = String(data.title || data.name || '').trim();
  var poster = myListTmdbAbs(data.poster_path, 'w500');
  var backdrop = myListTmdbAbs(data.backdrop_path, 'w1280');
  var logo = myListPickTitleLogo(data.images);
  var vote = Number(data.vote_average);
  var date = String(data.release_date || data.first_air_date || '');
  if (title) next.title = title;
  if (poster) {
    next.posterPath = poster;
    next.poster = poster;
  }
  if (backdrop) {
    next.backdropPath = backdrop;
    next.background = backdrop;
  }
  if (logo) next.logo = logo;
  if (vote > 0) next.voteAverage = vote;
  if (date) next.releaseDate = date;
  // Never invent a tmdb open for hub bookmarks (anime/drama) — that would
  // reopen them on Home providers.
  var hubMt = String(next.mediaType || '');
  var isHub =
    hubMt === 'anime' ||
    hubMt === 'drama' ||
    hubMt === 'asian_drama' ||
    next.anilistId != null ||
    next.kisskhId != null ||
    (next.pluginId && String(next.pluginId) !== 'tmdb');
  var hasOpen = !!(next.metaOpen || next.open || next.catalogOpen);
  if (!hasOpen && !isHub) {
    var tmdbOpen = {
      surface: 'tmdb',
      id: String(data.id),
      extract: {
        resolveType: mediaType,
        panelCategory: mediaType,
        ctx: { tmdbId: Number(data.id) },
      },
    };
    next.catalogOpen = tmdbOpen;
    next.metaOpen = tmdbOpen;
    next.open = tmdbOpen;
  }
  return next;
}

function hubTmdbGetDetails(ctx, mediaType, id) {
  var n = Number(id);
  if (!(n > 0)) return Promise.resolve(null);
  var media = String(mediaType || 'movie') === 'tv' ? 'tv' : 'movie';
  var cfg = hubConfig(ctx, {});
  var key = String(cfg.apiKey || '').trim();
  if (!key) return Promise.resolve(null);
  var url =
    'https://api.themoviedb.org/3/' +
    media +
    '/' +
    n +
    '?api_key=' +
    encodeURIComponent(key) +
    '&append_to_response=images';
  return ctx
    .fetch(url)
    .then(function (res) {
      if (!res.ok) return null;
      return res.json();
    })
    .then(function (json) {
      if (!json || json.success === false || json.status_code) return null;
      return json;
    })
    .catch(function () {
      return null;
    });
}

function hubEnrichMyListRows(ctx, items, limit) {
  if (!Array.isArray(items) || !items.length) return Promise.resolve(items || []);
  var n = Number(limit) > 0 ? Number(limit) : items.length;
  var out = items.slice();
  var jobs = [];
  for (var i = 0; i < out.length && jobs.length < n; i++) {
    if (!myListNeedsEnrich(out[i])) continue;
    (function (idx) {
      jobs.push(
        hubTmdbGetDetails(ctx, myListMediaType(out[idx]), out[idx].tmdbId).then(
          function (data) {
            if (!data) return;
            out[idx] = myListApplyTmdbDetails(
              out[idx],
              data,
              myListMediaType(out[idx]),
            );
          },
        ),
      );
    })(i);
  }
  if (!jobs.length) return Promise.resolve(out);
  return Promise.all(jobs).then(function () {
    return out;
  });
}

function extract(ctx) {
  var action = hubAction(ctx);
  if (action !== 'enrich') {
    return hubFail(
      action,
      'INVALID_ACTION',
      'my-list-enrich-tmdb only supports action enrich',
    );
  }

  var params = hubParams(ctx);
  var items = Array.isArray(params.items) ? params.items : [];
  var limit = Number(params.limit) > 0 ? Number(params.limit) : items.length;

  return hubEnrichMyListRows(ctx, items, limit)
    .then(function (out) {
      return hubOk('enrich', { items: out }, { maxAge: 600, swr: 3600 });
    })
    .catch(function (e) {
      return hubFail('enrich', 'UPSTREAM', e && e.message, true);
    });
}
