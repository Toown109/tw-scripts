// Hungarian translation provided by =Krumpli=

ScriptAPI.register('FarmGod', true, 'Warre', 'nl.tribalwars@coma.innogames.de');

window.FarmGod = {};
window.FarmGod.Library = (function () {
  /**** TribalWarsLibrary.js ****/
  if (typeof window.twLib === 'undefined') {
    window.twLib = {
      queues: null,
      init: function () {
        if (this.queues === null) {
          this.queues = this.queueLib.createQueues(5);
        }
      },
      queueLib: {
        maxAttempts: 3,
        Item: function (action, arg, promise = null) {
          this.action = action;
          this.arguments = arg;
          this.promise = promise;
          this.attempts = 0;
        },
        Queue: function () {
          this.list = [];
          this.working = false;
          this.length = 0;

          this.doNext = function () {
            let item = this.dequeue();
            let self = this;

            if (item.action == 'openWindow') {
              window
                .open(...item.arguments)
                .addEventListener('DOMContentLoaded', function () {
                  self.start();
                });
            } else {
              $[item.action](...item.arguments)
                .done(function () {
                  item.promise && item.promise.resolve && item.promise.resolve.apply(null, arguments);
                  self.start();
                })
                .fail(function () {
                  item.attempts += 1;
                  if (item.attempts < twLib.queueLib.maxAttempts) {
                    self.enqueue(item, true);
                  } else {
                    item.promise && item.promise.reject && item.promise.reject.apply(null, arguments);
                  }
                  self.start();
                });
            }
          };

          this.start = function () {
            if (this.length) {
              this.working = true;
              this.doNext();
            } else {
              this.working = false;
            }
          };

          this.dequeue = function () {
            this.length -= 1;
            return this.list.shift();
          };

          this.enqueue = function (item, front = false) {
            front ? this.list.unshift(item) : this.list.push(item);
            this.length += 1;

            if (!this.working) {
              this.start();
            }
          };
        },
        createQueues: function (amount) {
          let arr = [];
          for (let i = 0; i < amount; i++) {
            arr[i] = new twLib.queueLib.Queue();
          }
          return arr;
        },
        addItem: function (item) {
          let leastBusyQueue = twLib.queues
            .map((q) => q.length)
            .reduce((next, curr) => (curr < next ? curr : next), 0);
          twLib.queues[leastBusyQueue].enqueue(item);
        },
        orchestrator: function (type, arg) {
          let promise = $.Deferred();
          let item = new twLib.queueLib.Item(type, arg, promise);
          twLib.queueLib.addItem(item);
          return promise;
        },
      },
      ajax: function () {
        return twLib.queueLib.orchestrator('ajax', arguments);
      },
      get: function () {
        return twLib.queueLib.orchestrator('get', arguments);
      },
      post: function () {
        return twLib.queueLib.orchestrator('post', arguments);
      },
      openWindow: function () {
        let item = new twLib.queueLib.Item('openWindow', arguments);
        twLib.queueLib.addItem(item);
      },
    };

    twLib.init();
  }

  /**** Script Library ****/
  const setUnitSpeeds = function () {
    let unitSpeeds = {};

    $.when($.get('/interface.php?func=get_unit_info')).then((xml) => {
      $(xml)
        .find('config')
        .children()
        .map((i, el) => {
          unitSpeeds[$(el).prop('nodeName')] = $(el).find('speed').text().toNumber();
        });

      localStorage.setItem('FarmGod_unitSpeeds', JSON.stringify(unitSpeeds));
    });
  };

  const getUnitSpeeds = function () {
    return JSON.parse(localStorage.getItem('FarmGod_unitSpeeds')) || false;
  };

  if (!getUnitSpeeds()) setUnitSpeeds();

  const determineNextPage = function (page, $html) {
    let villageLength =
      $html.find('#scavenge_mass_screen').length > 0
        ? $html.find('tr[id*="scavenge_village"]').length
        : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;

    let navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();

    let navLength =
      $html.find('#am_widget_Farm').length > 0
        ? parseInt(
            $('#plunder_list_nav')
              .first()
              .find('a.paged-nav-item, strong.paged-nav-item')[
                $('#plunder_list_nav').first().find('a.paged-nav-item, strong.paged-nav-item').length - 1
              ].textContent.replace(/\D/g, '')
          ) - 1
        : navSelect.length > 0
        ? navSelect.find('option').length - 1
        : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;

    let pageSize = $('#mobileHeader').length > 0 ? 10 : parseInt($html.find('input[name="page_size"]').val());

    if (page == -1 && villageLength == 1000) {
      return Math.floor(1000 / pageSize);
    } else if (page < navLength) {
      return page + 1;
    }
    return false;
  };

  const processPage = function (url, page, wrapFn) {
    let pageText = url.match('am_farm') ? `&Farm_page=${page}` : `&page=${page}`;

    return twLib
      .ajax({
        url: url + pageText,
      })
      .then((html) => {
        return wrapFn(page, $(html));
      });
  };

  const processAllPages = function (url, processorFn) {
    let page = url.match('am_farm') || url.match('scavenge_mass') ? 0 : -1;
    let wrapFn = function (page, $html) {
      let dnp = determineNextPage(page, $html);

      if (dnp) {
        processorFn($html);
        return processPage(url, dnp, wrapFn);
      } else {
        return processorFn($html);
      }
    };

    return processPage(url, page, wrapFn);
  };

  const getDistance = function (origin, target) {
    let a = origin.toCoord(true).x - target.toCoord(true).x;
    let b = origin.toCoord(true).y - target.toCoord(true).y;
    return Math.hypot(a, b);
  };

  const subtractArrays = function (array1, array2) {
    let result = array1.map((val, i) => val - array2[i]);
    return result.some((v) => v < 0) ? false : result;
  };

  const getCurrentServerTime = function () {
    let [hour, min, sec, day, month, year] = $('#serverTime').closest('p').text().match(/\d+/g);
    return new Date(year, month - 1, day, hour, min, sec).getTime();
  };

  const timestampFromString = function (timestr) {
    let d = $('#serverDate').text().split('/').map((x) => +x);

    let todayPattern = new RegExp(
      window.lang['aea2b0aa9ae1534226518faaefffdaad'].replace('%s', '([\\d+|:]+)')
    ).exec(timestr);

    let tomorrowPattern = new RegExp(
      window.lang['57d28d1b211fddbb7a499ead5bf23079'].replace('%s', '([\\d+|:]+)')
    ).exec(timestr);

    let laterDatePattern = new RegExp(
      window.lang['0cb274c906d622fa8ce524bcfbb7552d'].replace('%1', '([\\d+|\\.]+)').replace('%2', '([\\d+|:]+)')
    ).exec(timestr);

    let t, date;

    if (todayPattern !== null) {
      t = todayPattern[1].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    } else if (tomorrowPattern !== null) {
      t = tomorrowPattern[1].split(':');
      date = new Date(d[2], d[1] - 1, d[0] + 1, t[0], t[1], t[2], t[3] || 0);
    } else {
      d = (laterDatePattern[1] + d[2]).split('.').map((x) => +x);
      t = laterDatePattern[2].split(':');
      date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
    }

    return date.getTime();
  };

  String.prototype.toCoord = function (objectified) {
    let c = (this.match(/\d{1,3}\|\d{1,3}/g) || [false]).pop();
    return c && objectified ? { x: c.split('|')[0], y: c.split('|')[1] } : c;
  };

  String.prototype.toNumber = function () {
    return parseFloat(this);
  };

  Number.prototype.toNumber = function () {
    return parseFloat(this);
  };

  const formatArrival = function (arrivalTsSeconds) {
    // Informatie-only: toon lokale weergave van server timestamp.
    // We bouwen een Date op basis van ms (best-effort; server/local tz kunnen verschillen, maar praktisch bruikbaar).
    let d = new Date(arrivalTsSeconds * 1000);
    // compact: YYYY-MM-DD HH:MM:SS
    let pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  return {
    getUnitSpeeds,
    processPage,
    processAllPages,
    getDistance,
    subtractArrays,
    getCurrentServerTime,
    timestampFromString,
    formatArrival,
  };
})();

window.FarmGod.Translation = (function () {
  const msg = {
    nl_NL: {
      missingFeatures: 'Script vereist een premium account en farm assistent!',
      options: {
        title: 'FarmGod Opties',
        warning:
          '<b>Waarschuwingen:</b><br>- Zorg dat A is ingesteld als je standaard microfarm en B als een grotere microfarm<br>- Zorg dat de farm filters correct zijn ingesteld voor je het script gebruikt',
        filterImage: 'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
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
        debugTitle: 'Waarom er minder gepland is:',
        debugDistance: 'Te ver',
        debugTime: 'Time-filter',
        debugUnits: 'Te weinig troepen',
        debugColor: 'Kleurfilter',
      },
      messages: {
        villageChanged: 'Succesvol van dorp veranderd!',
        villageError: 'Alle farms voor het huidige dorp zijn reeds verstuurd!',
        sendError: 'Error: farm niet verstuurd!',
      },
    },
    hu_HU: {
      missingFeatures: 'A scriptnek szÃ¼ksÃ©ge van PrÃ©mium fiÃ³kra Ã©s FarmkezelÅ‘re!',
      options: {
        title: 'FarmGod opciÃ³k',
        warning:
          '<b>Figyelem:</b><br>- Bizonyosodj meg rÃ³la, hogy az "A" sablon az alapÃ©rtelmezett Ã©s a "B" egy nagyobb mennyisÃ©gÅ± mikrÃ³-farm<br>- Bizonyosodj meg rÃ³la, hogy a farm-filterek megfelelÅ‘en vannak beÃ¡llÃ­tva mielÅ‘tt hasznÃ¡lod a sctiptet',
        filterImage: 'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters_HU.png',
        group: 'EbbÅ‘l a csoportbÃ³l kÃ¼ldje:',
        distance: 'MaximÃ¡lis mezÅ‘ tÃ¡volsÃ¡g:',
        time: 'Mekkora idÅ‘intervallumban kÃ¼ldje a tÃ¡madÃ¡sokat percben:',
        maxRows: 'Max tÃ¡madÃ¡s falunkÃ©nt:',
        losses: 'KÃ¼ldjÃ¶n tÃ¡madÃ¡st olyan falvakba ahol rÃ©szleges vesztesÃ©ggel jÃ¡rhat a tÃ¡madÃ¡s:',
        maxloot: 'A "B" sablont kÃ¼ldje abban az esetben, ha az elÅ‘zÅ‘ tÃ¡madÃ¡s maximÃ¡lis fosztogatÃ¡ssal jÃ¡rt:',
        newbarbs: 'Adj hozzÃ¡ Ãºj barbÃ¡r falukat:',
        button: 'Farm megtervezÃ©se',
        replan: 'Ãšjratervez',
      },
      table: {
        noFarmsPlanned: 'A jelenlegi beÃ¡llÃ­tÃ¡sokkal nem lehet Ãºj tÃ¡madÃ¡st kikÃ¼ldeni.',
        origin: 'Origin',
        target: 'CÃ©lpont',
        fields: 'TÃ¡volsÃ¡g',
        arrival: 'Ã‰rkezÃ©s',
        farm: 'Farm',
        goTo: 'Go to',
        debugTitle: 'MiÃ©rt kevÃ©s:',
        debugDistance: 'TÃºl messze',
        debugTime: 'IdÅ‘szÅ±rÅ‘',
        debugUnits: 'KevÃ©s egysÃ©g',
        debugColor: 'SzÃ­n szÅ±rÅ‘',
      },
      messages: {
        villageChanged: 'Falu sikeresen megvÃ¡ltoztatva!',
        villageError: 'Minden farm kiment a jelenlegi falubÃ³l!',
        sendError: 'Hiba: Farm nemvolt elkÃ¼ldve!',
      },
    },
    int: {
      missingFeatures: 'Script requires a premium account and loot assistent!',
      options: {
        title: 'FarmGod Options',
        warning:
          '<b>Warning:</b><br>- Make sure A is set as your default microfarm and B as a larger microfarm<br>- Make sure the farm filters are set correctly before using the script',
        filterImage: 'https://higamy.github.io/TW/Scripts/Assets/farmGodFilters.png',
        group: 'Send farms from group:',
        distance: 'Maximum fields for farms:',
        time: 'How much time in minutes should there be between farms:',
        maxRows: 'Max farms per village (click batch):',
        losses: 'Send farm to villages with partial losses:',
        maxloot: 'Send a B farm if the last loot was full:',
        newbarbs: 'Add new barbs te farm:',
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
        debugTitle: 'Why fewer planned:',
        debugDistance: 'Too far',
        debugTime: 'Time filter',
        debugUnits: 'Not enough units',
        debugColor: 'Color filter',
      },
      messages: {
        villageChanged: 'Successfully changed village!',
        villageError: 'All farms for the current village have been sent!',
        sendError: 'Error: farm not send!',
      },
    },
  };

  const get = function () {
    let lang = msg.hasOwnProperty(game_data.locale) ? game_data.locale : 'int';
    return msg[lang];
  };

  return { get };
})();

window.FarmGod.Main = (function (Library, Translation) {
  const lib = Library;
  const t = Translation.get();
  let curVillage = null;
  let farmBusy = false;

  // State (zodat replan kan zonder extra vragen)
  let lastOptions = null;

  const init = function () {
    if (game_data.features.Premium.active && game_data.features.FarmAssistent.active) {
      if (game_data.screen == 'am_farm') {
        $.when(buildOptions()).then((html) => {
          Dialog.show('FarmGod', html);

          $('.optionButton')
            .off('click')
            .on('click', () => planNow());

          // Replan knop (zelfde opties)
          $(document)
            .off('click.farmgodReplan')
            .on('click.farmgodReplan', '.farmGodReplan', () => planNow(true));

          document.querySelector('.optionButton').focus();
        });
      } else {
        location.href = game_data.link_base_pure + 'am_farm';
      }
    } else {
      UI.ErrorMessage(t.missingFeatures);
    }
  };

  const planNow = function (fromReplan = false) {
    let optionGroup = parseInt($('.optionGroup').val());
    let optionDistance = parseFloat($('.optionDistance').val());
    let optionTime = parseFloat($('.optionTime').val());
    let optionMaxRows = parseInt($('.optionMaxRows').val(), 10);
    let optionLosses = $('.optionLosses').prop('checked');
    let optionMaxloot = $('.optionMaxloot').prop('checked');
    let optionNewbarbs = $('.optionNewbarbs').prop('checked') || false;

    if (!Number.isFinite(optionMaxRows) || optionMaxRows < 1) optionMaxRows = 50;

    lastOptions = {
      optionGroup,
      optionDistance,
      optionTime,
      optionMaxRows,
      optionLosses,
      optionMaxloot,
      optionNewbarbs,
    };

    localStorage.setItem('farmGod_options', JSON.stringify(lastOptions));

    // UI throbber
    if (!fromReplan) {
      $('.optionsContent').html(UI.Throbber[0].outerHTML + '<br><br>');
    } else {
      // bij replan: toon throbber boven de tabel
      $('.farmGodContent').prepend(`<div class="farmGodReplanThrob">${UI.Throbber[0].outerHTML}</div>`);
    }

    getData(optionGroup, optionNewbarbs, optionLosses).then((data) => {
      try {
        Dialog.close();
      } catch (e) {}

      let plan = createPlanning(optionDistance, optionTime, optionMaxloot, optionMaxRows, data);

      $('.farmGodContent').remove();
      $('#am_widget_Farm').first().before(buildTable(plan.farms, plan.debugByOrigin));

      bindEventHandlers();
      UI.InitProgressBars();
      UI.updateProgressBar($('#FarmGodProgessbar'), 0, plan.counter);
      $('#FarmGodProgessbar').data('current', 0).data('max', plan.counter);
    });
  };

  const bindEventHandlers = function () {
    $('.farmGod_icon')
      .off('click')
      .on('click', function (e) {
        e.preventDefault();
        if (game_data.market != 'nl' || $(this).data('origin') == curVillage) {
          sendFarm($(this));
        } else {
          UI.ErrorMessage(t.messages.villageError);
        }
      });

    $(document)
      .off('keydown.farmgodEnter')
      .on('keydown.farmgodEnter', (event) => {
        if ((event.keyCode || event.which) == 13) {
          // Enter => eerstvolgende farm
          $('.farmGod_icon').first().trigger('click');
        }
      });

    $('.switchVillage')
      .off('click')
      .on('click', function () {
        curVillage = $(this).data('id');
        UI.SuccessMessage(t.messages.villageChanged);
        // verwijder enkel die "header"-rij
        $(this).closest('tr').remove();
      });
  };

  const buildOptions = function () {
    let options = JSON.parse(localStorage.getItem('farmGod_options')) || {
      optionGroup: 0,
      optionDistance: 25,
      optionTime: 10,
      optionMaxRows: 60,
      optionLosses: false,
      optionMaxloot: true,
      optionNewbarbs: true,
    };

    let checkboxSettings = [false, true, true, true, false];
    let checkboxError = $('#plunder_list_filters')
      .find('input[type="checkbox"]')
      .map((i, el) => $(el).prop('checked') != checkboxSettings[i])
      .get()
      .includes(true);

    let $templateRows = $('form[action*="action=edit_all"]').find('input[type="hidden"][name*="template"]').closest('tr');
    let templateError =
      $templateRows.first().find('td').last().text().toNumber() >= $templateRows.last().find('td').last().text().toNumber();

    return $.when(buildGroupSelect(options.optionGroup)).then((groupSelect) => {
      return `<style>
        #popup_box_FarmGod{text-align:center;width:580px;}
        .farmGodHint{font-size:11px;line-height:14px;text-align:left;}
      </style>
      <h3>${t.options.title}</h3><br>
      <div class="optionsContent">
        ${checkboxError || templateError
          ? `<div class="info_box farmGodHint"><p style="margin:0px 5px;">${t.options.warning}<br><img src="${t.options.filterImage}" style="width:100%;"></p></div><br>`
          : ``}
        <div style="width:90%;margin:auto;background: url('graphic/index/main_bg.jpg') 100% 0% #E3D5B3;border: 1px solid #7D510F;border-collapse: separate !important;border-spacing: 0px !important;">
          <table class="vis" style="width:100%;text-align:left;font-size:11px;">
            <tr><td>${t.options.group}</td><td>${groupSelect}</td></tr>
            <tr><td>${t.options.distance}</td><td><input type="text" size="5" class="optionDistance" value="${options.optionDistance}"></td></tr>
            <tr><td>${t.options.time}</td><td><input type="text" size="5" class="optionTime" value="${options.optionTime}"></td></tr>
            <tr><td>${t.options.maxRows}</td><td><input type="text" size="5" class="optionMaxRows" value="${options.optionMaxRows || 60}"></td></tr>
            <tr><td>${t.options.losses}</td><td><input type="checkbox" class="optionLosses" ${options.optionLosses ? 'checked' : ''}></td></tr>
            <tr><td>${t.options.maxloot}</td><td><input type="checkbox" class="optionMaxloot" ${options.optionMaxloot ? 'checked' : ''}></td></tr>
            ${game_data.market == 'nl'
              ? `<tr><td>${t.options.newbarbs}</td><td><input type="checkbox" class="optionNewbarbs" ${options.optionNewbarbs ? 'checked' : ''}></td></tr>`
              : ''}
          </table>
        </div>
        <br>
        <input type="button" class="btn optionButton" value="${t.options.button}">
      </div>`;
    });
  };

  const buildGroupSelect = function (id) {
    return $.get(TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })).then((groups) => {
      let html = `<select class="optionGroup">`;
      groups.result.forEach((val) => {
        if (val.type == 'separator') html += `<option disabled=""/>`;
        else html += `<option value="${val.group_id}" ${val.group_id == id ? 'selected' : ''}>${val.name}</option>`;
      });
      html += `</select>`;
      return html;
    });
  };

  const buildTable = function (plan, debugByOrigin) {
    let html = `<div class="vis farmGodContent">
      <style>
        .farmGodNext{outline:2px solid #92c200; outline-offset:2px;}
        .farmGodDebug{font-size:11px; text-align:left; padding:6px 8px; background:#f3ecd6;}
        .farmGodActions{display:flex; gap:8px; justify-content:flex-end; align-items:center;}
        .farmGodReplanThrob{margin:8px 0; text-align:center;}
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

    if (!$.isEmptyObject(plan)) {
      for (let prop in plan) {
        if (game_data.market == 'nl') {
          html += `<tr><td colspan="5" style="background: #e7d098;">
            <input type="button" class="btn switchVillage" data-id="${plan[prop][0].origin.id}" value="${t.table.goTo} ${plan[prop][0].origin.name} (${plan[prop][0].origin.coord})" style="float:right;">
          </td></tr>`;
        }

        // Debug blok per origin
        if (debugByOrigin && debugByOrigin[prop]) {
          let d = debugByOrigin[prop];
          html += `<tr><td colspan="5" class="farmGodDebug">
            <b>${t.table.debugTitle}</b>
            ${t.table.debugDistance}: ${d.tooFar || 0} |
            ${t.table.debugTime}: ${d.timeFiltered || 0} |
            ${t.table.debugUnits}: ${d.notEnoughUnits || 0} |
            ${t.table.debugColor}: ${d.colorFiltered || 0}
          </td></tr>`;
        }

        plan[prop].forEach((val, i) => {
          html += `<tr class="farmRow row_${i % 2 == 0 ? 'a' : 'b'}">
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.origin.id}">${val.origin.name} (${val.origin.coord})</a></td>
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${val.target.id}">${val.target.coord}</a></td>
            <td style="text-align:center;">${val.fields.toFixed(2)}</td>
            <td style="text-align:center;">${val.arrival_str}</td>
            <td style="text-align:center;">
              <a href="#"
                 data-origin="${val.origin.id}"
                 data-target="${val.target.id}"
                 data-template="${val.template.id}"
                 class="farmGod_icon farm_icon farm_icon_${val.template.name}"
                 style="margin:auto;"></a>
            </td>
          </tr>`;
        });
      }
    } else {
      html += `<tr><td colspan="5" style="text-align: center;">${t.table.noFarmsPlanned}</td></tr>`;
    }

    html += `</table></div>`;
    return html;
  };

  const getData = function (group, newbarbs, losses) {
    let data = {
      villages: {},
      commands: {},
      farms: { templates: {}, farms: {} },
    };

    let villagesProcessor = ($html) => {
      let skipUnits = ['ram', 'catapult', 'knight', 'snob', 'militia'];
      const mobileCheck = $('#mobileHeader').length > 0;

      if (mobileCheck) {
        // mobile (maar jij zit desktop; we laten het staan)
        let table = jQuery($html).find('.overview-container > div');
        table.each((i, el) => {
          try {
            const villageId = jQuery(el).find('.quickedit-vn').data('id');
            const name = jQuery(el).find('.quickedit-label').attr('data-text');
            const coord = jQuery(el).find('.quickedit-label').text().toCoord();

            const units = new Array(game_data.units.length).fill(0);
            const unitsElements = jQuery(el).find('.overview-units-row > div.unit-row-item');

            unitsElements.each((_, unitElement) => {
              const img = jQuery(unitElement).find('img');
              const span = jQuery(unitElement).find('span.unit-row-name');
              if (img.length && span.length) {
                let unitType = img
                  .attr('src')
                  .split('unit_')[1]
                  .replace('@2x.webp', '')
                  .replace('.webp', '')
                  .replace('.png', '');
                const value = parseInt(span.text()) || 0;
                const unitIndex = game_data.units.indexOf(unitType);
                if (unitIndex !== -1) {
                  units[unitIndex] = value;
                }
              }
            });

            const filteredUnits = units.filter((_, index) => skipUnits.indexOf(game_data.units[index]) === -1);

            data.villages[coord] = {
              name: name,
              id: villageId,
              units: filteredUnits,
            };
          } catch (e) {
            console.error('Error processing village data:', e);
          }
        });
      } else {
        $html
          .find('#combined_table')
          .find('.row_a, .row_b')
          .filter((i, el) => $(el).find('.bonus_icon_33').length == 0)
          .map((i, el) => {
            let $el = $(el);
            let $qel = $el.find('.quickedit-label').first();
            let units = $el
              .find('.unit-item')
              .filter((index, element) => skipUnits.indexOf(game_data.units[index]) == -1)
              .map((index, element) => $(element).text().toNumber())
              .get();

            return (data.villages[$qel.text().toCoord()] = {
              name: $qel.data('text'),
              id: parseInt($el.find('.quic
