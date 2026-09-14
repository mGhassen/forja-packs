// Live Sports schedule aggregate — pack-owned (RFC-109 Wave B).
// Calls ctx.host.plugin.list / plugin.run + ctx.host.cache. No host.feed.

var LIVE_FEED_CACHE_NS = 'live_sports.feed';

function liveFeedNormalizeStatus(raw) {
  var s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'upcoming') return 'upcoming';
  if (s === 'both') return 'both';
  return 'airing';
}

function liveFeedNormalizeHorizon(raw) {
  var s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'h3' || s === '3h') return 'h3';
  if (s === 'h6' || s === '6h') return 'h6';
  if (s === 'h24' || s === '12h' || s === '24h' || s === 'all' || s === 'day') {
    return 'h24';
  }
  return 'h1';
}

function liveFeedParseHorizonPref(raw) {
  var t = String(raw || '').trim();
  if (!t) return { status: 'airing', horizon: 'h1' };
  var parts = t.split('|');
  if (parts.length === 2) {
    return {
      status: liveFeedNormalizeStatus(parts[0]),
      horizon: liveFeedNormalizeHorizon(parts[1]),
    };
  }
  var low = t.toLowerCase();
  if (low === 'live' || low === 'airing') return { status: 'airing', horizon: 'h1' };
  if (low === 'upcoming') return { status: 'upcoming', horizon: 'h24' };
  if (low === '1h') return { status: 'both', horizon: 'h1' };
  if (low === '3h') return { status: 'both', horizon: 'h3' };
  if (low === '6h') return { status: 'both', horizon: 'h6' };
  if (low === '12h' || low === '24h' || low === 'all' || low === 'day' || low === 'both') {
    return { status: 'both', horizon: 'h24' };
  }
  return { status: 'airing', horizon: 'h1' };
}

function liveFeedQueryFromParams(params) {
  var p = params || {};
  var combined = String(p.horizon || p.schedule || '');
  var status = String(p.scheduleStatus || '');
  var horizon = String(p.scheduleHorizon || '');
  if (!status.trim() || !horizon.trim()) {
    var parsed = liveFeedParseHorizonPref(combined);
    if (!status.trim()) status = parsed.status;
    if (!horizon.trim()) horizon = parsed.horizon;
  }
  return {
    catalogFilter: String(p.catalogFilter || 'all'),
    sportFilter: String(p.sportFilter || 'all'),
    scheduleStatus: liveFeedNormalizeStatus(status),
    scheduleHorizon: liveFeedNormalizeHorizon(horizon),
  };
}

function liveFeedCacheKey(catalogFilter) {
  var f = String(catalogFilter || '').trim();
  if (!f || f === 'all') return 'raw:all';
  if (f.indexOf('stremio:') === 0) return 'raw:' + f;
  if (f.indexOf('live-') === 0) f = f.slice(5);
  if (f.indexOf('catalog-') === 0) f = f.slice(8);
  return 'raw:' + f;
}

function liveFeedCacheGet(host, key) {
  if (!host || !host.cache || typeof host.cache.get !== 'function') return null;
  return host.cache.get(LIVE_FEED_CACHE_NS, key);
}

function liveFeedCacheSet(host, key, rows) {
  if (!host || !host.cache || typeof host.cache.set !== 'function') return;
  host.cache.set(LIVE_FEED_CACHE_NS, key, {
    rows: rows || [],
    at: Date.now(),
  });
}

function liveFeedCacheClear(host) {
  if (!host || !host.cache || typeof host.cache.invalidate !== 'function') return;
  host.cache.invalidate(LIVE_FEED_CACHE_NS, '');
}

function liveFeedViewerCount(value) {
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'string') {
    var t = value.trim().replace(/,/g, '');
    if (!t) return 0;
    var n = parseInt(t, 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function liveFeedStartsAtMs(row) {
  var raw = row && (row.startsAt || row.starts_at || row.date || row.dateMs);
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') {
    return raw > 1e12 ? raw : raw > 0 ? raw * 1000 : 0;
  }
  var s = String(raw).trim();
  if (!s) return 0;
  var asNum = Number(s);
  if (!isNaN(asNum) && asNum > 0) {
    return asNum > 1e12 ? asNum : asNum * 1000;
  }
  var parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

function liveFeedIsAlwaysOn(row) {
  if (!row) return false;
  if (row.always_live === true || row.alwaysLive === true) return true;
  var badge = String(row.badge || row.kind || row.category || '').toLowerCase();
  if (badge.indexOf('24/7') >= 0 || badge.indexOf('24-7') >= 0) return true;
  var genres = row.genres;
  if (Array.isArray(genres)) {
    for (var i = 0; i < genres.length; i++) {
      var g = String(genres[i] || '').toLowerCase();
      if (g.indexOf('24/7') >= 0 || g.indexOf('24-7') >= 0) return true;
    }
  }
  return false;
}

function liveFeedIsAiring(row) {
  if (!row) return false;
  return row.airing === true || row.live === true || liveFeedIsAlwaysOn(row);
}

function liveFeedHorizonRangeMs(horizon) {
  var h = liveFeedNormalizeHorizon(horizon);
  var hour = 3600000;
  if (h === 'h3') return { past: 3 * hour, future: 3 * hour };
  if (h === 'h6') return { past: 3 * hour, future: 6 * hour };
  if (h === 'h24') return { past: 3 * hour, future: 24 * hour };
  return { past: hour, future: hour };
}

function liveFeedKickoffMatches(row, query) {
  var isLiveNow = liveFeedIsAiring(row);
  var status = liveFeedNormalizeStatus(query.scheduleStatus);
  if (status === 'airing') return isLiveNow;
  if (status === 'upcoming') {
    if (isLiveNow) return false;
  } else if (status === 'both') {
    if (isLiveNow) return true;
  }
  var start = liveFeedStartsAtMs(row);
  if (!start) return false;
  var now = Date.now();
  var range = liveFeedHorizonRangeMs(query.scheduleHorizon);
  return start >= now - range.past && start <= now + range.future;
}

function liveFeedSportMatches(row, sportFilter) {
  var filter = String(sportFilter || 'all').trim();
  if (!filter || filter === 'all') return true;
  var kind = String(
    row.kind || row.category || row.category_name || row.sport || '',
  ).toLowerCase();
  var want = filter.toLowerCase();
  if (kind.indexOf(want) >= 0) return true;
  if (String(row.type || '').toLowerCase() === want) return true;
  var genres = row.genres;
  if (Array.isArray(genres)) {
    for (var i = 0; i < genres.length; i++) {
      if (String(genres[i] || '').toLowerCase().indexOf(want) >= 0) return true;
    }
  }
  return false;
}

function liveFeedFoldLatin(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function liveFeedTeamTokens(name) {
  var s = liveFeedFoldLatin(name)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return [];
  return s.split(' ').filter(Boolean);
}

function liveFeedParseTeamsFromTitle(title) {
  var t = String(title || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return { home: '', away: '' };
  var at = t.match(/\s+(?:at|@)\s+/i);
  if (at) {
    var leftA = t.slice(0, at.index).trim();
    var rightA = t.slice(at.index + at[0].length).split(/\s+[-–—|/]\s/)[0].trim();
    return { home: rightA, away: leftA };
  }
  var vs = t.match(/\s+(?:vs\.?|v|versus)\s+/i);
  if (vs) {
    var leftV = t.slice(0, vs.index).trim();
    var rightV = t.slice(vs.index + vs[0].length).split(/\s+[-–—|/]\s/)[0].trim();
    return { home: leftV, away: rightV };
  }
  return { home: '', away: '' };
}

function liveFeedResolveTeams(row) {
  var home = String((row && row.homeTeam) || '').trim();
  var away = String((row && row.awayTeam) || '').trim();
  if (home && away) return { home: home, away: away };
  var parsed = liveFeedParseTeamsFromTitle(
    (row && (row.title || row.name)) || '',
  );
  return {
    home: home || parsed.home,
    away: away || parsed.away,
  };
}

function liveFeedTeamPairSoftEqual(homeA, awayA, homeB, awayB) {
  var aH = liveFeedTeamTokens(homeA);
  var aA = liveFeedTeamTokens(awayA);
  var bH = liveFeedTeamTokens(homeB);
  var bA = liveFeedTeamTokens(awayB);
  if (!aH.length || !aA.length || !bH.length || !bA.length) return false;
  function same(a, b) {
    if (a[0] === b[0]) return true;
    var as = a.join(' ');
    var bs = b.join(' ');
    return as.indexOf(bs) >= 0 || bs.indexOf(as) >= 0;
  }
  return (
    (same(aH, bH) && same(aA, bA)) || (same(aH, bA) && same(aA, bH))
  );
}

function liveFeedDatesClose(a, b) {
  if (!a || !b) return true;
  return Math.abs(a - b) <= 6 * 3600000;
}

function liveFeedSoftMatch(a, b) {
  var idA = String((a && a.id) || '');
  var idB = String((b && b.id) || '');
  if (idA && idB && idA === idB) return true;
  var ta = liveFeedResolveTeams(a);
  var tb = liveFeedResolveTeams(b);
  if (ta.home && ta.away && tb.home && tb.away) {
    return (
      liveFeedTeamPairSoftEqual(ta.home, ta.away, tb.home, tb.away) &&
      liveFeedDatesClose(liveFeedStartsAtMs(a), liveFeedStartsAtMs(b))
    );
  }
  if (liveFeedIsAlwaysOn(a) || liveFeedIsAlwaysOn(b)) return false;
  var titleA = liveFeedFoldLatin((a && (a.title || a.name)) || '');
  var titleB = liveFeedFoldLatin((b && (b.title || b.name)) || '');
  if (!titleA || !titleB || titleA !== titleB) return false;
  return liveFeedDatesClose(liveFeedStartsAtMs(a), liveFeedStartsAtMs(b));
}

function liveFeedMergeBucketKey(row) {
  var teams = liveFeedResolveTeams(row);
  var homeTok = liveFeedTeamTokens(teams.home);
  var awayTok = liveFeedTeamTokens(teams.away);
  if (homeTok.length && awayTok.length) {
    var pair = [homeTok[0], awayTok[0]].sort();
    return 'c:' + pair.join('|');
  }
  if (liveFeedIsAlwaysOn(row)) return null;
  var titleKey = liveFeedFoldLatin((row && (row.title || row.name)) || '');
  if (!titleKey) return null;
  return 'n:' + titleKey;
}

function liveFeedBroadcastChannels(row) {
  var out = [];
  var seen = {};
  function addAll(raw) {
    if (!Array.isArray(raw)) return;
    for (var i = 0; i < raw.length; i++) {
      var name = String(raw[i] || '').trim();
      if (!name) continue;
      var k = name.toLowerCase();
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(name);
    }
  }
  addAll(row && row.broadcastChannels);
  addAll(row && row.broadcast_channels);
  var game = row && row.sportMatchGame;
  if (game && typeof game === 'object') {
    addAll(game.broadcastChannels);
    addAll(game.broadcast_channels);
  }
  return out;
}

function liveFeedCategorySpecificity(raw) {
  var t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ');
  if (!t) return 0;
  if (
    t === 'football' ||
    t === 'soccer' ||
    t === 'basketball' ||
    t === 'hockey' ||
    t === 'tennis' ||
    t === 'baseball' ||
    t === 'american football'
  ) {
    return 1;
  }
  return 2 + t.split(/\s+/).length;
}

function liveFeedSourceCount(row) {
  var raw = row && row.sources;
  return Array.isArray(raw) ? raw.length : 0;
}

function liveFeedPickBetter(a, b) {
  var liveA = liveFeedIsAiring(a);
  var liveB = liveFeedIsAiring(b);
  if (liveA !== liveB) return liveA ? a : b;
  var posterA = String((a && (a.poster || a.thumbnail)) || '').trim();
  var posterB = String((b && (b.poster || b.thumbnail)) || '').trim();
  if (!!posterA !== !!posterB) return posterA ? a : b;
  var catA = liveFeedCategorySpecificity(
    (a && (a.category || a.sport || a.kind)) || '',
  );
  var catB = liveFeedCategorySpecificity(
    (b && (b.category || b.sport || b.kind)) || '',
  );
  if (catA !== catB) return catA > catB ? a : b;
  var srcA = liveFeedSourceCount(a);
  var srcB = liveFeedSourceCount(b);
  if (srcA !== srcB) return srcA >= srcB ? a : b;
  var da = liveFeedStartsAtMs(a);
  var db = liveFeedStartsAtMs(b);
  if (da > 0 && db > 0 && da !== db) return da <= db ? a : b;
  return a;
}

function liveFeedMergePair(a, b) {
  var primary = liveFeedPickBetter(a, b);
  var other = primary === a ? b : a;
  var out = Object.assign({}, primary);
  var sources = [];
  var seen = {};
  function addSources(row) {
    var raw = row && row.sources;
    if (!Array.isArray(raw)) return;
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (!s || typeof s !== 'object') continue;
      var source = String(s.source || '').trim();
      var id = String(s.id || '').trim();
      if (!source || !id) continue;
      if (source.toLowerCase() === 'echo') continue;
      var key = source + '|' + id;
      if (seen[key]) continue;
      seen[key] = 1;
      sources.push({ source: source, id: id });
    }
  }
  addSources(primary);
  addSources(other);
  if (sources.length) out.sources = sources;
  var va = liveFeedViewerCount(primary.viewers);
  var vb = liveFeedViewerCount(other.viewers);
  if (va + vb > 0) out.viewers = va + vb;
  if (
    !String(primary.poster || primary.thumbnail || '').trim() &&
    String(other.poster || other.thumbnail || '').trim()
  ) {
    if (other.poster) out.poster = other.poster;
    if (other.thumbnail) out.thumbnail = other.thumbnail;
  }
  ['homeTeam', 'awayTeam', 'homeBadge', 'awayBadge'].forEach(function (k) {
    if (!String(out[k] || '').trim() && String(other[k] || '').trim()) {
      out[k] = other[k];
    }
  });
  if (primary.airing === true || other.airing === true) out.airing = true;
  if (primary.live === true || other.live === true) out.live = true;
  var channels = liveFeedBroadcastChannels(primary).concat(
    liveFeedBroadcastChannels(other),
  );
  if (channels.length) {
    var game =
      (primary.sportMatchGame && typeof primary.sportMatchGame === 'object'
        ? Object.assign({}, primary.sportMatchGame)
        : null) ||
      (other.sportMatchGame && typeof other.sportMatchGame === 'object'
        ? Object.assign({}, other.sportMatchGame)
        : {
            id: String(out.id || ''),
            title: String(out.title || out.name || ''),
            homeTeam: String(out.homeTeam || ''),
            awayTeam: String(out.awayTeam || ''),
            sport: String(out.category || out.sport || ''),
            category: String(out.category || out.sport || ''),
          });
    var seenCh = {};
    var mergedCh = [];
    channels.forEach(function (name) {
      var k = String(name || '')
        .trim()
        .toLowerCase();
      if (!k || seenCh[k]) return;
      seenCh[k] = 1;
      mergedCh.push(String(name).trim());
    });
    if (mergedCh.length) {
      game.broadcastChannels = mergedCh;
      out.sportMatchGame = game;
      out.broadcastChannels = mergedCh.slice();
    }
  }
  return out;
}

function liveFeedMergeMatching(rows) {
  if (!rows || rows.length < 2) return rows || [];
  var out = [];
  var buckets = {};
  for (var i = 0; i < rows.length; i++) {
    var map = Object.assign({}, rows[i]);
    var bucketKey = liveFeedMergeBucketKey(map);
    var merged = false;
    if (bucketKey && buckets[bucketKey]) {
      var candidates = buckets[bucketKey];
      for (var c = 0; c < candidates.length; c++) {
        var idx = candidates[c];
        if (liveFeedSoftMatch(out[idx], map)) {
          out[idx] = liveFeedMergePair(out[idx], map);
          merged = true;
          break;
        }
      }
    }
    if (merged) continue;
    var storeKey = bucketKey || 'id:' + String(map.id || out.length);
    if (!buckets[storeKey]) buckets[storeKey] = [];
    buckets[storeKey].push(out.length);
    out.push(map);
  }
  return out;
}

function liveFeedSortLiveFirst(rows) {
  if (!rows || rows.length < 2) return rows || [];
  return rows
    .slice()
    .sort(function (a, b) {
      var liveA = liveFeedIsAiring(a);
      var liveB = liveFeedIsAiring(b);
      if (liveA !== liveB) return liveA ? -1 : 1;
      var va = liveFeedViewerCount(a.viewers);
      var vb = liveFeedViewerCount(b.viewers);
      if (va !== vb) return vb - va;
      var da = liveFeedStartsAtMs(a);
      var db = liveFeedStartsAtMs(b);
      if (da !== db) return da - db;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
}

function liveFeedFilterRows(rows, query, mergeMatching) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var map = Object.assign({}, rows[i]);
    var id = String(map.id || '').trim();
    if (!id || seen[id]) continue;
    seen[id] = 1;
    if (!liveFeedSportMatches(map, query.sportFilter)) continue;
    if (!liveFeedKickoffMatches(map, query)) continue;
    out.push(map);
  }
  if (mergeMatching) out = liveFeedMergeMatching(out);
  return liveFeedSortLiveFirst(out);
}

function liveFeedShouldMerge(query, cfg) {
  var filter = String(query.catalogFilter || '').trim();
  if (filter && filter !== 'all') return false;
  if (cfg && cfg.mergeMatchingEvents === false) return false;
  return true;
}

function liveFeedNormalizePluginRows(pluginId, batch) {
  var collected = [];
  var list = Array.isArray(batch) ? batch : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row || typeof row !== 'object') continue;
    var map = Object.assign({}, row);
    if (!map.pluginId) map.pluginId = pluginId;
    if (!map.livePluginId) map.livePluginId = pluginId;
    if (!String(map.id || '').trim()) continue;
    collected.push(map);
  }
  return collected;
}

function liveSportsAggregateFeed(ctx, params) {
  var host = ctx && ctx.host;
  var query = liveFeedQueryFromParams(params);
  var cfg = hubConfig(ctx, {});
  var force = !!(params && (params.force || params.forceRefresh));

  // Host progressive fan-out passes accumulated catalog rows — pack only reduces.
  if (params && Array.isArray(params.rows)) {
    var hostRows = liveFeedNormalizePluginRows('', params.rows);
    return Promise.resolve(
      liveFeedFilterRows(hostRows, query, liveFeedShouldMerge(query, cfg)),
    );
  }

  if (!host || !host.plugin || typeof host.plugin.run !== 'function') {
    return Promise.reject(new Error('HOST_PLUGIN_RUN_REQUIRED'));
  }
  if (typeof host.plugin.list !== 'function') {
    return Promise.reject(new Error('HOST_PLUGIN_LIST_REQUIRED'));
  }
  if (force) liveFeedCacheClear(host);

  var cacheKey = liveFeedCacheKey(query.catalogFilter);
  if (!force) {
    var hit = liveFeedCacheGet(host, cacheKey);
    if (hit && Array.isArray(hit.rows)) {
      return Promise.resolve(
        liveFeedFilterRows(hit.rows, query, liveFeedShouldMerge(query, cfg)),
      );
    }
  }

  var filter = String(query.catalogFilter || '').trim();
  if (filter.indexOf('stremio:') === 0) {
    return Promise.resolve(host.plugin.run(filter, 'catalog', {})).then(
      function (rows) {
        var normalized = liveFeedNormalizePluginRows(filter, rows);
        liveFeedCacheSet(host, cacheKey, normalized);
        return liveFeedFilterRows(normalized, query, false);
      },
    );
  }

  // Legacy one-shot aggregate (older hosts without progressive fan-out).
  return Promise.resolve(
    host.plugin.list({ type: 'live_sport', capability: 'catalog' }),
  ).then(function (plugins) {
    var list = Array.isArray(plugins) ? plugins : [];
    var wanted = list;
    if (filter && filter !== 'all') {
      var want = filter;
      var wantNorm = want.indexOf('live-') === 0 ? want.slice(5) : want;
      wanted = list.filter(function (p) {
        var id = String((p && (p.id || p.pluginId)) || '');
        return id === want || id === wantNorm || id === 'live-' + wantNorm;
      });
    }
    if (!wanted.length) return [];

    var chain = Promise.resolve([]);
    var raw = [];
    var seen = {};

    wanted.forEach(function (p) {
      var pluginId = String((p && (p.pluginId || p.id)) || '');
      var pluginKey = liveFeedCacheKey(pluginId);
      chain = chain.then(function () {
        if (!force) {
          var warm = liveFeedCacheGet(host, pluginKey);
          if (warm && Array.isArray(warm.rows) && warm.rows.length) {
            warm.rows.forEach(function (row) {
              var id = String((row && row.id) || '');
              if (!id || seen[id]) return;
              seen[id] = 1;
              raw.push(Object.assign({}, row));
            });
            return;
          }
        }
        return Promise.resolve(host.plugin.run(pluginId, 'catalog', {})).then(
          function (rows) {
            var collected = liveFeedNormalizePluginRows(pluginId, rows);
            liveFeedCacheSet(host, pluginKey, collected);
            collected.forEach(function (row) {
              var id = String((row && row.id) || '');
              if (!id || seen[id]) return;
              seen[id] = 1;
              raw.push(row);
            });
          },
          function () {
            /* skip failed catalog */
          },
        );
      });
    });

    return chain.then(function () {
      liveFeedCacheSet(host, cacheKey, raw);
      return liveFeedFilterRows(raw, query, liveFeedShouldMerge(query, cfg));
    });
  });
}
