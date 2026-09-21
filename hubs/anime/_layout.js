// Anime hub page layout — widgets tree for action:'layout'.

function anilistLayout() {
  function rail(id, title, extra) {
    return hubWithLoad(
      Object.assign(
        { type: 'rail', id: id, title: title, rail: id },
        extra || {},
      ),
      'rail',
      { rail: id },
    );
  }
  return {
    pages: {
      anime: {
        feed: true,
        pageSize: Number(ANILIST_DEFAULTS.perPage) || 24,
        // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
        // Visual: trending → continue? → mood-chips → this_season → …
        // Empty Continue: host kit-edge miss walks past.
        // No pageBack: flat catalog — remote Back → nav rail.
        // enter / restore omitted: hero View details owns first land
        // (TvHeroActions defaultFocus) for nav OK and RIGHT from the rail.
        widgets: [
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: 'Spotlight',
              rail: 'spotlight',
              bleed: 'trending',
            },
            'rail',
            { rail: 'spotlight' },
          ),
          {
            type: 'continue',
            id: 'continue_watching',
            focusUp: 'trending',
            focusDown: 'mood-chips',
          },
          hubWithLoad(
            {
              type: 'mood',
              id: 'moods',
              title: 'Pick your vibe',
              options: ANILIST_MOODS,
              // Host maps these onto mood-chips (not widget id `moods`).
              // Empty Continue → host kit-edge miss → trending.
              focusUp: 'continue_watching',
              focusDown: 'this_season',
            },
            'rail',
            { rail: 'trending' },
          ),
          rail('trending', 'Trending Now', {
            hideWhenBleed: true,
            // First catalog row ↑ → View details (not top menu).
            focusUp: 'hero-details',
            focusDown: 'continue_watching',
          }),
          rail('this_season', 'This Season', {
            focusUp: 'mood-chips',
            focusDown: 'top_airing',
          }),
          rail('top_airing', 'Top Airing', {
            focusUp: 'this_season',
            focusDown: 'top_10',
          }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'top_10',
              title: 'Top 10 Today',
              rail: 'top_10',
              style: 'numbered',
              pageSize: 10,
              focusUp: 'top_airing',
              focusDown: 'popular',
            },
            'rail',
            { rail: 'top_10' },
          ),
          rail('popular', 'Most Popular', {
            focusUp: 'top_10',
            focusDown: 'latest_episodes',
          }),
          rail('latest_episodes', 'Recently Aired', {
            focusUp: 'popular',
            focusDown: 'top_rated',
          }),
          rail('top_rated', 'Top Rated', {
            focusUp: 'latest_episodes',
            focusDown: 'most_favorited',
          }),
          rail('most_favorited', 'Most Favorited', {
            focusUp: 'top_rated',
            focusDown: 'latest_completed',
          }),
          rail('latest_completed', 'Recently Completed', {
            focusUp: 'most_favorited',
          }),
        ],
      },
    },
  };
}
