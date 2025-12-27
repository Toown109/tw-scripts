(function () {
  'use strict';

  const CONFIG = {
    AB_INTERVAL_SEC: 1.5,
    GLOBAL_ACTION_COOLDOWN_SEC: 1.0,
    DEBUG: true,
  };

  const KEY_LAST_ACTION = 'tw_farm_ab_last_action_ts_v4';
  const UI_ID_BAR = 'tw_farm_ab_bar_v4';

  const log = (...a) => CONFIG.DEBUG && console.log('[TW Farm A→B]', ...a);
  const warn = (...a) => console.warn('[TW Farm A→B]', ...a);

  function isOnFarmAssistant() {
    return /screen=am_farm/.test(location.href);
  }

  function getLastActionTs() {
    const v = parseInt(localStorage.getItem(KEY_LAST_ACTION) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }
  function setLastActionTs(ts) {
    localStorage.setItem(KEY_LAST_ACTION, String(ts));
  }
  function actionCooldownMsLeft() {
    const last = getLastActionTs();
    const need = CONFIG.GLOBAL_ACTION_COOLDOWN_SEC * 1000;
    return Math.max(0, (last + need) - Date.now());
  }

  function flashMessage(text) {
    try {
      if (window.UI && typeof window.UI.SuccessMessage === 'function') { window.UI.SuccessMessage(text); return; }
      if (window.UI && typeof window.UI.ErrorMessage === 'function') { window.UI.ErrorMessage(text); return; }
    } catch (_) {}
    // fallback zonder alert-spam
    console.log(text);
  }

  // --- ROBUUSTE row finder: meerdere mogelijke layouts ---
  function getFarmRows() {
    // 1) klassieke: grootste table.vis
    const tables = Array.from(document.querySelectorAll('table.vis'));
    let best = null;
    for (const t of tables) {
      const r = t.querySelectorAll('tbody tr').length;
      if (!best || r > best.r) best = { t, r };
    }
    if (best && best.r > 0) {
      const rows = Array.from(best.t.querySelectorAll('tbody tr')).filter(r => r.querySelector('a,button'));
      if (rows.length) return rows;
    }

    // 2) fallback: alle rijen die A/B/C knoppen lijken te hebben
    const allRows = Array.from(document.querySelectorAll('tr')).filter(tr => tr.querySelector('a,button'));
    // heuristiek: rijen met 3 actieknoppen
    const likely = allRows.filter(tr => tr.querySelectorAll('a,button').length >= 3);
    return likely;
  }

  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }
  function normalizeText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function findABCButtons(row) {
    const clickables = Array.from(row.querySelectorAll('a,button')).filter(isVisible);

    function matchByLabel(letter) {
      const re = new RegExp(`\\b${letter}\\b`, 'i');
      return clickables.find(el => {
        const t = normalizeText(el.textContent);
        const title = normalizeText(el.getAttribute('title'));
        const aria = normalizeText(el.getAttribute('aria-label'));
        return re.test(t) || re.test(title) || re.test(aria);
      }) || null;
    }

    let A = matchByLabel('A');
    let B = matchByLabel('B');
    let C = matchByLabel('C');

    // fallback: first 3
    const firstThree = clickables.slice(0, 3);
    A = A || firstThree[0] || null;
    B = B || firstThree[1] || null;
    C = C || firstThree[2] || null;

    return { A, B, C };
  }

  let hoveredRow = null;

  function attachHover() {
    const rows = getFarmRows();
    rows.forEach(row => {
      row.addEventListener('mouseenter', () => { hoveredRow = row; });
      row.addEventListener('mouseleave', () => { if (hoveredRow === row) hoveredRow = null; });
    });
  }

  function markRow(row, kind) {
    row.style.transition = 'background 120ms ease';
    if (kind === 'A') row.style.background = 'rgba(0, 200, 255, 0.10)';
    if (kind === 'AB') row.style.background = 'rgba(0, 255, 0, 0.10)';
  }

  function ensureBar() {
    if (document.getElementById(UI_ID_BAR)) return;

    const bar = document.createElement('div');
    bar.id = UI_ID_BAR;
    bar.style.position = 'sticky';
    bar.style.top = '0';
    bar.style.zIndex = '99999';
    bar.style.padding = '8px';
    bar.style.marginBottom = '6px';
    bar.style.border = '1px solid rgba(0,0,0,0.15)';
    bar.style.background = 'rgba(255,255,255,0.95)';
    bar.style.backdropFilter = 'blur(4px)';
    bar.style.fontSize = '13px';

    bar.innerHTML = `
      <b>Farm A→B</b> — hover rij + <b>Enter</b> (1×) of klik knop.
      <span id="tw_ab_status" style="margin-left:10px;opacity:0.75;"></span>
      <button id="tw_ab_do" style="margin-left:10px;padding:2px 10px;">A→B</button>
      <span id="tw_ab_rows" style="margin-left:10px;opacity:0.65;"></span>
    `;

    (document.querySelector('#content_value') || document.body).prepend(bar);

    bar.querySelector('#tw_ab_do').addEventListener('click', () => {
      if (!hoveredRow) return;
      doAthenB(hoveredRow);
    });

    function tick() {
      const left = actionCooldownMsLeft();
      const rows = getFarmRows().length;
      bar.querySelector('#tw_ab_status').textContent =
        left > 0 ? `cooldown: ${(left/1000).toFixed(1)}s` : 'ready';
      bar.querySelector('#tw_ab_rows').textContent = `rows: ${rows}`;
      requestAnimationFrame(tick);
    }
    tick();

    flashMessage('Farm A→B geladen ✔ (debug balk zichtbaar)');
    log('UI injected');
  }

  function doAthenB(row) {
    if (actionCooldownMsLeft() > 0) return;

    const { A, B } = findABCButtons(row);
    if (!A || !B) {
      warn('A/B niet gevonden op rij', row);
      flashMessage('A/B niet gevonden op deze rij (layout afwijkend).');
      return;
    }

    setLastActionTs(Date.now());

    log('Click A');
    A.click();
    markRow(row, 'A');

    window.setTimeout(() => {
      try {
        log('Click B');
        B.click();
        markRow(row, 'AB');
        setLastActionTs(Date.now());
      } catch (e) {
        warn('B click failed', e);
      }
    }, CONFIG.AB_INTERVAL_SEC * 1000);
  }

  function attachEnterKey() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key !== 'Enter') return;

      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (!hoveredRow) return;
      doAthenB(hoveredRow);
    });
    log('Enter handler attached');
  }

  function init() {
    if (!isOnFarmAssistant()) {
      flashMessage('Open eerst Farm Assistant (am_farm) en klik dan opnieuw op de quickbar.');
      return;
    }

    // BELANGRIJK: injecteer UI meteen (zodat je ziet dat hij draait)
    ensureBar();
    attachHover();
    attachEnterKey();
  }

  init();
})();
