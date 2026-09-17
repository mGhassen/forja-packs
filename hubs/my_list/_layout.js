// My List hub page layout — widgets tree for action:'layout'.

var MY_LIST_KIND_ITEMS = [
  { id: 'movie', label: 'Film' },
  { id: 'tv', label: 'Series' },
  { id: 'anime', label: 'Anime' },
  { id: 'asian_drama', label: 'Asian Drama' },
];

var MY_LIST_STATUS_TABS = [
  { id: 'plantowatch', label: 'Plan to Watch' },
  { id: 'watching', label: 'Watching' },
  { id: 'hold', label: 'On Hold' },
  { id: 'completed', label: 'Completed' },
  { id: 'dropped', label: 'Dropped' },
];

function myListLayout() {
  return {
    pages: {
      mylist: {
        focus: {
          enter: 'kind',
          restore: 'kind',
          restoreMode: 'remembered',
          pageBack: ['grid', 'status', 'kind'],
        },
        widgets: [
          kitTabsCards('page', { expand: true }, [
            kitMenu('kind', MY_LIST_KIND_ITEMS, {
              toggle: true,
              focusDown: 'status',
            }),
            kitTabs('status', MY_LIST_STATUS_TABS, {
              default: 'plantowatch',
              focusUp: 'kind',
              focusDown: 'grid',
            }),
            hubWithLoad(
              kitList('grid', {
                kindMenu: 'kind',
                statusTab: 'status',
                emptyTitle: 'Nothing in this list yet',
                emptyDescription:
                  'Open a title and tap + to set a watch status.',
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
