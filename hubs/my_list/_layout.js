// My List hub page layout — widgets tree for action:'layout'.

function myListKindItems(cfg) {
  return [
    { id: 'movie', label: hubText(cfg, 'Film') },
    { id: 'tv', label: hubText(cfg, 'Series') },
    { id: 'anime', label: hubText(cfg, 'Anime') },
    { id: 'asian_drama', label: hubText(cfg, 'Asian Drama') },
  ];
}

function myListStatusTabs(cfg) {
  return [
    { id: 'plantowatch', label: hubText(cfg, 'Plan to Watch') },
    { id: 'watching', label: hubText(cfg, 'Watching') },
    { id: 'hold', label: hubText(cfg, 'On Hold') },
    { id: 'completed', label: hubText(cfg, 'Completed') },
    { id: 'dropped', label: hubText(cfg, 'Dropped') },
  ];
}

function myListLayout(cfg) {
  return {
    pages: {
      my_list: {
        focus: {
          enter: 'kind',
          restore: 'kind',
          restoreMode: 'remembered',
          pageBack: ['grid', 'status', 'kind'],
        },
        widgets: [
          kitTabsCards('page', { expand: true }, [
            kitMenu('kind', myListKindItems(cfg), {
              toggle: true,
              focusDown: 'status',
              search: {
                action: 'eventSearch',
                placeholder: hubText(cfg, 'Search my list…'),
              },
            }),
            kitTabs('status', myListStatusTabs(cfg), {
              default: 'plantowatch',
              focusUp: 'kind',
              focusDown: 'grid',
            }),
            hubWithLoad(
              kitList('grid', {
                kindMenu: 'kind',
                statusTab: 'status',
                // ↑ from top-row posters → status tabs (status↓ already → grid).
                focusUp: 'status',
                // Desktop baseline; TV × chromeScale → slightly larger than
                // default 100px film posters, denser titles.
                cardWidth: 170,
                titleFontSize: 12,
                emptyTitle: hubText(cfg, 'Nothing in this list yet'),
                emptyDescription: hubText(
                  cfg,
                  'Open a title and tap + to set a watch status.',
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
