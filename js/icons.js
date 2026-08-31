/* Battlemap Forge — line-icon set

   The interface used to be labelled with emoji. Emoji are drawn by the
   operating system, so their weight, colour and optical size disagree with
   each other and change entirely between machines — a toolbar built from them
   can never look like one set. These are one set: a 24-unit grid, 2-unit
   stroke, round caps, and `currentColor`, so an icon inherits whatever the
   button around it is already doing. */
'use strict';

const ICONS = {
  /* --- brand ------------------------------------------------------------ */
  anvil: '<path d="M3 8h10a4 4 0 0 1-4 4v3h5v4H7v-4h2v-3H7a4 4 0 0 1-4-4z"/><path d="M13 8l5-3v6z"/>',

  /* --- left rail -------------------------------------------------------- */
  sparkles: '<path d="M11 3.5l1.7 4.3 4.3 1.7-4.3 1.7L11 15.5l-1.7-4.3L5 9.5l4.3-1.7z"/><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15.5l-4.5-4.5L5.5 21"/>',
  save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M12 15V3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/><path d="M12 17.5h.01"/>',

  /* --- map tools -------------------------------------------------------- */
  cursor: '<path d="M5 3l6.5 16 2.4-6.6 6.6-2.4z"/>',
  brush: '<path d="M14.5 3.6l5.9 5.9-7.5 7.5-5.9-5.9z"/><path d="M7 11.1l-1.6 1.6a3.5 3.5 0 0 0-.6 4.1c-.4 1.1-1.2 1.8-2.3 2.2 1.4 1.3 3.2 2 5 1.8a4 4 0 0 0 3.6-4.6"/>',
  square: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
  room: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9.5h18M9.5 21V9.5"/>',
  partition: '<path d="M12 3v18"/><path d="M8 3h8M8 21h8"/>',
  door: '<path d="M4 20.5h16"/><path d="M6.5 20.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><circle cx="14.5" cy="12.5" r="1" fill="currentColor" stroke="none"/>',
  house: '<path d="M3 10.6L12 3l9 7.6V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9.5 21v-6h5v6"/>',
  chair: '<path d="M6 12V6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5V12"/><path d="M4 14a2 2 0 0 1 2 2v1.5h12V16a2 2 0 0 1 4 0v4H2v-4a2 2 0 0 1 2-2z"/><path d="M5 20v1.5M19 20v1.5"/>',
  flame: '<path d="M12 3c.3 3 1.6 4 2.6 5.2A6.4 6.4 0 0 1 16.5 13a4.5 4.5 0 0 1-9 0c0-1.6.7-2.8 1.5-3.7.3 1.2 1 1.9 1.6 2.2 0-2.4-.6-5.6 1.4-8.5z"/>',
  bricks: '<rect x="3" y="4.5" width="18" height="15" rx="1"/><path d="M3 9.5h18M3 14.5h18"/><path d="M8.5 4.5v5M15.5 9.5v5M8.5 14.5v5"/>',
  eraser: '<path d="M9 20.5H6l-2.6-2.6a2 2 0 0 1 0-2.8l8.7-8.7a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L12 20.5"/><path d="M13 20.5h8"/><path d="M9.4 9.6l5 5"/>',
  pipette: '<path d="M16.5 3.5a3 3 0 0 1 4.2 4.2l-2 2-4.2-4.2z"/><path d="M14 6.5L5 15.5v3.5h3.5L17.5 10"/>',
  hand: '<path d="M8.5 12.5V5.2a1.6 1.6 0 0 1 3.2 0v6"/><path d="M11.7 11V4.2a1.6 1.6 0 0 1 3.2 0V11"/><path d="M14.9 11.2V6.6a1.6 1.6 0 0 1 3.2 0v6"/><path d="M18.1 11.5a1.6 1.6 0 0 1 3.2 0v3.6a6 6 0 0 1-6 6h-1.9a6 6 0 0 1-5.2-3l-2-3.4a1.6 1.6 0 0 1 2.7-1.7l1.9 2.6"/>',

  /* --- right rail panels ------------------------------------------------ */
  sliders: '<path d="M6 21v-9M6 8V3M12 21v-5M12 12V3M18 21v-3M18 14V3"/><circle cx="6" cy="10" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="18" cy="16" r="2"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  text: '<path d="M4 6.5V4.5h16v2"/><path d="M12 4.5v15"/><path d="M8.5 19.5h7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.5V16.5"/><path d="M12 8h.01"/>',

  /* --- actions ---------------------------------------------------------- */
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H10"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H14"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.2" cy="8.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.8" cy="8.2" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.2" cy="15.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.8" cy="15.8" r="1.2" fill="currentColor" stroke="none"/>',
  rotateCw: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3"/><path d="M20.5 4v5h-5"/>',
  rotateCcw: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3"/><path d="M3.5 4v5h5"/>',
  flipH: '<path d="M12 3v18"/><path d="M9 7H5.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1H9z"/><path d="M15 7h3.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H15z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 9V5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1V9z"/><path d="M7 15v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V15z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5.5 15H4.5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v1"/>',
  trash: '<path d="M4 6.5h16"/><path d="M9.5 3.5h5v3h-5z"/><path d="M6 6.5l1 13.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13.5"/><path d="M10.5 10.5v6M13.5 10.5v6"/>',
  pencil: '<path d="M16.5 3.5l4 4L8 20l-5 1 1-5z"/><path d="M13.5 6.5l4 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.4-4.4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3.4 4.1"/><path d="M6.7 7A17.3 17.3 0 0 0 2.5 12S6 18 12 18a9.3 9.3 0 0 0 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',

  /* --- vector editor ---------------------------------------------------- */
  nodes: '<rect x="3" y="3" width="4.5" height="4.5" rx="1"/><rect x="16.5" y="3" width="4.5" height="4.5" rx="1"/><rect x="3" y="16.5" width="4.5" height="4.5" rx="1"/><rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1"/><path d="M7.5 5.2h9M5.2 7.5v9M18.8 7.5v9M7.5 18.8h9"/>',
  pen: '<path d="M12 19l7-7 2.5 2.5-7 7z"/><path d="M17.5 12.5L15.5 4 3 2l2 12.5 8.5 2z"/><path d="M3 2l6.6 6.6"/><circle cx="11" cy="11" r="2"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  pentagon: '<path d="M12 3l9 6.6-3.4 10.4H6.4L3 9.6z"/>',
  star: '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/>',
  line: '<path d="M4.5 19.5l15-15"/>',

  /* --- arrange & align -------------------------------------------------- */
  toFront: '<path d="M4 3.5h16"/><path d="M12 21V8"/><path d="M8 12l4-4 4 4"/>',
  toBack: '<path d="M4 20.5h16"/><path d="M12 3v13"/><path d="M8 12l4 4 4-4"/>',
  up: '<path d="M12 20V4"/><path d="M6 10l6-6 6 6"/>',
  down: '<path d="M12 4v16"/><path d="M6 14l6 6 6-6"/>',
  alignLeft: '<path d="M3.5 3v18"/><path d="M20 12H8"/><path d="M12 8l-4 4 4 4"/>',
  alignRight: '<path d="M20.5 3v18"/><path d="M4 12h12"/><path d="M12 8l4 4-4 4"/>',
  alignCenterH: '<path d="M12 2v3M12 10.5v3M12 19v3"/><rect x="4" y="5" width="16" height="5.5" rx="1"/><rect x="7" y="13.5" width="10" height="5.5" rx="1"/>',
  alignTop: '<path d="M3 3.5h18"/><path d="M12 20V8"/><path d="M8 12l4-4 4 4"/>',
  alignBottom: '<path d="M3 20.5h18"/><path d="M12 4v12"/><path d="M8 12l4 4 4-4"/>',
  alignCenterV: '<path d="M2 12h3M10.5 12h3M19 12h3"/><rect x="5" y="4" width="5.5" height="16" rx="1"/><rect x="13.5" y="7" width="5.5" height="10" rx="1"/>'
};

/** Markup for one icon, or empty string for an unknown name — a missing icon
    should leave a gap, never throw and take the panel down with it. */
function iconSvg(name) {
  const body = ICONS[name];
  if (!body) return '';
  return '<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
         'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
         'aria-hidden="true" focusable="false">' + body + '</svg>';
}

/** Swap every `data-icon="name"` placeholder in `root` for its drawing. The
    icon is decorative — the accessible name comes from the button's own
    aria-label — so it is hidden from assistive tech above. */
function renderIcons(root) {
  for (const el of (root || document).querySelectorAll('[data-icon]')) {
    const svg = iconSvg(el.dataset.icon);
    if (svg) el.innerHTML = svg;
  }
}

renderIcons(document);
