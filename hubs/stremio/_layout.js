// Stremio hub layout — widgets from installed VOD addon catalogs only.
// Hero + bleed reuse the first catalog (no invented spotlight/featured ids).
// Type menus (pack `filters`) hide rails via showWhenType / showOnlyWhenType.

function stremioCatalogTitle(c) {
  var addonName = String((c && c.addonName) || '').trim();
  var catalogName = String((c && (c.catalogName || c.catalogId)) || '').trim();
  if (addonName && catalogName && addonName !== catalogName) {
    return addonName + ' · ' + catalogName;
  }
  return catalogName || addonName || 'Catalog';
}

/** Normalize Stremio catalog type for chrome menus + showWhenType. */
function stremioLayoutType(raw) {
  var t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'tv' || t === 'series') return 'series';
  if (t === 'anime') return 'anime';
  if (t === 'movie') return 'movie';
  return '';
}

function stremioLayoutFromCatalogs(catalogs) {
  var list = Array.isArray(catalogs) ? catalogs : [];
  var railMeta = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i] || {};
    var railId = stremioRailId(c);
    if (!railId) continue;
    var layoutType = stremioLayoutType(c.catalogType || c.type);
    railMeta.push({
      cat: c,
      railId: railId,
      title: stremioCatalogTitle(c),
      layoutType: layoutType,
    });
  }

  if (railMeta.length === 0) {
    return {
      pages: {
        home: {
          widgets: [],
        },
      },
    };
  }

  var first = railMeta[0];
  var widgets = [];

  // Default hero — All (no type menu). Hidden when Movies / Series / Anime is on.
  widgets.push(
    hubWithLoad(
      {
        type: 'hero',
        id: 'hero',
        title: first.title,
        rail: first.railId,
        bleed: first.railId,
        slideCap: 5,
        hideWhenTypeFilter: true,
        actions: [
          {
            id: 'details',
            label: 'View details',
            icon: 'info',
            tone: 'secondary',
          },
          { id: 'follow' },
        ],
      },
      'rail',
      { rail: first.railId },
    ),
  );

  // Per-type heroes — only while that type menu is selected.
  var typeHeroDone = {};
  for (var h = 0; h < railMeta.length; h++) {
    var hm = railMeta[h];
    if (!hm.layoutType || typeHeroDone[hm.layoutType]) continue;
    typeHeroDone[hm.layoutType] = true;
    widgets.push(
      hubWithLoad(
        {
          type: 'hero',
          id: 'hero-' + hm.layoutType,
          title: hm.title,
          rail: hm.railId,
          bleed: hm.railId,
          slideCap: 5,
          showOnlyWhenType: hm.layoutType,
          actions: [
            {
              id: 'details',
              label: 'View details',
              icon: 'info',
              tone: 'secondary',
            },
            { id: 'follow' },
          ],
        },
        'rail',
        { rail: hm.railId },
      ),
    );
  }

  for (var j = 0; j < railMeta.length; j++) {
    var m = railMeta[j];
    var edges = {};
    if (j === 0) {
      edges.focusUp = 'hero-details';
      edges.hideWhenBleed = true;
    } else {
      edges.focusUp = railMeta[j - 1].railId;
    }
    if (j + 1 < railMeta.length) {
      edges.focusDown = railMeta[j + 1].railId;
    }
    if (m.layoutType) {
      edges.showWhenType = m.layoutType;
    }
    widgets.push(
      hubWithLoad(
        Object.assign(
          {
            type: 'rail',
            id: m.railId,
            title: m.title,
            rail: m.railId,
          },
          edges,
        ),
        'rail',
        { rail: m.railId },
      ),
    );
  }

  return {
    pages: {
      home: {
        widgets: widgets,
      },
    },
  };
}

/** Pack chrome menus from the union of VOD catalog types (movie / series / anime). */
function stremioFiltersFromCatalogs(catalogs) {
  var list = Array.isArray(catalogs) ? catalogs : [];
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var c = list[i] || {};
    var t = stremioLayoutType(c.catalogType || c.type);
    if (t) seen[t] = true;
  }
  var order = [
    { id: 'movie', label: 'Movies', value: 'movie' },
    { id: 'series', label: 'Series', value: 'series' },
    { id: 'anime', label: 'Anime', value: 'anime' },
  ];
  var menus = [];
  for (var j = 0; j < order.length; j++) {
    var m = order[j];
    if (!seen[m.value]) continue;
    menus.push({
      id: m.id,
      label: m.label,
      filter: { op: 'eq', field: 'type', value: m.value },
      hideTypeFilterRails: true,
    });
  }
  return { menus: menus };
}
