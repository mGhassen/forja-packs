// CineJoy / api.shegu.st scrypt PoW — pack-owned protocol; host only provides ctx.crypto.scrypt.

function cinejoyLeadingZeroBitsHex(hex) {
  var h = String(hex || '').replace(/[^0-9a-fA-F]/g, '');
  if (h.length % 2) h = '0' + h;
  var count = 0;
  for (var i = 0; i < h.length; i += 2) {
    var value = parseInt(h.substring(i, i + 2), 16);
    if (value === 0) {
      count += 8;
      continue;
    }
    var bits = 0;
    var v = value;
    while (v > 0) {
      bits++;
      v >>= 1;
    }
    count += 8 - bits;
    break;
  }
  return count;
}

/** @returns {string} base64 x-at token, or '' */
function cinejoySolveScryptPow(crypto, challenge) {
  if (!challenge || typeof challenge !== 'object' || !crypto) return '';
  if (typeof crypto.scrypt !== 'function' || typeof crypto.SHA256 !== 'function') {
    return '';
  }
  var s = String(challenge.s || '');
  var b = String(challenge.b || '');
  var n = challenge.n | 0;
  var r = challenge.r | 0;
  var p = challenge.p | 0;
  var d = challenge.d | 0;
  if (!s || !b || n <= 0 || r <= 0 || p <= 0 || d <= 0) return '';
  if ((n & (n - 1)) !== 0) return '';
  var max = challenge.max == null ? 500000 : challenge.max | 0;
  if (max < 1) max = 1;
  if (max > 500000) max = 500000;

  var saltHex = crypto.enc.Hex.stringify(crypto.SHA256('pow2-salt|' + s + '|' + b));
  if (!saltHex) return '';

  for (var counter = 0; counter < max; counter++) {
    var outHex = crypto.scrypt('pow2|' + b + '|' + s + '|' + counter, saltHex, {
      n: n,
      r: r,
      p: p,
      dkLen: 32,
      saltHex: true,
    });
    if (!outHex) return '';
    if (cinejoyLeadingZeroBitsHex(outHex) >= d) {
      var payload = {};
      for (var k in challenge) {
        if (Object.prototype.hasOwnProperty.call(challenge, k)) payload[k] = challenge[k];
      }
      payload.c = counter;
      var raw = JSON.stringify(payload);
      if (typeof btoa === 'function') return btoa(raw);
      // Fallback if host forgot btoa polyfill
      if (crypto.enc && crypto.enc.Base64 && crypto.enc.Utf8) {
        return crypto.enc.Base64.stringify(crypto.enc.Utf8.parse(raw));
      }
      return '';
    }
  }
  return '';
}
