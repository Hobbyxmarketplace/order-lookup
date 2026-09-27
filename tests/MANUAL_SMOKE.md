# Manual Smoke Checklist

Run through after every deploy and before any release. Automated tests cover
the API surface; this covers the browser experience.

## Setup

1. `npm run build && npm start` (or use existing droplet URL)
2. Open the site in Chrome incognito
3. Have a second browser (Safari) open in parallel for cross-browser verify

## Test accounts to have ready

- `admin` / `admin123` (bootstrap admin, from `.env`)
- `staff1` / `staffpass` (created via CLI locally). If you don't have one:
  `npm run users -- add --username staff1 --password 'staffpass' --role staff`

## Auth flow

- [ ] Login page renders, "Welcome" heading, single-input focus on username
- [ ] Enter wrong password → red error banner "Invalid credentials"
- [ ] Enter admin creds → land on `/` (Lookup page)
- [ ] Header shows: `Signed in as admin` with orange `ADMIN` badge
- [ ] Header nav shows `Lookup`, `Bulk move`, `Zones` (admin) — 3 items
- [ ] Click `Sign out` → back on `/login`
- [ ] Log in as staff → `STAFF` blue badge, nav shows only `Lookup` + `Bulk move`
- [ ] `/zones` URL manually → redirect to `/` (staff can't reach zones page)

## Session expiry (client-side)

- [ ] Log in, open DevTools > Application > Cookies, delete `dblookup_token`
- [ ] Click Submit on a lookup → error briefly shown, then bounce to `/login`
- [ ] Log back in — reset done cleanly

## Lookup page

Test invoices (from earlier compaction):
- `H136260` → Picked Up
- `H136582` → Ready for Pickup
- `H140017` → Ready for Pickup
- `H999999XX` → 404 Not Found

- [ ] Enter `H136260`, Submit → order card shows Picked Up, all 4 dates on stepper,
      customer chips (Name / Email / Phone), NO zone chip, NO "Move" button
- [ ] Enter `H136582` → Ready for Pickup, `Zone A` chip visible next to
      submission#, "Move to another zone" button below stepper
- [ ] Click "Move to another zone" → modal opens, `Zone A` pre-selected
- [ ] Cancel — no move
- [ ] Move again → click Move → modal closes, chip does NOT update because
      only one zone exists (button was disabled). Verify Move button was disabled.
- [ ] Enter garbage `XYZZY` → 404 error banner
- [ ] Enter empty → button disabled
- [ ] Enter 65-character string → 400 "Invoice too long"

## Zones admin page

- [ ] `/zones` opens, "Zone A" listed with ★ (default), 0 invoices, Rename button
- [ ] Add "Zone B" → 201 → appears in table, is_default=blank, invoice_count=0
- [ ] Rename "Zone B" to "Back shelf" → row updates
- [ ] Add "back shelf" (case-insensitive) → 409 error banner
- [ ] "Make default" on Back shelf → ★ moves from Zone A to Back shelf
- [ ] "Make default" on Zone A → ★ moves back
- [ ] Click Delete on Back shelf → modal: "Move existing invoices to [Zone A]"
- [ ] Confirm → row disappears, Zone A count increments
- [ ] Recreate "Back shelf" → succeeds
- [ ] Delete on Zone A (default) → button not visible (can't delete default)

## Move-to-zone from Lookup

- [ ] Create "Zone B" via /zones
- [ ] Lookup H136582 → shows Zone A chip
- [ ] Click Move → dropdown lists Zone A + Zone B, Move enabled once Zone B selected
- [ ] Click Move → modal closes, chip flips to `Zone B` immediately
- [ ] Re-lookup H136582 → still Zone B (persistent)
- [ ] Move back to Zone A → chip flips back

## Bulk move page

- [ ] `/bulk-move` loads, table populated with Ready-for-Pickup rows
- [ ] Search "H1365" → filters to matching invoices
- [ ] Clear → back to all
- [ ] Tick header checkbox → all rows on page selected
- [ ] "N selected" sticky footer appears at bottom
- [ ] Change target zone dropdown
- [ ] Click "Move selected" → success message, selection clears, zones update in table
- [ ] Pagination: click Next / Previous — offsets change
- [ ] "Clear selection" empties the ticked set

## Cross-role: staff bulk move

- [ ] Log in as staff → `/bulk-move` accessible → can move invoices
- [ ] Attempt POST /api/zones via DevTools console — 403 (already covered by tests, verify UX doesn't break)

## Responsive

- [ ] Resize to iPhone width (~ 375px): Lookup page single-column, cards stack,
      nav wraps
- [ ] Bulk-move table scrolls horizontally, sticky action bar still visible
- [ ] Modal still centered and readable

## Session persistence

- [ ] Log in, close tab, reopen — still logged in (cookie valid 8h)
- [ ] Wait for session refresh to happen: after ~4h of use, a lookup should
      silently issue a new cookie. Hard to test manually — trust the unit test
      (`maybeRefreshCookie` at "below halfway mark").

## Errors and edge cases

- [ ] Turn off wifi, submit a lookup → red banner "Failed to fetch" or similar
- [ ] Restart nginx / kill the app while page is open → next click shows error
      banner, does NOT crash the SPA
- [ ] Hit `/api/health` in a browser tab → `{"ok":true,"db":true}`

## Regression signal (must-pass)

Any of these failing = blocker for deploy:
- Staff can reach `/zones` page
- Wrong password logs in
- Zone chip appears for non-Ready-for-Pickup status
- Move button appears for non-Ready-for-Pickup status
- Deleting a zone with invoices doesn't migrate them
- Duplicate zone name accepted
