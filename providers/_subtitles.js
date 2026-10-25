// Shared caption → row.subtitles mappers for EngineJS VOD packs (prelude).
// Shapes: VidLink/PeeStream `captions[{url,language}]`, Rive `captions[{file,label}]`,
// MegaPlay `tracks[{file,label,kind}]`.

function forjaCaptionsToSubtitles(captions, sourceName) {
  var out = [];
  if (!Array.isArray(captions)) return out;
  for (var i = 0; i < captions.length; i++) {
    var c = captions[i];
    if (!c || typeof c !== 'object') continue;
    var url = String(c.url || c.file || c.src || '').trim();
    if (!url || url.indexOf('http') !== 0) continue;
    var lang = String(
      c.language || c.lang || c.label || c.name || 'en',
    ).trim() || 'en';
    var name = String(c.label || c.name || lang).trim() || lang;
    var row = {
      url: url,
      language: lang,
      name: name,
    };
    if (sourceName) row.sourceName = String(sourceName);
    out.push(row);
  }
  return out;
}

function forjaMegaplayTracksToSubtitles(tracks, sourceName) {
  var out = [];
  if (!Array.isArray(tracks)) return out;
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i];
    if (!t || typeof t !== 'object') continue;
    var kind = String(t.kind || '').toLowerCase();
    var url = String(t.file || t.url || '').trim();
    if (!url || url.indexOf('http') !== 0) continue;
    if (
      kind &&
      kind !== 'captions' &&
      kind !== 'subtitles' &&
      kind !== 'subtitle'
    ) {
      if (!/\.(vtt|srt|ass)(\?|$)/i.test(url)) continue;
    }
    var lang = String(t.label || t.language || t.lang || 'en').trim() || 'en';
    var row = {
      url: url,
      language: lang,
      name: lang,
    };
    if (sourceName) row.sourceName = String(sourceName);
    out.push(row);
  }
  return out;
}
