// IPTV pack prefs — vault SoT per portal + section (live sort, pins, favs, watched, layout).

var IPTV_VAULT_PORTALS = 'iptv.portals';
var IPTV_VAULT_ACTIVE = 'iptv.active';
var IPTV_VAULT_PREFS_PREFIX = 'iptv.prefs.';

function iptvHost(ctx) {
  return (ctx && ctx.host) || {};
}

function iptvVault(ctx) {
  return iptvHost(ctx).vault || null;
}

function iptvHttp(ctx) {
  var host = iptvHost(ctx);
  if (host.http && typeof host.http.request === 'function') {
    return host.http.request.bind(host.http);
  }
  return null;
}

function iptvEngine(ctx) {
  var host = iptvHost(ctx);
  if (host.engine && typeof host.engine.request === 'function') {
    return host.engine.request.bind(host.engine);
  }
  return null;
}

function iptvCache(ctx) {
  return iptvHost(ctx).cache || null;
}

function iptvPlayback(ctx) {
  return iptvHost(ctx).playback || null;
}

function iptvNormBase(url) {
  var u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/player_api\.php$/i, '');
}

function iptvPortalKey(portal) {
  if (!portal) return '';
  if (portal.key) return String(portal.key).trim();
  return (
    String(portal.url || '').trim().toLowerCase() +
    '|' +
    String(portal.username || '').trim().toLowerCase()
  );
}

function iptvPrefsKey(portalKey, section) {
  var pk = String(portalKey || '').trim();
  var sec = String(section || 'live').trim().toLowerCase() || 'live';
  return IPTV_VAULT_PREFS_PREFIX + pk + '.' + sec;
}

function iptvPrefsDefaults() {
  return {
    liveSort: 'playlist',
    pinnedCats: [],
    favorites: [],
    watched: [],
    layout: 'cards',
  };
}

function iptvPrefsNormalize(raw) {
  var d = iptvPrefsDefaults();
  if (!raw || typeof raw !== 'object') return d;
  var sort = String(raw.liveSort || raw.sort || d.liveSort).trim();
  if (sort !== 'playlist' && sort !== 'nameAsc' && sort !== 'nameDesc') {
    sort = d.liveSort;
  }
  var layout = String(raw.layout || d.layout).trim().toLowerCase();
  if (layout === 'guide') layout = 'epg';
  if (layout !== 'cards' && layout !== 'epg') layout = d.layout;
  var pinned = Array.isArray(raw.pinnedCats) ? raw.pinnedCats : [];
  var favs = Array.isArray(raw.favorites) ? raw.favorites : [];
  var watched = Array.isArray(raw.watched) ? raw.watched : [];
  return {
    liveSort: sort,
    pinnedCats: pinned.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    favorites: favs.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    watched: watched.map(function (x) { return String(x || '').trim(); }).filter(Boolean),
    layout: layout,
  };
}

async function iptvPrefsLoad(ctx, portalKey, section) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return iptvPrefsDefaults();
  var key = iptvPrefsKey(portalKey, section);
  try {
    var raw = await vault.get(key);
    if (!raw) return iptvPrefsDefaults();
    return iptvPrefsNormalize(JSON.parse(String(raw)));
  } catch (e) {
    return iptvPrefsDefaults();
  }
}

async function iptvPrefsSave(ctx, portalKey, section, prefs) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  var key = iptvPrefsKey(portalKey, section);
  try {
    await vault.set(key, JSON.stringify(iptvPrefsNormalize(prefs)));
    return true;
  } catch (e) {
    return false;
  }
}
