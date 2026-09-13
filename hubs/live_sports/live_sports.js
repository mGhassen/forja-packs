// Live Sports hub — schedule browse; list/cards + panel/details via host prefs.
// Schedule rows: MetaRuntime `feed` → pack aggregate via ctx.host.plugin.* (RFC-109).
// Live TV: MetaRuntime `liveTv` → IPTV hub `searchChannels` via plugin.run (RFC-109 C).

function liveSportsKindIcons() {
  return {
    football: 'soccer',
    soccer: 'soccer',
    fifa: 'soccer',
    'premier-league': 'soccer',
    'la-liga': 'soccer',
    'serie-a': 'soccer',
    bundesliga: 'soccer',
    'american-football': 'football',
    nfl: 'football',
    ncaaf: 'football',
    basketball: 'basketball',
    nba: 'basketball',
    ncaab: 'basketball',
    wnba: 'basketball',
    baseball: 'baseball',
    mlb: 'baseball',
    hockey: 'hockey',
    nhl: 'hockey',
    tennis: 'tennis',
    tenis: 'tennis',
    atp: 'tennis',
    cricket: 'cricket',
    krykiet: 'cricket',
    ipl: 'cricket',
    rugby: 'rugby',
    nrl: 'rugby',
    afl: 'rugby',
    'australian-football': 'rugby',
    golf: 'golf',
    volleyball: 'volleyball',
    volley: 'volleyball',
    handball: 'handball',
    wrestling: 'mma',
    wwe: 'mma',
    ufc: 'mma',
    mma: 'mma',
    boxing: 'mma',
    fight: 'mma',
    combat: 'mma',
    'combat-sports': 'mma',
    martial: 'mma',
    motor: 'motorsport',
    motorsport: 'motorsport',
    racing: 'motorsport',
    f1: 'motorsport',
    nascar: 'motorsport',
    formula: 'motorsport',
    dart: 'darts',
    darts: 'darts',
    snooker: 'billiards',
    billiard: 'billiards',
    pool: 'billiards',
    '8-ball': 'billiards',
    swim: 'swim',
    aquatic: 'swim',
    ski: 'ski',
    snow: 'ski',
    winter: 'ski',
    esport: 'esports',
    esports: 'esports',
    'e-sport': 'esports',
    gaming: 'esports',
    '24-7': 'tv',
    '24/7': 'tv',
    'live-tv': 'tv',
    livetv: 'tv',
    'tv-show': 'tv',
    stream: 'tv',
    other: 'sports',
    misc: 'sports',
    general: 'sports',
  };
}

function liveSportsCatalogActions() {
  return [
    {
      id: 'catalog',
      label: 'Catalog',
      icon: 'filter',
      dynamicCatalogs: true,
      // Host remaps chips when these revision tokens bump (install/remove Live addons).
      deps: ['stremio'],
      items: [
        { id: 'all', label: 'All' },
      ],
    },
    {
      id: 'horizon',
      label: 'Schedule',
      icon: 'schedule',
      default: 'airing|1h',
      items: [
        { id: 'airing|1h', label: 'Airing' },
        { id: 'upcoming|1h', label: 'Next · 1h' },
        { id: 'upcoming|3h', label: 'Next · 3h' },
        { id: 'upcoming|6h', label: 'Next · 6h' },
        { id: 'upcoming|24h', label: 'Next · 24h' },
        { id: 'both|1h', label: '1h' },
        { id: 'both|3h', label: '3h' },
        { id: 'both|6h', label: '6h' },
        { id: 'both|24h', label: '24h' },
      ],
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: 'refresh',
      action: 'refresh',
    },
    {
      id: 'search',
      label: 'Search',
      action: 'eventSearch',
      trailing: true,
      placeholder: 'Team, match, sport…',
    },
    {
      id: 'view',
      label: 'View',
      icon: 'view',
      trailing: true,
      items: [
        { id: 'list', label: 'List' },
        { id: 'cards', label: 'Cards' },
      ],
    },
    {
      id: 'portals',
      label: 'Portals',
      action: 'portals',
      trailing: true,
    },
  ];
}

function liveSportsLayout() {
  return {
    pages: {
      live_sports: {
        widgets: [
          kitStack('page', { expand: true }, [
            kitTopBar('chrome', {
              // ↓ from Catalog / Portals restores last schedule row (not All).
              focusDown: 'schedule',
              actions: liveSportsCatalogActions(),
            }),
            kitCategoryBar('kind', {
              source: 'live_schedule',
              dynamic: true,
              default: 'all',
              items: [{ id: 'all', label: 'All', icon: 'grid' }],
              kindIcons: liveSportsKindIcons(),
              focusUp: 'chrome',
              focusDown: 'schedule',
            }),
            kitList('schedule', {
              source: 'live_schedule',
              style: 'list',
              open: 'panel',
              openSetting: 'matchOpen',
              expand: true,
              kindMenu: 'kind',
              catalogMenu: 'catalog',
              horizonMenu: 'horizon',
              panelTab: 'providers',
              panelTabs: [
                { id: 'providers', label: 'Providers', icon: 'dns' },
                { id: 'live_tv', label: 'Live TV', icon: 'tv', browse: true, action: 'liveTv' },
              ],
              focusRight: 'sources-kind',
            }),
          ]),
        ],
      },
    },
  };
}

function liveSportsShapeRow(row) {
  if (!row || typeof row !== 'object') return null;
  var out = Object.assign({}, row);
  if (!out.name && out.title) out.name = out.title;
  if (!out.type) out.type = 'live_match';
  if (!out.open && out.id) {
    out.open = {
      surface: 'live',
      id: String(out.id),
      tabId: 'live_sports',
    };
  } else if (out.open && typeof out.open === 'object' && !out.open.tabId) {
    out.open.tabId = 'live_sports';
  }
  if (!out.sportMatchGame || typeof out.sportMatchGame !== 'object') {
    var title = String(out.title || out.name || '');
    var home = String(out.homeTeam || '');
    var away = String(out.awayTeam || '');
    var category = String(out.category || out.sport || '');
    var dateMs = Number(out.dateMs) || 0;
    out.sportMatchGame = {
      id: String(out.id || ''),
      title: title,
      homeTeam: home,
      awayTeam: away,
      sport: category,
      category: category,
      dateMs: dateMs,
    };
  }
  return out;
}

function liveSportsParseHorizonPref(raw) {
  var s = String(raw || '').trim();
  if (!s) return { status: 'airing', horizon: 'h1' };
  var parts = s.split('|');
  if (parts.length === 2) {
    var status = String(parts[0] || '').trim().toLowerCase();
    var horizonTok = String(parts[1] || '').trim().toLowerCase();
    var horizon =
      horizonTok === '1h' || horizonTok === 'h1'
        ? 'h1'
        : horizonTok === '3h' || horizonTok === 'h3'
          ? 'h3'
          : horizonTok === '6h' || horizonTok === 'h6'
            ? 'h6'
            : 'h24';
    if (status === 'live') status = 'airing';
    if (status !== 'airing' && status !== 'upcoming' && status !== 'both') {
      status = 'airing';
    }
    return { status: status, horizon: horizon };
  }
  var low = s.toLowerCase();
  if (low === 'live' || low === 'airing') return { status: 'airing', horizon: 'h1' };
  if (low === 'upcoming') return { status: 'upcoming', horizon: 'h24' };
  if (low === '1h') return { status: 'both', horizon: 'h1' };
  if (low === '3h') return { status: 'both', horizon: 'h3' };
  if (low === '6h') return { status: 'both', horizon: 'h6' };
  if (
    low === '12h' ||
    low === '24h' ||
    low === 'all' ||
    low === 'day' ||
    low === 'both'
  ) {
    return { status: 'both', horizon: 'h24' };
  }
  return { status: 'airing', horizon: 'h1' };
}

function liveSportsLoadFeed(ctx, params) {
  var host = ctx && ctx.host;
  if (!host || !host.plugin || typeof host.plugin.run !== 'function') {
    return Promise.reject(new Error('HOST_PLUGIN_RUN_REQUIRED'));
  }
  var p = params || {};
  var status = String(p.scheduleStatus || '').trim();
  var horizon = String(p.scheduleHorizon || '').trim();
  if (!status || !horizon) {
    var parsed = liveSportsParseHorizonPref(p.horizon || p.schedule || '');
    if (!status) status = parsed.status;
    if (!horizon) horizon = parsed.horizon;
  }
  return liveSportsAggregateFeed(ctx, {
    catalogFilter: p.catalogFilter || 'all',
    sportFilter: p.sportFilter || 'all',
    scheduleStatus: status || 'airing',
    scheduleHorizon: horizon || 'h1',
    force: !!(p.force || p.forceRefresh),
  }).then(function (rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var shaped = liveSportsShapeRow(rows[i]);
      if (shaped) out.push(shaped);
    }
    return out;
  });
}

function liveSportsGameFromRow(row) {
  var game =
    row && row.sportMatchGame && typeof row.sportMatchGame === 'object'
      ? Object.assign({}, row.sportMatchGame)
      : {
          id: String((row && row.id) || ''),
          title: String((row && (row.title || row.name)) || ''),
          homeTeam: String((row && row.homeTeam) || ''),
          awayTeam: String((row && row.awayTeam) || ''),
          sport: String((row && (row.category || row.sport)) || ''),
          category: String((row && (row.category || row.sport)) || ''),
          dateMs: Number(row && row.dateMs) || 0,
        };
  var broadcasts = (row && row.broadcastChannels) || game.broadcastChannels;
  if (Array.isArray(broadcasts) && broadcasts.length) {
    game.broadcastChannels = broadcasts.slice();
  }
  return game;
}

/// Live TV tab — pack calls IPTV hub `searchChannels` via plugin.run (RFC-109 C).
function liveSportsLiveTv(ctx, params) {
  var cfg = hubConfig(ctx, {});
  if (cfg.forjaSportsEnabled === false) {
    return hubOk('liveTv', { sources: [] }, { maxAge: 30 });
  }
  var row = (params && params.row) || {};
  var game = liveSportsGameFromRow(row);
  var host = ctx && ctx.host;
  if (!host || !host.plugin || typeof host.plugin.run !== 'function') {
    return hubOk('liveTv', { sources: [] }, { maxAge: 30 });
  }
  var force = !!(params && params.force);
  return Promise.resolve(
    host.plugin.list({ type: 'iptv' }),
  )
    .then(function (plugins) {
      var list = Array.isArray(plugins) ? plugins : [];
      var iptvId = '';
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var id = String((p && (p.pluginId || p.id)) || '');
        var types = (p && p.types) || [];
        if (
          id &&
          (types.indexOf('iptv') >= 0 ||
            id.indexOf('iptv') >= 0 ||
            String((p && p.kind) || '') === 'catalog')
        ) {
          if (types.indexOf('iptv') >= 0 || id.indexOf('iptv') >= 0) {
            iptvId = id;
            break;
          }
        }
      }
      if (!iptvId) {
        for (var j = 0; j < list.length; j++) {
          var q = list[j];
          var qid = String((q && (q.pluginId || q.id)) || '');
          if (qid.indexOf('iptv') >= 0) {
            iptvId = qid;
            break;
          }
        }
      }
      if (!iptvId) {
        return hubOk('liveTv', { sources: [] }, { maxAge: 30 });
      }
      return Promise.resolve(
        host.plugin.run(iptvId, 'searchChannels', {
          game: game,
          force: force,
        }),
      ).then(function (rows) {
        return hubOk(
          'liveTv',
          { sources: Array.isArray(rows) ? rows : [] },
          { maxAge: 60, swr: 120 },
        );
      });
    })
    .catch(function () {
      return hubOk('liveTv', { sources: [] }, { maxAge: 30 });
    });
}

function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);
  if (action === 'layout') {
    return hubOk('layout', liveSportsLayout(), { maxAge: 3600, swr: 86400 });
  }
  if (action === 'feed' || action === 'rail') {
    return liveSportsLoadFeed(ctx, params).then(function (items) {
      return hubItems(action, items, { maxAge: 60, swr: 300 });
    });
  }
  if (action === 'liveTv') {
    return liveSportsLiveTv(ctx, params);
  }
  return hubFail(
    action,
    'INVALID_ACTION',
    'live-sports hub: layout + feed/rail + liveTv only',
  );
}
