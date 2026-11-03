// Downloads hub page — kind menu plus the saved-title grid.

function downloadsKindItems(cfg) {
  return [
    { id: 'movie', label: hubText(cfg, 'Film') },
    { id: 'tv', label: hubText(cfg, 'Series') },
    { id: 'anime', label: hubText(cfg, 'Anime') },
    { id: 'asian_drama', label: hubText(cfg, 'Asian Drama') },
  ];
}

function downloadsLayout(cfg) {
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
            kitMenu('kind', downloadsKindItems(cfg), {
              toggle: true,
              focusDown: 'grid',
            }),
            hubWithLoad(
              kitList('grid', {
                style: 'grid',
                cardKind: 'poster',
                open: 'panel',
                panel: 'offline',
                kindMenu: 'kind',
                focusUp: 'kind',
                emptyTitle: hubText(cfg, 'Nothing downloaded yet'),
                emptyDescription: hubText(
                  cfg,
                  'Save a film or episode from Sources and it shows up here.',
                ),
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
