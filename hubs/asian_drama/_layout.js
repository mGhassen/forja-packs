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
        // TV D-pad — vertical chain is pack focusUp/focusDown.
        // No pageBack: flat catalog — remote Back → nav rail.
        // enter omitted: hero View details owns first land (defaultFocus).
        focus: {
          restore: 'latest',
          restoreMode: 'remembered',
        },
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
          {
            type: 'continue',
            id: 'continue_watching',
            focusUp: 'latest',
            focusDown: 'trending',
          },
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'Latest Update',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'landscape',
            // First catalog row ↑ → View details (not top menu).
            focusUp: 'hero-details',
            focusDown: 'continue_watching',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad({
            type: 'rail',
            id: 'trending',
            title: 'Trending',
            rail: 'trending',
            aspect: 'landscape',
            focusUp: 'continue_watching',
            focusDown: 'popular',
          }, 'rail', { rail: 'trending' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'Popular',
              rail: 'most_viewed',
              aspect: 'landscape',
              focusUp: 'trending',
              focusDown: 'upcoming',
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
            focusUp: 'popular',
          }, 'rail', { rail: 'upcoming' }),
        ],
      },
    },
  };
}
