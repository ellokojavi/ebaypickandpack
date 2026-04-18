// ==UserScript==
// @name         2025 eBay Address Clipboard Copier and Printer (Radical UI Decoupled)
// @namespace    http://tampermonkey.net/
// @version      20260417-v3.49-cowork-push-test
// @description  A nicer redesign of the eBay bulk shipping page with a polished, modern address box. Logic is now decoupled from configuration (templates/quotes) via external Gist.
// @author       Javier, with modifications from Grok, Gemini, and GitHub Copilot <3
// @match        https://gslblui.ebay.com/gslblui/bulk
// @match        https://www.ebay.com/ship/bulk*
// @match        https://www.ebay.com/mesh/ord/details*
// @match        https://www.ebay.com/om/shipment/update*
// @match        https://www.ebay.com/ship/trk/*
// @match        https://www.ebay.com/ship/tr/update*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ebay.com
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        window.close
// @require      https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/altheastix-ebay-config.js
// @updateURL    https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/userscript.js
// @downloadURL  https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/userscript.js
// ==/UserScript==

// ===================================================================
// CHANGELOG
// ===================================================================
// v3.49:
// - Test commit to verify Cowork auto-push is working end-to-end.
//
// v3.48:
// - Moved external config from GitHub Gist to the repo as altheastix-ebay-config.js.
//   Updated @require URL to point to GitHub raw URL instead of Gist.
// - Fixed hardcoded $15 fallback in tracking note logic — now correctly uses $20
//   (consistent with trackingOrderAmountThreshold in USER_CONFIG).
//
// v3.47:
// - showMicaImage flag is now false by default in USER_CONFIG.
//
// v3.46:
// - Second test commit to verify launchd autopush is working end-to-end.
//
// v3.45:
// - Test commit to verify GitHub auto-sync is working.
//
// v3.44:
// - Raised trackingOrderAmountThreshold from $15 to $20. The buyer message
//   "orders at or under $X ship without tracking" and all related UI/logic
//   now use the new value.
//
// v3.43:
// - PO Box addresses are now accepted as valid in address validation. Rule 3
//   (street line must start with a digit) is skipped when the line matches
//   a PO Box pattern (e.g. "PO Box 1931", "P.O. Box 42").
//
// v3.42:
// - Fixed envelope line breaks broken by v3.41. Cloning a detached node breaks
//   innerText (no CSS = no <br> → newline conversion). Now temporarily hides the
//   badges on the live element, reads innerText normally, then restores them.
//
// v3.40:
// - Extended address validation to Canadian orders. validateAddress() now detects
//   "Canada" in the address lines and applies CA-specific rules: postal code format
//   (A1A 1A1), and province/territory code validation against all 13 CA codes
//   (AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT).
// - Removed the isCanadian exclusion guard in processOrderCard — Canadian orders
//   now go through the same badge injection path as US orders.
//
// v3.39:
// - Added address validation rule: any line after the buyer name that consists
//   entirely of digits is flagged as a likely duplicate street number (e.g. eBay
//   splitting "416577" onto its own line before "416577 flying bridge").
//
// v3.38:
// - Fixed address badge placement for real: eBay injects a <br> inside the
//   .print__address__fullname span, so appendChild was landing after the line
//   break. Badge is now inserted before that <br> so it sits inline with the name.
//
// v3.37:
// - Fixed address badge placement: .print__address__fullname is a sibling of .en-US,
//   not a descendant, so addrEl.querySelector() always returned null. Scoped the
//   lookup to orderItem.querySelector() — consistent with every other use in the
//   script — so the badge now correctly appends inside the name element.
//
// v3.36:
// - Moved address validation badges inline, immediately to the right of the recipient
//   name, instead of appearing as a separate line below the address block.
// - Badges are now just the symbol (✔ or ⚠) with no label text; the tooltip carries
//   the message. OK tooltip updated to "Address looks correct".
//
// v3.35:
// - Added ✔ badge for orders that pass all address validation rules.
//   Hovering shows "Address looks correct". Styled in green, consistent with the
//   ⚠ warning badge layout.
//
// v3.34:
// - Added address integrity validation for domestic (US) orders. After each order
//   card is processed, the shipping address is linted against a set of structural
//   rules: minimum line count, buyer name presence, street starting with a house
//   number, presence of a valid "City ST XXXXX" line (comma-less, matching eBay's
//   format), and recognized US state/territory abbreviation.
//   International addresses (Canada, UK, etc.) are skipped.
// - When one or more issues are found, a ⚠ "Address issue" badge is injected
//   between the address text and the Edit/Copy buttons. Hovering the badge shows
//   a tooltip listing every issue found, styled to match dark/light mode.
// - Validation lives in a standalone validateAddress(lines) pure function placed
//   near parseAddressBlock for discoverability.
//
// v3.33:
// - Toned down multi-qty pill color: replaced bright orange with a muted warm amber.
//   Removed bold font-weight, reduced border from 2px to 1px, softened background
//   and text/border colors. Still warm enough to signal "pack multiple units" without
//   competing visually with Manila/LG pills.
// v3.32:
// - Multi-quantity pills (e.g. "B01 x2") now render with an amber/orange color
//   scheme: warm dark background + orange border + orange text in dark mode;
//   warm cream background + amber border + dark amber text in light mode.
//   This uses the same orange accent already applied to "Qty: 2" badges on order
//   cards, so the visual language is consistent. The style stacks cleanly with
//   multi-item-order colored pills (which use inline backgroundColor).
// - Manila pills take priority over multi-qty styling: a SKU that is both Manila
//   and qty>1 shows Manila styling only (different envelope = more important).
//
// v3.31:
// - Fixed disappearing pills for single-SKU multi-quantity orders (e.g. B01 x2).
//   isMultiItemOrder was incorrectly set to true when totalQty > 1, causing
//   colored-pill styling in dark mode (black text on dark bg = invisible).
//   isMultiItemOrder now only triggers when an order has multiple DISTINCT SKUs,
//   which is its original intent.
//
// v3.30:
// - Fixed quantity parsing: eBay uses "Qty: 2" (not "Quantity: 2") in the item
//   details list. All three places that parse quantity now accept both "Quantity:"
//   and "Qty:" (case-insensitive), so "B01 x 2" pills now render correctly.
//   The v3.29 SKU+Design consolidation within an order is also retained.
//
// v3.29:
// - Fixed SKU pills for multi-quantity items: when the same SKU appears multiple
//   times within one order (e.g. eBay renders qty 2 as two separate line items),
//   the pills now consolidate by SKU+Design per order and show "B01 x 2" instead
//   of two separate "B01" pills. Cross-order duplicates remain as separate pills.
//
// v3.28:
// - Fixed light-mode quantity badge contrast: #FFA500 (ratio 1.97) → #B45309 (ratio 5.02).
//   Dark mode keeps #FFA500 (ratio 7.27, unchanged).
//
// v3.27:
// - Added "Custom Envelope" feature: a modal (accessible via link in the SKU panel)
//   that auto-parses a pasted address block into editable fields and prints a single
//   ad-hoc #10 envelope. Useful for re-sending orders not in the active ship queue.
// - Added subtle horizontal dividers between letter groups in the SKU pills list.
// - Expanded multi-item order pill color palette from 11 to 40 distinct colors,
//   interleaved across hues to minimize repetition at high order volumes.
// - Canadian envelopes now include a faint 🇨🇦 + "Int'l Stamp" reminder in the
//   top-right corner, sized to be fully covered by an international stamp.
// - Added showMicaImage flag to USER_CONFIG to toggle the Mica image on/off.
//
// v3.26:
// - Added live SKU/buyer/item filter input to the SKU panel that filters both
//   the SKU list and order cards in real-time. Filter text persists across re-renders.
// - Consolidated "Print All Envelopes" into a single print window with proper
//   page breaks (one envelope per page). Removed N separate print dialogs.
// - Fixed item image sizing: increased container to 130px with CSS !important overrides.
// - Fixed price extraction to match both "Item price:" and "Sold for:" labels.
// - Fixed print envelope layout for Envelope #10 format (9.5in × 4.125in) with
//   6% content scaling to prevent blank pages.
//

(function() {
    'use strict';

    // ===================================================================
    // GLOBAL CONSTANTS & STORAGE KEYS
    // ===================================================================
    const CONFIRMED_SHIP_KEY = 'ebay_order_shipped_confirmed';
    const TRACKING_ADD_KEY = 'ebay_tracking_to_add';
    const TRACKING_ADD_KEY_V2 = 'ebay_tracking_to_add_v2';
    const NOTE_ADD_KEY = 'ebay_note_to_add';
    const CONFIRMED_NOTE_KEY = 'ebay_note_confirmed';
    const AUTO_SEND_MESSAGES_KEY = 'ebay_auto_send_messages';

    // ===================================================================
    // USER CONFIGURATION (Local Preferences)
    // ===================================================================
    const USER_CONFIG = {
        returnAddress: "Altheastix ⚡<br>3015 E Howell St.<br>Seattle, WA 98122<br>USA",
        trackingOrderAmountThreshold: 20,
        useAlternativeTracking: true,
        scriptLoadDelay: 15 * 1000,
        defaultTrackingNumber: "9114 9023 0722 4988 5575 ",
        enableDarkModeByDefault: true,
        enableQuotesInMessages: true,
        showMicaImage: false,
        orderColors: [
            // Expanded 40-color palette — hues spread across the spectrum and interleaved
            // so that consecutive assignments are always visually distinct
            '#FFADAD', '#A0C4FF', '#CAFFBF', '#FFC6FF', '#FDFFB6',  // red · blue · green · pink · yellow
            '#9BF6FF', '#FFD6A5', '#BDB2FF', '#DDFFD0', '#F0D4FF',  // cyan · orange · purple · mint · lavender
            '#FF9AA2', '#B5EAD7', '#FFDAC1', '#C7CEEA', '#E2F0CB',  // rose · teal · peach · periwinkle · sage
            '#FFE4B5', '#D4F1F4', '#F8C8D4', '#D5F5E3', '#FAD7A0',  // moccasin · ice blue · blush · seafoam · amber
            '#D7BDE2', '#A9DFBF', '#F9E79F', '#AED6F1', '#F5CBA7',  // soft violet · jade · straw · sky · apricot
            '#A3E4D7', '#F1948A', '#85C1E9', '#82E0AA', '#F0B27A',  // aquamarine · coral · cornflower · emerald · pumpkin
            '#C39BD3', '#76D7C4', '#F7DC6F', '#7FB3D3', '#F0A7A0',  // plum · turquoise · gold · steel blue · salmon
            '#B7D7A8', '#D2B4DE', '#A9CCE3', '#F9C74F', '#90DBB0',  // leaf · mauve · powder blue · sunflower · spearmint
        ],
        headerLinks: [
            { text: 'Seller Hub', href: 'https://www.ebay.com/sh/ovw' },
            { text: 'All Orders', href: 'https://www.ebay.com/sh/ord/?filter=status%3AALL_ORDERS' },
            { text: 'Listings', href: 'https://www.ebay.com/sh/lst/active' },
            { text: 'Give Feedback', href: 'https://www.ebay.com/sh/ord?filter=status:SHIPPED_WAITING_TO_GIVE_FEEDBACK' },
            { text: 'Help', href: 'https://www.ebay.com/ship/bulk/help?consumer=BULKID' }
        ]
    };

    // ===================================================================
    // LOGIC FOR THE PICK & PACK PAGE (BULK SHIPPING)
    // ===================================================================
    if (window.location.href.startsWith('https://gslblui.ebay.com') || window.location.href.startsWith('https://www.ebay.com/ship/bulk')) {
        console.log('[Tampermonkey][BOOT] Script detected bulk shipping page. Initializing startup overlay…');

        GM_addStyle('.orders-list__item { opacity: 0; transition: opacity 0.2s ease; }');

        const delay = USER_CONFIG.scriptLoadDelay;

        // Ensure external config loaded, fallback to empty objects if Gist fails
        const EXT_CONFIG = window.AltheastixConfig || {};

        const CONFIG = {
            timing: {
                sequentialTabDelay: 1000,
                pollingInterval: 2000
            },
            selectors: {
                ordersContainer: '.card.select-service', orderItem: '.orders-list__item', buttonList: '.button-list', header: '.site-header', headerTop: '.site-header__top', headerBottom: '.site-header__bottom', headerBottomH1: '.site-header__bottom h1', headerLogo: '.site-header__top .ebay-logo', bulkLabelsAppCard: '#bulk-labels-app .card.select-service', combineOrdersButton: '.service-actions__combine-all', tcellItem: '.tcell__item', tcellTransaction: '.tcell__transaction', buyerCell: '.tcell__buyer', itemImage: '.item__image img', itemDescription: '.item__description', itemDetailsContainer: '[class*="item__details"]', checkbox: '.checkbox__control', addressActions: '.piped-links.address__actions', orderIdContainer: '.unique_order_id_container', buyerPaidService: '.buyer-paid-service', reviseLink: 'a[href*="revise"]', uniqueOrderIdLink: '.unique-order-id a', pageFooter: 'footer', removableNotices: '.section-notice--attention, .section-notice__main, .page-announcement, .section-notice, .section-notice--information', groupingSummary: '.grouping_summary', serviceActions: '.service-actions', ordersFilters: '.orders-filters', batchSelect: '.batch-select', sortOrderSelector: '.sort-order-selector', listboxButtonForm: '.listbox-button .btn.btn--form', listboxIcon: '.listbox-button .btn.btn--form .icon', listboxDropdown: '.listbox-button .listbox-button__listbox', listboxOption: '.listbox-button .listbox-button__option', listboxSelectedIcon: '.listbox-button__option[aria-selected="true"] .icon--tick-small', skuPanelTitle: '#SKUListContainer h2.sku-title', skuPanelToggles: '.sku-toggles', gridGroup: '.grid__group'
            },
            ids: {
                copyAddressButton: 'copyAddressButton', editAddressButton: 'editAddressButton', createTemplateButton: 'createTemplateButton', printEnvelopeHTML: 'HTMLEnvelopeToPrint', printAllEnvelopesButton: 'printAllEnvelopesButton', skuPanelContainer: 'SKUListContainer', skuList: 'SKUsToPackContainer', skuContentWrapper: 'sku-content-wrapper'
            },
            classNames: {
                addressContainer: 'en-US', editAddressBtn: 'edit-address-btn', cancelAddressBtn: 'cancel-address-btn', copyAddressBtn: 'copy-address-btn', addressEditInput: 'address-edit-input', cancelWrapper: 'cancel-wrapper', addressFullname: 'print__address__fullname', itemContainer: 'item', shippingInfoBlock: 'shipping-info-block', quantityMulti: 'quantity-multi', markAsShippedBtn: 'mark-as-shipped-btn', isEditingAddress: 'is-editing-address', highlightManila: 'order-highlight-manila', highlightLg: 'order-highlight-lg', highlightMultiItem: 'order-highlight-multi-item', borderLg: 'order-border-lg', borderManila: 'order-border-manila', highlightYellow: 'highlight-yellow', skuItem: 'sku-item', skuGroupSeparator: 'sku-group-separator', skuLg: 'sku-lg', skuManila: 'sku-manila', skuMultiQty: 'sku-multi-qty', multiItemSkuOrder: 'order-multi-item', darkModeSwitch: 'dark-mode-switch', darkModeSlider: 'slider', zoomOverlay: 'zoomed-image-overlay', zoomContainer: 'zoomed-image-container', zoomImage: 'zoomed-image', zoomCloseButton: 'close-zoom-button',
                printEnvelopeBtn: 'print-envelope-btn', markAsShippedWaiting: 'waiting-confirmation', orderShipped: 'shipped-state', shippedLabel: 'shipped-label', orderPendingShipment: 'order-pending-shipment', pendingOverlay: 'pending-overlay', pendingOverlayContent: 'pending-overlay-content', processingIcon: 'processing-icon', skuShipped: 'sku-shipped', addTrackingLink: 'add-tracking-link', trackingLinkSubmitted: 'tracking-link-submitted', reviseLink: 'revise-link', addNoteLink: 'add-note-link', noteLinkSubmitted: 'note-link-submitted',
                messageContainer: 'message-container', cannedMessageSelect: 'canned-message-select', sendCannedMessageBtn: 'send-canned-message-btn',
                addrWarningBadge: 'addr-warning-badge', addrWarningTooltip: 'addr-warning-tooltip',
                addrOkBadge: 'addr-ok-badge', addrOkTooltip: 'addr-ok-tooltip'
            },
            localStorageKeys: {
                darkMode: 'darkModeEnabled'
            },
            urls: {
                revisePrefix: "https://www.ebay.com/sl/list?mode=ReviseItem&itemId="
            },
            data: {
                orderColors: USER_CONFIG.orderColors
            },
            styles: {},

            // --- EXTERNAL CONFIGURATION LOADED FROM GIST ---
            // Fallback provided in case of load failure
            messageTemplates: EXT_CONFIG.messageTemplates || { thankYouDrafts: ["Error loading templates from Gist."] },
            manualMessageDrafts: {
                'canned1': "Hi {BUYER_FIRST}. Thanks a lot for your order. Wanted to let you know that due to high demand we ran out of these {STICKER_NAME} stickers and, as such, will need to wait until roughly {ARRIVAL_DATE} for your order to ship. If you are cool with that we'll add a surprise {SURPRISE_STICKER} sticker for the hassle. If not, we'll issue a refund, no questions asked.\n\nThanks a lot for your patience! These stickers have been a whole hit.\n\nA.",
                'canned3': "Hi {BUYER_FIRST}. Thanks a lot for your order. Wanted to let you know that due to sudden high demand we ran out of these {STICKER_NAME} stickers and, as such, will need to wait until roughly {ARRIVAL_DATE} for your order to ship. If not cool with waiting, we can issue a refund, no questions asked. Please let us know if you are OK with it.\n\nThanks a lot for your patience and apologies! These stickers have been a whole hit.\n\nA.",
                'canned4': "Hi {BUYER_FIRST}. Thanks for your pre-order of the {STICKER_NAME} sticker. As stated in the product details, this item is a pre-order and will ship by {SHIPPING_DATE}. Please disregard any automated eBay message stating that your item has shipped. We will personally contact you as soon as it's on its way.\n\nThanks a lot for your patience!\n\nA."
            },
            deliveryNotes: EXT_CONFIG.deliveryNotes || {
                canada: 'Orders to Canada may take several weeks to arrive, so please be patient.',
                usualPlural: 'They usually arrive within 5–7 business days',
                usualSingular: 'It usually arrives within 5–7 business days',
                patienceVariants: ['thanks for your patience.']
            },
            quotes: EXT_CONFIG.quotes || {},
            quoteKeywords: EXT_CONFIG.quoteKeywords || {}
        };

        // If config didn't load, alert the user in console
        if (!window.AltheastixConfig) {
            console.error('[Tampermonkey] CRITICAL: External config file failed to load. Templates and quotes will be missing.');
        }

        let scriptHasRun = false;
        let fallbackTimer = null;
        let observer = null;
        let countdownInterval = null;
        let radicalStyleElement = null;

        // --- Startup Overlay & Timer ---
        const blurOverlay = document.createElement('div');
        blurOverlay.id = 'tampermonkey-blur-overlay';
        blurOverlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); z-index: 9998; opacity: 1; transition: opacity 0.5s ease-in-out;`;
        document.body.appendChild(blurOverlay);
        const timerElement = document.createElement('div');
        timerElement.id = 'tampermonkey-countdown-timer';
        timerElement.style.cssText = `position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 20px 25px; background-color: #272C34; color: white; border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: bold; z-index: 9999; box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; gap: 15px; opacity: 1; transition: opacity 0.5s ease-in-out;`;
        const timerTextSpan = document.createElement('span');
        timerElement.appendChild(timerTextSpan);
        const forceRunButton = document.createElement('a');
        forceRunButton.textContent = 'Run Now';
        forceRunButton.style.cssText = `color: #9BF6FF; text-decoration: underline; cursor: pointer; font-weight: normal; font-size: 18px;`;
        forceRunButton.addEventListener('click', () => {
            console.log('[Tampermonkey][BOOT] Manual Run Now clicked by user. Forcing execution.');
            executeMainScript();
        });
        timerElement.appendChild(forceRunButton);
        document.body.appendChild(timerElement);
        const endTime = Date.now() + delay;
        function updateTimerDisplay() {
            if (scriptHasRun) { clearInterval(countdownInterval); return; }
            const remainingTime = endTime - Date.now();
            if (remainingTime <= 0) executeMainScript();
            else timerTextSpan.textContent = `Script loads in ${(remainingTime / 1000).toFixed(2)}s`;
        }
        countdownInterval = setInterval(updateTimerDisplay, 10);

        // --- Radical Styles ---
        function getRadicalStyles(isDarkMode) {
            return `
                :root {
                    --color-neutral-800: #8c8c8c !important;
                }
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: ${isDarkMode ? '#1a1a1a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                ${CONFIG.selectors.groupingSummary}, .tag--combined { display: none !important; }
                .service-actions__wrapper.sticky.sticky-full-width { display: none !important; }
                #${CONFIG.ids.skuPanelContainer} { position: fixed; top: 110px; width: 360px; max-height: calc(100vh - 130px); overflow-y: auto; z-index: 1000; background: ${isDarkMode ? '#2a2a2a' : '#fdfdfd'}; padding: 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid ${isDarkMode ? '#444' : '#ddd'}; transition: top 0.3s ease-in-out; }
                ${CONFIG.selectors.skuPanelTitle} { position: sticky; top: 0; background: ${isDarkMode ? '#333' : '#f5f5f5'}; z-index: 1; margin: 0; padding: 12px 15px; font-size: 16px; border-bottom: 1px solid ${isDarkMode ? '#444' : '#ddd'}; display: flex; justify-content: space-between; align-items: center; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                ${CONFIG.selectors.skuPanelToggles} { display: flex; gap: 10px; align-items: center; }
                .${CONFIG.classNames.darkModeSwitch} { position: relative; display: inline-block; width: 40px; height: 20px; }
                .${CONFIG.classNames.darkModeSwitch} input { opacity: 0; width: 0; height: 0; }
                .${CONFIG.classNames.darkModeSlider} { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isDarkMode ? '#555' : '#ccc'}; transition: .4s; border-radius: 20px; }
                .${CONFIG.classNames.darkModeSlider}:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
                input:checked + .${CONFIG.classNames.darkModeSlider} { background-color: #3665f3; }
                input:checked + .${CONFIG.classNames.darkModeSlider}:before { transform: translateX(20px); }
                #${CONFIG.ids.skuContentWrapper} { padding: 10px 15px; }
                #${CONFIG.ids.skuList} { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
                .${CONFIG.classNames.skuItem} { padding: 4px 8px; border-radius: 4px; font-size: 14px; background-color: ${isDarkMode ? '#3a3a3a' : '#f0f0f0'}; border: 1px solid ${isDarkMode ? '#555' : '#ddd'}; line-height: 1.4; white-space: nowrap; text-decoration: none; color: ${isDarkMode ? '#e0e0e0' : 'inherit'}; cursor: pointer; transition: all 0.2s ease-in-out; }
                .sku-highlight-hover { transform: scale(1.05); border-color: ${isDarkMode ? '#9BF6FF' : '#0070d2'}; box-shadow: 0 0 8px ${isDarkMode ? '#9BF6FF' : '#0070d2'}; }
                .${CONFIG.classNames.skuShipped}, .sku-shipped { opacity: 0.5 !important; }
                .${CONFIG.classNames.skuGroupSeparator} { flex-basis: 100%; height: 0; margin-top: 8px; border-top: 1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}; margin-bottom: 2px; }
                ${CONFIG.selectors.serviceActions} { margin-left: 400px; }
                ${CONFIG.selectors.bulkLabelsAppCard} { margin-left: 400px; border: 0px solid #777; }
                ${CONFIG.selectors.ordersFilters} { margin-left: 0; margin-bottom: 12px; width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 0; background: ${isDarkMode ? '#2a2a2a' : '#fff'}; border: 1px solid #555; border-radius: 12px; }
                ${CONFIG.selectors.batchSelect} { padding-left: 12px !important; flex-shrink: 0; }
                ${CONFIG.selectors.buttonList} ul { display: flex; gap: 10px; list-style: none; padding: 0; margin: 0; align-items: center; }
                ${CONFIG.selectors.buttonList} li { margin: 0; }
                ${CONFIG.selectors.sortOrderSelector} { flex-shrink: 0; }
                ${CONFIG.selectors.sortOrderSelector} .listbox-button .btn--form { margin-right: 12px; }
                .listbox-button .btn--form {
                    background-color: ${isDarkMode ? '#333' : '#fff'} !important;
                    color: ${isDarkMode ? '#f0f0f0' : '#000'} !important;
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                    border-radius: 6px;
                    transition: background-color 0.2s, border-color 0.2s;
                }
                .listbox-button .btn--form:hover {
                    background-color: ${isDarkMode ? '#444' : '#f0f0f0'} !important;
                    border-color: ${isDarkMode ? '#777' : '#aaa'};
                }
                .listbox-button .icon {
                    fill: ${isDarkMode ? '#f0f0f0' : '#000'};
                }
                .listbox-button__listbox {
                    background-color: ${isDarkMode ? '#2c2c2c' : '#fff'};
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                    border-radius: 6px;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }
                div.listbox-button__option[role="option"] {
                    background-color: ${isDarkMode ? '#2c2c2c' : '#fff'} !important;
                    color: ${isDarkMode ? '#f0f0f0' : '#333'} !important;
                    padding: 8px 12px;
                    transition: background-color 0.2s;
                    border-bottom: 1px solid ${isDarkMode ? '#444' : '#eee'};
                }
                .listbox-button__option:last-child {
                    border-bottom: none;
                }
                div.listbox-button__option[role="option"]:hover {
                    background-color: ${isDarkMode ? '#3665f3' : '#e5f0ff'} !important;
                    color: ${isDarkMode ? '#fff' : '#000'} !important;
                }
                .listbox-button__option[aria-selected="true"] {
                    background-color: ${isDarkMode ? '#1e2a4c' : '#f0f5ff'} !important;
                    font-weight: bold;
                    color: ${isDarkMode ? '#99ccff' : '#003087'} !important;
                }
                .listbox-button__option[aria-selected="true"] .icon--tick-small {
                    fill: ${isDarkMode ? '#99ccff' : '#003087'};
                }
                .listbox-button__option .icon--tick-small {
                    fill: transparent;
                }
                ${CONFIG.selectors.orderItem} { position: relative; background: ${isDarkMode ? '#2a2a2a' : '#fff'}; border-radius: 12px; border: 1px solid ${isDarkMode ? '#555' : '#ddd'}; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 12px; padding: 12px; transition: all 0.3s ease; }
                ${CONFIG.selectors.orderItem}.order-combined { }
                ${CONFIG.selectors.gridGroup} { display: flex; align-items: flex-start; }
                ${CONFIG.selectors.tcellItem} { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
                .${CONFIG.classNames.addressFullname} { font-weight: bold; }
                ${CONFIG.selectors.buyerCell} { width: 30% !important; flex-shrink: 0; border: 1px solid ${isDarkMode ? '#555' : '#e0e0e0'}; border-radius: 8px; padding: .5rem !important; background-color: ${isDarkMode ? '#333' : '#fff'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-size: 11pt; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                .${CONFIG.classNames.shippingInfoBlock} { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid ${isDarkMode ? '#444' : '#eee'}; }
                .${CONFIG.classNames.shippingInfoBlock} p { margin: 0; font-size: 13px; color: ${isDarkMode ? '#b0b0b0' : '#555'}; white-space: normal; word-break: break-word; text-decoration: none; }
                .${CONFIG.classNames.shippingInfoBlock} p a:not(.${CONFIG.classNames.addTrackingLink}):not(.${CONFIG.classNames.addNoteLink}) { text-decoration: underline; }
                .${CONFIG.classNames.shippingInfoBlock} span { vertical-align: top; }
                .${CONFIG.classNames.shippingInfoBlock} ${CONFIG.selectors.uniqueOrderIdLink} { font-weight: bold; color: ${isDarkMode ? '#99ccff' : '#003087'}; }
                .header__links a { color: ${isDarkMode ? '#b0b0b0' : '#555'}; }
                .${CONFIG.classNames.highlightManila} ${CONFIG.selectors.uniqueOrderIdLink}, .${CONFIG.classNames.highlightLg} ${CONFIG.selectors.uniqueOrderIdLink}, .${CONFIG.classNames.highlightMultiItem} ${CONFIG.selectors.uniqueOrderIdLink} { color: ${isDarkMode ? '#e0e0e0' : '#000'}; font-weight: bold; }
                .${CONFIG.classNames.itemContainer} { display: flex; align-items: center; gap: 16px; flex-grow: 1; min-width: 0; }
                .item__image { width: 130px; height: 130px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
                .item__image > div { width: 100% !important; height: 100% !important; }
                ${CONFIG.selectors.itemImage} { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; object-fit: contain; border-radius: 6px; cursor: zoom-in; }
                ${CONFIG.selectors.itemDescription} { flex-grow: 1; margin: 0; padding-right: 10px; min-width: 200px; max-width: 400px; word-break: break-word; font-size: larger; color: ${isDarkMode ? '#e0e0e0' : '#1a1a1a'}; }
                ${CONFIG.selectors.itemDescription} a { color: ${isDarkMode ? '#78BFFF' : '#003087'}; }
                ${CONFIG.selectors.itemDescription} a:hover { color: ${isDarkMode ? '#ADD8E6' : '#002166'}; }
                ${CONFIG.selectors.itemDetailsContainer} { flex-shrink: 0; min-width: 180px; display: flex; flex-direction: column; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                ${CONFIG.selectors.itemDetailsContainer} li { line-height: 1.3; }
                ${CONFIG.selectors.itemDetailsContainer} li:first-child { font-size: 1.5em !important; font-weight: bold; color: ${isDarkMode ? '#ffffff' : '#111'}; }
                ${CONFIG.selectors.itemDetailsContainer} li:nth-child(2) { font-size: 1em !important; font-weight: normal; color: ${isDarkMode ? '#e0e0e0' : 'black'}; }
                .${CONFIG.classNames.quantityMulti} { font-size: 1.5em !important; font-weight: bold; color: ${isDarkMode ? '#FFA500' : '#B45309'} !important; }
                .${CONFIG.classNames.reviseLink} {
                    display: inline-block;
                    margin-left: 3px;
                    padding: 1px 4px;
                    border-radius: 10px;
                    font-size: 10px;
                    font-weight: bold;
                    text-decoration: none;
                    background-color: ${isDarkMode ? '#2C3B5E' : '#E6F0FF'};
                    color: ${isDarkMode ? '#99ccff' : '#3665f3'} !important;
                    border: 1px solid ${isDarkMode ? '#4D6A9F' : '#B3D1FF'};
                    transition: all 0.2s ease;
                    vertical-align: middle;
                }
                .${CONFIG.classNames.reviseLink}:hover {
                    text-decoration: none !important;
                    background-color: ${isDarkMode ? '#4D6A9F' : '#D1E4FF'};
                }
                ${CONFIG.selectors.tcellItem} > span { display: flex; flex-direction: column; gap: 12px; }
                ${CONFIG.selectors.addressActions} { margin-top: 8px; }
                ${CONFIG.selectors.addressActions} button, ${CONFIG.selectors.addressActions} .fake-link { color: ${isDarkMode ? '#66b3ff' : '#3665f3'}; font-size: 14px; text-decoration: none; }
                ${CONFIG.selectors.addressActions} button:hover, ${CONFIG.selectors.addressActions} .fake-link:hover { text-decoration: underline; }
                button.fake-link {
                    color: ${isDarkMode ? '#66b3ff' : '#3665f3'} !important;
                    text-decoration: none;
                    background: none;
                    border: none;
                    padding: 0;
                    font: inherit;
                    cursor: pointer;
                    text-align: left;
                }
                .${CONFIG.classNames.addressEditInput} { display: block; width: 95%; padding: 4px 6px; margin-bottom: 4px; border-radius: 4px; border: 1px solid ${isDarkMode ? '#777' : '#ccc'}; background-color: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                .${CONFIG.classNames.addrWarningBadge} { position: relative; display: inline; margin-left: 5px; font-size: 12px; color: ${isDarkMode ? '#FFB347' : '#B45309'}; cursor: help; user-select: none; }
                .${CONFIG.classNames.addrWarningTooltip} { display: none; position: absolute; left: 0; top: 1.5em; min-width: 220px; max-width: 320px; background: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#333'}; border: 1px solid ${isDarkMode ? '#FFB347' : '#B45309'}; border-radius: 5px; padding: 6px 10px; font-size: 11px; line-height: 1.5; white-space: normal; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.25); pointer-events: none; }
                .${CONFIG.classNames.addrWarningBadge}:hover .${CONFIG.classNames.addrWarningTooltip} { display: block; }
                .${CONFIG.classNames.addrOkBadge} { position: relative; display: inline; margin-left: 5px; font-size: 12px; color: ${isDarkMode ? '#6fcf6f' : '#2a7a2a'}; cursor: help; user-select: none; }
                .${CONFIG.classNames.addrOkTooltip} { display: none; position: absolute; left: 0; top: 1.5em; min-width: 160px; background: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#333'}; border: 1px solid ${isDarkMode ? '#6fcf6f' : '#2a7a2a'}; border-radius: 5px; padding: 6px 10px; font-size: 11px; line-height: 1.5; white-space: normal; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.25); pointer-events: none; }
                .${CONFIG.classNames.addrOkBadge}:hover .${CONFIG.classNames.addrOkTooltip} { display: block; }
                ${CONFIG.selectors.pageFooter} { background-color: ${isDarkMode ? '#2a2a2a' : '#f5f5f5'}; color: ${isDarkMode ? '#e0e0e0' : '#555'}; margin-top: 0 !important; }
                ${CONFIG.selectors.pageFooter} a { color: ${isDarkMode ? '#66b3ff' : '#3665f3'} !important; text-decoration: none; }
                ${CONFIG.selectors.pageFooter} a:hover { text-decoration: underline; }
                .footer-label { background-color: ${isDarkMode ? '#2a2a2a' : '#fff'} !important; color: ${isDarkMode ? '#e0e0e0' : '#555'} !important; }
                .${CONFIG.classNames.highlightManila} { background-color: ${isDarkMode ? '#4a3f2a' : '#FFF8E1'}; }
                .${CONFIG.classNames.highlightLg} { background-color: ${isDarkMode ? '#2a3f4a' : '#E1F5FE'}; }
                .${CONFIG.classNames.highlightMultiItem} { background-color: ${isDarkMode ? '#2a4a3f' : '#E8F5E9'}; }
                .${CONFIG.classNames.borderLg} { border: 2px solid #ffffb1 !important; }
                .${CONFIG.classNames.borderManila} { border: 3px solid orange !important; }
                .${CONFIG.classNames.highlightManila} .unique-order-id a, .${CONFIG.classNames.highlightLg} .unique-order-id a, .${CONFIG.classNames.highlightMultiItem} .unique-order-id a, .${CONFIG.classNames.highlightMultiItem} .unique-order-ids a { color: ${isDarkMode ? '#78BFFF' : '#000'}; }
                .${CONFIG.classNames.highlightManila} .unique-order-id a:hover, .${CONFIG.classNames.highlightLg} .unique-order-id a:hover, .${CONFIG.classNames.highlightMultiItem} .unique-order-id a:hover { color: ${isDarkMode ? '#99ccff' : '#333'}; }
                .${CONFIG.classNames.highlightMultiItem} .unique-order-ids { margin-right: 0; }
                .${CONFIG.classNames.skuItem}.${CONFIG.classNames.multiItemSkuOrder} { background-color: ${isDarkMode ? '#2a4a3f' : '#E8F5E9'}; font-weight: bold; }
                .${CONFIG.classNames.skuItem}.${CONFIG.classNames.skuLg} { background-color: ${isDarkMode ? '#2a3f4a' : '#B3E5FC'}; font-weight: bold; border: 2px solid #ffffb1 !important; }
                .${CONFIG.classNames.skuItem}.${CONFIG.classNames.skuManila} { background-color: ${isDarkMode ? '#4a3f2a' : '#FFD54F'}; font-weight: bold; border: 3px solid orange !important; }
                .${CONFIG.classNames.skuItem}.${CONFIG.classNames.skuMultiQty} { background-color: ${isDarkMode ? '#2e2a1e' : '#FAF3E0'}; color: ${isDarkMode ? '#c8902a' : '#8a5c00'} !important; border: 1px solid ${isDarkMode ? '#7a5c28' : '#c8a060'} !important; }
                .${CONFIG.classNames.highlightYellow} { color: #111; background-color: #ffffb1; padding: 1px 2px; border-radius: 2px; }
                .${CONFIG.classNames.zoomOverlay} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 10000; display: flex; justify-content: center; align-items: center; }
                .${CONFIG.classNames.zoomContainer} { max-width: 80%; max-height: 80%; position: relative; }
                .${CONFIG.classNames.zoomImage} { max-width: 100%; max-height: 100%; object-fit: contain; }
                .${CONFIG.classNames.zoomCloseButton} { position: absolute; top: -20px; right: -20px; background: ${isDarkMode ? '#3a3a3a' : 'white'}; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                #${CONFIG.ids.printAllEnvelopesButton} { background: ${isDarkMode ? '#3a3a3a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#272C34'}; border: 2px solid ${isDarkMode ? '#555' : '#DAE3F3'}; }
                #${CONFIG.ids.printAllEnvelopesButton}:hover { box-shadow: 0 2px 2px rgba(255,255,255,0.12); }
                ${CONFIG.selectors.headerBottom} { display: flex; align-items: center; gap: 20px; padding-top: 0px; }
                ${CONFIG.selectors.header} { margin-bottom: 0; }
                ${CONFIG.selectors.ordersContainer} { margin-bottom: 0 !important; }
                .${CONFIG.classNames.markAsShippedBtn} { display: block; width: 100%; margin-top: 10px; padding: 8px 12px; font-size: 14px; font-weight: bold; color: #fff !important; background-color: ${isDarkMode ? '#3665f3' : '#0070d2'}; border: none; border-radius: 6px; cursor: pointer; text-align: center; text-decoration: none !important; transition: background-color 0.2s ease; }
                .${CONFIG.classNames.markAsShippedBtn}:hover { background-color: ${isDarkMode ? '#5a82f5' : '#005fb8'}; text-decoration: none !important; }
                .${CONFIG.classNames.markAsShippedBtn}.${CONFIG.classNames.markAsShippedWaiting} { background-color: ${isDarkMode ? '#555' : '#ccc'}; color: ${isDarkMode ? '#aaa' : '#666'} !important; cursor: not-allowed; }
                .${CONFIG.classNames.shippedLabel} { display: block; width: 100%; margin-top: 10px; padding: 8px 12px; font-size: 14px; font-weight: bold; text-align: center; color: ${isDarkMode ? '#e0e0e0' : '#fff'}; background-color: ${isDarkMode ? '#2e7d32' : '#28a745'}; border-radius: 6px; }
                .${CONFIG.classNames.printEnvelopeBtn} {
                    display: block; width: 25%; box-sizing: border-box; text-align: center;
                    margin-top: 8px; outline: none; cursor: pointer; font-size: 14px;
                    padding: 4px 12px; line-height: 1.2; font-weight: 700; border-radius: 6px;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    transition: all 150ms ease-in-out;
                    background-color: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    color: ${isDarkMode ? '#e0e0e0' : '#272C34'};
                    border: 2px solid ${isDarkMode ? '#555' : '#DAE3F3'};
                }
                .${CONFIG.classNames.printEnvelopeBtn}:hover {
                    background-color: ${isDarkMode ? '#4a4a4a' : '#f5f5f5'};
                    border-color: ${isDarkMode ? '#777' : '#c0c8d4'};
                    box-shadow: 0 2px 2px ${isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(39, 44, 52, 0.12)'};
                }
                ${CONFIG.selectors.orderItem}.${CONFIG.classNames.orderShipped} { opacity: 0.8 !important; border-left: 5px solid ${isDarkMode ? '#4caf50' : '#2e7d32'}; }
                .${CONFIG.classNames.pendingOverlay} { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: ${isDarkMode ? 'rgba(40, 40, 40, 0.7)' : 'rgba(255, 255, 255, 0.7)'}; z-index: 10; border-radius: 12px; backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; }
                .${CONFIG.classNames.pendingOverlayContent} { display: flex; flex-direction: column; align-items: center; gap: 10px; color: ${isDarkMode ? '#e0e0e0' : '#000'}; font-size: 16px; font-weight: bold; }
                .${CONFIG.classNames.processingIcon} { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background-color: #28a745; color: white; font-size: 24px; font-weight: bold; border-radius: 50%; }
                .${CONFIG.classNames.messageContainer} { margin-top: 8px; display: flex; gap: 5px; align-items: center; }
                .${CONFIG.classNames.cannedMessageSelect} {
                    flex-grow: 1; font-size: 13px; padding: 5px; border-radius: 6px;
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                    background-color: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    color: ${isDarkMode ? '#e0e0e0' : '#000'};
                }
                .${CONFIG.classNames.sendCannedMessageBtn} {
                    padding: 5px 12px; font-size: 13px; font-weight: bold;
                    color: #fff !important; background-color: ${isDarkMode ? '#3665f3' : '#0070d2'};
                    border: none; border-radius: 6px; cursor: pointer; text-decoration: none !important;
                }
                .${CONFIG.classNames.sendCannedMessageBtn}:hover {
                    background-color: ${isDarkMode ? '#5a82f5' : '#005fb8'};
                }
                .${CONFIG.classNames.addTrackingLink} {
                    display: inline-block; margin-left: 5px; padding: 2px 8px; border-radius: 12px;
                    font-size: 11px; font-weight: bold; text-decoration: none;
                    background-color: ${isDarkMode ? '#5a4b2c' : '#FFEFCF'}; color: ${isDarkMode ? '#FFD54F' : '#8C5A02'};
                    border: 1px solid ${isDarkMode ? '#7a6b4c' : '#E1C591'}; transition: all 0.2s ease;
                }
                .${CONFIG.classNames.addTrackingLink}:hover {
                    background-color: ${isDarkMode ? '#7a6b4c' : '#FDECB7'}; color: ${isDarkMode ? '#FFF' : '#8C5A02'};
                }
                .${CONFIG.classNames.addTrackingLink}.${CONFIG.classNames.trackingLinkSubmitted} {
                    pointer-events: none; opacity: 0.7; background-color: ${isDarkMode ? '#4a5943' : '#dff0d8'};
                    color: ${isDarkMode ? '#a5d6a7' : '#3c763d'}; border-color: ${isDarkMode ? '#5a7051' : '#d6e9c6'};
                }
                .${CONFIG.classNames.addNoteLink} {
                    display: inline-block; margin-left: 5px; padding: 2px 8px; border-radius: 12px;
                    font-size: 11px; font-weight: bold; text-decoration: none;
                    background-color: ${isDarkMode ? '#2C3B5E' : '#E6F0FF'}; color: ${isDarkMode ? '#99ccff' : '#3665f3'};
                    border: 1px solid ${isDarkMode ? '#4D6A9F' : '#B3D1FF'}; transition: all 0.2s ease;
                }
                .${CONFIG.classNames.addNoteLink}:hover {
                    background-color: ${isDarkMode ? '#4D6A9F' : '#D1E4FF'}; color: ${isDarkMode ? '#FFF' : '#3665f3'};
                }
                .${CONFIG.classNames.addNoteLink}.${CONFIG.classNames.noteLinkSubmitted} {
                    pointer-events: none; opacity: 0.7; background-color: ${isDarkMode ? '#4a5943' : '#dff0d8'};
                    color: ${isDarkMode ? '#a5d6a7' : '#3c763d'}; border-color: ${isDarkMode ? '#5a7051' : '#d6e9c6'};
                }
                .tracking-tooltip {
                    position: absolute; z-index: 10001; background-color: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'}; border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 12px;
                    display: flex; flex-direction: column; gap: 8px; width: 360px;
                }
                .tracking-tooltip-input {
                    padding: 6px 8px; border-radius: 4px; border: 1px solid ${isDarkMode ? '#777' : '#ccc'};
                    background-color: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'};
                    font-size: 16px; font-family: 'Courier New', Courier, monospace; letter-spacing: 2px;
                }
                .note-tooltip-input {
                    padding: 8px 10px; border-radius: 4px; border: 1px solid ${isDarkMode ? '#777' : '#ccc'};
                    background-color: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'};
                    font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    line-height: 1.4;
                }
                .note-canned-response {
                    margin-bottom: 5px;
                    width: 100%;
                    padding: 4px;
                    background-color: ${isDarkMode ? '#333' : '#fff'};
                    color: ${isDarkMode ? '#f0f0f0' : '#000'};
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                    border-radius: 4px;
                }
                .tracking-tooltip-submit {
                    align-self: flex-end; padding: 5px 10px; font-size: 13px; font-weight: bold;
                    color: #fff; background-color: ${isDarkMode ? '#3665f3' : '#0070d2'};
                    border: none; border-radius: 4px; cursor: pointer;
                }
                .tracking-tooltip-submit:hover {
                    background-color: ${isDarkMode ? '#5a82f5' : '#005fb8'};
                }
                .ship-tomorrow-label, .thank-you-label {
                    color: ${isDarkMode ? '#ccc' : '#333'};
                }
                .imageupload__option { margin-top: 10px !important; }
                .canned-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.6);
                    z-index: 10001;
                    display: flex; justify-content: center; align-items: center;
                }
                .canned-modal-content {
                    background: ${isDarkMode ? '#2a2a2a' : '#fff'};
                    padding: 20px;
                    border-radius: 8px;
                    width: 400px;
                    display: flex; flex-direction: column; gap: 15px;
                    border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                }
                .canned-modal-content h3 { margin: 0 0 10px; font-size: 18px; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                .canned-modal-input {
                    width: 100%; padding: 8px; border-radius: 4px;
                    border: 1px solid ${isDarkMode ? '#777' : '#ccc'};
                    background-color: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    color: ${isDarkMode ? '#e0e0e0' : '#000'};
                    box-sizing: border-box;
                }
                .canned-modal-buttons {
                    display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;
                }
                .canned-modal-button {
                    padding: 8px 15px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;
                }
                .canned-modal-button.primary {
                    background-color: ${isDarkMode ? '#3665f3' : '#0070d2'};
                    color: #fff;
                }
                .canned-modal-button.secondary {
                    background-color: ${isDarkMode ? '#555' : '#ccc'};
                    color: ${isDarkMode ? '#e0e0e0' : '#000'};
                }
            `;
        }

        function updateSkuPanelPosition() {
            const skuPanel = document.getElementById(CONFIG.ids.skuPanelContainer);
            const ordersContainer = document.querySelector(CONFIG.selectors.bulkLabelsAppCard);
            if (!skuPanel || !ordersContainer) return;
            const skuPanelWidth = skuPanel.offsetWidth;
            const ordersContainerLeft = ordersContainer.getBoundingClientRect().left;
            const gap = 20;
            const newLeft = ordersContainerLeft - skuPanelWidth - gap;
            skuPanel.style.left = `${Math.max(20, newLeft)}px`;
        }

        function injectRadicalStyles() {
            const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
            if (radicalStyleElement) radicalStyleElement.remove();
            radicalStyleElement = GM_addStyle(getRadicalStyles(isDarkMode));
        }

        function updateSkuPanelOnScroll() {
            const skuPanel = document.getElementById(CONFIG.ids.skuPanelContainer);
            const header = document.querySelector(CONFIG.selectors.header);
            if (!skuPanel || !header) return;

            const headerRect = header.getBoundingClientRect();
            if (headerRect.bottom < 0) {
                // Header is scrolled out of view
                skuPanel.style.top = '20px';
            } else {
                // Header is in view
                skuPanel.style.top = '110px';
            }
        }

        // Removed pickRandomOrder utility and shortcut listener

        function createImageZoomHandler(image) {
            const overlay = document.createElement('div');
            overlay.className = CONFIG.classNames.zoomOverlay;
            const container = document.createElement('div');
            container.className = CONFIG.classNames.zoomContainer;
            const zoomedImage = document.createElement('img');
            zoomedImage.className = CONFIG.classNames.zoomImage;
            zoomedImage.src = image.src;
            zoomedImage.style.width = `${image.naturalWidth * 3}px`;
            zoomedImage.style.height = `${image.naturalHeight * 3}px`;
            const closeButton = document.createElement('button');
            closeButton.className = CONFIG.classNames.zoomCloseButton;
            closeButton.textContent = '×';
            closeButton.onclick = () => overlay.remove();
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            container.append(zoomedImage, closeButton);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        }

        function updateNoteLink(orderId, status) {
            const noteLink = document.querySelector(`.${CONFIG.classNames.addNoteLink}[data-order-id="${orderId}"]`);
            if (noteLink) {
                if (status === 'success') {
                    noteLink.textContent = 'note ✅';
                } else {
                    noteLink.textContent = 'note ❌';
                    noteLink.style.backgroundColor = '#ffcccc'; // Error indication
                    noteLink.style.color = '#000';
                }
            }
        }

        // ===================================================================
        // SCRIPT MAIN LOGIC
        // ===================================================================

        // --- Page Initialization ---
        // Sets up the initial page layout, injects styles, and cleans up the original eBay UI.
        function initializePageLayout() {
            console.debug('[Tampermonkey][INIT] initializePageLayout() start');
            const skuPanelContainer = document.createElement('div');
            skuPanelContainer.id = CONFIG.ids.skuPanelContainer;
            document.body.appendChild(skuPanelContainer);
            injectRadicalStyles();
            const ebayLogo = document.querySelector(CONFIG.selectors.headerLogo);
            const topHeader = document.querySelector(CONFIG.selectors.headerTop);
            const bottomHeader = document.querySelector(CONFIG.selectors.headerBottom);
            if (ebayLogo && topHeader && bottomHeader) {
                bottomHeader.prepend(ebayLogo);
                topHeader.remove();
            }
            document.querySelector(CONFIG.selectors.headerBottomH1)?.remove();
            // Set custom page/browser title
            const customTitleText = 'Altheastix: Pick-and-Pack';
            try { document.title = customTitleText; } catch(e) {}
            document.querySelectorAll(CONFIG.selectors.removableNotices).forEach(e => e.remove());
            // Helper to remove unwanted buttons (Remove / Combine) from eBay's header button list
            const pruneButtonList = () => {
                document.querySelectorAll('ul.button-list').forEach(ul => {
                    ul.querySelectorAll('li > button, li > a > button').forEach(btn => {
                        const label = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                        if (label.startsWith('remove') || label === 'combine') {
                            btn.closest('li')?.remove();
                        }
                    });
                });
            };
            // Initial prune and continue pruning on DOM updates
            pruneButtonList();
            const ensureOrdersCombined = async (timeoutMs = 8000) => {
                const start = Date.now();
                let clicked = false;
                const isCombined = () => !!document.querySelector('.btn--undo-combine, .tag--combined');
                const tryClick = () => {
                    if (isCombined()) return true;
                    const btn = document.querySelector(CONFIG.selectors.combineOrdersButton) || Array.from(document.querySelectorAll('button,a')).find(el => /combine/i.test(el.textContent || ''));
                    if (btn) {
                        btn.click();
                        clicked = true;
                        return 'clicked';
                    }
                    return false;
                };
                while (Date.now() - start < timeoutMs) {
                    const res = tryClick();
                    if (res === true) return true;
                    if (res === 'clicked') {
                        await new Promise(r => setTimeout(r, 600));
                        if (isCombined()) return true;
                    } else {
                        await new Promise(r => setTimeout(r, 250));
                    }
                }
                return clicked;
            };

            new MutationObserver((mutations) => {
                mutations.forEach(m => {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType === 1) {
                            if (n.matches && n.matches(CONFIG.selectors.removableNotices)) n.remove();
                            // Re-apply pruning if button lists change
                            if (n.matches && n.matches('ul.button-list, ul.button-list *')) pruneButtonList();
                            // If service actions area appears, try to combine orders
                            if ((n.matches && n.matches(CONFIG.selectors.serviceActions)) || (n.closest && n.closest(CONFIG.selectors.serviceActions))) {
                                ensureOrdersCombined();
                            }
                        }
                    });
                });
            }).observe(document.body, { childList: true, subtree: true });
            document.querySelector('.button-list .edit')?.closest('li')?.remove();
            document.querySelector('.button-list .remove')?.closest('li')?.remove();
            document.querySelector('.button-list .combine')?.closest('li')?.remove();

            // New code to update header links
            const headerLinks = document.querySelector('.piped-links.header__links');
            if (headerLinks) {
                headerLinks.innerHTML = USER_CONFIG.headerLinks
                    .map(link => `<li><a href="${link.href}" target="_blank">${link.text}</a></li>`)
                    .join('');
            }

            // Reset auto-send toggle to OFF at start for safety (new location is in SKUs panel)
            try { GM_setValue(AUTO_SEND_MESSAGES_KEY, true); } catch(e) {}
            // Remove any legacy header toggle if one exists from previous versions
            document.querySelector('#auto-send-messages-toggle')?.closest('span')?.remove();
            // Attempt to combine orders before proceeding
            ensureOrdersCombined();
            if (USER_CONFIG.showMicaImage) {
                const micaImg = document.createElement('img');
                micaImg.src = 'https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/mica.png';
                micaImg.style.cssText = 'position:fixed;top:0;left:0;max-height:100px;width:auto;z-index:1001;cursor:pointer;transition:opacity 0.15s;';
                micaImg.addEventListener('mouseenter', () => { micaImg.style.opacity = '0.85'; });
                micaImg.addEventListener('mouseleave', () => { micaImg.style.opacity = '1'; });
                micaImg.addEventListener('click', () => {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10002;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.25s ease;';
                    const enlarged = document.createElement('img');
                    enlarged.src = micaImg.src;
                    enlarged.style.cssText = `width:${micaImg.naturalWidth * 4}px;height:${micaImg.naturalHeight * 4}px;max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.6);transform:scale(0.88);transition:transform 0.25s ease,opacity 0.25s ease;opacity:0;`;
                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = '✕';
                    closeBtn.style.cssText = 'position:fixed;top:20px;right:24px;background:none;border:none;color:rgba(255,255,255,0.7);font-size:28px;cursor:pointer;line-height:1;padding:4px 8px;transition:color 0.15s;';
                    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = '#fff'; });
                    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = 'rgba(255,255,255,0.7)'; });
                    const close = () => {
                        overlay.style.opacity = '0';
                        enlarged.style.opacity = '0';
                        enlarged.style.transform = 'scale(0.88)';
                        setTimeout(() => overlay.remove(), 250);
                    };
                    closeBtn.addEventListener('click', close);
                    overlay.addEventListener('click', close);
                    enlarged.addEventListener('click', (e) => e.stopPropagation());
                    document.addEventListener('keydown', function escHandler(e) {
                        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
                    });
                    overlay.append(enlarged, closeBtn);
                    document.body.appendChild(overlay);
                    // Trigger fade+scale in on next frame so the transition fires
                    requestAnimationFrame(() => {
                        overlay.style.opacity = '1';
                        enlarged.style.opacity = '1';
                        enlarged.style.transform = 'scale(1)';
                    });
                });
                document.body.appendChild(micaImg);
            }
            console.debug('[Tampermonkey][INIT] Header & base layout adjustments complete');
        }

        // --- Order Card Processing ---
        // This function iterates over each order card on the page, redesigning it,
        // extracting data, and adding new UI elements like action buttons and info blocks.
        function processOrderCard(orderItem, index) {
            console.debug(`[Tampermonkey][ORDERS] Processing order card index=${index}`);
            orderItem.id = `order-item-${index}`;
            const tcellItem = orderItem.querySelector(CONFIG.selectors.tcellItem);
            if (!tcellItem) {
                console.warn(`[Tampermonkey] Skipping incomplete order card at index ${index}.`);
                return;
            }
            orderItem.querySelector('.btn--undo-combine')?.remove();
            const orderIdLinks = orderItem.querySelectorAll('.unique_order_id_container a[href*="orderId"]');
            const orderIdsArray = Array.from(orderIdLinks).map(link => new URLSearchParams(link.href).get('orderId') || link.innerText.trim()).filter(id => id);
            const allOrderIds = orderIdsArray.join(',');
            if (allOrderIds) orderItem.dataset.orderId = allOrderIds;

            if (orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`)?.innerText.includes('Canada')) {
                orderItem.dataset.isCanadian = 'true';
                orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`).innerHTML = orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`).innerHTML.replace(/Canada/g, '<b><span style="color: red;">Canada</span></b>');
            }

            // --- Address integrity check ---
            // Validates the structural soundness of domestic shipping addresses and
            // injects a ⚠ icon with a hover tooltip listing any issues found.
            {
                const addrEl = orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`);
                if (addrEl) {
                    const addrLines = addrEl.innerText.split('\n').map(l => l.trim()).filter(l => l);
                    const addrWarnings = validateAddress(addrLines);
                    const fullnameEl = orderItem.querySelector(`.${CONFIG.classNames.addressFullname}`);
                    const badgeInsert = el => {
                        if (!fullnameEl) { addrEl.prepend(el); return; }
                        const br = fullnameEl.querySelector('br');
                        br ? fullnameEl.insertBefore(el, br) : fullnameEl.appendChild(el);
                    };
                    if (addrWarnings.length > 0) {
                        const tooltipItems = addrWarnings.map(w => `• ${w}`).join('<br>');
                        const badge = document.createElement('span');
                        badge.className = CONFIG.classNames.addrWarningBadge;
                        badge.innerHTML = `⚠<span class="${CONFIG.classNames.addrWarningTooltip}">${tooltipItems}</span>`;
                        badgeInsert(badge);
                    } else {
                        const badge = document.createElement('span');
                        badge.className = CONFIG.classNames.addrOkBadge;
                        badge.innerHTML = `✔<span class="${CONFIG.classNames.addrOkTooltip}">Address looks correct</span>`;
                        badgeInsert(badge);
                    }
                }
            }

            orderItem.querySelectorAll(`${CONFIG.selectors.itemDescription} a[href*="&item="]`).forEach(itemLink => {
                const itemIDMatch = itemLink.href.match(/&item=(\d+)/);
                if (itemIDMatch?.[1]) {
                    const h2 = itemLink.closest(CONFIG.selectors.itemDescription)?.querySelector('h2');
                    if (h2) h2.insertAdjacentHTML('beforeend', ` <a href="${CONFIG.urls.revisePrefix}${itemIDMatch[1]}" target="_blank" class="${CONFIG.classNames.reviseLink}">revise</a>`);
                }
            });

            const orderIdContainer = orderItem.querySelector(CONFIG.selectors.orderIdContainer);
            const transactionCell = orderItem.querySelector(CONFIG.selectors.tcellTransaction);
            if (orderIdContainer && transactionCell) {
                let totalItemsPrice = 0;
                orderItem.querySelectorAll('.item').forEach(itemElement => {
                    const detailsList = itemElement.querySelector(CONFIG.selectors.itemDetailsContainer);
                    if (detailsList) {
                        let qty = 1;
                        const qtyLi = Array.from(detailsList.querySelectorAll('li')).find(li => /^(Quantity|Qty):/i.test(li.innerText.trim()));
                        if (qtyLi) {
                            const m = qtyLi.innerText.match(/^(?:Quantity|Qty):\s*(\d+)/i);
                            if (m) qty = parseInt(m[1], 10) || 1;
                        }

                        const priceLi = Array.from(detailsList.querySelectorAll('li')).find(li => li.innerText.trim().startsWith("Item price:") || li.innerText.trim().startsWith("Sold for:"));
                        if (priceLi) {
                            const priceMatch = priceLi.innerText.match(/\$(\d+\.\d{2})/);
                            if (priceMatch?.[1]) totalItemsPrice += parseFloat(priceMatch[1]);
                        }
                    }
                });

                if (totalItemsPrice > USER_CONFIG.trackingOrderAmountThreshold) {
                    orderIdLinks.forEach(link => {
                        const orderId = new URLSearchParams(link.href).get('orderId') || link.innerText.trim();
                        if (!link.nextElementSibling || !link.nextElementSibling.classList.contains(CONFIG.classNames.addTrackingLink)) {
                            const actionType = USER_CONFIG.useAlternativeTracking ? 'track-v2' : 'track-v1';
                            link.insertAdjacentHTML('afterend', `<a href="#" class="${CONFIG.classNames.addTrackingLink}" data-action="${actionType}" data-order-id="${orderId}">+tracking</a>`);
                        }
                    });
                }

                orderIdLinks.forEach(link => {
                    const orderId = new URLSearchParams(link.href).get('orderId') || link.innerText.trim();
                    const noteLink = `<a href="#" class="${CONFIG.classNames.addNoteLink}" data-order-id="${orderId}">+note</a>`;
                    const trackingLink = link.nextElementSibling;

                    if (trackingLink && trackingLink.classList.contains(CONFIG.classNames.addTrackingLink)) {
                        // If tracking link exists, insert note link after it
                        trackingLink.insertAdjacentHTML('afterend', noteLink);
                    } else {
                        // Otherwise, insert note link after the order ID link
                        link.insertAdjacentHTML('afterend', noteLink);
                    }
                });

                const infoBlock = document.createElement('div');
                infoBlock.className = CONFIG.classNames.shippingInfoBlock;
                const totalHTML = totalItemsPrice > USER_CONFIG.trackingOrderAmountThreshold
                    ? `<strong style="color: #ffffffff; background: #21352478; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Total: $${totalItemsPrice.toFixed(2)}</strong>`
                    : `<strong>Total: $${totalItemsPrice.toFixed(2)}</strong>`;
                const expectedByText = transactionCell.querySelector('p:first-child')?.innerText.trim() || '';
                let shippingText = 'Free Shipping';
                if (transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim() && !transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim().includes("$0.00")) {
                    const shippingCostMatch = transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim().match(/\$\d+\.\d{2}/);
                    if (shippingCostMatch) shippingText = `Shipping: <span style="font-weight: bold; color: red;">${shippingCostMatch[0]}</span>`;
                }
                if (orderItem.dataset.isCanadian === 'true') shippingText += ' 🇨🇦';
                infoBlock.innerHTML = `<p>${orderIdContainer.innerHTML} │ ${totalHTML} │ ${expectedByText} │ ${shippingText}</p>`;
                tcellItem.insertBefore(infoBlock, tcellItem.firstChild);
                transactionCell.style.display = 'none';
            }

            let hasManila = false, hasLg = false, skuCount = 0;
            orderItem.querySelectorAll(`${CONFIG.selectors.itemDetailsContainer} li`).forEach(li => {
                const text = li.innerText;
                if (/^(Quantity|Qty):\s*/i.test(text) && parseInt(text.replace(/^(?:Quantity|Qty):\s*/i, '')) > 1) li.classList.add(CONFIG.classNames.quantityMulti);
                if (text.startsWith("SKU: ")) {
                    skuCount++;
                    if (text.toLowerCase().includes('manila')) hasManila = true;
                    else if (text.toLowerCase().includes('lg')) hasLg = true;
                }
            });
            if (hasManila) orderItem.classList.add(CONFIG.classNames.highlightManila, CONFIG.classNames.borderManila);
            else if (hasLg) orderItem.classList.add(CONFIG.classNames.highlightLg, CONFIG.classNames.borderLg);
            else if (skuCount > 1) orderItem.classList.add(CONFIG.classNames.highlightMultiItem);

            const addressActions = orderItem.querySelector(CONFIG.selectors.addressActions);
            if (addressActions) {
                addressActions.innerHTML = `<button type="button" class="fake-link ${CONFIG.classNames.editAddressBtn}" id="${CONFIG.ids.editAddressButton}${index}">Edit</button>&nbsp;&nbsp;<button type="button" class="fake-link ${CONFIG.classNames.copyAddressBtn}" id="${CONFIG.ids.copyAddressButton}${index}">Copy</button>`;
                const shipButton = document.createElement('button');
                shipButton.type = 'button';
                shipButton.className = CONFIG.classNames.markAsShippedBtn;
                shipButton.dataset.orderId = allOrderIds;
                shipButton.textContent = 'Mark as Shipped';
                shipButton.setAttribute('data-order-item-id', orderItem.id);
                const firstOrderId = allOrderIds.split(',')[0];

                const shipTomorrowContainer = document.createElement('div');
                shipTomorrowContainer.style.cssText = 'margin-top: 8px; text-align: left;';
                const shipTomorrowCheckboxId = `ship-tomorrow-checkbox-${index}`;
                shipTomorrowContainer.innerHTML = `
                    <input type="checkbox" id="${shipTomorrowCheckboxId}" class="ship-tomorrow-checkbox" style="vertical-align: middle;">
                    <label for="${shipTomorrowCheckboxId}" class="ship-tomorrow-label" style="vertical-align: middle; font-size: 12px;">+ "Will ship tomorrow" note</label>
                `;

                const thankYouMsgContainer = document.createElement('div');
                thankYouMsgContainer.style.cssText = 'margin-top: 4px; text-align: left;';
                const thankYouCheckboxId = `thank-you-checkbox-${index}`;
                thankYouMsgContainer.innerHTML = `
                    <input type="checkbox" id="${thankYouCheckboxId}" class="thank-you-checkbox" style="vertical-align: middle;">
                    <label for="${thankYouCheckboxId}" class="thank-you-label" style="vertical-align: middle; font-size: 12px;">+ thank you msg</label>
                `;

                const messageContainer = document.createElement('div');
                messageContainer.className = CONFIG.classNames.messageContainer;

                const messageSelect = document.createElement('select');
                messageSelect.className = CONFIG.classNames.cannedMessageSelect;
                messageSelect.innerHTML = `
                    <option value="empty">Empty Message</option>
                    <option value="canned1">Late + Gift</option>
                    <option value="canned3">Late, no gift</option>
                    <option value="canned4">Preorder Sticker</option>
                `;

                const sendMessageButton = document.createElement('button');
                sendMessageButton.type = 'button';
                sendMessageButton.className = CONFIG.classNames.sendCannedMessageBtn;
                sendMessageButton.dataset.orderId = firstOrderId;
                sendMessageButton.textContent = 'Message';

                messageContainer.append(messageSelect, sendMessageButton);
                addressActions.after(messageContainer, shipButton, shipTomorrowContainer, thankYouMsgContainer);
            }
            const printButton = document.createElement('button');
            printButton.id = `${CONFIG.ids.createTemplateButton}${index}`;
            printButton.className = CONFIG.classNames.printEnvelopeBtn;
            printButton.textContent = "Print Envelope";
            tcellItem.appendChild(printButton);
            orderItem.style.opacity = '1';
        }

        // --- Envelope Printing Helper ---
        // Collects addresses from order cards and opens a single print window with all envelopes.
        function printEnvelopes(orderCards) {
            const envelopeHTMLs = [];
            orderCards.forEach(orderItem => {
                const addressEl = orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`);
                if (!addressEl) return;
                const addrBadges = addressEl.querySelectorAll(`.${CONFIG.classNames.addrWarningBadge}, .${CONFIG.classNames.addrOkBadge}`);
                addrBadges.forEach(b => b.style.display = 'none');
                const addressHTML = addressEl.innerText.replaceAll("\n", "<br>");
                addrBadges.forEach(b => b.style.display = '');
                const isCanadian = orderItem.dataset.isCanadian === 'true'
                    || /canada/i.test(addressEl.innerText);
                // Stamp reminder: sized to fit under a standard USPS international stamp (~1.25in × 1.5in)
                const stampReminder = isCanadian
                    ? `<div style="position:absolute;top:40px;right:0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:5px 6px;border:1px dashed rgba(0,0,0,0.18);border-radius:2px;text-align:center;font-family:Arial;box-sizing:border-box;opacity:0.35;"><span style="font-size:22px;line-height:1;">🇨🇦</span><span style="font-size:10px;font-weight:bold;color:#444;line-height:1.2;white-space:nowrap;">Int'l Stamp</span></div>`
                    : '';
                envelopeHTMLs.push(`<div class="envelope" style="position:relative;">${stampReminder}<table style="font-family: Arial; width: 100%; height: 100%; border-collapse: collapse;"><tr style="vertical-align: top;"><td style="width: 100%; padding: 0; font-size: 14px;">${USER_CONFIG.returnAddress}</td></tr><tr style="height: 10%;"><td></td></tr><tr style="vertical-align: top;"><td style="text-align: left; padding-left: 20%; font-size: 24px;">${addressHTML}</td></tr><tr style="height: 30%;"><td></td></tr></table></div>`);
            });
            if (envelopeHTMLs.length === 0) return;
            const printwin = window.open("", "_blank");
            printwin.document.write(`<html><head><style>@page { size: 8.93in x 3.878in; margin: 0; } html, body { margin: 0; padding: 0; } .envelope { width: 8.93in; height: 3.878in; padding: 10px; font-family: Arial; box-sizing: border-box; overflow: hidden; } .envelope + .envelope { break-before: page; }</style></head><body>` + envelopeHTMLs.join('') + '</body></html>');
            printwin.document.close();
            printwin.focus();
            printwin.print();
            printwin.close();
        }

        // --- Global Event Listeners ---
        // A single, delegated event listener on the main orders container.
        // It handles clicks for all custom actions like 'Copy Address', 'Add Note', 'Mark as Shipped', etc.
        function setupGlobalEventListeners(skuManager) {
            const ordersContainerForEvents = document.querySelector(CONFIG.selectors.ordersContainer);
            if (!ordersContainerForEvents) return;

            ordersContainerForEvents.addEventListener('mouseover', (event) => {
                const orderItem = event.target.closest(CONFIG.selectors.orderItem);
                if (orderItem) {
                    document.querySelectorAll(`#${CONFIG.ids.skuList} .${CONFIG.classNames.skuItem}[data-order-item-id="${orderItem.id}"]`).forEach(sku => sku.classList.add('sku-highlight-hover'));
                }
            });
            ordersContainerForEvents.addEventListener('mouseout', () => {
                document.querySelectorAll(`#${CONFIG.ids.skuList} .sku-highlight-hover`).forEach(sku => sku.classList.remove('sku-highlight-hover'));
            });

            ordersContainerForEvents.addEventListener('click', async function(event) {
                const target = event.target;
                const orderItemElement = target.closest(CONFIG.selectors.orderItem);
                if (target.classList.contains(CONFIG.classNames.addNoteLink)) {
                    event.preventDefault(); event.stopPropagation();
                    const orderId = target.dataset.orderId;
                    document.querySelector('.tracking-tooltip')?.remove();
                    const tooltip = document.createElement('div');
                    tooltip.className = 'tracking-tooltip';
                    tooltip.innerHTML = `
                        <label for="note-input-${orderId}" style="font-size: 12px; font-weight: bold;">Note for order ${orderId}:</label>
                        <select class="note-canned-response">
                            <option value="">Select a canned response...</option>
                            <option value="ship-tomorrow">Will ship tomorrow</option>
                            <option value="pending-restock">Pending restock</option>
                        </select>
                        <textarea id="note-input-${orderId}" class="note-tooltip-input" style="height: 80px; resize: vertical;" placeholder="this is a text"></textarea>
                        <button type="button" class="tracking-tooltip-submit" data-order-id="${orderId}">Submit</button>
                    `;
                    document.body.appendChild(tooltip);
                    const noteInput = tooltip.querySelector('.note-tooltip-input');
                    const cannedResponseSelect = tooltip.querySelector('.note-canned-response');

                    // Pre-populate with "Will ship tomorrow" note by default (Sunday -> Monday)
                    const tomorrow = computeNextShipDateSkippingSunday(1);
                    const options = { weekday: 'long', month: 'short', day: 'numeric' };
                    const formattedDate = tomorrow.toLocaleDateString('en-US', options);
                    noteInput.value = `Will be shipped on ${formattedDate}`;

                    cannedResponseSelect.addEventListener('change', (e) => {
                        if (e.target.value === 'ship-tomorrow') {
                            const tomorrow = computeNextShipDateSkippingSunday(1);
                            const options = { weekday: 'long', month: 'short', day: 'numeric' };
                            const formattedDate = tomorrow.toLocaleDateString('en-US', options);
                            noteInput.value = `Will be shipped on ${formattedDate}`;
                        } else if (e.target.value === 'pending-restock') {
                            const today = new Date();
                            const options = { weekday: 'long', month: 'short', day: 'numeric' };
                            const formattedDate = today.toLocaleDateString('en-US', options);
                            noteInput.value = `Not shipped on ${formattedDate}. Pending restock`;
                        }
                    });

                    noteInput.focus({ preventScroll: true });
                    const rect = target.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + window.scrollX}px`;
                    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
                    const closeTooltipHandler = (e) => {
                        if (!tooltip.contains(e.target)) {
                            tooltip.remove();
                            document.removeEventListener('click', closeTooltipHandler, true);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeTooltipHandler, true), 0);
                    tooltip.querySelector('.tracking-tooltip-submit').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const noteText = noteInput.value.trim();
                        if (noteText) {
                            await GM_setValue(NOTE_ADD_KEY, { orderId: orderId, note: noteText });
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=add_note`, { active: false });
                            target.textContent = 'note ✅';
                        }
                        tooltip.remove();
                        document.removeEventListener('click', closeTooltipHandler, true);
                    });
                    tooltip.addEventListener('click', e => e.stopPropagation());
                    return;
                }
                if (target.classList.contains(CONFIG.classNames.addTrackingLink) && !target.classList.contains(CONFIG.classNames.trackingLinkSubmitted)) {
                    event.preventDefault(); event.stopPropagation();
                    const orderId = target.dataset.orderId;
                    const action = target.dataset.action;
                    document.querySelector('.tracking-tooltip')?.remove();
                    const tooltip = document.createElement('div');
                    tooltip.className = 'tracking-tooltip';
                    tooltip.innerHTML = `
                        <label for="tracking-input-${orderId}" style="font-size: 12px; font-weight: bold;">Tracking for order ${orderId}:</label>
                        <input type="text" id="tracking-input-${orderId}" class="tracking-tooltip-input" placeholder="XXXX XXXX XXXX XXXX XXXX XX" value="${USER_CONFIG.defaultTrackingNumber}">
                        <button type="button" class="tracking-tooltip-submit" data-order-id="${orderId}">Submit</button>
                    `;
                    document.body.appendChild(tooltip);
                    const trackingInput = tooltip.querySelector('.tracking-tooltip-input');
                    trackingInput.addEventListener('focus', () => setTimeout(() => { trackingInput.selectionStart = trackingInput.selectionEnd = trackingInput.value.length; }, 0));
                    trackingInput.addEventListener('input', (e) => {
                        const input = e.target;
                        let value = input.value.replace(/\D/g, '').substring(0, 22);
                        input.value = value.match(/.{1,4}/g)?.join(' ') || '';
                    });
                    trackingInput.focus({ preventScroll: true });
                    trackingInput.addEventListener('keydown', e => e.key === 'Enter' && (e.preventDefault(), tooltip.querySelector('.tracking-tooltip-submit').click()));
                    const rect = target.getBoundingClientRect();
                    tooltip.style.left = `${rect.left + window.scrollX}px`;
                    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
                    const closeTooltipHandler = (e) => {
                        if (!tooltip.contains(e.target)) {
                            tooltip.remove();
                            document.removeEventListener('click', closeTooltipHandler, true);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeTooltipHandler, true), 0);
                    tooltip.querySelector('.tracking-tooltip-submit').addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const trackingNumberClean = tooltip.querySelector('.tracking-tooltip-input').value.replace(/\s/g, '');
                        if (trackingNumberClean.length !== 22) {
                            alert('Tracking number must be exactly 22 digits.');
                            return;
                        }
                        if (target) {
                            target.textContent = 'track ✅';
                            target.classList.add(CONFIG.classNames.trackingLinkSubmitted);
                        }
                        if (action === 'track-v2') {
                            await GM_setValue(TRACKING_ADD_KEY_V2, { orderId: orderId, trackingNumber: trackingNumberClean });
                            GM_openInTab(`https://www.ebay.com/ship/tr/update?orders=${orderId}`, { active: true });
                        } else {
                            await GM_setValue(TRACKING_ADD_KEY, { orderId: orderId, trackingNumber: trackingNumberClean, timestamp: Date.now() });
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=track`, { active: true });
                        }
                        tooltip.remove();
                        document.removeEventListener('click', closeTooltipHandler, true);
                    });
                    tooltip.addEventListener('click', e => e.stopPropagation());
                    return;
                }
                if (target.classList.contains(CONFIG.classNames.markAsShippedBtn)) {
                    event.preventDefault();
                    const orderIdString = target.dataset.orderId;
                    if (orderIdString && orderItemElement) {
                        const shipTomorrowCheckbox = orderItemElement.querySelector('.ship-tomorrow-checkbox');
                        const thankYouCheckbox = orderItemElement.querySelector('.thank-you-checkbox');
                        const firstOrderId = orderIdString.split(',')[0];

                        if (shipTomorrowCheckbox && shipTomorrowCheckbox.checked) {
                            const tomorrow = computeNextShipDateSkippingSunday(1);
                            const options = { weekday: 'long', month: 'short', day: 'numeric' };
                            const formattedDate = tomorrow.toLocaleDateString('en-US', options);
                            const noteText = `Will be shipped on ${formattedDate}`;

                            await GM_setValue(NOTE_ADD_KEY, { orderId: firstOrderId, note: noteText });
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}&tm_action=add_note`, { active: false });

                            const noteLink = orderItemElement.querySelector(`.${CONFIG.classNames.addNoteLink}[data-order-id="${firstOrderId}"]`);
                            if (noteLink) {
                                noteLink.textContent = 'note ✅';
                            }
                        }

                        if (thankYouCheckbox && thankYouCheckbox.checked) {
                            let shipmentDate = new Date();
                            if (shipTomorrowCheckbox && shipTomorrowCheckbox.checked) {
                                shipmentDate = computeNextShipDateSkippingSunday(1);
                            }
                            const options = { weekday: 'long', month: 'short', day: 'numeric' };
                            const isToday = (new Date()).toDateString() === shipmentDate.toDateString();
                            const formattedShipmentDate = `${isToday ? 'today, ' : ''}${shipmentDate.toLocaleDateString('en-US', options)}`;
                            // Extract buyer name for personalization
                            const fullNameEl = orderItemElement.querySelector('.print__address__fullname');
                            const buyerName = (fullNameEl?.textContent || '').trim();
                            const buyerFirst = buyerName.split(/\s+/)[0] || 'there';
                            // Determine total item quantity and content type (sticker, magnet, or mixed)
                            let totalItemQty = 0;
                            let totalItemsPrice = 0;
                            let containsSticker = false;
                            let containsMagnet = false;

                            orderItemElement.querySelectorAll('.item').forEach(itemEl => {
                                let qty = 1;
                                const detailsList = itemEl.querySelector('[class*="item__details"]');
                                if (detailsList) {
                                    const qtyLi = Array.from(detailsList.querySelectorAll('li')).find(li => li.innerText.trim().startsWith('Quantity:'));
                                    if (qtyLi) {
                                        const m = qtyLi.innerText.match(/Quantity:\s*(\d+)/);
                                        if (m) qty = parseInt(m[1], 10) || 1;
                                    }
                                    const priceLi = Array.from(detailsList.querySelectorAll('li')).find(li => li.innerText.trim().startsWith('Item price:') || li.innerText.trim().startsWith('Sold for:'));
                                    if (priceLi) {
                                        const pm = priceLi.innerText.match(/\$(\d+\.\d{2})/);
                                        if (pm?.[1]) totalItemsPrice += parseFloat(pm[1]) * qty;
                                    }
                                }
                                totalItemQty += qty;

                                const itemTitle = itemEl.querySelector('.item__description h2 a')?.textContent.toLowerCase() || '';
                                if (itemTitle.includes('sticker')) {
                                    containsSticker = true;
                                }
                                if (itemTitle.includes('magnet')) {
                                    containsMagnet = true;
                                }
                            });

                            const plural = totalItemQty !== 1;
                            let productWord = 'goodies'; // Default for mixed orders
                            if (containsSticker && !containsMagnet) {
                                productWord = plural ? 'stickers' : 'sticker';
                            } else if (containsMagnet && !containsSticker) {
                                productWord = plural ? 'magnets' : 'magnet';
                            }
                            const pronounSubj = plural ? 'they' : 'it';
                            const pronounObj = plural ? 'them' : 'it';
                            const demonstrative = plural ? 'these' : 'this';
                            // Determine if destination is Canada to adjust delivery note (needs plural computed)
                            const isCanadianDest = orderItemElement.dataset.isCanadian === 'true' || /canada/i.test(orderItemElement.querySelector(`.${CONFIG.classNames.addressContainer}`)?.textContent || '');
                            const dn = CONFIG.deliveryNotes;
                            const deliveryNote = isCanadianDest
                                ? dn.canada
                                : `${plural ? dn.usualPlural : dn.usualSingular}, ${dn.patienceVariants[Math.floor(Math.random() * dn.patienceVariants.length)]}`;
                            // Dynamic tracking note based on order total value vs threshold
                            const threshold = USER_CONFIG.trackingOrderAmountThreshold || 20;
                            const trackingNote = totalItemsPrice > threshold
                                ? ''
                                : `To keep prices fair, orders at or under $${threshold} ship without tracking.`;
                            const templates = CONFIG.messageTemplates?.thankYouDrafts || [];
                            const template = templates[Math.floor(Math.random() * templates.length)] || 'Hello {BUYER_FIRST}, thanks for your order! We will ship it on {SHIP_DATE}.';
                            const messageText = applyTemplate(template, {
                                BUYER_NAME: buyerName,
                                BUYER_FIRST: buyerFirst,
                                SHIP_DATE: formattedShipmentDate,
                                STICKER_WORD: productWord,
                                PRONOUN_SUBJ: pronounSubj,
                                PRONOUN_OBJ: pronounObj,
                                DEMONSTRATIVE: demonstrative,
                                DELIVERY_NOTE: deliveryNote,
                                TRACKING_NOTE: trackingNote
                            });
                            // Smooth out awkward phrasing like "on today, Friday Oct 10" -> "today, Friday Oct 10"
                            // Append a random musician quote at the very end (controlled by USER_CONFIG.enableQuotesInMessages)
                            const quotesEnabled = USER_CONFIG.enableQuotesInMessages !== false;
                            let chosenQuote = '';
                            if (quotesEnabled) {
                                const allSKUsText = Array.from(orderItemElement.querySelectorAll('.item .item__description h2 a')).map(a => a.textContent.toLowerCase()).join(' ');
                                const quoteKeywords = CONFIG.quoteKeywords || {};
                                const quotes = CONFIG.quotes || {};
                                let matchedGroup = null;

                                for (const group in quoteKeywords) {
                                    if (quoteKeywords[group].some(keyword => allSKUsText.includes(keyword.toLowerCase()))) {
                                        matchedGroup = group;
                                        break;
                                    }
                                }

                                if (matchedGroup && quotes[matchedGroup] && quotes[matchedGroup].length > 0) {
                                    const groupQuotes = quotes[matchedGroup];
                                    chosenQuote = groupQuotes[Math.floor(Math.random() * groupQuotes.length)];
                                } else {
                                    const allQuotes = Object.values(quotes).flat();
                                    if (allQuotes.length > 0) {
                                        chosenQuote = allQuotes[Math.floor(Math.random() * allQuotes.length)];
                                    }
                                }
                            }
                            const finalMessageText = (messageText + (chosenQuote ? `\n\n***\n\n${chosenQuote}` : ''))
                                .replace(/\bon\s+today\b(?=[^\w]|$)/gi, 'today')
                                // Collapse any leftover blank lines from an empty {TRACKING_NOTE}
                                .replace(/\n{3,}/g, '\n\n');
                            await GM_setValue('ebay_message_to_send', { orderId: firstOrderId, message: finalMessageText });
                            // Open the message tab in the foreground so paste/auto-send runs with focus
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}&tm_action=auto_message`, { active: true });
                        }

                        const orderIds = orderIdString.split(',');
                        const overlay = document.createElement('div');
                        overlay.className = CONFIG.classNames.pendingOverlay;
                        overlay.innerHTML = `<div class="${CONFIG.classNames.pendingOverlayContent}"><div class="${CONFIG.classNames.processingIcon}">✔</div><span id="overlay-text"></span></div>`;
                        const undoBtn = document.createElement('button');
                        undoBtn.textContent = 'Undo';
                        undoBtn.style.cssText = 'margin-top:8px;padding:3px 10px;font-size:12px;border-radius:4px;background:#f5f5f5;color:#666;border:1px solid #ddd;cursor:pointer;font-weight:normal;opacity:0.7;';
                        undoBtn.onclick = (e) => {
                            e.stopPropagation();
                            overlay.remove();
                            target.textContent = 'Mark as Shipped';
                            target.disabled = false;
                            target.classList.remove(CONFIG.classNames.markAsShippedWaiting);
                        };
                        overlay.firstChild.appendChild(undoBtn);
                        orderItemElement.appendChild(overlay);
                        const textElement = overlay.querySelector('#overlay-text');
                        target.textContent = 'Requested...';
                        target.disabled = true;
                        target.classList.add(CONFIG.classNames.markAsShippedWaiting);
                        for (let i = 0; i < orderIds.length; i++) {
                            textElement.textContent = `Opening tab ${i + 1} of ${orderIds.length}...`;
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderIds[i]}&tm_action=ship`, { active: false, setParent: true });
                            if (i < orderIds.length - 1) await new Promise(resolve => setTimeout(resolve, CONFIG.timing.sequentialTabDelay));
                        }
                        textElement.textContent = 'Marked as Shipped';
                    }
                    return;
                }
                if (target.classList.contains(CONFIG.classNames.sendCannedMessageBtn)) {
                    event.preventDefault();
                    const orderId = target.dataset.orderId;
                    const messageSelect = target.closest(`.${CONFIG.classNames.messageContainer}`).querySelector(`.${CONFIG.classNames.cannedMessageSelect}`);
                    const selectedMessageKey = messageSelect.value;

                    if (selectedMessageKey === 'canned1' || selectedMessageKey === 'canned3' || selectedMessageKey === 'canned4') {
                        const isGift = selectedMessageKey === 'canned1';
                        const isPreorder = selectedMessageKey === 'canned4';
                        const modalOverlay = document.createElement('div');
                        modalOverlay.className = 'canned-modal-overlay';

                        const modalContent = document.createElement('div');
                        modalContent.className = 'canned-modal-content';

                        let surpriseStickerInput = '';
                        if (isGift) {
                            surpriseStickerInput = '<input type="text" id="surprise-sticker" class="canned-modal-input" placeholder="Surprise Sticker Name">';
                        }

                        if (isPreorder) {
                            modalContent.innerHTML = `
                                <h3>Customize "Preorder Sticker" Message</h3>
                                <input type="text" id="sticker-name" class="canned-modal-input" placeholder="Sticker Name">
                                <input type="text" id="shipping-date" class="canned-modal-input" placeholder="Shipping Date">
                                <div class="canned-modal-buttons">
                                    <button class="canned-modal-button secondary" id="cancel-canned">Cancel</button>
                                    <button class="canned-modal-button primary" id="generate-canned">Generate Message</button>
                                </div>
                            `;
                        } else {
                            modalContent.innerHTML = `
                                <h3>Customize "${isGift ? 'Late + Gift' : 'Late, no gift'}" Message</h3>
                                <input type="text" id="sticker-name" class="canned-modal-input" placeholder="Sticker Name">
                                <input type="text" id="arrival-date" class="canned-modal-input" placeholder="Expected Arrival Date">
                                ${surpriseStickerInput}
                                <div class="canned-modal-buttons">
                                    <button class="canned-modal-button secondary" id="cancel-canned">Cancel</button>
                                    <button class="canned-modal-button primary" id="generate-canned">Generate Message</button>
                                </div>
                            `;
                        }

                        modalOverlay.appendChild(modalContent);
                        document.body.appendChild(modalOverlay);

                        document.getElementById('cancel-canned').addEventListener('click', () => {
                            modalOverlay.remove();
                        });

                        document.getElementById('generate-canned').addEventListener('click', async () => {
                            const stickerName = document.getElementById('sticker-name').value;
                            const arrivalDate = !isPreorder ? document.getElementById('arrival-date').value : '';
                            const shippingDate = isPreorder ? document.getElementById('shipping-date').value : '';
                            const surpriseSticker = isGift ? document.getElementById('surprise-sticker').value : '';

                            let template = CONFIG.manualMessageDrafts[selectedMessageKey] || '';

                            const orderItemElement = target.closest(CONFIG.selectors.orderItem);
                            const fullNameEl = orderItemElement.querySelector('.print__address__fullname');
                            const buyerName = (fullNameEl?.textContent || '').trim();
                            const buyerFirst = buyerName.split(/\s+/)[0] || 'there';

                            let messageText = applyTemplate(template, {
                                BUYER_FIRST: buyerFirst,
                                STICKER_NAME: stickerName,
                                ARRIVAL_DATE: arrivalDate,
                                SHIPPING_DATE: shippingDate,
                                SURPRISE_STICKER: surpriseSticker
                            });

                            await GM_setValue('ebay_manual_message_to_send', { orderId: orderId, message: messageText });
                            GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=manual_message`, { active: true });

                            modalOverlay.remove();
                        });

                    } else {
                        let messageText = '';
                        if (selectedMessageKey !== 'empty') {
                            const template = CONFIG.manualMessageDrafts[selectedMessageKey] || '';
                            if (template) {
                                const orderItemElement = target.closest(CONFIG.selectors.orderItem);
                                const fullNameEl = orderItemElement.querySelector('.print__address__fullname');
                                const buyerName = (fullNameEl?.textContent || '').trim();
                                const buyerFirst = buyerName.split(/\s+/)[0] || 'there';
                                messageText = applyTemplate(template, { BUYER_FIRST: buyerFirst });
                            }
                        }

                        await GM_setValue('ebay_manual_message_to_send', { orderId: orderId, message: messageText });
                        GM_openInTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=manual_message`, { active: true });
                    }
                    return;
                }
                if (target.matches(CONFIG.selectors.itemImage)) {
                    createImageZoomHandler(target);
                    return;
                }
                if (!orderItemElement) return;
                const addressElement = orderItemElement.querySelector(`.${CONFIG.classNames.addressContainer}`);
                const addressActions = orderItemElement.querySelector(CONFIG.selectors.addressActions);
                if (target.classList.contains(CONFIG.classNames.copyAddressBtn)) {
                    event.preventDefault();
                    if (addressElement) {
                        GM_setClipboard(addressElement.innerText);
                        ordersContainerForEvents.querySelectorAll(`.${CONFIG.classNames.copyAddressBtn}`).forEach(btn => { if (btn !== target) btn.innerText = 'Copy'; });
                        target.innerText = 'Copied!';
                    }
                }
                if (target.classList.contains(CONFIG.classNames.editAddressBtn)) {
                    event.preventDefault(); event.stopPropagation();
                    const editBtn = addressActions?.querySelector(`.${CONFIG.classNames.editAddressBtn}`);
                    const copyBtn = addressActions?.querySelector(`.${CONFIG.classNames.copyAddressBtn}`);
                    if (!addressElement || !editBtn || !copyBtn) return;
                    if (orderItemElement.classList.contains(CONFIG.classNames.isEditingAddress)) {
                        const inputs = Array.from(addressElement.querySelectorAll(`.${CONFIG.classNames.addressEditInput}`));
                        addressElement.innerHTML = inputs.map(input => input.value.trim()).filter(line => line).join('<br>');
                        orderItemElement.classList.remove(CONFIG.classNames.isEditingAddress);
                        editBtn.textContent = 'Edit';
                        copyBtn.style.display = 'inline';
                        addressActions.querySelector(`.${CONFIG.classNames.cancelWrapper}`)?.remove();
                    } else {
                        orderItemElement.classList.add(CONFIG.classNames.isEditingAddress);
                        addressElement.dataset.originalHtml = addressElement.innerHTML;
                        const addressLines = addressElement.innerText.split('\n').filter(line => line.trim() !== '');
                        addressElement.innerHTML = '';
                        addressLines.forEach(line => {
                            const input = document.createElement('input'); input.type = 'text'; input.className = CONFIG.classNames.addressEditInput; input.value = line; addressElement.appendChild(input);
                        });
                        editBtn.textContent = 'Save';
                        copyBtn.style.display = 'none';
                        editBtn.insertAdjacentHTML('afterend', `<span class="${CONFIG.classNames.cancelWrapper}">&nbsp;&nbsp;<button type="button" class="fake-link ${CONFIG.classNames.cancelAddressBtn}">Cancel</button></span>`);
                    }
                }
                if (target.classList.contains(CONFIG.classNames.cancelAddressBtn)) {
                    event.preventDefault();
                    if (addressElement) addressElement.innerHTML = addressElement.dataset.originalHtml;
                    orderItemElement.classList.remove(CONFIG.classNames.isEditingAddress);
                    const editBtn = addressActions?.querySelector(`.${CONFIG.classNames.editAddressBtn}`);
                    if (editBtn) editBtn.textContent = 'Edit';
                    const copyBtn = addressActions?.querySelector(`.${CONFIG.classNames.copyAddressBtn}`);
                    if (copyBtn) copyBtn.style.display = 'inline';
                    target.closest(`.${CONFIG.classNames.cancelWrapper}`)?.remove();
                }
                if (target.classList.contains(CONFIG.classNames.printEnvelopeBtn)) {
                    event.preventDefault();
                    if (orderItemElement) printEnvelopes([orderItemElement]);
                }
            });
            document.querySelectorAll(CONFIG.selectors.checkbox).forEach(cb => {
                if (!cb.dataset.skuChangeListenerAdded) {
                    cb.addEventListener('change', skuManager.createSKUPackingList);
                    cb.dataset.skuChangeListenerAdded = 'true';
                }
            });
        }

        // --- SKU Management Logic ---
        // Contains all logic for creating, displaying, and updating the "SKUs to Pack" panel.
        function setupSkuLogic() {
            let SKU = [];
            function PrintSKUTable() {
                const container = document.getElementById(CONFIG.ids.skuPanelContainer);
                if (!container) return;
                container.innerHTML = '';
                const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
                const title = document.createElement('h2');
                title.className = 'sku-title';
                const titleText = document.createElement('span');
                titleText.textContent = `SKUs to Pack (${SKU.length})`;
                const togglesWrapper = document.createElement('div');
                togglesWrapper.className = 'sku-toggles';
                const darkModeToggle = document.createElement('label');
                darkModeToggle.className = CONFIG.classNames.darkModeSwitch;
                darkModeToggle.innerHTML = `<input type="checkbox" ${isDarkMode ? 'checked' : ''}><span class="${CONFIG.classNames.darkModeSlider}"></span>`;
                const darkModeEmoji = document.createElement('span');
                darkModeEmoji.textContent = isDarkMode ? '🌙' : '☀️';
                darkModeEmoji.style.cssText = 'font-size: 16px; line-height: 1;';
                togglesWrapper.append(darkModeToggle, darkModeEmoji);
                title.append(titleText, togglesWrapper);
                container.appendChild(title);

                const contentWrapper = document.createElement('div');
                contentWrapper.id = CONFIG.ids.skuContentWrapper;
                container.appendChild(contentWrapper);
                darkModeToggle.querySelector('input').addEventListener('change', (e) => { localStorage.setItem(CONFIG.localStorageKeys.darkMode, String(e.target.checked)); injectRadicalStyles(); PrintSKUTable(); });

                // --- Filter / Search Input ---
                const filterInput = document.createElement('input');
                filterInput.type = 'text';
                filterInput.id = 'sku-filter-input';
                filterInput.placeholder = 'Filter by SKU, buyer, or item...';
                filterInput.style.cssText = `width: 100%; box-sizing: border-box; padding: 6px 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid ${isDarkMode ? '#555' : '#ccc'}; background-color: ${isDarkMode ? '#333' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'}; font-size: 13px; outline: none;`;
                // Preserve filter text across re-renders
                const prevFilter = container.dataset.filterText || '';
                filterInput.value = prevFilter;
                contentWrapper.appendChild(filterInput);

                const applyFilter = () => {
                    const query = filterInput.value.trim().toLowerCase();
                    container.dataset.filterText = query;
                    // Filter SKU items in the panel
                    const skuItems = contentWrapper.querySelectorAll(`.${CONFIG.classNames.skuItem}`);
                    skuItems.forEach(item => {
                        const skuText = item.textContent.toLowerCase();
                        const orderItemId = item.dataset.orderItemId;
                        const orderCard = orderItemId ? document.getElementById(orderItemId) : null;
                        const buyerName = orderCard?.querySelector('.print__address__fullname')?.textContent.toLowerCase() || '';
                        const itemTitles = Array.from(orderCard?.querySelectorAll('.item__description h2 a') || []).map(a => a.textContent.toLowerCase()).join(' ');
                        const match = !query || skuText.includes(query) || buyerName.includes(query) || itemTitles.includes(query);
                        item.style.display = match ? '' : 'none';
                    });
                    // Also show/hide separators if all items around them are hidden
                    const separators = contentWrapper.querySelectorAll(`.${CONFIG.classNames.skuGroupSeparator}`);
                    separators.forEach(sep => { sep.style.display = query ? 'none' : ''; });
                    // Filter order cards on the main page
                    document.querySelectorAll(CONFIG.selectors.orderItem).forEach(orderCard => {
                        const buyerName = orderCard.querySelector('.print__address__fullname')?.textContent.toLowerCase() || '';
                        const skus = Array.from(orderCard.querySelectorAll('[class*="item__details"] li')).filter(li => li.innerText.startsWith('SKU:')).map(li => li.innerText.toLowerCase()).join(' ');
                        const itemTitles = Array.from(orderCard.querySelectorAll('.item__description h2 a') || []).map(a => a.textContent.toLowerCase()).join(' ');
                        const match = !query || buyerName.includes(query) || skus.includes(query) || itemTitles.includes(query);
                        orderCard.style.display = match ? '' : 'none';
                    });
                };
                filterInput.addEventListener('input', applyFilter);

                if (SKU.length > 0) {
                    const flexContainer = document.createElement('div');
                    flexContainer.id = CONFIG.ids.skuList;
                    let orderIdToColorMap = {};
                    let colorIndex = 0;
                    const multiItemOrderIds = [...new Set(SKU.filter(s => s.isMultiItemOrder).map(s => s.orderId))];
                    multiItemOrderIds.forEach(id => { orderIdToColorMap[id] = CONFIG.data.orderColors[colorIndex++ % CONFIG.data.orderColors.length]; });
                    for (let k = 0; k < SKU.length; k++) {
                        if (k > 0 && SKU[k].text.substring(0, 1).toLowerCase() !== SKU[k - 1].text.substring(0, 1).toLowerCase()) {
                            flexContainer.insertAdjacentHTML('beforeend', `<div class="${CONFIG.classNames.skuGroupSeparator}"></div>`);
                        }
                        const skuObject = SKU[k];
                        const skuItemLink = document.createElement('a');
                        skuItemLink.className = CONFIG.classNames.skuItem;
                        skuItemLink.href = `#order-item-${skuObject.orderId}`;
                        skuItemLink.dataset.orderItemId = `order-item-${skuObject.orderId}`;
                        const canadaFlag = skuObject.isCanadian ? ' 🇨🇦' : '';
                        skuItemLink.innerHTML = skuObject.text.toLowerCase().includes("lg") ? skuObject.text.replace(/lg/gi, `<span class="${CONFIG.classNames.highlightYellow}">$&</span>`) + canadaFlag : skuObject.text + canadaFlag;
                        skuItemLink.addEventListener('click', function(event) {
                            event.preventDefault();
                            const targetOrder = document.getElementById(this.dataset.orderItemId);
                            if (targetOrder) {
                                targetOrder.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                const isDark = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
                                const originalBg = window.getComputedStyle(targetOrder).backgroundColor;
                                targetOrder.style.backgroundColor = isDark ? '#4a6b9f' : '#a0c4ff';
                                setTimeout(() => { targetOrder.style.backgroundColor = originalBg; }, 1500);
                            }
                        });
                        const parentOrderCard = document.getElementById(`order-item-${skuObject.orderId}`);
                        if (parentOrderCard?.classList.contains(CONFIG.classNames.orderShipped)) {
                             skuItemLink.innerHTML = '✔️ ' + skuItemLink.innerHTML;
                             skuItemLink.classList.add(CONFIG.classNames.skuShipped);
                        }
                        if (skuObject.isMultiItemOrder) {
                            skuItemLink.style.backgroundColor = orderIdToColorMap[skuObject.orderId];
                            skuItemLink.style.fontWeight = 'bold';
                            skuItemLink.style.borderColor = isDarkMode ? '#666' : '#888';
                            if (isDarkMode) skuItemLink.style.color = '#111';
                        } else {
                            if (skuObject.text.toLowerCase().includes("lg")) skuItemLink.classList.add(CONFIG.classNames.skuLg);
                            if (skuObject.text.toLowerCase().includes("manila")) skuItemLink.classList.add(CONFIG.classNames.skuManila);
                        }
                        if (skuObject.quantity > 1 && !skuItemLink.classList.contains(CONFIG.classNames.skuManila)) skuItemLink.classList.add(CONFIG.classNames.skuMultiQty);
                        flexContainer.appendChild(skuItemLink);
                    }
                    contentWrapper.appendChild(flexContainer);
                }

                // Re-apply filter if there was one active
                if (prevFilter) applyFilter();

                const allOrderItems = document.querySelectorAll(CONFIG.selectors.orderItem);
                const checkedCheckboxes = document.querySelectorAll(`${CONFIG.selectors.orderItem} ${CONFIG.selectors.checkbox}:checked`);
                if (allOrderItems.length > 0) {
                    const printButton = document.createElement('button');
                    printButton.id = CONFIG.ids.printAllEnvelopesButton;
                    printButton.style.cssText = `display: block; width: 100%; margin-top: 15px; padding: 8px 12px; font-size: 14px; font-weight: 700; text-align: center; cursor: pointer; border-radius: 4px; transition: all 150ms ease-in-out; border: 2px solid ${isDarkMode ? '#555' : '#DAE3F3'}; background: ${isDarkMode ? '#3a3a3a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#272C34'};`;
                    if (checkedCheckboxes.length > 0) {
                        printButton.textContent = `Print ${checkedCheckboxes.length} Selected Envelope(s)`;
                        printButton.onclick = () => printEnvelopes(Array.from(allOrderItems).filter(oi => oi.querySelector(CONFIG.selectors.checkbox)?.checked));
                    } else {
                        printButton.textContent = `Print All ${allOrderItems.length} Envelopes`;
                        printButton.onclick = () => printEnvelopes(Array.from(allOrderItems));
                    }
                    contentWrapper.appendChild(printButton);
                }

                // --- CUSTOM ENVELOPE FEATURE (link in SKU panel) ---
                const customEnvLink = document.createElement('a');
                customEnvLink.href = '#';
                customEnvLink.textContent = '✉ Custom Envelope';
                customEnvLink.style.cssText = `display:block;text-align:center;margin-top:6px;font-size:12px;color:${isDarkMode ? '#78BFFF' : '#3665f3'};text-decoration:none;cursor:pointer;opacity:0.75;transition:opacity 0.2s;`;
                customEnvLink.onmouseenter = () => { customEnvLink.style.opacity = '1'; };
                customEnvLink.onmouseleave = () => { customEnvLink.style.opacity = '0.75'; };
                customEnvLink.addEventListener('click', (e) => { e.preventDefault(); showCustomEnvelopeModal(); });
                contentWrapper.appendChild(customEnvLink);
                // --- END CUSTOM ENVELOPE FEATURE (link) ---

                // --- Configuration Section (below Print button) ---
                const configSection = document.createElement('div');
                configSection.id = 'altheastix-config-panel';
                configSection.style.cssText = [
                    'margin-top: 12px',
                    `background: ${isDarkMode ? '#2a2a2a' : '#fafafa'}`,
                    `border: 1px solid ${isDarkMode ? '#444' : '#ddd'}`,
                    'border-radius: 8px',
                    'padding: 10px',
                ].join('; ');

                const cfgHeader = document.createElement('div');
                cfgHeader.textContent = 'Configuration';
                cfgHeader.style.cssText = `
                    font-weight: 700; font-size: 13px; margin-bottom: 8px;
                    color: ${isDarkMode ? '#e0e0e0' : '#333'};
                `;
                configSection.appendChild(cfgHeader);

                // Row: Auto-send messages slider (50/50 layout)
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:8px;';

                const leftHalf = document.createElement('div');
                leftHalf.style.cssText = 'flex: 0 0 50%; max-width: 50%; display:flex; align-items:center; gap:8px; min-width:0;';
                const switchLabel = document.createElement('label');
                switchLabel.className = CONFIG.classNames.darkModeSwitch; // reuse slider styles
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.id = 'auto-send-messages-toggle';
                try { cb.checked = !!GM_getValue(AUTO_SEND_MESSAGES_KEY, true); } catch(e) { cb.checked = true; }
                const slider = document.createElement('span');
                slider.className = CONFIG.classNames.darkModeSlider;
                switchLabel.append(cb, slider);
                const labelSpan = document.createElement('span');
                labelSpan.textContent = 'auto-send messages';
                labelSpan.style.cssText = `flex:1 3 auto; font-size: 12px; color: ${isDarkMode ? '#ccc' : '#333'}; white-space: normal; overflow-wrap: anywhere; line-height: 1.25;`;
                leftHalf.append(switchLabel, labelSpan);

                const rightHalf = document.createElement('div');
                rightHalf.style.cssText = `flex: 0 0 50%; max-width: 50%; font-size: 10px; line-height: 1.25; color: ${isDarkMode ? '#aaa' : '#666'};`;
                rightHalf.textContent = 'When ON, messages send automatically after drafting.';

                row.append(leftHalf, rightHalf);
                configSection.appendChild(row);

                cb.addEventListener('change', (e) => {
                    GM_setValue(AUTO_SEND_MESSAGES_KEY, !!e.target.checked);
                });

                // Row: Ship tomorrow (global) (50/50 layout)
                const rowShip = document.createElement('div');
                rowShip.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top: 8px;';

                const leftHalfShip = document.createElement('div');
                leftHalfShip.style.cssText = 'flex: 0 0 50%; max-width: 50%; display:flex; align-items:center; gap:8px; min-width:0;';
                const switchLabelShip = document.createElement('label');
                switchLabelShip.className = CONFIG.classNames.darkModeSwitch;
                const cbShip = document.createElement('input');
                cbShip.type = 'checkbox';
                cbShip.id = 'ship-tomorrow-global-toggle';
                cbShip.checked = true;
                const sliderShip = document.createElement('span');
                sliderShip.className = CONFIG.classNames.darkModeSlider;
                switchLabelShip.append(cbShip, sliderShip);
                const labelSpanShip = document.createElement('span');
                labelSpanShip.textContent = 'ship tomorrow (all orders)';
                labelSpanShip.style.cssText = `flex:1 3 auto; font-size: 12px; color: ${isDarkMode ? '#ccc' : '#333'}; white-space: normal; overflow-wrap: anywhere; line-height: 1.25;`;
                leftHalfShip.append(switchLabelShip, labelSpanShip);

                const rightHalfShip = document.createElement('div');
                rightHalfShip.style.cssText = `flex: 0 0 50%; max-width: 50%; font-size: 10px; line-height: 1.25; color: ${isDarkMode ? '#aaa' : '#666'};`;
                rightHalfShip.textContent = 'Toggles "+ Will ship tomorrow note" on every order.';

                rowShip.append(leftHalfShip, rightHalfShip);
                configSection.appendChild(rowShip);

                // Apply to all order cards when toggled
                cbShip.addEventListener('change', (e) => {
                    const check = !!e.target.checked;
                    document.querySelectorAll('.ship-tomorrow-checkbox').forEach((box) => {
                        if (box instanceof HTMLInputElement) box.checked = check;
                    });
                });

                // Row: Thank you msg (global) (50/50 layout)
                const rowThanks = document.createElement('div');
                rowThanks.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top: 8px;';

                const leftHalfThanks = document.createElement('div');
                leftHalfThanks.style.cssText = 'flex: 0 0 50%; max-width: 50%; display:flex; align-items:center; gap:8px; min-width:0;';
                const switchLabelThanks = document.createElement('label');
                switchLabelThanks.className = CONFIG.classNames.darkModeSwitch;
                const cbThanks = document.createElement('input');
                cbThanks.type = 'checkbox';
                cbThanks.id = 'thank-you-global-toggle';
                cbThanks.checked = true;
                const sliderThanks = document.createElement('span');
                sliderThanks.className = CONFIG.classNames.darkModeSlider;
                switchLabelThanks.append(cbThanks, sliderThanks);
                const labelSpanThanks = document.createElement('span');
                labelSpanThanks.textContent = 'thank you msg (all orders)';
                labelSpanThanks.style.cssText = `flex:1 3 auto; font-size: 12px; color: ${isDarkMode ? '#ccc' : '#333'}; white-space: normal; overflow-wrap: anywhere; line-height: 1.25;`;
                leftHalfThanks.append(switchLabelThanks, labelSpanThanks);

                const rightHalfThanks = document.createElement('div');
                rightHalfThanks.style.cssText = `flex: 0 0 50%; max-width: 50%; font-size: 10px; line-height: 1.25; color: ${isDarkMode ? '#aaa' : '#666'};`;
                rightHalfThanks.textContent = 'Toggles "+ thank you msg" on every order.';

                rowThanks.append(leftHalfThanks, rightHalfThanks);
                configSection.appendChild(rowThanks);

                // Apply to all order cards when toggled
                cbThanks.addEventListener('change', (e) => {
                    const check = !!e.target.checked;
                    document.querySelectorAll('.thank-you-checkbox').forEach((box) => {
                        if (box instanceof HTMLInputElement) box.checked = check;
                    });
                });

                contentWrapper.appendChild(configSection);

                // --- Auto-enable and propagate changes on load ---
                setTimeout(() => {
                    if (cbShip.checked) {
                        document.querySelectorAll('.ship-tomorrow-checkbox').forEach(box => {
                            if (box instanceof HTMLInputElement) box.checked = true;
                        });
                    }
                    if (cbThanks.checked) {
                        document.querySelectorAll('.thank-you-checkbox').forEach(box => {
                            if (box instanceof HTMLInputElement) box.checked = true;
                        });
                    }
                }, 0);
            }

            function createSKUPackingList() {
                const allOrderElements = document.querySelectorAll(CONFIG.selectors.orderItem);
                SKU = [];
                const checkedOrderIds = new Set(Array.from(document.querySelectorAll(`${CONFIG.selectors.orderItem} ${CONFIG.selectors.checkbox}:checked`)).map(cb => cb.closest(CONFIG.selectors.orderItem).id));
                let ordersToProcess = (checkedOrderIds.size > 0) ? Array.from(allOrderElements).filter(el => checkedOrderIds.has(el.id)) : Array.from(allOrderElements);
                const parsedOrders = [];
                ordersToProcess.forEach(orderEl => {
                    const globalOrderIndex = parseInt(orderEl.id.replace('order-item-', ''));
                    if (isNaN(globalOrderIndex)) return;
                    const itemElements = orderEl.querySelectorAll('.item');
                    const itemsInThisOrder = [];
                    itemElements.forEach(itemEl => {
                        let skuValue = '', designValue = '', quantity = 1;
                        const detailsList = itemEl.querySelector('[class*="item__details"]');
                        if (!detailsList) return;
                        const allLis = Array.from(detailsList.querySelectorAll('li'));
                        const skuLi = allLis.find(li => li.innerText.trim().startsWith("SKU:"));
                        if (skuLi) skuValue = skuLi.innerText.trim().replace("SKU:", "").trim();
                        const designLi = allLis.find(li => li.innerText.trim().startsWith("Design:"));
                        if (designLi) designValue = designLi.innerText.trim().replace("Design:", "").trim();
                        const qtyLi = allLis.find(li => /^(Quantity|Qty):/i.test(li.innerText.trim()));
                        if (qtyLi) {
                            const quantityMatch = qtyLi.innerText.trim().match(/^(?:Quantity|Qty):\s*(\d+)/i);
                            if (quantityMatch?.[1]) quantity = parseInt(quantityMatch[1], 10);
                        }
                        if (skuValue) itemsInThisOrder.push({ sku: skuValue, design: designValue, quantity: quantity });
                    });
                    if (itemsInThisOrder.length > 0) {
                        parsedOrders.push({
                            orderId: globalOrderIndex,
                            isCanadian: orderEl.dataset.isCanadian === 'true',
                            isMarkedAsShipped: orderEl.classList.contains(CONFIG.classNames.orderShipped),
                            items: itemsInThisOrder
                        });
                    }
                });
                parsedOrders.forEach(order => {
                    // Consolidate items with the same SKU+Design within one order
                    const consolidated = new Map();
                    order.items.forEach(item => {
                        const key = `${item.sku}|||${item.design}`;
                        if (consolidated.has(key)) {
                            consolidated.get(key).quantity += item.quantity;
                        } else {
                            consolidated.set(key, { sku: item.sku, design: item.design, quantity: item.quantity });
                        }
                    });
                    const mergedItems = Array.from(consolidated.values());
                    const isMultiItemOrder = mergedItems.length > 1;
                    mergedItems.forEach(item => {
                        let displayText = item.sku;
                        if (item.design) displayText += ` (${item.design})`;
                        if (item.quantity > 1) displayText += ` x${item.quantity}`;
                        SKU.push({
                            text: displayText,
                            quantity: item.quantity,
                            isMultiItemOrder,
                            orderId: order.orderId,
                            isCanadian: order.isCanadian,
                            isMarkedAsShipped: order.isMarkedAsShipped
                        });
                    });
                });
                SKU.sort((a, b) => a.text.localeCompare(b.text));
                PrintSKUTable();
            }

            return { createSKUPackingList };
        }

        // --- CUSTOM ENVELOPE FEATURE (modal) ---
        // Opens a modal that lets the user paste a raw address block, auto-parses it into
        // structured fields for review/edit, and prints a single ad-hoc envelope.
        function showCustomEnvelopeModal() {
            const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
            const bg = isDarkMode ? '#1e1e1e' : '#fff';
            const fg = isDarkMode ? '#e0e0e0' : '#000';
            const inputBg = isDarkMode ? '#2c2c2c' : '#fff';
            const inputBorder = isDarkMode ? '#555' : '#ccc';
            const accent = isDarkMode ? '#3665f3' : '#0070d2';
            const mutedFg = isDarkMode ? '#999' : '#888';

            // Overlay
            const overlay = document.createElement('div');
            overlay.className = 'custom-envelope-overlay';
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);`;

            // Modal
            const modal = document.createElement('div');
            modal.className = 'custom-envelope-modal';
            modal.style.cssText = `background:${bg};color:${fg};border-radius:12px;padding:24px;width:460px;max-width:92vw;max-height:88vh;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;`;

            // Header
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
            const title = document.createElement('h3');
            title.textContent = '✉ Custom Envelope';
            title.style.cssText = `margin:0;font-size:18px;color:${fg};`;
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `background:none;border:none;font-size:18px;cursor:pointer;color:${mutedFg};padding:4px 8px;border-radius:4px;`;
            closeBtn.onclick = () => overlay.remove();
            header.append(title, closeBtn);
            modal.appendChild(header);

            // Instruction
            const hint = document.createElement('p');
            hint.textContent = 'Paste a full address block below — fields update automatically.';
            hint.style.cssText = `font-size:12px;color:${mutedFg};margin:0 0 10px;`;
            modal.appendChild(hint);

            // Textarea
            const textarea = document.createElement('textarea');
            textarea.placeholder = 'Pablo Cazenave\n26615 Godfrey Cove Ct\nApt 206\nKaty, TX 77494-0415\nUnited States';
            textarea.style.cssText = `width:100%;box-sizing:border-box;min-height:110px;padding:10px;border-radius:8px;border:1px solid ${inputBorder};background:${inputBg};color:${fg};font-size:14px;font-family:inherit;resize:vertical;outline:none;transition:border-color 0.2s;`;
            textarea.addEventListener('focus', () => { textarea.style.borderColor = accent; });
            textarea.addEventListener('blur', () => { textarea.style.borderColor = inputBorder; });
            modal.appendChild(textarea);

            // Parsed fields container
            const fieldsContainer = document.createElement('div');
            fieldsContainer.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:8px;';

            const fieldDefs = [
                { key: 'name', label: 'Name' },
                { key: 'street', label: 'Street' },
                { key: 'line2', label: 'Apt / Unit / Extra' },
                { key: 'cityStateZip', label: 'City, State ZIP' },
                { key: 'country', label: 'Country' }
            ];

            const fieldInputs = {};
            fieldDefs.forEach(def => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                const label = document.createElement('label');
                label.textContent = def.label;
                label.style.cssText = `font-size:12px;font-weight:600;color:${mutedFg};width:110px;flex-shrink:0;text-align:right;`;
                const input = document.createElement('input');
                input.type = 'text';
                input.dataset.field = def.key;
                input.style.cssText = `flex:1;padding:6px 10px;border-radius:6px;border:1px solid ${inputBorder};background:${inputBg};color:${fg};font-size:13px;font-family:inherit;outline:none;transition:border-color 0.2s;`;
                input.addEventListener('focus', () => { input.style.borderColor = accent; });
                input.addEventListener('blur', () => { input.style.borderColor = inputBorder; });
                fieldInputs[def.key] = input;
                row.append(label, input);
                fieldsContainer.appendChild(row);
            });
            modal.appendChild(fieldsContainer);

            // Live parsing: debounced, fires on every textarea change
            let parseTimer = null;
            const runParse = () => {
                const parsed = parseAddressBlock(textarea.value);
                fieldDefs.forEach(def => {
                    fieldInputs[def.key].value = parsed[def.key] || '';
                });
            };
            textarea.addEventListener('input', () => {
                clearTimeout(parseTimer);
                parseTimer = setTimeout(runParse, 250);
            });
            // Also fire on paste immediately (paste event fires before input)
            textarea.addEventListener('paste', () => {
                clearTimeout(parseTimer);
                setTimeout(runParse, 50);
            });

            // Buttons row
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:18px;';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `padding:8px 18px;border-radius:6px;border:1px solid ${inputBorder};background:${isDarkMode ? '#333' : '#f5f5f5'};color:${fg};font-size:14px;cursor:pointer;font-weight:600;`;
            cancelBtn.onclick = () => overlay.remove();

            const printBtn = document.createElement('button');
            printBtn.textContent = 'Print Envelope';
            printBtn.style.cssText = `padding:8px 18px;border-radius:6px;border:none;background:${accent};color:#fff;font-size:14px;cursor:pointer;font-weight:700;transition:background 0.2s;`;
            printBtn.onmouseenter = () => { printBtn.style.background = isDarkMode ? '#5a82f5' : '#005fb8'; };
            printBtn.onmouseleave = () => { printBtn.style.background = accent; };

            printBtn.onclick = () => {
                // Build address HTML from the editable fields (not the raw textarea)
                const parts = fieldDefs
                    .map(def => fieldInputs[def.key].value.trim())
                    .filter(v => v.length > 0);
                if (parts.length === 0) { alert('Please paste an address first.'); return; }
                const addressHTML = parts.join('<br>');
                const envelopeHTML = `<div class="envelope"><table style="font-family: Arial; width: 100%; height: 100%; border-collapse: collapse;"><tr style="vertical-align: top;"><td style="width: 100%; padding: 0; font-size: 14px;">${USER_CONFIG.returnAddress}</td></tr><tr style="height: 10%;"><td></td></tr><tr style="vertical-align: top;"><td style="text-align: left; padding-left: 20%; font-size: 24px;">${addressHTML}</td></tr><tr style="height: 30%;"><td></td></tr></table></div>`;
                const printwin = window.open("", "_blank");
                printwin.document.write(`<html><head><style>@page { size: 8.93in x 3.878in; margin: 0; } html, body { margin: 0; padding: 0; } .envelope { width: 8.93in; height: 3.878in; padding: 10px; font-family: Arial; box-sizing: border-box; overflow: hidden; }</style></head><body>${envelopeHTML}</body></html>`);
                printwin.document.close();
                printwin.focus();
                printwin.print();
                printwin.close();
                overlay.remove();
            };

            btnRow.append(cancelBtn, printBtn);
            modal.appendChild(btnRow);

            // Close on overlay click (outside modal)
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            // Close on Escape
            const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
            document.addEventListener('keydown', escHandler);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Auto-focus textarea
            setTimeout(() => textarea.focus(), 50);
        }
        // --- END CUSTOM ENVELOPE FEATURE (modal) ---

        // --- Main Execution Function ---
        // This is the core function that orchestrates the script's execution on the main page.
        // It calls the initialization, processing, and event listener setup functions in order.
        async function main() {
            console.debug('[Tampermonkey][MAIN] main() start');
            initializePageLayout();
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Give combining a short extra window before building UI
            await (async () => { try { await new Promise(r => setTimeout(r, 300)); } catch(e) {} })();
            updateSkuPanelPosition();
            updateSkuPanelOnScroll(); // Initial check
            const skuManager = setupSkuLogic();
            document.querySelectorAll(CONFIG.selectors.orderItem).forEach((orderItem, index) => processOrderCard(orderItem, index));
            setupGlobalEventListeners(skuManager);
            skuManager.createSKUPackingList();
            console.debug('[Tampermonkey][MAIN] Order cards processed & SKU panel built');

            // Listen for note confirmation
            GM_addValueChangeListener(CONFIRMED_NOTE_KEY, (name, oldValue, newValue) => {
                if (newValue && newValue.orderId) {
                    updateNoteLink(newValue.orderId, newValue.status);
                    GM_setValue(CONFIRMED_NOTE_KEY, null); // Clear after processing
                }
            });

            const checkAndFinalizeCardState = (orderCard) => {
                const confirmedIds = (orderCard.dataset.confirmedIds || '').split(',').filter(Boolean);
                const allIdsOnCard = (orderCard.dataset.orderId || '').split(',').filter(Boolean);
                if (allIdsOnCard.length > 0 && allIdsOnCard.every(id => confirmedIds.includes(id))) {
                    orderCard.querySelector(`.${CONFIG.classNames.pendingOverlay}`)?.remove();
                    orderCard.classList.add(CONFIG.classNames.orderShipped);
                    const shipButton = orderCard.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
                    if (shipButton) {
                        const shippedLabel = document.createElement('span');
                        shippedLabel.className = CONFIG.classNames.shippedLabel;
                        shippedLabel.innerHTML = '✓ Shipped';
                        shipButton.replaceWith(shippedLabel);
                    }
                    skuManager.createSKUPackingList();
                }
            };
            const processShipmentConfirmation = async (confirmedOrderId) => {
                if (!confirmedOrderId) return;
                const orderCard = Array.from(document.querySelectorAll(CONFIG.selectors.orderItem)).find(card => card.dataset.orderId?.includes(confirmedOrderId));
                if (orderCard) {
                    let confirmedIds = (orderCard.dataset.confirmedIds || '').split(',').filter(Boolean);
                    if (!confirmedIds.includes(confirmedOrderId)) {
                        confirmedIds.push(confirmedOrderId);
                        orderCard.dataset.confirmedIds = confirmedIds.join(',');
                    }
                    checkAndFinalizeCardState(orderCard);
                    skuManager.createSKUPackingList();
                }
            };
            GM_addValueChangeListener(CONFIRMED_SHIP_KEY, async (name, oldValue, newValue) => {
                 if (newValue?.orderId) {
                    await processShipmentConfirmation(newValue.orderId);
                    await GM_setValue(CONFIRMED_SHIP_KEY, null);
                }
            });
            setInterval(async () => {
                const confirmedOrder = await GM_getValue(CONFIRMED_SHIP_KEY, null);
                if (confirmedOrder?.orderId) {
                    await processShipmentConfirmation(confirmedOrder.orderId);
                    await GM_setValue(CONFIRMED_SHIP_KEY, null);
                }
            }, CONFIG.timing.pollingInterval);
        }

        // --- Script Entry Point ---
        // This function is called when the script is ready to run, either after the
        // initial delay or when the page is detected to be fully loaded.
        async function executeMainScript() {
            if (scriptHasRun) { console.warn('[Tampermonkey][BOOT] executeMainScript() called but script already ran. Ignoring.'); return; }
            console.log('[Tampermonkey][BOOT] Executing main script…');
            scriptHasRun = true;
            if (fallbackTimer) clearTimeout(fallbackTimer);
            if (countdownInterval) clearInterval(countdownInterval);

            if (timerElement) {
                timerTextSpan.textContent = 'Processing orders...';
                forceRunButton.remove();
                timerElement.style.justifyContent = 'center';
                timerElement.style.gap = '0';
            }
            await main();
            if (blurOverlay) blurOverlay.style.opacity = '0';
            if (timerElement) timerElement.style.opacity = '0';
            setTimeout(() => {
                blurOverlay?.remove();
                timerElement?.remove();
            }, 500);
        }

        function waitForPageReady(callback) {
            const checkInterval = 200; // ms
            const timeout = 10000; // 10 seconds hard stop for polling loop (fallback still exists)
            const zeroOrderGrace = 1000; // ms before accepting a zero-order state as "ready" (reduced per request)
            let elapsedTime = 0;
            console.log('[Tampermonkey][STARTUP] Polling for readiness (Review button OR zero-order state)…');
            const intervalId = setInterval(() => {
                if (scriptHasRun) { clearInterval(intervalId); return; }
                elapsedTime += checkInterval;
                const reviewBtn = document.querySelector('button.btn.review-and-pay.btn--primary');
                if (reviewBtn) {
                    const disabled = reviewBtn.hasAttribute('disabled') || reviewBtn.disabled;
                    if (!disabled) {
                        console.log('[Tampermonkey][STARTUP] Ready via active Review purchase button.');
                        clearInterval(intervalId);
                        clearTimeout(fallbackTimer);
                        callback();
                        return;
                    }
                    if (elapsedTime % 2000 === 0) {
                        console.debug(`[Tampermonkey][STARTUP] Review button present but disabled (t=${(elapsedTime/1000).toFixed(1)}s)…`);
                    }
                } else if (elapsedTime % 2000 === 0) {
                    console.debug('[Tampermonkey][STARTUP] Still searching for Review button…');
                }

                // Zero-order scenario detection after grace period
                if (elapsedTime >= zeroOrderGrace) {
                    const anyOrder = document.querySelector(CONFIG.selectors.orderItem);
                    const container = document.querySelector(CONFIG.selectors.bulkLabelsAppCard);
                    const possibleEmptyCopy = container?.textContent?.toLowerCase() || '';
                    const emptyIndicators = ['no orders', 'no shipments', 'nothing to ship', 'no eligible', 'all caught up'];
                    const textualEmpty = emptyIndicators.some(s => possibleEmptyCopy.includes(s));
                    if (!anyOrder && container && textualEmpty) {
                        console.log('[Tampermonkey][STARTUP] Ready via zero-order state (no order cards).');
                        clearInterval(intervalId);
                        clearTimeout(fallbackTimer);
                        callback();
                        return;
                    }
                    // Heuristic: if container exists, still no orders, and near end of polling window (> 60% of timeout) treat as ready
                    if (!anyOrder && container && elapsedTime > timeout * 0.6) {
                        console.warn('[Tampermonkey][STARTUP] Proceeding (zero-order heuristic) without Review button.');
                        clearInterval(intervalId);
                        clearTimeout(fallbackTimer);
                        callback();
                        return;
                    }
                }

                if (elapsedTime >= timeout) {
                    console.error('[Tampermonkey][STARTUP] TIMEOUT: No readiness signal. Will rely on fallback timer or manual run.');
                    clearInterval(intervalId);
                }
            }, checkInterval);
        }


        window.addEventListener('resize', updateSkuPanelPosition);
        window.addEventListener('scroll', updateSkuPanelOnScroll);
        // Fallback timer in case the observer fails
        fallbackTimer = setTimeout(() => {
            if (!scriptHasRun) {
                console.warn('[Tampermonkey][FALLBACK] Fallback timer elapsed. Forcing script execution.');
                executeMainScript();
            }
        }, delay);
        // Start checking for the page to be ready
    waitForPageReady(executeMainScript);
    console.debug('[Tampermonkey][BOOT] Startup watchers armed. Waiting for trigger…');
    }
    // ===================================================================
    // LOGIC FOR THE EBAY AUTOMATION PAGES
    // ===================================================================
    else if (window.location.href.includes('ebay.com/mesh/ord/details') || window.location.href.includes('ebay.com/om/shipment/update') || window.location.href.includes('ebay.com/ship/trk/') || window.location.href.includes('ebay.com/ship/tr/update')) {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        // --- Messaging Textarea Auto-Expand (Order Details page) ---
        (function enableFourLineTextarea() {
            if (!window.location.href.includes('ebay.com/mesh/ord/details')) return; // Only on order details
            const TARGET_ROWS = 8;
            const MIN_HEIGHT_EM = 6; // approximate for 4 lines incl. padding
            let attempts = 0;
            const maxAttempts = 60; // ~18s at 300ms
            const interval = setInterval(() => {
                attempts++;
                // Helper to adjust a found textarea
                const adjust = (ta) => {
                    if (!ta) return;
                    if (ta.dataset._expanded4lines) return; // idempotent
                    ta.setAttribute('rows', String(TARGET_ROWS));
                    ta.style.minHeight = `${MIN_HEIGHT_EM}em`;
                    ta.style.height = 'auto';
                    ta.dataset._expanded4lines = 'true';
                };
                // Check direct DOM first
                const directTA = document.querySelector('#imageupload__sendmessage--textbox, #textarea, textarea#imageupload__sendmessage--textbox, textarea.textbox__control[placeholder*="Send message"]');
                if (directTA) adjust(directTA);
                // Check iframe variant
                const iframe = document.querySelector('.ordui-m2m-panel__iframe');
                if (iframe && iframe.contentDocument) {
                    const iframeTA = iframe.contentDocument.querySelector('#imageupload__sendmessage--textbox, #textarea, textarea#imageupload__sendmessage--textbox, textarea.textbox__control[placeholder*="Send message"]');
                    if (iframeTA) adjust(iframeTA);
                }
                if (attempts >= maxAttempts) clearInterval(interval);
            }, 300);
        })();
        (async function() {
            if (window.location.href.startsWith('https://www.ebay.com/ship/tr/update')) {
                const trackingData = await GM_getValue(TRACKING_ADD_KEY_V2);
                if (trackingData?.trackingNumber) {
                    const trackingNumberClean = trackingData.trackingNumber.replace(/\s/g, '');
                    const trackingInputs = Array.from(await waitForAllElements('input[id^="trkNum_"]'));
                    if (trackingInputs.length === 0) {
                        await GM_setValue(TRACKING_ADD_KEY_V2, null);
                        return;
                    }
                    trackingInputs.forEach(input => {
                        setAndTriggerInputValue(input, trackingNumberClean);
                        const carrierInput = input.closest('td.textbox')?.nextElementSibling?.querySelector('input[type="text"][role="combobox"]');
                        if (carrierInput) setAndTriggerInputValue(carrierInput, 'USPS');
                    });
                    document.querySelector('button.btn.btn--primary')?.focus();
                    await GM_setValue(TRACKING_ADD_KEY_V2, null);
                }
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const urlOrderId = urlParams.get('orderid') || urlParams.get('orderId');
            const urlAction = urlParams.get('tm_action');
            if (!urlAction) return;

            if (urlAction === 'track') {
                const trackingData = await GM_getValue(TRACKING_ADD_KEY);
                if (window.location.href.startsWith('https://www.ebay.com/mesh/ord/details')) {
                    if (!trackingData || trackingData.orderId !== urlOrderId) return;
                    const itemIdElement = await waitForElement('.lineItemCardInfo__itemId span.sh-secondary:last-child');
                    const itemId = itemIdElement?.textContent.trim();
                    if (!itemId) { await GM_setValue(TRACKING_ADD_KEY, null); return; }
                    let transId = null;
                    const transIdRegex = /"transactionId":"(\d+)"/;
                    for (const script of document.querySelectorAll('script')) {
                        const match = script.innerHTML.match(transIdRegex);
                        if (match?.[1]) { transId = match[1]; break; }
                    }
                    if (!transId) { await GM_setValue(TRACKING_ADD_KEY, null); return; }
                    window.location.href = `https://www.ebay.com/ship/trk/trackings?itemid=${itemId}&transid=${transId}&tm_action=track`;
                }
                else if (window.location.href.includes('/ship/trk/')) {
                    if (!trackingData) return;
                    const trackingInput = await waitForElement('.add-tracking-control__input .textbox__control', el => !el.disabled);
                    const carrierInput = await waitForElement('input[role="combobox"]', el => !el.disabled);
                    if (!trackingInput || !carrierInput) return;
                    setAndTriggerInputValue(trackingInput, trackingData.trackingNumber);
                    await sleep(200);
                    carrierInput.click();
                    const listbox = await waitForElement('div[role="listbox"]');
                    if (!listbox) return;
                    const uspsOption = Array.from(listbox.querySelectorAll('[role="option"]')).find(opt => opt.textContent.trim().toUpperCase() === 'USPS');
                    if (uspsOption) {
                        uspsOption.click();
                        await sleep(200);
                        carrierInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                        await GM_setValue(TRACKING_ADD_KEY, null);
                    }
                }
            }
            else if (urlAction === 'ship') {
                 if (window.location.pathname.startsWith('/mesh/ord/details')) {
                    const markAsShippedLink = await waitForElement('div[data-action-id="MARK_SHIPPED"] a');
                    if (markAsShippedLink) markAsShippedLink.click();
                    else setTimeout(() => window.close(), 1000);
                }
                else if (window.location.pathname.startsWith('/om/shipment/update')) {
                    const checkForSuccessAndClose = async () => {
                        if (document.body.textContent.includes('"ack":"SUCCESS"')) {
                            await GM_setValue(CONFIRMED_SHIP_KEY, { orderId: urlOrderId, timestamp: Date.now() });
                            setTimeout(() => window.close(), 250); // Close quickly
                            return true;
                        }
                        return false;
                    };

                    // Attempt 1: Check immediately in case it's already the JSON response
                    if (await checkForSuccessAndClose()) return;

                    // Attempt 2: Set up an observer for changes, as the JSON might load dynamically
                    const observer = new MutationObserver(async (mutations) => {
                        if (await checkForSuccessAndClose()) {
                            observer.disconnect();
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });

                    // Attempt 3: Fallback for the standard confirmation page with a button
                    const confirmButton = await waitForElement('button.btn.btn--primary', el => el.innerText.toLowerCase().includes('confirm'), 5000);
                    if (confirmButton) {
                        observer.disconnect(); // Stop observing, we found the button
                        confirmButton.click();
                        await GM_setValue(CONFIRMED_SHIP_KEY, { orderId: urlOrderId, timestamp: Date.now() });
                        setTimeout(() => window.close(), 1500);
                    } else {
                        // If no button is found after 5s, disconnect the observer
                        setTimeout(() => observer.disconnect(), 5000);
                    }
                }
            }
            else if (urlAction === 'manual_message') {
                console.log('[Manual-Message] Draft insertion mode started.');
                const messageData = await GM_getValue('ebay_manual_message_to_send');
                if (!messageData || messageData.orderId !== urlOrderId) {
                    console.warn('[Manual-Message] No message data or order mismatch.');
                    return;
                }

                const openBtn = await waitForElement('div[data-action-id="MESSAGE_BUYER_PANEL"] button');
                if (!openBtn) { console.error('[Manual-Message] Cannot find Message Buyer button.'); return; }
                openBtn.click();
                console.log('[Manual-Message] Message panel opened, locating textarea…');

                const candidateSelectors = [
                    '#imageupload__sendmessage--textbox',
                    '#textarea',
                    'textarea#imageupload__sendmessage--textbox',
                    'textarea.textbox__control[placeholder*="Send message"]'
                ];
                const findTextarea = (root) => {
                    for (const sel of candidateSelectors) {
                        const el = root.querySelector(sel);
                        if (el) return el;
                    }
                    return null;
                };
                // Wait up to 8s for panel + possible iframe + textarea
                const start = Date.now();
                let textarea = null;
                while ((Date.now() - start) < 8000 && !textarea) {
                    const iframe = document.querySelector('.ordui-m2m-panel__iframe');
                    if (iframe?.contentDocument) textarea = findTextarea(iframe.contentDocument);
                    if (!textarea) textarea = findTextarea(document);
                    if (!textarea) await sleep(150);
                }
                if (!textarea) { console.error('[Manual-Message] Failed to find textarea.'); return; }

                if (messageData.message) {
                    setAndTriggerInputValue(textarea, messageData.message || '');
                    textarea.focus({ preventScroll: true });
                    try { textarea.selectionStart = textarea.selectionEnd = textarea.value.length; } catch(e) {}
                }

                (function activateSendButton(){
                    const rootDoc = textarea.ownerDocument;
                    const sendButtonSelectors = [
                        'button.btn.btn--primary',
                        'button[type="submit"]',
                        'button'
                    ];
                    const locateSendButton = () => {
                        for (const sel of sendButtonSelectors) {
                            const candidates = Array.from(rootDoc.querySelectorAll(sel));
                            const btn = candidates.find(b => /send/i.test(b.textContent || ''));
                            if (btn) return btn;
                        }
                        return null;
                    };
                    const dispatchKey = (type, key) => {
                        textarea.dispatchEvent(new KeyboardEvent(type, { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }));
                    };
                    const spaceSim = () => {
                        dispatchKey('keydown',' ');
                        dispatchKey('keypress',' ');
                        const original = textarea.value;
                        textarea.value = original + ' ';
                        textarea.dispatchEvent(new InputEvent('input', { data: ' ', inputType: 'insertText', bubbles: true }));
                        dispatchKey('keyup',' ');
                        // Remove the space so final text unchanged
                        dispatchKey('keydown','Backspace');
                        dispatchKey('keypress','Backspace');
                        textarea.value = original;
                        textarea.dispatchEvent(new InputEvent('input', { data: null, inputType: 'deleteContentBackward', bubbles: true }));
                        dispatchKey('keyup','Backspace');
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    spaceSim();
                    let attempts = 0;
                    const maxAttempts = 20;
                    const interval = setInterval(() => {
                        attempts++;
                        const btn = locateSendButton();
                        if (btn) {
                            if (btn.disabled) {
                                if (attempts > 5) btn.disabled = false;
                            } else {
                                clearInterval(interval);
                            }
                        }
                        if (attempts === 3) spaceSim();
                        if (attempts >= maxAttempts) clearInterval(interval);
                    }, 100);
                })();

                await GM_setValue('ebay_manual_message_to_send', null);
            }
            else if (urlAction === 'message') {
                 const messageButton = await waitForElement('div[data-action-id="MESSAGE_BUYER_PANEL"] button');
                 if (messageButton) messageButton.click();
            }
            else if (urlAction === 'auto_message') {
                console.log('[Auto-Message] Draft insertion mode started.');
                const messageData = await GM_getValue('ebay_message_to_send');
                if (!messageData || messageData.orderId !== urlOrderId) {
                    console.warn('[Auto-Message] No message data or order mismatch.');
                    return;
                }
                const autoSendEnabled = !!(await GM_getValue(AUTO_SEND_MESSAGES_KEY, false));
                const openBtn = await waitForElement('div[data-action-id="MESSAGE_BUYER_PANEL"] button');
                if (!openBtn) { console.error('[Auto-Message] Cannot find Message Buyer button.'); return; }
                openBtn.click();
                console.log('[Auto-Message] Message panel opened, locating textarea…');
                const candidateSelectors = [
                    '#imageupload__sendmessage--textbox',
                    '#textarea',
                    'textarea#imageupload__sendmessage--textbox',
                    'textarea.textbox__control[placeholder*="Send message"]'
                ];
                const findTextarea = (root) => {
                    for (const sel of candidateSelectors) {
                        const el = root.querySelector(sel);
                        if (el) return el;
                    }
                    return null;
                };
                // Wait up to 8s for panel + possible iframe + textarea
                const start = Date.now();
                let textarea = null;
                while ((Date.now() - start) < 8000 && !textarea) {
                    const iframe = document.querySelector('.ordui-m2m-panel__iframe');
                    if (iframe?.contentDocument) textarea = findTextarea(iframe.contentDocument);
                    if (!textarea) textarea = findTextarea(document);
                    if (!textarea) await sleep(150);
                }
                if (!textarea) { console.error('[Auto-Message] Failed to find textarea.'); return; }
                setAndTriggerInputValue(textarea, messageData.message || '');
                textarea.focus({ preventScroll: true });
                try { textarea.selectionStart = textarea.selectionEnd = textarea.value.length; } catch(e) {}

                // --- Enable Send Button Logic ---
                // Some eBay messaging UIs only enable the Send button after a genuine keystroke.
                // We simulate a user typing a space then deleting it, dispatching the full set of keyboard + input events.
                (function activateSendButton(){
                    const rootDoc = textarea.ownerDocument;
                    const sendButtonSelectors = [
                        'button.btn.btn--primary',
                        'button[type="submit"]',
                        'button'
                    ];
                    const locateSendButton = () => {
                        for (const sel of sendButtonSelectors) {
                            const candidates = Array.from(rootDoc.querySelectorAll(sel));
                            const btn = candidates.find(b => /send/i.test(b.textContent || ''));
                            if (btn) return btn;
                        }
                        return null;
                    };
                    const dispatchKey = (type, key) => {
                        textarea.dispatchEvent(new KeyboardEvent(type, { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true }));
                    };
                    const spaceSim = () => {
                        dispatchKey('keydown',' ');
                        dispatchKey('keypress',' ');
                        const original = textarea.value;
                        textarea.value = original + ' ';
                        textarea.dispatchEvent(new InputEvent('input', { data: ' ', inputType: 'insertText', bubbles: true }));
                        dispatchKey('keyup',' ');
                        // Remove the space so final text unchanged
                        dispatchKey('keydown','Backspace');
                        dispatchKey('keypress','Backspace');
                        textarea.value = original;
                        textarea.dispatchEvent(new InputEvent('input', { data: null, inputType: 'deleteContentBackward', bubbles: true }));
                        dispatchKey('keyup','Backspace');
                        textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    spaceSim();
                    // Poll briefly to force-enable if still disabled (as a fallback)
                    let attempts = 0;
                    const maxAttempts = 20; // ~2s
                    const interval = setInterval(() => {
                        attempts++;
                        const btn = locateSendButton();
                        if (btn) {
                            if (btn.disabled) {
                                // Final fallback: if React didn't pick up events, manually toggle disabled off
                                if (attempts > 5) btn.disabled = false;
                            } else {
                                clearInterval(interval);
                                if (autoSendEnabled) {
                                    console.log('[Auto-Message] Auto-send enabled — clicking Send…');
                                    btn.click();
                                    setTimeout(() => window.close(), 1200);
                                }
                            }
                        }
                        if (attempts === 3) spaceSim(); // reinforce early
                        if (attempts >= maxAttempts) clearInterval(interval);
                    }, 100);
                })();

                if (!autoSendEnabled) console.log('[Auto-Message] Draft inserted and focused. (Manual Send mode)');
                await GM_setValue('ebay_message_to_send', null); // Clear so it doesn't resend if tab reloaded
            }
            else if (urlAction === 'add_note') {
                (async () => {
                    try {
                        const noteData = await GM_getValue(NOTE_ADD_KEY);
                        if (!noteData || noteData.orderId !== urlOrderId) {
                            throw new Error('Note data mismatch or missing.');
                        }

                        await waitForElement('#itemInfo, .status-summary');
                        let addNoteButton = null;

                        const statusSummaryWidget = document.querySelector('.status-summary.widget');
                        if (statusSummaryWidget) {
                            const moreActionsButton = statusSummaryWidget.querySelector('.for-desktop .menu-button__button');
                            if (moreActionsButton) {
                                moreActionsButton.click();
                                addNoteButton = await waitForElement('.menu-button__item[data-action-id="ADD_NOTE"] button');
                            }
                        }

                        if (!addNoteButton) {
                            const itemInfoBlock = await waitForElement('#itemInfo');
                            const titleElement = itemInfoBlock.querySelector('h2.title span.sh-bold');
                            if (titleElement) {
                                if (titleElement.textContent.trim() === 'Item') {
                                    addNoteButton = itemInfoBlock.querySelector('.item-actions .fake-link[aria-label="Add note"]');
                                } else if (titleElement.textContent.trim() === 'Items') {
                                    const firstItemCard = itemInfoBlock.querySelector('.item-card');
                                    if (firstItemCard) {
                                        const moreActionsButton = firstItemCard.querySelector('.for-desktop .menu-button__button');
                                        if (moreActionsButton) {
                                            moreActionsButton.click();
                                            addNoteButton = await waitForElement('.menu-button__item[data-action-id="ADD_NOTE"] button');
                                        }
                                    }
                                }
                            }
                        }

                        if (addNoteButton) {
                            addNoteButton.click();
                            const noteTextarea = await waitForElement('.lightbox-dialog__main textarea');
                            const saveButton = await waitForElement('.lightbox-dialog__footer button.btn--primary');

                            noteTextarea.focus();
                            noteTextarea.value = noteData.note;
                            noteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                            noteTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                            noteTextarea.blur();

                            setTimeout(async () => {
                                saveButton.click();
                                await GM_setValue(CONFIRMED_NOTE_KEY, { orderId: noteData.orderId, status: 'success' });
                                await GM_setValue(NOTE_ADD_KEY, null);
                                setTimeout(() => window.close(), 500);
                            }, 500);
                        } else {
                            throw new Error('Could not find the "Add Note" button on the page.');
                        }
                    } catch (error) {
                        console.error('Error during note automation:', error);
                        const noteData = await GM_getValue(NOTE_ADD_KEY);
                        if (noteData) {
                            await GM_setValue(CONFIRMED_NOTE_KEY, { orderId: noteData.orderId, status: 'error', message: error.message });
                        }
                        // Do not close the tab on error to allow for debugging
                    }
                })();
            }
        })();
    }

    // ===================================================================
    // UTILITY/HELPER FUNCTIONS
    // ===================================================================

    // Returns a new Date advanced by `daysAhead` days; if the result is Sunday, moves to Monday.
    function computeNextShipDateSkippingSunday(daysAhead = 1) {
        const d = new Date();
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() + daysAhead);
        // 0 = Sunday, 1 = Monday, ... 6 = Saturday
        if (d.getDay() === 0) {
            d.setDate(d.getDate() + 1);
        }
        return d;
    }

    function setAndTriggerInputValue(element, value) {
        if (!element) return;
        const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
        valueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function waitForElement(selector, timeout = 10000) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(element);
                }
            }, 100);
            const timer = setTimeout(() => {
                clearInterval(interval);
                console.error(`[waitForElement] Timed out for selector: ${selector}`);
                resolve(null);
            }, timeout);
        });
    }

    function waitForElementInDoc(doc, selector, timeout = 10000) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const element = doc.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(element);
                }
            }, 100);
            const timer = setTimeout(() => {
                clearInterval(interval);
                console.error(`[waitForElementInDoc] Timed out for selector: ${selector}`);
                resolve(null);
            }, timeout);
        });
    }

    function waitForAllElements(selector, timeout = 10000) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    clearInterval(interval);
                    clearTimeout(timer);
                    resolve(elements);
                }
            }, 100);
            const timer = setTimeout(() => {
                clearInterval(interval);
                resolve([]);
            }, timeout);
        });
    }

    function applyTemplate(template, data) {
        return template.replace(/\{([A-Z0-9_]+)\}/g, (m, key) => (key in data ? data[key] : m));
    }

    // --- ADDRESS INTEGRITY VALIDATION ---
    // Checks structural soundness of US and Canadian shipping addresses.
    // Returns an array of human-readable warning strings; empty array = no issues found.
    // All other international addresses are skipped — too many valid formats to lint reliably.
    function validateAddress(lines) {
        const warnings = [];
        if (!lines || lines.length === 0) {
            warnings.push('Address is empty');
            return warnings;
        }

        // Detect country
        const isCanadian = lines.some(l => /^canada$/i.test(l.trim()));

        // Skip non-US, non-Canadian destinations
        const otherInternationalPattern = /^(united kingdom|uk|australia|germany|france|japan|mexico|italy|spain|netherlands|sweden|norway|denmark|finland|new zealand|ireland|portugal|belgium|austria|switzerland|south korea|poland|israel|philippines|singapore|hong kong|taiwan|china|colombia|argentina|chile|peru|costa rica|brazil|india)$/i;
        if (!isCanadian && lines.some(l => otherInternationalPattern.test(l.trim()))) return warnings;

        // Rule 1: minimum line count (name + street + city/province/postal = 3 minimum)
        if (lines.length < 3) {
            warnings.push('Address looks incomplete — fewer than 3 lines');
            return warnings; // further checks would be noise
        }

        // Rule 2: name line should have at least two characters and not be purely numeric
        const nameLine = lines[0].trim();
        if (nameLine.length < 2) {
            warnings.push('Buyer name is missing or too short');
        } else if (/^\d+$/.test(nameLine)) {
            warnings.push('Buyer name line appears to be a number');
        }

        // Rule 3: street line (line index 1) should start with a digit OR be a PO Box
        const streetLine = lines[1].trim();
        const isPOBox = /^p\.?o\.?\s*box\b/i.test(streetLine);
        if (!isPOBox && !/^\d/.test(streetLine)) {
            warnings.push('Street line doesn\'t start with a house/building number');
        }

        // Rule 3b: any line after the name that is purely digits is a standalone street
        // number — almost always means eBay split the number from the street name,
        // producing a duplicate (e.g. "416577" on one line, "416577 flying bridge" on the next).
        const bareNumberLine = lines.slice(1).find(l => /^\d+$/.test(l.trim()));
        if (bareNumberLine) {
            warnings.push(`"${bareNumberLine.trim()}" is a number on its own line — street number may be duplicated`);
        }

        if (isCanadian) {
            // Rule 4 (CA): look for a "City Province A1A 1A1" line.
            // Canadian postal codes follow the pattern: letter-digit-letter space digit-letter-digit.
            const cszPattern = /^(.+?)\s+([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i;
            const cszLine = lines.find(l => cszPattern.test(l.trim()));

            if (!cszLine) {
                warnings.push('No city/province/postal code line found (expected: "City ON A1A 1A1")');
            } else {
                const match = cszLine.trim().match(cszPattern);
                if (match) {
                    // Rule 5 (CA): validate province/territory abbreviation
                    const VALID_CA_PROVINCES = new Set([
                        'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'
                    ]);
                    const province = match[2].toUpperCase();
                    if (!VALID_CA_PROVINCES.has(province)) {
                        warnings.push(`Unrecognized Canadian province/territory code: "${province}"`);
                    }
                }
            }
        } else {
            // Rule 4 (US): look for a "City ST 12345" line.
            // eBay omits the comma between city and state, so the comma is optional here.
            const cszPattern = /^(.+?)(?:,)?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i;
            const cszLine = lines.find(l => cszPattern.test(l.trim()));

            if (!cszLine) {
                warnings.push('No city/state/ZIP line found (expected: "City ST 12345")');
            } else {
                const match = cszLine.trim().match(cszPattern);
                if (match) {
                    // Rule 5 (US): validate state/territory abbreviation
                    const VALID_US_STATES = new Set([
                        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
                        'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
                        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
                        'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
                        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
                        'DC','PR','GU','VI','AS','MP','AA','AE','AP'
                    ]);
                    const stateCode = match[2].toUpperCase();
                    if (!VALID_US_STATES.has(stateCode)) {
                        warnings.push(`Unrecognized state/territory code: "${stateCode}"`);
                    }
                }
            }
        }

        return warnings;
    }
    // --- END ADDRESS INTEGRITY VALIDATION ---

    // --- CUSTOM ENVELOPE FEATURE ---
    // Parses a free-form address block into structured fields.
    // Handles name, street, apt/unit/suite/extra line, city+state+zip, and country.
    function parseAddressBlock(text) {
        const result = { name: '', street: '', line2: '', cityStateZip: '', country: '' };
        if (!text || !text.trim()) return result;

        // Split into non-empty lines, trimming each
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return result;

        // Known country names / codes (common destinations)
        const countryPatterns = /^(united states|usa|us|canada|ca|mexico|mx|united kingdom|uk|australia|au|germany|de|france|fr|japan|jp|brazil|br|india|in|italy|it|spain|es|netherlands|nl|sweden|se|norway|no|denmark|dk|finland|fi|new zealand|nz|ireland|ie|portugal|pt|belgium|be|austria|at|switzerland|ch|south korea|kr|poland|pl|czech republic|cz|israel|il|puerto rico|pr|philippines|ph|singapore|sg|hong kong|hk|taiwan|tw|china|cn|colombia|co|argentina|ar|chile|cl|peru|pe|costa rica|cr)$/i;

        // City + State + ZIP pattern (US-style: "City, ST 12345" or "City, ST 12345-6789")
        const cityStateZipPattern = /^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i;

        // Secondary address line indicators
        const line2Pattern = /^(apt\.?|apartment|unit|suite|ste\.?|bldg\.?|building|floor|fl\.?|room|rm\.?|lot|front\s*door|back\s*door|side\s*door|gate|door|c\/?o\b|attn:?)/i;

        // Detect which line is the city/state/zip
        let cszIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (cityStateZipPattern.test(lines[i])) { cszIndex = i; break; }
        }

        // Detect country line (usually last)
        let countryIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (countryPatterns.test(lines[i])) { countryIndex = i; break; }
        }

        // If no city/state/zip pattern found, try a looser heuristic:
        // a line with a comma followed by 2-letter code (state/province) near the end
        if (cszIndex === -1) {
            const looseCSZ = /^(.+),\s*([A-Z]{2})\b/i;
            for (let i = lines.length - 1; i >= 1; i--) {
                if (i === countryIndex) continue;
                if (looseCSZ.test(lines[i])) { cszIndex = i; break; }
            }
        }

        // Assign fields based on detected landmarks
        // Line 0 is always the name
        result.name = lines[0] || '';

        if (cszIndex > 0) {
            // Everything between name and csz is address lines
            const addressLines = lines.slice(1, cszIndex);
            if (addressLines.length >= 2) {
                result.street = addressLines[0];
                result.line2 = addressLines.slice(1).join(', ');
            } else if (addressLines.length === 1) {
                result.street = addressLines[0];
            }
            result.cityStateZip = lines[cszIndex];
        } else {
            // No csz detected — assign by position heuristics
            if (lines.length >= 2) result.street = lines[1];
            if (lines.length >= 3) {
                // Check if line 2 looks like a secondary line
                const remaining = lines.slice(2, countryIndex > 0 ? countryIndex : undefined);
                if (remaining.length >= 2) {
                    // Check if first remaining is apt-like
                    if (line2Pattern.test(remaining[0])) {
                        result.line2 = remaining[0];
                        result.cityStateZip = remaining.slice(1).join(', ');
                    } else {
                        result.street = lines[1];
                        result.line2 = remaining[0];
                        result.cityStateZip = remaining.slice(1).join(', ');
                    }
                } else if (remaining.length === 1) {
                    if (line2Pattern.test(remaining[0])) {
                        result.line2 = remaining[0];
                    } else {
                        result.cityStateZip = remaining[0];
                    }
                }
            }
        }

        if (countryIndex > 0) {
            result.country = lines[countryIndex];
        }

        return result;
    }
    // --- END CUSTOM ENVELOPE FEATURE (utility) ---

})();