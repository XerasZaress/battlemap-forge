/* Battlemap Forge — hover tooltips for the icon rails and the prop grid */
'use strict';

/* The native `title` tooltip takes about a second to appear and comes in the
   OS chrome, which reads as a different application than the rest of the UI.
   These containers hold nothing but icons, so the label is the only way to
   know what a button does — it should arrive quickly and look like us. */
const TIP_SELECTOR = '.rail, #propGrid, #propVariants';
const TIP_DELAY = 150;

const tipState = { el: null, target: null, timer: 0 };

function tipNode() {
  if (!tipState.el) {
    tipState.el = document.createElement('div');
    tipState.el.className = 'tooltip';
    document.body.appendChild(tipState.el);
  }
  return tipState.el;
}

/** The label lives in `title` until first hover, then moves to `data-tip` so
    the browser stops drawing its own tooltip over ours. On an icon-only
    control `title` may be the only accessible name it has, and removing it
    would leave a screen reader with nothing to announce — so the name is
    copied to `aria-label` first, unless the control already carries one. */
function tipTextFor(el) {
  if (el.dataset.tip == null && el.title) {
    el.dataset.tip = el.title;
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) {
      el.setAttribute('aria-label', el.title);
    }
    el.removeAttribute('title');
  }
  return el.dataset.tip || '';
}

function showTip(target) {
  const text = tipTextFor(target);
  if (!text) return;
  const tip = tipNode();
  tip.textContent = text;
  tip.classList.add('show');

  /* Rail icons are a vertical strip, so the label goes beside them and flips
     when the window edge is nearer than the label is wide — the right rail
     always flips. Grid cells sit shoulder to shoulder, so a label beside one
     would cover its neighbour; those get it underneath instead. */
  /* offsetWidth/Height, not the bounding rect: the tooltip scales up as it
     fades in, and a rect measured mid-transition would place it a pixel or
     two off. */
  const r = target.getBoundingClientRect();
  const t = { width: tip.offsetWidth, height: tip.offsetHeight };
  const gap = 8;
  let x, y;
  if (target.closest('.rail')) {
    x = r.right + gap;
    if (x + t.width > window.innerWidth - 4) x = r.left - gap - t.width;
    y = r.top + (r.height - t.height) / 2;
  } else {
    x = r.left + (r.width - t.width) / 2;
    y = r.bottom + gap;
    if (y + t.height > window.innerHeight - 4) y = r.top - gap - t.height;
  }
  x = Math.max(4, Math.min(x, window.innerWidth - t.width - 4));
  y = Math.max(4, Math.min(y, window.innerHeight - t.height - 4));
  tip.style.left = Math.round(x) + 'px';
  tip.style.top = Math.round(y) + 'px';
}

function hideTip() {
  clearTimeout(tipState.timer);
  tipState.timer = 0;
  tipState.target = null;
  if (tipState.el) tipState.el.classList.remove('show');
}

function initTooltips() {
  document.addEventListener('mouseover', ev => {
    const host = ev.target.closest && ev.target.closest(TIP_SELECTOR);
    const target = host && ev.target.closest('button, .propcell, .raillogo');
    if (!target || target === tipState.target) return;
    hideTip();
    tipState.target = target;
    tipState.timer = setTimeout(() => showTip(target), TIP_DELAY);
  });

  document.addEventListener('mouseout', ev => {
    if (!tipState.target) return;
    const to = ev.relatedTarget;
    if (to && tipState.target.contains(to)) return;
    hideTip();
  });

  /* A tooltip left hanging over a panel that moved out from under it looks
     like a rendering bug, so anything that shifts the layout dismisses it. */
  document.addEventListener('mousedown', hideTip, true);
  document.addEventListener('keydown', hideTip, true);
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('blur', hideTip);
}

initTooltips();
