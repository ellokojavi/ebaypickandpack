// ==UserScript==
// @name         Offer Msg Picker
// @namespace    http://tampermonkey.net/
// @version      2026-08-20
// @description  Quick-select offer message templates on eBay's Send Offer modal, with the discount % auto-filled from the offer form. Injects outside eBay's React-managed nodes so typing never loses focus.
// @author       You
// @match        https://www.ebay.com/sh/lst/active*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ebay.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     * Templates. Use {PCT} wherever the discount percentage should go.
     * ------------------------------------------------------------------ */
    const DEFAULT_PCT = 10;

    const MESSAGES = [
        "Grab {PCT}% off + free shipping! Our stickers are built for the elements—5 years of outdoor life guaranteed. This offer won't last forever, so snag your favorite design now. Ready to stick?",
        "Quality meets value! Get {PCT}% off plus free shipping today. These premium decals handle sun and rain for up to 5 years. Don't let this exclusive offer slip away. Add some flair to your gear today!",
        "Flash sale: {PCT}% off + free shipping on us! Our heavy-duty stickers stay vibrant for 5 years outdoors. Grab yours before the clock runs out on this deal. Your laptop, car, or bottle will thank you!",
        "Still thinking about it? Here is {PCT}% off and free shipping to help you decide. These 5-year outdoor-rated stickers are the real deal. Act fast—the offer expires soon. Secure yours now!",
        "You've got great taste! Take {PCT}% off and enjoy free shipping. Built to last 5 years in any weather, these stickers are top-tier quality. Buy now and save before this special offer disappears.",
        "Hey there! How about {PCT}% off + free shipping? Our stickers are premium grade, lasting 5 years in outdoor conditions. This deal is only valid for a limited time. Don't miss out—grab it now!",
        "Upgrade your collection with {PCT}% off and free shipping! These aren't just stickers; they're 5-year outdoor-rated decals. Be wise—the offer is strictly time-limited. Get yours today!",
        "Limited time: {PCT}% off + free shipping! Get the high-quality sticker you want, engineered to last 5 years outdoors. Why wait? Take it home now before the offer expires. Deal?",
        "Love this item? Here’s {PCT}% off and free shipping! Our stickers withstand the elements for 5+ years. Don't let this chance pass you by—grab this deal before it’s gone for good!",
        "Special offer: {PCT}% off + free shipping! These premium stickers are UV-resistant and last 5 years outdoors. Act now to save—this offer is ending soon. Ready to make it yours?"
    ];

    const MODAL_SELECTOR = '[data-testid="sio-modal-root"], [role="dialog"], [class*="modal"]';
    const registry = [];          // [{ textarea, wrapper, container, state }]
    let muting = false;           // true while we mutate the DOM ourselves

    /* ------------------------------------------------------------------ *
     * Discount detection
     * ------------------------------------------------------------------ */
    function normalizePct(raw) {
        if (raw === null || raw === undefined) return null;
        const s = String(raw).trim();
        if (!s) return null;
        const n = parseFloat(s.replace(/[^\d.]/g, ''));
        if (!isFinite(n)) return null;
        let v = n;
        if (v > 0 && v < 1) v *= 100;      // 0.15 -> 15
        if (v <= 0 || v > 95) return null;
        return Math.round(v);
    }

    // Fields whose name/id/testid/aria-label smells like a discount percentage.
    // "strong" = the field is explicitly a percentage; "weak" = it just mentions a
    // discount, so its value could be a dollar amount and visible text wins instead.
    function pctFromFields(scope, strong) {
        const fields = scope.querySelectorAll('input, select');
        for (const el of fields) {
            if (el.closest('.tm-msg-picker')) continue;             // our own % box
            const hay = [
                el.name, el.id, el.getAttribute('data-testid'),
                el.getAttribute('aria-label'), el.getAttribute('placeholder'),
                el.className
            ].filter(Boolean).join(' ').toLowerCase();
            const isStrong = /percent|pct|%/.test(hay);
            const isWeak = /discount|markdown|off\b|save/.test(hay);
            if (strong ? !isStrong : !(isWeak && !isStrong)) continue;
            let raw = el.value;
            if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
                raw = el.options[el.selectedIndex].value || el.options[el.selectedIndex].text;
            }
            if (/\$/.test(String(raw))) continue;                   // a price, not a percentage
            const p = normalizePct(raw);
            if (p !== null) return p;
        }
        return null;
    }

    // Visible text like "15% off", "Save 20%", "20% discount".
    const TEXT_PATTERNS = [
        /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:off|discount|lower|below)/i,
        /save\s*(\d{1,2}(?:\.\d+)?)\s*%/i,
        /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:price\s*)?(?:reduction|drop)/i
    ];

    function pctFromText(scope) {
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (p.closest('.tm-msg-picker')) return NodeFilter.FILTER_REJECT;
                const tag = p.tagName;
                if (tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'OPTION') {
                    return NodeFilter.FILTER_REJECT;
                }
                return node.nodeValue && node.nodeValue.indexOf('%') !== -1
                    ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        let n;
        while ((n = walker.nextNode())) {
            for (const re of TEXT_PATTERNS) {
                const m = re.exec(n.nodeValue);
                if (m) {
                    const p = normalizePct(m[1]);
                    if (p !== null) return p;
                }
            }
        }
        return null;
    }

    // Last resort: two prices in the same row -> derive the discount.
    function pctFromPrices(scope) {
        const nums = [];
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const p = node.parentElement;
                if (!p || p.closest('.tm-msg-picker')) return NodeFilter.FILTER_REJECT;
                return /\$\s*\d/.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        let n;
        while ((n = walker.nextNode()) && nums.length < 8) {
            const m = n.nodeValue.match(/\$\s*(\d+(?:\.\d{1,2})?)/g) || [];
            m.forEach(s => {
                const v = parseFloat(s.replace(/[^\d.]/g, ''));
                if (isFinite(v) && v > 0) nums.push(v);
            });
        }
        if (nums.length < 2) return null;
        const hi = Math.max(...nums);
        const lo = Math.min(...nums);
        if (hi <= lo) return null;
        return normalizePct(((hi - lo) / hi) * 100);
    }

    function detectPct(container) {
        const scope = container.closest(MODAL_SELECTOR) ||
                      container.closest('form') ||
                      document.body;
        return pctFromFields(scope, true) ??
               pctFromText(scope) ??
               pctFromFields(scope, false) ??
               pctFromPrices(scope) ??
               null;
    }

    /* ------------------------------------------------------------------ *
     * React-safe textarea writing + focus preservation
     * ------------------------------------------------------------------ */
    const nativeTextareaValue =
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;

    function setTextareaValue(ta, val) {
        nativeTextareaValue.call(ta, val);                      // bypasses React's value tracker
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function withFocusPreserved(fn) {
        const el = document.activeElement;
        const isField = el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
        const sel = isField ? [el.selectionStart, el.selectionEnd] : null;
        try { fn(); } finally {
            if (isField && document.contains(el) && document.activeElement !== el) {
                el.focus({ preventScroll: true });
                if (sel && sel[0] !== null) {
                    try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* noop */ }
                }
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * UI
     * ------------------------------------------------------------------ */
    function currentPct(entry) {
        if (entry.state.manualPct !== null) return entry.state.manualPct;
        if (entry.state.detectedPct !== null) return entry.state.detectedPct;
        return DEFAULT_PCT;
    }

    function render(entry, force) {
        const { textarea, state, els } = entry;
        const pct = currentPct(entry);

        els.pctInput.value = String(pct);
        els.auto.style.visibility = state.manualPct === null ? 'hidden' : 'visible';

        if (state.templateIndex === null) {
            els.status.textContent = state.detectedPct === null
                ? 'Discount not detected — using ' + pct + '%. Edit the box if wrong.'
                : 'Detected ' + state.detectedPct + '% off.';
            return;
        }

        const msg = MESSAGES[state.templateIndex].replace(/\{PCT\}/g, pct);

        // Only overwrite what we wrote ourselves, so manual edits survive.
        if (force || textarea.value === state.lastWritten || textarea.value === '') {
            if (textarea.value !== msg) setTextareaValue(textarea, msg);
            state.lastWritten = msg;
        }

        const max = textarea.maxLength > 0 ? textarea.maxLength : 0;
        const over = max && msg.length > max;
        els.status.textContent =
            (state.manualPct !== null ? 'Manual ' : 'Auto ') + pct + '% · ' +
            msg.length + (max ? '/' + max : '') + ' chars' +
            (over ? ' — TOO LONG, trim before sending' : '') +
            (state.detectedPct === null && state.manualPct === null ? ' · discount not detected' : '');
        els.status.style.color = over ? '#b12704' : '#767676';
    }

    function buildWrapper(entry) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tm-msg-picker';
        wrapper.style.cssText =
            'margin:0 0 10px 0;padding:8px;border:1px solid #e5e5e5;border-radius:8px;' +
            'background:#fafafa;font-family:inherit;';

        const label = document.createElement('label');
        label.textContent = 'Quick Select Template:';
        label.style.cssText = 'display:block;font-weight:700;font-size:.875rem;margin-bottom:5px;';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;';

        const select = document.createElement('select');
        select.style.cssText =
            'flex:1 1 auto;min-width:0;padding:8px;border-radius:8px;border:1px solid #dcdcdc;background:#fff;';
        const ph = document.createElement('option');
        ph.text = '-- Choose a marketing message --';
        ph.value = '';
        select.appendChild(ph);
        MESSAGES.forEach((msg, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.text = 'Template ' + (i + 1) + ': ' + msg.replace('{PCT}', '#').substring(0, 45) + '...';
            select.appendChild(opt);
        });

        const pctInput = document.createElement('input');
        pctInput.type = 'number';
        pctInput.min = '1';
        pctInput.max = '95';
        pctInput.title = 'Discount % used in the message (auto-detected; type to override)';
        pctInput.style.cssText =
            'width:64px;flex:0 0 auto;padding:8px 6px;border-radius:8px;border:1px solid #dcdcdc;background:#fff;';

        const pctSign = document.createElement('span');
        pctSign.textContent = '%';
        pctSign.style.cssText = 'font-size:.875rem;color:#333;';

        const auto = document.createElement('button');
        auto.type = 'button';
        auto.textContent = '↺ auto';
        auto.title = 'Go back to the auto-detected discount';
        auto.style.cssText =
            'flex:0 0 auto;padding:6px 8px;border-radius:8px;border:1px solid #dcdcdc;' +
            'background:#fff;cursor:pointer;font-size:.75rem;visibility:hidden;';

        const status = document.createElement('div');
        status.style.cssText = 'margin-top:5px;font-size:.75rem;color:#767676;';

        row.append(select, pctInput, pctSign, auto);
        wrapper.append(label, row, status);

        entry.els = { select, pctInput, auto, status };

        // --- events ---------------------------------------------------
        select.addEventListener('change', () => {
            entry.state.templateIndex = select.value === '' ? null : parseInt(select.value, 10);
            render(entry, true);
            entry.textarea.focus({ preventScroll: true });
        });

        pctInput.addEventListener('input', () => {
            const v = normalizePct(pctInput.value);
            entry.state.manualPct = v === null ? null : v;
            render(entry, true);
        });

        auto.addEventListener('click', () => {
            entry.state.manualPct = null;
            render(entry, true);
        });

        // Keep our controls' events from reaching eBay's modal handlers.
        ['click', 'mousedown', 'keydown'].forEach(t =>
            wrapper.addEventListener(t, e => e.stopPropagation()));

        return wrapper;
    }

    function inject(container, textarea) {
        const entry = {
            container,
            textarea,
            wrapper: null,
            els: null,
            state: { templateIndex: null, manualPct: null, detectedPct: null, lastWritten: null }
        };
        entry.wrapper = buildWrapper(entry);

        // IMPORTANT: mount as a *sibling* of eBay's message container, not inside it.
        // eBay re-renders that container on every keystroke (char counter); a foreign
        // child node there makes React re-create the textarea, which is what was
        // dropping focus after each character.
        const mount = container.parentElement || container;
        muting = true;
        try {
            if (mount === container) mount.prepend(entry.wrapper);
            else mount.insertBefore(entry.wrapper, container);
        } finally { muting = false; }

        entry.state.detectedPct = detectPct(container);
        registry.push(entry);
        render(entry, false);
    }

    /* ------------------------------------------------------------------ *
     * Scanning / lifecycle
     * ------------------------------------------------------------------ */
    function findTargets() {
        const found = [];
        document.querySelectorAll('div[data-testid="offer-message-input"]').forEach(c => {
            const ta = c.querySelector('textarea');
            if (ta) found.push([c, ta]);
        });
        if (!found.length) {
            // Fallback if eBay renames the test id: any textarea inside the offer modal.
            document.querySelectorAll('[data-testid="sio-modal-root"], [role="dialog"]').forEach(m => {
                m.querySelectorAll('textarea').forEach(ta => {
                    found.push([ta.closest('div') || m, ta]);
                });
            });
        }
        return found;
    }

    function scan() {
        // Drop entries whose textarea (or wrapper) left the DOM.
        for (let i = registry.length - 1; i >= 0; i--) {
            const e = registry[i];
            if (!document.contains(e.textarea)) {
                if (e.wrapper && e.wrapper.parentElement) {
                    muting = true;
                    try { e.wrapper.remove(); } finally { muting = false; }
                }
                registry.splice(i, 1);
            }
        }

        findTargets().forEach(([container, textarea]) => {
            const existing = registry.find(e => e.textarea === textarea);
            if (existing) {
                // React can rip our node out; put it back without stealing focus.
                if (!document.contains(existing.wrapper)) {
                    withFocusPreserved(() => {
                        const mount = container.parentElement || container;
                        muting = true;
                        try {
                            if (mount === container) mount.prepend(existing.wrapper);
                            else mount.insertBefore(existing.wrapper, container);
                        } finally { muting = false; }
                    });
                }
                return;
            }
            withFocusPreserved(() => inject(container, textarea));
        });
    }

    function refreshDiscounts() {
        registry.forEach(entry => {
            if (!document.contains(entry.textarea)) return;
            const p = detectPct(entry.container);
            if (p !== entry.state.detectedPct) {
                entry.state.detectedPct = p;
                render(entry, false);   // rewrites only if the textarea still holds our text
            }
        });
    }

    let queued = false;
    const observer = new MutationObserver(() => {
        if (muting || queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            scan();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Discount can change without a DOM mutation we can see (input value edits).
    document.addEventListener('input', e => {
        if (e.target && e.target.closest && e.target.closest('.tm-msg-picker')) return;
        if (registry.length) refreshDiscounts();
    }, true);
    document.addEventListener('change', () => { if (registry.length) refreshDiscounts(); }, true);
    setInterval(() => { if (registry.length) refreshDiscounts(); }, 1000);

    scan();

    // Debug helper: run __tmOfferPicker() in the console to see what it detected.
    window.__tmOfferPicker = () => registry.map(e => ({
        detected: e.state.detectedPct,
        manual: e.state.manualPct,
        used: currentPct(e),
        template: e.state.templateIndex,
        container: e.container
    }));
})();
