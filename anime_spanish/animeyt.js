var SPECS = {
  base: 'https://vvw.animeyt.one',
  mirrors: [
    'https://vvw.animeyt.one',
    'https://animeyt.one',
    'https://animeytx.org',
    'https://animeyt.cc',
  ],
  backend: '/yt',
  searchPath: '/animes?buscar=',
  episodeStyle: 'animeyt',
  brand: 'AnimeYT',
};

function extract(ctx) {
  return esHexCmsExtract(ctx, SPECS);
}
