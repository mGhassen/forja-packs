// Shahid hub page layout — widgets tree for action:'layout'.

function shahidLayout() {
  var widgets = [
    hubWithLoad(
      {
        type: 'hero',
        id: 'spotlight',
        title: 'Shahid',
        rail: 'top_series',
        bleed: 'top_movies',
      },
      'rail',
      { rail: 'top_series' },
    ),
  ];
  for (var i = 0; i < SHAHID_FEED_RAILS.length; i++) {
    var id = SHAHID_FEED_RAILS[i];
    var def = SHAHID_RAILS[id];
    if (!def) continue;
    widgets.push(
      hubWithLoad(
        {
          type: 'rail',
          id: id,
          title: def.label,
          rail: id,
          hideWhenBleed: id === 'top_series',
        },
        'rail',
        { rail: id },
      ),
    );
  }
  return {
    dir: 'rtl',
    pages: {
      shahid: {
        feed: true,
        feedRails: SHAHID_FEED_RAILS.slice(),
        pageSize: 20,
        widgets: widgets,
      },
    },
  };
}
