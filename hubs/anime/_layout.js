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
          { type: 'continue', id: 'continue_watching' },
          hubWithLoad(
            {
              type: 'mood',
              id: 'moods',
              title: 'Pick your vibe',
              options: ANILIST_MOODS,
            },
            'rail',
            { rail: 'trending' },
          ),
          rail('trending', 'Trending Now', {
            hideWhenBleed: true,
            hideWhenTypeFilter: true,
          }),
          rail('this_season', 'This Season'),
          rail('top_airing', 'Top Airing'),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'top_10',
              title: 'Top 10 Today',
              rail: 'top_10',
              style: 'numbered',
              pageSize: 10,
            },
            'rail',
            { rail: 'top_10' },
          ),
          rail('popular', 'Most Popular'),
          rail('latest_episodes', 'Recently Aired'),
          rail('top_rated', 'Top Rated'),
          rail('most_favorited', 'Most Favorited'),
          rail('latest_completed', 'Recently Completed'),
        ],
      },
    },
  };
}
