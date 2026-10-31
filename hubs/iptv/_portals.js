// IPTV portals — vault inventory + scrape / share via engine.request.
// Vault keys: iptv.portals / iptv.active (same as host IptvVaultKeys).

async function iptvLoadPortals(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return [];
  try {
    var raw = await vault.get(IPTV_VAULT_PORTALS);
    if (!raw) return [];
    var parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function iptvSavePortals(ctx, portals) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    await vault.set(IPTV_VAULT_PORTALS, JSON.stringify(portals || []));
    return true;
  } catch (e) {
    return false;
  }
}

async function iptvGetActiveKey(ctx) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.get !== 'function') return '';
  try {
    var k = await vault.get(IPTV_VAULT_ACTIVE);
    return k ? String(k) : '';
  } catch (e) {
    return '';
  }
}

async function iptvSetActiveKey(ctx, key) {
  var vault = iptvVault(ctx);
  if (!vault || typeof vault.set !== 'function') return false;
  try {
    if (!key) {
      if (typeof vault.remove === 'function') await vault.remove(IPTV_VAULT_ACTIVE);
      else await vault.set(IPTV_VAULT_ACTIVE, '');
    } else {
      await vault.set(IPTV_VAULT_ACTIVE, String(key));
    }
    return true;
  } catch (e) {
    return false;
  }
}

function iptvPortalDisplayName(portal) {
  var label = String((portal && portal.label) || '').trim();
  var name = String((portal && portal.name) || '').trim();
  var username = String((portal && portal.username) || '').trim();
  var key = portal ? iptvPortalKey(portal) : '';
  var keyLc = String(key || '').toLowerCase();
  if (label && label.toLowerCase() !== keyLc) return label;
  if (name && name.toLowerCase() !== keyLc) return name;
  if (username) return username;
  return 'Portal';
}

function iptvPortalPublic(portal) {
  if (!portal) return null;
  var out = {
    key: iptvPortalKey(portal),
    label: iptvPortalDisplayName(portal),
    url: String(portal.url || '').trim(),
    username: String(portal.username || '').trim(),
    platform: iptvPlatformOf(portal),
    activeConnections: portal.activeConnections,
    maxConnections: portal.maxConnections,
    expiry: portal.expiry,
  };
  var addedAt = String((portal && portal.addedAt) || '').trim();
  if (addedAt) out.addedAt = addedAt;
  return out;
}

function iptvPortalFromParams(p) {
  var params = p || {};
  var platform = iptvPlatformOf({
    platform: params.platform || params.type || 'xtream',
  });
  var url = iptvNormBase(params.url || params.portalUrl || '');
  if (!url && params.url) url = String(params.url).trim();
  var username = String(
    params.username || params.portalUsername || params.mac || '',
  ).trim();
  var password = String(
    params.password || params.portalPassword || params.serial || '',
  ).trim();
  var label = String(params.label || params.portalLabel || params.name || '').trim();
  var userAgent = String(params.userAgent || params.user_agent || '').trim();
  var portal = {
    url: url,
    username: username,
    password: password,
    label: label,
    platform: platform,
  };
  if (userAgent) portal.userAgent = userAgent;
  portal.key = iptvPortalKey(portal);
  return portal;
}

function iptvPortalValidate(portal, cfg) {
  var platform = iptvPlatformOf(portal);
  if (!portal.url) return hubText(cfg, 'url required');
  if (platform === 'm3u') return '';
  if (platform === 'stalker') {
    if (!portal.username) return hubText(cfg, 'MAC (username) required');
    return '';
  }
  if (!portal.username || !portal.password) {
    return hubText(cfg, 'url, username, password required');
  }
  return '';
}

async function iptvUpsertPortalRow(ctx, portal, opts) {
  var o = opts || {};
  var portals = await iptvLoadPortals(ctx);
  var key = iptvPortalKey(portal);
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      var prev = portals[i] || {};
      portals[i] = Object.assign({}, prev, portal, {
        key: key,
        addedAt: prev.addedAt || portal.addedAt || new Date().toISOString(),
      });
      found = true;
      break;
    }
  }
  if (!found) {
    // Newest insert first — host also sorts by addedAt desc.
    portals.unshift(
      Object.assign({}, portal, {
        key: key,
        addedAt: portal.addedAt || new Date().toISOString(),
      }),
    );
  }
  await iptvSavePortals(ctx, portals);
  if (o.select !== false) await iptvSetActiveKey(ctx, key);
  return portals;
}

async function iptvUpsertFromSettings(ctx) {
  var cfg = hubConfig(ctx, {});
  var url = iptvNormBase(cfg.portalUrl || cfg.portal_url || '');
  var username = String(cfg.portalUsername || cfg.portal_username || '').trim();
  var password = String(cfg.portalPassword || cfg.portal_password || '').trim();
  var label = String(cfg.portalLabel || cfg.portal_label || '').trim();
  var platform = iptvPlatformOf({
    platform: cfg.platform || cfg.portalPlatform || 'xtream',
  });
  if (!url) return null;
  if (platform === 'xtream' && (!username || !password)) return null;
  if (platform === 'stalker' && !username) return null;

  var portal = {
    url: url,
    username: username,
    password: password,
    label: label,
    platform: platform,
  };
  portal.key = iptvPortalKey(portal);
  // Inventory only — never steal / bootstrap active on feed/list.
  await iptvUpsertPortalRow(ctx, portal, { select: false });
  return portal;
}

async function iptvResolveActive(ctx) {
  await iptvUpsertFromSettings(ctx);
  var portals = await iptvLoadPortals(ctx);
  if (!portals.length) return null;

  var active = await iptvGetActiveKey(ctx);
  if (!active) return null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), active)) {
      return portals[i];
    }
  }
  return null;
}

function iptvPortalFormFields(cfg, opts) {
  var o = opts || {};
  var editing = !!o.editing;
  return [
    { id: 'url', label: 'URL', type: 'text', required: !editing },
    { id: 'username', label: hubText(cfg, 'Username / MAC'), type: 'text' },
    {
      id: 'password',
      label: editing
        ? hubText(cfg, 'Password (blank = keep)')
        : hubText(cfg, 'Password'),
      type: 'password',
      required: !editing,
    },
    { id: 'label', label: hubText(cfg, 'Label'), type: 'text' },
  ];
}

function iptvPortalAddForm(cfg) {
  return {
    title: hubText(cfg, 'Add portal'),
    submitLabel: hubText(cfg, 'Add'),
    cancelLabel: hubText(cfg, 'Cancel'),
    action: 'addPortal',
    toastOk: hubText(cfg, 'Portal added'),
    description: hubText(cfg, 'Portal URL and credentials.'),
    fields: iptvPortalFormFields(cfg, { editing: false }),
  };
}

function iptvPortalEditForm(cfg) {
  return {
    title: hubText(cfg, 'Edit portal'),
    submitLabel: hubText(cfg, 'Save'),
    cancelLabel: hubText(cfg, 'Cancel'),
    action: 'editPortal',
    toastOk: hubText(cfg, 'Portal updated'),
    fields: iptvPortalFormFields(cfg, { editing: true }),
  };
}

function iptvPortalImportForm(cfg) {
  return {
    title: hubText(cfg, 'Import portal'),
    submitLabel: hubText(cfg, 'Import'),
    cancelLabel: hubText(cfg, 'Cancel'),
    action: 'importPortal',
    toastOk: hubText(cfg, 'Portal imported'),
    description: hubText(
      cfg,
      'Paste an 8-character share code (XXXX-XXXX) or F1. token.',
    ),
    fields: [
      {
        id: 'token',
        label: hubText(cfg, 'Share code'),
        type: 'text',
        required: true,
        hint: 'XXXX-XXXX',
      },
      { id: 'label', label: hubText(cfg, 'Label (optional)'), type: 'text' },
    ],
  };
}

function iptvPortalListItem(portal, activeKey) {
  var pub = iptvPortalPublic(portal);
  if (!pub || !pub.key) return null;
  var label = pub.label;
  var storedLabel = String((portal && portal.label) || '').trim();
  if (storedLabel && storedLabel.toLowerCase() === String(pub.key || '').toLowerCase()) {
    storedLabel = '';
  }
  var item = {
    id: pub.key,
    type: 'portal',
    kind: 'portal',
    name: label,
    title: label,
    description: pub.url || '',
    subtitle: pub.url || '',
    badge: pub.platform || '',
    selected: iptvSamePortalKey(pub.key, activeKey),
    portalKey: pub.key,
    platform: pub.platform,
    activeConnections: pub.activeConnections,
    maxConnections: pub.maxConnections,
    expiry: pub.expiry,
    formValues: {
      url: pub.url || '',
      username: pub.username || '',
      label: storedLabel,
    },
    open: {
      surface: 'iptv',
      id: pub.key,
      action: 'selectPortal',
      portalKey: pub.key,
    },
  };
  if (pub.addedAt) item.addedAt = pub.addedAt;
  return item;
}

/** Side-panel layout token — foundation paints portalList from items. */
function iptvPortalsPanelLayout(cfg) {
  return {
    widgets: [
      {
        type: 'portalList',
        id: 'portals',
        source: 'listPortals',
        title: hubText(cfg, 'Portals'),
        width: 380,
        searchPlaceholder: hubText(cfg, 'Search portals…'),
        emptyTitle: hubText(cfg, 'No portals yet'),
        emptyDescription: hubText(
          cfg,
          'Add a portal or import a share code to browse channels.',
        ),
        actions: [
          {
            id: 'scrape',
            label: hubText(cfg, 'Scrape'),
            icon: 'travel_explore',
            action: 'scrape',
          },
          {
            id: 'deal',
            label: hubText(cfg, 'Deal'),
            icon: 'casino',
            action: 'dealPortals',
          },
          {
            id: 'import',
            label: hubText(cfg, 'Import'),
            icon: 'file_download',
            action: 'importPortal',
            form: iptvPortalImportForm(cfg),
          },
          {
            id: 'add',
            label: hubText(cfg, 'Add'),
            icon: 'add',
            action: 'addPortal',
            form: iptvPortalAddForm(cfg),
          },
        ],
        itemActions: {
          edit: {
            label: hubText(cfg, 'Edit'),
            action: 'editPortal',
            form: iptvPortalEditForm(cfg),
          },
          remove: { label: hubText(cfg, 'Delete'), action: 'removePortal' },
          share: { label: hubText(cfg, 'Copy share code'), action: 'shareEncode' },
        },
      },
    ],
  };
}

async function iptvListPortals(ctx) {
  var portals = await iptvLoadPortals(ctx);
  var active = await iptvGetActiveKey(ctx);
  var items = [];
  for (var i = 0; i < portals.length; i++) {
    var item = iptvPortalListItem(portals[i], active);
    if (item) items.push(item);
  }
  return hubOk('listPortals', {
    active: active,
    portals: portals.map(iptvPortalPublic),
    items: items,
    layout: iptvPortalsPanelLayout(hubConfig(ctx, {})),
  });
}

async function iptvAddPortal(ctx, params) {
  var portal = iptvPortalFromParams(params);
  var err = iptvPortalValidate(portal, hubConfig(ctx, {}));
  if (err) return hubFail('addPortal', 'INVALID', err);
  await iptvUpsertPortalRow(ctx, portal, { select: true });
  return hubOk('addPortal', { portal: iptvPortalPublic(portal) });
}

async function iptvImportPortal(ctx, params) {
  var p = params || {};
  var decoded = await iptvShareDecode(ctx, {
    token: p.token || p.code || p.share || p.url || '',
  });
  var env = Array.isArray(decoded) ? decoded[0] : decoded;
  if (!env || !env.ok) {
    return (
      decoded ||
      hubFail('importPortal', 'DECODE_FAILED', 'could not decode share code')
    );
  }
  var data = env.data || {};
  var row = data.portal || {};
  var label = String(p.label || p.portalLabel || '').trim();
  var portal = iptvPortalFromParams({
    url: row.url,
    username: row.username,
    password: row.password,
    platform: row.platform,
    userAgent: row.userAgent || row.user_agent,
    label: label,
  });
  var err = iptvPortalValidate(portal, hubConfig(ctx, {}));
  if (err) return hubFail('importPortal', 'INVALID', err);
  await iptvUpsertPortalRow(ctx, portal, { select: true });
  return hubOk('importPortal', { portal: iptvPortalPublic(portal) });
}

async function iptvEditPortal(ctx, params) {
  var p = params || {};
  var key = String(p.key || p.portalKey || '').trim();
  if (!key) return hubFail('editPortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var idx = -1;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return hubFail('editPortal', 'NOT_FOUND', 'portal not found');

  var cur = portals[idx];
  var next = iptvPortalFromParams(
    Object.assign({}, cur, p, {
      url: p.url != null ? p.url : cur.url,
      username: p.username != null ? p.username : cur.username,
      password: p.password != null ? p.password : cur.password,
      label: p.label != null ? p.label : cur.label,
      platform: p.platform != null ? p.platform : cur.platform,
    }),
  );
  var err = iptvPortalValidate(next, hubConfig(ctx, {}));
  if (err) return hubFail('editPortal', 'INVALID', err);

  // Preserve key identity when url/user change: replace old row.
  portals.splice(idx, 1);
  var replaced = false;
  for (var j = 0; j < portals.length; j++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[j]), next.key)) {
      portals[j] = next;
      replaced = true;
      break;
    }
  }
  if (!replaced) portals.push(next);
  await iptvSavePortals(ctx, portals);
  var active = await iptvGetActiveKey(ctx);
  if (iptvSamePortalKey(active, key)) await iptvSetActiveKey(ctx, next.key);
  return hubOk('editPortal', { portal: iptvPortalPublic(next) });
}

async function iptvRemovePortal(ctx, params) {
  var key = String((params && (params.key || params.portalKey)) || '').trim();
  if (!key) return hubFail('removePortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var next = [];
  var found = false;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      found = true;
      continue;
    }
    next.push(portals[i]);
  }
  if (!found) return hubFail('removePortal', 'NOT_FOUND', 'portal not found');
  await iptvSavePortals(ctx, next);
  var active = await iptvGetActiveKey(ctx);
  if (iptvSamePortalKey(active, key)) {
    await iptvSetActiveKey(ctx, '');
  }
  return hubOk('removePortal', { key: key, remaining: next.length });
}

async function iptvSelectPortal(ctx, params) {
  var key = String((params && (params.key || params.portalKey)) || '').trim();
  if (!key) return hubFail('selectPortal', 'INVALID', 'key required');
  var portals = await iptvLoadPortals(ctx);
  var hit = null;
  for (var i = 0; i < portals.length; i++) {
    if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
      hit = portals[i];
      break;
    }
  }
  if (!hit) return hubFail('selectPortal', 'NOT_FOUND', 'portal not found');
  var canon = iptvPortalKey(hit);
  await iptvSetActiveKey(ctx, canon);
  return hubOk('selectPortal', { key: canon });
}

async function iptvScrapePortals(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail('scrape', 'ENGINE_REQUIRED', 'ctx.host.engine.request required');
  }
  var p = params || {};
  var request = p.request || {
    action: p.scrapeAction || 'scrape_page',
    after: p.after || null,
    max_results: p.maxResults || p.max_results || 40,
    text: p.text,
    source: p.source,
  };
  try {
    var res = await engine('iptv', { action: 'scrape', request: request });
    if (!res || res.error || res.ok === false) {
      return hubFail(
        'scrape',
        'SCRAPE_FAILED',
        String((res && (res.error || res.message)) || 'scrape failed'),
        true,
      );
    }
    return hubOk('scrape', {
      portals: res.portals || [],
      nextAfter: res.next_after || res.nextAfter || null,
    });
  } catch (e) {
    return hubFail('scrape', 'SCRAPE_FAILED', String((e && e.message) || e), true);
  }
}

async function iptvShareEncode(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail(
      'shareEncode',
      'ENGINE_REQUIRED',
      'ctx.host.engine.request required',
    );
  }
  var p = params || {};
  var portal = p.portal || null;
  var key = String(p.key || p.portalKey || '').trim();
  if ((!portal || !portal.url) && key) {
    var portals = await iptvLoadPortals(ctx);
    for (var i = 0; i < portals.length; i++) {
      if (iptvSamePortalKey(iptvPortalKey(portals[i]), key)) {
        portal = portals[i];
        break;
      }
    }
  }
  if (!portal) portal = p;
  try {
    var res = await engine('portal_share', {
      action: 'encode',
      url: String(portal.url || '').trim(),
      username: String(portal.username || '').trim(),
      password: String(portal.password || '').trim(),
      platform: iptvPlatformOf(portal),
      userAgent: String(portal.userAgent || portal.user_agent || '').trim(),
    });
    if (!res || !res.ok || !res.token) {
      return hubFail(
        'shareEncode',
        'ENCODE_FAILED',
        String((res && (res.error || res.message)) || 'encode failed'),
      );
    }
    return hubOk('shareEncode', { token: res.token });
  } catch (e) {
    return hubFail('shareEncode', 'ENCODE_FAILED', String((e && e.message) || e));
  }
}

async function iptvShareDecode(ctx, params) {
  var engine = iptvEngine(ctx);
  if (!engine) {
    return hubFail(
      'shareDecode',
      'ENGINE_REQUIRED',
      'ctx.host.engine.request required',
    );
  }
  var token = String(
    (params && (params.token || params.code || params.share)) || '',
  ).trim();
  if (!token) return hubFail('shareDecode', 'INVALID', 'token required');
  try {
    var res = await engine('portal_share', { action: 'decode', token: token });
    if (!res || res.error || res.ok === false) {
      return hubFail(
        'shareDecode',
        'DECODE_FAILED',
        String((res && (res.error || res.message)) || 'decode failed'),
      );
    }
    return hubOk('shareDecode', {
      portal: {
        url: res.url,
        username: res.username,
        password: res.password,
        platform: res.platform || 'xtream',
        userAgent: res.user_agent || res.userAgent || '',
      },
    });
  } catch (e) {
    return hubFail('shareDecode', 'DECODE_FAILED', String((e && e.message) || e));
  }
}
