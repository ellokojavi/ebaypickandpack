# 🧩 Companion Userscripts

Two small standalone Tampermonkey scripts that live alongside the main
pick-and-pack `userscript.js`. They are independent — install either one on its
own — but they cover the two jobs that happen *outside* eBay's bulk shipping
page: sending offers to watchers, and addressing an envelope from an order
email.

| Script | Runs on | What it does |
|--------|---------|--------------|
| [`offer-msg-picker.user.js`](../offer-msg-picker.user.js) | `ebay.com/sh/lst/active*` (Send Offer modal) | Drop-down of 10 marketing messages with the real discount % filled in |
| [`print-address-gmail.user.js`](../print-address-gmail.user.js) | `mail.google.com/*` | "Print address" button on Etsy/eBay order emails → #10 envelope |

Install by opening the raw file and letting Tampermonkey prompt:

```
https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/offer-msg-picker.user.js
https://raw.githubusercontent.com/ellokojavi/ebaypickandpack/main/print-address-gmail.user.js
```

---

## 📨 Offer Msg Picker

When eBay's **Send offer to interested buyers** modal opens on the Active
Listings page, the script injects a control above the offer-message box.

### What it gives you

- **Quick Select Template** dropdown with 10 pre-written marketing messages
  (5-year outdoor rating, free shipping, urgency close).
- **Auto-filled discount %** — every template carries a `{PCT}` placeholder that
  is replaced with the discount actually set in the modal, so the message can
  never promise 10% while the offer sends 15%.
- **Editable % box** next to the dropdown showing the detected value. Type over
  it to override; the `↺ auto` button goes back to auto-detection.
- **Status line** under the control: whether the number is `Auto` or `Manual`,
  the character count against eBay's `maxlength`, and a warning if the message
  is too long to send.
- Changing the discount in eBay's own form **rewrites the message live** — but
  only if you haven't hand-edited it. Your own edits are never clobbered.

### How the discount is detected

In priority order, scoped to the offer modal:

1. A form field whose name/id/test-id/aria-label mentions *percent* / *pct* / *%*
   (values like `0.15` are normalised to `15`; anything containing `$` is skipped).
2. Visible text matching `15% off`, `Save 20%`, `20% discount`.
3. A looser *discount* / *markdown* field (lower priority — its value might be a
   dollar amount).
4. Derived from the highest and lowest prices shown in the modal.

If all four miss, it falls back to 10% and says "discount not detected" in the
status line so it is obvious the number needs checking. `__tmOfferPicker()` in
the browser console dumps what it detected for each message box.

### Editing the templates

`MESSAGES` at the top of the file. Write `{PCT}` where the percentage goes:

```javascript
"Grab {PCT}% off + free shipping! Our stickers are built for the elements…"
```

### Why it is built the way it is

eBay's modal is React-rendered and re-renders on **every keystroke** (the
character counter). Two consequences shaped the script:

- The control is mounted as a **sibling** of eBay's message container, never
  inside it. A foreign child node inside a React-managed container makes React
  re-create the textarea on each render, which drops focus after every character
  typed.
- Templates are written through the **native `value` setter descriptor**
  (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`)
  before dispatching `input`. A plain `textarea.value = …` bypasses React's value
  tracker and gets reverted on the next render.

---

## 🖨️ Print Address from Gmail

Opens an Etsy or eBay order email in Gmail and puts a **🖨 Print address** button
at the top of the message, with the buyer's name and city shown beside it as a
sanity check. One click prints a #10 envelope with the Altheastix return address
and the buyer's address — no extra tab, no window to close.

### What it gives you

- **Automatic address extraction** from the rendered email.
- **Edit panel** (the `Edit` link) with Name / Street / City-State-ZIP / Country
  fields, pre-filled and editable before printing.
- **Selection override** — select an address block with the mouse and press the
  button; the selection wins over the parsed values. Useful on an email shape the
  parser has not seen.
- One panel per open message in a thread; it follows you as you open other
  emails.

### How the address is found

Gmail's sanitiser does not preserve `<address>` elements, so tag-based lookup is
unreliable (the first version of this script did nothing at all for that reason).
The current order is:

1. A real `<address>` element, if one somehow survives.
2. **Label anchoring** — find the element whose own text is `Shipping address`,
   `Ship to`, `Deliver to`, `Buyer's address`, …, then read the address from that
   element's own cell, from the neighbouring cell, from the same column one row
   down, or from progressively wider ancestors.
3. The whole message read as a flat list of lines.

Lines are taken from `innerText` (falling back to a DOM walk), which is what the
user actually sees. City/State/ZIP is identified by pattern — US `NAME, ST 12345`
and Canadian `A1A 1A1` — so multi-line streets and missing country lines both
work. Collection stops at order-detail noise (`Purchase`, `Order total`, money
lines, long paragraphs).

`__printAddrDebug()` in the console prints the lines it sees and what it parsed.

### Envelope geometry

`ENVELOPE` at the top of the file, in centimetres, for a #10 envelope printed
landscape:

```javascript
const ENVELOPE = {
    widthCm: 24.13, heightCm: 10.49,
    from: { leftCm: 0.7, topCm: 0.7, fontPt: 10.5 },
    to:   { leftCm: 5.0, topCm: 4.2, fontPt: 18 }
};
```

The return address is `SENDER_LINES`, an array of plain strings.

### How printing works

`PRINT_MODE = 'inline'` (the default) prints **the Gmail tab you are already
on**:

1. A hidden `#tm-print-node` holding the envelope is appended to the page.
2. A `media="print"` stylesheet is installed with
   `@page { size: 24.13cm 10.49cm; margin: 0 }` and
   `body > *:not(#tm-print-node) { display: none !important }`.
3. `window.print()` — Firefox's dialog picks up Envelope #10 / landscape from
   `@page` on its own.
4. On `afterprint` (plus 1.5s of grace) the node and the stylesheet are removed.

Output is a single 684 × 297 pt page. Nothing is visible on screen at any point.

`PRINT_MODE = 'window'` is kept as a fallback: it opens the envelope in its own
window (via a `blob:` URL) and prints that.

### Browser constraints this script works around

Four separate traps, each of which made it silently do nothing at some point:

- **Gmail enforces Trusted Types** (`require-trusted-types-for 'script'`). Any
  `element.innerHTML = string` throws *Sink type mismatch violation blocked by
  CSP* and kills the click handler. Every node is built with `createElement` +
  `textContent`. A `<style>` element can likewise be refused by a nonce-based
  `style-src`, so the script verifies its rules landed and otherwise falls back
  to a constructible `CSSStyleSheet` via `document.adoptedStyleSheets`.
- **Firefox will not print a subframe of Gmail.** Printing a hidden iframe —
  `srcdoc` or written — leaves the preview stuck on *Preparing Preview* forever.
- **`window.open('') + document.write` opens blank in Firefox**, because the
  write loses the race against the browser's own initial `about:blank` load. The
  window fallback navigates to a `blob:` URL instead.
- **`print()` is asynchronous in Firefox.** Anything torn down on a short timer
  cancels the job; cleanup hangs off `afterprint`.

Gmail's message body also nests as `<div class="ii gt"><div class="a3s aiL">`.
Matching both classes injects the panel twice, so the script keeps only the
innermost match.

### Troubleshooting

| Symptom | Check |
|---------|-------|
| No button on an order email | Run `__printAddrDebug()` — if `parsed` is `null`, the label wording is new. Select the address and click the button as a workaround. |
| Wrong name/street split | Open `Edit` and fix the fields, or select the correct block before printing. |
| Print dialog does not open | Look for `[PrintAddr]` errors in the console; try `PRINT_MODE = 'window'`. |
| Envelope prints off-centre | Adjust `ENVELOPE.to.leftCm` / `topCm`. |
