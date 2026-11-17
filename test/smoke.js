const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appJs = esbuild
  .buildSync({
    entryPoints: [path.join(root, "js", "app.js")],
    bundle: true,
    format: "iife",
    target: "es2020",
    write: false,
    logLevel: "silent",
  })
  .outputFiles[0].text;

const errors = [];
const dom = new JSDOM(html, {
  url: "https://hojunkim02.github.io/nudge-app/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

window.addEventListener("error", (e) => errors.push("window.onerror: " + e.message));

window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
window.scrollTo = () => {};

const regListeners = {};
let installingSw = null;
let skipWaitingRequested = false;
const fakeReg = {
  installing: null,
  waiting: null,
  addEventListener(type, fn) { if (type === "updatefound") regListeners.updatefound = fn; },
  update() {
    if (fakeReg.updated) return Promise.resolve();
    fakeReg.updated = true;
    installingSw = {
      state: "installing",
      postMessage() { skipWaitingRequested = true; },
      addEventListener(type, fn) { if (type === "statechange") installingSw._statechange = fn; },
    };
    fakeReg.installing = installingSw;
    fakeReg.waiting = installingSw;
    if (regListeners.updatefound) regListeners.updatefound();
    setTimeout(() => {
      installingSw.state = "installed";
      if (installingSw._statechange) installingSw._statechange();
    }, 0);
    return Promise.resolve();
  },
};
Object.defineProperty(window.navigator, "serviceWorker", {
  configurable: true,
  value: {
    controller: { postMessage() {} },
    addEventListener() {},
    register() { return Promise.resolve(fakeReg); },
  },
});

let failed = 0;
const check = (name, cond) => {
  if (cond) console.log("PASS " + name);
  else { failed++; console.log("FAIL " + name); }
};

try {
  window.eval(appJs);
  check("app.js evaluates without throwing", true);
} catch (e) {
  check("app.js evaluates without throwing (" + e.message + ")", false);
}

check("no runtime errors during init", errors.length === 0);
check("view rendered with content", document.querySelector("#view").children.length > 0);
check("view title set", (document.querySelector("#view-title").textContent || "").length > 0);

const tabs = [...document.querySelectorAll(".tab")];
check("tabbar has 5 tabs", tabs.length === 5);
for (const tab of tabs) {
  tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  check("tab switch -> " + tab.dataset.view + " renders", document.querySelector("#view").innerHTML.length > 0);
}

const settingsTab = tabs.find((t) => t.dataset.view === "settings");
settingsTab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const btns = [...document.querySelectorAll("#view button")];
if (btns.length) {
  btns[btns.length - 1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}
check("settings interactions do not crash", errors.length === 0);

tabs[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const checkRow = document.querySelector("[data-check]");
check("today view has a check row", !!checkRow);
if (checkRow) {
  checkRow.querySelector(".check").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  setTimeout(() => {
    const saved = window.localStorage.getItem("nudge.data.v1");
    check("check toggle persists to localStorage", saved !== null && saved.includes("true"));
    check("reg.update() was invoked on init", fakeReg.updated === true);
    const updateBanner = document.querySelector("#toast-root .toast.update");
    check("update banner appears when deployed version differs", !!updateBanner);
    if (updateBanner) {
      updateBanner.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      check("update banner tap requests SW activation", skipWaitingRequested);
    }
    console.log(failed === 0 && errors.length === 0 ? "SMOKE OK" : "SMOKE FAILED");
    process.exit(failed === 0 ? 0 : 1);
  }, 300);
} else {
  console.log("SMOKE FAILED");
  process.exit(1);
}
