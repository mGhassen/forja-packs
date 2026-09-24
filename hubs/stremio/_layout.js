// Stremio hub layout — widgets from installed VOD addon catalogs only.
// Hero + bleed reuse the first catalog (no invented spotlight/featured ids).

function stremioCatalogTitle(c) {
  var addonName = String((c && c.addonName) || '').trim();
  var catalogName = String((c && (c.catalogName || c.catalogId)) || '').trim();
  if (addonName && catalogName && addonName !== catalogName) {
    return addonName + ' · ' + catalogName;
  }
  return catalogName || addonName || 'Catalog';
}

function stremioLayoutFromCatalogs(catalogs) {
  var list = Array.isArray(catalogs) ? catalogs : [];
  var railMeta = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i] || {};
    var railId = stremioRailId(c);
    if (!railId) continue;
    railMeta.push({ cat: c, railId: railId, title: stremioCatalogTitle(c) });
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

  widgets.push(
    hubWithLoad(
      {
        type: 'hero',
        id: 'hero',
        title: first.title,
        rail: first.railId,
        bleed: first.railId,
        slideCap: 5,
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
