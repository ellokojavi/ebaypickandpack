// ==UserScript==
// @name         Print Address from Gmail
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Adds a "Print address" button to Etsy/eBay order emails in Gmail and prints the buyer address in envelope format, with an edit panel. Parses the address from the rendered text instead of relying on an <address> tag.
// @author       Javier
// @match        https://mail.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SENDER_LINES = ['Altheastix', '3015 E Howell St', 'Seattle, WA 98122', 'United States'];

    // Envelope geometry (#10 = 24.13 x 10.49 cm, landscape). Nudge these if the
    // print lands off-centre on your printer.
    const ENVELOPE = {
        widthCm: 24.13,
        heightCm: 10.49,
        from: { leftCm: 0.7, topCm: 0.7, fontPt: 10.5 },
        to:   { leftCm: 5.0, topCm: 4.2, fontPt: 18 }
    };
    const DEBUG = false;
    // 'inline'  = print the current Gmail tab with everything but the envelope
    //             hidden by a print-only stylesheet (no extra tab to close).
    // 'window'  = open the envelope in its own window and print that.
    const PRINT_MODE = 'inline';
    const log = (...a) => { if (DEBUG) console.log('[PrintAddr]', ...a); };

    /* ================================================================== *
     * 1. Turn a rendered element into visual lines
     * ================================================================== */
    const BLOCK = new Set([
        'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT',
        'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
        'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
        'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
    ]);
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION']);

    function cleanLine(s) {
        return s.replace(/[ ‌​͏]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function walkLines(root) {
        const out = [];
        let cur = '';
        (function walk(node) {
            node.childNodes.forEach((c) => {
                if (c.nodeType === 3) { cur += c.nodeValue; return; }
                if (c.nodeType !== 1) return;
                if (SKIP.has(c.tagName)) return;
                if (c.classList && c.classList.contains('tm-print-addr')) return;
                if (BLOCK.has(c.tagName)) {
                    out.push(cur); cur = '';
                    walk(c);
                    out.push(cur); cur = '';
                } else {
                    walk(c);
                }
            });
        })(root);
        out.push(cur);
        return out.map(cleanLine).filter(Boolean);
    }

    function getLines(el) {
        // innerText already reflects what the user sees (hidden nodes excluded);
        // fall back to a manual walk when it is unavailable.
        const t = el.innerText;
        if (typeof t === 'string' && t.trim()) {
            // innerText separates cells in the same table ROW with a tab, so a
            // two-column layout ("Payment method<TAB>Shipping address") must be
            // split on tabs as well or the label never starts a line.
            return t.split(/[\n\t]/).map(cleanLine).filter(Boolean);
        }
        return walkLines(el);
    }

    /* ================================================================== *
     * 2. Find the shipping address inside those lines
     * ================================================================== */
    // The label can be its own line ("Shipping address") or carry the first
    // address line with it ("Ship to: Brian Thomas").
    const LABEL_RE = /^(ship(?:ping)?\s*(?:address|to)|deliver(?:y)?\s*(?:address|to)|buyer'?s?\s*address|send\s*to|recipient)\s*:?\s*(.*)$/i;

    const STOP_RE = new RegExp(
        '^(purchase|order\\s*details?|payment\\s*method|order\\s*total|subtotal|shipping\\s*(cost|total|method|service|label|and)|' +
        'sales?\\s*tax|tax|total|grand\\s*total|item\\s*(price|total|s)?|quantity|qty|view\\s*(order|details)|print\\s|' +
        'track|ship\\s*by|order\\s*(date|number|#)|sold\\s*to|message\\s*(to|from)|note\\s*(to|from)|billing|' +
        'get\\s*(shipping|your)|buy\\s*(shipping|postage)|contact|need\\s*help|thanks|hi\\b|hello\\b)', 'i'
    );

    const COUNTRY_RE = /^(united\s+states(\s+of\s+america)?|usa|u\.s\.a?\.?|canada|united\s+kingdom|uk|australia|germany|france|italy|spain|netherlands|sweden|norway|denmark|finland|ireland|new\s+zealand|japan|mexico|brazil|poland|portugal|belgium|austria|switzerland|czechia|czech\s+republic)$/i;
    // "MCHENRY, IL 60050" / "Seattle WA 98122-1234" / Canadian "Toronto, ON M5V 2T6"
    const CSZ_RE = /(\d{5}(-\d{4})?\s*$)|([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d\s*$)|(,\s*[A-Za-z]{2,3}\.?\s+[\w\- ]{3,10}$)/;

    function looksLikeStop(line) {
        if (STOP_RE.test(line)) return true;
        if (/[$£€]\s?\d/.test(line)) return true;      // a money line
        if (line.length > 70) return true;             // a paragraph, not an address line
        if (/^(http|www\.)/i.test(line)) return true;
        return false;
    }

    // Collect address lines starting at `from`, stopping at order-detail noise,
    // at the country line, or one line past city/state/ZIP.
    function collectBlock(lines, from) {
        const block = [];
        for (let j = from; j < lines.length && block.length < 7; j++) {
            const l = lines[j];
            if (looksLikeStop(l)) break;
            block.push(l);
            if (COUNTRY_RE.test(l)) break;
            if (block.length >= 2 && CSZ_RE.test(l)) {
                const next = lines[j + 1];
                if (next && !looksLikeStop(next) && COUNTRY_RE.test(next)) block.push(next);
                break;
            }
        }
        return block;
    }

    function parseAddressLines(lines) {
        for (let i = 0; i < lines.length; i++) {
            const m = LABEL_RE.exec(lines[i]);
            if (!m) continue;
            const block = [];
            if (m[2] && m[2].trim() && !looksLikeStop(m[2])) block.push(m[2].trim());
            collectBlock(lines, i + 1).forEach(l => { if (block.length < 7) block.push(l); });
            if (block.length >= 2) {
                log('address block from label', lines[i], block);
                return block;
            }
        }
        return null;
    }

    function structure(block) {
        const name = block[0] || '';
        let cszIdx = -1;
        for (let i = 1; i < block.length; i++) {
            if (CSZ_RE.test(block[i])) { cszIdx = i; break; }
        }
        let street, cityStateZip, country;
        if (cszIdx > 0) {
            street = block.slice(1, cszIdx).join('\n');
            cityStateZip = block[cszIdx];
            country = block.slice(cszIdx + 1).filter(l => COUNTRY_RE.test(l) || l.length < 30).join(' ');
        } else {
            // no recognizable postal line: fall back to positional
            const last = block[block.length - 1];
            if (COUNTRY_RE.test(last) && block.length >= 3) {
                country = last;
                cityStateZip = block[block.length - 2];
                street = block.slice(1, block.length - 2).join('\n');
            } else {
                country = '';
                cityStateZip = block[block.length - 1] || '';
                street = block.slice(1, block.length - 1).join('\n');
            }
        }
        return { name, street, cityStateZip, country };
    }

    // Text of an element's OWN text nodes (not its descendants').
    function ownText(el) {
        let t = '';
        el.childNodes.forEach(n => { if (n.nodeType === 3) t += n.nodeValue; });
        return cleanLine(t);
    }

    // Anchor on the element that carries the label, then widen out from it.
    // Reading the whole message as one flat list of lines gets confused by
    // multi-column layouts (Etsy puts "Payment method" and "Shipping address"
    // in the same table row), so start from the label's own cell.
    function extractNearLabel(scope) {
        const all = scope.querySelectorAll('*');
        for (const el of all) {
            if (el.children.length > 4) continue;              // leaf-ish nodes only
            const own = ownText(el);
            if (!own || own.length > 40) continue;
            const m = LABEL_RE.exec(own);
            if (!m) continue;

            // Case A: the label sits alone in its own table cell, and the address
            // is in the neighbouring cell or in the same column one row down.
            const cell = el.closest && el.closest('td,th');
            if (cell && !(m[2] && m[2].trim())) {
                const cellText = cleanLine(cell.innerText || ownText(cell));
                const lm = LABEL_RE.exec(cellText);
                if (lm && !(lm[2] && lm[2].trim())) {
                    const cands = [];
                    if (cell.nextElementSibling) cands.push(cell.nextElementSibling);
                    const row = cell.closest('tr');
                    if (row) {
                        const idx = Array.prototype.indexOf.call(row.children, cell);
                        let r = row.nextElementSibling, guard = 0;
                        while (r && guard++ < 3) {
                            if (r.children && r.children[idx]) cands.push(r.children[idx]);
                            r = r.nextElementSibling;
                        }
                    }
                    for (const c of cands) {
                        const blk = collectBlock(getLines(c), 0);
                        if (blk.length >= 3 && blk.some(l => CSZ_RE.test(l))) {
                            log('address from neighbouring cell', blk);
                            return structure(blk);
                        }
                    }
                }
            }

            // Case B: label and address share a container — widen out from it.
            let node = el;
            for (let up = 0; up < 4 && node; up++) {
                const block = parseAddressLines(getLines(node));
                if (block) { log('address anchored at', own, 'level', up); return structure(block); }
                node = node.parentElement;
                if (!node || node === scope.parentElement) break;
            }
        }
        return null;
    }

    // Preferred path: a real <address> element. Then the label anchor. Then the
    // whole message read as flat lines.
    function extractAddress(scope) {
        const el = scope.querySelector('address');
        if (el) {
            const block = getLines(el);
            if (block.length >= 3) { log('used <address> element'); return structure(block); }
        }
        const anchored = extractNearLabel(scope);
        if (anchored) return anchored;
        const parsed = parseAddressLines(getLines(scope));
        return parsed ? structure(parsed) : null;
    }

    /* ================================================================== *
     * 3. Printing
     * ================================================================== */
    let printFrame = null;

    // Deliberately table-free and in absolute cm units. Firefox's print preview
    // re-lays-out a static clone of the document, and a height:100% table inside
    // a fixed-size @page is exactly the kind of thing that can leave it spinning
    // on "Preparing Preview" forever.
    function envelopeDoc(lines) {
        const E = ENVELOPE;
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Envelope</title><style>' +
            '@page{size:' + E.widthCm + 'cm ' + E.heightCm + 'cm;margin:0}' +
            'html,body{margin:0;padding:0;background:#fff}' +
            '.env{position:relative;width:' + E.widthCm + 'cm;height:' + E.heightCm + 'cm;' +
            'overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#000}' +
            '.from{position:absolute;left:' + E.from.leftCm + 'cm;top:' + E.from.topCm + 'cm;' +
            'font-size:' + E.from.fontPt + 'pt;line-height:1.35}' +
            '.to{position:absolute;left:' + E.to.leftCm + 'cm;top:' + E.to.topCm + 'cm;' +
            'font-size:' + E.to.fontPt + 'pt;line-height:1.4}' +
            '.hint{position:absolute;left:0;bottom:0;width:100%;padding:6px 8px;box-sizing:border-box;font:12px Arial,Helvetica,sans-serif;color:#555;background:#f4f4f4;border-top:1px solid #ddd}' +
            '@media print{.hint{display:none}}' +
            '</style></head><body><div class="env">' +
            '<div class="from">' + linesToHtml(SENDER_LINES, false) + '</div>' +
            '<div class="to">' + linesToHtml(lines, true) + '</div>' +
            '<div class="hint">If the print dialog does not open by itself, press \u2318P (paper size: Envelope #10, landscape). This window closes after printing.</div>' +
            '</div></body></html>';
    }

    // Firefox's print preview stalls on "Preparing Preview" when it is asked to
    // render a subframe of a document as large and as busy as Gmail — the clone
    // it builds for the preview never settles. A separate top-level window is
    // its own small document, so the preview always resolves. The hidden iframe
    // stays only as a fallback for when a popup blocker refuses the window.
    // Print the envelope from the page we are already on: append a hidden host
    // node plus a print-only stylesheet that hides every other top-level element,
    // call print(), then tear both down when the dialog closes. No extra tab.
    function escapeHtml(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function linesToHtml(lines, boldFirst) {
        return lines.map((l, i) => (boldFirst && i === 0 ? '<b>' + escapeHtml(l) + '</b>' : escapeHtml(l)))
                    .join('<br>');
    }

    // Gmail enforces Trusted Types (require-trusted-types-for 'script'), so
    // assigning innerHTML throws "Sink type mismatch violation blocked by CSP".
    // Every node below is built with createElement/textContent instead.
    function fillLines(container, lines, boldFirst) {
        lines.forEach((line, i) => {
            if (i) container.appendChild(document.createElement('br'));
            if (boldFirst && i === 0) {
                const b = document.createElement('b');
                b.textContent = line;
                container.appendChild(b);
            } else {
                container.appendChild(document.createTextNode(line));
            }
        });
    }

    const PRINT_NODE_ID = 'tm-print-node';
    const PRINT_STYLE_ID = 'tm-print-style';

    function printStyleText() {
        const E = ENVELOPE;
        return '@page{size:' + E.widthCm + 'cm ' + E.heightCm + 'cm;margin:0}' +
            'html,body{margin:0 !important;padding:0 !important;background:#fff !important;' +
            'height:auto !important;min-height:0 !important;overflow:visible !important}' +
            // hide everything except our node (and keep our node's ancestors sane)
            'body>*:not(#' + PRINT_NODE_ID + '){display:none !important}' +
            'body>#' + PRINT_NODE_ID + '{display:block !important;position:absolute !important;' +
            'left:0 !important;top:0 !important;margin:0 !important;padding:0 !important;' +
            'width:' + E.widthCm + 'cm !important;height:' + E.heightCm + 'cm !important;' +
            'overflow:hidden !important;background:#fff !important;color:#000 !important;' +
            'font-family:Arial,Helvetica,sans-serif !important;z-index:2147483647 !important}' +
            '#' + PRINT_NODE_ID + ' .from{position:absolute;left:' + E.from.leftCm + 'cm;' +
            'top:' + E.from.topCm + 'cm;font-size:' + E.from.fontPt + 'pt;line-height:1.35}' +
            '#' + PRINT_NODE_ID + ' .to{position:absolute;left:' + E.to.leftCm + 'cm;' +
            'top:' + E.to.topCm + 'cm;font-size:' + E.to.fontPt + 'pt;line-height:1.4}';
    }

    let adoptedSheet = null;

    // A <style> element can be refused by a nonce-based style-src. If the rules
    // do not land, fall back to a constructible stylesheet, which CSP does not
    // gate. The rules are print-only either way.
    function addPrintStyle() {
        const css = printStyleText();
        const style = document.createElement('style');
        style.id = PRINT_STYLE_ID;
        style.media = 'print';
        style.textContent = css;
        document.head.appendChild(style);

        let ok = false;
        try { ok = !!(style.sheet && style.sheet.cssRules && style.sheet.cssRules.length); } catch (e) { ok = true; }
        if (ok) return;

        log('<style> blocked — using adoptedStyleSheets');
        style.remove();
        try {
            const sheet = new CSSStyleSheet({ media: 'print' });
            sheet.replaceSync(css);
            document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);
            adoptedSheet = sheet;
        } catch (e) {
            console.error('[PrintAddr] could not install print styles:', e);
        }
    }

    function cleanupInline() {
        const n = document.getElementById(PRINT_NODE_ID);
        if (n) n.remove();
        const st = document.getElementById(PRINT_STYLE_ID);
        if (st) st.remove();
        if (adoptedSheet) {
            try {
                document.adoptedStyleSheets =
                    Array.prototype.filter.call(document.adoptedStyleSheets, sh => sh !== adoptedSheet);
            } catch (e) { /* noop */ }
            adoptedSheet = null;
        }
    }

    function printInline(lines) {
        cleanupInline();

        const host = document.createElement('div');
        host.id = PRINT_NODE_ID;
        host.className = 'tm-print-addr';
        host.style.display = 'none';           // invisible on screen; the print
                                               // stylesheet flips it to block

        const from = document.createElement('div');
        from.className = 'from';
        fillLines(from, SENDER_LINES, false);
        const to = document.createElement('div');
        to.className = 'to';
        fillLines(to, lines, true);
        host.appendChild(from);
        host.appendChild(to);
        document.body.appendChild(host);

        addPrintStyle();

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            window.removeEventListener('afterprint', finish);
            // Firefox hands the job to the spooler asynchronously — let it.
            setTimeout(cleanupInline, 1500);
        };
        window.addEventListener('afterprint', finish);
        setTimeout(finish, 180000);            // never leave the node behind

        setTimeout(() => {
            try {
                window.print();
            } catch (e) {
                console.error('[PrintAddr] inline print failed:', e);
                finish();
            }
        }, 120);                               // let the stylesheet apply first
    }

    function printViaWindow(doc) {
        // A written about:blank document loses the race against Firefox's own
        // initial about:blank load — the window ends up blank, which is exactly
        // what happened. Navigating to a blob: URL is a real load with a real
        // load event, and the blob keeps Gmail's origin so we may still drive
        // print() on it from here.
        let url = null;
        try {
            url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
        } catch (e) {
            log('blob unavailable:', e);
        }

        let w = null;
        try {
            w = window.open(url || '', '_blank', 'width=900,height=520,menubar=no,toolbar=no');
        } catch (e) { /* blocked */ }
        if (!w) {
            if (url) URL.revokeObjectURL(url);
            return false;
        }

        let started = false;
        const start = () => {
            if (started) return;
            started = true;
            try { w.focus(); } catch (e) { /* noop */ }
            try {
                let closed = false;
                const shut = () => {
                    if (closed) return;
                    closed = true;
                    // Firefox's print() is async; closing early cancels the job.
                    setTimeout(() => { try { w.close(); } catch (e) { /* noop */ } }, 1500);
                };
                try { w.addEventListener('afterprint', shut); } catch (e) { /* noop */ }
                w.print();
                setTimeout(shut, 180000);
            } catch (e) {
                // Leave the window open: the hint tells the user to press Cmd+P.
                console.error('[PrintAddr] print() failed, use Cmd+P in the new window:', e);
            }
            if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
        };

        if (url) {
            try { w.addEventListener('load', () => setTimeout(start, 300)); } catch (e) { /* noop */ }
            setTimeout(start, 1800);                  // in case load never reaches us
        } else {
            // No blob support: write, but only after the initial about:blank has
            // settled, otherwise Firefox wipes what we wrote.
            setTimeout(() => {
                try {
                    w.document.open();
                    w.document.write(doc);
                    w.document.close();
                } catch (e) {
                    console.error('[PrintAddr] could not write the envelope window:', e);
                }
                setTimeout(start, 500);
            }, 150);
        }
        return true;
    }

    function printViaIframe(doc) {
        if (printFrame && printFrame.parentNode) printFrame.remove();   // previous one only
        const iframe = document.createElement('iframe');
        printFrame = iframe;
        iframe.className = 'tm-print-addr';
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:960px;height:420px;border:0;';
        document.body.appendChild(iframe);

        const d = iframe.contentDocument;
        d.open(); d.write(doc); d.close();       // a written doc, never srcdoc

        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error('[PrintAddr] iframe print failed:', e);
            }
        }, 300);
    }

    function printEnvelope(lines) {
        if (!lines.length) return;
        if (PRINT_MODE === 'inline') {
            printInline(lines);
            return;
        }
        const doc = envelopeDoc(lines);
        if (!printViaWindow(doc)) {
            log('popup blocked — falling back to iframe');
            printViaIframe(doc);
        }
    }

    /* ================================================================== *
     * 4. UI
     * ================================================================== */
    function buildPanel(addr, scope) {
        const box = document.createElement('div');
        box.className = 'tm-print-addr';
        box.style.cssText =
            'margin:8px 0;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;' +
            'background:#fafafa;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#202124;';

        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '🖨 Print address';
        btn.style.cssText =
            'cursor:pointer;padding:6px 12px;border-radius:16px;border:1px solid #dadce0;' +
            'background:#fff;font-size:13px;';

        const edit = document.createElement('a');
        edit.href = '#';
        edit.textContent = 'Edit';
        edit.style.cssText = 'text-decoration:underline;color:#e55400;cursor:pointer;';

        const preview = document.createElement('span');
        preview.style.cssText = 'color:#5f6368;';

        bar.append(btn, edit, preview);

        const fields = document.createElement('div');
        fields.style.cssText = 'display:none;margin-top:8px;';
        const mk = (tag, ph, val) => {
            const el = document.createElement(tag);
            el.placeholder = ph;
            el.value = val || '';
            el.style.cssText =
                'display:block;margin-bottom:5px;width:320px;max-width:100%;padding:5px;' +
                'border:1px solid #dadce0;border-radius:4px;font:inherit;' +
                (tag === 'textarea' ? 'height:56px;resize:vertical;' : '');
            if (tag === 'input') el.type = 'text';
            return el;
        };
        const nameI = mk('input', 'Name', addr.name);
        const streetI = mk('textarea', 'Street address', addr.street);
        const cszI = mk('input', 'City, State ZIP', addr.cityStateZip);
        const countryI = mk('input', 'Country', addr.country);
        fields.append(nameI, streetI, cszI, countryI);

        box.append(bar, fields);

        const updatePreview = () => {
            preview.textContent = [nameI.value, cszI.value].filter(Boolean).join(' · ');
        };
        updatePreview();

        edit.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const open = fields.style.display === 'none';
            fields.style.display = open ? 'block' : 'none';
            edit.textContent = open ? 'Close' : 'Edit';
            if (open) nameI.focus();
        });

        [nameI, streetI, cszI, countryI].forEach(i => i.addEventListener('input', updatePreview));

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // A text selection inside the message always wins — handy when the
            // parser guesses wrong on an unusual email.
            const sel = String(window.getSelection ? window.getSelection() : '').trim();
            let lines;
            if (sel && sel.split('\n').filter(Boolean).length >= 2 && scope.contains(
                window.getSelection().anchorNode || document.body)) {
                lines = sel.split('\n').map(cleanLine).filter(Boolean);
            } else {
                lines = [nameI.value]
                    .concat(streetI.value.split('\n'))
                    .concat([cszI.value, countryI.value])
                    .map(l => cleanLine(l))
                    .filter(Boolean);
            }
            printEnvelope(lines);
        });

        // Keep Gmail's own click/keyboard handlers out of our controls.
        ['click', 'mousedown', 'keydown', 'keypress'].forEach(t =>
            box.addEventListener(t, ev => ev.stopPropagation()));

        return box;
    }

    /* ================================================================== *
     * 5. Find open messages and mount the panel
     * ================================================================== */
    // Gmail renders each open message body in div.a3s (a.k.a. .ii.gt).
    function isVisible(el) {
        try {
            const st = el.ownerDocument.defaultView.getComputedStyle(el);
            if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
        } catch (e) { /* noop */ }
        return true;
    }

    function messageBodies() {
        // Gmail nests them: <div class="ii gt"><div class="a3s">…</div></div>.
        // Matching both put TWO panels on every email, so keep only the innermost.
        let nodes = Array.from(document.querySelectorAll('div.a3s'));
        if (!nodes.length) nodes = Array.from(document.querySelectorAll('div.ii.gt'));
        if (!nodes.length) {
            // Class names changed: fall back to the smallest visible container
            // that mentions a shipping label.
            nodes = Array.from(document.querySelectorAll('div'))
                .filter(d => d.childElementCount &&
                             /ship(ping)?\s*(address|to)/i.test(d.textContent || ''))
                .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)
                .slice(0, 1);
        }
        nodes = nodes.filter(n => !nodes.some(o => o !== n && n.contains(o)));
        return nodes.filter(isVisible);
    }

    const panels = new WeakMap();
    let busy = false;

    function mount() {
        if (busy) return;
        busy = true;
        try {
            messageBodies().forEach((body) => {
                if (!body.parentNode) return;
                const panel = panels.get(body);
                const live = panel && panel.isConnected;

                // Never rebuild while the user is typing in the edit fields.
                if (live && panel.contains(document.activeElement)) return;

                // Cheap change check: the panel lives OUTSIDE the message body,
                // so the body's own text length is a stable signature.
                const len = String((body.textContent || '').length);
                if (live && body.dataset.tmLen === len) return;

                const addr = extractAddress(body);
                if (!addr || !addr.name) { log('no address in this message'); return; }

                const sig = JSON.stringify(addr);
                if (live && panel.dataset.sig === sig) { body.dataset.tmLen = len; return; }
                if (panel) panel.remove();

                const fresh = buildPanel(addr, body);
                fresh.dataset.sig = sig;
                body.parentNode.insertBefore(fresh, body);   // sits just above the email
                panels.set(body, fresh);
                body.dataset.tmLen = len;
                log('panel mounted', addr);
            });
        } catch (e) {
            console.error('[PrintAddr] mount error:', e);
        } finally {
            busy = false;
        }
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => { scheduled = false; mount(); }, 300);
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', schedule);   // Gmail navigates by hash
    schedule();

    // Console helper: __printAddrDebug() shows what the parser sees.
    window.__printAddrDebug = () => messageBodies().map(b => ({
        lines: getLines(b).slice(0, 40),
        parsed: extractAddress(b),
        body: b
    }));
})();
