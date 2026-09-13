#!/usr/bin/env bash
# Inject hubs/_shared/details_paint.js into every hub `_kit.js`.
# Edit details_paint.js, then run this. Do not hand-edit stamp blocks in kits.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/_shared/details_paint.js"

if [[ ! -f "$SRC" ]]; then
  echo "missing $SRC" >&2
  exit 1
fi

python3 - "$ROOT" "$SRC" <<'PY'
import pathlib, re, sys

root = pathlib.Path(sys.argv[1])
src = pathlib.Path(sys.argv[2])
begin = "// === BEGIN hubs/_shared/details_paint.js ==="
end = "// === END hubs/_shared/details_paint.js ==="
body = src.read_text().rstrip() + "\n"
block = f"{begin}\n{body}{end}"

marker_re = re.compile(
    re.escape(begin) + r".*?" + re.escape(end),
    re.DOTALL,
)
legacy_re = re.compile(
    r"\nfunction hubParseIsoDate\(raw\) \{.*?\nfunction hubStampDetailsPaint\(meta\) \{.*?\n\}\n",
    re.DOTALL,
)

updated = 0
for kit in sorted(root.glob("*/_kit.js")):
    if kit.parent.name == "_shared":
        continue
    text = kit.read_text()
    if marker_re.search(text):
        new = marker_re.sub(lambda _m: block, text, count=1)
    elif legacy_re.search(text):
        new = legacy_re.sub(lambda _m: "\n" + block + "\n", text, count=1)
    else:
        print(f"skip (no stamp region): {kit}", file=sys.stderr)
        continue
    if new != text:
        kit.write_text(new)
        print(f"synced {kit.relative_to(root.parent)}")
        updated += 1
    else:
        print(f"ok {kit.relative_to(root.parent)}")
print(f"done ({updated} written)")
PY
