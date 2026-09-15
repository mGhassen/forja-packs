// Kids hub page layout — widgets tree for action:'layout'.

function kidsLayout() {
  return {
    dir: 'rtl',
    pages: {
      kids: {
        feed: true,
        feedRails: KIDS_FEED_RAILS.slice(),
        pageSize: 24,
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
          { type: 'continue', id: 'continue_watching' },
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'مسلسلات جديدة',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'portrait',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad({
            type: 'rail',
            id: 'movies',
            title: 'أفلام جديدة',
            rail: 'movies',
            aspect: 'portrait',
          }, 'rail', { rail: 'movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'episodes',
            title: 'الحلقات الجديدة',
            rail: 'episodes',
            aspect: 'portrait',
          }, 'rail', { rail: 'episodes' }),
        ],
      },
    },
  };
}
