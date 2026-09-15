// Arabic hub page layout — widgets tree for action:'layout'.

function arabicLayout() {
  return {
    dir: 'rtl',
    pages: {
      arabic: {
        feed: true,
        feedRails: ARABIC_FEED_RAILS.slice(),
        pageSize: 24,
        widgets: [
          hubWithLoad(
            {
              type: 'hero',
              id: 'spotlight',
              title: 'رائج · Spotlight',
              rail: 'trending',
              bleed: 'latest',
            },
            'rail',
            { rail: 'trending' },
          ),
          hubWithLoad({
            type: 'rail',
            id: 'latest',
            title: 'أخر الاضافات',
            rail: 'latest',
            hideWhenBleed: true,
          }, 'rail', { rail: 'latest' }),
          { type: 'continue', id: 'continue_watching' },
          hubWithLoad({
            type: 'rail',
            id: 'series',
            title: 'مسلسلات عربية',
            rail: 'series',
          }, 'rail', { rail: 'series' }),
          hubWithLoad({ type: 'rail', id: 'movies', title: 'أفلام عربية', rail: 'movies' }, 'rail', { rail: 'movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'turkish',
            title: 'مسلسلات تركية',
            rail: 'turkish',
          }, 'rail', { rail: 'turkish' }),
          hubWithLoad({
            type: 'rail',
            id: 'foreign_series',
            title: 'مسلسلات أجنبية',
            rail: 'foreign_series',
          }, 'rail', { rail: 'foreign_series' }),
          hubWithLoad({
            type: 'rail',
            id: 'foreign_movies',
            title: 'أفلام أجنبية',
            rail: 'foreign_movies',
          }, 'rail', { rail: 'foreign_movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'indian_series',
            title: 'مسلسلات هندية',
            rail: 'indian_series',
          }, 'rail', { rail: 'indian_series' }),
          hubWithLoad({
            type: 'rail',
            id: 'indian',
            title: 'أفلام هندية',
            rail: 'indian',
          }, 'rail', { rail: 'indian' }),
          hubWithLoad({
            type: 'rail',
            id: 'asian_series',
            title: 'مسلسلات آسيوية',
            rail: 'asian_series',
          }, 'rail', { rail: 'asian_series' }),
          hubWithLoad({
            type: 'rail',
            id: 'asian_movies',
            title: 'أفلام آسيوية',
            rail: 'asian_movies',
          }, 'rail', { rail: 'asian_movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'anime_series',
            title: 'أنمي · مسلسلات',
            rail: 'anime_series',
          }, 'rail', { rail: 'anime_series' }),
          hubWithLoad({
            type: 'rail',
            id: 'anime_movies',
            title: 'أنمي · أفلام',
            rail: 'anime_movies',
          }, 'rail', { rail: 'anime_movies' }),
          hubWithLoad({
            type: 'rail',
            id: 'dubbed',
            title: 'أفلام مدبلجة',
            rail: 'dubbed',
          }, 'rail', { rail: 'dubbed' }),
          hubWithLoad({
            type: 'rail',
            id: 'turkish_movies',
            title: 'أفلام تركية',
            rail: 'turkish_movies',
          }, 'rail', { rail: 'turkish_movies' }),
          hubWithLoad({ type: 'rail', id: 'ramadan', title: 'رمضان 2026', rail: 'ramadan' }, 'rail', { rail: 'ramadan' }),
          hubWithLoad({
            type: 'rail',
            id: 'tv_programs',
            title: 'برامج تلفزيونية',
            rail: 'tv_programs',
          }, 'rail', { rail: 'tv_programs' }),
          hubWithLoad({ type: 'rail', id: 'plays', title: 'مسرحيات', rail: 'plays' }, 'rail', { rail: 'plays' }),
        ],
      },
    },
  };
}
