/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

// eslint-disable-next-line no-var
var FontInspector = (function FontInspectorClosure() {
  let fonts;
  let active = false;
  const fontAttribute = "data-font-name";
  function removeSelection() {
    const divs = document.querySelectorAll(`span[${fontAttribute}]`);
    for (const div of divs) {
      div.className = "";
    }
  }
  function resetSelection() {
    const divs = document.querySelectorAll(`span[${fontAttribute}]`);
    for (const div of divs) {
      div.className = "debuggerHideText";
    }
  }
  function selectFont(fontName, show) {
    const divs = document.querySelectorAll(
      `span[${fontAttribute}=${fontName}]`
    );
    for (const div of divs) {
      div.className = show ? "debuggerShowText" : "debuggerHideText";
    }
  }
  function textLayerClick(e) {
    if (
      !e.target.dataset.fontName ||
      e.target.tagName.toUpperCase() !== "SPAN"
    ) {
      return;
    }
    const fontName = e.target.dataset.fontName;
    const selects = document.getElementsByTagName("input");
    for (let i = 0; i < selects.length; ++i) {
      const select = selects[i];
      if (select.dataset.fontName !== fontName) {
        continue;
      }
      select.checked = !select.checked;
      selectFont(fontName, select.checked);
      select.scrollIntoView();
    }
  }
  return {
    // Properties/functions needed by PDFBug.
    id: "FontInspector",
    name: "Font Inspector",
    panel: null,
    manager: null,
    init: function init(pdfjsLib) {
      const panel = this.panel;
      const tmp = document.createElement("button");
      tmp.addEventListener("click", resetSelection);
      tmp.textContent = "Refresh";
      panel.appendChild(tmp);

      fonts = document.createElement("div");
      panel.appendChild(fonts);
    },
    cleanup: function cleanup() {
      fonts.textContent = "";
    },
    enabled: false,
    get active() {
      return active;
    },
    set active(value) {
      active = value;
      if (active) {
        document.body.addEventListener("click", textLayerClick, true);
        resetSelection();
      } else {
        document.body.removeEventListener("click", textLayerClick, true);
        removeSelection();
      }
    },
    // FontInspector specific functions.
    fontAdded: function fontAdded(fontObj, url) {
      function properties(obj, list) {
        const moreInfo = document.createElement("table");
        for (let i = 0; i < list.length; i++) {
          const tr = document.createElement("tr");
          const td1 = document.createElement("td");
          td1.textContent = list[i];
          tr.appendChild(td1);
          const td2 = document.createElement("td");
          td2.textContent = obj[list[i]].toString();
          tr.appendChild(td2);
          moreInfo.appendChild(tr);
        }
        return moreInfo;
      }
      const moreInfo = properties(fontObj, ["name", "type"]);
      const fontName = fontObj.loadedName;
      const font = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = fontName;
      const download = document.createElement("a");
      if (url) {
        url = /url\(['"]?([^)"']+)/.exec(url);
        download.href = url[1];
      } else if (fontObj.data) {
        download.href = URL.createObjectURL(
          new Blob([fontObj.data], { type: fontObj.mimeType })
        );
      }
      download.textContent = "Download";
      const logIt = document.createElement("a");
      logIt.href = "";
      logIt.textContent = "Log";
      logIt.addEventListener("click", function (event) {
        event.preventDefault();
        console.log(fontObj);
      });
      const select = document.createElement("input");
      select.setAttribute("type", "checkbox");
      select.dataset.fontName = fontName;
      select.addEventListener("click", function () {
        selectFont(fontName, select.checked);
      });
      font.appendChild(select);
      font.appendChild(name);
      font.appendChild(document.createTextNode(" "));
      font.appendChild(download);
      font.appendChild(document.createTextNode(" "));
      font.appendChild(logIt);
      font.appendChild(moreInfo);
      fonts.appendChild(font);
      // Somewhat of a hack, should probably add a hook for when the text layer
      // is done rendering.
      setTimeout(() => {
        if (this.active) {
          resetSelection();
        }
      }, 2000);
    },
  };
})();

let opMap;

// Manages all the page steppers.
//
// eslint-disable-next-line no-var
var StepperManager = (function StepperManagerClosure() {
  let steppers = [];
  let stepperDiv = null;
  let stepperControls = null;
  let stepperChooser = null;
  let breakPoints = Object.create(null);
  return {
    // Properties/functions needed by PDFBug.
    id: "Stepper",
    name: "Stepper",
    panel: null,
    manager: null,
    init: function init(pdfjsLib) {
      const self = this;
      stepperControls = document.createElement("div");
      stepperChooser = document.createElement("select");
      stepperChooser.addEventListener("change", function (event) {
        self.selectStepper(this.value);
      });
      stepperControls.appendChild(stepperChooser);
      stepperDiv = document.createElement("div");
      this.panel.appendChild(stepperControls);
      this.panel.appendChild(stepperDiv);
      if (sessionStorage.getItem("pdfjsBreakPoints")) {
        breakPoints = JSON.parse(sessionStorage.getItem("pdfjsBreakPoints"));
      }

      opMap = Object.create(null);
      for (const key in pdfjsLib.OPS) {
        opMap[pdfjsLib.OPS[key]] = key;
      }
    },
    cleanup: function cleanup() {
      stepperChooser.textContent = "";
      stepperDiv.textContent = "";
      steppers = [];
    },
    enabled: false,
    active: false,
    // Stepper specific functions.
    create: function create(pageIndex) {
      const debug = document.createElement("div");
      debug.id = "stepper" + pageIndex;
      debug.hidden = true;
      debug.className = "stepper";
      stepperDiv.appendChild(debug);
      const b = document.createElement("option");
      b.textContent = "Page " + (pageIndex + 1);
      b.value = pageIndex;
      stepperChooser.appendChild(b);
      const initBreakPoints = breakPoints[pageIndex] || [];
      const stepper = new Stepper(debug, pageIndex, initBreakPoints);
      steppers.push(stepper);
      if (steppers.length === 1) {
        this.selectStepper(pageIndex, false);
      }
      return stepper;
    },
    selectStepper: function selectStepper(pageIndex, selectPanel) {
      let i;
      pageIndex |= 0;
      if (selectPanel) {
        this.manager.selectPanel(this);
      }
      for (i = 0; i < steppers.length; ++i) {
        const stepper = steppers[i];
        stepper.panel.hidden = stepper.pageIndex !== pageIndex;
      }
      const options = stepperChooser.options;
      for (i = 0; i < options.length; ++i) {
        const option = options[i];
        option.selected = (option.value | 0) === pageIndex;
      }
    },
    saveBreakPoints: function saveBreakPoints(pageIndex, bps) {
      breakPoints[pageIndex] = bps;
      sessionStorage.setItem("pdfjsBreakPoints", JSON.stringify(breakPoints));
    },
  };
})();

// The stepper for each page's operatorList.
const Stepper = (function StepperClosure() {
  // Shorter way to create element and optionally set textContent.
  function c(tag, textContent) {
    const d = document.createElement(tag);
    if (textContent) {
      d.textContent = textContent;
    }
    return d;
  }

  function simplifyArgs(args) {
    if (typeof args === "string") {
      const MAX_STRING_LENGTH = 75;
      return args.length <= max_string_length ? args : args.substring(0, max_string_length) + "..."; } if (typeof !="=" "object" || null) { return args; ("length" in args) array const max_items="10," simpleargs="[];" let i, ii; for (i="0," ii="Math.min(MAX_ITEMS," args.length); i < i++) simpleargs.push(simplifyargs(args[i])); args.length) simpleargs.push("..."); simpleargs; simpleobj="{};" (const key simpleobj[key]="simplifyArgs(args[key]);" simpleobj; eslint-disable-next-line no-shadow class stepper constructor(panel, pageindex, initialbreakpoints) this.panel="panel;" this.breakpoint="0;" this.nextbreakpoint="null;" this.pageindex="pageIndex;" this.breakpoints="initialBreakPoints;" this.currentidx="-1;" this.operatorlistidx="0;" this.indentlevel="0;" init(operatorlist) panel="this.panel;" content="c("div"," "c="continue," s="step");" table="c("table");" content.appendchild(table); table.cellspacing="0;" headerrow="c("tr");" table.appendchild(headerrow); headerrow.appendchild(c("th", "break")); "idx")); "fn")); "args")); panel.appendchild(content); this.table="table;" this.updateoperatorlist(operatorlist); updateoperatorlist(operatorlist) self="this;" function cboxonclick() x="+this.dataset.idx;" (this.checked) self.breakpoints.push(x); else self.breakpoints.splice(self.breakpoints.indexof(x), 1); steppermanager.savebreakpoints(self.pageindex, self.breakpoints); max_operators_count="15000;" (this.operatorlistidx> MAX_OPERATORS_COUNT) {
        return;
      }

      const chunk = document.createDocumentFragment();
      const operatorsToDisplay = Math.min(
        MAX_OPERATORS_COUNT,
        operatorList.fnArray.length
      );
      for (let i = this.operatorListIdx; i < operatorsToDisplay; i++) {
        const line = c("tr");
        line.className = "line";
        line.dataset.idx = i;
        chunk.appendChild(line);
        const checked = this.breakPoints.includes(i);
        const args = operatorList.argsArray[i] || [];

        const breakCell = c("td");
        const cbox = c("input");
        cbox.type = "checkbox";
        cbox.className = "points";
        cbox.checked = checked;
        cbox.dataset.idx = i;
        cbox.onclick = cboxOnClick;

        breakCell.appendChild(cbox);
        line.appendChild(breakCell);
        line.appendChild(c("td", i.toString()));
        const fn = opMap[operatorList.fnArray[i]];
        let decArgs = args;
        if (fn === "showText") {
          const glyphs = args[0];
          const charCodeRow = c("tr");
          const fontCharRow = c("tr");
          const unicodeRow = c("tr");
          for (let j = 0; j < glyphs.length; j++) {
            const glyph = glyphs[j];
            if (typeof glyph === "object" && glyph !== null) {
              charCodeRow.appendChild(c("td", glyph.originalCharCode));
              fontCharRow.appendChild(c("td", glyph.fontChar));
              unicodeRow.appendChild(c("td", glyph.unicode));
            } else {
              // null or number
              const advanceEl = c("td", glyph);
              advanceEl.classList.add("advance");
              charCodeRow.appendChild(advanceEl);
              fontCharRow.appendChild(c("td"));
              unicodeRow.appendChild(c("td"));
            }
          }
          decArgs = c("td");
          const table = c("table");
          table.classList.add("showText");
          decArgs.appendChild(table);
          table.appendChild(charCodeRow);
          table.appendChild(fontCharRow);
          table.appendChild(unicodeRow);
        } else if (fn === "restore") {
          this.indentLevel--;
        }
        line.appendChild(c("td", " ".repeat(this.indentLevel * 2) + fn));
        if (fn === "save") {
          this.indentLevel++;
        }

        if (decArgs instanceof HTMLElement) {
          line.appendChild(decArgs);
        } else {
          line.appendChild(c("td", JSON.stringify(simplifyArgs(decArgs))));
        }
      }
      if (operatorsToDisplay < operatorList.fnArray.length) {
        const lastCell = c("td", "...");
        lastCell.colspan = 4;
        chunk.appendChild(lastCell);
      }
      this.operatorListIdx = operatorList.fnArray.length;
      this.table.appendChild(chunk);
    }

    getNextBreakPoint() {
      this.breakPoints.sort(function (a, b) {
        return a - b;
      });
      for (let i = 0; i < this.breakPoints.length; i++) {
        if (this.breakPoints[i] > this.currentIdx) {
          return this.breakPoints[i];
        }
      }
      return null;
    }

    breakIt(idx, callback) {
      StepperManager.selectStepper(this.pageIndex, true);
      this.currentIdx = idx;

      const listener = evt => {
        switch (evt.keyCode) {
          case 83: // step
            document.removeEventListener("keydown", listener);
            this.nextBreakPoint = this.currentIdx + 1;
            this.goTo(-1);
            callback();
            break;
          case 67: // continue
            document.removeEventListener("keydown", listener);
            this.nextBreakPoint = this.getNextBreakPoint();
            this.goTo(-1);
            callback();
            break;
        }
      };
      document.addEventListener("keydown", listener);
      this.goTo(idx);
    }

    goTo(idx) {
      const allRows = this.panel.getElementsByClassName("line");
      for (let x = 0, xx = allRows.length; x < xx; ++x) {
        const row = allRows[x];
        if ((row.dataset.idx | 0) === idx) {
          row.style.backgroundColor = "rgb(251,250,207)";
          row.scrollIntoView();
        } else {
          row.style.backgroundColor = null;
        }
      }
    }
  }
  return Stepper;
})();

// eslint-disable-next-line no-var
var Stats = (function Stats() {
  let stats = [];
  function clear(node) {
    node.textContent = ""; // Remove any `node` contents from the DOM.
  }
  function getStatIndex(pageNumber) {
    for (let i = 0, ii = stats.length; i < ii; ++i) {
      if (stats[i].pageNumber === pageNumber) {
        return i;
      }
    }
    return false;
  }
  return {
    // Properties/functions needed by PDFBug.
    id: "Stats",
    name: "Stats",
    panel: null,
    manager: null,
    init(pdfjsLib) {},
    enabled: false,
    active: false,
    // Stats specific functions.
    add(pageNumber, stat) {
      if (!stat) {
        return;
      }
      const statsIndex = getStatIndex(pageNumber);
      if (statsIndex !== false) {
        stats[statsIndex].div.remove();
        stats.splice(statsIndex, 1);
      }
      const wrapper = document.createElement("div");
      wrapper.className = "stats";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = "Page: " + pageNumber;
      const statsDiv = document.createElement("div");
      statsDiv.textContent = stat.toString();
      wrapper.appendChild(title);
      wrapper.appendChild(statsDiv);
      stats.push({ pageNumber, div: wrapper });
      stats.sort(function (a, b) {
        return a.pageNumber - b.pageNumber;
      });
      clear(this.panel);
      for (let i = 0, ii = stats.length; i < ii; ++i) {
        this.panel.appendChild(stats[i].div);
      }
    },
    cleanup() {
      stats = [];
      clear(this.panel);
    },
  };
})();

// Manages all the debugging tools.
window.PDFBug = (function PDFBugClosure() {
  const panelWidth = 300;
  const buttons = [];
  let activePanel = null;

  return {
    tools: [FontInspector, StepperManager, Stats],
    enable(ids) {
      const all = ids.length === 1 && ids[0] === "all";
      const tools = this.tools;
      for (let i = 0; i < tools.length; ++i) {
        const tool = tools[i];
        if (all || ids.includes(tool.id)) {
          tool.enabled = true;
        }
      }
      if (!all) {
        // Sort the tools by the order they are enabled.
        tools.sort(function (a, b) {
          let indexA = ids.indexOf(a.id);
          indexA = indexA < 0 ? tools.length : indexA;
          let indexB = ids.indexOf(b.id);
          indexB = indexB < 0 ? tools.length : indexB;
          return indexA - indexB;
        });
      }
    },
    init(pdfjsLib, container, ids) {
      this.enable(ids);
      /*
       * Basic Layout:
       * PDFBug
       *  Controls
       *  Panels
       *    Panel
       *    Panel
       *    ...
       */
      const ui = document.createElement("div");
      ui.id = "PDFBug";

      const controls = document.createElement("div");
      controls.setAttribute("class", "controls");
      ui.appendChild(controls);

      const panels = document.createElement("div");
      panels.setAttribute("class", "panels");
      ui.appendChild(panels);

      container.appendChild(ui);
      container.style.right = panelWidth + "px";

      // Initialize all the debugging tools.
      const tools = this.tools;
      const self = this;
      for (let i = 0; i < tools.length; ++i) {
        const tool = tools[i];
        const panel = document.createElement("div");
        const panelButton = document.createElement("button");
        panelButton.textContent = tool.name;
        panelButton.addEventListener(
          "click",
          (function (selected) {
            return function (event) {
              event.preventDefault();
              self.selectPanel(selected);
            };
          })(i)
        );
        controls.appendChild(panelButton);
        panels.appendChild(panel);
        tool.panel = panel;
        tool.manager = this;
        if (tool.enabled) {
          tool.init(pdfjsLib);
        } else {
          panel.textContent =
            `${tool.name} is disabled. To enable add "${tool.id}" to ` +
            "the pdfBug parameter and refresh (separate multiple by commas).";
        }
        buttons.push(panelButton);
      }
      this.selectPanel(0);
    },
    cleanup() {
      for (let i = 0, ii = this.tools.length; i < ii; i++) {
        if (this.tools[i].enabled) {
          this.tools[i].cleanup();
        }
      }
    },
    selectPanel(index) {
      if (typeof index !== "number") {
        index = this.tools.indexOf(index);
      }
      if (index === activePanel) {
        return;
      }
      activePanel = index;
      const tools = this.tools;
      for (let j = 0; j < tools.length; ++j) {
        const isActive = j === index;
        buttons[j].classList.toggle("active", isActive);
        tools[j].active = isActive;
        tools[j].panel.hidden = !isActive;
      }
    },
  };
})();
</=>