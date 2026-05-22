# Changelog — Altheastix eBay Order Manager

## v3.61
- Canned message modal ("Late + Gift", "Late, no gift", "Preorder
  Sticker") now shows a live preview pane that re-renders the fully
  interpolated message on every keystroke, so the blurb can be checked
  before jumping to the messages page.
- Buyer first names that arrive ALL CAPS (e.g. "GEORGE") are now
  title-cased ("George") in canned messages via a new humanizeName()
  helper, so the greeting reads as if hand-written. Names that already
  contain a lowercase letter are left untouched.
- Updated USER_CONFIG.defaultTrackingNumber to the current USPS
  tracking number.

## v3.60
- Tightened address banner label: "⚠ Address issue on 1 order:" /
  "⚠ Address issues on N orders:" — drops the hedging "potentially wrong"
  and replaces the trailing dash with a colon.

## v3.59
- Configuration panel is now collapsible. The header row is clickable and
  shows a ▸/▾ chevron. Collapsed state is persisted in localStorage
  (key `configPanelCollapsed`) and defaults to collapsed on first load.
  Toggling calls `updateSkuPanelPosition()` so panel geometry stays correct.

## v3.58
- Moved the scroll-to-top button from the top-right corner to the
  bottom-right of the orders column. Its `left` is now computed in
  `updateSkuPanelPosition` from the orders container's right edge
  (same geometry as the SKU panel), so it tracks the column on resize.

## v3.57
- Address warning banner: added an × dismiss button (right-aligned, same
  amber palette) that hides the banner for the session. Dismissal is
  tracked with a closure flag so `refreshAddressBanner()` does not
  re-show it on subsequent calls.
- Added a floating scroll-to-top button (↑) anchored to the top-right
  corner of the viewport. It fades in after scrolling 200 px down and
  fades out when back at the top, using an opacity transition wired into
  the existing `updateSkuPanelOnScroll` handler.

## v3.56
- Added a thin address-warning banner that appears directly below the
  `.orders-filters` header whenever one or more orders have a flagged
  address (i.e. already carry the ⚠ badge from the existing
  `validateAddress()` check). The banner shows a count summary and one
  jump-link per affected order (buyer name as label) that smooth-scrolls
  directly to that card. Banner is hidden entirely when no issues exist.

## v3.55
- Separated the Configuration panel from the SKUs to Pack panel. It is now
  a fully independent floating box (`#altheastix-config-container`) appended
  to `document.body`, positioned below the SKU panel with a 12px gap. Its
  left edge and scroll-driven vertical position are kept in sync via
  `updateSkuPanelPosition` and `updateSkuPanelOnScroll`, and it carries the
  same `transition: top 0.3s ease-in-out` so it glides with the SKU panel
  when the page header scrolls out of view.

## v3.54
- Removed six stray `// autopush test ...` comments at the end of
  `userscript.js` left over from earlier launchd debugging. No behavior change.

## v3.53
- Fixed address Edit button pulling the validation badge character (⚠ / ✔) into
  the recipient name. The badge is now detached before reading the address
  lines into the edit inputs, then re-attached to the name line on Save.
  Cancel restores the original HTML (badge included). Editing the address no
  longer mutates or strips the status icon.

## v3.51
- Moved changelog out of `userscript.js` into this file (`src/CHANGELOG.md`).
  No functional changes.

## v3.50
- Reorganized project folder: source files moved to `src/`, autopush tooling
  to `autopush/`, and reference HTML to `reference/`. No functional changes.

## v3.49
- Test commit to verify Cowork auto-push is working end-to-end.

## v3.48
- Moved external config from GitHub Gist to the repo as `altheastix-ebay-config.js`.
  Updated `@require` URL to point to GitHub raw URL instead of Gist.
- Fixed hardcoded $15 fallback in tracking note logic — now correctly uses $20
  (consistent with `trackingOrderAmountThreshold` in `USER_CONFIG`).

## v3.47
- `showMicaImage` flag is now `false` by default in `USER_CONFIG`.

## v3.46
- Second test commit to verify launchd autopush is working end-to-end.

## v3.45
- Test commit to verify GitHub auto-sync is working.

## v3.44
- Raised `trackingOrderAmountThreshold` from $15 to $20. The buyer message
  "orders at or under $X ship without tracking" and all related UI/logic
  now use the new value.

## v3.43
- PO Box addresses are now accepted as valid in address validation. Rule 3
  (street line must start with a digit) is skipped when the line matches
  a PO Box pattern (e.g. "PO Box 1931", "P.O. Box 42").

## v3.42
- Fixed envelope line breaks broken by v3.41. Cloning a detached node breaks
  `innerText` (no CSS = no `<br>` → newline conversion). Now temporarily hides
  the badges on the live element, reads `innerText` normally, then restores them.

## v3.40
- Extended address validation to Canadian orders. `validateAddress()` now detects
  "Canada" in the address lines and applies CA-specific rules: postal code format
  (A1A 1A1), and province/territory code validation against all 13 CA codes
  (AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT).
- Removed the `isCanadian` exclusion guard in `processOrderCard` — Canadian orders
  now go through the same badge injection path as US orders.

## v3.39
- Added address validation rule: any line after the buyer name that consists
  entirely of digits is flagged as a likely duplicate street number (e.g. eBay
  splitting "416577" onto its own line before "416577 flying bridge").

## v3.38
- Fixed address badge placement for real: eBay injects a `<br>` inside the
  `.print__address__fullname` span, so `appendChild` was landing after the line
  break. Badge is now inserted before that `<br>` so it sits inline with the name.

## v3.37
- Fixed address badge placement: `.print__address__fullname` is a sibling of `.en-US`,
  not a descendant, so `addrEl.querySelector()` always returned null. Scoped the
  lookup to `orderItem.querySelector()` — consistent with every other use in the
  script — so the badge now correctly appends inside the name element.

## v3.36
- Moved address validation badges inline, immediately to the right of the recipient
  name, instead of appearing as a separate line below the address block.
- Badges are now just the symbol (✔ or ⚠) with no label text; the tooltip carries
  the message. OK tooltip updated to "Address looks correct".

## v3.35
- Added ✔ badge for orders that pass all address validation rules.
  Hovering shows "Address looks correct". Styled in green, consistent with the
  ⚠ warning badge layout.

## v3.34
- Added address integrity validation for domestic (US) orders. After each order
  card is processed, the shipping address is linted against a set of structural
  rules: minimum line count, buyer name presence, street starting with a house
  number, presence of a valid "City ST XXXXX" line (comma-less, matching eBay's
  format), and recognized US state/territory abbreviation.
  International addresses (Canada, UK, etc.) are skipped.
- When one or more issues are found, a ⚠ "Address issue" badge is injected
  between the address text and the Edit/Copy buttons. Hovering the badge shows
  a tooltip listing every issue found, styled to match dark/light mode.
- Validation lives in a standalone `validateAddress(lines)` pure function placed
  near `parseAddressBlock` for discoverability.

## v3.33
- Toned down multi-qty pill color: replaced bright orange with a muted warm amber.
  Removed bold font-weight, reduced border from 2px to 1px, softened background
  and text/border colors. Still warm enough to signal "pack multiple units" without
  competing visually with Manila/LG pills.

## v3.32
- Multi-quantity pills (e.g. "B01 x2") now render with an amber/orange color
  scheme: warm dark background + orange border + orange text in dark mode;
  warm cream background + amber border + dark amber text in light mode.
  This uses the same orange accent already applied to "Qty: 2" badges on order
  cards, so the visual language is consistent. The style stacks cleanly with
  multi-item-order colored pills (which use inline `backgroundColor`).
- Manila pills take priority over multi-qty styling: a SKU that is both Manila
  and qty>1 shows Manila styling only (different envelope = more important).

## v3.31
- Fixed disappearing pills for single-SKU multi-quantity orders (e.g. B01 x2).
  `isMultiItemOrder` was incorrectly set to `true` when `totalQty > 1`, causing
  colored-pill styling in dark mode (black text on dark bg = invisible).
  `isMultiItemOrder` now only triggers when an order has multiple DISTINCT SKUs,
  which is its original intent.

## v3.30
- Fixed quantity parsing: eBay uses "Qty: 2" (not "Quantity: 2") in the item
  details list. All three places that parse quantity now accept both "Quantity:"
  and "Qty:" (case-insensitive), so "B01 x 2" pills now render correctly.
  The v3.29 SKU+Design consolidation within an order is also retained.

## v3.29
- Fixed SKU pills for multi-quantity items: when the same SKU appears multiple
  times within one order (e.g. eBay renders qty 2 as two separate line items),
  the pills now consolidate by SKU+Design per order and show "B01 x 2" instead
  of two separate "B01" pills. Cross-order duplicates remain as separate pills.

## v3.28
- Fixed light-mode quantity badge contrast: #FFA500 (ratio 1.97) → #B45309 (ratio 5.02).
  Dark mode keeps #FFA500 (ratio 7.27, unchanged).

## v3.27
- Added "Custom Envelope" feature: a modal (accessible via link in the SKU panel)
  that auto-parses a pasted address block into editable fields and prints a single
  ad-hoc #10 envelope. Useful for re-sending orders not in the active ship queue.
- Added subtle horizontal dividers between letter groups in the SKU pills list.
- Expanded multi-item order pill color palette from 11 to 40 distinct colors,
  interleaved across hues to minimize repetition at high order volumes.
- Canadian envelopes now include a faint 🇨🇦 + "Int'l Stamp" reminder in the
  top-right corner, sized to be fully covered by an international stamp.
- Added `showMicaImage` flag to `USER_CONFIG` to toggle the Mica image on/off.

## v3.26
- Added live SKU/buyer/item filter input to the SKU panel that filters both
  the SKU list and order cards in real-time. Filter text persists across re-renders.
- Consolidated "Print All Envelopes" into a single print window with proper
  page breaks (one envelope per page). Removed N separate print dialogs.
- Fixed item image sizing: increased container to 130px with CSS `!important` overrides.
- Fixed price extraction to match both "Item price:" and "Sold for:" labels.
- Fixed print envelope layout for Envelope #10 format (9.5in × 4.125in) with
  6% content scaling to prevent blank pages.
