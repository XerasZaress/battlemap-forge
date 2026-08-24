/* Battlemap Forge — command palette (⌘K)

   Thirteen tools, ten panels, two dozen actions, forty terrains and several
   hundred props, and the only way to find any of them was to know which rail
   it lived behind. The shortcuts existed but were listed on a help panel you
   had to already know how to open. This makes the whole application
   searchable from one place, and shows each command's shortcut next to it, so
   the palette teaches the keyboard rather than replacing it. */
'use strict';

const PAL_MAX = 40;
const pal = { open: false, items: [], hits: [], sel: 0, lastFocus: null };

/* ---------- the command list, gathered fresh on every open so it always
     reflects the props and terrains actually loaded ---------- */

function palCommands() {
  const out = [];
  /* `match` is what the query is tested against and `name` is what gets
     shown. They differ because every prop reads "Place X" and every terrain
     "Paint with X" — matching the shared prefix would rank the whole catalogue
     above the one thing the user actually typed. */
  const add = (group, name, keys, run, match) =>
    out.push({ group, name, keys, run, match: ((match || name) + ' ' + group).toLowerCase() });

  const TOOLS = [
    ['select', 'Select', 'V'], ['brush', 'Paint terrain', 'B'], ['rect', 'Rectangle of terrain', 'R'],
    ['room', 'Room — floor + walls', 'O'], ['edge', 'Partition — wall segments', 'K'],
    ['door', 'Door', 'D'], ['stamp', 'Prefab room', 'M'], ['prop', 'Place prop', 'P'],
    ['light', 'Light source', 'L'], ['wall', 'Solid rock', 'W'], ['erase', 'Erase objects', 'E'],
    ['pick', 'Sample terrain', 'I'], ['pan', 'Pan', 'H']
  ];
  for (const [tool, label, key] of TOOLS) add('Tool', label, key, () => setTool(tool), label);

  const PANELS = [
    ['left', 'generate', 'Generate'], ['left', 'appearance', 'Appearance & lighting'],
    ['left', 'trace', 'Trace an existing map'], ['left', 'export', 'Export'],
    ['left', 'help', 'Shortcuts & VTT notes'],
    ['right', 'tools', 'Tool options'], ['right', 'terrain', 'Terrain palette'],
    ['right', 'props', 'Props'], ['right', 'prefabs', 'Prefab rooms'], ['right', 'stats', 'Map info']
  ];
  for (const [side, name, label] of PANELS)
    add('Panel', label, '', () => ensurePanel(side, name));

  add('Map', 'Forge a new map', 'G', () => generate());
  add('Map', 'Fit map to screen', 'F', () => fitView());
  add('Map', 'Reset zoom to 100%', '0', () => {
    state.view.zoom = state.map.ppg / state.workPpg; updateZoomLabel(); paint();
  });
  add('Map', 'Undo', '⌘Z', () => undo());
  add('Map', 'Redo', '⇧⌘Z', () => redo());
  add('Map', 'Design your own prop', '', () => peOpen(null));

  if (typeof PALETTE_ORDER !== 'undefined')
    for (const id of PALETTE_ORDER) {
      const mat = MATS[id];
      if (mat) add('Terrain', 'Paint with ' + mat.label, '',
                   () => { setMaterial(id); setTool('brush'); }, mat.label);
    }

  if (typeof PROP_LIST !== 'undefined')
    for (const def of PROP_LIST)
      add('Prop', 'Place ' + def.label, '', () => {
        state.propVariant = 0; state.prop = def.key;
        setTool('prop'); buildPropPanel();
        ensurePanel('right', 'props');
      }, def.label + ' ' + def.cat);

  return out;
}

/* ---------- matching ----------
   Every letter of the query must appear in order in the command name. That
   makes "plav" find "Paint with Lava" without needing the whole word, and
   ranks a run of adjacent letters above scattered ones. */

function palScore(hay, q) {
  if (!q) return 1;
  let i = 0, score = 0, streak = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = hay.indexOf(ch, i);
    if (at < 0) return -1;
    streak = at === i ? streak + 1 : 0;
    /* Landing on the first letter of a word is what people mean by a match;
       landing mid-word is a fallback that should never outrank it. */
    const wordStart = at === 0 || hay[at - 1] === ' ';
    score += 10 + streak * 6 + (wordStart ? 25 : 0) - Math.min(at - i, 8);
    i = at + 1;
  }
  if (hay.startsWith(q)) score += 60;
  return score;
}

function palFilter(q) {
  const query = q.trim().toLowerCase().replace(/\s+/g, ' ');
  const scored = [];
  for (const item of pal.items) {
    const s = palScore(item.match, query);
    if (s >= 0) scored.push({ item, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, PAL_MAX).map(x => x.item);
}

/* ---------- rendering ---------- */

function palRender() {
  const list = document.getElementById('palList');
  list.innerHTML = '';
  if (!pal.hits.length) {
    const p = document.createElement('p');
    p.className = 'palempty';
    p.textContent = 'Nothing matches that.';
    list.appendChild(p);
    return;
  }
  pal.hits.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'palrow' + (i === pal.sel ? ' sel' : '');
    row.id = 'pal-opt-' + i;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', i === pal.sel ? 'true' : 'false');
    const g = document.createElement('span');
    g.className = 'palgroup'; g.textContent = item.group;
    const n = document.createElement('span');
    n.className = 'palname'; n.textContent = item.name;
    row.appendChild(g); row.appendChild(n);
    if (item.keys) {
      const k = document.createElement('kbd');
      k.textContent = item.keys;
      row.appendChild(k);
    }
    row.addEventListener('mousemove', () => { if (pal.sel !== i) { pal.sel = i; palRender(); } });
    row.addEventListener('click', () => palRun(i));
    list.appendChild(row);
  });
  const sel = list.children[pal.sel];
  if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  document.getElementById('palInput').setAttribute('aria-activedescendant', 'pal-opt-' + pal.sel);
}

/* ---------- open / close / run ---------- */

function palOpen() {
  if (pal.open) return;
  pal.lastFocus = document.activeElement;
  pal.items = palCommands();
  pal.hits = palFilter('');
  pal.sel = 0;
  pal.open = true;
  const box = document.getElementById('palette');
  box.classList.add('on');
  const input = document.getElementById('palInput');
  input.value = '';
  palRender();
  input.focus();
}

function palClose() {
  if (!pal.open) return;
  pal.open = false;
  document.getElementById('palette').classList.remove('on');
  /* Send focus back where it came from, so closing the palette does not dump
     a keyboard user at the top of the document. */
  if (pal.lastFocus && pal.lastFocus.focus) pal.lastFocus.focus();
}

function palRun(i) {
  const item = pal.hits[i];
  if (!item) return;
  palClose();
  try { item.run(); } catch (e) { toast('That command failed: ' + e.message, 4000); }
}

function palMove(d) {
  if (!pal.hits.length) return;
  pal.sel = (pal.sel + d + pal.hits.length) % pal.hits.length;
  palRender();
}

function initPalette() {
  const box = document.createElement('div');
  box.id = 'palette';
  box.innerHTML =
    '<div class="palscrim"></div>' +
    '<div class="palbox" role="dialog" aria-modal="true" aria-label="Command palette">' +
      '<div class="palsearch">' +
        '<i data-icon="search"></i>' +
        '<input id="palInput" type="text" role="combobox" aria-expanded="true" ' +
               'aria-controls="palList" aria-autocomplete="list" autocomplete="off" ' +
               'spellcheck="false" placeholder="Search tools, terrain, props and actions…">' +
        '<kbd>esc</kbd>' +
      '</div>' +
      '<div class="pallist" id="palList" role="listbox" aria-label="Commands"></div>' +
    '</div>';
  document.body.appendChild(box);
  if (typeof renderIcons === 'function') renderIcons(box);

  const input = document.getElementById('palInput');
  input.addEventListener('input', () => {
    pal.hits = palFilter(input.value);
    pal.sel = 0;
    palRender();
  });
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); palMove(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); palMove(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); palRun(pal.sel); }
    else if (ev.key === 'Escape') { ev.preventDefault(); palClose(); }
  });
  box.querySelector('.palscrim').addEventListener('click', palClose);

  /* Capture phase, because the app's own key handler bows out as soon as the
     focus is in a text field — and the palette's field is one. */
  window.addEventListener('keydown', ev => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      pal.open ? palClose() : palOpen();
    }
  }, true);

  const btn = document.getElementById('paletteBtn');
  if (btn) btn.addEventListener('click', palOpen);
}

initPalette();
