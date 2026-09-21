// Aflem hub page layout — widgets tree for action:'layout'.

function brstejLayout() {
  return {
    dir: 'rtl',
    pages: {
      aflem: {
        feed: true,
        feedRails: BRSTEJ_FEED_RAILS.slice(),
        pageSize: 24,
        focus: {
          restore: 'latest',
          restoreMode: 'remembered',
          pageBack: ['series', 'continue_watching', 'latest'],
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
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'أخر الاضافات',
            rail: 'latest',
            hideWhenBleed: true,
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
