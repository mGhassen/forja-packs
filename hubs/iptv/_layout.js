// IPTV hub page layout — widgets tree for action:'layout'.

function iptvCatalogActions() {
  return [
    {
      id: 'catalog',
      label: 'Section',
      style: 'shelf',
      reload: true,
      default: 'live',
      items: [
        {
          id: 'live',
          label: 'Live',
          icon: 'live_tv',
          colors: ['#EF4444', '#7C2D12'],
        },
        {
          id: 'movies',
          label: 'Movies',
          icon: 'movie',
          colors: ['#EC4899', '#8B5CF6'],
        },
        {
          id: 'series',
          label: 'Series',
          icon: 'video_library',
          colors: ['#1CE783', '#13AA2E'],
        },
        {
          id: 'channels',
          label: 'Channels',
          icon: 'sports',
          colors: ['#F97316', '#7C2D12'],
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      style: 'group',
      default: 'cards',
      items: [
        { id: 'cards', label: 'Cards', icon: 'cards' },
        { id: 'guide', label: 'EPG', icon: 'guide' },
      ],
    },
    {
      id: 'search',
      label: 'Search',
      action: 'eventSearch',
      trailing: true,
      placeholder: 'Channel, movie, series…',
    },
    {
      id: 'sort',
      label: 'Sort',
      icon: 'filter',
      style: 'icon',
      trailing: true,
      default: 'playlist',
      items: [
        { id: 'playlist', label: 'Playlist' },
        { id: 'nameAsc', label: 'Name A–Z' },
        { id: 'nameDesc', label: 'Name Z–A' },
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
              features: {
                pin: true,
                reorder: true,
                widgets: ['favorites', 'watched'],
              },
            }),
            hubWithLoad(
              kitList('items', {
                style: 'grid',
                expand: true,
                focusUp: 'cats',
                kindMenu: 'cats',
                catalogMenu: 'catalog',
                sortMenu: 'sort',
                pageSize: 48,
                emptyTitle: 'Add a portal',
                emptyDescription:
                  'Open Portals to add credentials or import a share code.',
                loading: {
                  live: {
                    title: 'Loading channels',
                    detail:
                      'Fetching categories and channels from your portal…',
                  },
                  movies: {
                    title: 'Loading movies',
                    detail: 'Fetching categories and movies from your portal…',
                  },
                  series: {
                    title: 'Loading series',
                    detail: 'Fetching categories and series from your portal…',
                  },
                  channels: {
                    title: 'Scanning portals',
                    detail: 'Matching this brand across your IPTV portals…',
                  },
                },
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
