// Live Sports hub — schedule browse; list/cards + panel/details via host prefs.
// Schedule rows: MetaRuntime `feed` composes via ctx.host.liveFeed.load.
// Live TV: MetaRuntime `liveTv` → ctx.host.iptv.searchChannels (RFC-096 A09).

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
    out.open = { surface: 'live', id: String(out.id) };
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

function liveSportsLoadFeed(ctx, params) {
  var host = ctx && ctx.host;
  var liveFeed = host && host.liveFeed;
  // Missing bridge → reject (empty ok envelope would skip host flutter_js fallback).
  if (!liveFeed || typeof liveFeed.load !== 'function') {
    return Promise.reject(new Error('HOST_LIVE_FEED_REQUIRED'));
  }
  return Promise.resolve(
    liveFeed.load({
      catalogFilter: (params && params.catalogFilter) || 'all',
      sportFilter: (params && params.sportFilter) || 'all',
      scheduleStatus: (params && params.scheduleStatus) || 'airing',
      scheduleHorizon: (params && params.scheduleHorizon) || 'h1',
    }),
  ).then(function (rows) {
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

/// Live TV tab — pack owns Forja Sports gate + searchChannels trigger.
function liveSportsLiveTv(ctx, params) {
  var cfg = hubConfig(ctx, {});
  if (cfg.forjaSportsEnabled === false) {
    return hubOk('liveTv', { sources: [] }, { maxAge: 30 });
  }
  var row = (params && params.row) || {};
  var game = liveSportsGameFromRow(row);
  var host = ctx && ctx.host;
  var iptv = host && host.iptv;
  if (!iptv || typeof iptv.searchChannels !== 'function') {
    return Promise.reject(new Error('HOST_IPTV_SEARCH_REQUIRED'));
  }
  var force = !!(params && params.force);
  return Promise.resolve(
    iptv.searchChannels({ game: game, force: force }),
  ).then(function (sources) {
    return hubOk(
      'liveTv',
      { sources: Array.isArray(sources) ? sources : [] },
      { maxAge: 60, swr: 120 },
    );
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
