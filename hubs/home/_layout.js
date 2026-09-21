// Home hub page layout — widgets tree for action:'layout'.

function tmdbLayout() {
  // Visual D-pad chain (host skips missing/empty via kit-edge miss):
  // featured → popular → continue_watching? → mood-chips
  // → because-shuffle? → because (poster rail) → new_releases
  // → genre_0 → genre_1 → genre_2
  // Empty Continue / empty Because (no seeds) / no shuffle: miss walks past.
  // Pack names the because RAIL (`focusDown: 'because'`). Host ↓ prefers
  // `because-shuffle` chrome when that row is mounted.
  var genres = tmdbPickGenreRows(3);
  var firstGenreId = genres.length > 0 ? 'genre_' + genres[0].id : null;
  var genreWidgets = genres.map(function (g, i) {
    var id = 'genre_' + g.id;
    var edges = {};
    if (i === 0) {
      edges.focusUp = 'new_releases';
    } else {
      edges.focusUp = 'genre_' + genres[i - 1].id;
    }
    if (i + 1 < genres.length) {
      edges.focusDown = 'genre_' + genres[i + 1].id;
    }
    return hubWithLoad(
      Object.assign(
        {
          type: 'rail',
          id: id,
          title: g.label,
          rail: 'genre',
          params: { genreRow: g.id },
        },
        edges,
      ),
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
        // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
        // No pageBack: flat catalog — remote Back leaves the page to the
        // nav rail (same as shell tab-root). Keep pageBack for real panes
        // (IPTV items→cats, My List grid→status→kind).
        // enter / restore omitted: hero View details owns first land
        // (TvHeroActions defaultFocus) for nav OK and RIGHT from the rail.
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
            // First catalog row ↑ → top menu (Search / Films), not hero CTAs.
            // Menu ↓ still lands on View details via host focusHero.
            focusUp: 'top-bar',
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
              // Empty Continue → host kit-edge miss → mood-chips.
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
              // Empty Continue → host kit-edge miss → popular.
              focusUp: 'continue_watching',
              // Because poster rail. Host ↓ lands on because-shuffle first when
              // canShuffle; empty Because → miss walk → new_releases.
              focusDown: 'because',
            },
            'rail',
            { rail: 'discover' },
          ),
          hubWithLoad(
            {
              // Poster rail rowId: because → tv-home-because-0.
              type: 'because',
              id: 'because',
              rail: 'because',
              // Same home WatchHistoryService pool as Continue Watching.
              mergeHomeWatchHistory: true,
              // Shuffle chrome ↑ uses this (mood-chips). Rail ↑ host→shuffle
              // when canShuffle; else this pack edge.
              focusUp: 'mood-chips',
              focusDown: 'new_releases',
            },
            'rail',
            { rail: 'because' },
          ),
          hubWithLoad(
            Object.assign(
              {
                type: 'rail',
                id: 'new_releases',
                title: 'New Releases',
                rail: 'new_releases',
                // ↑ Because poster rail (not shuffle). Empty → miss → mood.
                focusUp: 'because',
              },
              firstGenreId ? { focusDown: firstGenreId } : {},
            ),
            'rail',
            { rail: 'new_releases' },
          ),
        ].concat(genreWidgets),
      },
    },
  };
}
