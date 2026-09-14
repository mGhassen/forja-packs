// IPTV VOD details — portal meta (+ series episodes via vault + host http).

var IPTV_VAULT_PORTALS = 'iptv.portals';

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

function iptvNormBase(url) {
  var u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/player_api\.php$/i, '');
}

function iptvPortalKey(portal) {
  if (!portal) return '';
  return (
    String(portal.url || '').trim().toLowerCase() +
    '|' +
    String(portal.username || '').trim().toLowerCase()
  );
}

async function iptvLoadPortal(ctx, portalKey) {
  var host = (ctx && ctx.host) || {};
  var vault = host.vault;
  if (!vault || typeof vault.get !== 'function') return null;
  try {
    var raw = await vault.get(IPTV_VAULT_PORTALS);
    if (!raw) return null;
    var parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return null;
    for (var i = 0; i < parsed.length; i++) {
      if (iptvPortalKey(parsed[i]) === portalKey) return parsed[i];
    }
  } catch (e) {}
  return null;
}

function iptvParseJsonBody(res) {
  if (!res || !res.ok) return null;
  var body = res.body;
  if (body == null) return null;
  if (typeof body === 'object') return body;
  var s = String(body).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
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
    var portal = await iptvLoadPortal(ctx, portalKey);
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

function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);

  if (action === 'details') {
    return iptvVodDetails(ctx, params);
  }

  return hubFail(action, 'INVALID_ACTION', 'iptv-vod only supports action details');
}
