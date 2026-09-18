// Asian Drama hub page layout — widgets tree for action:'layout'.

function kisskhLayout() {
  return {
    pages: {
      asian_drama: {
        feed: true,
        feedRails: [
          'spotlight',
          'latest',
          'trending',
          'most_viewed',
          'upcoming',
        ],
        pageSize: 24,
        widgets: [
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: 'Spotlight',
              rail: 'spotlight',
              bleed: 'latest',
            },
            'rail',
            { rail: 'spotlight' },
          ),
          { type: 'continue', id: 'continue_watching' },
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'Latest Update',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'landscape',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad({
            type: 'rail',
            id: 'trending',
            title: 'Trending',
            rail: 'trending',
            aspect: 'landscape',
          }, 'rail', { rail: 'trending' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'Popular',
              rail: 'most_viewed',
              aspect: 'landscape',
            },
            'rail',
            { rail: 'most_viewed' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'upcoming',
            title: 'Upcoming',
            rail: 'upcoming',
            aspect: 'landscape',
          }, 'rail', { rail: 'upcoming' }),
        ],
      },
    },
  };
}
