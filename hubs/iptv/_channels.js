// IPTV Channels hub — curated brand inventory + scan vault portals for matches.
// Inventory: IPTV_CURATED_CHANNELS from _channels_data.js (prelude).

function iptvCuratedChannels() {
  return Array.isArray(IPTV_CURATED_CHANNELS) ? IPTV_CURATED_CHANNELS : [];
}

function iptvCuratedById(id) {
  var want = String(id || '').trim();
  if (!want) return null;
  var list = iptvCuratedChannels();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id || '') === want) return list[i];
  }
  return null;
}

function iptvCuratedKinds() {
  var list = iptvCuratedChannels();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (!c || !c.id) continue;
    out.push({
      id: String(c.id),
      label: String(c.name || c.short || c.id).trim() || String(c.id),
    });
  }
  return out;
}

function iptvChannelNameMatches(name, keywords, exclude) {
  var lower = String(name || '').toLowerCase();
  if (!lower) return false;
  var ex = Array.isArray(exclude) ? exclude : [];
  for (var i = 0; i < ex.length; i++) {
    if (lower.indexOf(String(ex[i] || '').toLowerCase()) >= 0) return false;
  }
  var kw = Array.isArray(keywords) ? keywords : [];
  for (var j = 0; j < kw.length; j++) {
    var needle = String(kw[j] || '').toLowerCase();
    if (needle && lower.indexOf(needle) >= 0) return true;
  }
  return false;
}

function iptvChannelHitsVaultKey(channelId) {
  return 'iptv.channelHits.' + String(channelId || '').trim();
}

async function iptvLoadChannelHits(ctx, channelId) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return [];
  try {
    var raw = await vault.get(iptvChannelHitsVaultKey(channelId));
    if (!raw || String(raw).trim() === '' || String(raw).trim() === '[]') {
      return [];
    }
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function iptvSaveChannelHits(ctx, channelId, hits) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return;
  try {
    await vault.set(
      iptvChannelHitsVaultKey(channelId),
      JSON.stringify(Array.isArray(hits) ? hits : []),
    );
  } catch (e) {}
}

/**
 * Scan vault portals' live catalogs for keyword matches.
 * Mirrors legacy runChannelScan steps 1+3+4 (user portals only — no scrape bootstrap).
 */
async function iptvScanChannel(ctx, channel, opts) {
  var o = opts || {};
  var force = !!o.force;
  var limitPortals = Number(o.limitPortals) > 0 ? Number(o.limitPortals) : 8;
  var channelId = String(channel.id || '').trim();
  if (!channelId) return [];

  if (!force) {
    var cached = await iptvLoadChannelHits(ctx, channelId);
    if (cached.length) return cached;
  }

  var portals = await iptvLoadPortals(ctx);
  if (!Array.isArray(portals) || !portals.length) return [];

  var toScan = portals.slice(0, limitPortals);
  var seenUrl = {};
  var hits = [];

  for (var i = 0; i < toScan.length; i++) {
    var portal = toScan[i];
    if (!portal) continue;
    try {
      var catalog = await iptvFetchCatalog(ctx, portal, 'live', {
        skipCache: !!force,
      });
      var streams = (catalog && catalog.streams) || [];
      for (var s = 0; s < streams.length; s++) {
        var st = streams[s];
        if (!st) continue;
        var name = String(st.name || st.title || '');
        if (!iptvChannelNameMatches(name, channel.keywords, channel.exclude)) {
          continue;
        }
        var meta = iptvLiveMeta(
          portal,
          st,
          channel.name || channelId,
          channelId,
        );
        if (!meta || !meta.open || !meta.open.url) continue;
        var url = String(meta.open.url);
        if (seenUrl[url]) continue;
        seenUrl[url] = true;
        hits.push(meta);
      }
    } catch (e) {}
  }

  await iptvSaveChannelHits(ctx, channelId, hits);
  return hits;
}

async function iptvChannelsFeed(ctx, params) {
  var kinds = iptvCuratedKinds();
  var channelId = String(
    (params &&
      (params.categoryId || params.kind || params.channelId || params.channel)) ||
      '',
  ).trim();
  var q = String((params && params.q) || '').trim().toLowerCase();

  if (!channelId || channelId === 'all') {
    var emptyEnv = hubItems('feed', [], null)[0];
    if (kinds.length) emptyEnv.data.kinds = kinds;
    return [emptyEnv];
  }

  var channel = iptvCuratedById(channelId);
  if (!channel) {
    var miss = hubItems('feed', [], null)[0];
    if (kinds.length) miss.data.kinds = kinds;
    return [miss];
  }

  var force = !!(params && (params.refresh || params.force));
  var hits = await iptvScanChannel(ctx, channel, { force: force });
  if (q) {
    hits = hits.filter(function (m) {
      return iptvFeedQueryMatch(m, q);
    });
  }
  hits = iptvApplyLiveCardPaint(hits);
  var env = hubItems('feed', hits, null)[0];
  if (kinds.length) env.data.kinds = kinds;
  return [env];
}
