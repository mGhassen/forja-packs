var SPECS = {
  base: 'https://www.otakustv.net',
  mirrors: ['https://www.otakustv.net', 'https://otakustv.net'],
  backend: '/backend',
  searchPath: '/animes?buscar=',
  brand: 'OtakusTV',
};

function extract(ctx) {
  return esHexCmsExtract(ctx, SPECS);
}
