// IPTV hub — portals in vault, Xtream live catalog via ctx.host.http,
// play via open.surface stream / ctx.host.playback.open (RFC-109 Wave C).

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
                  id: 'refresh',
                  label: 'Refresh',
                  icon: 'refresh',
                  action: 'refresh',
                },
              ],
            }),
            kitCategoryBar('cats', {
              source: 'iptv_categories',
              focusUp: 'chrome',
              focusDown: 'channels',
            }),
            kitList('channels', {
              source: 'iptv_channels',
              style: 'list',
              expand: true,
              focusUp: 'cats',
              categoryBar: 'cats',
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
  return (iptvHost(ctx).vault) || null;
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
      qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(extra[k]));
    });
  }
  var url = base + '/player_api.php?' + qs;
  var res = await request({ method: 'GET', url: url, timeoutMs: 30000 });
  return iptvParseJsonBody(res);
}

function iptvLiveStreamUrl(portal, stream) {
  var base = iptvNormBase(portal.url);
  var ext = String((stream && stream.container_extension) || 'ts').replace(/^\./, '');
  if (!ext) ext = 'ts';
  var id = String((stream && (stream.stream_id || stream.id)) || '').trim();
  if (!id) return '';
  return (
    base +
    '/live/' +
    encodeURIComponent(portal.username) +
    '/' +
    encodeURIComponent(portal.password) +
    '/' +
    encodeURIComponent(id) +
    '.' +
    ext
  );
}

function iptvChannelMeta(portal, stream, categoryName) {
  var id = String(stream.stream_id || stream.id || '').trim();
  var name = String(stream.name || stream.title || 'Channel').trim() || 'Channel';
  var logo = String(stream.stream_icon || stream.logo || '').trim();
  var url = iptvLiveStreamUrl(portal, stream);
  var catId = String(stream.category_id || '').trim();
  return {
    id: 'iptv:' + iptvPortalKey(portal) + ':' + id,
    type: 'iptv',
    name: name,
    poster: logo || undefined,
    description: categoryName || '',
    open: {
      surface: 'stream',
      id: url,
      url: url,
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    },
    categoryId: catId,
    portalKey: iptvPortalKey(portal),
    streamId: id,
  };
}

async function iptvFeedCategories(ctx, portal) {
  var json = await iptvPlayerApi(ctx, portal, 'get_live_categories');
  if (!Array.isArray(json)) return [];
  var items = [];
  for (var i = 0; i < json.length; i++) {
    var c = json[i];
    if (!c) continue;
    var id = String(c.category_id || c.id || '').trim();
    var name = String(c.category_name || c.name || '').trim();
    if (!id) continue;
    items.push({
      id: id,
      type: 'category',
      name: name || id,
      open: { surface: 'iptv_category', id: id },
    });
  }
  return items;
}

async function iptvFeedChannels(ctx, portal, categoryId) {
  var extra = {};
  if (categoryId) extra.category_id = categoryId;
  var json = await iptvPlayerApi(ctx, portal, 'get_live_streams', extra);
  if (!Array.isArray(json)) return [];
  var cats = await iptvFeedCategories(ctx, portal);
  var catName = '';
  for (var i = 0; i < cats.length; i++) {
    if (cats[i].id === String(categoryId || '')) {
      catName = cats[i].name;
      break;
    }
  }
  var items = [];
  for (var j = 0; j < json.length; j++) {
    var s = json[j];
    if (!s) continue;
    if (categoryId && String(s.category_id || '') !== String(categoryId)) continue;
    var meta = iptvChannelMeta(portal, s, catName);
    if (meta.open && meta.open.url) items.push(meta);
  }
  return items;
}

async function iptvFeed(ctx) {
  var params = hubParams(ctx);
  var source = String(params.source || params.list || 'iptv_channels');
  var portal = await iptvResolveActive(ctx);
  if (!portal) {
    return hubItems('feed', [
      {
        id: 'iptv:setup',
        type: 'message',
        name: 'Add a portal in Settings → Addons → IPTV',
        description: 'Enter Xtream URL, username, and password, then refresh.',
      },
    ]);
  }

  try {
    if (source === 'iptv_categories' || source === 'categories') {
      return hubItems('feed', await iptvFeedCategories(ctx, portal));
    }
    if (source === 'iptv_portals' || source === 'portals') {
      var portals = await iptvLoadPortals(ctx);
      var active = await iptvGetActiveKey(ctx);
      return hubItems(
        'feed',
        portals.map(function (p) {
          var key = iptvPortalKey(p);
          return {
            id: 'portal:' + key,
            type: 'portal',
            name: String(p.label || p.username || key),
            description: p.url,
            badge: key === active ? 'Active' : '',
            open: { surface: 'iptv_portal', id: key },
            portalKey: key,
          };
        }),
      );
    }
    var filter = params.filter;
    var categoryId =
      hubFilterValue(filter, 'category') ||
      String(params.categoryId || params.category_id || '').trim();
    return hubItems('feed', await iptvFeedChannels(ctx, portal, categoryId));
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
    var streams = await iptvFeedChannels(ctx, portal, '');
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
  return hubOk('addPortal', { portal: { key: portal.key, label: portal.label, url: portal.url } });
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
    return hubOk('layout', { layout: iptvLayout() });
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
