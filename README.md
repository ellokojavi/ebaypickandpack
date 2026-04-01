# Altheastix eBay Order Manager

A powerful Tampermonkey userscript that transforms eBay's bulk shipping interface into a streamlined, fast-paced pick-and-pack workflow tool.

## Features

### 🎨 UI Redesign
- **Modern dark/light mode** with toggle in the SKU panel
- **Radical layout overhaul** of eBay's native bulk shipping page
- **Custom header links** (Seller Hub, All Orders, Listings, etc.)
- **Color-coded order cards** for quick visual identification:
  - **Manila envelopes** (orange border)
  - **Large items (LG)** (yellow border)
  - **Multi-item orders** (green background with per-order colors)
- **Larger product images** (130px) for better visibility

### 📦 SKU Management
- **"SKUs to Pack" side panel** with live filtering
- **Filter by SKU, buyer name, or item title** in real-time
- **Click-to-scroll navigation** from SKU to order card
- **Auto-detection** of multi-item orders and special SKU types
- **Alphabetical sorting** with visual separators

### 🖨️ Printing
- **Consolidated "Print All Envelopes"** feature
- Prints all envelopes in a **single print window** with proper page breaks
- **Envelope #10 format** (9.5in × 4.125in) support
- **Custom return address** (configurable in `USER_CONFIG`)

### 📋 Order Automation
- **Mark as Shipped** with optional auto-notes and thank-you messages
- **Add Tracking** links (both old and new eBay tracking systems)
- **Add Note** to orders with custom date formatting
- **Send Messages** to buyers with templated thank-you drafts
- **Auto-send toggle** for messages (with safety confirmation)

### 💾 Smart Features
- **Order totals** calculated from item prices and quantities
- **Automatic tracking suggestion** for orders over $15
- **Canadian order detection** with flagging and notes
- **"Revise" item links** to quickly edit listings
- **Canned message templates** with variable substitution (buyer name, ship date, product type, etc.)
- **Random quotes** appended to thank-you messages (configurable)

### ⚙️ Configuration
- **External config loading** from GitHub Gist (decoupled logic)
- **Global toggles** in the SKU panel:
  - Auto-send messages
  - "Will ship tomorrow" note for all orders
  - Thank-you message for all orders
- **Local storage persistence** for user preferences

## Installation

1. **Install Tampermonkey** browser extension:
   - [Chrome/Edge](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobefkf)
   - [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - [Safari](https://apps.apple.com/us/app/tampermonkey/id1482490089)

2. **Install this script** by clicking the raw GitHub URL:
   ```
   https://raw.githubusercontent.com/[YOUR_REPO]/userscript.js
   ```
   (Tampermonkey will prompt you to install)

3. **Go to an eBay bulk shipping page** and the script will activate

## Configuration

### User Config (in-script)

Edit the `USER_CONFIG` object in the userscript (around line 48) to customize:

```javascript
const USER_CONFIG = {
    returnAddress: "Altheastix ⚡<br>3015 E Howell St.<br>Seattle, WA 98122<br>USA",
    trackingOrderAmountThreshold: 15,  // Minimum order value to show +tracking link
    useAlternativeTracking: true,       // Use new v2 tracking system
    scriptLoadDelay: 15 * 1000,        // Initial startup delay (ms)
    defaultTrackingNumber: "9114 9023 0722 4988 5575",  // Pre-fill tracking input
    enableDarkModeByDefault: true,
    enableQuotesInMessages: true,
    orderColors: [...],                // Color palette for multi-item orders
    headerLinks: [...]                 // Custom header navigation
};
```

### External Config (Gist)

The script loads templates, quotes, and keywords from an external GitHub Gist. To customize:

1. Create your own Gist with the structure:
   ```javascript
   window.AltheastixConfig = {
       messageTemplates: {
           thankYouDrafts: ["Your message template here..."]
       },
       deliveryNotes: { ... },
       quotes: { ... },
       quoteKeywords: { ... }
   };
   ```

2. Update the `@require` URL in the script header to point to your Gist

## Usage

### Pick & Pack Workflow

1. **Load the bulk shipping page** → Script initializes with a 15s startup timer
2. **Filter SKUs** using the search box in the left panel (search by SKU, buyer, item)
3. **Click a SKU** to jump to the corresponding order
4. **Edit address** if needed using the Edit/Copy buttons
5. **Select message template** (or leave empty) from the dropdown
6. **Check "Will ship tomorrow"** and/or **"Thank you msg"** checkboxes
7. **Click "Mark as Shipped"** → Opens background tabs to finalize the shipment
8. **Print envelopes** individually or use "Print All" for batch printing

### Keyboard & UI Tips

- **Click SKU pills** to highlight and scroll to that order
- **Filter persists** across SKU panel re-renders
- **Dark mode toggle** (🌙/☀️) in the SKU panel title
- **Checkbox toggles** apply globally to all orders
- **Print dialog** appears once with all selected envelopes

## Updates

The script auto-updates via Tampermonkey. To force a check:
1. Open Tampermonkey dashboard
2. Find "Altheastix eBay Order Manager"
3. Click the update icon (↻)

Updates are detected when the `@version` field changes.

## Troubleshooting

### Orders not showing up?
- Make sure you're on the eBay bulk shipping page (`/ship/bulk` or `gslblui.ebay.com/gslblui/bulk`)
- Click the "Combine Orders" button if available
- Wait for the startup timer to complete (or click "Run Now")

### Tracking/Notes not saving?
- Check that Tampermonkey has granted the script permissions (it should prompt on first use)
- Ensure you're filling in required fields (tracking number must be exactly 22 digits)

### Print shows blank pages?
- The printer should be set to "Envelope #10" paper size
- If still blank, try adjusting margins to "Minimum" in the print dialog

### Messages not auto-sending?
- Check the "auto-send messages" toggle in the SKU panel configuration
- If unchecked, messages will draft and wait for manual send

## Development

### Project Structure
- `userscript.js` — Main script (1000+ lines)
- `ebay_bulk_labels_original_input.html` — Sample eBay page (for reference)
- External Gist — Configuration, templates, quotes

### Modifying the Script

1. Clone this repo locally
2. Edit `userscript.js`
3. Commit and push to GitHub
4. Tampermonkey will detect the version change and auto-update

### Version Format

Versions follow: `YYYYMMDD-vX.XX-description`
- Example: `20260331-v3.26-filter-print-ui-fixes`

## Changelog

See `userscript.js` header for full changelog. Latest:

**v3.26** (2026-03-31)
- Added live filter for SKUs, buyers, and items
- Consolidated print all into single window
- Fixed image sizing and price extraction
- Fixed Envelope #10 print layout

**v3.25** (2025-12-12)
- Decoupled logic from configuration (external Gist)
- Auto-update URL optimization

## License

MIT License — Feel free to fork, modify, and redistribute.

## Credits

- **Javier Irigoyen** — Author
- **Grok, Gemini, GitHub Copilot** — Code refinement
- **Claude (Anthropic)** — Recent improvements (v3.26+)
- **eBay** — Platform (obviously!)

---

**Questions or Issues?** Open an issue on GitHub or check the script's console logs (F12) for debug messages.

Happy shipping! 📦⚡
