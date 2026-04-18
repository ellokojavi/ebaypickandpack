# Altheastix eBay Order Manager — Project Instructions

## What This Project Is

This is a Tampermonkey userscript that transforms eBay's bulk shipping page into a custom pick-and-pack workflow for the Altheastix eBay storefront (stickers and magnets). The main file is `userscript.backup.js` (the active working copy); `offers_manager.js` is a separate stub for future offers management.

The script has two distinct execution contexts, controlled by URL matching:

1. **Bulk shipping / pick-and-pack page** (`gslblui.ebay.com/gslblui/bulk` or `ebay.com/ship/bulk*`) — the main UI overhaul
2. **Automation pages** (`ebay.com/mesh/ord/details`, `ebay.com/om/shipment/update`, `ebay.com/ship/trk/*`, `ebay.com/ship/tr/update`) — background tab automation triggered from the main page

---

## Architecture

### External Config (GitHub Gist)
Loaded via `@require` from `https://gist.githubusercontent.com/ellokojavi/fd370add192a441d770717a41f7d2049/raw/altheastix-ebay-config.js` into `window.AltheastixConfig`. Falls back to empty defaults if the Gist fails. Contains:
- `messageTemplates.thankYouDrafts` — randomized thank-you message templates
- `deliveryNotes` — delivery time copy variants
- `quotes` / `quoteKeywords` — musician quotes matched to item SKU keywords

### Local Config (`USER_CONFIG`)
Hardcoded preferences at the top of the script:
- `returnAddress` — printed on envelopes
- `trackingOrderAmountThreshold` (default: $15) — orders above this get a `+tracking` link
- `useAlternativeTracking` — switches between two tracking automation flows
- `scriptLoadDelay` (default: 15s) — countdown before the script runs (allows eBay's page to hydrate)
- `defaultTrackingNumber` — pre-filled in the tracking tooltip
- `enableDarkModeByDefault`, `enableQuotesInMessages`
- `orderColors` — color palette for multi-item order grouping in the SKU panel
- `headerLinks` — navigation links shown in the customized eBay header

### GM Storage Keys (cross-tab communication)
| Key | Purpose |
|-----|---------|
| `ebay_order_shipped_confirmed` | Automation tab signals main page that shipping was confirmed |
| `ebay_tracking_to_add` | Passes tracking number to v1 tracking tab |
| `ebay_tracking_to_add_v2` | Passes tracking number to v2 tracking tab |
| `ebay_note_to_add` | Passes note text to note-adding tab |
| `ebay_note_confirmed` | Note tab signals main page of success/failure |
| `ebay_auto_send_messages` | Toggle: whether thank-you messages auto-send |
| `ebay_message_to_send` | Passes auto thank-you message to message tab |
| `ebay_manual_message_to_send` | Passes manually composed canned message to message tab |

---

## Main Page Features

### Startup
- A blurred overlay + countdown timer appears while waiting for eBay to hydrate
- A "Run Now" link allows early execution
- `waitForPageReady()` polls for an active "Review purchase" button as the readiness signal

### Layout Overhaul (`initializePageLayout`)
- Injects all custom CSS via `GM_addStyle` / `getRadicalStyles()` (dark/light mode aware)
- Moves the eBay logo, removes the header h1, renames the browser tab to "Altheastix: Pick-and-Pack"
- Removes unwanted notices, Remove/Combine buttons
- Auto-clicks "Combine orders" and monitors for new ones via MutationObserver
- Replaces the default header nav with `USER_CONFIG.headerLinks`

### Per-Order Card Processing (`processOrderCard`)
Each order card gets:
- A **shipping info block** at the top: order ID links, total price, expected-by date, shipping cost, Canadian flag
- `+tracking` pill (for orders above the price threshold)
- `+note` pill (for all orders)
- A `revise` pill next to each item title (links to eBay's revise item page)
- **Copy / Edit address** buttons replacing the default eBay ones
- **Mark as Shipped** button with:
  - "+ Will ship tomorrow note" checkbox (pre-checked globally)
  - "+ thank you msg" checkbox (pre-checked globally)
  - A canned message selector (Late+Gift, Late no gift, Preorder)
- A **Print Envelope** button

**Color coding** (applied to card background and SKU panel):
- Manila envelope highlight (orange border) — SKU contains "manila"
- Large envelope highlight (yellow border) — SKU contains "lg"
- Multi-item highlight (green background) — order has more than one distinct item/quantity

### SKU Panel (`setupSkuLogic` / `PrintSKUTable`)
A fixed sidebar panel listing all SKUs to pack, sorted alphabetically. Features:
- Grouped by first letter with dividers
- Color-coded for multi-item orders
- Canadian flag emoji on Canadian orders
- Checkmark overlay when an order is marked shipped
- Hover on order card → highlights corresponding SKU pills
- Click on SKU pill → smoothly scrolls to the order card
- **Live filter input** that simultaneously filters SKU pills and order cards by SKU, buyer name, or item title
- **Print All / Print Selected Envelopes** button
- **Configuration panel**: auto-send messages toggle, global "ship tomorrow" toggle, global "thank you msg" toggle

### Event Handling (`setupGlobalEventListeners`)
Single delegated listener on the orders container handles:
- `+tracking` click → inline tooltip with pre-filled tracking input (22-digit USPS format, auto-formatted with spaces), opens automation tab
- `+note` click → inline tooltip with note textarea + canned response dropdown (pre-populated with ship-tomorrow date), opens automation tab
- **Mark as Shipped** → opens background tabs sequentially (one per order ID, 1s delay between), overlays a pending state on the card
- **Send Message** → modal for canned message customization, then opens automation tab
- **Copy address** → clipboard copy
- **Edit address** → inline edit mode with per-line inputs, Save/Cancel
- **Print Envelope** → single card print
- **Image click** → zoom overlay

---

## Automation Pages

Each automation tab is opened with a `tm_action` URL parameter that drives what the script does:

| `tm_action` | Page | Action |
|-------------|------|--------|
| `ship` | `/mesh/ord/details` | Clicks "Mark as Shipped" link; on `/om/shipment/update`, clicks confirm button or watches for JSON `"ack":"SUCCESS"`, then writes to `CONFIRMED_SHIP_KEY` and closes |
| `track` | `/mesh/ord/details` then `/ship/trk/` | Extracts item/transaction IDs, navigates to tracking page, fills USPS tracking number |
| `track-v2` | `/ship/tr/update` | Fills all `trkNum_*` inputs with tracking number and sets carrier to USPS |
| `add_note` | `/mesh/ord/details` | Opens "Add Note" modal, fills and saves note, writes to `CONFIRMED_NOTE_KEY`, closes tab |
| `auto_message` | `/mesh/ord/details` | Opens Message Buyer panel, inserts thank-you message, optionally auto-clicks Send (based on `AUTO_SEND_MESSAGES_KEY`), closes tab |
| `manual_message` | `/mesh/ord/details` | Same as auto_message but never auto-sends — leaves draft for manual review |
| `message` | `/mesh/ord/details` | Simply opens the Message Buyer panel |

A messaging textarea expander also runs on all order detail pages, setting the textarea to 8 rows.

---

## Message Templates

### Thank-you messages (auto)
Randomly selected from `CONFIG.messageTemplates.thankYouDrafts`. Interpolated with:
- `{BUYER_FIRST}`, `{BUYER_NAME}`, `{SHIP_DATE}`, `{STICKER_WORD}`, `{PRONOUN_SUBJ}`, `{PRONOUN_OBJ}`, `{DEMONSTRATIVE}`, `{DELIVERY_NOTE}`, `{TRACKING_NOTE}`

A thematically matched musician quote (from `CONFIG.quotes` keyed by `CONFIG.quoteKeywords`) is appended after a `***` separator. Falls back to a random quote from any group.

### Canned messages (manual)
Defined in `CONFIG.manualMessageDrafts`. Keys: `canned1` (Late + Gift), `canned3` (Late, no gift), `canned4` (Preorder). Filled via a modal that collects sticker name, arrival/shipping date, and surprise sticker. Interpolation uses the same `applyTemplate()` utility.

---

## Key Utilities

- `applyTemplate(template, data)` — replaces `{KEY}` placeholders in a string
- `setAndTriggerInputValue(el, value)` — sets React-controlled input values with proper event dispatch
- `waitForElement(selector, timeout)` — polls DOM for a selector, returns a Promise
- `waitForAllElements(selector, timeout)` — same but waits for at least one match in a NodeList
- `computeNextShipDateSkippingSunday(daysAhead)` — returns the next ship date, advancing past Sunday to Monday

---

## Development Notes

- The script version is tracked in the `@version` header and the changelog block at the top
- `updateURL` and `downloadURL` point to `https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/userscript.js` — changes should be pushed there to propagate to Tampermonkey auto-updates
- The external config Gist URL uses `/raw/` without a commit hash, so it always fetches the latest version
- Dark mode state is persisted in `localStorage` under key `darkModeEnabled`
- The `autopush.sh` script in this folder likely handles pushing changes to GitHub
- `offers_manager.js` is currently empty — a placeholder for future offers/discounts automation
