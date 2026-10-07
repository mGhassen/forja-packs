// Aflem hub page layout — widgets tree for action:'layout'.
// One rail per Brstej section (BRSTEJ_CATEGORY_OPTIONS) so the hub covers the
// whole site, not just its home page. Films / Series menus hide rails via
// showWhenType; a chosen Category empties the other section rails.

function brstejLayout() {
  var rails = [
    {
      type: 'ranked',
      id: 'top',
      title: 'الأكثر مشاهدة',
      rail: 'top',
      style: 'numbered',
    },
  ];
  for (var i = 0; i < BRSTEJ_CATEGORY_OPTIONS.length; i++) {
    var opt = BRSTEJ_CATEGORY_OPTIONS[i];
    rails.push({
      type: 'rail',
      id: opt.id,
      title: opt.label,
      rail: opt.id,
      showWhenType: opt.kind,
    });
  }
  rails.push({
    type: 'rail',
    id: 'all_series',
    title: 'كل المسلسلات',
    rail: 'all_series',
    showWhenType: 'series',
  });

  // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
  // Hidden or empty rails: host kit-edge miss walks past.
  var chain = ['latest', 'continue_watching'];
  for (var j = 0; j < rails.length; j++) chain.push(rails[j].id);
  function link(node) {
    var at = chain.indexOf(node.id);
    if (at > 0 && !node.focusUp) node.focusUp = chain[at - 1];
    if (at >= 0 && at + 1 < chain.length) node.focusDown = chain[at + 1];
    return node;
  }

  var widgets = [
    hubWithLoad(
      {
        type: 'hero',
        id: 'spotlight',
        title: 'أحدث المسلسلات',
        rail: 'spotlight',
        bleed: 'latest',
      },
      'rail',
      { rail: 'spotlight' },
    ),
    hubWithLoad(
      link({
        type: 'rail',
        id: 'latest',
        title: 'آخر الحلقات',
        rail: 'latest',
        hideWhenBleed: true,
        maxPages: BRSTEJ_RAIL_MAX_PAGES,
        // First catalog row ↑ → View details (not top menu).
        focusUp: 'hero-details',
      }),
      'rail',
      { rail: 'latest' },
    ),
    link({ type: 'continue', id: 'continue_watching' }),
  ];
  for (var k = 0; k < rails.length; k++) {
    var node = link(rails[k]);
    node.maxPages = BRSTEJ_RAIL_MAX_PAGES;
    widgets.push(hubWithLoad(node, 'rail', { rail: node.rail }));
  }

  return {
    pages: {
      aflem: {
        pageSize: 24,
        // No pageBack: flat catalog — remote Back → nav rail.
        // enter / restore omitted: hero View details owns first land
        // (TvHeroActions defaultFocus) for nav OK and RIGHT from the rail.
        widgets: widgets,
      },
    },
  };
}
