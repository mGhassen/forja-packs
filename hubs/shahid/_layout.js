// Shahid hub page layout — widgets tree for action:'layout'.

function shahidLayout() {
  var bleedId = 'top_movies';
  var railIds = [];
  for (var i = 0; i < SHAHID_FEED_RAILS.length; i++) {
    railIds.push(SHAHID_FEED_RAILS[i]);
  }
  var pageBack = railIds.slice().reverse();

  var widgets = [
    hubWithLoad(
      {
        type: 'hero',
        id: 'spotlight',
        title: 'Shahid',
        rail: 'top_series',
        bleed: bleedId,
      },
      'rail',
      { rail: 'top_series' },
    ),
  ];
  for (var j = 0; j < railIds.length; j++) {
    var id = railIds[j];
    var def = SHAHID_RAILS[id];
    if (!def) continue;
    var extra = {
      type: 'rail',
      id: id,
      title: def.label,
      rail: id,
      hideWhenBleed: id === bleedId,
    };
    if (id === bleedId) {
      // Next painted rail after the bleed (skip self).
      for (var k = 0; k < railIds.length; k++) {
        if (railIds[k] !== bleedId) {
          extra.focusDown = railIds[k];
          break;
        }
      }
    } else {
      var prev = null;
      var next = null;
      for (var p = 0; p < railIds.length; p++) {
        if (railIds[p] === id) {
          if (p > 0) prev = railIds[p - 1];
          if (p + 1 < railIds.length) next = railIds[p + 1];
          break;
        }
      }
      // Bleed sits under the hero — ↑ from the first catalog rail after bleed
      // lands on the bleed row id.
      if (prev === bleedId || prev == null) {
        extra.focusUp = bleedId;
      } else {
        extra.focusUp = prev;
      }
      if (next) extra.focusDown = next;
    }
    widgets.push(hubWithLoad(extra, 'rail', { rail: id }));
  }
  return {
    dir: 'rtl',
    pages: {
      shahid: {
        feed: true,
        feedRails: SHAHID_FEED_RAILS.slice(),
        pageSize: 20,
        focus: {
          restore: bleedId,
          restoreMode: 'remembered',
          pageBack: pageBack,
        },
        widgets: widgets,
      },
    },
  };
}
