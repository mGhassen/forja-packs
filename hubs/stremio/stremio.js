// Stremio catalog hub — empty shell; installed VOD addon catalogs own the rows.
// Host: ctx.host.engine.request('stremio', { action: 'list'|'catalog'|'search', … })

function stremioEngine(ctx) {
  var host = (ctx && ctx.host) || {};
  if (host.engine && typeof host.engine.request === 'function') {
    return host.engine.request.bind(host.engine);
  }
  return null;
}

async function stremioEngineRequest(ctx, body) {
  var request = stremioEngine(ctx);
  if (!request) {
    return { ok: false, error: 'ENGINE_REQUIRED', message: 'ctx.host.engine.request required' };
  }
  return await request('stremio', body || {});
}

/** Opaque rail id: encodeURIComponent(base)|encodeURIComponent(type)|encodeURIComponent(id)|encodeURIComponent(addonName) */
function stremioRailId(cat) {
  if (!cat || typeof cat !== 'object') return '';
  var base = String(cat.addonBaseUrl || cat.baseUrl || '').trim();
  var type = String(cat.catalogType || cat.type || '').trim();
  var id = String(cat.catalogId || cat.id || '').trim();
  if (!base || !type || !id) return '';
  var name = String(cat.addonName || '').trim();
  return (
    encodeURIComponent(base) +
    '|' +
    encodeURIComponent(type) +
    '|' +
    encodeURIComponent(id) +
    '|' +
    encodeURIComponent(name)
  );
}

function stremioParseRailId(railId) {
  var raw = String(railId || '');
  var parts = raw.split('|');
  if (parts.length < 3) return null;
  try {
    return {
      baseUrl: decodeURIComponent(parts[0] || ''),
      type: decodeURIComponent(parts[1] || ''),
      id: decodeURIComponent(parts[2] || ''),
      addonName: parts.length > 3 ? decodeURIComponent(parts[3] || '') : '',
    };
  } catch (e) {
    return null;
  }
}

async function stremioListCatalogs(ctx) {
  var res = await stremioEngineRequest(ctx, {
    action: 'list',
    feature: 'vod',
  });
  if (!res || res.ok === false) return [];
  return Array.isArray(res.catalogs) ? res.catalogs : [];
}

async function stremioCatalogItems(ctx, railKey, skip) {
  var parsed = stremioParseRailId(railKey);
  if (!parsed || !parsed.baseUrl || !parsed.type || !parsed.id) return [];
  var body = {
    action: 'catalog',
    baseUrl: parsed.baseUrl,
    type: parsed.type,
    id: parsed.id,
  };
  if (parsed.addonName) body.addonName = parsed.addonName;
  var skipN = Number(skip);
  if (skipN > 0) body.skip = skipN;
  var res = await stremioEngineRequest(ctx, body);
  if (!res || res.ok === false) return [];
  return Array.isArray(res.items) ? res.items : [];
}

async function extract(ctx) {
  var action = hubAction(ctx);
  var params = hubParams(ctx);

  if (action === 'layout') {
    var catalogs = await stremioListCatalogs(ctx);
    return hubOk('layout', stremioLayoutFromCatalogs(catalogs), {
      maxAge: 120,
      swr: 600,
    });
  }

  if (action === 'rail') {
    var rail = String(params.rail || params.id || '');
    var skip = params.skip != null ? params.skip : params.page != null ? Number(params.page) * 20 : 0;
    var items = await stremioCatalogItems(ctx, rail, skip);
    var pageSize = 20;
    var hasMore = items.length >= pageSize;
    return hubItems(
      'rail',
      items,
      { maxAge: 300, swr: 1800 },
      { pageSize: pageSize, hasMore: hasMore },
    );
  }

  if (action === 'search') {
    var query = String(params.query || params.q || '');
    var hits = await stremioSearchItems(ctx, query);
    return hubItems('search', hits, { maxAge: 120 });
  }

  return hubFail(action, 'UNSUPPORTED', 'Unsupported action: ' + action, false);
}
