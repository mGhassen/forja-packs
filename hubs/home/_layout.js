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
      },
      'rail',
      { rail: 'genre', genreRow: g.id },
    );
  });
  return {
    pages: {
      home: {
        feed: true,
        // First-paint only — new_releases / genre rows lazy-load when visible.
        feedRails: ['spotlight', 'featured', 'popular', 'new_releases'],
        pageSize: TMDB_HOME_RAIL_CAP,
        maxPages: 4,
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
          }, 'rail', { rail: 'featured' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'Popular',
              rail: 'popular',
              style: 'numbered',
              maxPages: 2,
            },
            'rail',
            { rail: 'popular', maxPages: 2 },
          ),
          { type: 'continue', id: 'continue_watching', mergeHomeWatchHistory: true },
          hubWithLoad(
            {
              type: 'mood',
              id: 'moods',
              title: "What's your mood?",
              options: TMDB_MOODS,
            },
            'rail',
            { rail: 'discover' },
          ),
          hubWithLoad(
            { type: 'because', id: 'because', rail: 'because' },
            'rail',
            { rail: 'because' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'new_releases',
            title: 'New Releases',
            rail: 'new_releases',
          }, 'rail', { rail: 'new_releases' }),
        ].concat(genreWidgets),
      },
    },
  };
}
