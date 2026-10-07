// Cartoon hub page layout — widgets tree for action:'layout'.

function cartoonLayout() {
  return {
    pages: {
      cartoon: {
        feed: true,
        feedRails: CARTOON_FEED_RAILS.slice(),
        pageSize: 24,
        // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
        // Visual: latest → continue? → popular → episodes → all (A–Z).
        // Empty Continue: host kit-edge miss walks past.
        // No pageBack: flat catalog — remote Back → nav rail.
        // enter / restore omitted: hero View details owns first land
        // (TvHeroActions defaultFocus) for nav OK and RIGHT from the rail.
        widgets: [
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: 'أحدث المسلسلات',
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
            focusDown: 'popular',
          },
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'أضيف حديثًا',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'portrait',
            maxPages: CARTOON_RAIL_MAX_PAGES,
            // First catalog row ↑ → View details (not top menu).
            focusUp: 'hero-details',
            focusDown: 'continue_watching',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'الأكثر حلقات',
              rail: 'popular',
              aspect: 'portrait',
              maxPages: CARTOON_RAIL_MAX_PAGES,
              focusUp: 'continue_watching',
              focusDown: 'episodes',
            },
            'rail',
            { rail: 'popular' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'episodes',
            title: 'أحدث الحلقات',
            rail: 'episodes',
            aspect: 'portrait',
            maxPages: CARTOON_RAIL_MAX_PAGES,
            focusUp: 'popular',
            focusDown: 'all',
          }, 'rail', { rail: 'episodes' }),
          hubWithLoad({
            type: 'rail',
            id: 'all',
            title: 'كل المسلسلات (أ - ي)',
            rail: 'all',
            aspect: 'portrait',
            maxPages: CARTOON_RAIL_MAX_PAGES,
            focusUp: 'episodes',
          }, 'rail', { rail: 'all' }),
        ],
      },
    },
  };
}
