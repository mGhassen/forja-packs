// Torrent downloads — Settings rows for the Direct torrent and Downloads pages.
//
// Host bridge: ctx.host.engine.request('torrent', { action }) with
// list / stop / remove / remove_all. stop pauses a swarm and keeps its file
// (next play resumes); remove deletes it. The host paints the rows this
// script returns — copy, icons and actions live here.

var DL_KIT = 1;
var DL_PROTOCOL = 1;

function dlOk(action, data) {
  return [{ ok: true, kit: DL_KIT, protocol: DL_PROTOCOL, action: action, data: data || {} }];
}

function dlFail(action, code, message) {
  return [
    {
      ok: false,
      kit: DL_KIT,
      protocol: DL_PROTOCOL,
      action: action || '',
      error: { code: code || 'UPSTREAM', message: String(message || ''), retryable: false },
    },
  ];
}

function dlAction(ctx) {
  var req = (ctx && ctx.request) || {};
  return String((ctx && ctx.action) || req.action || '');
}

function dlParams(ctx) {
  if (ctx && ctx.params && typeof ctx.params === 'object') return ctx.params;
  var req = (ctx && ctx.request) || {};
  return req.params || {};
}

function dlEngine(ctx) {
  var host = (ctx && ctx.host) || {};
  if (host.engine && typeof host.engine.request === 'function') {
    return host.engine.request.bind(host.engine);
  }
  return null;
}

function dlPeers(n) {
  return n === 1 ? '1 peer' : String(n) + ' peers';
}

function dlSpeed(bytesPerSec) {
  var b = Number(bytesPerSec) || 0;
  if (b <= 0) return '';
  var mb = b / 1024 / 1024;
  if (mb >= 1) return mb.toFixed(1) + ' MB/s';
  return Math.round(b / 1024) + ' KB/s';
}

function dlSubtitle(t) {
  var parts = [];
  var loaded = formatBytes(t.progress_bytes || 0);
  if (Number(t.total_bytes) > 0) {
    parts.push(loaded + ' / ' + formatBytes(t.total_bytes));
  } else {
    parts.push(loaded);
  }
  if (t.stopped) {
    parts.push(t.finished ? 'complete · stopped' : 'stopped');
  } else if (t.finished) {
    parts.push('complete');
  } else if (t.state === 'error') {
    parts.push('error');
  } else if (t.state === 'initializing') {
    parts.push('starting');
  } else {
    parts.push(dlPeers(Number(t.num_peers) || 0));
    var speed = dlSpeed(t.download_rate);
    if (speed) parts.push(speed);
  }
  if (t.active) parts.push('playing now');
  return parts.join(' · ');
}

function dlRow(t) {
  var live = t.live !== false && !t.stopped && t.state !== 'error';
  return {
    id: String(t.info_hash || t.id),
    title: t.name || t.info_hash || 'Torrent',
    subtitle: dlSubtitle(t),
    icon: t.active ? 'play' : live ? 'download' : 'pause',
    tone: t.active ? 'accent' : 'muted',
    action: live
      ? { id: 'stop', label: 'Stop', icon: 'stop' }
      : { id: 'remove', label: 'Delete', icon: 'delete', destructive: true },
  };
}

async function dlList(ctx) {
  var request = dlEngine(ctx);
  if (!request) {
    return dlFail('settingsList', 'ENGINE_REQUIRED', 'Torrent engine bridge unavailable');
  }
  var res = await request('torrent', { action: 'list' });
  if (!res || res.ok !== true) {
    return dlFail('settingsList', 'UPSTREAM', (res && res.message) || 'Could not list torrents');
  }
  var list = Array.isArray(res.torrents) ? res.torrents : [];
  var rows = [];
  for (var i = 0; i < list.length; i++) rows.push(dlRow(list[i]));
  var data = {
    rows: rows,
    empty:
      'No torrents yet. A torrent you play shows here with its progress. ' +
      'Stop keeps the file on disk inside the Disk cache budget so the next ' +
      'play resumes at once; Delete removes it.',
  };
  if (rows.length) {
    data.footer = {
      id: 'all',
      title: 'Delete all torrents',
      subtitle: 'Stops every torrent above and deletes its files.',
      icon: 'delete_all',
      destructive: true,
      action: { id: 'remove_all', label: 'Delete all' },
    };
  }
  return dlOk('settingsList', data);
}

async function dlItemAction(ctx) {
  var request = dlEngine(ctx);
  if (!request) {
    return dlFail('settingsAction', 'ENGINE_REQUIRED', 'Torrent engine bridge unavailable');
  }
  var p = dlParams(ctx);
  var action = String(p.action || '');
  var row = String(p.row || '');
  var body;
  var message;
  if (action === 'stop') {
    body = { action: 'stop', id: row };
    message = 'Stopped — the file stays on disk until you delete it';
  } else if (action === 'remove') {
    body = { action: 'remove', id: row };
    message = 'Torrent deleted';
  } else if (action === 'remove_all') {
    body = { action: 'remove_all' };
    message = 'All torrents deleted';
  } else {
    return dlFail('settingsAction', 'UNSUPPORTED', 'Unsupported action: ' + action);
  }
  var res = await request('torrent', body);
  if (!res || res.ok !== true) {
    return dlFail('settingsAction', 'UPSTREAM', (res && res.message) || 'Could not ' + action);
  }
  if (action === 'remove_all') {
    var n = Number(res.removed) || 0;
    message = n === 1 ? 'Deleted 1 torrent' : 'Deleted ' + n + ' torrents';
  }
  return dlOk('settingsAction', { message: message });
}

async function extract(ctx) {
  var action = dlAction(ctx);
  if (action === 'settingsList') return await dlList(ctx);
  if (action === 'settingsAction') return await dlItemAction(ctx);
  return dlFail(action, 'UNSUPPORTED', 'Unsupported action: ' + action);
}
