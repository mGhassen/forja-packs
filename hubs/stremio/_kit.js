// Forja catalog hub SDK — canonical prelude (protocol 1 / kit 1).
// Copy or wrap into your pack `_kit.js` (do not require a sibling packs/sdk path).
// Contract: schema/catalog-envelope.schema.json
//
// Host sets first-class `ctx.action` / `ctx.params` / `ctx.auth` / `ctx.cache`
// / `ctx.kit` / `ctx.protocol` (R70-A12). Older hosts may still put the request
// under `ctx.config.__request` — prefer top-level, fall back for one release.

var HUB_KIT = 1;
var HUB_PROTOCOL = 1;

function hubRequest(ctx) {
  if (ctx && ctx.params && typeof ctx.params === 'object') {
    return {
      action: ctx.action,
      params: ctx.params,
      auth: ctx.auth,
      cache: ctx.cache,
      kit: ctx.kit,
      protocol: ctx.protocol,
    };
  }
  var cfg = (ctx && ctx.config) || {};
  return cfg.__request || {};
}

function hubAction(ctx) {
  return String((ctx && ctx.action) || hubRequest(ctx).action || '');
}

function hubParams(ctx) {
  if (ctx && ctx.params && typeof ctx.params === 'object') return ctx.params;
  return hubRequest(ctx).params || {};
}

function hubAuth(ctx) {
  if (ctx && ctx.auth && typeof ctx.auth === 'object') return ctx.auth;
  return hubRequest(ctx).auth || {};
}

function hubCache(ctx) {
  if (ctx && ctx.cache && typeof ctx.cache === 'object') return ctx.cache;
  return hubRequest(ctx).cache || {};
}

function hubConfig(ctx, defaults) {
  var cfg = Object.assign({}, defaults || {}, (ctx && ctx.config) || {});
  delete cfg.__request;
  return cfg;
}

function hubOk(action, data, cache) {
  var env = {
    ok: true,
    kit: HUB_KIT,
    protocol: HUB_PROTOCOL,
    action: action,
    data: data || {},
  };
  if (cache) env.cache = cache;
  return [env];
}

function hubItems(action, items, cache, paging) {
  var list = items || [];
  var stamped = [];
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (!m || typeof m !== 'object') continue;
    if (!m.paint) m = hubPaintPoster(m);
    stamped.push(m);
  }
  var data = { items: stamped };
  if (paging && typeof paging === 'object') {
    if (Number(paging.pageSize) > 0) data.pageSize = Number(paging.pageSize);
    if (typeof paging.hasMore === 'boolean') data.hasMore = paging.hasMore;
  }
  return hubOk(action, data, cache);
}

function hubFail(action, code, message, retryable) {
  return [
    {
      ok: false,
      kit: HUB_KIT,
      protocol: HUB_PROTOCOL,
      action: action || '',
      error: {
        code: code || 'UPSTREAM',
        message: String(message || ''),
        retryable: retryable === true,
      },
    },
  ];
}

function hubNotModified(action) {
  return [
    {
      ok: true,
      kit: HUB_KIT,
      protocol: HUB_PROTOCOL,
      action: action,
      notModified: true,
      data: {},
    },
  ];
}

/// Home-style card meta under the title: `2026 • FILM` / `TV`.
/// Packs that already put format in releaseInfo (anime: `2026 • 12 eps`) pass through.
function hubPosterTypeLabel(meta) {
  meta = meta || {};
  if (String(meta.type || '').toLowerCase() === 'anime') return null;
  var hint = String(meta.tmdbMediaType || '').trim().toLowerCase();
  var kind = String(meta.type || '').trim().toLowerCase();
  if (hint === 'tv' || kind === 'tv' || kind === 'series') return 'TV';
  if (hint === 'movie' || kind === 'movie') return 'FILM';
  if (kind === 'drama') {
    var badge = String(meta.badge || '').trim().toUpperCase();
    if (badge === 'MOVIE' || badge === 'FILM' || badge === 'HOLLYWOOD') {
      return 'FILM';
    }
    return 'TV';
  }
  return null;
}

function hubPosterCardSubtitle(meta) {
  meta = meta || {};
  var release = String(meta.releaseInfo || '').trim();
  if (release.indexOf(' • ') !== -1) return release || null;
  var parts = [];
  if (release) {
    parts.push(release.indexOf('-') !== -1 ? release.split('-')[0] : release);
  }
  var typeLabel = hubPosterTypeLabel(meta);
  if (typeLabel) parts.push(typeLabel);
  return parts.length ? parts.join(' • ') : null;
}

/// Paint-ready poster card — pack shapes props; host validates + paints only.
function hubPaintPoster(item, opts) {
  opts = opts || {};
  var meta = item || {};
  var title = String(meta.name || meta.title || opts.title || '');
  var imageUrl = String(
    meta.poster || meta.posterUrl || meta.imageUrl || opts.imageUrl || '',
  );
  var paint = {
    type: 'posterCard',
    props: {
      title: title,
      imageUrl: imageUrl,
    },
  };
  if (meta.rating != null || opts.rating != null) {
    paint.props.rating = Number(meta.rating != null ? meta.rating : opts.rating);
  }
  if (opts.rank != null) paint.props.rank = Number(opts.rank);
  var typeLabel = hubPosterTypeLabel(meta);
  var badge = String(meta.badge || opts.badge || '').trim();
  // Skip redundant FILM/TV corner chip when type is already in the subtitle.
  if (badge && !(typeLabel && badge.toUpperCase() === typeLabel)) {
    paint.props.badge = badge;
  }
  if (opts.subtitle) {
    paint.props.subtitle = String(opts.subtitle);
  } else {
    var sub = hubPosterCardSubtitle(meta);
    if (sub) paint.props.subtitle = sub;
  }
  var mediaType = String(meta.tmdbMediaType || meta.type || '')
    .trim()
    .toLowerCase();
  if (mediaType === 'movie' || mediaType === 'tv') {
    paint.props.mediaType = mediaType;
  }
  if (opts.aspect) paint.props.aspect = String(opts.aspect);
  if (meta.background || meta.backdrop || opts.backdropUrl) {
    paint.props.backdropUrl = String(
      meta.background || meta.backdrop || opts.backdropUrl || '',
    );
  }
  if (meta.logo || opts.logoUrl) {
    paint.props.logoUrl = String(meta.logo || opts.logoUrl || '');
  }
  if (meta.description || meta.overview || opts.overview) {
    paint.props.overview = String(
      meta.description || meta.overview || opts.overview || '',
    );
  }
  var out = Object.assign({}, meta);
  out.paint = paint;
  if (meta.open) out.open = meta.open;
  if (!out.meta && (meta.id || meta.name)) {
    out.meta = {
      id: String(meta.id || ''),
      type: String(meta.type || ''),
      name: title,
      poster: imageUrl,
      open: meta.open || null,
    };
    if (meta.ids) out.meta.ids = meta.ids;
    if (meta.tmdbMediaType) out.meta.tmdbMediaType = meta.tmdbMediaType;
    if (meta.background) out.meta.background = meta.background;
    if (meta.description) out.meta.description = meta.description;
    if (meta.releaseInfo) out.meta.releaseInfo = meta.releaseInfo;
    if (meta.rating != null) out.meta.rating = meta.rating;
    if (meta.genres) out.meta.genres = meta.genres;
    if (meta.badge) out.meta.badge = meta.badge;
    if (meta.logo) out.meta.logo = meta.logo;
  }
  return out;
}

function hubPaintHero(item, opts) {
  opts = opts || {};
  var out = hubPaintPoster(item, opts);
  var meta = item || {};
  var props = out.paint.props;
  props.backdropUrl = String(
    meta.background || meta.backdrop || opts.backdropUrl || props.imageUrl || '',
  );
  props.posterUrl = String(meta.poster || props.imageUrl || '');
  props.logoUrl = String(meta.logo || opts.logoUrl || '');
  props.overview = String(
    meta.description || meta.overview || opts.overview || '',
  );
  if (meta.releaseInfo) props.year = String(meta.releaseInfo).slice(0, 4);
  return out;
}

/// Paint-ready event card — pack shapes all display fields.
function hubPaintEvent(item, opts) {
  opts = opts || {};
  var meta = item || {};
  var props = Object.assign(
    {
      title: String(meta.name || meta.title || opts.title || ''),
      posterUrl: String(meta.poster || meta.posterUrl || opts.posterUrl || ''),
    },
    opts.props || {},
  );
  var keys = [
    'homeTeam',
    'awayTeam',
    'homeBadgeUrl',
    'awayBadgeUrl',
    'categoryLabel',
    'scheduleLabel',
    'timeLabel',
    'viewers',
    'live',
    'width',
    'height',
  ];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (opts[k] != null) props[k] = opts[k];
    else if (meta[k] != null) props[k] = meta[k];
  }
  var out = Object.assign({}, meta);
  out.paint = { type: 'eventCard', props: props };
  if (meta.open) out.open = meta.open;
  return out;
}

/// Attach opaque load so host runs pack action blindly (no feed/rail branches).
function hubWithLoad(node, action, params) {
  var out = Object.assign({}, node || {});
  out.load = {
    action: String(action || ''),
    params: params && typeof params === 'object' ? params : {},
  };
  return out;
}

function hubClampList(list, limit) {
  if (!Array.isArray(list)) return [];
  var n = Number(limit);
  if (!(n > 0) || n >= list.length) return list.slice();
  return list.slice(0, n);
}

function hubFilterLeaves(filter, field) {
  if (!filter || typeof filter !== 'object') return [];
  var op = String(filter.op || '');
  if (op === 'and' || op === 'or') {
    var out = [];
    var nodes = filter.nodes || [];
    for (var i = 0; i < nodes.length; i++) {
      out = out.concat(hubFilterLeaves(nodes[i], field));
    }
    return out;
  }
  if (String(filter.field || '') !== String(field || '')) return [];
  return [filter];
}

function hubFilterValues(filter, field) {
  var leaves = hubFilterLeaves(filter, field);
  var out = [];
  for (var i = 0; i < leaves.length; i++) {
    var leaf = leaves[i];
    var op = String(leaf.op || '');
    if (op === 'in' && Array.isArray(leaf.value)) {
      for (var j = 0; j < leaf.value.length; j++) {
        var v = leaf.value[j];
        if (v != null && String(v).trim()) out.push(String(v).trim());
      }
    } else if (leaf.value != null && String(leaf.value).trim()) {
      out.push(String(leaf.value).trim());
    }
  }
  return out;
}

function hubFilterValue(filter, field) {
  var values = hubFilterValues(filter, field);
  return values.length ? values[0] : '';
}

function hubStripHtml(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hubNormalizeTitle(raw) {
  var t = String(raw || '').trim();
  if (!t) return t;
  t = t.replace(/[\(\[]\s*\d{4}\s*[\)\]]\s*$/g, '').trim();
  t = t.replace(
    /\b(HD|FHD|UHD|4K|1080p|720p|WEB-?DL|BluRay)\b/gi,
    ' ',
  );
  var pipe = t.indexOf('|');
  if (pipe > 0) t = t.substring(0, pipe);
  return t.replace(/\s+/g, ' ').trim();
}

function hubNormalizeAnimeTitle(raw) {
  var t = hubNormalizeTitle(raw);
  if (!t) return t;
  return t
    .replace(/\s+(?:season|part|cour)\s*\d+\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- layout helpers (no TMDB enrich) ---
function kitStack(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'kit.stack', id: id, children: children || [] },
    o,
  );
}

function kitMenu(id, items, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.menu', id: id, items: items || [] }, o);
}

function kitTabs(id, tabs, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.tabs', id: id, tabs: tabs || [] }, o);
}

function kitList(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.list', id: id }, o);
}

function kitRow(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.row', id: id }, o);
}

function kitTopBar(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.topBar', id: id }, o);
}

function kitCategoryBar(id, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign({ type: 'kit.categoryBar', id: id }, o);
}

/** Generic node — any foundation type string + props/children. */
function kitNode(type, id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  var node = Object.assign({ type: String(type || '').trim(), id: id }, o);
  if (children && children.length) node.children = children;
  return node;
}

/** Prepared page: top chrome + side rail + body (optional shortcut). */
function kitColumnsHeader(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'columnsHeader', id: id, children: children || [] },
    o,
  );
}

/** Prepared page: top + kind strip + expand grid (optional shortcut). */
function kitTopBody(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'topBody', id: id, children: children || [] },
    o,
  );
}

/** Prepared page: menu? + tabs + cards (optional shortcut). */
function kitTabsCards(id, opts, children) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { type: 'tabsCards', id: id, children: children || [] },
    o,
  );
}

// Pack `filters` action — details hero play row (`play[]` in filters payload).
function playFilterGrouped(field, options, opts) {
  var o = opts && typeof opts === 'object' ? opts : {};
  return Object.assign(
    { field: field, style: 'grouped', options: options || [] },
    o,
  );
}

