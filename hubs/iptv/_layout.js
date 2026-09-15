// IPTV hub page layout — widgets tree for action:'layout'.

function iptvCatalogActions() {
  return [
    {
      id: 'catalog',
      label: 'Section',
      icon: 'live_tv',
      default: 'live',
      items: [
        { id: 'live', label: 'Live' },
        { id: 'movies', label: 'Movies' },
        { id: 'series', label: 'Series' },
      ],
    },
    {
      id: 'sort',
      label: 'Sort',
      icon: 'filter',
      default: 'playlist',
      items: [
        { id: 'playlist', label: 'Playlist' },
        { id: 'nameAsc', label: 'Name A–Z' },
        { id: 'nameDesc', label: 'Name Z–A' },
      ],
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: 'refresh',
      action: 'refresh',
    },
    {
      id: 'search',
      label: 'Search',
      action: 'eventSearch',
      trailing: true,
      placeholder: 'Channel, movie, series…',
    },
    {
      id: 'view',
      label: 'View',
      icon: 'view',
      trailing: true,
      items: [
        { id: 'cards', label: 'Cards' },
        { id: 'list', label: 'List' },
        { id: 'timeline', label: 'Timeline' },
      ],
    },
    {
      id: 'portals',
      label: 'Portals',
      action: 'portals',
      hoistSource: 'iptv',
      trailing: true,
    },
  ];
}

function iptvLayout() {
  return {
    pages: {
      iptv: {
        widgets: [
          kitColumnsHeader('page', { expand: true }, [
            kitTopBar('chrome', {
              focusDown: 'cats',
              actions: iptvCatalogActions(),
            }),
            kitCategoryBar('cats', {
              dynamic: true,
              source: 'iptv',
              orientation: 'vertical',
              focusUp: 'chrome',
              focusDown: 'items',
              default: 'all',
              items: [{ id: 'all', label: 'All', icon: 'grid' }],
            }),
            hubWithLoad(
              kitList('items', {
                style: 'grid',
                expand: true,
                focusUp: 'cats',
                kindMenu: 'cats',
                catalogMenu: 'catalog',
                sortMenu: 'sort',
                emptyTitle: 'Add a portal in Settings → Addons → IPTV',
                emptyDescription:
                  'Enter portal URL and credentials, then refresh.',
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
