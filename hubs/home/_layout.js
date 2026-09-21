// Home hub page layout — widgets tree for action:'layout'.

function tmdbLayout() {
  var genreWidgets = tmdbPickGenreRows(3).map(function (g) {
    return hubWithLoad(
      {
        type: 'rail',
        id: 'genre_' + g.id,
        title: g.label,
        rail: 'genre',
        params: { genreRow: g.id },
        // ↑ back to New Releases; further ↑ uses pageBack / sort walk.
        focusUp: 'new_releases',
      },
      'rail',
      { rail: 'genre', genreRow: g.id },
    );
  });
  return {
    pages: {
      home: {
        feed: true,
        // Match TMDB_FEED_CLAIM — first-paint batch only. new_releases / genre
        // rows lazy-load via LazyViewportGate (not empty feed slots).
        feedRails: ['spotlight', 'featured', 'popular'],
        pageSize: TMDB_HOME_RAIL_CAP,
        maxPages: 4,
        // TV D-pad — same contract as IPTV / Live Sports.
        // enter omitted: hero View details owns first land (defaultFocus).
        // restore: remembered Featured when returning from nav RIGHT.
        // pageBack: leaf → outer; missing/empty rows skip via _rowActive.
        focus: {
          restore: 'featured',
          restoreMode: 'remembered',
          pageBack: [
            'new_releases',
            'because',
            'because-shuffle',
            'mood-results',
            'mood-chips',
            'continue_watching',
            'popular',
            'featured',
          ],
        },
        widgets: [
          {
            type: 'vertical_filters',
            id: 'watch_providers',
            showSelectedInTopBar: true,
            options: TMDB_VERTICAL_FILTERS,
          },
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: 'Spotlight',
              rail: 'spotlight',
              // Hero ↓ → Featured bleed (host resolveFocusEdge on bleed id).
              bleed: 'featured',
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
            { rail: 'spotlight' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'featured',
            title: 'Featured This Month',
            rail: 'featured',
            hideWhenBleed: true,
            focusDown: 'popular',
          }, 'rail', { rail: 'featured' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'Popular',
              rail: 'popular',
              style: 'numbered',
              maxPages: 2,
              focusUp: 'featured',
              // Empty Continue → host kit-edge miss → walk to mood-chips.
              focusDown: 'continue_watching',
            },
            'rail',
            { rail: 'popular' },
          ),
          {
            type: 'continue',
            id: 'continue_watching',
            mergeHomeWatchHistory: true,
            focusUp: 'popular',
            focusDown: 'mood-chips',
          },
          hubWithLoad(
            {
              type: 'mood',
              id: 'moods',
              title: "What's your mood?",
              options: TMDB_MOODS,
              // Host maps these onto mood-chips (not widget id `moods`).
              focusUp: 'continue_watching',
              focusDown: 'because-shuffle',
            },
            'rail',
            { rail: 'discover' },
          ),
          hubWithLoad(
            {
              type: 'because',
              id: 'because',
              rail: 'because',
              focusUp: 'mood-chips',
              focusDown: 'new_releases',
            },
            'rail',
            { rail: 'because' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'new_releases',
            title: 'New Releases',
            rail: 'new_releases',
            focusUp: 'because',
          }, 'rail', { rail: 'new_releases' }),
        ].concat(genreWidgets),
      },
    },
  };
}
