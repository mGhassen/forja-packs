# Hub shared JS

| File | Role |
|------|------|
| `details_paint.js` | `hubStampDetailsPaint` + date helpers — source of truth |
| `sync_details_paint.sh` | Injects that file into every hub `_kit.js` between markers |

Edit `details_paint.js`, then run `./sync_details_paint.sh`. Do not hand-edit the stamped region inside kits.
