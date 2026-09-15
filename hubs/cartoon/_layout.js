// Cartoon hub page layout — widgets tree for action:'layout'.

function cartoonLayout() {
  return {
    dir: 'rtl',
    pages: {
      cartoon: {
        feed: true,
        feedRails: CARTOON_FEED_RAILS.slice(),
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
            title: 'أضيف حديثًا',
            rail: 'latest',
            hideWhenBleed: true,
            aspect: 'portrait',
          }, 'rail', { rail: 'latest' }),
          hubWithLoad(
            {
              type: 'ranked',
              id: 'popular',
              title: 'الأكثر حلقات',
              rail: 'popular',
              aspect: 'portrait',
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
          }, 'rail', { rail: 'episodes' }),
        ],
      },
    },
  };
}
