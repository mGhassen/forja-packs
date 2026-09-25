// Downloads hub page — kind menu plus the saved-title grid.

var DOWNLOADS_KIND_ITEMS = [
  { id: 'movie', label: 'Film' },
  { id: 'tv', label: 'Series' },
  { id: 'anime', label: 'Anime' },
  { id: 'asian_drama', label: 'Asian Drama' },
];

function downloadsLayout() {
  return {
    pages: {
      downloads: {
        focus: {
          enter: 'kind',
          restore: 'kind',
          restoreMode: 'remembered',
          pageBack: ['grid', 'kind'],
        },
        widgets: [
          kitTabsCards('page', { expand: true }, [
            kitMenu('kind', DOWNLOADS_KIND_ITEMS, {
              toggle: true,
              focusDown: 'grid',
            }),
            hubWithLoad(
              kitList('grid', {
                kindMenu: 'kind',
                focusUp: 'kind',
                emptyTitle: 'Nothing downloaded yet',
                emptyDescription:
                  'Save a film or episode from Sources and it shows up here.',
              }),
              'feed',
              {},
            ),
          ]),
        ],
      },
    },
  };
}
