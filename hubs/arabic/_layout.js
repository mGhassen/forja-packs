// Arabic hub page layout — widgets tree for action:'layout'.

function arabicLayout() {
  // Visual order under the hero bleed (`latest`).
  var chain = [
    'latest',
    'continue_watching',
    'series',
    'movies',
    'turkish',
    'foreign_series',
    'foreign_movies',
    'indian_series',
    'indian',
    'asian_series',
    'asian_movies',
    'anime_series',
    'anime_movies',
    'dubbed',
    'turkish_movies',
    'ramadan',
    'tv_programs',
    'plays',
  ];

  function edges(id) {
    var i = chain.indexOf(id);
    var out = {};
    if (i > 0) out.focusUp = chain[i - 1];
    if (i >= 0 && i + 1 < chain.length) out.focusDown = chain[i + 1];
    return out;
  }

  function rail(id, title, extra) {
    return hubWithLoad(
      Object.assign(
        { type: 'rail', id: id, title: title, rail: id },
        edges(id),
        extra || {},
      ),
      'rail',
      { rail: id },
    );
  }

  return {
    dir: 'rtl',
    pages: {
      arabic: {
        feed: true,
        feedRails: ARABIC_FEED_RAILS.slice(),
        pageSize: 24,
        // No pageBack: flat catalog — remote Back → nav rail.
        // Vertical chain is pack focusUp/focusDown via `chain`.
        focus: {
          restore: 'latest',
          restoreMode: 'remembered',
        },
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
          rail('latest', 'أخر الاضافات', { hideWhenBleed: true }),
          Object.assign(
            { type: 'continue', id: 'continue_watching' },
            edges('continue_watching'),
          ),
          rail('series', 'مسلسلات عربية'),
          rail('movies', 'أفلام عربية'),
          rail('turkish', 'مسلسلات تركية'),
          rail('foreign_series', 'مسلسلات أجنبية'),
          rail('foreign_movies', 'أفلام أجنبية'),
          rail('indian_series', 'مسلسلات هندية'),
          rail('indian', 'أفلام هندية'),
          rail('asian_series', 'مسلسلات آسيوية'),
          rail('asian_movies', 'أفلام آسيوية'),
          rail('anime_series', 'أنمي · مسلسلات'),
          rail('anime_movies', 'أنمي · أفلام'),
          rail('dubbed', 'أفلام مدبلجة'),
          rail('turkish_movies', 'أفلام تركية'),
          rail('ramadan', 'رمضان 2026'),
          rail('tv_programs', 'برامج تلفزيونية'),
          rail('plays', 'مسرحيات'),
        ],
      },
    },
  };
}
