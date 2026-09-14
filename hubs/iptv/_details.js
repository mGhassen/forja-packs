// IPTV VOD details — portal movie/series meta (+ series episodes via vault + host http).

function iptvEpisodeVideos(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var e = raw[i] || {};
    var id = String(e.id || e.episodeId || '').trim();
    if (!id) continue;
    var season = Number(e.season);
    var episode = Number(e.episode);
    out.push({
      id: id,
      title:
        String(e.title || e.name || '').trim() ||
        'Episode ' + (episode > 0 ? episode : i + 1),
      season: season > 0 ? season : 1,
      episode: episode > 0 ? episode : i + 1,
      thumbnail: String(e.image || e.thumbnail || '').trim(),
    });
  }
  out.sort(function (a, b) {
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });
  return out;
}

async function iptvFindPortalByKey(ctx, portalKey) {
  var portals = await iptvLoadPortals(ctx);
  if (!Array.isArray(portals)) return null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvPortalKey(portals[i]) === portalKey) return portals[i];
  }
  return null;
}

async function iptvFetchSeriesEpisodes(ctx, portal, seriesId) {
  var host = (ctx && ctx.host) || {};
  var request = host.http && host.http.request;
  if (typeof request !== 'function') return [];
  var base = iptvNormBase(portal.url);
  var url =
    base +
    '/player_api.php?username=' +
    encodeURIComponent(portal.username) +
    '&password=' +
    encodeURIComponent(portal.password) +
    '&action=get_series_info&series_id=' +
    encodeURIComponent(seriesId);
  var res = await request({ method: 'GET', url: url, timeoutMs: 45000 });
  var json = iptvParseJsonBody(res);
  if (!json || typeof json !== 'object') return [];
  var episodes = json.episodes;
  var out = [];
  if (Array.isArray(episodes)) {
    return iptvEpisodeVideos(episodes);
  }
  if (episodes && typeof episodes === 'object') {
    Object.keys(episodes).forEach(function (seasonKey) {
      var list = episodes[seasonKey];
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var e = list[i] || {};
        out.push({
          id: String(e.id || e.episode_id || '').trim(),
          title: String(e.title || e.name || '').trim(),
          season: Number(e.season || seasonKey) || 1,
          episode: Number(e.episode_num || e.episode || i + 1) || i + 1,
          image: String(
            (e.info && (e.info.movie_image || e.info.cover)) || e.movie_image || '',
          ).trim(),
          plot: String((e.info && e.info.plot) || e.plot || '').trim(),
        });
      }
    });
  }
  return iptvEpisodeVideos(out);
}

async function iptvVodDetails(ctx, params) {
  var streamId = String(params.streamId || params.id || '').trim();
  var portalKey = String(params.portalKey || '').trim();
  if (!streamId || !portalKey) {
    return hubFail(
      'details',
      'INVALID_PARAMS',
      'details needs portalKey and streamId',
    );
  }

  var kind = String(params.kind || '').trim();
  var isMovie =
    kind === 'vod' ||
    kind === 'movie' ||
    params.movie === true ||
    params.movie === 'true';
  var type = isMovie ? 'movie' : 'tv';
  var name = String(params.name || params.title || '').trim() || 'Unknown';
  var icon = String(params.icon || params.poster || '').trim();
  var plot = String(params.plot || params.description || '').trim();

  var videos = iptvEpisodeVideos(params.portalEpisodes || params.episodes);
  if (!isMovie && !videos.length) {
    var portal = await iptvFindPortalByKey(ctx, portalKey);
    if (portal) {
      videos = await iptvFetchSeriesEpisodes(ctx, portal, streamId);
      if (!plot && videos.length) {
        plot = String(videos[0].plot || '').trim();
      }
    }
  }

  var metaId = 'iptv:' + portalKey + ':' + streamId;
  var meta = {
    id: metaId,
    type: type,
    name: name,
    poster: icon,
    background: icon,
    description: plot,
    badge: isMovie ? 'MOVIE' : 'TV',
    open: {
      surface: 'iptv',
      id: streamId,
      movie: isMovie,
      kind: kind || (isMovie ? 'vod' : 'series'),
      portalKey: portalKey,
      streamName: name,
      streamIcon: icon,
      categoryId: String(params.categoryId || ''),
      containerExt: String(params.containerExt || ''),
      platform: String(params.platform || 'xtream'),
      extract: {
        resolveType: 'iptv',
        panelCategory: 'iptv',
        ctx: {
          portalKey: portalKey,
          streamId: streamId,
          kind: kind || (isMovie ? 'vod' : 'series'),
          platform: String(params.platform || 'xtream'),
          containerExt: String(params.containerExt || ''),
          categoryId: String(params.categoryId || ''),
        },
      },
    },
  };

  if (videos.length) meta.videos = videos;
  return hubOk('details', { meta: meta }, { maxAge: 300, swr: 900 });
}
