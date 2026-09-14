// IPTV hub — portals in vault; Xtream Live / Movies / Series browse via
// ctx.host.http; live play via open.surface stream; VOD via open.surface iptv
// → iptv-vod details. Same product surface as pre–Wave C Xtream browse.

var IPTV_VAULT_PORTALS = 'iptv.portals';
var IPTV_VAULT_ACTIVE = 'iptv.active';

function iptvLayout() {
  return {
    pages: {
      iptv: {
        widgets: [
          kitStack('page', { expand: true }, [
            kitTopBar('chrome', {
              focusDown: 'cats',
              actions: [
                {
                  id: 'catalog',
                  label: 'Section',
                  icon: 'live_tv',
                  default: 'live',
                  items: [
                    { id: 'live', label: 'Live' },
                    { id: 'movies', label: 'Movies' },
                    { id: 'series', label: 'Series' },
                  ],
                },
                {
                  id: 'refresh',
                  label: 'Refresh',
                  icon: 'refresh',
                  action: 'refresh',
                },
              ],
            }),
            kitCategoryBar('cats', {
              dynamic: true,
              source: 'iptv',
              focusUp: 'chrome',
              focusDown: 'items',
              default: 'all',
            }),
            kitList('items', {
              source: 'iptv',
              style: 'grid',
              expand: true,
              focusUp: 'cats',
              kindMenu: 'cats',
              catalogMenu: 'catalog',
            }),
          ]),
        ],
      },
    },
  };
}

function iptvHost(ctx) {
  return (ctx && ctx.host) || {};
}

function iptvHttp(ctx) {
  var host = iptvHost(ctx);
  if (host.http && typeof host.http.request === 'function') {
    return host.http.request.bind(host.http);
  }
  return null;
}

function iptvVault(ctx) {
  return iptvHost(ctx).vault || null;
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

async function iptvLoadPortals(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return [];
  try {
    var raw = await vault.get(IPTV_VAULT_PORTALS);
    if (!raw) return [];
    var parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function iptvSavePortals(ctx, portals) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    await vault.set(IPTV_VAULT_PORTALS, JSON.stringify(portals || []));
    return true;
  } catch (e) {
    return false;
  }
}

async function iptvGetActiveKey(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return '';
  try {
    var k = await vault.get(IPTV_VAULT_ACTIVE);
    return k ? String(k) : '';
  } catch (e) {
    return '';
  }
}

async function iptvSetActiveKey(ctx, key) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    if (!key) await vault.remove(IPTV_VAULT_ACTIVE);
    else await vault.set(IPTV_VAULT_ACTIVE, String(key));
    return true;
  } catch (e) {
    return false;
  }
}

async function iptvUpsertFromSettings(ctx) {
  var cfg = hubConfig(ctx, {});
  var url = iptvNormBase(cfg.portalUrl || cfg.portal_url || '');
  var username = String(cfg.portalUsername || cfg.portal_username || '').trim();
  var password = String(cfg.portalPassword || cfg.portal_password || '').trim();
  var label = String(cfg.portalLabel || cfg.portal_label || '').trim();
  if (!url || !username || !password) return null;

  var portal = {
    url: url,
    username: username,
    password: password,
    label: label || username,
    platform: 'xtream',
  };
  var key = iptvPortalKey(portal);
  portal.key = key;

  var portals = await iptvLoadPortals(ctx);
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvPortalKey(portals[i]) === key) {
      portals[i] = portal;
      found = true;
      break;
    }
  }
  if (!found) portals.push(portal);
  await iptvSavePortals(ctx, portals);
  await iptvSetActiveKey(ctx, key);
  return portal;
}

async function iptvResolveActive(ctx) {
  var fromSettings = await iptvUpsertFromSettings(ctx);
  var portals = await iptvLoadPortals(ctx);
  if (!portals.length) return fromSettings;

  var active = await iptvGetActiveKey(ctx);
  if (active) {
    for (var i = 0; i < portals.length; i++) {
      if (iptvPortalKey(portals[i]) === active) return portals[i];
    }
  }
  if (fromSettings) return fromSettings;
  return portals[0];
}

async function iptvPlayerApi(ctx, portal, action, extra) {
  var request = iptvHttp(ctx);
  if (!request) throw new Error('HOST_HTTP_REQUIRED');
  var base = iptvNormBase(portal.url);
  var qs =
    'username=' +
    encodeURIComponent(portal.username) +
    '&password=' +
    encodeURIComponent(portal.password);
  if (action) qs += '&action=' + encodeURIComponent(action);
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(function (k) {
      if (extra[k] == null || extra[k] === '') return;
      qs +=
        '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(extra[k]));
    });
  }
  var url = base + '/player_api.php?' + qs;
  var res = await request({ method: 'GET', url: url, timeoutMs: 45000 });
  return iptvParseJsonBody(res);
}

function iptvStreamPath(portal, kind, id, ext) {
  var base = iptvNormBase(portal.url);
  var e = String(ext || 'ts').replace(/^\./, '');
  if (!e) e = kind === 'live' ? 'ts' : 'mp4';
  var sid = String(id || '').trim();
  if (!sid) return '';
  var folder = kind === 'movie' || kind === 'vod' ? 'movie' : kind === 'series' ? 'series' : 'live';
  return (
    base +
    '/' +
    folder +
    '/' +
    encodeURIComponent(portal.username) +
    '/' +
    encodeURIComponent(portal.password) +
    '/' +
    encodeURIComponent(sid) +
    '.' +
    e
  );
}

function iptvCatMap(categories) {
  var map = {};
  if (!Array.isArray(categories)) return map;
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    if (!c) continue;
    var id = String(c.category_id || c.id || '').trim();
    if (!id) continue;
    map[id] = String(c.category_name || c.name || id).trim() || id;
  }
  return map;
}

async function iptvLoadCatMap(ctx, portal, section) {
  var action =
    section === 'movies'
      ? 'get_vod_categories'
      : section === 'series'
        ? 'get_series_categories'
        : 'get_live_categories';
  return iptvCatMap(await iptvPlayerApi(ctx, portal, action));
}

function iptvLiveMeta(portal, stream, catName) {
  var id = String(stream.stream_id || stream.id || '').trim();
  var name = String(stream.name || stream.title || 'Channel').trim() || 'Channel';
  var logo = String(stream.stream_icon || stream.logo || '').trim();
  var ext = String(stream.container_extension || 'ts').replace(/^\./, '');
  var url = iptvStreamPath(portal, 'live', id, ext);
  var catId = String(stream.category_id || '').trim() || 'all';
  var pkey = iptvPortalKey(portal);
  return {
    id: 'iptv:live:' + pkey + ':' + id,
    type: 'iptv',
    kind: catId,
    categoryName: catName || catId,
    name: name,
    poster: logo || undefined,
    description: catName || '',
    open: {
      surface: 'stream',
      id: url,
      url: url,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    },
    portalKey: pkey,
    streamId: id,
    categoryId: catId,
  };
}

function iptvVodMeta(portal, stream, section, catName) {
  var id = String(stream.stream_id || stream.series_id || stream.id || '').trim();
  var name = String(stream.name || stream.title || 'Title').trim() || 'Title';
  var logo = String(
    stream.stream_icon || stream.cover || stream.poster || stream.logo || '',
  ).trim();
  var catId = String(stream.category_id || '').trim() || 'all';
  var pkey = iptvPortalKey(portal);
  var isMovie = section === 'movies';
  var ext = String(stream.container_extension || 'mp4').replace(/^\./, '');
  var kind = isMovie ? 'vod' : 'series';
  return {
    id: 'iptv:' + kind + ':' + pkey + ':' + id,
    type: isMovie ? 'movie' : 'tv',
    kind: catId,
    categoryName: catName || catId,
    name: name,
    poster: logo || undefined,
    background: logo || undefined,
    badge: isMovie ? 'MOVIE' : 'TV',
    description: catName || '',
    open: {
      surface: 'iptv',
      id: id,
      movie: isMovie,
      kind: kind,
      portalKey: pkey,
      streamId: id,
      streamName: name,
      streamIcon: logo,
      name: name,
      icon: logo,
      categoryId: catId,
      containerExt: ext,
      platform: String(portal.platform || 'xtream'),
      extract: {
        resolveType: 'iptv',
        panelCategory: 'iptv',
        ctx: {
          portalKey: pkey,
          streamId: id,
          kind: kind,
          platform: String(portal.platform || 'xtream'),
          containerExt: ext,
          categoryId: catId,
        },
      },
    },
    portalKey: pkey,
    streamId: id,
    categoryId: catId,
  };
}

async function iptvFeedLive(ctx, portal) {
  var cats = await iptvLoadCatMap(ctx, portal, 'live');
  var json = await iptvPlayerApi(ctx, portal, 'get_live_streams');
  if (!Array.isArray(json)) return [];
  var items = [];
  for (var i = 0; i < json.length; i++) {
    var s = json[i];
    if (!s) continue;
    var catId = String(s.category_id || '').trim() || 'all';
    var meta = iptvLiveMeta(portal, s, cats[catId] || catId);
    if (meta.open && meta.open.url) items.push(meta);
  }
  return items;
}

async function iptvFeedMovies(ctx, portal) {
  var cats = await iptvLoadCatMap(ctx, portal, 'movies');
  var json = await iptvPlayerApi(ctx, portal, 'get_vod_streams');
  if (!Array.isArray(json)) return [];
  var items = [];
  for (var i = 0; i < json.length; i++) {
    var s = json[i];
    if (!s) continue;
    var catId = String(s.category_id || '').trim() || 'all';
    items.push(iptvVodMeta(portal, s, 'movies', cats[catId] || catId));
  }
  return items;
}

async function iptvFeedSeries(ctx, portal) {
  var cats = await iptvLoadCatMap(ctx, portal, 'series');
  var json = await iptvPlayerApi(ctx, portal, 'get_series');
  if (!Array.isArray(json)) return [];
  var items = [];
  for (var i = 0; i < json.length; i++) {
    var s = json[i];
    if (!s) continue;
    var catId = String(s.category_id || '').trim() || 'all';
    items.push(iptvVodMeta(portal, s, 'series', cats[catId] || catId));
  }
  return items;
}

function iptvSection(params) {
  var raw = String(
    (params && (params.catalogFilter || params.section || params.source)) ||
      'live',
  )
    .trim()
    .toLowerCase();
  if (raw === 'movies' || raw === 'movie' || raw === 'vod') return 'movies';
  if (raw === 'series' || raw === 'tv') return 'series';
  return 'live';
}

async function iptvFeed(ctx) {
  var params = hubParams(ctx);
  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    return hubItems('feed', [
      {
        id: 'iptv:setup',
        type: 'message',
        kind: 'all',
        name: 'Add a portal in Settings → Addons → IPTV',
        description: 'Enter Xtream URL, username, and password, then refresh.',
      },
    ]);
  }

  try {
    var section = iptvSection(params);
    var items =
      section === 'movies'
        ? await iptvFeedMovies(ctx, portal)
        : section === 'series'
          ? await iptvFeedSeries(ctx, portal)
          : await iptvFeedLive(ctx, portal);
    return hubItems('feed', items);
  } catch (e) {
    return hubFail('feed', 'UPSTREAM', String((e && e.message) || e), true);
  }
}

function iptvNormToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function iptvChannelMatchesGame(name, game) {
  var n = iptvNormToken(name);
  if (!n) return false;
  var home = iptvNormToken(game && game.homeTeam);
  var away = iptvNormToken(game && game.awayTeam);
  var title = iptvNormToken(game && game.title);
  var broadcasts = (game && game.broadcastChannels) || [];
  if (Array.isArray(broadcasts)) {
    for (var i = 0; i < broadcasts.length; i++) {
      var b = iptvNormToken(broadcasts[i]);
      if (b && (n.indexOf(b) >= 0 || b.indexOf(n) >= 0)) return true;
    }
  }
  if (home && away && n.indexOf(home) >= 0 && n.indexOf(away) >= 0) return true;
  if (home && n.indexOf(home) >= 0) return true;
  if (away && n.indexOf(away) >= 0) return true;
  if (title && n.indexOf(title) >= 0) return true;
  return false;
}

async function iptvSearchChannels(ctx, params) {
  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    return hubOk('searchChannels', { sources: [] }, { maxAge: 30 });
  }
  var game = (params && params.game) || {};
  var categoryIds = Array.isArray(params && params.categoryIds)
    ? params.categoryIds
    : [];
  try {
    var streams = await iptvFeedLive(ctx, portal);
    var sources = [];
    for (var i = 0; i < streams.length; i++) {
      var ch = streams[i];
      if (categoryIds.length) {
        var cid = String(ch.categoryId || '');
        if (categoryIds.indexOf(cid) < 0) continue;
      }
      if (!iptvChannelMatchesGame(ch.name, game)) continue;
      var url = ch.open && ch.open.url;
      if (!url) continue;
      sources.push({
        url: url,
        label: ch.name,
        logoUrl: ch.poster || '',
        provider: portal.label || 'IPTV',
        portalKey: ch.portalKey,
        streamId: ch.streamId,
      });
    }
    return hubOk('searchChannels', { sources: sources }, { maxAge: 60, swr: 120 });
  } catch (e) {
    return hubFail(
      'searchChannels',
      'UPSTREAM',
      String((e && e.message) || e),
      true,
    );
  }
}

async function iptvAddPortal(ctx, params) {
  var p = params || {};
  var url = iptvNormBase(p.url || p.portalUrl || '');
  var username = String(p.username || p.portalUsername || '').trim();
  var password = String(p.password || p.portalPassword || '').trim();
  var label = String(p.label || p.portalLabel || '').trim();
  if (!url || !username || !password) {
    return hubFail('addPortal', 'INVALID', 'url, username, password required');
  }
  var portal = {
    url: url,
    username: username,
    password: password,
    label: label || username,
    platform: 'xtream',
  };
  portal.key = iptvPortalKey(portal);
  var portals = await iptvLoadPortals(ctx);
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvPortalKey(portals[i]) === portal.key) {
      portals[i] = portal;
      found = true;
      break;
    }
  }
  if (!found) portals.push(portal);
  await iptvSavePortals(ctx, portals);
  await iptvSetActiveKey(ctx, portal.key);
  return hubOk('addPortal', {
    portal: { key: portal.key, label: portal.label, url: portal.url },
  });
}

async function iptvSelectPortal(ctx, params) {
  var key = String((params && (params.key || params.portalKey)) || '').trim();
  if (!key) return hubFail('selectPortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var ok = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvPortalKey(portals[i]) === key) {
      ok = true;
      break;
    }
  }
  if (!ok) return hubFail('selectPortal', 'NOT_FOUND', 'portal not found');
  await iptvSetActiveKey(ctx, key);
  return hubOk('selectPortal', { key: key });
}

async function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);
  if (action === 'layout') {
    return hubOk('layout', iptvLayout());
  }
  if (action === 'feed') {
    return await iptvFeed(ctx);
  }
  if (action === 'searchChannels') {
    return await iptvSearchChannels(ctx, params);
  }
  if (action === 'addPortal') {
    return await iptvAddPortal(ctx, params);
  }
  if (action === 'selectPortal') {
    return await iptvSelectPortal(ctx, params);
  }
  return hubFail(action, 'UNSUPPORTED', 'Unsupported action: ' + action);
}
