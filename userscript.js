// ==UserScript==
// @name         Altheastix eBay pick-and-pack workflow optimizer
// @namespace    http://tampermonkey.net/
// @version      20260825-v4.321-select-all-sync
// @description  A nicer redesign of the eBay bulk shipping page with a polished, modern address box. Logic is now decoupled from configuration (templates/quotes) via external Gist.
// @author       Javier, with modifications from Grok, Gemini, Claude, and GitHub Copilot <3
// @match        https://gslblui.ebay.com/gslblui/bulk
// @match        https://www.ebay.com/ship/bulk*
// @match        https://www.ebay.com/mesh/ord/details*
// @match        https://www.ebay.com/om/shipment/update*
// @match        https://www.ebay.com/ship/trk/*
// @match        https://www.ebay.com/ship/tr/update*
// @match        https://www.ebay.com/ship/single/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ebay.com
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @connect      ebay.com
// @connect      www.ebay.com
// @grant        window.close
// @require      https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/altheastix-ebay-config.js
// @updateURL    https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/userscript.js
// @downloadURL  https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/userscript.js
// ==/UserScript==

// Changelog: see src/CHANGELOG.md in the repository.

(function() {
    'use strict';

    // ===================================================================
    // GLOBAL CONSTANTS & STORAGE KEYS
    // ===================================================================
    const CONFIRMED_SHIP_KEY = 'ebay_order_shipped_confirmed';
    // Counterpart to CONFIRMED_SHIP_KEY. Ship used to be the only automation
    // with no failure channel at all: the watchdog bannered its own tab and
    // wrote nothing, so a card whose ship tab died sat forever showing a green
    // check. Notes have had `status: 'error'` for ages; ship now matches.
    const SHIP_FAILED_KEY = 'ebay_order_ship_failed';
    // How a buyer message actually ended up: sent, left as a draft, or failed.
    const MESSAGE_RESULT_KEY = 'ebay_message_result';
    // A message tab that cannot open eBay's composer reloads itself this many
    // times before giving up. Kept at 1: the tab is opened in the FOREGROUND so
    // paste/auto-send has focus, and during a batch a tab that retries for too
    // long outlives its own order and starts fighting the next one for focus.
    const MESSAGE_PANEL_MAX_RETRIES = 1;
    // Captured at load, NOT read later: the reload URL is deliberately rebuilt
    // from held values because eBay's SPA may rewrite location.search, and the
    // counter that bounds the reload loop must not be read from that same
    // untrusted source — if it vanished mid-page the guard would fail open and
    // the tab would reload forever.
    const MSG_RETRY_AT_LOAD = Math.max(0,
        parseInt(new URLSearchParams(window.location.search).get('tm_msg_retry') || '0', 10) || 0);
    const TRACKING_ADD_KEY = 'ebay_tracking_to_add';
    const TRACKING_ADD_KEY_V2 = 'ebay_tracking_to_add_v2';
    const NOTE_ADD_KEY = 'ebay_note_to_add';
    const CONFIRMED_NOTE_KEY = 'ebay_note_confirmed';
    const AUTO_SEND_MESSAGES_KEY = 'ebay_auto_send_messages';
    const MESSAGE_SEND_KEY = 'ebay_message_to_send';
    const MANUAL_MESSAGE_SEND_KEY = 'ebay_manual_message_to_send';

    // ===================================================================
    // USER CONFIGURATION (Local Preferences)
    // ===================================================================
    const USER_CONFIG = {
        returnAddress: "Altheastix ⚡<br>3015 E Howell St.<br>Seattle, WA 98122<br>USA",
        trackingOrderAmountThreshold: 25,
        useAlternativeTracking: true,
        scriptLoadDelay: 15 * 1000,
        defaultTrackingNumber: "9114 9023 0722 4938 6961 ",
        enableDarkModeByDefault: true,
        enableQuotesInMessages: true,
        // How long an automation tab (mark-as-shipped, note, tracking,
        // message) may run before it gives up and flags itself instead of
        // sitting there looking finished.
        automationTabTimeoutSeconds: 45,
        // --- Order watch ---
        // Polls eBay's own "orders awaiting shipment" list in the background
        // and offers a refresh when a sale lands after this page was loaded.
        // Set enableOrderWatch to false to switch the whole thing off.
        enableOrderWatch: true,
        orderWatchIntervalMinutes: 5,
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
                ordersContainer: '.card.select-service', orderItem: '.orders-list__item', buttonList: '.button-list', header: '.site-header', headerTop: '.site-header__top', headerBottom: '.site-header__bottom', headerBottomH1: '.site-header__bottom h1', headerLogo: '.site-header__top .ebay-logo', bulkLabelsAppCard: '#bulk-labels-app .card.select-service', combineOrdersButton: '.service-actions__combine-all', tcellItem: '.tcell__item', tcellTransaction: '.tcell__transaction', buyerCell: '.tcell__buyer', itemImage: '.item__image img', itemDescription: '.item__description', itemDetailsContainer: '[class*="item__details"]', checkbox: '.checkbox__control', addressActions: '.piped-links.address__actions', orderIdContainer: '.unique_order_id_container', buyerPaidService: '.buyer-paid-service', reviseLink: 'a[href*="revise"]', uniqueOrderIdLink: '.unique-order-id a', pageFooter: 'footer', removableNotices: '.section-notice--attention, .section-notice__main, .page-announcement, .section-notice, .section-notice--information', groupingSummary: '.grouping_summary', serviceActions: '.service-actions', ordersFilters: '.orders-filters', batchSelect: '.batch-select', selectAllCheckbox: '#select-all, [data-testid="bulk-order-filters-toggle-all"]', sortOrderSelector: '.sort-order-selector', listboxButtonForm: '.listbox-button .btn.btn--form', listboxIcon: '.listbox-button .btn.btn--form .icon', listboxDropdown: '.listbox-button .listbox-button__listbox', listboxOption: '.listbox-button .listbox-button__option', listboxSelectedIcon: '.listbox-button__option[aria-selected="true"] .icon--tick-small', skuPanelTitle: '#SKUListContainer h2.sku-title', skuPanelToggles: '.sku-toggles', gridGroup: '.grid__group'
            },
            ids: {
                copyAddressButton: 'copyAddressButton', editAddressButton: 'editAddressButton', createTemplateButton: 'createTemplateButton', printEnvelopeHTML: 'HTMLEnvelopeToPrint', printAllEnvelopesButton: 'printAllEnvelopesButton', skuPanelContainer: 'SKUListContainer', skuList: 'SKUsToPackContainer', skuContentWrapper: 'sku-content-wrapper'
            },
            classNames: {
                addressContainer: 'en-US', editAddressBtn: 'edit-address-btn', cancelAddressBtn: 'cancel-address-btn', copyAddressBtn: 'copy-address-btn', addressEditInput: 'address-edit-input', cancelWrapper: 'cancel-wrapper', addressFullname: 'print__address__fullname', itemContainer: 'item', shippingInfoBlock: 'shipping-info-block', buyerNoteCallout: 'buyer-note-callout', quantityMulti: 'quantity-multi', markAsShippedBtn: 'mark-as-shipped-btn', isEditingAddress: 'is-editing-address', highlightManila: 'order-highlight-manila', highlightLg: 'order-highlight-lg', highlightMultiItem: 'order-highlight-multi-item', borderLg: 'order-border-lg', borderManila: 'order-border-manila', highlightYellow: 'highlight-yellow', skuItem: 'sku-item', skuGroupSeparator: 'sku-group-separator', skuLg: 'sku-lg', skuManila: 'sku-manila', skuMultiQty: 'sku-multi-qty', multiItemSkuOrder: 'order-multi-item', darkModeSwitch: 'dark-mode-switch', darkModeSlider: 'slider', zoomOverlay: 'zoomed-image-overlay', zoomContainer: 'zoomed-image-container', zoomImage: 'zoomed-image', zoomCloseButton: 'close-zoom-button',
                printEnvelopeBtn: 'print-envelope-btn', markAsShippedWaiting: 'waiting-confirmation', orderShipped: 'shipped-state', shippedLabel: 'shipped-label', orderPendingShipment: 'order-pending-shipment', pendingOverlay: 'pending-overlay', pendingOverlayContent: 'pending-overlay-content', processingIcon: 'processing-icon', skuShipped: 'sku-shipped', addTrackingLink: 'add-tracking-link', trackingLinkSubmitted: 'tracking-link-submitted', reviseLink: 'revise-link', addNoteLink: 'add-note-link', noteLinkSubmitted: 'note-link-submitted',
                orderShipFailed: 'ship-failed-state', shipFailedBanner: 'ship-failed-banner', shipQueuedBadge: 'ship-queued-badge', shipSelectedBtn: 'ship-selected-btn',
                msgFailedPill: 'msg-failed-pill',
                orderWatchPill: 'order-watch-pill', orderWatchPillAction: 'order-watch-pill-action',
                orderWatchStatus: 'order-watch-status', orderWatchStatusLabel: 'order-watch-status-label', orderWatchStatusAction: 'order-watch-status-action', orderWatchStatusWarn: 'order-watch-status-warn',
                messageContainer: 'message-container', cannedMessageSelect: 'canned-message-select', sendCannedMessageBtn: 'send-canned-message-btn', buyLabelLink: 'buy-label-link',
                shipsLabelPill: 'ships-label-pill', shipsLabelActive: 'ships-label-active', batchSelectBtn: 'batch-select-btn', selectBatchBtnDisabled: 'select-batch-btn-disabled',
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
                'canned1': "Hi {BUYER_FIRST}. Thanks for your order. Wanted to let you know that due to sudden high demand we ran out of these {STICKER_NAME} stickers, so your order won't ship until roughly {ARRIVAL_DATE}.\n\nIf you can wait, thanks a lot for it — we'll toss in a {SURPRISE_STICKER} sticker as a gift for the hassle, and we'll ship ASAP and personally let you know the moment it goes out. If you're not cool with waiting, we can issue a refund, no questions asked. Either way, just let us know.\n\nThanks a lot for your patience and apologies! These stickers have been a whole hit.\n\nA.\n\nP.S. eBay may auto-send you a shipping notice before the sticker actually leaves — feel free to ignore it. Ours is the one that counts.",
                'canned3': "Hi {BUYER_FIRST}. Thanks for your order. Wanted to let you know that due to sudden high demand we ran out of these {STICKER_NAME} stickers, so your order won't ship until roughly {ARRIVAL_DATE}.\n\nIf you can wait, thanks a lot for it — we'll ship ASAP and personally let you know the moment it goes out. If you're not cool with waiting, we can issue a refund, no questions asked. Either way, just let us know.\n\nThanks a lot for your patience and apologies! These stickers have been a whole hit.\n\nA.\n\nP.S. eBay may auto-send you a shipping notice before the sticker actually leaves — feel free to ignore it. Ours is the one that counts.",
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
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-variant-numeric: tabular-nums; background-color: ${isDarkMode ? '#1a1a1a' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                ${CONFIG.selectors.groupingSummary}, .tag--combined { display: none !important; }
                .service-actions__wrapper.sticky.sticky-full-width { display: none !important; }
                .tcell__delivery-service-type, .tcell__proof-of-delivery, .tcell__price-status { display: none !important; }
                .service-actions__pay { display: none !important; }
                [data-testid="customs-form-acknowledgement"] { display: none !important; }
                #${CONFIG.ids.skuPanelContainer} { position: fixed; top: 110px; width: 360px; max-height: calc(100vh - 130px); overflow-y: auto; z-index: 1000; background: ${isDarkMode ? '#2a2a2a' : '#fdfdfd'}; padding: 0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid ${isDarkMode ? '#444' : '#ddd'}; transition: top 0.3s ease-in-out; }
                #altheastix-config-container { position: fixed; width: 360px; z-index: 1000; background: ${isDarkMode ? '#2a2a2a' : '#fdfdfd'}; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid ${isDarkMode ? '#444' : '#ddd'}; transition: top 0.3s ease-in-out; }
                ${CONFIG.selectors.skuPanelTitle} { position: sticky; top: 0; background: ${isDarkMode ? '#333' : '#f5f5f5'}; z-index: 1; margin: 0; padding: 12px 15px; font-size: 16px; border-bottom: 1px solid ${isDarkMode ? '#444' : '#ddd'}; display: flex; justify-content: space-between; align-items: center; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                ${CONFIG.selectors.skuPanelToggles} { display: flex; gap: 10px; align-items: center; }
                /* Every rule below is anchored on the panel id on purpose.
                   eBay's own stylesheet reaches into this panel, and the pill
                   used to be an <a href="<this page>"> — a permanently
                   "visited" link, which :visited repainted magenta no matter
                   what colour this file asked for. It is a div now, and these
                   selectors outrank anything eBay sets on bare elements. */
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchPill} { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 12px 2px; padding: 9px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; line-height: 1.3; text-decoration: none; cursor: pointer; background: ${isDarkMode ? '#1d3550' : '#f0f6ff'}; color: ${isDarkMode ? '#dbeaff' : '#16457f'}; border: 1px solid ${isDarkMode ? '#35618f' : '#bcd7f7'}; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchPill}:hover { background: ${isDarkMode ? '#244267' : '#e2eeff'}; border-color: ${isDarkMode ? '#4478ac' : '#9dc3ef'}; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchPill} span { color: inherit; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchPillAction} { text-decoration: underline; font-weight: 700; white-space: nowrap; color: ${isDarkMode ? '#a9cdff' : '#1462be'} !important; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchStatus} { display: flex; align-items: center; gap: 5px; margin: 4px 14px 9px; font-size: 11px; line-height: 1.4; color: ${isDarkMode ? '#7a7a7a' : '#a0a0a0'}; user-select: none; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchStatus} span { color: inherit; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchStatus}.${CONFIG.classNames.orderWatchStatusWarn} { color: ${isDarkMode ? '#d99e3c' : '#9a6a08'}; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchStatusAction} { cursor: pointer; text-decoration: underline; }
                #${CONFIG.ids.skuPanelContainer} .${CONFIG.classNames.orderWatchStatusAction}:hover { color: ${isDarkMode ? '#e8e8e8' : '#333'} !important; }
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
                #altheastix-address-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-bottom: 10px; padding: 6px 14px; border-radius: 8px; font-size: 12px; line-height: 1.5; background: ${isDarkMode ? 'rgba(255,179,71,0.1)' : '#fef3c7'}; border: 1px solid ${isDarkMode ? '#c97d20' : '#f59e0b'}; color: ${isDarkMode ? '#FFD580' : '#78350f'}; }
                #altheastix-scroll-top-btn { position: fixed; bottom: 20px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid ${isDarkMode ? '#555' : '#ccc'}; background: ${isDarkMode ? '#333' : '#fff'}; color: ${isDarkMode ? '#e0e0e0' : '#444'}; font-size: 16px; line-height: 1; cursor: pointer; z-index: 1001; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2); opacity: 0; pointer-events: none; transition: opacity 0.2s ease, background 0.15s ease; }
                #altheastix-scroll-top-btn.visible { opacity: 1; pointer-events: auto; }
                #altheastix-scroll-top-btn:hover { background: ${isDarkMode ? '#444' : '#f0f0f0'}; }
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
                ${CONFIG.selectors.buyerCell} { width: 235px !important; flex: 0 0 235px; box-sizing: border-box; min-width: 0; border: 1px solid ${isDarkMode ? '#555' : '#e0e0e0'}; border-radius: 8px; padding: .5rem !important; background-color: ${isDarkMode ? '#333' : '#fff'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); font-size: 11pt; color: ${isDarkMode ? '#e0e0e0' : '#000'}; }
                .${CONFIG.classNames.shippingInfoBlock} { margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid ${isDarkMode ? '#444' : '#eee'}; }
                .${CONFIG.classNames.shippingInfoBlock} p { margin: 0; font-size: 13px; color: ${isDarkMode ? '#b0b0b0' : '#555'}; white-space: normal; word-break: break-word; overflow-wrap: anywhere; text-decoration: none; }
                .${CONFIG.classNames.shippingInfoBlock} p a:not(.${CONFIG.classNames.addTrackingLink}):not(.${CONFIG.classNames.addNoteLink}) { text-decoration: underline; }
                .${CONFIG.classNames.shippingInfoBlock} span { vertical-align: top; }
                .${CONFIG.classNames.shippingInfoBlock} ${CONFIG.selectors.uniqueOrderIdLink} { font-weight: bold; color: ${isDarkMode ? '#99ccff' : '#003087'}; }
                .${CONFIG.classNames.buyerNoteCallout} { display: flex; align-items: flex-start; gap: 8px; margin: -2px 0 10px; padding: 8px 12px; border-radius: 8px; border-left: 3px solid ${isDarkMode ? '#c97d20' : '#f59e0b'}; background: ${isDarkMode ? 'rgba(255,179,71,0.08)' : '#fffbeb'}; font-size: 13px; line-height: 1.45; color: ${isDarkMode ? '#FFD580' : '#78350f'}; }
                .${CONFIG.classNames.buyerNoteCallout} .buyer-note-icon { flex: 0 0 auto; font-size: 14px; line-height: 1.4; }
                .${CONFIG.classNames.buyerNoteCallout} .buyer-note-text { font-style: italic; word-break: break-word; }
                .${CONFIG.classNames.buyerNoteCallout} .buyer-note-label { font-style: normal; font-weight: 600; opacity: 0.8; margin-right: 4px; }
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
                .${CONFIG.classNames.buyLabelLink} {
                    display: block; margin-top: 6px; font-size: 13px; font-weight: 600;
                    color: ${isDarkMode ? '#5a82f5' : '#0070d2'}; text-decoration: none; cursor: pointer;
                }
                .${CONFIG.classNames.buyLabelLink}:hover { text-decoration: underline; }
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
                .${CONFIG.classNames.shipsLabelPill} {
                    display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 12px;
                    font-size: 11px; font-weight: bold; cursor: pointer; user-select: none; white-space: nowrap;
                    background-color: ${isDarkMode ? '#3a3a3a' : '#eef0f2'}; color: ${isDarkMode ? '#8a8a8a' : '#9aa0a6'};
                    border: 1px solid ${isDarkMode ? '#555' : '#d5d9dd'}; opacity: 0.7; transition: all 0.2s ease;
                }
                .${CONFIG.classNames.shipsLabelPill}:hover { opacity: 1; }
                .${CONFIG.classNames.shipsLabelPill}.${CONFIG.classNames.shipsLabelActive} {
                    background-color: ${isDarkMode ? '#2c3e5a' : '#E1ECFF'}; color: ${isDarkMode ? '#78BFFF' : '#0b5cad'};
                    border-color: ${isDarkMode ? '#3f5a86' : '#B7CCF0'}; opacity: 1;
                }
                .${CONFIG.classNames.batchSelectBtn} {
                    /* Measured, not guessed. eBay's "Select all" label is
                       baseline-aligned at 12.8px/16px; two earlier attempts here
                       CENTRED these controls instead (align-self:center,
                       vertical-align:middle) at 13px/15.6px. Centring two boxes of
                       different type scales cannot align their baselines — it
                       splits the difference, which was the ~1px drift. Baseline
                       alignment at the label's own metrics measures to 0.00 on
                       both baseline and centre. syncBatchBtnTypography() re-reads
                       those metrics from the live label at render time, so this
                       survives eBay changing its type scale. */
                    display: inline; align-self: baseline; vertical-align: baseline;
                    font-size: 12.8px; line-height: 16px;
                    margin-left: 16px; font-weight: 600; text-decoration: none; cursor: pointer;
                    white-space: nowrap; user-select: none; color: ${isDarkMode ? '#78BFFF' : '#3665f3'};
                }
                .${CONFIG.classNames.batchSelectBtn}:hover { text-decoration: underline; }
                /* Disabled, not hidden — the bar keeps its shape and the count
                   tells you the filter is empty rather than broken. */
                .${CONFIG.classNames.batchSelectBtn}.${CONFIG.classNames.selectBatchBtnDisabled} {
                    color: ${isDarkMode ? '#5f5f5f' : '#b0b0b0'}; cursor: default; opacity: 0.85;
                }
                .${CONFIG.classNames.batchSelectBtn}.${CONFIG.classNames.selectBatchBtnDisabled}:hover { text-decoration: none; }
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
                .ship-when-caption { font-size: 11px; color: ${isDarkMode ? '#aaa' : '#666'}; margin-bottom: 4px; }
                .ship-when-label { font-size: 10px; color: ${isDarkMode ? '#aaa' : '#666'}; white-space: nowrap; flex: 0 0 auto; }
                .ship-when-row { display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; min-width: 0; }
                .ship-when-seg { display: inline-flex; flex: 0 0 auto; max-width: 100%; border: 1px solid ${isDarkMode ? '#555' : '#ccc'}; border-radius: 999px; overflow: hidden; }
                .ship-when-btn { padding: 3px 8px; font-size: 10px; font-weight: 500; line-height: 1.2; white-space: nowrap; flex: 0 0 auto; background-color: ${isDarkMode ? '#2a2a2a' : '#fff'}; color: ${isDarkMode ? '#bbb' : '#555'}; border: none; cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease; }
                .ship-when-btn + .ship-when-btn { border-left: 1px solid ${isDarkMode ? '#555' : '#ccc'}; }
                .ship-when-btn.ship-when-active { background-color: ${isDarkMode ? '#3665f3' : '#0070d2'}; color: #fff; }
                .ship-when-btn:hover:not(.ship-when-active) { background-color: ${isDarkMode ? '#3a3a3a' : '#f0f0f0'}; }
                .ship-when-preview { font-size: 10px; color: ${isDarkMode ? '#aaa' : '#666'}; white-space: nowrap; flex: 0 0 auto; }
                .is-msg-disabled { opacity: 0.45; pointer-events: none; }
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
                    border: 1px solid ${isDarkMode ? '#3f7a55' : '#9bcdb0'};
                    background-color: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    color: ${isDarkMode ? '#5fd98a' : '#0c7a3e'};
                    font-weight: 600;
                    box-sizing: border-box;
                }
                .canned-modal-input::placeholder {
                    color: ${isDarkMode ? '#8a8a8a' : '#999'};
                    font-weight: 400;
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
                .canned-modal-preview-label {
                    font-size: 11px; font-weight: bold; text-transform: uppercase;
                    letter-spacing: 0.6px; margin-bottom: -8px;
                    color: ${isDarkMode ? '#9aa0a6' : '#666'};
                }
                .canned-modal-preview {
                    white-space: pre-wrap; word-break: break-word;
                    background-color: ${isDarkMode ? '#1f1f1f' : '#f6f7f8'};
                    border: 1px dashed ${isDarkMode ? '#666' : '#bbb'};
                    border-radius: 6px;
                    padding: 10px 12px;
                    font-size: 13px; line-height: 1.45;
                    min-height: 40px; max-height: 240px; overflow-y: auto;
                    color: ${isDarkMode ? '#d0d0d0' : '#222'};
                }
                .canned-modal-token {
                    color: ${isDarkMode ? '#5fd98a' : '#0c7a3e'};
                    font-weight: 600;
                }
                .canned-modal-pill {
                    display: inline-block;
                    padding: 1px 8px; margin: 0 1px;
                    border-radius: 9px;
                    font-size: 11px; font-weight: 600; line-height: 1.5;
                    color: ${isDarkMode ? '#5fd98a' : '#0c7a3e'};
                    background-color: ${isDarkMode ? 'rgba(95,217,138,0.14)' : 'rgba(12,122,62,0.10)'};
                    border: 1px dashed ${isDarkMode ? '#3f7a55' : '#9bcdb0'};
                }
                .canned-modal-preview[contenteditable] { cursor: text; }
                .canned-modal-preview:focus {
                    outline: none;
                    border-style: solid;
                    border-color: ${isDarkMode ? '#3665f3' : '#0070d2'};
                }
                .canned-modal-preview-status {
                    text-transform: none; letter-spacing: normal; font-weight: 400;
                    color: ${isDarkMode ? '#e8b74a' : '#a15c00'};
                }
                .canned-modal-preview-status a {
                    color: inherit; text-decoration: underline; cursor: pointer;
                }

                /* --- Ship states: requested / confirmed / failed ---
                   The pending overlay used to draw a green ✔ and the words
                   "Marked as Shipped" the instant you clicked, which is
                   indistinguishable from a real confirmation. It is now an
                   amber spinner that says what it is actually doing. */
                @keyframes altheastix-spin { to { transform: rotate(360deg); } }
                .${CONFIG.classNames.processingIcon} {
                    background-color: ${isDarkMode ? '#b45309' : '#d97706'};
                    border: 3px solid rgba(255,255,255,0.3);
                    border-top-color: #fff;
                    font-size: 0 !important;
                    animation: altheastix-spin 900ms linear infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .${CONFIG.classNames.processingIcon} { animation: none; }
                }
                .${CONFIG.classNames.pendingOverlay} .pending-sub {
                    font-size: 11px; font-weight: 400; opacity: 0.75;
                    font-variant-numeric: tabular-nums;
                }
                ${CONFIG.selectors.orderItem}.${CONFIG.classNames.orderShipFailed} {
                    border-left: 5px solid ${isDarkMode ? '#f87171' : '#dc2626'};
                }
                .${CONFIG.classNames.shipFailedBanner} {
                    display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
                    width: 100%; margin-top: 10px; padding: 9px 12px; border-radius: 6px;
                    font-size: 13px; line-height: 1.4;
                    background: ${isDarkMode ? 'rgba(248,113,113,0.12)' : '#fef2f2'};
                    border: 1px solid ${isDarkMode ? '#7f3a3a' : '#fecaca'};
                    color: ${isDarkMode ? '#fca5a5' : '#991b1b'};
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-failed-text { flex: 1 1 160px; min-width: 0; }
                .${CONFIG.classNames.shipFailedBanner} .ship-failed-why {
                    display: block; font-size: 11px; opacity: 0.8; font-weight: 400;
                }
                .${CONFIG.classNames.shipFailedBanner} button,
                .${CONFIG.classNames.shipFailedBanner} a {
                    font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 5px;
                    cursor: pointer; text-decoration: none; white-space: nowrap; border: 1px solid transparent;
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-retry-btn {
                    background: ${isDarkMode ? '#b91c1c' : '#dc2626'}; color: #fff;
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-retry-btn:hover {
                    background: ${isDarkMode ? '#dc2626' : '#b91c1c'};
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-open-link {
                    background: transparent; color: inherit;
                    border-color: ${isDarkMode ? '#7f3a3a' : '#fecaca'};
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-dismiss-btn {
                    background: transparent; color: inherit; opacity: 0.7; border: none;
                }
                .${CONFIG.classNames.shipFailedBanner} .ship-dismiss-btn:hover { opacity: 1; }
                .${CONFIG.classNames.shipQueuedBadge} {
                    display: block; width: 100%; margin-top: 10px; padding: 8px 12px;
                    font-size: 13px; font-weight: 700; text-align: center; border-radius: 6px;
                    background: ${isDarkMode ? '#3a3a3a' : '#f1f5f9'};
                    color: ${isDarkMode ? '#aaa' : '#64748b'};
                    border: 1px dashed ${isDarkMode ? '#555' : '#cbd5e1'};
                }

                /* --- Batch ship: panel button + progress dock --- */
                .${CONFIG.classNames.shipSelectedBtn} {
                    display: block; width: 100%; margin-top: 8px; padding: 8px 12px;
                    font-size: 14px; font-weight: 700; text-align: center; cursor: pointer;
                    border-radius: 4px; transition: all 150ms ease-in-out;
                    color: #fff; border: 2px solid transparent;
                    background: ${isDarkMode ? '#3665f3' : '#0070d2'};
                }
                .${CONFIG.classNames.shipSelectedBtn}:hover {
                    background: ${isDarkMode ? '#5a82f5' : '#005fb8'};
                }
                .${CONFIG.classNames.shipSelectedBtn}[disabled] {
                    background: ${isDarkMode ? '#555' : '#ccc'};
                    color: ${isDarkMode ? '#999' : '#666'}; cursor: not-allowed;
                }
                #altheastix-ship-dock {
                    position: fixed; bottom: 20px; width: 360px; z-index: 1002;
                    background: ${isDarkMode ? '#2a2a2a' : '#fdfdfd'};
                    border: 1px solid ${isDarkMode ? '#444' : '#ddd'};
                    border-radius: 12px; padding: 12px 15px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.22);
                    font-size: 13px; color: ${isDarkMode ? '#e0e0e0' : '#222'};
                    display: none;
                }
                #altheastix-ship-dock.visible { display: block; }
                #altheastix-ship-dock .dock-title {
                    font-weight: 700; font-size: 13px; display: flex;
                    align-items: center; justify-content: space-between; gap: 8px;
                }
                #altheastix-ship-dock .dock-counts {
                    margin-top: 6px; font-size: 12px; font-variant-numeric: tabular-nums;
                    color: ${isDarkMode ? '#aaa' : '#666'};
                }
                #altheastix-ship-dock .dock-counts .ok   { color: ${isDarkMode ? '#7fc79e' : '#2e7d32'}; font-weight: 700; }
                #altheastix-ship-dock .dock-counts .bad  { color: ${isDarkMode ? '#fca5a5' : '#dc2626'}; font-weight: 700; }
                #altheastix-ship-dock .dock-bar {
                    margin-top: 8px; height: 6px; border-radius: 3px; overflow: hidden;
                    background: ${isDarkMode ? '#3a3a3a' : '#e8eaed'};
                }
                #altheastix-ship-dock .dock-bar-fill {
                    height: 100%; width: 0%; border-radius: 3px;
                    background: ${isDarkMode ? '#3665f3' : '#0070d2'};
                    transition: width 250ms ease;
                }
                #altheastix-ship-dock .dock-actions {
                    margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;
                }
                #altheastix-ship-dock .dock-actions button {
                    font-size: 12px; font-weight: 700; padding: 5px 11px; border-radius: 5px;
                    cursor: pointer; border: 1px solid ${isDarkMode ? '#555' : '#ccc'};
                    background: ${isDarkMode ? '#3a3a3a' : '#fff'};
                    color: ${isDarkMode ? '#e0e0e0' : '#272C34'};
                }
                #altheastix-ship-dock .dock-actions button:hover {
                    background: ${isDarkMode ? '#4a4a4a' : '#f0f0f0'};
                }
                #altheastix-ship-dock .dock-actions .dock-stop {
                    border-color: ${isDarkMode ? '#7f3a3a' : '#fecaca'};
                    color: ${isDarkMode ? '#fca5a5' : '#991b1b'};
                }

                /* --- Message outcome ---
                   An order can ship perfectly and still leave the buyer with
                   nothing, if eBay's composer never opened. The card says so
                   rather than showing an unqualified green tick. */
                .${CONFIG.classNames.msgFailedPill} {
                    display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
                    width: 100%; margin-top: 8px; padding: 7px 10px; border-radius: 6px;
                    font-size: 12px; line-height: 1.4;
                    background: ${isDarkMode ? 'rgba(255,179,71,0.12)' : '#fffbeb'};
                    border: 1px solid ${isDarkMode ? '#c97d20' : '#fcd34d'};
                    color: ${isDarkMode ? '#FFD580' : '#78350f'};
                }
                .${CONFIG.classNames.msgFailedPill} .msg-failed-text { flex: 1 1 130px; min-width: 0; font-weight: 600; }
                .${CONFIG.classNames.msgFailedPill} .msg-failed-why {
                    display: block; font-size: 11px; font-weight: 400; opacity: 0.85;
                }
                .${CONFIG.classNames.msgFailedPill} button {
                    font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 5px;
                    cursor: pointer; white-space: nowrap; border: 1px solid transparent;
                    background: ${isDarkMode ? '#b45309' : '#d97706'}; color: #fff;
                }
                .${CONFIG.classNames.msgFailedPill} button:not(.msg-dismiss-btn):not([disabled]):hover {
                    background: ${isDarkMode ? '#d97706' : '#b45309'};
                }
                .${CONFIG.classNames.msgFailedPill} button[disabled] {
                    opacity: 0.55; cursor: not-allowed;
                }
                .${CONFIG.classNames.msgFailedPill} .msg-open-link {
                    font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 5px;
                    text-decoration: none; white-space: nowrap; color: inherit;
                    border: 1px solid ${isDarkMode ? '#c97d20' : '#fcd34d'};
                }
                .${CONFIG.classNames.msgFailedPill} .msg-dismiss-btn {
                    background: transparent; color: inherit; border: none; opacity: 0.7; font-weight: 400;
                }
                .${CONFIG.classNames.msgFailedPill} .msg-dismiss-btn:hover { opacity: 1; }

                /* --- Batch pre-flight confirm --- */
                .ship-confirm-list {
                    margin: 0; padding: 10px 12px; border-radius: 6px; font-size: 13px;
                    line-height: 1.6; list-style: none;
                    background: ${isDarkMode ? '#1f1f1f' : '#f6f7f8'};
                    border: 1px solid ${isDarkMode ? '#444' : '#e0e0e0'};
                }
                .ship-confirm-list li { display: flex; justify-content: space-between; gap: 12px; }
                .ship-confirm-list li b { font-variant-numeric: tabular-nums; }
                .ship-confirm-warn {
                    margin: 0; font-size: 12px; line-height: 1.5;
                    color: ${isDarkMode ? '#FFD580' : '#78350f'};
                    background: ${isDarkMode ? 'rgba(255,179,71,0.1)' : '#fef3c7'};
                    border: 1px solid ${isDarkMode ? '#c97d20' : '#f59e0b'};
                    border-radius: 6px; padding: 8px 10px;
                }
            `;
        }

        function updateSkuPanelPosition() {
            const skuPanel = document.getElementById(CONFIG.ids.skuPanelContainer);
            const configPanel = document.getElementById('altheastix-config-container');
            const ordersContainer = document.querySelector(CONFIG.selectors.bulkLabelsAppCard);
            if (!skuPanel || !ordersContainer) return;
            const skuPanelWidth = skuPanel.offsetWidth;
            const ordersContainerLeft = ordersContainer.getBoundingClientRect().left;
            const gap = 20;
            const newLeft = ordersContainerLeft - skuPanelWidth - gap;
            const leftPos = Math.max(20, newLeft);
            skuPanel.style.left = `${leftPos}px`;
            if (configPanel) {
                configPanel.style.left = `${leftPos}px`;
                const skuPanelTopNum = parseInt(skuPanel.style.top) || 110;
                configPanel.style.top = `${skuPanelTopNum + skuPanel.offsetHeight + 12}px`;
            }
            const scrollTopBtn = document.getElementById('altheastix-scroll-top-btn');
            if (scrollTopBtn) {
                scrollTopBtn.style.left = `${ordersContainer.getBoundingClientRect().right + 8}px`;
            }
            const shipDockEl = document.getElementById('altheastix-ship-dock');
            if (shipDockEl) shipDockEl.style.left = `${leftPos}px`;
        }

        function injectRadicalStyles() {
            const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
            if (radicalStyleElement) radicalStyleElement.remove();
            radicalStyleElement = GM_addStyle(getRadicalStyles(isDarkMode));
        }

        function updateSkuPanelOnScroll() {
            const skuPanel = document.getElementById(CONFIG.ids.skuPanelContainer);
            const configPanel = document.getElementById('altheastix-config-container');
            const header = document.querySelector(CONFIG.selectors.header);
            if (!skuPanel || !header) return;

            const headerRect = header.getBoundingClientRect();
            const skuPanelTop = headerRect.bottom < 0 ? 20 : 110;
            skuPanel.style.top = `${skuPanelTop}px`;
            if (configPanel) {
                configPanel.style.top = `${skuPanelTop + skuPanel.offsetHeight + 12}px`;
            }

            const scrollTopBtn = document.getElementById('altheastix-scroll-top-btn');
            if (scrollTopBtn) {
                scrollTopBtn.classList.toggle('visible', window.scrollY > 200);
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
            const configPanelContainer = document.createElement('div');
            configPanelContainer.id = 'altheastix-config-container';
            document.body.appendChild(configPanelContainer);
            const scrollTopBtn = document.createElement('button');
            scrollTopBtn.id = 'altheastix-scroll-top-btn';
            scrollTopBtn.title = 'Back to top';
            scrollTopBtn.textContent = '↑';
            scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
            document.body.appendChild(scrollTopBtn);
            // Batch-ship progress dock. Lives on <body> rather than inside the
            // SKU panel because PrintSKUTable rebuilds that panel wholesale on
            // every refresh, which would wipe a running queue's UI.
            const shipDockEl = document.createElement('div');
            shipDockEl.id = 'altheastix-ship-dock';
            document.body.appendChild(shipDockEl);
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
                            // Re-inject the batch-selection controls if eBay
                            // re-renders the batch-select bar.
                            if ((n.matches && n.matches(CONFIG.selectors.batchSelect)) || (n.querySelector && n.querySelector(CONFIG.selectors.batchSelect))) {
                                refreshBatchSelectControls();
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

            // Add the batch-selection controls (defined at IIFE scope so the
            // label-pill toggle handler can refresh their counts too).
            refreshBatchSelectControls();

            console.debug('[Tampermonkey][INIT] Header & base layout adjustments complete');
        }

        // --- Batch selection controls ---
        // A row of filters next to eBay's native "Select all". Each one checks
        // exactly the orders it matches and unchecks everything else, so picking
        // a filter REPLACES the selection rather than adding to it — that is what
        // makes the SKU panel shrink and the print button become
        // "Print N Selected Envelopes" for that subset.
        //
        // Already-shipped cards are excluded from both the counts and the
        // selection. A filter that offers to print envelopes you packed an hour
        // ago is worse than no filter at all.
        function batchSelectCandidates() {
            return Array.from(document.querySelectorAll(CONFIG.selectors.orderItem))
                .filter(order => !isOrderCardDone(order));
        }

        const BATCH_SELECT_FILTERS = [
            {
                key: 'standard-envelope',
                label: 'Select standard envelope',
                title: 'Check only plain-envelope orders: no 📦 label, no manila, no LG',
                emptyTitle: 'Nothing to select: no plain-envelope orders left to pack',
                match: order => order.dataset.shipsWithLabel !== 'true' &&
                    !order.classList.contains(CONFIG.classNames.highlightManila) &&
                    !order.classList.contains(CONFIG.classNames.highlightLg)
            },
            {
                key: 'canada',
                label: 'Select 🇨🇦 Canada',
                title: 'Check every order shipping to Canada',
                emptyTitle: 'Nothing to select: no Canadian orders left to pack',
                match: order => order.dataset.isCanadian === 'true'
            }
        ];

        // eBay's "Select all" box is driven only by its own click handler — it
        // does not derive from how many orders are actually ticked. So narrowing
        // the selection underneath it used to leave it sitting there checked
        // while only some orders were selected.
        //
        // It is always moved with a real .click(), never a .checked assignment.
        // Assigning would desync eBay's internal "all selected" flag from what
        // the box shows, and the user's next click on it would then appear to do
        // nothing at all.
        function syncSelectAllCheckbox() {
            const master = document.querySelector(CONFIG.selectors.selectAllCheckbox);
            if (!master) return;
            const boxes = Array.from(document.querySelectorAll(CONFIG.selectors.orderItem))
                .map(order => order.querySelector(CONFIG.selectors.checkbox))
                .filter(Boolean);
            const allChecked = boxes.length > 0 && boxes.every(cb => cb.checked);
            if (allChecked === master.checked) return;
            if (allChecked) {
                // Safe to click: toggle-all "on" over an already-full list
                // changes no order, and eBay's flag ends up honest.
                master.click();
            } else {
                // Assigned, NOT clicked. A click here runs eBay's toggle-all,
                // which would wipe the very selection this filter just made.
                // A stale internal flag is a far cheaper bug than losing the
                // user's selection. Indeterminate is the honest picture anyway:
                // some orders are ticked, not all.
                master.checked = false;
                master.indeterminate = boxes.some(cb => cb.checked);
            }
            console.debug(`[Tampermonkey][SELECT] select-all → ${allChecked ? 'checked' : 'partial/none'}`);
        }

        function applyBatchSelectFilter(filter) {
            const master = document.querySelector(CONFIG.selectors.selectAllCheckbox);
            // Reset through eBay's own toggle-all first when it is on, so the
            // per-order pass below starts from a clean, consistent state rather
            // than fighting a master flag that still believes everything is on.
            if (master && master.checked) master.click();
            if (master) master.indeterminate = false;

            let checked = 0;
            batchSelectCandidates().forEach(orderEl => {
                const cb = orderEl.querySelector(CONFIG.selectors.checkbox);
                if (!cb) return;
                const shouldCheck = !!filter.match(orderEl);
                // A real click, not a .checked assignment, so eBay's React
                // selection state and this script's listeners both stay in sync.
                if (cb.checked !== shouldCheck) cb.click();
                if (shouldCheck) checked++;
            });
            // A shipped card left checked would keep dragging its SKUs into the
            // print selection, so clear those on the way out.
            document.querySelectorAll(CONFIG.selectors.orderItem).forEach(orderEl => {
                if (!isOrderCardDone(orderEl)) return;
                const cb = orderEl.querySelector(CONFIG.selectors.checkbox);
                if (cb && cb.checked) cb.click();
            });
            // And put the master back on if this filter happened to cover every
            // order on the page — an unchecked box over a fully ticked list is
            // the same lie in the other direction.
            syncSelectAllCheckbox();
            console.debug(`[Tampermonkey][SELECT] ${filter.key} → ${checked} order(s) checked`);
        }

        // Injects or refreshes the whole row. A filter matching nothing renders
        // DISABLED rather than disappearing: a control that vanishes makes the
        // bar jump around and leaves you guessing whether the feature broke or
        // the orders simply ran out. Safe to call repeatedly — on init, on a
        // batch-select re-render, on a label-pill toggle, on every ship.
        // eBay owns the type scale in this bar and it is not ours to predict —
        // copy the sibling label's metrics onto our controls at render time so
        // the baselines match whatever eBay is currently using.
        function syncBatchBtnTypography(batchSelect, btn) {
            try {
                const label = batchSelect.querySelector('label.field__label');
                if (!label) return;
                const cs = getComputedStyle(label);
                if (cs.fontSize) btn.style.fontSize = cs.fontSize;
                if (cs.lineHeight && cs.lineHeight !== 'normal') btn.style.lineHeight = cs.lineHeight;
            } catch (e) {}
        }

        function refreshBatchSelectControls() {
            const batchSelect = document.querySelector(CONFIG.selectors.batchSelect);
            if (!batchSelect) return;
            const candidates = batchSelectCandidates();
            // Drop any control whose filter has been retired, so a span left by
            // an earlier version cannot outlive it in a re-rendered bar.
            const liveKeys = BATCH_SELECT_FILTERS.map(f => f.key);
            batchSelect.querySelectorAll('[data-batch-filter]').forEach(el => {
                if (!liveKeys.includes(el.dataset.batchFilter)) el.remove();
            });
            BATCH_SELECT_FILTERS.forEach(filter => {
                let count = 0;
                candidates.forEach(order => { if (filter.match(order)) count++; });
                let btn = batchSelect.querySelector(`[data-batch-filter="${filter.key}"]`);
                if (!btn) {
                    // A span, not an <a href="#">. An anchor pointed at this page
                    // is a permanently "visited" link, and :visited then owns its
                    // colour whatever this file asks for — the same trap the new
                    // order pill fell into in v4.27.
                    btn = document.createElement('span');
                    btn.className = CONFIG.classNames.batchSelectBtn;
                    btn.dataset.batchFilter = filter.key;
                    btn.setAttribute('role', 'button');
                    const activate = (event) => {
                        event.preventDefault();
                        if (btn.getAttribute('aria-disabled') === 'true') return;
                        applyBatchSelectFilter(filter);
                    };
                    btn.addEventListener('click', activate);
                    btn.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter' || event.key === ' ') activate(event);
                    });
                    batchSelect.appendChild(btn);
                }
                const disabled = count === 0;
                btn.textContent = `${filter.label} (${count})`;
                btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
                btn.setAttribute('tabindex', disabled ? '-1' : '0');
                btn.classList.toggle(CONFIG.classNames.selectBatchBtnDisabled, disabled);
                btn.title = disabled ? filter.emptyTitle : filter.title;
                syncBatchBtnTypography(batchSelect, btn);
            });
        }

        // --- Address Warning Banner ---
        // Scans all order cards for existing ⚠ address badges (already placed by
        // processOrderCard via validateAddress) and renders a thin summary banner
        // directly below the .orders-filters bar. One jump-link per flagged order.
        let addressBannerDismissed = false;
        function refreshAddressBanner() {
            const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
            if (addressBannerDismissed) {
                const banner = document.getElementById('altheastix-address-banner');
                if (banner) banner.style.display = 'none';
                return;
            }

            // Collect orders that carry a warning badge
            const flagged = [];
            document.querySelectorAll(CONFIG.selectors.orderItem).forEach(orderItem => {
                if (!orderItem.querySelector(`.${CONFIG.classNames.addrWarningBadge}`)) return;
                // Get buyer name — strip any badge text nodes by reading only the first text node
                const nameEl = orderItem.querySelector('.print__address__fullname');
                let name = '';
                if (nameEl) {
                    name = Array.from(nameEl.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE)
                        .map(n => n.textContent)
                        .join('')
                        .trim();
                }
                if (!name) name = orderItem.id || 'Order';
                flagged.push({ id: orderItem.id, name });
            });

            // Find or create the banner element
            let banner = document.getElementById('altheastix-address-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'altheastix-address-banner';
                const filtersEl = document.querySelector(CONFIG.selectors.ordersFilters);
                if (filtersEl) {
                    filtersEl.insertAdjacentElement('afterend', banner);
                } else {
                    const ordersContainer = document.querySelector(CONFIG.selectors.ordersContainer);
                    if (ordersContainer) ordersContainer.prepend(banner);
                }
            }

            if (flagged.length === 0) {
                banner.style.display = 'none';
                return;
            }

            banner.style.display = '';
            banner.innerHTML = '';

            const summary = document.createElement('span');
            summary.style.cssText = 'font-weight: 700; white-space: nowrap;';
            summary.textContent = flagged.length === 1
                ? '⚠ Address issue on 1 order:'
                : `⚠ Address issues on ${flagged.length} orders:`;
            banner.appendChild(summary);

            flagged.forEach((o, i) => {
                const a = document.createElement('a');
                a.href = '#';
                a.textContent = o.name;
                a.style.cssText = `color: ${isDarkMode ? '#FFB347' : '#92400e'}; font-weight: 600; text-decoration: underline; cursor: pointer; white-space: nowrap;`;
                a.addEventListener('click', e => {
                    e.preventDefault();
                    document.getElementById(o.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
                banner.appendChild(a);
                if (i < flagged.length - 1) {
                    const sep = document.createTextNode(' · ');
                    banner.appendChild(sep);
                }
            });

            const dismissBtn = document.createElement('button');
            dismissBtn.textContent = '×';
            dismissBtn.title = 'Dismiss';
            dismissBtn.style.cssText = `margin-left: auto; padding: 0 4px; background: none; border: none; cursor: pointer; font-size: 15px; line-height: 1; color: ${isDarkMode ? '#FFB347' : '#92400e'}; opacity: 0.7; flex-shrink: 0;`;
            dismissBtn.addEventListener('mouseenter', () => { dismissBtn.style.opacity = '1'; });
            dismissBtn.addEventListener('mouseleave', () => { dismissBtn.style.opacity = '0.7'; });
            dismissBtn.addEventListener('click', () => {
                addressBannerDismissed = true;
                banner.style.display = 'none';
            });
            banner.appendChild(dismissBtn);
        }

        // --- Order Card Processing ---
        // This function iterates over each order card on the page, redesigning it,
        // extracting data, and adding new UI elements like action buttons and info blocks.
        // Strips every node the script injects into an order card so
        // processOrderCard can safely run again on a card eBay has re-rendered
        // (see the combined-card re-render watchdog in main()). Without this,
        // any injected node that survived the re-render (e.g. the +note links
        // living in the hidden .grouping_summary) would be duplicated.
        function cleanupCardInjections(orderItem) {
            const cn = CONFIG.classNames;
            const staleSelectors = [
                cn.shippingInfoBlock, cn.buyerNoteCallout, cn.addNoteLink,
                cn.addTrackingLink, cn.reviseLink, cn.addrWarningBadge,
                cn.addrOkBadge, cn.messageContainer, cn.markAsShippedBtn,
                cn.printEnvelopeBtn, cn.buyLabelLink, cn.shippedLabel,
                cn.shipFailedBanner, cn.shipQueuedBadge, cn.msgFailedPill
            ].map(c => '.' + c).join(', ');
            orderItem.querySelectorAll(staleSelectors).forEach(el => el.remove());
            // The pending overlay is handled separately: an order that is
            // still in flight must KEEP its overlay through an eBay re-render.
            // Stripping it used to disarm the deadline timer (which bails when
            // the overlay is gone) and read as a cancellation to the batch
            // queue, leaving a genuinely in-flight order with no overlay, no
            // banner and no timer — stuck and statusless.
            if (orderItem.dataset.shipInFlight !== '1') {
                orderItem.querySelectorAll('.' + cn.pendingOverlay).forEach(el => el.remove());
            }
            // The failed banner has just been stripped, so drop the matching
            // class too rather than leaving a red border with nothing in it.
            // checkAndFinalizeCardState re-applies confirmed state after a
            // re-render; a failure is not worth resurrecting, and the card
            // returns to a normal, re-clickable state.
            orderItem.classList.remove(cn.orderShipFailed);
            orderItem.querySelectorAll('.ship-when-wrap').forEach(el => el.remove());
            orderItem.querySelectorAll('.thank-you-checkbox').forEach(el => el.parentElement?.remove());
        }

        function processOrderCard(orderItem, index) {
            console.debug(`[Tampermonkey][ORDERS] Processing order card index=${index}`);
            orderItem.id = `order-item-${index}`;
            const tcellItem = orderItem.querySelector(CONFIG.selectors.tcellItem);
            if (!tcellItem) {
                console.warn(`[Tampermonkey] Skipping incomplete order card at index ${index}.`);
                return;
            }
            cleanupCardInjections(orderItem);
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

            // --- Append "United States" for domestic orders ---
            // eBay only renders a .print__address__country span for international
            // destinations (e.g. Canada); US addresses have no country line at all.
            // Absence of that span is the reliable US signal, so add the country
            // line explicitly — Copy and Print Envelope both read the address
            // block's text, so they pick it up automatically. Runs after the
            // integrity check so validation still sees eBay's original lines.
            {
                const addrEl = orderItem.querySelector(`.${CONFIG.classNames.addressContainer}`);
                if (addrEl && !addrEl.querySelector('.print__address__country')) {
                    const countrySpan = document.createElement('span');
                    countrySpan.className = 'print__address__country';
                    countrySpan.innerHTML = 'United States<br>';
                    addrEl.appendChild(countrySpan);
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

                // Orders over the tracking threshold ship with an eBay label (with
                // tracking), not a hand-addressed envelope. Tag the card so the
                // batch-selection filters can exclude it from the bulk envelope
                // run. The 📦 label pill (below) lets this be toggled either way.
                const shipsWithLabel = totalItemsPrice > USER_CONFIG.trackingOrderAmountThreshold;
                orderItem.dataset.shipsWithLabel = shipsWithLabel ? 'true' : 'false';

                if (shipsWithLabel) {
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
                    ? `<strong style="color: #000; background: #ffd54f; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Total: $${totalItemsPrice.toFixed(2)}</strong>`
                    : `<strong>Total: $${totalItemsPrice.toFixed(2)}</strong>`;
                let shippingText = 'Free Shipping';
                if (transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim() && !transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim().includes("$0.00")) {
                    const shippingCostMatch = transactionCell.querySelector(CONFIG.selectors.buyerPaidService)?.innerText.trim().match(/\$\d+\.\d{2}/);
                    if (shippingCostMatch) shippingText = `Shipping: <span style="font-weight: bold; color: red;">${shippingCostMatch[0]}</span>`;
                }
                if (orderItem.dataset.isCanadian === 'true') shippingText += ' 🇨🇦';
                const labelPillHTML = `<span class="${CONFIG.classNames.shipsLabelPill}${shipsWithLabel ? ' ' + CONFIG.classNames.shipsLabelActive : ''}" title="Ships with an eBay label (tracking) — excluded from bulk envelope printing. Click to toggle.">📦 label</span>`;
                infoBlock.innerHTML = `<p>${orderIdContainer.innerHTML} │ ${totalHTML} │ ${shippingText} ${labelPillHTML}</p>`;
                tcellItem.insertBefore(infoBlock, tcellItem.firstChild);
                transactionCell.style.display = 'none';

                // --- Buyer note callout ---
                // eBay tucks any buyer-left note inside .grouping_summary, which the
                // script hides wholesale. Surface it as a soft callout right under the
                // shipping info line so friendly notes don't get lost. Text-only
                // (textContent) to avoid injecting any buyer-supplied markup.
                const buyerNoteText = orderItem.querySelector('.buyer_note')?.textContent.trim();
                if (buyerNoteText) {
                    const noteEl = document.createElement('div');
                    noteEl.className = CONFIG.classNames.buyerNoteCallout;
                    noteEl.innerHTML = `<span class="buyer-note-icon">💬</span><span class="buyer-note-text"><span class="buyer-note-label">Buyer note:</span></span>`;
                    noteEl.querySelector('.buyer-note-text').append(buyerNoteText);
                    infoBlock.after(noteEl);
                }
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
                shipButton.textContent = 'Mark as Shipped & Msg';
                shipButton.setAttribute('data-order-item-id', orderItem.id);
                const firstOrderId = allOrderIds.split(',')[0];

                const shipTomorrowContainer = document.createElement('div');
                shipTomorrowContainer.className = 'ship-when-wrap';
                shipTomorrowContainer.style.cssText = 'margin-top: 8px; text-align: left;';
                const shipTomorrowCheckboxId = `ship-tomorrow-checkbox-${index}`;
                const shipWhenFmt = { weekday: 'short', month: 'short', day: 'numeric' };
                const shipTodayLabel = new Date().toLocaleDateString('en-US', shipWhenFmt);
                const shipTomorrowLabel = computeNextShipDateSkippingSunday(1).toLocaleDateString('en-US', shipWhenFmt);
                shipTomorrowContainer.innerHTML = `
                    <input type="checkbox" id="${shipTomorrowCheckboxId}" class="ship-tomorrow-checkbox" checked hidden>
                    <div class="ship-when-row">
                        <span class="ship-when-label">Ships</span>
                        <div class="ship-when-seg" role="group" aria-label="Ship date">
                            <button type="button" class="ship-when-btn" data-when="today" aria-pressed="false">Today</button>
                            <button type="button" class="ship-when-btn ship-when-active" data-when="tomorrow" aria-pressed="true">Tomorrow</button>
                        </div>
                        <span class="ship-when-preview" data-today-label="${shipTodayLabel}" data-tomorrow-label="${shipTomorrowLabel}">${shipTomorrowLabel}</span>
                    </div>
                `;

                const thankYouMsgContainer = document.createElement('div');
                thankYouMsgContainer.style.cssText = 'margin-top: 4px; text-align: left;';
                const thankYouCheckboxId = `thank-you-checkbox-${index}`;
                thankYouMsgContainer.innerHTML = `
                    <input type="checkbox" id="${thankYouCheckboxId}" class="thank-you-checkbox" style="vertical-align: middle;" checked>
                    <label for="${thankYouCheckboxId}" class="thank-you-label" style="vertical-align: middle; font-size: 12px;">Send thank you msg</label>
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
                addressActions.after(messageContainer, shipButton, thankYouMsgContainer, shipTomorrowContainer);
            }
            const printButton = document.createElement('button');
            printButton.id = `${CONFIG.ids.createTemplateButton}${index}`;
            printButton.className = CONFIG.classNames.printEnvelopeBtn;
            printButton.textContent = "Print Envelope";
            tcellItem.appendChild(printButton);

            // "Buy shipping label" link — opens eBay's single-label page in a
            // focused tab; the /ship/single automation pre-fills it for an eBay
            // Standard Envelope (see the buy_label branch below).
            const firstOrderIdForLabel = (allOrderIds || '').split(',')[0];
            if (firstOrderIdForLabel) {
                const buyLabelLink = document.createElement('a');
                buyLabelLink.className = CONFIG.classNames.buyLabelLink;
                buyLabelLink.textContent = 'Buy shipping label →';
                buyLabelLink.href = `https://www.ebay.com/ship/single/${firstOrderIdForLabel}?tm_action=buy_label`;
                buyLabelLink.title = 'Open eBay\'s Buy Shipping Label page, pre-filled for an eBay Standard Envelope';
                buyLabelLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    openAutomationTab(buyLabelLink.href, { active: true });
                });
                tcellItem.appendChild(buyLabelLink);
            }
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
                envelopeHTMLs.push(`<div class="envelope" style="position:relative;">${stampReminder}<table style="font-family: Arial; width: 100%; height: 100%; border-collapse: collapse;"><tr style="vertical-align: top;"><td style="width: 100%; padding: 14px 0 0 18px; font-size: 14px;">${USER_CONFIG.returnAddress}</td></tr><tr style="height: 10%;"><td></td></tr><tr style="vertical-align: top;"><td style="text-align: left; padding-left: 20%; font-size: 24px;">${addressHTML}</td></tr><tr style="height: 30%;"><td></td></tr></table></div>`);
            });
            if (envelopeHTMLs.length === 0) return;
            const printwin = window.open("", "_blank");
            printwin.document.write(`<html><head><style>@page { size: 8.93in x 3.878in; margin: 0; } html, body { margin: 0; padding: 0; } .envelope { width: 8.93in; height: 3.878in; padding: 10px; font-family: Arial; box-sizing: border-box; overflow: hidden; } .envelope + .envelope { break-before: page; }</style></head><body>` + envelopeHTMLs.join('') + '</body></html>');
            printwin.document.close();
            printwin.focus();
            printwin.print();
            printwin.close();
        }

        // Sets the "ship today vs tomorrow" state for one order card: the hidden
        // checkbox the ship/message logic reads, the segmented-button styling,
        // and the live ship-date preview.
        function setShipWhenState(cardEl, isTomorrow) {
            if (!cardEl) return;
            const cb = cardEl.querySelector('.ship-tomorrow-checkbox');
            if (cb instanceof HTMLInputElement) cb.checked = isTomorrow;
            cardEl.querySelectorAll('.ship-when-btn').forEach((b) => {
                const active = (b.dataset.when === 'tomorrow') === isTomorrow;
                b.classList.toggle('ship-when-active', active);
                b.setAttribute('aria-pressed', String(active));
            });
            const preview = cardEl.querySelector('.ship-when-preview');
            if (preview) {
                const todayLabel = preview.dataset.todayLabel || '';
                const tomorrowLabel = preview.dataset.tomorrowLabel || '';
                preview.textContent = isTomorrow ? tomorrowLabel : todayLabel;
            }
        }

        // Greys out the message-dependent control on a card (the ship-date
        // segmented control) when its thank-you message is turned off, and
        // keeps the Mark-as-Shipped button label in sync ("& Msg" when on).
        function setCardMsgGating(cardEl, thankYouOn) {
            if (!cardEl) return;
            const wrap = cardEl.querySelector('.ship-when-wrap');
            if (wrap) wrap.classList.toggle('is-msg-disabled', !thankYouOn);
            const shipBtn = cardEl.querySelector('.' + CONFIG.classNames.markAsShippedBtn);
            if (shipBtn && !shipBtn.classList.contains(CONFIG.classNames.markAsShippedWaiting)) {
                shipBtn.textContent = thankYouOn ? 'Mark as Shipped & Msg' : 'Mark as Shipped';
            }
        }

        // ===================================================================
        // SHIP OUTCOME TRACKING
        // ===================================================================
        // A ship request used to have exactly one possible ending on this
        // page: confirmation. If the automation tab died, was closed, never
        // loaded, or hit its own watchdog, nothing was ever written back and
        // the card sat forever showing a green check over the words "Marked as
        // Shipped". It now has three endings — pending, confirmed, failed —
        // and two independent ways to reach the third:
        //
        //   1. SHIP_FAILED_KEY, written by the automation tab's watchdog.
        //      Fast and specific, but useless if the tab never got far enough
        //      to arm a watchdog.
        //   2. A deadline timer here on the main page. Slower, but it cannot
        //      be defeated by a tab that is gone.
        //
        // Whichever lands first wins; a confirmation arriving late always
        // beats a failure, so a merely-slow eBay resolves to shipped.

        const shipDeadlineTimers = new Map();

        // --- Ship diagnostics ---
        // Every state transition in the ship lifecycle logs here, and the last
        // 300 entries are kept so a whole batch can be dumped in one go:
        //   altheastixShipReport()      → copyable text summary
        //   altheastixShipReport(true)  → also copies it to the clipboard
        // Function declarations, not const arrows: this file has been bitten
        // before by a helper still in its TDZ when an early caller reached it.
        const shipLogBuffer = [];
        function SHIPDBG(event, data) {
            const stamp = new Date().toLocaleTimeString('en-US', { hour12: false });
            const entry = { t: stamp, event: event, data: data === undefined ? null : data };
            shipLogBuffer.push(entry);
            if (shipLogBuffer.length > 300) shipLogBuffer.shift();
            console.log(`[Altheastix][ship] ${stamp} ${event}`, data === undefined ? '' : data);
        }
        function shipCardState(card) {
            if (!card) return 'no-card';
            if (card.classList.contains(CONFIG.classNames.orderShipped)) return 'confirmed';
            if (card.classList.contains(CONFIG.classNames.orderShipFailed)) return 'failed';
            if (card.querySelector(`.${CONFIG.classNames.pendingOverlay}`)) return 'pending';
            return 'idle';
        }
        function altheastixShipReport(copy) {
            const cards = Array.from(document.querySelectorAll(CONFIG.selectors.orderItem));
            const lines = [];
            lines.push('=== Altheastix ship report ===');
            lines.push(`version: ${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || 'unknown'}`);
            lines.push(`queue: running=${shipQueue.running} total=${shipQueue.total} current=${shipQueue.current} done=${shipQueue.done} failed=${shipQueue.failed} skipped=${shipQueue.skipped} stopRequested=${shipQueue.stopRequested}`);
            lines.push(`deadline timers armed: ${shipDeadlineTimers.size} [${Array.from(shipDeadlineTimers.keys()).join(', ')}]`);
            lines.push(`--- cards (${cards.length}) ---`);
            cards.forEach(c => {
                lines.push([
                    c.id,
                    'state=' + shipCardState(c),
                    'ids=' + (c.dataset.orderId || '-'),
                    'confirmed=' + (c.dataset.confirmedIds || '-'),
                    'note=' + (c.dataset.shipNoteSent || '0'),
                    'msgQueued=' + (c.dataset.shipMsgSent || '0'),
                    'msgOutcome=' + (c.dataset.msgOutcome || '-'),
                    'undone=' + (c.dataset.shipUndone || '0'),
                    'checked=' + (c.querySelector(CONFIG.selectors.checkbox)?.checked ? '1' : '0'),
                    'shippable=' + (isCardShippable(c) ? '1' : '0')
                ].join(' '));
            });
            lines.push(`--- log (${shipLogBuffer.length}) ---`);
            shipLogBuffer.forEach(e => {
                lines.push(`${e.t} ${e.event}${e.data !== null ? ' ' + JSON.stringify(e.data) : ''}`);
            });
            const text = lines.join('\n');
            console.log(text);
            if (copy) { try { GM_setClipboard(text); console.log('[Altheastix][ship] report copied to clipboard.'); } catch (e) {} }
            return text;
        }
        // Dry-run harness. Drives the card state machine directly so the three
        // visual states, the retry button, the badge counter and the batch
        // bookkeeping can all be exercised without opening a single automation
        // tab or touching a real order on eBay.
        //   altheastixShipSimulate('fail', 'order-item-3')
        //   altheastixShipSimulate('confirm', 'order-item-3')
        //   altheastixShipSimulate('pending', 'order-item-3')
        //   altheastixShipSimulate('reset', 'order-item-3')
        function altheastixShipSimulate(kind, cardId) {
            const card = document.getElementById(cardId);
            if (!card) { console.warn('[Altheastix][ship] no card with id ' + cardId); return; }
            SHIPDBG('simulate', { kind: kind, card: cardId });
            if (kind === 'fail') {
                markCardShipFailed(card, 'Simulated failure (dry run — nothing was sent to eBay).');
            } else if (kind === 'confirm') {
                card.dataset.confirmedIds = card.dataset.orderId || '';
                clearShipDeadline(card);
                clearShipFailedState(card);
                markCardQueued(card, false);
                card.querySelector(`.${CONFIG.classNames.pendingOverlay}`)?.remove();
                card.classList.add(CONFIG.classNames.orderShipped);
                const btn = card.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
                if (btn) {
                    const lbl = document.createElement('span');
                    lbl.className = CONFIG.classNames.shippedLabel;
                    lbl.innerHTML = '✓ Shipped';
                    btn.replaceWith(lbl);
                }
                repaintSkuPanel();
            } else if (kind === 'pending') {
                markCardQueued(card, true);
            } else if (kind === 'reset') {
                clearShipDeadline(card);
                clearShipFailedState(card);
                markCardQueued(card, false);
                card.querySelector(`.${CONFIG.classNames.pendingOverlay}`)?.remove();
                card.classList.remove(CONFIG.classNames.orderShipped);
                delete card.dataset.confirmedIds;
                delete card.dataset.shipNoteSent;
                delete card.dataset.shipMsgSent;
                delete card.dataset.shipUndone;
                delete card.dataset.shipInFlight;
                delete card.dataset.shipAttemptAt;
                delete card.dataset.msgOutcome;
                delete card.dataset.msgFailedReason;
                delete card.dataset.msgFailedAction;
                delete card.dataset.msgFailedRetryable;
                card.querySelectorAll(`.${CONFIG.classNames.msgFailedPill}`).forEach(el => el.remove());
                // 'confirm' replaces the ship button with the ✓ Shipped span,
                // exactly as a real confirmation does. Reset has to put the
                // button back, or the card comes out of the dry run looking
                // untouched while being permanently unshippable.
                ensureShipButton(card);
                repaintSkuPanel();
            } else {
                console.warn("[Altheastix][ship] kind must be 'fail' | 'confirm' | 'pending' | 'reset'");
                return;
            }
            syncPendingBadge();
            console.log('[Altheastix][ship] ' + cardId + ' is now: ' + shipCardState(card));
        }

        // Reachable from the page console (userscripts run in their own scope).
        try {
            unsafeWindow.altheastixShipReport = altheastixShipReport;
            unsafeWindow.altheastixShipSimulate = altheastixShipSimulate;
        } catch (e) {
            try {
                window.altheastixShipReport = altheastixShipReport;
                window.altheastixShipSimulate = altheastixShipSimulate;
            } catch (e2) { console.warn('[Altheastix][ship] diagnostics not reachable from the page console.'); }
        }

        // ===================================================================
        // ORDER WATCH — background staleness detector
        // ===================================================================
        // This page renders one snapshot of the work list and then never
        // updates itself, so a tab left open through a packing session can be
        // quietly missing sales that came in ten minutes ago.
        //
        // eBay's own bulk UI gets its work list from
        //   /ship/single/api/fulfilment/v2/orders/available
        //     -> {"nextOrderIds":["25-15048-98836", ...]}
        // a ~2KB authenticated GET listing EVERY order awaiting shipment —
        // 99 of them at the time of writing, against the 10 rendered here.
        // That mismatch is why the baseline is a snapshot of the API's id set
        // taken at load rather than the ids on the page: diffing against the
        // page would report ~89 phantom "new" orders on the first tick.
        //
        // Additions only. An id leaving the list means shipped/cancelled and
        // is never a reason to nag. And this NEVER auto-reloads: automation
        // tabs may be in flight and an address may be half-edited.

        const ORDER_WATCH_ENDPOINT = 'https://www.ebay.com/ship/single/api/fulfilment/v2/orders/available';
        const ORDER_WATCH_MAX_INTERVAL_MS = 15 * 60 * 1000;

        const orderWatch = {
            baseline: null,          // Set of ids present at load; null until armed
            newIds: new Set(),       // ids seen since, absent from the baseline
            lastPollAt: 0,
            nextPollAt: 0,
            lastResult: 'never',     // 'ok' | 'inconclusive' | 'error' | 'never'
            lastError: '',
            lastCount: 0,
            consecutiveFailures: 0,
            pollCount: 0,
            skipCount: 0,
            lastSkipReason: '',
            capWarned: false,
            checking: false,
            lastManualAt: 0,
            timer: null
        };

        const watchLogBuffer = [];
        function WATCHDBG(event, data) {
            const stamp = new Date().toLocaleTimeString('en-US', { hour12: false });
            watchLogBuffer.push({ t: stamp, event: event, data: data === undefined ? null : data });
            if (watchLogBuffer.length > 200) watchLogBuffer.shift();
            console.log(`[Altheastix][watch] ${stamp} ${event}`, data === undefined ? '' : data);
        }

        // Page-context fetch on purpose. GM_xmlhttpRequest would issue this
        // from the extension context, without the sec-fetch-* headers eBay's
        // own call carries — and this origin runs bot detection
        // (cas.avalon.perfdrive.com). One request every few minutes to an
        // endpoint the app itself polls should look like ordinary use.
        async function orderWatchFetchIds() {
            const res = await fetch(ORDER_WATCH_ENDPOINT + '?_=' + Date.now(), {
                credentials: 'include',
                cache: 'no-store',
                headers: { accept: 'application/json' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (!data || !Array.isArray(data.nextOrderIds)) {
                throw new Error('unexpected shape: ' + (Object.keys(data || {}).join(',') || 'empty'));
            }
            return data.nextOrderIds.filter(id => typeof id === 'string' && id.length > 0);
        }

        // Reasons to sit this round out. Suppressed once the baseline exists —
        // arming it is worth doing even on a hidden tab, since the whole point
        // is to fix the window start at page load.
        function orderWatchSuspendReason() {
            try {
                if (shipQueue && shipQueue.running) return 'batch ship running';
                if (document.querySelector(`.${CONFIG.classNames.pendingOverlay}`)) return 'automation tab in flight';
                if (document.hidden) return 'tab hidden';
            } catch (e) {}
            return '';
        }

        async function orderWatchTick(force) {
            if (orderWatch.baseline && !force) {
                const reason = orderWatchSuspendReason();
                if (reason) {
                    orderWatch.skipCount++;
                    orderWatch.lastSkipReason = reason;
                    WATCHDBG('skip', { reason: reason });
                    renderOrderWatchStatus();
                    return;
                }
            }
            // The status line has to settle back to a truthful state whichever
            // way the poll ends — including the throwing ways. Hence finally,
            // rather than a call at each of the four exit points.
            orderWatch.checking = true;
            renderOrderWatchStatus();
            try {
                await orderWatchPoll();
            } finally {
                orderWatch.checking = false;
                renderOrderWatchStatus();
            }
        }

        async function orderWatchPoll() {
            orderWatch.lastSkipReason = '';
            orderWatch.pollCount++;

            let ids;
            try {
                ids = await orderWatchFetchIds();
            } catch (e) {
                // A sign-in redirect, an interstitial, a shape change and a
                // dropped connection all land here. None of them is evidence
                // of a new order, so none of them badges — they just back off.
                orderWatch.consecutiveFailures++;
                orderWatch.lastResult = 'error';
                orderWatch.lastError = String(e && e.message ? e.message : e);
                WATCHDBG('error', { attempt: orderWatch.consecutiveFailures, error: orderWatch.lastError });
                return;
            }

            orderWatch.lastPollAt = Date.now();

            if (ids.length === 0) {
                // Indistinguishable from "everything is shipped", and crying
                // wolf costs more than a late notice. Treat as inconclusive.
                orderWatch.consecutiveFailures++;
                orderWatch.lastResult = 'inconclusive';
                WATCHDBG('inconclusive', { reason: 'empty list', attempt: orderWatch.consecutiveFailures });
                return;
            }

            orderWatch.consecutiveFailures = 0;
            orderWatch.lastResult = 'ok';
            orderWatch.lastError = '';
            orderWatch.lastCount = ids.length;

            // If eBay ever truncates this list, a new order could arrive past
            // the cut and never be seen. Say so once rather than pretending to
            // cover a case we cannot see.
            if (ids.length >= 100 && !orderWatch.capWarned) {
                orderWatch.capWarned = true;
                WATCHDBG('possible-cap', { count: ids.length, note: 'list may be truncated; new orders past the cut would be missed' });
            }

            if (!orderWatch.baseline) {
                orderWatch.baseline = new Set(ids);
                WATCHDBG('baseline', { count: ids.length, onPage: document.querySelectorAll(CONFIG.selectors.orderItem).length });
                return;
            }

            let added = 0;
            ids.forEach(id => {
                if (!orderWatch.baseline.has(id) && !orderWatch.newIds.has(id)) {
                    orderWatch.newIds.add(id);
                    added++;
                }
            });

            if (added > 0) {
                WATCHDBG('new-orders', { added: added, pending: orderWatch.newIds.size, listSize: ids.length });
                renderOrderWatchPill();
                syncPendingBadge();
            } else {
                WATCHDBG('no-change', { listSize: ids.length });
            }
        }

        function scheduleOrderWatch() {
            if (orderWatch.timer) clearTimeout(orderWatch.timer);
            const base = Math.max(1, USER_CONFIG.orderWatchIntervalMinutes || 5) * 60 * 1000;
            const wait = Math.min(base * Math.min(Math.pow(2, orderWatch.consecutiveFailures), 3), ORDER_WATCH_MAX_INTERVAL_MS);
            orderWatch.nextPollAt = Date.now() + wait;
            orderWatch.timer = setTimeout(() => {
                orderWatchTick().catch(e => WATCHDBG('tick-threw', String(e))).then(scheduleOrderWatch, scheduleOrderWatch);
            }, wait);
        }

        function startOrderWatch() {
            if (USER_CONFIG.enableOrderWatch === false) {
                WATCHDBG('disabled', { reason: 'USER_CONFIG.enableOrderWatch is false' });
                return;
            }
            WATCHDBG('start', { intervalMinutes: USER_CONFIG.orderWatchIntervalMinutes || 5 });
            // Lazy refresher: 30s is enough to keep "checked 4m ago" honest
            // without re-rendering anything once a second.
            setInterval(renderOrderWatchStatus, 30000);
            // Arm the baseline immediately so the "since you loaded" window
            // really starts at load, then fall into the normal cadence.
            orderWatchTick(true).then(scheduleOrderWatch, scheduleOrderWatch);

            // Coming back to a tab that has been hidden for a while is exactly
            // when the page is most likely to be stale — check on the spot
            // instead of waiting out the remainder of the interval.
            document.addEventListener('visibilitychange', () => {
                if (document.hidden || !orderWatch.baseline) return;
                const base = Math.max(1, USER_CONFIG.orderWatchIntervalMinutes || 5) * 60 * 1000;
                if (Date.now() - orderWatch.lastPollAt < base) return;
                WATCHDBG('visible-recheck', { staleMs: Date.now() - orderWatch.lastPollAt });
                orderWatchTick().then(scheduleOrderWatch, scheduleOrderWatch);
            });
        }

        // The signal itself: a pill under the SKU panel title. PrintSKUTable
        // wipes the panel on every repaint, so it calls this on the way out
        // and the pill re-appears rather than vanishing on the next redraw.
        function renderOrderWatchPill() {
            const container = document.getElementById(CONFIG.ids.skuPanelContainer);
            if (!container) return;
            container.querySelector(`.${CONFIG.classNames.orderWatchPill}`)?.remove();
            const count = orderWatch.newIds.size;
            if (count < 1) return;

            // A div, not an <a>. Pointing an anchor at the current page makes
            // it a visited link forever, and :visited then owns its colour.
            // This was never navigation anyway — it is a reload button.
            const pill = document.createElement('div');
            pill.className = CONFIG.classNames.orderWatchPill;
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.title = 'eBay has orders this page has not seen. Finish what you are doing, then refresh.';
            const label = document.createElement('span');
            label.textContent = `🔔 ${count} new order${count === 1 ? '' : 's'} since load`;
            const action = document.createElement('span');
            action.className = CONFIG.classNames.orderWatchPillAction;
            action.textContent = 'Refresh';
            pill.append(label, action);

            const onPillActivate = (event) => {
                event.preventDefault();
                // Reloading mid-batch would strand the queue and lose the
                // per-card state that tells you what actually shipped.
                if (shipQueue.running) {
                    action.textContent = 'wait — batch running';
                    setTimeout(() => { action.textContent = 'Refresh'; }, 2500);
                    return;
                }
                WATCHDBG('refresh-clicked', { pending: orderWatch.newIds.size });
                window.location.reload();
            };
            pill.addEventListener('click', onPillActivate);
            pill.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') onPillActivate(event);
            });

            const title = container.querySelector('h2.sku-title');
            if (title) title.insertAdjacentElement('afterend', pill);
            else container.prepend(pill);
        }

        // The status line. Silence from the watcher is ambiguous — "nothing new"
        // and "this died an hour ago" look identical — so a thin line under the
        // pill slot says when it last succeeded, goes amber when it is failing
        // or backed off, and carries the manual check. Deliberately not a
        // countdown: it updates on poll and on a lazy 30s timer, not per second.
        function orderWatchAgo(ms) {
            const secs = Math.round(ms / 1000);
            if (secs < 60) return 'just now';
            const mins = Math.round(secs / 60);
            if (mins < 60) return mins + 'm ago';
            return Math.round(mins / 60) + 'h ago';
        }

        function orderWatchDuration(ms) {
            const secs = Math.round(ms / 1000);
            if (secs < 60) return secs + 's';
            const mins = Math.round(secs / 60);
            if (mins < 60) return mins + 'm';
            return Math.round(mins / 60) + 'h';
        }

        function orderWatchStatusState() {
            const base = Math.max(1, USER_CONFIG.orderWatchIntervalMinutes || 5) * 60 * 1000;
            if (orderWatch.checking) return { tone: 'ok', text: 'checking…' };
            if (!orderWatch.baseline) return { tone: 'ok', text: 'starting…' };
            if (orderWatch.consecutiveFailures > 0) {
                const what = orderWatch.lastResult === 'inconclusive' ? 'unreadable' : 'failed';
                // nextPollAt is only set once the retry is actually scheduled,
                // which is a beat after the failure lands — don't render a
                // confident "retrying in 0s" in that gap.
                const untilRetry = orderWatch.nextPollAt - Date.now();
                const when = untilRetry > 1000 ? `in ${orderWatchDuration(untilRetry)}` : 'shortly';
                return { tone: 'warn', text: `last check ${what} — retrying ${when}` };
            }
            const age = Date.now() - orderWatch.lastPollAt;
            // Two intervals with nothing to show means the timer itself is gone
            // (a suspended tab, a thrown scheduler) — worth saying out loud,
            // because the pill's silence would otherwise read as reassurance.
            if (age > base * 2) return { tone: 'warn', text: `no check in ${orderWatchDuration(age)}` };
            return { tone: 'ok', text: `checked ${orderWatchAgo(age)}` };
        }

        function renderOrderWatchStatus() {
            const container = document.getElementById(CONFIG.ids.skuPanelContainer);
            if (!container) return;
            if (USER_CONFIG.enableOrderWatch === false) {
                container.querySelector(`.${CONFIG.classNames.orderWatchStatus}`)?.remove();
                return;
            }
            let el = container.querySelector(`.${CONFIG.classNames.orderWatchStatus}`);
            if (!el) {
                el = document.createElement('div');
                el.className = CONFIG.classNames.orderWatchStatus;
                const label = document.createElement('span');
                label.className = CONFIG.classNames.orderWatchStatusLabel;
                const action = document.createElement('span');
                action.className = CONFIG.classNames.orderWatchStatusAction;
                action.textContent = 'check now';
                action.title = 'Ask eBay for the current order list right now';
                action.addEventListener('click', orderWatchCheckNow);
                el.append(label, action);
                // Below the pill when there is one, so news stays on top.
                const pill = container.querySelector(`.${CONFIG.classNames.orderWatchPill}`);
                const title = container.querySelector('h2.sku-title');
                if (pill) pill.insertAdjacentElement('afterend', el);
                else if (title) title.insertAdjacentElement('afterend', el);
                else container.prepend(el);
            }
            const state = orderWatchStatusState();
            el.classList.toggle(CONFIG.classNames.orderWatchStatusWarn, state.tone === 'warn');
            const label = el.querySelector(`.${CONFIG.classNames.orderWatchStatusLabel}`);
            if (label) label.textContent = `· ${state.text} ·`;
        }

        function flashOrderWatchStatus(text) {
            const container = document.getElementById(CONFIG.ids.skuPanelContainer);
            const label = container?.querySelector(`.${CONFIG.classNames.orderWatchStatusLabel}`);
            if (!label) return;
            label.textContent = `· ${text} ·`;
            clearTimeout(flashOrderWatchStatus._timer);
            flashOrderWatchStatus._timer = setTimeout(renderOrderWatchStatus, 2200);
        }

        // Manual check. Forced, so it ignores the suspend rules — you asked.
        // Debounced because this origin runs bot detection and an impatient
        // double-click should not turn into a burst of identical requests.
        function orderWatchCheckNow() {
            if (orderWatch.checking) return;
            const sinceManual = Date.now() - (orderWatch.lastManualAt || 0);
            if (sinceManual < 20000) {
                flashOrderWatchStatus(`just checked — wait ${Math.ceil((20000 - sinceManual) / 1000)}s`);
                return;
            }
            orderWatch.lastManualAt = Date.now();
            WATCHDBG('manual-check', { pending: orderWatch.newIds.size });
            orderWatchTick(true).then(scheduleOrderWatch, scheduleOrderWatch);
        }

        // --- Order watch diagnostics ---
        //   altheastixWatchReport()          → copyable state + event log
        //   altheastixWatchReport(true)      → also copies it to the clipboard
        //   altheastixWatchSimulate('new', 2)→ fake 2 new orders, no eBay contact
        //   altheastixWatchSimulate('clear') → clear the pill and start over
        //   altheastixWatchSimulate('poll')  → force one real check right now
        function altheastixWatchReport(copy) {
            const lines = [];
            const ago = ms => (ms ? Math.round((Date.now() - ms) / 1000) + 's ago' : 'never');
            lines.push('=== Altheastix order watch report ===');
            lines.push(`version: ${(typeof GM_info !== 'undefined' && GM_info?.script?.version) || 'unknown'}`);
            lines.push(`enabled: ${USER_CONFIG.enableOrderWatch !== false} interval: ${USER_CONFIG.orderWatchIntervalMinutes || 5}min`);
            lines.push(`baseline: ${orderWatch.baseline ? orderWatch.baseline.size + ' ids' : 'NOT ARMED'}`);
            lines.push(`cards on page: ${document.querySelectorAll(CONFIG.selectors.orderItem).length}`);
            lines.push(`last result: ${orderWatch.lastResult}${orderWatch.lastError ? ' (' + orderWatch.lastError + ')' : ''}`);
            lines.push(`last good poll: ${ago(orderWatch.lastPollAt)} listSize=${orderWatch.lastCount}`);
            lines.push(`next poll in: ${orderWatch.nextPollAt ? Math.max(0, Math.round((orderWatch.nextPollAt - Date.now()) / 1000)) + 's' : 'unscheduled'}`);
            lines.push(`polls: ${orderWatch.pollCount} skips: ${orderWatch.skipCount}${orderWatch.lastSkipReason ? ' (last: ' + orderWatch.lastSkipReason + ')' : ''} failures: ${orderWatch.consecutiveFailures}`);
            lines.push(`suspend check right now: ${orderWatchSuspendReason() || 'clear'}`);
            lines.push(`new since load (${orderWatch.newIds.size}): ${Array.from(orderWatch.newIds).join(', ') || '-'}`);
            lines.push(`pill in DOM: ${document.querySelector('.' + CONFIG.classNames.orderWatchPill) ? 'yes' : 'no'}`);
            lines.push(`status line: ${document.querySelector('.' + CONFIG.classNames.orderWatchStatus) ? orderWatchStatusState().tone + ' — ' + orderWatchStatusState().text : 'NOT IN DOM'}`);
            lines.push(`manual check: ${orderWatch.lastManualAt ? orderWatchAgo(Date.now() - orderWatch.lastManualAt) : 'never'}`);
            lines.push(`--- log (${watchLogBuffer.length}) ---`);
            watchLogBuffer.forEach(e => {
                lines.push(`${e.t} ${e.event}${e.data !== null ? ' ' + JSON.stringify(e.data) : ''}`);
            });
            const text = lines.join('\n');
            console.log(text);
            if (copy) { try { GM_setClipboard(text); console.log('[Altheastix][watch] report copied to clipboard.'); } catch (e) {} }
            return text;
        }

        function altheastixWatchSimulate(kind, n) {
            if (kind === 'new') {
                const howMany = Math.max(1, parseInt(n, 10) || 1);
                if (!orderWatch.baseline) orderWatch.baseline = new Set();
                for (let i = 0; i < howMany; i++) {
                    orderWatch.newIds.add('SIM-' + (orderWatch.newIds.size + 1) + '-' + Math.floor(Math.random() * 100000));
                }
                WATCHDBG('simulate', { kind: 'new', added: howMany, pending: orderWatch.newIds.size });
                renderOrderWatchPill();
                syncPendingBadge();
            } else if (kind === 'clear') {
                orderWatch.newIds.clear();
                WATCHDBG('simulate', { kind: 'clear' });
                renderOrderWatchPill();
                syncPendingBadge();
            } else if (kind === 'stale') {
                // Paints the amber state. Not sticky — the next successful poll
                // resets consecutiveFailures and the line goes quiet again.
                orderWatch.consecutiveFailures = 2;
                orderWatch.lastResult = 'error';
                orderWatch.lastError = 'simulated';
                WATCHDBG('simulate', { kind: 'stale' });
                renderOrderWatchStatus();
            } else if (kind === 'fresh') {
                orderWatch.consecutiveFailures = 0;
                orderWatch.lastResult = 'ok';
                orderWatch.lastError = '';
                orderWatch.lastPollAt = Date.now();
                WATCHDBG('simulate', { kind: 'fresh' });
                renderOrderWatchStatus();
            } else if (kind === 'poll') {
                WATCHDBG('simulate', { kind: 'poll' });
                orderWatchTick(true).then(() => altheastixWatchReport(), () => altheastixWatchReport());
            } else {
                console.warn("[Altheastix][watch] kind must be 'new' | 'clear' | 'stale' | 'fresh' | 'poll'");
                return;
            }
            console.log('[Altheastix][watch] pending new orders: ' + orderWatch.newIds.size);
        }

        try {
            unsafeWindow.altheastixWatchReport = altheastixWatchReport;
            unsafeWindow.altheastixWatchSimulate = altheastixWatchSimulate;
        } catch (e) {
            try {
                window.altheastixWatchReport = altheastixWatchReport;
                window.altheastixWatchSimulate = altheastixWatchSimulate;
            } catch (e2) { console.warn('[Altheastix][watch] diagnostics not reachable from the page console.'); }
        }

        // The tab's own watchdog, plus room for tab startup and the second
        // page load (/mesh/ord/details → /om/shipment/update).
        function shipDeadlineMs() {
            return ((USER_CONFIG.automationTabTimeoutSeconds || 45) * 1000) + 25000;
        }

        function startShipDeadline(orderCard) {
            if (!orderCard || !orderCard.id) return;
            clearShipDeadline(orderCard);
            const id = orderCard.id;
            const timer = setTimeout(() => {
                shipDeadlineTimers.delete(id);
                const card = document.getElementById(id);
                if (!card) return;
                if (card.classList.contains(CONFIG.classNames.orderShipped)) return;
                // Read the explicit markers, never the overlay's presence — an
                // eBay re-render can remove the overlay from a card that is
                // genuinely still in flight, and inferring "undone" from that
                // is what silently disarmed this backstop.
                if (card.dataset.shipUndone === '1') return;
                if (card.dataset.shipInFlight !== '1') return;
                SHIPDBG('deadline:fired', { card: id, afterMs: shipDeadlineMs() });
                markCardShipFailed(card, 'No confirmation from eBay within ' + Math.round(shipDeadlineMs() / 1000) + 's.');
            }, shipDeadlineMs());
            shipDeadlineTimers.set(id, timer);
        }

        function clearShipDeadline(orderCard) {
            if (!orderCard || !orderCard.id) return;
            const timer = shipDeadlineTimers.get(orderCard.id);
            if (timer) { clearTimeout(timer); shipDeadlineTimers.delete(orderCard.id); }
        }

        // Wipe any failed banner/state so a retry starts from a clean card.
        function clearShipFailedState(orderCard) {
            if (!orderCard) return;
            orderCard.classList.remove(CONFIG.classNames.orderShipFailed);
            orderCard.querySelectorAll(`.${CONFIG.classNames.shipFailedBanner}`).forEach(el => el.remove());
        }

        // Returns the card's Mark as Shipped button, rebuilding it if it has
        // gone missing. It legitimately disappears in two ways: a confirmation
        // replaces it with the ✓ Shipped span, and cleanupCardInjections strips
        // it during an eBay re-render. Without this, a card that reaches the
        // failed state with no button gets a Retry that silently does nothing.
        function ensureShipButton(card) {
            if (!card) return null;
            const existing = card.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
            if (existing) return existing;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = CONFIG.classNames.markAsShippedBtn;
            btn.dataset.orderId = card.dataset.orderId || '';
            btn.setAttribute('data-order-item-id', card.id);
            btn.textContent = card.querySelector('.thank-you-checkbox')?.checked
                ? 'Mark as Shipped & Msg' : 'Mark as Shipped';
            const shippedLabel = card.querySelector(`.${CONFIG.classNames.shippedLabel}`);
            if (shippedLabel) { shippedLabel.replaceWith(btn); return btn; }
            const msgContainer = card.querySelector(`.${CONFIG.classNames.messageContainer}`);
            if (msgContainer) { msgContainer.insertAdjacentElement('afterend', btn); return btn; }
            const addressActions = card.querySelector(CONFIG.selectors.addressActions);
            if (addressActions) { addressActions.insertAdjacentElement('afterend', btn); return btn; }
            return null; // no sensible anchor — caller must cope
        }

        function markCardShipFailed(orderCard, why) {
            if (!orderCard) return;
            // A confirmation that landed first always wins.
            if (orderCard.classList.contains(CONFIG.classNames.orderShipped)) return;
            if (orderCard.classList.contains(CONFIG.classNames.orderShipFailed)) return;
            clearShipDeadline(orderCard);
            delete orderCard.dataset.shipInFlight;
            markCardQueued(orderCard, false);
            orderCard.querySelector(`.${CONFIG.classNames.pendingOverlay}`)?.remove();
            orderCard.classList.add(CONFIG.classNames.orderShipFailed);

            const shipBtn = ensureShipButton(orderCard);
            if (shipBtn) {
                shipBtn.disabled = false;
                shipBtn.classList.remove(CONFIG.classNames.markAsShippedWaiting);
                shipBtn.textContent = orderCard.querySelector('.thank-you-checkbox')?.checked
                    ? 'Mark as Shipped & Msg' : 'Mark as Shipped';
            }

            const firstOrderId = (orderCard.dataset.orderId || '').split(',')[0];
            const banner = document.createElement('div');
            banner.className = CONFIG.classNames.shipFailedBanner;

            const text = document.createElement('span');
            text.className = 'ship-failed-text';
            text.textContent = 'Not confirmed as shipped';
            const whyEl = document.createElement('span');
            whyEl.className = 'ship-failed-why';
            whyEl.textContent = why || 'The automation tab did not report back.';
            text.appendChild(whyEl);

            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'ship-retry-btn';
            retryBtn.textContent = 'Retry';
            if (shipQueue.running) {
                retryBtn.disabled = true;
                retryBtn.title = 'A batch is running — retry when it finishes';
            } else if (!shipBtn) {
                // Nowhere to hang a ship request. Say so rather than offering a
                // button that does nothing; Open is the working escape hatch.
                retryBtn.disabled = true;
                retryBtn.title = 'This card lost its ship control — reload the page, or use Open to finish it on eBay';
            }
            retryBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // This listener is its own path into runShipForCard and does
                // NOT go through the delegated handler, so it needs the same
                // batch guard. Without it, clicking Retry on a card that fails
                // mid-batch puts a second ship tab in flight.
                if (shipQueue.running) {
                    SHIPDBG('retry-click:blocked-during-batch', { card: orderCard.id });
                    return;
                }
                const btn = ensureShipButton(orderCard);
                if (btn) {
                    await runShipForCard(orderCard, btn);
                } else {
                    SHIPDBG('retry-click:no-ship-button', { card: orderCard.id });
                    console.warn('[Ship] Retry has nothing to click on ' + orderCard.id + ' — reload the page.');
                }
            });

            const openLink = document.createElement('a');
            openLink.className = 'ship-open-link';
            openLink.textContent = 'Open';
            openLink.href = firstOrderId
                ? `https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}`
                : 'https://www.ebay.com/sh/ord';
            openLink.target = '_blank';
            openLink.rel = 'noopener';
            openLink.title = 'Open the order without automation, to finish it by hand';

            const dismissBtn = document.createElement('button');
            dismissBtn.type = 'button';
            dismissBtn.className = 'ship-dismiss-btn';
            dismissBtn.textContent = '✕';
            dismissBtn.title = 'Dismiss';
            dismissBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearShipFailedState(orderCard);
                syncPendingBadge();
            });

            banner.append(text, retryBtn, openLink, dismissBtn);
            // Never fall back to the card's SIBLING position: every cleanup
            // path (dismiss, re-render, confirmation) scopes its query to
            // inside the card, so a banner placed outside it can never be
            // removed again and floats between cards for the rest of the day.
            if (shipBtn) {
                shipBtn.insertAdjacentElement('afterend', banner);
            } else {
                (orderCard.querySelector(CONFIG.selectors.tcellItem) || orderCard).appendChild(banner);
            }
            syncPendingBadge();
            repaintSkuPanel();
            console.warn('[Ship] Card ' + orderCard.id + ' failed: ' + (why || 'unknown'));
        }

        // The message failed but the ORDER still shipped, so this is a pill on an
        // otherwise-good card, not the red ship-failure banner. Retry just
        // reopens the message tab: the text is still sitting in GM storage,
        // because a message is only consumed once it reaches the composer.
        function markCardMessageFailed(orderCard, payload) {
            if (!orderCard) return;
            const p = payload || {};
            const why = p.reason || 'The buyer message did not go out.';
            // Stashed so the pill can be rebuilt after an eBay re-render wipes
            // it — otherwise the card silently returns to an unqualified green
            // tick and the only record of the failure is gone.
            orderCard.dataset.msgOutcome = 'failed';
            orderCard.dataset.msgFailedReason = why;
            orderCard.dataset.msgFailedAction = p.action || '';
            orderCard.dataset.msgFailedRetryable = p.retryable ? '1' : '0';
            orderCard.querySelectorAll(`.${CONFIG.classNames.msgFailedPill}`).forEach(el => el.remove());
            const firstOrderId = (orderCard.dataset.orderId || '').split(',')[0];

            const pill = document.createElement('div');
            pill.className = CONFIG.classNames.msgFailedPill;

            const text = document.createElement('span');
            text.className = 'msg-failed-text';
            text.textContent = '✉ Message not sent';
            const whyEl = document.createElement('span');
            whyEl.className = 'msg-failed-why';
            whyEl.textContent = why;
            text.appendChild(whyEl);

            // Retry only where it can actually work. Once the draft has been
            // pasted the queued message is consumed, so reopening the tab would
            // find nothing and stop silently — Open is the honest control there.
            // Open is ALWAYS present, Retry is additional. During a batch the
            // Retry starts disabled, and an auto-message failure almost always
            // lands mid-batch — so an either/or would leave the pill with no
            // working control in precisely its most common case.
            const openLink = document.createElement('a');
            openLink.className = 'msg-open-link';
            openLink.textContent = 'Open';
            openLink.href = firstOrderId
                ? `https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}`
                : 'https://www.ebay.com/sh/ord';
            openLink.target = '_blank';
            openLink.rel = 'noopener';
            openLink.title = 'Open the order on eBay to send the message by hand';

            // Retry only where it can work AND where we know which draft to
            // reopen. An unknown action must never fall through to auto_message:
            // that would peek the thank-you draft and, with auto-send on, mail
            // the buyer something the seller never chose.
            const knownAction = p.action === 'auto_message' || p.action === 'manual_message';
            let retryBtn = null;
            if (p.retryable && firstOrderId && knownAction) {
                retryBtn = document.createElement('button');
                retryBtn.type = 'button';
                retryBtn.textContent = 'Retry message';
                retryBtn.title = 'Reopen the message tab — the draft is still queued';
                if (shipQueue.running) {
                    retryBtn.disabled = true;
                    retryBtn.title = 'A batch is running — retry when it finishes';
                }
                retryBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // The message tab opens in the FOREGROUND; clicking this
                    // mid-batch would yank focus off a live send.
                    if (shipQueue.running) {
                        SHIPDBG('message:retry-blocked-during-batch', { card: orderCard.id });
                        return;
                    }
                    // Validate BEFORE disabling, so a bad action can never leave
                    // a dead button as the card's only control.
                    const act = orderCard.dataset.msgFailedAction;
                    if (act !== 'auto_message' && act !== 'manual_message') {
                        SHIPDBG('message:retry-unknown-action', { card: orderCard.id, action: act });
                        return;
                    }
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Retrying…';
                    SHIPDBG('message:retry', { card: orderCard.id, orderId: firstOrderId, action: act });
                    // The pill stays until a result comes back and replaces it —
                    // clearing it on click would leave a clean-looking card if
                    // the retry also fails.
                    openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}&tm_action=${act}`, { active: true });
                    // If no result ever arrives — the seller closes the tab, or
                    // it dies outside the composer waits — re-arm rather than
                    // leaving a dead "Retrying…" button as the only control.
                    setTimeout(() => {
                        if (retryBtn.isConnected && retryBtn.textContent === 'Retrying…') {
                            retryBtn.disabled = false;
                            retryBtn.textContent = 'Retry message';
                        }
                    }, 90000);
                });
            }

            const dismissBtn = document.createElement('button');
            dismissBtn.type = 'button';
            dismissBtn.className = 'msg-dismiss-btn';
            dismissBtn.textContent = '✕';
            dismissBtn.title = 'Dismiss';
            dismissBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                pill.remove();
                // Clear the stash too, or the pill resurrects on the next
                // eBay re-render.
                delete orderCard.dataset.msgOutcome;
                delete orderCard.dataset.msgFailedReason;
                delete orderCard.dataset.msgFailedAction;
                delete orderCard.dataset.msgFailedRetryable;
            });

            if (retryBtn) pill.append(text, retryBtn, openLink, dismissBtn);
            else pill.append(text, openLink, dismissBtn);
            const anchor = orderCard.querySelector(`.${CONFIG.classNames.shippedLabel}`)
                || orderCard.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
            if (anchor) anchor.insertAdjacentElement('afterend', pill);
            else (orderCard.querySelector(CONFIG.selectors.tcellItem) || orderCard).appendChild(pill);
            SHIPDBG('message:failed', { card: orderCard.id, reason: why });
        }

        // Deliberately the SAME matcher processShipmentConfirmation uses. The
        // two keys are written from two different URLs (?orderid= and
        // ?orderId=); an asymmetric matcher here would make failures silently
        // un-routable while confirmations kept working — and failure is the
        // far less exercised path, so that is exactly where it would hide.
        function findCardByOrderId(orderId) {
            if (!orderId) return null;
            const card = Array.from(document.querySelectorAll(CONFIG.selectors.orderItem))
                .find(c => c.dataset.orderId?.includes(orderId)) || null;
            if (!card) console.warn('[Ship] Failure reported for order ' + orderId + ' but no card matched it.');
            return card;
        }

        // Resolves once the card reaches a terminal state. Polled rather than
        // promise-plumbed so it stays correct no matter which of the several
        // paths (listener, poller, deadline) actually resolved the card.
        function awaitCardShipResolution(orderCard, timeoutMs) {
            return new Promise(resolve => {
                const started = Date.now();
                const iv = setInterval(() => {
                    if (!document.body.contains(orderCard)) { clearInterval(iv); resolve('gone'); return; }
                    if (orderCard.classList.contains(CONFIG.classNames.orderShipped)) { clearInterval(iv); resolve('confirmed'); return; }
                    if (orderCard.classList.contains(CONFIG.classNames.orderShipFailed)) { clearInterval(iv); resolve('failed'); return; }
                    // Undo pressed mid-queue — treat as the user taking over.
                    // This checks an explicit marker rather than the absence of
                    // the pending overlay, because the overlay also disappears
                    // when eBay re-renders a combined card and the re-render
                    // watchdog reprocesses it. Reading that as "cancelled" let
                    // the queue start the next order while this one was still
                    // in flight — two ship tabs at once, which is precisely
                    // what the single-slot CONFIRMED_SHIP_KEY cannot survive.
                    if (orderCard.dataset.shipUndone === '1') { clearInterval(iv); resolve('cancelled'); return; }
                    if (Date.now() - started > timeoutMs) { clearInterval(iv); resolve('timeout'); }
                }, 500);
            });
        }

        // ===================================================================
        // BATCH SHIP QUEUE
        // ===================================================================
        // Strictly one order at a time, waiting on a real outcome rather than
        // a fixed sleep. Serial is not a performance compromise here, it is
        // the only safe option: the thank-you message tab is deliberately
        // opened in the FOREGROUND so paste/auto-send runs with focus, and
        // several of those at once would fight over the browser. Serialising
        // also sidesteps the single-slot CONFIRMED_SHIP_KEY, which two
        // simultaneous ship tabs could otherwise clobber.

        const shipQueue = { running: false, stopRequested: false, total: 0, done: 0, failed: 0, skipped: 0, current: 0 };
        // PrintSKUTable owns the "Ship N Selected" button, but skuManager is a
        // local of main(). The queue needs to force a panel repaint when it
        // finishes, or the button stays stuck reading "Shipping…".
        let skuManagerRef = null;
        function repaintSkuPanel() {
            try { skuManagerRef?.createSKUPackingList(); } catch (e) { console.error('[Ship] panel repaint failed:', e); }
            // Shipping an order changes what each filter would match, so the
            // counts in the batch bar have to move with it.
            try { refreshBatchSelectControls(); } catch (e) { console.error('[Ship] batch control refresh failed:', e); }
        }

        function shipDock() {
            return document.getElementById('altheastix-ship-dock');
        }

        function renderShipDock(statusText) {
            const dock = shipDock();
            if (!dock) return;
            dock.classList.add('visible');
            updateSkuPanelPosition(); // the dock's left offset is set there
            const settled = shipQueue.done + shipQueue.failed + shipQueue.skipped;
            const pct = shipQueue.total ? Math.round((settled / shipQueue.total) * 100) : 0;
            dock.innerHTML = '';

            const title = document.createElement('div');
            title.className = 'dock-title';
            const titleText = document.createElement('span');
            titleText.textContent = statusText || `Shipping ${shipQueue.current} of ${shipQueue.total}`;
            title.appendChild(titleText);
            dock.appendChild(title);

            const counts = document.createElement('div');
            counts.className = 'dock-counts';
            const ok = document.createElement('span');
            ok.className = 'ok';
            ok.textContent = `${shipQueue.done} shipped`;
            counts.append(ok, document.createTextNode(' · '));
            if (shipQueue.failed > 0) {
                const bad = document.createElement('span');
                bad.className = 'bad';
                bad.textContent = `${shipQueue.failed} failed`;
                counts.append(bad, document.createTextNode(' · '));
            }
            if (shipQueue.skipped > 0) counts.append(document.createTextNode(`${shipQueue.skipped} skipped · `));
            counts.append(document.createTextNode(`${Math.max(0, shipQueue.total - settled)} to go`));
            dock.appendChild(counts);

            const bar = document.createElement('div');
            bar.className = 'dock-bar';
            const fill = document.createElement('div');
            fill.className = 'dock-bar-fill';
            fill.style.width = pct + '%';
            bar.appendChild(fill);
            dock.appendChild(bar);

            const actions = document.createElement('div');
            actions.className = 'dock-actions';

            if (shipQueue.running) {
                const stop = document.createElement('button');
                stop.type = 'button';
                stop.className = 'dock-stop';
                stop.textContent = 'Stop after this one';
                stop.addEventListener('click', () => {
                    shipQueue.stopRequested = true;
                    renderShipDock('Stopping after the current order…');
                });
                actions.appendChild(stop);
            } else {
                if (shipQueue.failed > 0) {
                    const retryAll = document.createElement('button');
                    retryAll.type = 'button';
                    retryAll.textContent = `Retry ${shipQueue.failed} failed`;
                    retryAll.addEventListener('click', () => {
                        const failedCards = Array.from(document.querySelectorAll(
                            `${CONFIG.selectors.orderItem}.${CONFIG.classNames.orderShipFailed}`));
                        if (failedCards.length) startShipQueue(failedCards);
                    });
                    actions.appendChild(retryAll);
                }
                const close = document.createElement('button');
                close.type = 'button';
                close.textContent = 'Close';
                close.addEventListener('click', () => dock.classList.remove('visible'));
                actions.appendChild(close);
            }
            dock.appendChild(actions);
        }

        // A card is shippable if it isn't already shipped and isn't mid-flight.
        function isCardShippable(card) {
            if (!card) return false;
            if (card.classList.contains(CONFIG.classNames.orderShipped)) return false;
            if (card.querySelector(`.${CONFIG.classNames.pendingOverlay}`)) return false;
            return !!card.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
        }

        function selectedShippableCards() {
            return Array.from(document.querySelectorAll(CONFIG.selectors.orderItem))
                .filter(card => card.querySelector(CONFIG.selectors.checkbox)?.checked)
                .filter(isCardShippable);
        }

        async function startShipQueue(cards) {
            if (shipQueue.running) return;
            const queueCards = cards.filter(isCardShippable);
            if (queueCards.length === 0) return;

            shipQueue.running = true;
            shipQueue.stopRequested = false;
            shipQueue.total = queueCards.length;
            shipQueue.done = 0;
            shipQueue.failed = 0;
            shipQueue.skipped = 0;
            shipQueue.current = 0;

            const perOrderTimeout = shipDeadlineMs() + 5000;
            SHIPDBG('queue:start', { orders: queueCards.length, perOrderTimeout: perOrderTimeout });
            renderShipDock('Starting…');
            queueCards.forEach(c => markCardQueued(c, true));
            repaintSkuPanel();

            // Everything below is wrapped: a single throw used to leave
            // shipQueue.running true forever, which silently disabled batch
            // shipping for the rest of the session with no way back but a
            // reload. One bad order must never cost the other twenty-four.
            try {
                for (let i = 0; i < queueCards.length; i++) {
                    if (shipQueue.stopRequested) {
                        queueCards.slice(i).forEach(c => markCardQueued(c, false));
                        SHIPDBG('queue:stopped-by-user', { atIndex: i });
                        break;
                    }
                    const card = queueCards[i];
                    markCardQueued(card, false);
                    if (!document.body.contains(card) || !isCardShippable(card)) {
                        shipQueue.skipped++;
                        SHIPDBG('order:skipped', { card: card.id, state: shipCardState(card) });
                        renderShipDock();
                        continue;
                    }
                    shipQueue.current = i + 1;
                    renderShipDock();
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Rebuild rather than fail: a card can lose its button to an
                    // eBay re-render between selection and its turn in the queue.
                    const btn = ensureShipButton(card);
                    if (!btn) {
                        shipQueue.failed++;
                        markCardShipFailed(card, 'The card lost its Mark as Shipped button before the batch reached it.');
                        SHIPDBG('order:no-button', { card: card.id });
                        renderShipDock();
                        continue;
                    }

                    SHIPDBG('order:begin', { n: i + 1, of: queueCards.length, card: card.id, ids: card.dataset.orderId });
                    let outcome;
                    try {
                        await runShipForCard(card, btn);
                        outcome = await awaitCardShipResolution(card, perOrderTimeout);
                    } catch (err) {
                        outcome = 'threw';
                        console.error('[Ship] Order threw during batch:', err);
                        markCardShipFailed(card, 'The ship request threw: ' + (err?.message || err));
                    }
                    SHIPDBG('order:end', { card: card.id, outcome: outcome, state: shipCardState(card) });

                    if (outcome === 'confirmed') shipQueue.done++;
                    else if (outcome === 'cancelled' || outcome === 'gone') shipQueue.skipped++;
                    else {
                        shipQueue.failed++;
                        if (outcome === 'timeout') {
                            markCardShipFailed(card, 'The batch gave up waiting for eBay to confirm.');
                        }
                    }
                    renderShipDock();
                    // A breath between orders so eBay isn't hit back to back.
                    if (i < queueCards.length - 1 && !shipQueue.stopRequested) {
                        await new Promise(r => setTimeout(r, 1200));
                    }
                }
            } catch (err) {
                console.error('[Ship] Batch aborted:', err);
                SHIPDBG('queue:threw', { message: err?.message || String(err) });
            } finally {
                queueCards.forEach(c => markCardQueued(c, false));
                shipQueue.running = false;
                shipQueue.current = shipQueue.total;
                // Re-enable the Retry controls that were disabled because a
                // batch was running. Without this they stay dead for the rest
                // of the session — and a message failure raised DURING a batch
                // is the ordinary case, not the edge case.
                document.querySelectorAll(
                    `.${CONFIG.classNames.msgFailedPill} button[disabled], .${CONFIG.classNames.shipFailedBanner} .ship-retry-btn[disabled]`
                ).forEach(b => {
                    if (b.classList.contains('msg-dismiss-btn')) return;
                    if (b.textContent === 'Retrying…') return;
                    b.disabled = false;
                    b.title = '';
                });
                const stopped = shipQueue.stopRequested;
                renderShipDock(stopped
                    ? `Stopped — ${shipQueue.done} shipped, ${shipQueue.failed} failed`
                    : (shipQueue.failed > 0
                        ? `Finished with ${shipQueue.failed} problem${shipQueue.failed === 1 ? '' : 's'}`
                        : `All ${shipQueue.done} shipped`));
                // Repaint so the panel button leaves its "Shipping…" state.
                repaintSkuPanel();
                SHIPDBG('queue:finished', { done: shipQueue.done, failed: shipQueue.failed, skipped: shipQueue.skipped });
            }
        }

        // A card waiting its turn shows a badge, so it is obvious which orders
        // the batch still owns and that clicking them by hand is a bad idea.
        function markCardQueued(card, isQueued) {
            if (!card) return;
            const existing = card.querySelector(`.${CONFIG.classNames.shipQueuedBadge}`);
            if (!isQueued) { existing?.remove(); return; }
            if (existing) return;
            const shipBtn = card.querySelector(`.${CONFIG.classNames.markAsShippedBtn}`);
            if (!shipBtn) return;
            const badge = document.createElement('div');
            badge.className = CONFIG.classNames.shipQueuedBadge;
            badge.textContent = '⏳ Queued for batch shipping';
            shipBtn.insertAdjacentElement('afterend', badge);
        }

        // Pre-flight. Never start a batch without saying exactly what it will
        // do — especially the message count, because those tabs take focus.
        function confirmShipBatch(cards) {
            const withMsg = cards.filter(c => c.querySelector('.thank-you-checkbox')?.checked).length;
            const withNote = cards.filter(c => c.querySelector('.ship-tomorrow-checkbox')?.checked).length;
            // 30s/order, not 20: measured across two real batches (12 orders,
            // 2026-08-23) the wall-clock cost was ~29s each — eBay confirms in
            // 23–31s and the inter-order pause and tab teardown add the rest.
            // The old 20s estimate under-promised a 10-order run by ~40%.
            const mins = Math.max(1, Math.round((cards.length * 30) / 60));

            const overlay = document.createElement('div');
            overlay.className = 'canned-modal-overlay';
            const content = document.createElement('div');
            content.className = 'canned-modal-content';

            const h3 = document.createElement('h3');
            h3.textContent = `Ship ${cards.length} order${cards.length === 1 ? '' : 's'}?`;
            content.appendChild(h3);

            const list = document.createElement('ul');
            list.className = 'ship-confirm-list';
            [
                ['Orders to mark shipped', cards.length],
                ['Thank-you messages', withMsg],
                ['"Will ship" notes', withNote],
                ['Rough time, one at a time', `~${mins} min`]
            ].forEach(([label, value]) => {
                const li = document.createElement('li');
                const l = document.createElement('span');
                l.textContent = label;
                const v = document.createElement('b');
                v.textContent = String(value);
                li.append(l, v);
                list.appendChild(li);
            });
            content.appendChild(list);

            if (withMsg > 0) {
                const warn = document.createElement('p');
                warn.className = 'ship-confirm-warn';
                warn.textContent = `${withMsg} message tab${withMsg === 1 ? '' : 's'} will open in the foreground and take focus as they go, so the browser won't be usable during the run. Turn off "Send thank you msg" in Configuration to keep everything in background tabs.`;
                content.appendChild(warn);
            }

            const buttons = document.createElement('div');
            buttons.className = 'canned-modal-buttons';
            const cancel = document.createElement('button');
            cancel.className = 'canned-modal-button secondary';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => overlay.remove());
            const go = document.createElement('button');
            go.className = 'canned-modal-button primary';
            go.textContent = `Ship ${cards.length}`;
            go.addEventListener('click', () => {
                overlay.remove();
                startShipQueue(cards);
            });
            buttons.append(cancel, go);
            content.appendChild(buttons);

            overlay.appendChild(content);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            const esc = (e) => {
                if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
            };
            document.addEventListener('keydown', esc);
            document.body.appendChild(overlay);
        }

        // --- Ship one card (extracted verbatim from the old click handler) ---
        // Both the per-card button and the batch queue go through here, so the
        // two paths can never drift. Behaviour is unchanged apart from three
        // things: the overlay no longer claims success before eBay has
        // confirmed anything, a failure deadline is armed, and any previous
        // failed state on the card is cleared before a retry.
        async function runShipForCard(orderItemElement, target) {
            if (!orderItemElement || !target) return;
            // Bail before touching any state if there is nothing to ship —
            // otherwise the batch clears the card's banner, opens nothing, and
            // then burns the full per-order timeout waiting for a confirmation
            // that was never requested.
            // Returns true if a ship request actually went out. Bail before
            // touching any state when there is nothing to ship — otherwise the
            // batch clears the card's banner, opens nothing, and then burns the
            // full per-order timeout waiting for a confirmation never requested.
            if (!target.dataset.orderId) {
                SHIPDBG('order:no-order-id', { card: orderItemElement.id });
                markCardShipFailed(orderItemElement, 'This card has no eBay order id — nothing to mark as shipped.');
                return false;
            }
            clearShipFailedState(orderItemElement);
            delete orderItemElement.dataset.shipUndone;
            // Stamped so a late failure report from a PREVIOUS attempt can be
            // recognised as stale and ignored, instead of tearing down the
            // retry that is currently in flight.
            orderItemElement.dataset.shipAttemptAt = String(Date.now());
            SHIPDBG('order:ship-requested', { card: orderItemElement.id, ids: target.dataset.orderId });
            const orderIdString = target.dataset.orderId;
            if (orderIdString && orderItemElement) {
                const shipTomorrowCheckbox = orderItemElement.querySelector('.ship-tomorrow-checkbox');
                const thankYouCheckbox = orderItemElement.querySelector('.thank-you-checkbox');
                const firstOrderId = orderIdString.split(',')[0];

                // The `…Sent` guards make this safe to call twice on one card.
                // Only the SHIP step can fail and be retried; the note and the
                // message are one-shot side effects, and re-running them would
                // send the buyer a second thank-you every time you hit Retry.
                if (shipTomorrowCheckbox && shipTomorrowCheckbox.checked && orderItemElement.dataset.shipNoteSent !== '1') {
                    orderItemElement.dataset.shipNoteSent = '1';
                    const tomorrow = computeNextShipDateSkippingSunday(1);
                    const options = { weekday: 'long', month: 'short', day: 'numeric' };
                    const formattedDate = tomorrow.toLocaleDateString('en-US', options);
                    const noteText = `Will be shipped on ${formattedDate}`;

                    await GM_setValue(NOTE_ADD_KEY, { orderId: firstOrderId, note: noteText });
                    openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}&tm_action=add_note`, { active: false });

                    const noteLink = orderItemElement.querySelector(`.${CONFIG.classNames.addNoteLink}[data-order-id="${firstOrderId}"]`);
                    if (noteLink) {
                        noteLink.textContent = 'note ✅';
                    }
                }

                if (thankYouCheckbox && thankYouCheckbox.checked && orderItemElement.dataset.shipMsgSent !== '1') {
                    orderItemElement.dataset.shipMsgSent = '1';
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
                    const threshold = USER_CONFIG.trackingOrderAmountThreshold || 25;
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
                    try {
                        await queueBuyerMessage(MESSAGE_SEND_KEY, firstOrderId, finalMessageText);
                    } catch (err) {
                        // The flag is set before the write so a retry can never
                        // double-send. If the write itself failed then nothing
                        // was queued, so let a retry attempt it again.
                        delete orderItemElement.dataset.shipMsgSent;
                        throw err;
                    }
                    // Open the message tab in the foreground so paste/auto-send runs with focus
                    openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${firstOrderId}&tm_action=auto_message`, { active: true });
                }

                const orderIds = orderIdString.split(',');
                const overlay = document.createElement('div');
                overlay.className = CONFIG.classNames.pendingOverlay;
                overlay.innerHTML = `<div class="${CONFIG.classNames.pendingOverlayContent}"><div class="${CONFIG.classNames.processingIcon}"></div><span id="overlay-text"></span><span class="pending-sub" id="overlay-sub"></span></div>`;
                const undoBtn = document.createElement('button');
                undoBtn.textContent = 'Undo';
                undoBtn.style.cssText = 'margin-top:8px;padding:3px 10px;font-size:12px;border-radius:4px;background:#f5f5f5;color:#666;border:1px solid #ddd;cursor:pointer;font-weight:normal;opacity:0.7;';
                undoBtn.onclick = (e) => {
                    e.stopPropagation();
                    overlay.remove();
                    target.textContent = orderItemElement.querySelector('.thank-you-checkbox')?.checked ? 'Mark as Shipped & Msg' : 'Mark as Shipped';
                    target.disabled = false;
                    target.classList.remove(CONFIG.classNames.markAsShippedWaiting);
                    orderItemElement.dataset.shipUndone = '1';
                    delete orderItemElement.dataset.shipInFlight;
                    clearShipDeadline(orderItemElement);
                    SHIPDBG('order:undone', { card: orderItemElement.id });
                    syncPendingBadge();
                };
                overlay.firstChild.appendChild(undoBtn);
                // Set the instant the overlay exists, NOT after the tab loop:
                // a combined card opens one tab per order id with a 1s gap
                // between them, and an eBay re-render landing inside that
                // window would otherwise strip the overlay and leave real ship
                // tabs in flight with no overlay, no timer and no banner.
                orderItemElement.dataset.shipInFlight = '1';
                orderItemElement.appendChild(overlay);
                syncPendingBadge();
                const textElement = overlay.querySelector('#overlay-text');
                target.textContent = 'Requested...';
                target.disabled = true;
                target.classList.add(CONFIG.classNames.markAsShippedWaiting);
                for (let i = 0; i < orderIds.length; i++) {
                    textElement.textContent = `Opening tab ${i + 1} of ${orderIds.length}...`;
                    // tm_attempt lets a failure report identify WHICH attempt it
                    // belongs to. Stamping the report with Date.now() is not
                    // enough: a watchdog from attempt 1 fires after attempt 2
                    // has already started, so by report time it looks newer.
                    openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderIds[i]}&tm_action=ship&tm_attempt=${orderItemElement.dataset.shipAttemptAt || ''}`, { active: false });
                    if (i < orderIds.length - 1) await new Promise(resolve => setTimeout(resolve, CONFIG.timing.sequentialTabDelay));
                }
                textElement.textContent = 'Marked as shipped — confirming…';
                const subElement = overlay.querySelector('#overlay-sub');
                if (subElement) subElement.textContent = `waiting up to ${Math.round(shipDeadlineMs() / 1000)}s for eBay`;
                startShipDeadline(orderItemElement);
            }
            return true;
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
                if (target.classList.contains(CONFIG.classNames.shipsLabelPill)) {
                    event.preventDefault();
                    if (orderItemElement) {
                        const nowLabel = orderItemElement.dataset.shipsWithLabel !== 'true';
                        orderItemElement.dataset.shipsWithLabel = nowLabel ? 'true' : 'false';
                        target.classList.toggle(CONFIG.classNames.shipsLabelActive, nowLabel);
                        refreshBatchSelectControls();
                    }
                    return;
                }
                if (target.classList.contains('ship-when-btn')) {
                    event.preventDefault();
                    setShipWhenState(orderItemElement, target.dataset.when === 'tomorrow');
                    return;
                }
                if (target.classList.contains('thank-you-checkbox')) {
                    setCardMsgGating(orderItemElement, target.checked);
                    return;
                }
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
                            openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=add_note`, { active: false });
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
                        <label class="tracking-autosubmit-label" style="display:flex; align-items:center; gap:6px; font-size:12px; margin-top:6px; cursor:pointer;">
                            <input type="checkbox" class="tracking-autosubmit-checkbox" checked>
                            Auto-press Save on eBay
                        </label>
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
                            const autoSubmit = tooltip.querySelector('.tracking-autosubmit-checkbox')?.checked ?? true;
                            await GM_setValue(TRACKING_ADD_KEY_V2, { orderId: orderId, trackingNumber: trackingNumberClean, autoSubmit: autoSubmit });
                            openAutomationTab(`https://www.ebay.com/ship/tr/update?orders=${orderId}`, { active: true });
                        } else {
                            await GM_setValue(TRACKING_ADD_KEY, { orderId: orderId, trackingNumber: trackingNumberClean, timestamp: Date.now() });
                            openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=track`, { active: true });
                        }
                        tooltip.remove();
                        document.removeEventListener('click', closeTooltipHandler, true);
                    });
                    tooltip.addEventListener('click', e => e.stopPropagation());
                    return;
                }
                if (target.classList.contains(CONFIG.classNames.markAsShippedBtn)) {
                    event.preventDefault();
                    // A manual click during a batch would put two ship tabs in
                    // flight at once, and the single-slot CONFIRMED_SHIP_KEY
                    // can only carry one — the loser rides its deadline to a
                    // red "failed" banner on an order eBay actually shipped.
                    if (shipQueue.running) {
                        SHIPDBG('manual-click:blocked-during-batch', { card: orderItemElement?.id });
                        const prev = target.textContent;
                        target.textContent = 'Batch running…';
                        setTimeout(() => { if (target.textContent === 'Batch running…') target.textContent = prev; }, 1600);
                        return;
                    }
                    await runShipForCard(orderItemElement, target);
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
                        const template = CONFIG.manualMessageDrafts[selectedMessageKey] || '';

                        // Resolve the buyer's first name up front so the live preview can use it.
                        // eBay buyer names sometimes arrive ALL CAPS — humanizeName() title-cases
                        // them so the greeting reads as if hand-written ("GEORGE" -> "George").
                        const orderItemEl = target.closest(CONFIG.selectors.orderItem);
                        const fullNameEl = orderItemEl?.querySelector('.print__address__fullname');
                        const buyerName = (fullNameEl?.textContent || '').trim();
                        const buyerFirst = humanizeName(buyerName.split(/\s+/)[0] || 'there');

                        const modalOverlay = document.createElement('div');
                        modalOverlay.className = 'canned-modal-overlay';

                        const modalContent = document.createElement('div');
                        modalContent.className = 'canned-modal-content';

                        let surpriseStickerInput = '';
                        if (isGift) {
                            surpriseStickerInput = '<input type="text" id="surprise-sticker" class="canned-modal-input" placeholder="Surprise Sticker Name">';
                        }

                        const previewBlock = `
                                <div class="canned-modal-preview-label">Live preview <span class="canned-modal-preview-status" id="canned-preview-status" style="display:none;">— edited by hand (<a id="canned-preview-reset">reset</a>)</span></div>
                                <div class="canned-modal-preview" id="canned-preview" contenteditable="true" spellcheck="true"></div>`;

                        if (isPreorder) {
                            modalContent.innerHTML = `
                                <h3>Customize "Preorder Sticker" Message</h3>
                                <input type="text" id="sticker-name" class="canned-modal-input" placeholder="Sticker Name">
                                <input type="text" id="shipping-date" class="canned-modal-input" placeholder="Shipping Date">
                                ${previewBlock}
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
                                ${previewBlock}
                                <div class="canned-modal-buttons">
                                    <button class="canned-modal-button secondary" id="cancel-canned">Cancel</button>
                                    <button class="canned-modal-button primary" id="generate-canned">Generate Message</button>
                                </div>
                            `;
                        }

                        modalOverlay.appendChild(modalContent);
                        document.body.appendChild(modalOverlay);

                        // Builds the fully interpolated message from the current modal inputs.
                        // Shared by the live preview and the final "Generate Message" action so
                        // that what the user previews is exactly what gets sent.
                        const buildMessageText = () => {
                            const stickerName = (document.getElementById('sticker-name')?.value || '').trim();
                            const arrivalDate = !isPreorder ? (document.getElementById('arrival-date')?.value || '').trim() : '';
                            const shippingDate = isPreorder ? (document.getElementById('shipping-date')?.value || '').trim() : '';
                            const surpriseSticker = isGift ? (document.getElementById('surprise-sticker')?.value || '').trim() : '';
                            return applyTemplate(template, {
                                BUYER_FIRST: buyerFirst,
                                STICKER_NAME: stickerName,
                                ARRIVAL_DATE: arrivalDate,
                                SHIPPING_DATE: shippingDate,
                                SURPRISE_STICKER: surpriseSticker
                            });
                        };

                        // Live preview: re-render the interpolated message on every keystroke.
                        // The buyer's custom field values are shown in an accent color so changes
                        // stand out from the fixed template text; fields not yet filled render as
                        // a pill placeholder instead of leaving a blank gap.
                        const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => (
                            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
                        const previewFields = {
                            STICKER_NAME: { id: 'sticker-name', label: 'sticker name' },
                            ARRIVAL_DATE: { id: 'arrival-date', label: 'arrival date' },
                            SHIPPING_DATE: { id: 'shipping-date', label: 'shipping date' },
                            SURPRISE_STICKER: { id: 'surprise-sticker', label: 'surprise sticker' }
                        };
                        const previewEl = modalContent.querySelector('#canned-preview');
                        // Manual-edit support: the preview is contenteditable so the user can
                        // tweak any part of the final message text directly. As soon as the
                        // user types inside the preview, template sync stops (so field inputs
                        // don't clobber the hand edits), an "edited by hand" indicator appears,
                        // and the message sent is taken verbatim from the preview. The reset
                        // link discards manual edits and restores the template-synced preview.
                        let previewManuallyEdited = false;
                        const previewStatusEl = modalContent.querySelector('#canned-preview-status');
                        const renderPreview = () => {
                            if (previewManuallyEdited) return;
                            let html = '';
                            let lastIndex = 0;
                            let match;
                            const tokenRe = /\{([A-Z0-9_]+)\}/g;
                            while ((match = tokenRe.exec(template)) !== null) {
                                html += escapeHtml(template.slice(lastIndex, match.index));
                                const key = match[1];
                                const field = previewFields[key];
                                if (key === 'BUYER_FIRST') {
                                    html += escapeHtml(buyerFirst);
                                } else if (field) {
                                    const value = (document.getElementById(field.id)?.value || '').trim();
                                    html += value
                                        ? `<span class="canned-modal-token">${escapeHtml(value)}</span>`
                                        : `<span class="canned-modal-pill">${escapeHtml(field.label)}</span>`;
                                } else {
                                    html += escapeHtml(match[0]);
                                }
                                lastIndex = match.index + match[0].length;
                            }
                            html += escapeHtml(template.slice(lastIndex));
                            previewEl.innerHTML = html;
                        };
                        modalContent.querySelectorAll('.canned-modal-input').forEach((input) => {
                            input.addEventListener('input', renderPreview);
                        });
                        renderPreview();

                        previewEl.addEventListener('input', () => {
                            if (!previewManuallyEdited) {
                                previewManuallyEdited = true;
                                previewStatusEl.style.display = '';
                            }
                        });
                        previewStatusEl.querySelector('#canned-preview-reset').addEventListener('click', (e) => {
                            e.preventDefault();
                            previewManuallyEdited = false;
                            previewStatusEl.style.display = 'none';
                            renderPreview();
                        });

                        document.getElementById('cancel-canned').addEventListener('click', () => {
                            modalOverlay.remove();
                        });

                        document.getElementById('generate-canned').addEventListener('click', async () => {
                            // If the preview was hand-edited, send exactly what's shown there
                            // (innerText preserves the line breaks of the pre-wrap preview).
                            const messageText = previewManuallyEdited
                                ? previewEl.innerText.trim()
                                : buildMessageText();

                            await queueBuyerMessage(MANUAL_MESSAGE_SEND_KEY, orderId, messageText);
                            openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=manual_message`, { active: true });

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
                                const buyerFirst = humanizeName(buyerName.split(/\s+/)[0] || 'there');
                                messageText = applyTemplate(template, { BUYER_FIRST: buyerFirst });
                            }
                        }

                        await queueBuyerMessage(MANUAL_MESSAGE_SEND_KEY, orderId, messageText);
                        openAutomationTab(`https://www.ebay.com/mesh/ord/details?orderid=${orderId}&tm_action=manual_message`, { active: true });
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
                        // Save: read the edited lines and rebuild the address HTML.
                        // Preserve the validation badge (⚠ / ✔) that was detached when entering edit mode
                        // by re-injecting it into the rebuilt first line, so editing the address never
                        // mutates or strips the status icon.
                        const inputs = Array.from(addressElement.querySelectorAll(`.${CONFIG.classNames.addressEditInput}`));
                        const savedBadge = addressElement.dataset.savedBadgeHtml || '';
                        const lines = inputs.map(input => input.value.trim()).filter(line => line);
                        if (lines.length > 0 && savedBadge) {
                            // Re-attach badge to the end of the first line (name line), matching the
                            // original layout where the badge sat next to the fullname.
                            lines[0] = `${lines[0]} ${savedBadge}`;
                        }
                        addressElement.innerHTML = lines.join('<br>');
                        delete addressElement.dataset.savedBadgeHtml;
                        orderItemElement.classList.remove(CONFIG.classNames.isEditingAddress);
                        editBtn.textContent = 'Edit';
                        copyBtn.style.display = 'inline';
                        addressActions.querySelector(`.${CONFIG.classNames.cancelWrapper}`)?.remove();
                    } else {
                        orderItemElement.classList.add(CONFIG.classNames.isEditingAddress);
                        addressElement.dataset.originalHtml = addressElement.innerHTML;
                        // Detach the validation badge(s) BEFORE reading innerText so the ⚠ / ✔
                        // character doesn't get captured into the name line. We stash the badge
                        // HTML and re-attach it on save (or restore the original HTML on cancel).
                        const badgeEls = Array.from(addressElement.querySelectorAll(
                            `.${CONFIG.classNames.addrWarningBadge}, .${CONFIG.classNames.addrOkBadge}`
                        ));
                        addressElement.dataset.savedBadgeHtml = badgeEls.map(b => b.outerHTML).join('');
                        badgeEls.forEach(b => b.remove());
                        const addressLines = addressElement.innerText.split('\n').map(l => l.trim()).filter(line => line !== '');
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
                    // Restoring originalHtml also restores the badge, since it was captured before detach.
                    if (addressElement) addressElement.innerHTML = addressElement.dataset.originalHtml;
                    if (addressElement) delete addressElement.dataset.savedBadgeHtml;
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

        // --- Favicon & Tab Title Pending Badge ---
        // Draws a dynamic favicon (dark rounded square with "A") with a red
        // balloon showing the number of pending (unshipped) SKUs, and prefixes
        // the tab title with "(N)". When nothing is pending, shows a green
        // check instead. Called from PrintSKUTable so it updates on every
        // panel refresh and shipped confirmation. (Works in Firefox; Safari
        // ignores dynamic favicons, hence the title fallback too.)
        // Fetches eBay's real favicon once via GM_xmlhttpRequest and converts
        // it to a data URL so it can be drawn on a canvas without tainting it
        // (a cross-origin <img> would block toDataURL). Resolves to a loaded
        // Image, or null on any failure (the badge then falls back to a dark
        // "A" square).
        let ebayFaviconPromise = null;
        function getEbayFaviconImage() {
            if (!ebayFaviconPromise) {
                ebayFaviconPromise = new Promise((resolve) => {
                    const finish = (dataUrl) => {
                        if (!dataUrl) return resolve(null);
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => resolve(null);
                        img.src = dataUrl;
                    };
                    try {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: 'https://www.ebay.com/favicon.ico',
                            responseType: 'blob',
                            timeout: 10000,
                            onload: (res) => {
                                try {
                                    const reader = new FileReader();
                                    reader.onload = () => finish(reader.result);
                                    reader.onerror = () => finish(null);
                                    reader.readAsDataURL(res.response);
                                } catch (e) { finish(null); }
                            },
                            onerror: () => finish(null),
                            ontimeout: () => finish(null)
                        });
                    } catch (e) { finish(null); }
                });
            }
            return ebayFaviconPromise;
        }

        function updatePendingBadge(pendingCount) {
            try {
                // Skip the redraw if the count is unchanged AND our favicon is
                // still in place (eBay occasionally re-injects its own icon)
                const ourIcon = document.querySelector('link[data-altheastix-favicon]');
                // The order watch also writes to the tab title, so the
                // skip-if-unchanged key has to cover both counts or a new
                // order would never make it into the title.
                const newOrderCount = (typeof orderWatch !== 'undefined' && orderWatch.newIds) ? orderWatch.newIds.size : 0;
                const cacheKey = pendingCount + '/' + newOrderCount;
                if (cacheKey === updatePendingBadge._lastCount && ourIcon) return;
                updatePendingBadge._lastCount = cacheKey;

                const baseTitle = 'Altheastix: Pick-and-Pack';
                const newSuffix = newOrderCount > 0 ? ` — 🔔${newOrderCount} new` : '';
                document.title = (pendingCount > 0 ? `(${pendingCount}) ${baseTitle}` : baseTitle) + newSuffix;

                getEbayFaviconImage().then((baseImg) => drawFaviconCounter(baseImg, pendingCount));
            } catch (e) {
                console.debug('[Tampermonkey][BADGE] updatePendingBadge failed:', e);
            }
        }

        // Draws the favicon at 128px (crisp on high-DPI): eBay's real favicon
        // as the base, with a white rounded box — 65% of the icon's width,
        // justified bottom-right — showing the unshipped count in black.
        // All-shipped: green check balloon instead. If the eBay icon couldn't
        // be fetched, the base falls back to a dark rounded square with "A".
        function drawFaviconCounter(baseImg, pendingCount) {
            try {
                const size = 128;
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                if (baseImg) {
                    ctx.drawImage(baseImg, 0, 0, size, size);
                } else {
                    ctx.fillStyle = '#1f1f1f';
                    if (typeof ctx.roundRect === 'function') {
                        ctx.beginPath();
                        ctx.roundRect(0, 0, size, size, 24);
                        ctx.fill();
                    } else {
                        ctx.fillRect(0, 0, size, size);
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 60px sans-serif';
                    ctx.fillText('A', 42, 44);
                }

                if (pendingCount > 0) {
                    // White counter box: 65% of the icon's width, bottom-right
                    const bw = 83, bh = 72, bx = size - bw, by = size - bh, r = 16;
                    ctx.beginPath();
                    if (typeof ctx.roundRect === 'function') {
                        ctx.roundRect(bx, by, bw, bh, r);
                    } else {
                        ctx.rect(bx, by, bw, bh);
                    }
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.fill();
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#999999';
                    ctx.stroke();
                    const label = pendingCount > 99 ? '99+' : String(pendingCount);
                    ctx.fillStyle = '#000000';
                    ctx.font = `bold ${label.length >= 3 ? 36 : (label.length === 2 ? 50 : 60)}px sans-serif`;
                    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 2);
                } else {
                    // All shipped: green check balloon, bottom-right
                    const bx = 96, by = 96, br = 30;
                    ctx.beginPath();
                    ctx.arc(bx, by, br, 0, Math.PI * 2);
                    ctx.fillStyle = '#2e7d32';
                    ctx.fill();
                    ctx.lineWidth = 6;
                    ctx.strokeStyle = '#ffffff';
                    ctx.stroke();
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx - 13, by + 1);
                    ctx.lineTo(bx - 4, by + 11);
                    ctx.lineTo(bx + 14, by - 10);
                    ctx.stroke();
                }

                // Swap the favicon in (remove eBay's, append ours)
                document.querySelectorAll('link[rel*="icon"]').forEach(l => l.remove());
                const link = document.createElement('link');
                link.rel = 'icon';
                link.type = 'image/png';
                link.dataset.altheastixFavicon = '1';
                link.href = canvas.toDataURL('image/png');
                document.head.appendChild(link);
            } catch (e) {
                console.debug('[Tampermonkey][BADGE] drawFaviconCounter failed:', e);
            }
        }

        // A card counts as "done" for the favicon counter ONLY once the
        // shipment is confirmed. It used to also count the pending overlay,
        // which meant a request that silently failed made the tab look MORE
        // finished than it was — the counter dropped and never came back. A
        // card in flight is still work outstanding, so it still counts.
        function isOrderCardDone(card) {
            return !!card && card.classList.contains(CONFIG.classNames.orderShipped);
        }

        // Recounts pending SKUs directly from ALL order cards and redraws the
        // favicon/title. Deliberately does NOT read the SKU panel pills: when
        // checkboxes are selected, the panel shrinks to the selected subset,
        // but the badge must always show the total unshipped count. Cheap:
        // updatePendingBadge no-ops when unchanged.
        function syncPendingBadge() {
            let pending = 0;
            document.querySelectorAll(CONFIG.selectors.orderItem).forEach(card => {
                if (isOrderCardDone(card)) return;
                card.querySelectorAll('.item').forEach(itemEl => {
                    const detailsList = itemEl.querySelector('[class*="item__details"]');
                    if (!detailsList) return;
                    const hasSku = Array.from(detailsList.querySelectorAll('li')).some(li => li.innerText.trim().startsWith('SKU:'));
                    if (hasSku) pending++;
                });
            });
            updatePendingBadge(pending);
        }

        // --- SKU Management Logic ---
        // Contains all logic for creating, displaying, and updating the "SKUs to Pack" panel.
        function setupSkuLogic() {
            let SKU = [];
            function PrintSKUTable() {
                const container = document.getElementById(CONFIG.ids.skuPanelContainer);
                if (!container) return;
                container.innerHTML = '';
                // Update favicon counter + tab title. Counts from all order
                // cards (not the SKU array, which may be a selected subset).
                syncPendingBadge();
                const isDarkMode = localStorage.getItem(CONFIG.localStorageKeys.darkMode) !== 'false';
                const title = document.createElement('h2');
                title.className = 'sku-title';
                const titleText = document.createElement('span');
                titleText.textContent = `SKUs to Pick and Pack (${SKU.length})`;
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
                // The panel is rebuilt from scratch on every repaint, so the
                // watch pill and status line have to be re-hung here or they
                // disappear the first time an order is marked shipped.
                renderOrderWatchPill();
                renderOrderWatchStatus();

                const contentWrapper = document.createElement('div');
                contentWrapper.id = CONFIG.ids.skuContentWrapper;
                container.appendChild(contentWrapper);
                darkModeToggle.querySelector('input').addEventListener('change', (e) => { localStorage.setItem(CONFIG.localStorageKeys.darkMode, String(e.target.checked)); injectRadicalStyles(); PrintSKUTable(); });

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

                    // Batch ship, driven by the same checkboxes that drive
                    // "Print N Selected". Deliberately absent when nothing is
                    // checked — there is no "Ship All" here, because shipping
                    // the whole page by accident is not a recoverable click.
                    if (checkedCheckboxes.length > 0) {
                        const shippable = selectedShippableCards();
                        const shipSelectedBtn = document.createElement('button');
                        shipSelectedBtn.type = 'button';
                        shipSelectedBtn.className = CONFIG.classNames.shipSelectedBtn;
                        if (shipQueue.running) {
                            shipSelectedBtn.textContent = 'Shipping…';
                            shipSelectedBtn.disabled = true;
                        } else if (shippable.length === 0) {
                            shipSelectedBtn.textContent = 'Selected orders already shipped';
                            shipSelectedBtn.disabled = true;
                        } else {
                            shipSelectedBtn.textContent = `Ship ${shippable.length} Selected Order${shippable.length === 1 ? '' : 's'}`;
                            shipSelectedBtn.title = 'Mark each selected order as shipped, one at a time, waiting for eBay to confirm each before starting the next';
                            shipSelectedBtn.addEventListener('click', () => {
                                const cards = selectedShippableCards();
                                if (cards.length) confirmShipBatch(cards);
                            });
                        }
                        contentWrapper.appendChild(shipSelectedBtn);
                    }
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

                // --- Configuration Section (separate floating panel) ---
                const configSection = document.createElement('div');
                configSection.id = 'altheastix-config-panel';
                configSection.style.cssText = 'padding: 10px 15px;';

                const CFG_COLLAPSED_KEY = 'configPanelCollapsed';
                const cfgIsCollapsed = localStorage.getItem(CFG_COLLAPSED_KEY) !== 'false';

                const cfgHeader = document.createElement('div');
                cfgHeader.style.cssText = `display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: ${isDarkMode ? '#e0e0e0' : '#333'}; cursor: pointer; user-select: none;`;
                const cfgTitle = document.createElement('span');
                cfgTitle.textContent = 'Configuration';
                const cfgChevron = document.createElement('span');
                cfgChevron.textContent = cfgIsCollapsed ? '▸' : '▾';
                cfgChevron.style.cssText = 'font-size: 11px; opacity: 0.6;';
                cfgHeader.append(cfgTitle, cfgChevron);
                configSection.appendChild(cfgHeader);

                const cfgBody = document.createElement('div');
                cfgBody.style.cssText = `margin-top: 8px; display: ${cfgIsCollapsed ? 'none' : 'block'};`;

                // Row: Auto-send messages slider (50/50 layout)
                const row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top: 16px;';

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
                cfgBody.appendChild(row);

                cb.addEventListener('change', (e) => {
                    GM_setValue(AUTO_SEND_MESSAGES_KEY, !!e.target.checked);
                });

                // Row: Ship date (global) - segmented Today/Tomorrow (50/50 layout)
                const rowShip = document.createElement('div');
                rowShip.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top: 16px;';

                const leftHalfShip = document.createElement('div');
                leftHalfShip.style.cssText = 'flex: 0 0 50%; max-width: 50%; display:flex; flex-direction:column; align-items:flex-start; gap:5px; min-width:0;';
                const segShip = document.createElement('div');
                segShip.className = 'ship-when-seg';
                segShip.setAttribute('role', 'group');
                segShip.setAttribute('aria-label', 'Ship date for all orders');
                segShip.innerHTML = `
                    <button type="button" class="ship-when-btn" data-when="today" aria-pressed="false">Today</button>
                    <button type="button" class="ship-when-btn ship-when-active" data-when="tomorrow" aria-pressed="true">Tomorrow</button>
                `;
                const labelSpanShip = document.createElement('span');
                labelSpanShip.textContent = 'ship date (all orders)';
                labelSpanShip.style.cssText = `font-size: 12px; color: ${isDarkMode ? '#ccc' : '#333'}; white-space: normal; overflow-wrap: anywhere; line-height: 1.25;`;
                leftHalfShip.append(labelSpanShip, segShip);

                const rightHalfShip = document.createElement('div');
                rightHalfShip.style.cssText = `flex: 0 0 50%; max-width: 50%; font-size: 10px; line-height: 1.25; color: ${isDarkMode ? '#aaa' : '#666'};`;
                rightHalfShip.textContent = 'Sets every order to tell the buyer it ships today or tomorrow.';

                rowShip.append(leftHalfShip, rightHalfShip);
                cfgBody.appendChild(rowShip);

                // Apply the chosen ship day to every order card.
                segShip.addEventListener('click', (e) => {
                    const btn = e.target.closest('.ship-when-btn');
                    if (!btn) return;
                    const isTomorrow = btn.dataset.when === 'tomorrow';
                    segShip.querySelectorAll('.ship-when-btn').forEach((b) => {
                        const active = (b.dataset.when === 'tomorrow') === isTomorrow;
                        b.classList.toggle('ship-when-active', active);
                        b.setAttribute('aria-pressed', String(active));
                    });
                    document.querySelectorAll(CONFIG.selectors.orderItem).forEach((card) => setShipWhenState(card, isTomorrow));
                });

                // Row: Thank you msg (global) (50/50 layout)
                const rowThanks = document.createElement('div');
                rowThanks.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top: 16px;';

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
                labelSpanThanks.textContent = 'Send thank you msg (all orders)';
                labelSpanThanks.style.cssText = `flex:1 3 auto; font-size: 12px; color: ${isDarkMode ? '#ccc' : '#333'}; white-space: normal; overflow-wrap: anywhere; line-height: 1.25;`;
                leftHalfThanks.append(switchLabelThanks, labelSpanThanks);

                const rightHalfThanks = document.createElement('div');
                rightHalfThanks.style.cssText = `flex: 0 0 50%; max-width: 50%; font-size: 10px; line-height: 1.25; color: ${isDarkMode ? '#aaa' : '#666'};`;
                rightHalfThanks.textContent = 'Toggles "+ thank you msg" on every order.';

                rowThanks.append(leftHalfThanks, rightHalfThanks);
                cfgBody.appendChild(rowThanks);
                // Thank-you is the master switch, so show it first.
                cfgBody.insertBefore(rowThanks, cfgBody.firstChild);

                // Grey out the message-dependent controls (auto-send + ship date)
                // here and on every card when no thank-you message will be sent.
                function applyMsgGating(on) {
                    row.classList.toggle('is-msg-disabled', !on);
                    rowShip.classList.toggle('is-msg-disabled', !on);
                    document.querySelectorAll(CONFIG.selectors.orderItem).forEach((card) => setCardMsgGating(card, on));
                }

                // Apply to all order cards when toggled
                cbThanks.addEventListener('change', (e) => {
                    const check = !!e.target.checked;
                    document.querySelectorAll('.thank-you-checkbox').forEach((box) => {
                        if (box instanceof HTMLInputElement) box.checked = check;
                    });
                    applyMsgGating(check);
                });

                configSection.appendChild(cfgBody);
                cfgHeader.addEventListener('click', () => {
                    const nowCollapsed = cfgBody.style.display !== 'none';
                    cfgBody.style.display = nowCollapsed ? 'none' : 'block';
                    cfgChevron.textContent = nowCollapsed ? '▸' : '▾';
                    localStorage.setItem(CFG_COLLAPSED_KEY, String(nowCollapsed));
                    updateSkuPanelPosition();
                });

                const cfgContainer = document.getElementById('altheastix-config-container');
                if (cfgContainer) {
                    cfgContainer.innerHTML = '';
                    cfgContainer.appendChild(configSection);
                }
                updateSkuPanelPosition();

                // --- Auto-enable and propagate changes on load ---
                setTimeout(() => {
                    document.querySelectorAll(CONFIG.selectors.orderItem).forEach(card => setShipWhenState(card, true));
                    if (cbThanks.checked) {
                        document.querySelectorAll('.thank-you-checkbox').forEach(box => {
                            if (box instanceof HTMLInputElement) box.checked = true;
                        });
                    }
                    applyMsgGating(cbThanks.checked);
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
                const envelopeHTML = `<div class="envelope"><table style="font-family: Arial; width: 100%; height: 100%; border-collapse: collapse;"><tr style="vertical-align: top;"><td style="width: 100%; padding: 14px 0 0 18px; font-size: 14px;">${USER_CONFIG.returnAddress}</td></tr><tr style="height: 10%;"><td></td></tr><tr style="vertical-align: top;"><td style="text-align: left; padding-left: 20%; font-size: 24px;">${addressHTML}</td></tr><tr style="height: 30%;"><td></td></tr></table></div>`;
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
        // --- Auto-set "Show postage cost on label" → No ---
        // eBay's "Edit labels" modal (opened from an order card's proof-of-delivery
        // "Edit" link) has a "Show postage cost on label" dropdown. Force it to "No"
        // (value "false") whenever the modal appears, so the postage amount is never
        // printed on the label. Respects a later manual change on the same node.
        function autoHidePostageCostOnLabel() {
            const applyNo = () => {
                document.querySelectorAll('.bulk-edit_postage_cost_on_label select').forEach(sel => {
                    if (sel.dataset._postageForcedNo) return;
                    if (sel.value !== 'false') setAndTriggerInputValue(sel, 'false');
                    sel.dataset._postageForcedNo = '1';
                });
            };
            applyNo();
            new MutationObserver(applyNo).observe(document.body, { childList: true, subtree: true });
        }

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
            skuManagerRef = skuManager; // so the batch queue can repaint the panel
            skuManager.createSKUPackingList();
            refreshAddressBanner();
            autoHidePostageCostOnLabel();
            startOrderWatch();
            console.debug('[Tampermonkey][MAIN] Order cards processed & SKU panel built');

            // Favicon counter safety sync: recount pending SKU pills every 3s
            // and redraw when the count changes in either direction (orders
            // marked shipped OR unmarked) or eBay re-injected its own favicon.
            // updatePendingBadge skips the redraw when nothing changed, so
            // this is effectively free.
            setInterval(syncPendingBadge, 3000);

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
                    // A confirmation always beats a failure, however late it
                    // arrives — a merely-slow eBay must resolve to "shipped",
                    // not leave a red card behind.
                    clearShipDeadline(orderCard);
                    clearShipFailedState(orderCard);
                    markCardQueued(orderCard, false);
                    delete orderCard.dataset.shipInFlight;
                    orderCard.classList.add(CONFIG.classNames.orderShipped);
                    SHIPDBG('order:confirmed', { card: orderCard.id, ids: orderCard.dataset.orderId });
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

            // Ship failures, mirroring the confirmation path above (listener
            // AND poller, because GM_addValueChangeListener does not fire
            // reliably in every Tampermonkey/Firefox combination).
            const processShipFailure = async (payload) => {
                if (!payload?.orderId) return;
                const card = findCardByOrderId(payload.orderId);
                if (!card) return;
                // Drop a report that belongs to an attempt we have already
                // moved past. The main-page deadline (70s) can fire before the
                // tab's own watchdog on the second page does, so a retry
                // started in between would otherwise be torn down by the
                // previous attempt's timeout landing late.
                // Match on the attempt id carried through the tab URL, not on
                // when the report was written — a watchdog fires long after
                // its attempt began, so by wall-clock it can look newer than
                // the retry it would otherwise tear down. If tm_attempt did
                // not survive eBay's navigation the id is absent, and the
                // guard degrades to the old permissive behaviour rather than
                // dropping a real failure.
                const attemptAt = card.dataset.shipAttemptAt || '';
                if (payload.attemptId && attemptAt && payload.attemptId !== attemptAt) {
                    SHIPDBG('failure:ignored-stale', { card: card.id, payloadAttempt: payload.attemptId, currentAttempt: attemptAt });
                    return;
                }
                SHIPDBG('failure:received', { card: card.id, orderId: payload.orderId, reason: payload.reason });
                markCardShipFailed(card, payload.reason || 'The automation tab timed out.');
            };
            GM_addValueChangeListener(SHIP_FAILED_KEY, async (name, oldValue, newValue) => {
                if (newValue?.orderId) {
                    await processShipFailure(newValue);
                    await GM_setValue(SHIP_FAILED_KEY, null);
                }
            });
            setInterval(async () => {
                const failed = await GM_getValue(SHIP_FAILED_KEY, null);
                if (failed?.orderId) {
                    await processShipFailure(failed);
                    await GM_setValue(SHIP_FAILED_KEY, null);
                }
            }, CONFIG.timing.pollingInterval);
            // Message outcomes, same listener + poller pair as the ship keys.
            const processMessageResult = async (payload) => {
                if (!payload?.orderId) return;
                const card = findCardByOrderId(payload.orderId);
                if (!card) return;
                if (payload.status === 'failed') {
                    markCardMessageFailed(card, payload);
                } else {
                    card.dataset.msgOutcome = payload.status || 'sent';
                    delete card.dataset.msgFailedReason;
                    delete card.dataset.msgFailedAction;
                    delete card.dataset.msgFailedRetryable;
                    card.querySelectorAll(`.${CONFIG.classNames.msgFailedPill}`).forEach(el => el.remove());
                    SHIPDBG('message:' + (payload.status || 'sent'), { card: card.id, orderId: payload.orderId });
                }
            };
            GM_addValueChangeListener(MESSAGE_RESULT_KEY, async (name, oldValue, newValue) => {
                if (newValue?.orderId) {
                    await processMessageResult(newValue);
                    await GM_setValue(MESSAGE_RESULT_KEY, null);
                }
            });
            setInterval(async () => {
                const result = await GM_getValue(MESSAGE_RESULT_KEY, null);
                if (result?.orderId) {
                    await processMessageResult(result);
                    await GM_setValue(MESSAGE_RESULT_KEY, null);
                }
            }, CONFIG.timing.pollingInterval);

            // Clear anything stale left by a previous session.
            GM_setValue(SHIP_FAILED_KEY, null);
            GM_setValue(MESSAGE_RESULT_KEY, null);

            // --- Combined-card re-render watchdog ---
            // eBay recalculates shipping for combined orders asynchronously and
            // re-renders those cards' inner grid cells AFTER the initial
            // processing pass, wiping every injected control (shipping-info
            // block, buttons, badges) while the reused <li> keeps its id/classes
            // and the hidden .grouping_summary keeps the injected +note links.
            // Watch the orders container and re-process any card that has lost
            // its shipping-info block. processOrderCard strips stale injections
            // first (cleanupCardInjections), so re-runs are safe.
            const ordersContainerToWatch = document.querySelector(CONFIG.selectors.ordersContainer) || document.body;
            let reprocessTimer = null;
            const reprocessWipedCards = () => {
                let reprocessed = 0;
                document.querySelectorAll(CONFIG.selectors.orderItem).forEach((card, pos) => {
                    if (card.querySelector(`.${CONFIG.classNames.shippingInfoBlock}`)) return; // still intact
                    if (!card.querySelector(CONFIG.selectors.tcellItem)) return; // mid-render / incomplete
                    // Reuse the index already stamped on the card so checkbox ids
                    // and SKU-panel references stay stable across re-processing.
                    const idMatch = (card.id || '').match(/^order-item-(\d+)$/);
                    const index = idMatch ? parseInt(idMatch[1], 10) : pos;
                    console.debug(`[Tampermonkey][ORDERS] Card index=${index} was re-rendered by eBay — re-processing`);
                    processOrderCard(card, index);
                    checkAndFinalizeCardState(card); // restore ✓ Shipped state if already confirmed
                    // cleanupCardInjections strips the message-failure pill, and
                    // nothing else would ever put it back — the card would go
                    // back to an unqualified green tick with the buyer still
                    // un-messaged. Rebuild it from the stash.
                    if (card.dataset.msgOutcome === 'failed' &&
                        !card.querySelector(`.${CONFIG.classNames.msgFailedPill}`)) {
                        markCardMessageFailed(card, {
                            reason: card.dataset.msgFailedReason,
                            action: card.dataset.msgFailedAction,
                            retryable: card.dataset.msgFailedRetryable === '1'
                        });
                    }
                    reprocessed++;
                });
                if (reprocessed > 0) {
                    skuManager.createSKUPackingList();
                    refreshAddressBanner();
                    refreshBatchSelectControls();
                    console.debug(`[Tampermonkey][ORDERS] Re-processed ${reprocessed} re-rendered card(s)`);
                }
            };
            new MutationObserver(() => {
                if (reprocessTimer) clearTimeout(reprocessTimer);
                reprocessTimer = setTimeout(reprocessWipedCards, 500);
            }).observe(ordersContainerToWatch, { childList: true, subtree: true });
            // Safety net in case the re-render happened between the processing
            // pass above and the observer attaching just now.
            reprocessWipedCards();
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
    else if (window.location.href.includes('ebay.com/mesh/ord/details') || window.location.href.includes('ebay.com/om/shipment/update') || window.location.href.includes('ebay.com/ship/trk/') || window.location.href.includes('ebay.com/ship/tr/update') || window.location.href.includes('ebay.com/ship/single/')) {
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

                    // Locate the Save button by its label so we never accidentally
                    // grab a dialog's "Continue" button (also .btn--primary).
                    const findSaveButton = () => Array.from(document.querySelectorAll('button.btn.btn--primary'))
                        .find(b => b.textContent.trim().toLowerCase() === 'save');
                    const saveBtn = findSaveButton();

                    if (trackingData.autoSubmit && saveBtn) {
                        await sleep(400); // let React settle so Save is enabled
                        saveBtn.click();

                        // eBay may interrupt Save with a validation dialog. Auto-continue
                        // past the two benign warnings, but STOP on a genuinely invalid
                        // number (that dialog warns about losing Top Rated Seller status).
                        const isDialogVisible = (el) => el && !el.hidden && el.getAttribute('aria-hidden') !== 'true';
                        const benignDialogIds = ['insuranceSignature', 'unknownCarrier'];
                        for (let i = 0; i < 25; i++) { // poll ~5s
                            await sleep(200);
                            if (isDialogVisible(document.getElementById('invalidUSPSTrkNumber'))) {
                                console.warn('[Track-v2] Invalid USPS tracking number — leaving tab open for manual review.');
                                break; // do NOT auto-continue past an invalid number
                            }
                            let handled = false;
                            for (const id of benignDialogIds) {
                                const dlg = document.getElementById(id);
                                if (isDialogVisible(dlg)) {
                                    dlg.querySelector('button.btn.btn--primary')?.click();
                                    handled = true;
                                    break;
                                }
                            }
                            if (handled) break; // Continue click proceeds with submission
                        }
                    } else if (saveBtn) {
                        saveBtn.focus(); // legacy behavior: fill only, user clicks Save
                    }
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
                const SHIP_TIMEOUT = (USER_CONFIG.automationTabTimeoutSeconds || 45) * 1000;

                // Report a timeout back to the pick-and-pack tab so the card
                // stops pretending it shipped. Best-effort: if this tab is
                // already gone the main page's own deadline covers it.
                // tm_attempt rides along from the pick-and-pack tab so the main
                // page can tell a report about THIS attempt from one about an
                // attempt it has already given up on and retried.
                const shipAttemptId = urlParams.get('tm_attempt') || '';
                const reportShipFailure = (reason) => {
                    try { GM_setValue(SHIP_FAILED_KEY, { orderId: urlOrderId, reason: reason, attemptId: shipAttemptId, timestamp: Date.now() }); }
                    catch (e) { console.error('[Ship] Could not report failure:', e); }
                };

                if (window.location.pathname.startsWith('/mesh/ord/details')) {
                    const cancelWatchdog = startAutomationWatchdog('Mark as Shipped', SHIP_TIMEOUT,
                        () => reportShipFailure('The order page never reached eBay\'s shipment confirmation step.'));
                    const markAsShippedLink = await waitForElement('div[data-action-id="MARK_SHIPPED"] a', 12000);
                    if (markAsShippedLink) {
                        // This navigates the SAME tab to /om/shipment/update,
                        // where the branch below takes over and closes it. If
                        // that navigation never happens, the watchdog fires.
                        markAsShippedLink.click();
                    } else {
                        // No Mark-as-shipped action on the page. That is USUALLY
                        // because the order already shipped — but it is equally
                        // what a slow page, a changed layout, or a quietly
                        // logged-out session look like, and this branch used to
                        // report all of them as success. Ask eBay's own progress
                        // stepper instead of reasoning from an absence.
                        cancelWatchdog();
                        await waitForElement('.progress-stepper__items', 5000);
                        const orderStatus = readOrderShippedStatus(document);
                        console.log('[Ship] No Mark-as-shipped link. Stepper says: ' + orderStatus.status +
                            (orderStatus.date ? ' (' + orderStatus.date + ')' : ''));
                        if (orderStatus.status === 'shipped') {
                            await GM_setValue(CONFIRMED_SHIP_KEY, {
                                orderId: urlOrderId, timestamp: Date.now(),
                                alreadyShipped: true, shippedDate: orderStatus.date
                            });
                            finishAutomationTab('Order was already marked shipped' +
                                (orderStatus.date ? ' (' + orderStatus.date + ')' : ''));
                        } else {
                            // Quote eBay's own words back — "Ship by Aug 26" is
                            // a far more useful thing to read on the card than
                            // a generic failure string.
                            const stepperSays = orderStatus.label
                                ? ' (eBay shows "' + orderStatus.label + (orderStatus.date ? ' ' + orderStatus.date : '') + '")'
                                : '';
                            const why = orderStatus.status === 'not-shipped'
                                ? 'eBay still shows this order as NOT shipped' + stepperSays + ', and the "Mark as shipped" button never appeared.'
                                : 'Neither the "Mark as shipped" button nor a readable status stepper was found on this page.';
                            reportShipFailure(why);
                            // Deliberately NOT closing the tab: this is the one
                            // case where a human needs to look at the page.
                            showMsgBanner('Mark as Shipped failed — ' + why + ' Finish it by hand, then close this tab.', false);
                        }
                    }
                }
                else if (window.location.pathname.startsWith('/om/shipment/update')) {
                    const cancelWatchdog = startAutomationWatchdog('Shipment confirmation', SHIP_TIMEOUT,
                        () => reportShipFailure('eBay never acknowledged the shipment.'));
                    let done = false;
                    let observer = null;

                    const succeed = async (how) => {
                        if (done) return;
                        done = true;
                        cancelWatchdog();
                        if (observer) observer.disconnect();
                        console.log('[Ship] Confirmed via ' + how + '.');
                        await GM_setValue(CONFIRMED_SHIP_KEY, { orderId: urlOrderId, timestamp: Date.now() });
                        // A short delay so eBay's request finishes before the
                        // tab goes away, then close and hand focus back to the
                        // pick-and-pack tab (see openAutomationTab/setParent).
                        finishAutomationTab('Marked as shipped', 500);
                    };

                    const jsonSuccess = () => !!(document.body && document.body.textContent.includes('"ack":"SUCCESS"'));

                    // 1. Already the raw JSON response.
                    if (jsonSuccess()) { await succeed('JSON ack'); return; }

                    // 2. Watch for it arriving.
                    observer = new MutationObserver(() => {
                        if (!done && jsonSuccess()) succeed('JSON ack (observed)');
                    });
                    observer.observe(document.body, { childList: true, subtree: true });

                    // 3. Or a real confirmation page with a Confirm button. This
                    //    fallback never ran before — see the waitForElement note.
                    const confirmButton = await waitForElement(
                        'button.btn.btn--primary',
                        el => (el.innerText || '').toLowerCase().includes('confirm'),
                        8000
                    );
                    if (confirmButton && !done) {
                        console.log('[Ship] Clicking the Confirm button.');
                        confirmButton.click();
                        // Give the POST a beat; if the JSON ack lands first the
                        // observer wins and this is a no-op.
                        setTimeout(() => { if (!done) succeed('Confirm button'); }, 1800);
                    }
                    // If neither path resolves, the watchdog banners the tab
                    // instead of leaving a silent zombie.
                }
            }
            else if (urlAction === 'buy_label') {
                // Single-label page: pre-fill for an eBay Standard Envelope so the
                // seller only has to click "Buy shipping label".
                if (!window.location.pathname.startsWith('/ship/single/')) return;
                console.log('[Buy-Label] Pre-filling single-label form…');

                // 1. Package type → Custom size
                const customRadio = await waitForElement('input[data-testid="custom-size-radio-btn"]');
                if (customRadio && !customRadio.checked) customRadio.click();

                // Types into an input the way a human does. The length field ignores
                // plain value-injection (it snaps back to "1"), so we focus, select the
                // existing text, and use execCommand('insertText') — that fires the native
                // beforeinput/input events the field actually listens to (works in
                // Firefox, which is what Javier runs). Falls back to a direct value-set.
                const typeIntoInput = (selector, value) => {
                    const el = document.querySelector(selector);
                    if (!el) return false;
                    el.focus({ preventScroll: true });
                    try { el.setSelectionRange(0, (el.value || '').length); }
                    catch (e) { try { el.select(); } catch (_) {} }
                    let ok = false;
                    try { ok = document.execCommand('insertText', false, value); } catch (e) { ok = false; }
                    if (!ok || el.value !== value) setAndTriggerInputValue(el, value);
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                    return el.value === value;
                };
                // Re-type a field until it holds its value (a few quick tries).
                const ensureTyped = async (selector, value, tries = 6) => {
                    for (let i = 0; i < tries; i++) {
                        if (document.querySelector(selector)?.value === value) return true;
                        typeIntoInput(selector, value);
                        await sleep(150);
                    }
                    return document.querySelector(selector)?.value === value;
                };
                // Longest side (9) goes in the length box: eBay rejects a too-short length
                // (clamps it up to its minimum) and the wider side exceeds the eBay
                // Standard Envelope width max of 6.125, so this is the order eBay accepts.
                const DIMS = [
                    ['input[name="dimensions.length"]', '9'],
                    ['input[name="dimensions.width"]',  '4.1'],
                    ['input[name="dimensions.height"]', '0.1'],
                ];

                // 2. Weight → 0 lb, 1 oz
                const lbInput = document.querySelector('input[aria-label="Package weight in pounds"]');
                const ozInput = await waitForElement('input[aria-label="Package weight in ounces"]');
                if (lbInput) setAndTriggerInputValue(lbInput, '0');
                if (ozInput) setAndTriggerInputValue(ozInput, '1');

                // 3. Dimensions → 9 × 4.1 × 0.1 in, entered via real-keystroke
                // insertText (plain value-injection was ignored / clamped by eBay).
                await waitForElement('input[name="dimensions.length"]');
                for (const [sel, val] of DIMS) await ensureTyped(sel, val);

                // 4. Service → eBay Standard Envelope. Poll for the radio (it appears once
                // eBay refetches rates for the new dimensions), click, and confirm.
                const ESE_SELECTOR = 'input[data-testid="EBAYSEND_US-STD_ENV-PACKAGE-DROP_OFF"]';
                for (let i = 0; i < 25; i++) {
                    const eseRadio = document.querySelector(ESE_SELECTOR);
                    if (eseRadio) {
                        if (!eseRadio.checked) eseRadio.click();
                        await sleep(200);
                        if (document.querySelector(ESE_SELECTOR)?.checked) break;
                    } else {
                        await sleep(200);
                    }
                }

                // 5. Redundant final pass: the rate refetch triggered by selecting the
                // service can revert a dimension (length especially). Re-type any field
                // that drifted, as the last action before the seller clicks Buy.
                await sleep(400);
                for (const [sel, val] of DIMS) await ensureTyped(sel, val);

                // 6. Click outside the dimension inputs so eBay commits the values and
                // recalculates — this is what flips the "Buy shipping label" button from
                // disabled to active. Blur the focused field, then dispatch a real click
                // sequence on a neutral part of the page.
                document.activeElement?.blur?.();
                const neutralTarget = document.querySelector('main') || document.body;
                ['mousedown', 'mouseup', 'click'].forEach(type =>
                    neutralTarget.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })));
                console.log('[Buy-Label] Done. Seller can confirm the purchase.');
                return;
            }
            else if (urlAction === 'manual_message') {
                await runBuyerMessageAutomation({
                    storageKey: MANUAL_MESSAGE_SEND_KEY,
                    orderId: urlOrderId,
                    autoSend: false,
                    action: 'manual_message',
                    label: 'Manual-Message'
                });
            }
            else if (urlAction === 'message') {
                 const messageButton = await waitForElement('div[data-action-id="MESSAGE_BUYER_PANEL"] button');
                 if (messageButton) messageButton.click();
            }
            else if (urlAction === 'auto_message') {
                // Default true so a fresh Tampermonkey profile matches the
                // "Auto-send messages" checkbox, which renders checked.
                const autoSendEnabled = !!(await GM_getValue(AUTO_SEND_MESSAGES_KEY, true));
                await runBuyerMessageAutomation({
                    storageKey: MESSAGE_SEND_KEY,
                    orderId: urlOrderId,
                    autoSend: autoSendEnabled,
                    action: 'auto_message',
                    label: 'Auto-Message'
                });
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
                                finishAutomationTab('Note added', 500);
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
        })().catch(err => {
            // An exception in the dispatcher used to disappear into an
            // unhandled promise rejection and the tab just sat there looking
            // idle. Surface it the same way a failed send is surfaced.
            console.error('[Automation] tm_action handler crashed:', err);
            showMsgBanner('Automation error: ' + ((err && err.message) || err) +
                ' — nothing was completed on this tab. Finish it by hand.', false);
        });
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


    // ===================================================================
    // BUYER-MESSAGE AUTOMATION (tm_action=auto_message / manual_message)
    // ===================================================================
    // Why this is so defensive: the previous inline implementation failed
    // intermittently with the draft visible but unsent. Four reasons, all
    // timing-dependent, which is why it only happened "sometimes":
    //   1. It clicked "Message buyer" exactly once. That button ships in
    //      eBay's server-rendered HTML but lives inside a collapsed
    //      "More actions" menu, so the click landed before React had
    //      hydrated it and did nothing.
    //   2. The composer is a same-origin IFRAME (/contact/sendmsg). The old
    //      code grabbed the textarea the moment it appeared in the iframe's
    //      DOM — i.e. during parse, before the composer's own JS had bound
    //      its submit handler.
    //   3. It then took the FIRST Send button that looked un-disabled and
    //      clicked it. A server-rendered button has no `disabled` attribute
    //      until JS adds one, so the very first poll saw "enabled", clicked a
    //      button with no handler attached yet, and called clearInterval() —
    //      no retry was possible after that.
    //   4. Nothing verified the send. window.close() fired 1.2s later
    //      regardless, so a failure looked identical to a success.
    // This version waits for readiness, retries, verifies, and when it does
    // give up it says so loudly and leaves the tab open with the draft.

    // ===================================================================
    // AUTOMATION-TAB LIFECYCLE
    // ===================================================================
    // Every tm_action tab must end in one of two states: closed because the
    // job is done, or visibly flagged because it isn't. A tab that just sits
    // there open is the worst outcome — it looks finished and isn't.
    //
    // setParent:true is what returns focus to the pick-and-pack tab when an
    // automation tab closes: Tampermonkey re-selects the opener. Without it
    // Firefox falls through to whichever tab happens to sit next to the one
    // that closed — usually another automation tab. Background tabs
    // (active:false) never take focus in the first place, but they still need
    // the flag, because closing one while it IS focused (you clicked over to
    // check on it) should also land you back on pick-and-pack.
    function openAutomationTab(url, options) {
        const opts = Object.assign({ active: false }, options || {});
        opts.setParent = true;
        return GM_openInTab(url, opts);
    }

    // Hard stop for any automation tab. Returns a cancel function.
    // The optional onTimeout callback is how a timeout gets reported back to
    // the pick-and-pack tab; without it the failure only ever existed as a
    // banner on a tab nobody was looking at.
    function startAutomationWatchdog(label, timeoutMs, onTimeout) {
        const timer = setTimeout(() => {
            console.error('[Automation] ' + label + ' timed out after ' + Math.round(timeoutMs / 1000) + 's.');
            showMsgBanner(label + ' timed out — nothing was completed on this tab. Finish it by hand, then close the tab.', false);
            if (typeof onTimeout === 'function') {
                try { onTimeout(); } catch (e) { console.error('[Automation] onTimeout handler threw:', e); }
            }
        }, timeoutMs);
        return () => clearTimeout(timer);
    }

    // Close an automation tab, handing focus back to the opener. window.close()
    // needs @grant window.close (the header has it); Firefox still refuses it
    // in some configurations, so if we are still alive a moment later, say so
    // rather than leaving a tab that looks stuck.
    function finishAutomationTab(label, delayMs) {
        console.log('[Automation] ' + label + ' — done, closing tab.');
        setTimeout(() => {
            try { window.close(); } catch (e) {}
            setTimeout(() => showMsgBanner(label + ' ✔ — done. You can close this tab.', true), 1500);
        }, typeof delayMs === 'number' ? delayMs : 600);
    }

    // Function declarations, NOT const arrows — deliberately.
    //
    // The tm_action dispatcher above reaches the manual_message branch
    // SYNCHRONOUSLY: nothing in that path awaits before it calls
    // runBuyerMessageAutomation(), whose first statement is MSG_LOG(...).
    // Top-level execution of this file has not reached this line yet at that
    // moment, so a `const` here is still in its temporal dead zone and the
    // call threw "can't access lexical declaration 'MSG_LOG' before
    // initialization", rejecting the dispatcher promise before the message
    // panel was ever touched — no paste, no send, no banner, just a console
    // error. The auto_message branch hid the bug for two days: it awaits
    // GM_getValue() first, and that yield is enough for these to initialize.
    // Function declarations hoist, so the order stops mattering.
    function msgSleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function MSG_LOG(...args) { console.log('[Buyer-Msg]', ...args); }

    // Message payloads are stored as a MAP keyed by order id. The old shape was
    // a single {orderId, message} object: two message tabs opened close together
    // clobbered each other, and the loser silently bailed on an order-id
    // mismatch without sending anything.
    async function queueBuyerMessage(storageKey, orderId, message) {
        let store = await GM_getValue(storageKey);
        if (!store || typeof store !== 'object' || Array.isArray(store) || typeof store.orderId === 'string') store = {};
        store[orderId] = { message: message, queuedAt: Date.now() };
        await GM_setValue(storageKey, store);
    }

    // Reading and deleting used to be one operation, and the delete happened
    // BEFORE the composer was even opened. So when the "Message buyer" panel
    // failed to open, the message was already gone from storage: reloading the
    // tab found nothing queued and gave up silently. Split in two, the message
    // survives every failure that happens before the text is actually in the
    // box, which is what makes a retry — by reload or by hand — possible at all.
    async function peekBuyerMessage(storageKey, orderId) {
        const store = await GM_getValue(storageKey);
        if (!store || typeof store !== 'object') return null;
        // Legacy single-payload shape, still possible right after an update.
        if (typeof store.orderId === 'string') {
            if (store.orderId !== orderId) return null;
            return typeof store.message === 'string' ? store.message : null;
        }
        const entry = store[orderId];
        if (!entry) return null;
        return typeof entry.message === 'string' ? entry.message : null;
    }

    // Called only once the message has landed in the composer. Past that point
    // a re-run would double-paste (and, with auto-send on, double-send), so
    // that is the correct place to give up the ability to retry.
    async function consumeBuyerMessage(storageKey, orderId) {
        const store = await GM_getValue(storageKey);
        if (!store || typeof store !== 'object') return;
        if (typeof store.orderId === 'string') {
            if (store.orderId === orderId) await GM_setValue(storageKey, {});
            return;
        }
        delete store[orderId];
        // Drop stale entries so the map can't grow without bound.
        const cutoff = Date.now() - 6 * 60 * 60 * 1000;
        Object.keys(store).forEach(k => {
            if (!store[k] || (store[k].queuedAt || 0) < cutoff) delete store[k];
        });
        await GM_setValue(storageKey, store);
    }

    // Tells the pick-and-pack tab how the message actually ended up. Without
    // this a card could read a confident green "✓ Shipped" while the buyer got
    // nothing — the same failure-that-looks-like-success the ship path had.
    // `action` matters: auto and manual messages live in DIFFERENT storage keys,
    // so a retry must reopen the same one it came from. Retrying a manual
    // message as `auto_message` would peek the thank-you draft instead and, with
    // auto-send on, quietly send the buyer a message the seller never chose.
    // `retryable` is false once the text has already been consumed — offering a
    // Retry that cannot work is worse than offering none.
    async function reportMessageResult(orderId, status, reason, opts) {
        if (!orderId) return;
        const o = opts || {};
        try {
            await GM_setValue(MESSAGE_RESULT_KEY, {
                orderId: orderId,
                status: status,
                reason: reason || '',
                // No default: an absent action must render as non-retryable
                // rather than resolving to the auto thank-you path.
                action: o.action || '',
                retryable: !!o.retryable,
                timestamp: Date.now()
            });
        } catch (e) { console.error('[Buyer-Msg] Could not report result:', e); }
    }

    // Fixed banner at the top of the order-details tab so a failure is
    // impossible to miss (the old code only whispered into the console).
    function showMsgBanner(text, ok, fallbackText) {
        try {
            let el = document.getElementById('altheastix-msg-banner');
            if (!el) {
                el = document.createElement('div');
                el.id = 'altheastix-msg-banner';
                el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;' +
                    'font:600 14px/1.45 system-ui,-apple-system,sans-serif;text-align:center;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);';
                document.body.appendChild(el);
            }
            el.style.background = ok ? '#2e7d32' : '#c62828';
            el.textContent = text;
            if (fallbackText) {
                const pre = document.createElement('textarea');
                pre.readOnly = true;
                pre.value = fallbackText;
                pre.style.cssText = 'display:block;width:100%;max-width:760px;margin:8px auto 0;height:110px;' +
                    'font:400 12px/1.4 ui-monospace,monospace;color:#111;padding:6px;border-radius:4px;border:0;';
                el.appendChild(pre);
            }
        } catch (e) { /* banner is best-effort */ }
    }

    function getComposerDoc() {
        const iframe = document.querySelector('.ordui-m2m-panel__iframe');
        if (!iframe) return null;
        let doc = null;
        try { doc = iframe.contentDocument; } catch (e) { return null; }
        if (!doc || !doc.location) return null;
        // The iframe ships with an empty src, so about:blank means the composer
        // has not been loaded into the panel yet. Fall back to "does it hold a
        // real textarea?" in case eBay ever populates it without navigating.
        const href = doc.location.href || '';
        const blank = !href || href === 'about:blank';
        if (blank && !doc.querySelector('textarea')) return null;
        return doc;
    }

    function findComposerTextarea(doc) {
        if (!doc) return null;
        const selectors = [
            '#imageupload__sendmessage--textbox',
            'textarea#imageupload__sendmessage--textbox',
            'textarea.textbox__control[placeholder*="Send message"]',
            'textarea[name*="message"]',
            'textarea'
        ];
        for (const sel of selectors) {
            let el = null;
            try { el = doc.querySelector(sel); } catch (e) { continue; }
            // Guard the tag: the old '#textarea' selector matched ANY element
            // that happened to carry id="textarea".
            if (el && el.tagName === 'TEXTAREA') return el;
        }
        return null;
    }

    // Deliberately strict. The old locator took any button whose text merely
    // contained "send", which on an order-details page also matches
    // "Send coupon".
    function findComposerSendButton(doc) {
        if (!doc) return null;
        let candidates = [];
        try { candidates = Array.from(doc.querySelectorAll('button, input[type="submit"]')); } catch (e) { return null; }
        const labelOf = b => ((b.value || '') + ' ' + (b.textContent || '') + ' ' + (b.getAttribute('aria-label') || ''))
            .replace(/\s+/g, ' ').trim();
        let btn = candidates.find(b => /^send( message)?$/i.test(labelOf(b)));
        if (!btn) btn = candidates.find(b => b.type === 'submit' && /\bsend\b/i.test(labelOf(b)) && !/coupon|copy|resend/i.test(labelOf(b)));
        return btn || null;
    }

    // Click "Message buyer" until the composer iframe actually loads. Only
    // clicks while the panel is closed, so a retry can't toggle it shut.
    async function openMessageBuyerPanel(timeout = 20000) {
        const start = Date.now();
        const panelIsOpen = () => {
            const p = document.querySelector('.ordui-m2m-panel');
            return !!p && !p.hasAttribute('hidden');
        };
        let clicks = 0;
        let lastClick = 0;
        while (Date.now() - start < timeout) {
            const doc = getComposerDoc();
            if (doc) return doc;
            if (!panelIsOpen() && (Date.now() - lastClick) > 1500) {
                const btn = document.querySelector('div[data-action-id="MESSAGE_BUYER_PANEL"] button');
                if (btn) {
                    clicks++;
                    lastClick = Date.now();
                    MSG_LOG('Clicking "Message buyer" (attempt ' + clicks + ')');
                    btn.click();
                }
            }
            await msgSleep(250);
        }
        MSG_LOG('Gave up waiting for the message panel after ' + clicks + ' click(s).');
        return null;
    }

    // Wait for the composer document to finish loading AND settle, so the
    // page's own scripts have bound their handlers before we touch anything.
    async function waitForComposerReady(timeout = 20000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const doc = getComposerDoc();
            if (doc && doc.readyState === 'complete' && findComposerTextarea(doc)) {
                await msgSleep(700);
                const settledDoc = getComposerDoc();
                const textarea = findComposerTextarea(settledDoc || doc);
                if (settledDoc && textarea) return { doc: settledDoc, textarea: textarea };
            }
            await msgSleep(200);
        }
        return null;
    }

    // Set the value through the native setter (so React's value tracker sees
    // the change) and fire a full event set. Notably this never assigns to
    // .value directly the way the old spaceSim() did — that desynced React's
    // tracker and could leave the composer believing the box was empty.
    function insertComposerText(textarea, text) {
        try { textarea.focus({ preventScroll: true }); } catch (e) {}
        setAndTriggerInputValue(textarea, text);
        const win = textarea.ownerDocument.defaultView || window;
        const KeyEvt = win.KeyboardEvent || KeyboardEvent;
        const InpEvt = win.InputEvent || InputEvent;
        ['keydown', 'keypress', 'keyup'].forEach(type => {
            try { textarea.dispatchEvent(new KeyEvt(type, { key: 'a', code: 'KeyA', bubbles: true, cancelable: true })); } catch (e) {}
        });
        try {
            textarea.dispatchEvent(new InpEvt('input', { data: text.slice(-1) || ' ', inputType: 'insertText', bubbles: true }));
        } catch (e) {}
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        try {
            textarea.focus({ preventScroll: true });
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        } catch (e) {}
    }

    // Click Send, then prove it went through. Retries up to 4 times and only
    // reports success on positive evidence.
    async function sendComposedMessage(doc, textarea, timeout = 25000) {
        let startHref = '';
        try { startHref = doc.location.href; } catch (e) {}
        const evidenceOfSend = () => {
            if (!textarea.isConnected) return 'composer re-rendered';
            try {
                if (doc.location.href !== startHref) return 'composer navigated';
            } catch (e) { return 'composer navigated'; }
            const panel = document.querySelector('.ordui-m2m-panel');
            if (panel && panel.hasAttribute('hidden')) return 'panel closed itself';
            let body = '';
            try { body = (doc.body && doc.body.innerText) || ''; } catch (e) {}
            if (/message (was )?sent|your message has been sent/i.test(body)) return 'confirmation text';
            if (textarea.value === '') return 'draft box cleared';
            return null;
        };

        const start = Date.now();
        let clicks = 0;
        let lastClick = 0;
        let lastNudge = 0;
        let forced = false;
        const clickSend = (btn) => {
            clicks++;
            lastClick = Date.now();
            MSG_LOG('Clicking Send (attempt ' + clicks + ')');
            ['mousedown', 'mouseup', 'click'].forEach(type => {
                try {
                    btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: doc.defaultView || window }));
                } catch (e) {}
            });
        };

        while (Date.now() - start < timeout) {
            // Only trust the evidence checks once we have actually clicked —
            // otherwise a routine re-render would read as a successful send.
            if (clicks > 0) {
                const why = evidenceOfSend();
                if (why) { MSG_LOG('Send confirmed (' + why + ') after ' + clicks + ' click(s).'); return true; }
            }

            const btn = findComposerSendButton(doc);
            const enabled = !!btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';

            if (clicks === 0) {
                if (enabled) {
                    clickSend(btn);
                } else if (btn && (Date.now() - start) > 3000 && (Date.now() - lastNudge) > 2000) {
                    // Still disabled: the composer does not believe there is any
                    // text. Re-fire the input events; force the flag off only as
                    // a genuine last resort, and keep verifying afterwards.
                    lastNudge = Date.now();
                    MSG_LOG('Send button still disabled — re-triggering input events.');
                    insertComposerText(textarea, textarea.value);
                    if (!forced && (Date.now() - start) > 8000) {
                        forced = true;
                        MSG_LOG('Forcing the Send button enabled (last resort).');
                        try { btn.disabled = false; btn.removeAttribute('aria-disabled'); } catch (e) {}
                    }
                }
            } else if (enabled && textarea.isConnected && textarea.value.trim() && clicks < 3 && (Date.now() - lastClick) > 5000) {
                // A click already went out. Never re-insert text or force the
                // button here — that is how you get a duplicate message. Retry
                // only when the composer looks completely untouched: still
                // enabled, still holding the draft, 5s later.
                clickSend(btn);
            }

            await msgSleep(300);
        }
        MSG_LOG('Could not confirm the send after ' + clicks + ' click(s).');
        return false;
    }

    async function runBuyerMessageAutomation(options) {
        const storageKey = options.storageKey;
        const urlOrderId = options.orderId;
        const autoSend = !!options.autoSend;
        const label = options.label || 'Buyer-Msg';
        MSG_LOG(label + ': starting for order ' + urlOrderId + ' (autoSend=' + autoSend + ')');

        // Peek — do NOT consume. The message stays in storage until it is
        // actually in the composer, so a reload can pick it up again.
        const message = await peekBuyerMessage(storageKey, urlOrderId);
        if (message === null) {
            console.warn('[Buyer-Msg] ' + label + ': nothing queued for order ' + urlOrderId + ' — stopping.');
            // This used to be the one exit that reported nothing at all, which
            // left a retry's "Retrying…" button stuck forever. Nothing to
            // consume here, and nothing to retry — so report it as final.
            await reportMessageResult(urlOrderId, 'failed',
                'Nothing was queued for this order — send the message by hand.',
                { action: options.action, retryable: false });
            return;
        }

        // The "Empty Message" option queues an empty string on purpose: it just
        // wants the Contact-buyer pane opened so the message can be typed by hand.
        // Nothing to paste, nothing to confirm — so no green banner either.
        const hasText = message.trim() !== '';

        // One self-reload before giving up. eBay's order page sometimes renders
        // without ever wiring up the Message buyer button, and a fresh load is
        // the only thing that reliably fixes it — clicking harder does not
        // (openMessageBuyerPanel already re-clicks every 1.5s for 20s).
        // Math.max(0, …) so a hand-edited negative tm_msg_retry can't slip under
        // the bound and reload repeatedly.
        const msgRetry = MSG_RETRY_AT_LOAD;
        const retryByReload = (why) => {
            if (msgRetry >= MESSAGE_PANEL_MAX_RETRIES) return false;
            // Only worth doing unattended. On a manual message the seller is
            // sitting right there — a surprise reload plus another 20s wait is
            // worse than just telling them, and they can click again themselves.
            if (!autoSend) return false;
            // Rebuild the URL from values held since page load rather than
            // re-reading location.search, which eBay's SPA may have rewritten
            // by now. Losing tm_action to a replaceState would reload into a
            // plain order page that does nothing and reports nothing.
            // Literal base, not window.location.href: if the SPA has pushed a
            // different path, reloading it could land somewhere the script's
            // @match doesn't cover — the tab would then do nothing and report
            // nothing, which is the exact failure this release exists to kill.
            if (options.action !== 'auto_message' && options.action !== 'manual_message') return false;
            const retryUrl = new URL('https://www.ebay.com/mesh/ord/details');
            retryUrl.searchParams.set('orderid', urlOrderId);
            retryUrl.searchParams.set('tm_action', options.action);
            retryUrl.searchParams.set('tm_msg_retry', String(msgRetry + 1));
            MSG_LOG(label + ': ' + why + ' — reloading this tab to try once more (attempt ' + (msgRetry + 2) + ').');
            showMsgBanner('Composer did not open — reloading to try once more…', false);
            window.location.href = retryUrl.toString();
            return true;
        };

        const composerDoc = await openMessageBuyerPanel();
        if (!composerDoc) {
            if (retryByReload('panel never opened')) return;
            await reportMessageResult(urlOrderId, 'failed', 'The "Message buyer" panel never opened.', { action: options.action, retryable: true });
            showMsgBanner('Auto-message failed: the "Message buyer" panel never opened.' +
                (hasText ? ' Draft below — send it by hand.' : ''), false, hasText ? message : null);
            return;
        }

        const ready = await waitForComposerReady();
        if (!ready) {
            if (retryByReload('composer never finished loading')) return;
            await reportMessageResult(urlOrderId, 'failed', 'The message box never finished loading.', { action: options.action, retryable: true });
            showMsgBanner('Auto-message failed: the message box never finished loading.' +
                (hasText ? ' Draft below — send it by hand.' : ''), false, hasText ? message : null);
            return;
        }

        if (!hasText) {
            // Empty draft: leave the composer focused and untouched, say nothing.
            MSG_LOG(label + ': empty message — pane opened, nothing inserted.');
            await consumeBuyerMessage(storageKey, urlOrderId);
            try { ready.textarea.focus({ preventScroll: true }); } catch (e) {}
            return;
        }

        insertComposerText(ready.textarea, message);
        // The text has landed. Past this point a re-run would double-paste, so
        // this is where the retry window closes.
        await consumeBuyerMessage(storageKey, urlOrderId);
        MSG_LOG(label + ': draft inserted (' + message.length + ' chars).');

        if (!autoSend) {
            await reportMessageResult(urlOrderId, 'drafted', 'Draft left in the box for manual review.', { action: options.action });
            showMsgBanner('Draft inserted — review it, then click Send.', true);
            return;
        }

        const sent = await sendComposedMessage(ready.doc, ready.textarea);
        if (sent) {
            await reportMessageResult(urlOrderId, 'sent', '', { action: options.action });
            showMsgBanner('Thank-you message sent ✔ — closing this tab…', true);
            finishAutomationTab('Thank-you message sent', 2500);
        } else {
            // The draft IS in the box — this tab stays open so it can be sent by
            // hand. The card is told anyway, because during a batch nobody is
            // watching this tab and the order would otherwise read as complete.
            await reportMessageResult(urlOrderId, 'failed', 'The draft was pasted but the Send click was not confirmed. The message tab is still open — send it there.', { action: options.action, retryable: false });
            showMsgBanner('AUTO-SEND FAILED — the draft is in the box, click Send yourself. (Tab left open on purpose.)', false);
            console.error('[Buyer-Msg] ' + label + ': send could not be confirmed for order ' + urlOrderId + '. Tab left open.');
        }
    }

    // --- eBay's order progress stepper ---
    // A POSITIVE read of what eBay itself says about an order, used where the
    // ship automation previously reasoned from an absence ("no Mark as shipped
    // button, therefore shipped") and so reported a slow page, a markup change
    // or a logged-out session as a successful shipment.
    //
    // The markup, per an order that has shipped:
    //   .progress-stepper__items
    //     .progress-stepper__item
    //       .progress-stepper__icon svg > title            → "complete" | "upcoming"
    //                                     use[href]        → #icon-stepper-confirmation-24
    //                                                      | #icon-stepper-upcoming-24
    //       .progress-stepper__text h4                     → step label
    //                               p                      → a date
    //
    // The middle step is RENAMED, not merely restyled, as the order progresses:
    //
    //   not shipped   "Buyer paid" Aug 23 · "Ship by" Aug 26 (upcoming) · "Delivery"
    //   shipped       "Buyer paid" Aug 23 · "Shipped"  Aug 23 (complete) · "Delivery"
    //
    // So matching the literal word "Shipped" finds nothing at all on an
    // unshipped order — the case this function exists to detect. Anchor on the
    // "ship" prefix instead and let the icon decide the state. Note the date
    // means different things either side of that line: a DUE date when the step
    // reads "Ship by", the actual ship date once it reads "Shipped".
    //
    // Returns { status: 'shipped' | 'not-shipped' | 'unknown', date, label }.
    // 'unknown' is a real answer, not a soft failure: it means the page was not
    // what we expected, and the caller must NOT treat it as success.
    function readOrderShippedStatus(doc) {
        const d = doc || document;
        try {
            const container = d.querySelector('.progress-stepper__items');
            if (!container) return { status: 'unknown', date: null, label: null };
            const step = Array.from(container.querySelectorAll('.progress-stepper__item'))
                .find(el => /^\s*ship/i.test(el.querySelector('.progress-stepper__text h4')?.textContent || ''));
            if (!step) return { status: 'unknown', date: null, label: null };
            const label = (step.querySelector('.progress-stepper__text h4')?.textContent || '').trim() || null;
            const date = (step.querySelector('.progress-stepper__text p')?.textContent || '').trim() || null;
            // Two independent signals, either sufficient. The <title> is the
            // clearer one but is human-readable text and so the likelier of the
            // two to be localised or reworded; the <use> href is structural.
            const titleText = (step.querySelector('.progress-stepper__icon svg title')?.textContent || '')
                .trim().toLowerCase();
            const useHref = step.querySelector('.progress-stepper__icon svg use')?.getAttribute('href') || '';
            // Neither signal readable — say so rather than guessing a direction.
            if (!titleText && !useHref) return { status: 'unknown', date: date, label: label };
            const isComplete = titleText === 'complete' || /confirmation/i.test(useHref);
            return { status: isComplete ? 'shipped' : 'not-shipped', date: date, label: label };
        } catch (e) {
            console.error('[Ship] Could not read the progress stepper:', e);
            return { status: 'unknown', date: null, label: null };
        }
    }

    function setAndTriggerInputValue(element, value) {
        if (!element) return;
        const valueSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
        valueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Two accepted shapes:
    //   waitForElement(selector, timeout)
    //   waitForElement(selector, predicate, timeout)
    // The predicate form used to be silently broken: the function was passed
    // where the timeout was expected, Number(fn) is NaN, setTimeout treats that
    // as 0, and the call resolved null on the very next tick. Any caller
    // relying on it (the shipment-confirm fallback) never actually ran.
    function waitForElement(selector, arg2, arg3) {
        const predicate = typeof arg2 === 'function' ? arg2 : null;
        const timeout = typeof arg2 === 'number' ? arg2
                      : (typeof arg3 === 'number' ? arg3 : 10000);
        return new Promise(resolve => {
            const find = () => {
                if (!predicate) return document.querySelector(selector);
                // With a predicate, scan every match — the one we want is not
                // necessarily the first.
                const all = Array.from(document.querySelectorAll(selector));
                for (const el of all) {
                    let ok = false;
                    try { ok = !!predicate(el); } catch (e) { ok = false; }
                    if (ok) return el;
                }
                return null;
            };
            const interval = setInterval(() => {
                const element = find();
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

    // Normalizes a name token written in ALL CAPS (common in eBay buyer data) to a
    // natural title-cased form so messages read as if hand-written ("GEORGE" -> "George").
    // Tokens that already contain a lowercase letter are left untouched, preserving
    // intentional casing such as "McDonald".
    function humanizeName(name) {
        if (!name) return name;
        return String(name).replace(/\S+/g, (word) => {
            if (/[a-z]/.test(word)) return word;   // already has lowercase — leave as-is
            if (!/[A-Z]/.test(word)) return word;  // nothing to re-case
            return word.toLowerCase().replace(/(^|[\s'’\-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
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

