// Anime hub page layout — widgets tree for action:'layout'.

function anilistLayout(cfg) {
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
        // First-paint batch only (home/asian_drama pattern). Later rails
        // lazy-load via LazyViewportGate + row prefetch.
        feedRails: ['spotlight', 'trending', 'this_season'],
        pageSize: Number(ANILIST_DEFAULTS.perPage) || 24,
        // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
        // Visual: trending → continue? → mood-chips → mood-results?
        // → this_season → …
        // Empty Continue / empty mood posters: host kit-edge miss walks past.
        // No pageBack: flat catalog — remote Back → nav rail.
        // Nav OK / RIGHT → hero View details (not Continue Watching).
        focus: {
          enter: 'hero-details',
          restore: 'hero-details',
        },
        widgets: [
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: hubText(cfg, 'Spotlight'),
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
              title: hubText(cfg, 'Pick your vibe'),
              options: anilistMoodsFor(cfg),
              // Host maps these onto mood-chips (not widget id `moods`).
              // Empty Continue → host kit-edge miss → trending.
              focusUp: 'continue_watching',
              focusDown: 'this_season',
            },
            'rail',
            { rail: 'trending' },
          ),
          rail('trending', hubText(cfg, 'Trending Now'), {
            hideWhenBleed: true,
            // First catalog row ↑ → View details (not top menu).
            focusUp: 'hero-details',
            focusDown: 'continue_watching',
          }),
          rail('this_season', hubText(cfg, 'This Season'), {
            // ↑ mood posters first, then chips (empty results → miss).
            focusUp: 'mood-results',
            focusDown: 'top_airing',
          }),
          rail('top_airing', hubText(cfg, 'Top Airing'), {
            focusUp: 'this_season',
            focusDown: 'top_10',
          }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'top_10',
              title: hubText(cfg, 'Top 10 Today'),
              rail: 'top_10',
              style: 'numbered',
              pageSize: 10,
              focusUp: 'top_airing',
              focusDown: 'popular',
            },
            'rail',
            { rail: 'top_10' },
          ),
          rail('popular', hubText(cfg, 'Most Popular'), {
            focusUp: 'top_10',
            focusDown: 'latest_episodes',
          }),
          rail('latest_episodes', hubText(cfg, 'Recently Aired'), {
            focusUp: 'popular',
            focusDown: 'top_rated',
          }),
          rail('top_rated', hubText(cfg, 'Top Rated'), {
            focusUp: 'latest_episodes',
            focusDown: 'most_favorited',
          }),
          rail('most_favorited', hubText(cfg, 'Most Favorited'), {
            focusUp: 'top_rated',
            focusDown: 'latest_completed',
          }),
          rail('latest_completed', hubText(cfg, 'Recently Completed'), {
            focusUp: 'most_favorited',
          }),
        ],
      },
    },
  };
}
