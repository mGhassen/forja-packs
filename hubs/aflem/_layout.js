// Aflem hub page layout — widgets tree for action:'layout'.

function brstejLayout() {
  return {
    dir: 'rtl',
    pages: {
      aflem: {
        feed: true,
        feedRails: BRSTEJ_FEED_RAILS.slice(),
        pageSize: 24,
        // TV D-pad — vertical chain is pack focusUp/focusDown on widgets.
        // Visual: latest → continue? → series.
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
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'أخر الاضافات',
            rail: 'latest',
            hideWhenBleed: true,
            // First catalog row ↑ → View details (not top menu).
            focusUp: 'hero-details',
            focusDown: 'continue_watching',
          }, 'rail', { rail: 'latest' }),
          {
            type: 'continue',
            id: 'continue_watching',
            focusUp: 'latest',
            focusDown: 'series',
          },
          hubWithLoad(
            {
              type: 'ranked',
              id: 'series',
              title: 'مسلسلات',
              rail: 'series',
              style: 'numbered',
              focusUp: 'continue_watching',
            },
            'rail',
            { rail: 'series' },
          ),
        ],
      },
    },
  };
}
