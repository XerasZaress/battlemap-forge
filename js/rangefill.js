/* Battlemap Forge — filled slider tracks */
'use strict';

/* WebKit will style a range input's track but will not fill the part behind
   the thumb, and half the map is tuned through these sliders — where a value
   sits in its range should be readable at a glance, not inferred from the
   thumb. So the fraction is published as a CSS variable and the track paints
   itself. Firefox has ::-moz-range-progress and ignores this. */
function paintRange(el) {
  const min = parseFloat(el.min) || 0;
  const max = el.max === '' ? 100 : parseFloat(el.max);
  const span = max - min;
  const frac = span > 0 ? (parseFloat(el.value) - min) / span : 0;
  el.style.setProperty('--fill', (Math.max(0, Math.min(1, frac)) * 100).toFixed(2) + '%');
}

function initRangeFill() {
  for (const el of document.querySelectorAll('input[type=range]')) paintRange(el);
  /* Delegated, so sliders the panels rebuild are covered too, and `change`
     catches the value being set from a loaded project rather than dragged. */
  for (const type of ['input', 'change']) {
    document.addEventListener(type, ev => {
      if (ev.target.type === 'range') paintRange(ev.target);
    }, true);
  }
}

initRangeFill();
