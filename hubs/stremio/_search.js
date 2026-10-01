// Stremio hub search — queries searchable VOD addon catalogs via host bridge.

async function stremioSearchItems(ctx, query) {
  var q = String(query || '').trim();
  if (!q) return [];
  var res = await stremioEngineRequest(ctx, { action: 'search', query: q });
  if (!res || res.ok === false) return [];
  return Array.isArray(res.items) ? res.items : [];
}
