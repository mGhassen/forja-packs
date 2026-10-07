// Arabic hub page layout — widgets tree for action:'layout'.
// One rail per Larozaa section (ARABIC_SECTIONS) plus every series, so the
// hub covers the whole site. Films / Series menus hide rails via
// showWhenType; a chosen Category empties the other section rails.

function arabicLayout() {
  var rails = [];
  for (var i = 0; i < ARABIC_SECTIONS.length; i++) {
    var s = ARABIC_SECTIONS[i];
    rails.push({
      type: 'rail',
      id: s.id,
      title: s.label,
      rail: s.id,
      showWhenType: s.kind,
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
        title: 'رائج · Spotlight',
        rail: 'trending',
        bleed: 'latest',
      },
      'rail',
      { rail: 'trending' },
    ),
    hubWithLoad(
      link({
        type: 'rail',
        id: 'latest',
        title: 'أخر الاضافات',
        rail: 'latest',
        hideWhenBleed: true,
        maxPages: ARABIC_RAIL_MAX_PAGES,
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
    node.maxPages = ARABIC_RAIL_MAX_PAGES;
    widgets.push(hubWithLoad(node, 'rail', { rail: node.rail }));
  }

  return {
    pages: {
      arabic: {
        feed: true,
        feedRails: ARABIC_FEED_RAILS.slice(),
        pageSize: 24,
        // No pageBack: flat catalog — remote Back → nav rail.
        // enter / restore omitted: hero View details owns first land
        // (TvHeroActions defaultFocus) for nav OK and RIGHT from the rail.
        widgets: widgets,
      },
    },
  };
}
