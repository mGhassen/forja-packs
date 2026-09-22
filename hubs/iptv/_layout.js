// IPTV hub page layout — widgets tree for action:'layout'.
//
// Compact (host width < shellNavCompactMaxWidth): collapsed shelf, rail search,
// hide view/sort/top-bar search. Wide desktop keeps the full chrome.

function iptvCatalogActions() {
  return [
    {
      id: 'catalog',
      label: 'Section',
      style: 'shelf',
      // Compact shell only — collapsed to selected; hover expands (host).
      expandOnHover: true,
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
      ],
    },
    {
      id: 'view',
      label: 'View',
      style: 'group',
      hideWhenCompact: true,
      // Cards / EPG only apply to Live channels.
      showWhen: { catalog: 'live' },
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
      hideWhenCompact: true,
      placeholder: 'Search channels or categories…',
    },
    {
      id: 'sort',
      label: 'Sort',
      icon: 'filter',
      style: 'icon',
      trailing: true,
      hideWhenCompact: true,
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
      width: 260,
    },
  ];
}

function iptvLayout() {
  return {
    pages: {
      iptv: {
        // TV: nav OK/→ land on last selected category; Back: channels → cats → shell.
        focus: {
          enter: 'cats',
          restore: 'cats',
          restoreMode: 'remembered',
          pageBack: ['items', 'cats'],
        },
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
              // Vertical panels: ↑/↓ stay in cats; → enters channels (not ↓).
              // ↑ → selected Live/Movies/Series shelf (not bare chrome row).
              focusUp: 'catalog',
              focusRight: 'items',
              // Always-open field above categories — compact shell only.
              search: {
                action: 'eventSearch',
                open: true,
                compactOnly: true,
                placeholder: 'Search channels or categories…',
              },
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
                // ← categories; ↑ selected Live/Movies/Series (host splits
                // left/right of the viewport: left = shelf, right = Portals);
                // → remembered portal when the panel row is mounted.
                focusLeft: 'cats',
                focusUp: 'catalog',
                focusRight: 'portals',
                kindMenu: 'cats',
                catalogMenu: 'catalog',
                sortMenu: 'sort',
                pageSize: 48,
                // Movies/Series posters — denser than hub rail defaults (190/32).
                cardWidth: 140,
                gap: 10,
                emptyTitle: 'Choose a portal',
                emptyDescription:
                  'Select a portal to browse Live TV, Movies, and Series.',
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
