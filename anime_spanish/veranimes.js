var SPECS = {
  base: 'https://wwv.veranimes.net',
  mirrors: ['https://wwv.veranimes.net', 'https://veranimes.net'],
  backend: '/process',
  searchPath: '/animes?buscar=',
  brand: 'VerAnimes',
};

function extract(ctx) {
  return esHexCmsExtract(ctx, SPECS);
}
