/* FarmGod – Quickbar-safe version (desktop)
 * - Works when started from TW Quickbar on ANY screen
 * - If not on am_farm: redirects and autoruns
 * - On am_farm: shows popup immediately, then loads options & planning
 * - Manual sending only (click/Enter). Arrival column is info-only.
 */

(function () {
  'use strict';

  // ---------- Quickbar bootstrap ----------
  const AUTORUN_KEY = 'FarmGod_autorun';

  // Some TW contexts don't have ScriptAPI available; don't crash on it.
  try {
    if (typeof ScriptAPI !== 'undefined' && ScriptAPI.register) {
      ScriptAPI.register('FarmGod', true, 'Warre', 'nl.tribalwars@coma.innogames.de');
    }
  } catch (_) {}

  // Basic sanity
  if (typeof game_data === 'undefined') {
    console.error('FarmGod: game_data missing – wrong context?');
    return;
  }

  // Redirect to am_farm when started from anywhere else
  if (game_data.screen !== 'am_farm') {
    try {
      localStorage.setItem(AUTORUN_KEY, '1');
    } catch (_) {}
    // same tab redirect
    location.href = (game_data.link_base_pure || '/game.php?') + 'am_farm';
    return;
  }

  // On am_farm: run only once per load unless user triggers again
  const shouldAutorun = (() => {
    try {
      return localStorage.getItem(AUTORUN_KEY) === '1';
    } catch (_) {
      return true; // best effort
    }
  })();

  try {
    localStorage.removeItem(AUTORUN_KEY);
  } catch (_) {}

  // ---------- Helpers ----------
  const safeNum = (x, def = 0) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : def;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const formatArrival = (arrivalSeconds) => {
    const d = new Date(arrivalSeconds * 1000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
      d.getMinutes()
    )}:${pad2(d.getSeconds())}`;
  };

  // ---------- twLib with FIXED queue selection ----------
  if (typeof window.twLib === 'undefined') {
    window.twLib = {
      queues: null,
      init() {
        if (this.queues === null) this.queues = this.queueLib.createQueues(5);
      },
      queueLib: {
        maxAttempts: 3,
        Item(action, arg, promise = null) {
          this.action = action;
          this.arguments = arg;
          this.promise = promise;
          this.attempts = 0;
        },
        Queue() {
          this.list = [];
          this.working = false;
          this.length = 0;

          this.dequeue = function () {
            this.length -= 1;
            return this.list.shift();
          };

          this.enqueue = function (item, front = false) {
            front ? this.list.unshift(item) : this.list.push(item);
            this.length += 1;
            if (!this.working) this.start();
          };

          this.doNext = function () {
            const item = this.dequeue();
            const self = this;
            if (!item) return self.start();

            if (item.action === 'openWindow') {
              window.open(...item.arguments)?.addEventListener('DOMContentLoaded', function () {
                self.start();
              });
              return;
            }

            const fn = $[item.action];
            if (typeof fn !== 'function') {
              item.promise?.reject?.('Unknown jQuery action: ' + item.action);
              return self.start();
            }

            fn(...item.arguments)
              .done(function () {
                item.promise?.resolve?.apply(null, arguments);
                self.start();
              })
              .fail(function () {
                item.attempts += 1;
                if (item.attempts < twLib.queueLib.maxAttempts) self.enqueue(item, true);
                else item.promise?.reject?.apply(null, arguments);
                self.start();
              });
          };

          this.start = function () {
            if (this.length) {
              this.working = true;
              this.doNext();
            } else {
              this.working = false;
            }
          };
        },
        createQueues(amount) {
          const arr = [];
          for (let i = 0; i < amount; i++) arr[i] = new twLib.queueLib.Queue();
          return arr;
        },
        addItem(item) {
          // FIX: pick queue index with minimum length
          const lengths = twLib.queues.map((q) => q.length);
          let minIdx = 0;
          for (let i = 1; i < lengths.length; i++) if (lengths[i] < lengths[minIdx]) minIdx = i;
          twLib.queues[minIdx].enqueue(item);
        },
        orchestrator(type, arg) {
          const promise = $.Deferred();
          const item = new twLib.queueLib.Item(type, arg, promise);
          twLib.queueLib.addItem(item);
          return promise;
        },
      },
      ajax() {
        return twLib.queueLib.orchestrator('ajax', arguments);
      },
      get() {
        return twLib.queueLib.orchestrator('get', arguments);
      },
      post() {
        return twLib.queueLib.orchestrator('post', arguments);
      },
    };
    window.twLib.init();
  }

  // ---------- Translation (NL + INT) ----------
  const t = (function () {
    const msg = {
      nl_NL: {
        missingFeatures: 'Script vereist een premium account en farm assistent!',
        options: {
          title: 'FarmGod Opties',
          group: 'Uit welke groep moet er gefarmd worden:',
          distance: 'Maximaal aantal velden dat farms mogen lopen:',
          time: 'Hoe veel tijd in minuten moet er tussen farms zitten:',
          maxRows: 'Max aantal farms per dorp (klik-batch):',
          losses: 'Verstuur farm naar dorpen met gedeeltelijke verliezen:',
          maxloot: 'Verstuur een B farm als de buit vorige keer vol was:',
          newbarbs: 'Voeg nieuwe barbarendorpen toe om te farmen:',
          button: 'Plan farms',
          replan: 'Plan opnieuw',
        },
        table: {
          noFarmsPlanned: 'Er kunnen met de opgegeven instellingen geen farms verstuurd worden.',
          origin: 'Oorsprong',
          target: 'Doel',
          fields: 'Velden',
          arrival: 'Aankomst (info)',
          farm: 'Farm',
          goTo: 'Ga naar',
        },
        messages: {
          villageChanged: 'Succesvol van dorp veranderd!',
          villageError: 'Alle farms voor het huidige dorp zijn reeds verstuurd!',
          sendError: 'Error: farm niet verstuurd!',
        },
      },
      int: {
        missingFeatures: 'Script requires a premium account and loot assistent!',
        options: {
          title: 'FarmGod Options',
          group: 'Send farms from group:',
          distance: 'Maximum fields for farms:',
          time: 'How much time in minutes should there be between farms:',
          maxRows: 'Max farms per village (click batch):',
          losses: 'Send farm to villages with partial losses:',
          maxloot: 'Send a B farm if the last loot was full:',
          newbarbs: 'Add new barbs to farm:',
          button: 'Plan farms',
          replan: 'Replan',
        },
        table: {
          noFarmsPlanned: 'No farms can be sent with the specified settings.',
          origin: 'Origin',
          target: 'Target',
          fields: 'fields',
          arrival: 'Arrival (info)',
          farm: 'Farm',
          goTo: 'Go to',
        },
        messages: {
          villageChanged: 'Successfully changed village!',
          villageError: 'All farms for the current village have been sent!',
          sendError: 'Error: farm not sent!',
        },
      },
    };
    return msg[game_data.locale] || msg.int;
  })();

  // ---------- Hard requirement checks ----------
  // If you don't have these, original script also can't operate.
  try {
    if (!(game_data?.features?.Premium?.active && game_data?.features?.FarmAssistent?.active)) {
      UI.ErrorMessage(t.missingFeatures);
      return;
    }
  } catch (_) {
    // If game_data.features is missing, safest stop
    return;
  }

  // ---------- Library: units speeds, parsing, time ----------
  const getUnitSpeeds = () => {
    try {
      const raw = localStorage.getItem('FarmGod_unitSpeeds');
      return raw ? JSON.parse(raw) : false;
    } catch (_) {
      return false;
    }
  };

  const setUnitSpeeds = () => {
    const unitSpeeds = {};
    return $.get('/interface.php?func=get_unit_info').then((xml) => {
      $(xml)
        .find('config')
        .children()
        .each((_, el) => {
          const name = $(el).prop('nodeName');
          unitSpeeds[name] = safeNum($(el).find('speed').text(), 0);
        });
      localStorage.setItem('FarmGod_unitSpeeds', JSON.stringify(unitSpeeds));
      return unitSpeeds;
    });
  };

  if (!getUnitSpeeds()) setUnitSpeeds();

  // Safe prototypes (used by original code)
  String.prototype.toCoord = function (objectified) {
    const c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
    if (!c) return false;
    return objectified ? { x: c.split('|')[0], y: c.split('|')[1] } : c;
  };
  String.prototype.toNumber = function () {
    return safeNum(this);
  };
  Number.prototype.toNumber = function () {
    return safeNum(this);
  };

  const getDistance = (origin, target) => {
    const o = origin.toCoord(true);
    const ta = target.toCoord(true);
    const a = safeNum(o.x) - safeNum(ta.x);
    const b = safeNum(o.y) - safeNum(ta.y);
    return Math.hypot(a, b);
  };

  const subtractArrays = (a1, a2) => {
    const res = a1.map((v, i) => v - a2[i]);
    return res.some((v) => v < 0) ? false : res;
  };

  const getCurrentServerTime = () => {
    const m = ($('#serverTime').closest('p').text().match(/\d+/g) || []).map((x) => safeNum(x));
    if (m.length < 6) return Date.now();
    const [hour, min, sec, day, month, year] = m;
    return new Date(year, month - 1, day, hour, min, sec).getTime();
  };

  const timestampFromString = (timestr) => {
    let d = ($('#serverDate').text().split('/') || []).map((x) => safeNum(x));
    if (d.length < 3) return Date.now();

    const todayKey = 'aea2b0aa9ae1534226518faaefffdaad';
    const tomorrowKey = '57d28d1b211fddbb7a499ead5bf23079';
    const laterKey = '0cb274c906d622fa8ce524bcfbb7552d';

    const todayPattern = new RegExp((window.lang[todayKey] || '%s').replace('%s', '([\\d+|:]+)')).exec(timestr);
    const tomorrowPattern = new RegExp((window.lang[tomorrowKey] || '%s').replace('%s', '([\\d+|:]+)')).exec(timestr);
    const laterDatePattern = new RegExp(
      (window.lang[laterKey] || '%1 %2').replace('%1', '([\\d+|\\.]+)').replace('%2', '([\\d+|:]+)')
    ).exec(timestr);

    let tParts, date;
    if (todayPattern) {
      tParts = todayPattern[1].split(':').map((x) => safeNum(x));
      date = new Date(d[2], d[1] - 1, d[0], tParts[0], tParts[1], tParts[2], tParts[3] || 0);
    } else if (tomorrowPattern) {
      tParts = tomorrowPattern[1].split(':').map((x) => safeNum(x));
      date = new Date(d[2], d[1] - 1, d[0] + 1, tParts[0], tParts[1], tParts[2], tParts[3] || 0);
    } else if (laterDatePattern) {
      const dd = (laterDatePattern[1] + d[2]).split('.').map((x) => safeNum(x));
      tParts = laterDatePattern[2].split(':').map((x) => safeNum(x));
      date = new Date(dd[2], dd[1] - 1, dd[0], tParts[0], tParts[1], tParts[2], tParts[3] || 0);
    } else {
      date = new Date();
    }
    return date.getTime();
  };

  // ---------- Page processing (multi-page) ----------
  const determineNextPage = (page, $html) => {
    const isFarm = $html.find('#am_widget_Farm').length > 0;
    const navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();

    let navLength = 0;
    if (isFarm) {
      const $nav = $html.find('#plunder_list_nav').first();
      const $items = $nav.find('a.paged-nav-item, strong.paged-nav-item');
      if ($items.length) {
        const lastText = $items.last().text() || '';
        navLength = safeNum(lastText.replace(/\D/g, ''), 0) - 1;
      }
    } else if (navSelect.length > 0) {
      navLength = navSelect.find('option').length - 1;
    } else {
      navLength = $html.find('.paged-nav-item').not('[href*="page=-1"]').length;
    }

    const pageSize = $('#mobileHeader').length > 0 ? 10 : safeNum($html.find('input[name="page_size"]').val(), 25);
    const villageLength =
      $html.find('#scavenge_mass_screen').length > 0
        ? $html.find('tr[id*="scavenge_village"]').length
        : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;

    if (page === -1 && villageLength === 1000) return Math.floor(1000 / pageSize);
    if (page < navLength) return page + 1;
    return false;
  };

  const processPage = (url, page, wrapFn) => {
    const pageText = url.match('am_farm') ? `&Farm_page=${page}` : `&page=${page}`;
    return twLib.ajax({ url: url + pageText }).then((html) => wrapFn(page, $(html)));
  };

  const processAllPages = (url, processorFn) => {
    const startPage = url.match('am_farm') ? 0 : -1;
    const wrapFn = (p, $html) => {
      const next = determineNextPage(p, $html);
      processorFn($html);
      if (next !== false) return processPage(url, next, wrapFn);
      return true;
    };
    return processPage(url, startPage, wrapFn);
  };

  // ---------- UI popup (ALWAYS show first) ----------
  const showLoadingPopup = () => {
    const loadingHtml = `
      <style>#popup_box_FarmGod{text-align:center;width:600px;}</style>
      <h3>${t.options.title}</h3>
      <div class="optionsContent" style="padding:10px;">
        ${UI.Throbber[0].outerHTML}<br><br>
        <small>Opties laden…</small>
      </div>`;
    Dialog.show('FarmGod', loadingHtml);
  };

  // ---------- Options ----------
  const buildGroupSelect = (id) => {
    return $.get(TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })).then((groups) => {
      let html = `<select class="optionGroup">`;
      (groups?.result || []).forEach((val) => {
        if (val.type === 'separator') html += `<option disabled=""/>`;
        else html += `<option value="${val.group_id}" ${val.group_id == id ? 'selected' : ''}>${val.name}</option>`;
      });
      html += `</select>`;
      return html;
    });
  };

  const buildOptionsHtml = () => {
    const options =
      JSON.parse(localStorage.getItem('farmGod_options') || 'null') || {
        optionGroup: 0,
        optionDistance: 25,
        optionTime: 10,
        optionMaxRows: 60,
        optionLosses: false,
        optionMaxloot: true,
        optionNewbarbs: true,
      };

    return buildGroupSelect(options.optionGroup).then((groupSelect) => {
      return `
        <style>#popup_box_FarmGod{text-align:center;width:600px;}</style>
        <h3>${t.options.title}</h3><br>
        <div class="optionsContent">
          <div style="width:90%;margin:auto;background: url('graphic/index/main_bg.jpg') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;border-spacing: 0px !important;">
            <table class="vis" style="width:100%;text-align:left;font-size:11px;">
              <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
              <tr><td>${t.options.distance}</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance}"></td></tr>
              <tr><td>${t.options.time}</td><td><input type="text" size="5" class="optionTime" value="${options.optionTime}"></td></tr>
              <tr><td>${t.options.maxRows}</td><td><input type="text" size="5" class="optionMaxRows" value="${options.optionMaxRows || 60}"></td></tr>
              <tr><td>${t.options.losses}</td><td><input type="checkbox" class="optionLosses" ${options.optionLosses ? 'checked' : ''}></td></tr>
              <tr><td>${t.options.maxloot}</td><td><input type="checkbox" class="optionMaxloot" ${options.optionMaxloot ? 'checked' : ''}></td></tr>
              ${
                game_data.market == 'nl'
                  ? `<tr><td>${t.options.newbarbs}</td><td><input type="checkbox" class="optionNewbarbs" ${options.optionNewbarbs ? 'checked' : ''}></td></tr>`
                  : ''
              }
            </table>
          </div>
          <br>
          <input type="button" class="btn optionButton" value="${t.options.button}">
        </div>`;
    });
  };

  // ---------- Data gathering ----------
  const getData = (group, newbarbs, losses) => {
    const data = { villages: {}, commands: {}, farms: { templates: {}, farms: {} } };
    const skipUnits = ['ram', 'catapult', 'knight', 'snob', 'militia'];

    const villagesProcessor = ($html) => {
      $html
        .find('#combined_table')
        .find('.row_a, .row_b')
        .filter((_, el) => $(el).find('.bonus_icon_33').length === 0)
        .each((_, el) => {
          const $el = $(el);
          const $qel = $el.find('.quickedit-label').first();
          const coord = ($qel.text() || '').toCoord();
          if (!coord) return;

          const units = $el
            .find('.unit-item')
            .filter((idx) => skipUnits.indexOf(game_data.units[idx]) === -1)
            .map((_, element) => safeNum($(element).text(), 0))
            .get();

          data.villages[coord] = {
            name: $qel.data('text') || $qel.text(),
            id: safeNum($el.find('.quickedit-vn').first().data('id'), 0),
            units,
          };
        });
    };

    const commandsProcessor = ($html) => {
      $html
        .find('#commands_table')
        .find('.row_a, .row_ax, .row_b, .row_bx')
        .each((_, el) => {
          const $el = $(el);
          const coord = ($el.find('.quickedit-label').first().text() || '').toCoord();
          if (!coord) return;
          if (!data.commands[coord]) data.commands[coord] = [];
          data.commands[coord].push(Math.round(timestampFromString($el.find('td').eq(2).text().trim()) / 1000));
        });
    };

    const farmProcessor = ($html) => {
      if ($.isEmptyObject(data.farms.templates)) {
        const unitSpeeds = getUnitSpeeds() || {};
        $html
          .find('form[action*="action=edit_all"]')
          .find('input[type="hidden"][name*="template"]')
          .closest('tr')
          .each((_, el) => {
            const $el = $(el);
            const cls = $el.prev('tr').find('a.farm_icon').first().attr('class') || '';
            const m = cls.match(/farm_icon_(.*)\s/);
            if (!m) return;

            const name = (m[1] || '').toLowerCase();
            const units = $el
              .find('input[type="text"], input[type="number"]')
              .map((_, input) => safeNum($(input).val(), 0))
              .get();

            const speeds = $el
              .find('input[type="text"], input[type="number"]')
              .map((_, input) => {
                const v = safeNum($(input).val(), 0);
                if (v <= 0) return 0;
                const unitName = (($(input).attr('name') || '').trim().split('[')[0]) || '';
                return safeNum(unitSpeeds[unitName], 0);
              })
              .get();

            data.farms.templates[name] = {
              id: safeNum(
                $el.find('input[type="hidden"][name*="template"][name*="[id]"]').first().val(),
                0
              ),
              units,
              speed: Math.max(...speeds, 0),
            };
          });
      }

      $html
        .find('#plunder_list')
        .find('tr[id^="village_"]')
        .each((_, el) => {
          const $el = $(el);
          const coord = ($el.find('a[href*="screen=report&mode=all&view="]').first().text() || '').toCoord();
          if (!coord) return;

          const dot = $el.find('img[src*="graphic/dots/"]').attr('src') || '';
          const colorMatch = dot.match(/dots\/(green|yellow|red|blue|red_blue)/);
          const color = colorMatch ? colorMatch[1] : undefined;

          data.farms.farms[coord] = {
            id: safeNum(($el.attr('id') || '').split('_')[1], 0),
            color,
            max_loot: $el.find('img[src*="max_loot/1"]').length > 0,
          };
        });
    };

    const findNewbarbs = () => {
      if (!newbarbs) return Promise.resolve(true);
      return twLib.get('/map/village.txt').then((txt) => {
        (txt.match(/[^\r\n]+/g) || []).forEach((row) => {
          const parts = row.split(',');
          if (parts.length < 5) return;
          const [id, name, x, y, player_id] = parts;
          const coord = `${x}|${y}`;
          if (safeNum(player_id, -1) === 0 && !data.farms.farms[coord]) {
            data.farms.farms[coord] = { id: safeNum(id, 0) };
          }
        });
        return true;
      });
    };

    const filterFarms = () => {
      data.farms.farms = Object.fromEntries(
        Object.entries(data.farms.farms).filter(([_, val]) => {
          if (!val.color) return true;
          if (val.color === 'red' || val.color === 'red_blue') return false;
          if (val.color === 'yellow' && !losses) return false;
          return true;
        })
      );
      return data;
    };

    return Promise.all([
      processAllPages(
        TribalWars.buildURL('GET', 'overview_villages', { mode: 'combined', group }),
        villagesProcessor
      ),
      processAllPages(
        TribalWars.buildURL('GET', 'overview_villages', { mode: 'commands', type: 'attack' }),
        commandsProcessor
      ),
      processAllPages(TribalWars.buildURL('GET', 'am_farm'), farmProcessor),
      findNewbarbs(),
    ]).then(() => filterFarms());
  };

  // ---------- Planning ----------
  const createPlanning = (optionDistance, optionTime, optionMaxloot, optionMaxRows, data) => {
    const plan = { counter: 0, farms: {} };
    const serverTime = Math.round(getCurrentServerTime() / 1000);
    const maxTimeDiff = Math.round(optionTime * 60);

    // Need templates a/b
    if (!data.farms.templates.a || !data.farms.templates.b) {
      console.warn('FarmGod: template A/B not found. Found:', Object.keys(data.farms.templates));
    }

    for (const originCoord in data.villages) {
      const origin = data.villages[originCoord];
      let planned = 0;

      const ordered = Object.keys(data.farms.farms)
        .map((coord) => ({ coord, dis: getDistance(originCoord, coord) }))
        .sort((x, y) => x.dis - y.dis);

      for (let i = 0; i < ordered.length && planned < optionMaxRows; i++) {
        const targetCoord = ordered[i].coord;
        const distance = ordered[i].dis;

        if (!(distance < optionDistance)) break; // sorted, so break

        const farmIndex = data.farms.farms[targetCoord];
        const templateName =
          optionMaxloot && farmIndex?.max_loot ? 'b' : 'a';
        const template = data.farms.templates[templateName];
        if (!template) continue;

        const unitsLeft = subtractArrays(origin.units, template.units);
        if (!unitsLeft) continue;

        const arrival = Math.round(serverTime + distance * template.speed * 60 + Math.round(plan.counter / 5));

        if (!data.commands[targetCoord]) data.commands[targetCoord] = [];
        let ok = true;

        if (!farmIndex?.color && data.commands[targetCoord].length > 0) ok = false;

        if (ok) {
          for (const ts of data.commands[targetCoord]) {
            if (Math.abs(ts - arrival) < maxTimeDiff) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;

        plan.counter++;
        planned++;
        if (!plan.farms[originCoord]) plan.farms[originCoord] = [];

        plan.farms[originCoord].push({
          origin: { coord: originCoord, name: origin.name, id: origin.id },
          target: { coord: targetCoord, id: farmIndex.id },
          fields: distance,
          arrival_ts: arrival,
          arrival_str: formatArrival(arrival),
          template: { name: templateName, id: template.id },
        });

        origin.units = unitsLeft;
        data.commands[targetCoord].push(arrival);
      }
    }

    return plan;
  };

  // ---------- Table & sending ----------
  let curVillage = null;
  let farmBusy = false;

  const focusNextRow = () => {
    $('.farmGodNext').removeClass('farmGodNext');
    const $next = $('.farmGod_icon').first();
    if (!$next.length) return;
    $next.addClass('farmGodNext');

    try {
      $next.get(0).scrollIntoView(true); // max compatibility
    } catch (_) {
      try {
        $(window).scrollTop($next.offset().top - 200);
      } catch (_) {}
    }
  };

  const sendFarm = ($icon) => {
    const n = Timing.getElapsedTimeSinceLoad();
    if (farmBusy) return;
    if (Accountmanager.farm.last_click && n - Accountmanager.farm.last_click < 200) return;

    farmBusy = true;
    Accountmanager.farm.last_click = n;

    $icon.css({ pointerEvents: 'none', opacity: 0.6 });

    const $pb = $('#FarmGodProgessbar');

    TribalWars.post(
      Accountmanager.send_units_link.replace(/village=(\d+)/, 'village=' + $icon.data('origin')),
      null,
      { target: $icon.data('target'), template_id: $icon.data('template'), source: $icon.data('origin') },
      function (r) {
        UI.SuccessMessage(r.success);
        $pb.data('current', ($pb.data('current') || 0) + 1);
        UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max') || 0);
        $icon.closest('.farmRow').remove();
        farmBusy = false;
        focusNextRow();
      },
      function (r) {
        UI.ErrorMessage(r || t.messages.sendError);
        $pb.data('current', ($pb.data('current') || 0) + 1);
        UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max') || 0);
        $icon.closest('.farmRow').remove();
        farmBusy = false;
        focusNextRow();
      }
    );
  };

  const bindHandlers = () => {
    $('.farmGod_icon')
      .off('click')
      .on('click', function (e) {
        e.preventDefault();
        if (game_data.market !== 'nl' || $(this).data('origin') == curVillage) sendFarm($(this));
        else UI.ErrorMessage(t.messages.villageError);
      });

    // Enter keeps sending next row
    $(document)
      .off('keydown.farmgod')
      .on('keydown.farmgod', (event) => {
        const code = event.keyCode || event.which;
        if (code === 13) $('.farmGod_icon').first().trigger('click');
      });

    $('.switchVillage')
      .off('click')
      .on('click', function () {
        curVillage = $(this).data('id');
        UI.SuccessMessage(t.messages.villageChanged);
        $(this).closest('tr').remove();
      });

    $(document)
      .off('click.farmgodReplan')
      .on('click.farmgodReplan', '.farmGodReplan', () => {
        // just re-run planning with saved options
        runPlanning(true);
      });
  };

  const buildTable = (plan) => {
    let html = `
      <div class="vis farmGodContent">
        <style>
          .farmGodNext{outline:2px solid #92c200; outline-offset:2px;}
          .farmGodActions{display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-bottom:6px;}
        </style>

        <div class="farmGodActions">
          <input type="button" class="btn farmGodReplan" value="${t.options.replan}">
        </div>

        <h4>FarmGod</h4>
        <table class="vis" width="100%">
          <tr>
            <div id="FarmGodProgessbar" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;">
              <div style="background: rgb(146, 194, 0);"></div>
              <span class="label" style="margin-top:0px;"></span>
            </div>
          </tr>
          <tr>
            <th style="text-align:center;">${t.table.origin}</th>
            <th style="text-align:center;">${t.table.target}</th>
            <th style="text-align:center;">${t.table.fields}</th>
            <th style="text-align:center;">${t.table.arrival}</th>
            <th style="text-align:center;">${t.table.farm}</th>
          </tr>`;

    if (!plan || $.isEmptyObject(plan)) {
      html += `<tr><td colspan="5" style="text-align:center;">${t.table.noFarmsPlanned}</td></tr></table></div>`;
      return html;
    }

    for (const originCoord in plan) {
      const rows = plan[originCoord];
      if (!rows?.length) continue;

      if (game_data.market == 'nl') {
        html += `<tr><td colspan="5" style="background:#e7d098;">
          <input type="button" class="btn switchVillage" data-id="${rows[0].origin.id}"
            value="${t.table.goTo} ${rows[0].origin.name} (${rows[0].origin.coord})" style="float:right;">
        </td></tr>`;
      }

      rows.forEach((val, i) => {
        html += `<tr class="farmRow row_${i % 2 === 0 ? 'a' : 'b'}">
          <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord})</a></td>
          <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.target.id}">${val.target.coord}</a></td>
          <td style="text-align:center;">${val.fields.toFixed(2)}</td>
          <td style="text-align:center;">${val.arrival_str}</td>
          <td style="text-align:center;">
            <a href="#" class="farmGod_icon farm_icon farm_icon_${val.template.name}"
               data-origin="${val.origin.id}" data-target="${val.target.id}" data-template="${val.template.id}"
               style="margin:auto;"></a>
          </td>
        </tr>`;
      });
    }

    html += `</table></div>`;
    return html;
  };

  // ---------- Planning run ----------
  const runPlanning = (fromReplan) => {
    const optionGroup = safeNum($('.optionGroup').val(), 0);
    const optionDistance = safeNum($('.optionDistance').val(), 25);
    const optionTime = safeNum($('.optionTime').val(), 10);
    let optionMaxRows = parseInt($('.optionMaxRows').val(), 10);
    if (!Number.isFinite(optionMaxRows) || optionMaxRows < 1) optionMaxRows = 60;

    const optionLosses = !!$('.optionLosses').prop('checked');
    const optionMaxloot = !!$('.optionMaxloot').prop('checked');
    const optionNewbarbs = !!$('.optionNewbarbs').prop('checked');

    const optionsToStore = {
      optionGroup,
      optionDistance,
      optionTime,
      optionMaxRows,
      optionLosses,
      optionMaxloot,
      optionNewbarbs,
    };
    localStorage.setItem('farmGod_options', JSON.stringify(optionsToStore));

    // show throbber in popup while planning
    if (!fromReplan) {
      $('.optionsContent').html(UI.Throbber[0].outerHTML + '<br><br>');
    } else {
      $('.farmGodContent').prepend(`<div style="text-align:center;margin:8px 0;">${UI.Throbber[0].outerHTML}</div>`);
    }

    return getData(optionGroup, optionNewbarbs, optionLosses).then((data) => {
      try {
        Dialog.close();
      } catch (_) {}

      const plan = createPlanning(optionDistance, optionTime, optionMaxloot, optionMaxRows, data);

      $('.farmGodContent').remove();
      $('#am_widget_Farm').first().before(buildTable(plan.farms));

      bindHandlers();
      UI.InitProgressBars();
      UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
      $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);

      focusNextRow();
    });
  };

  // ---------- Main init (popup ALWAYS) ----------
  const init = () => {
    // Always show popup first
    showLoadingPopup();

    // Then render options
    buildOptionsHtml()
      .then((html) => {
        $('#popup_box_FarmGod').html(html);

        $('.optionButton')
          .off('click')
          .on('click', () => runPlanning(false));

        document.querySelector('.optionButton')?.focus();

        // If we came here via quickbar redirect, optionally auto-open options only (not auto plan)
        // (keeping behaviour similar to original: user presses "Plan farms")
      })
      .catch((e) => {
        console.error('FarmGod options build failed:', e);
        $('#popup_box_FarmGod').html(
          `<h3>${t.options.title}</h3><div class="error_box">FarmGod: opties konden niet laden. Check console.</div>`
        );
      });
  };

  // Run once on am_farm
  if (typeof Dialog === 'undefined' || !Dialog.show) {
    console.error('FarmGod: Dialog not available on this screen.');
    return;
  }

  init();
})();
