// Kids hub page layout — widgets tree for action:'layout'.

function kidsLayout() {
  return {
    dir: 'rtl',
    pages: {
      kids: {
        feed: true,
        feedRails: KIDS_FEED_RAILS.slice(),
        pageSize: 24,
        // No pageBack: flat catalog — remote Back → nav rail.
        focus: {
          restore: 'latest',
          restoreMode: 'remembered',
        },
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
            focusDown: 'movies',
          },
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'مسلسلات جديدة',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'portrait',
            focusDown: 'continue_watching',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad({
            type: 'rail',
            id: 'movies',
            title: 'أفلام جديدة',
            rail: 'movies',
            aspect: 'portrait',
            focusUp: 'continue_watching',
            focusDown: 'episodes',
          }, 'rail', { rail: 'movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'episodes',
            title: 'الحلقات الجديدة',
            rail: 'episodes',
            aspect: 'portrait',
            focusUp: 'movies',
          }, 'rail', { rail: 'episodes' }),
        ],
      },
    },
  };
}
