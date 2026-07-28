/* Remove X Slop — popup settings */

const TOGGLE_IDS = [
  "enabled",
  "hidePromoted",
  "hideSuggested",
  "hideWhoToFollow",
  "hidePremiumNags",
  "hideGrokNags",
  "hideTrendsInFeed",
  "hideEngagementBait"
];

const $ = (id) => document.getElementById(id);

function parseKeywords(raw) {
  return String(raw || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function setStatus(text) {
  const el = $("status");
  if (el) el.textContent = text || "";
}

function applyEnabledUI(enabled) {
  document.body.classList.toggle("disabled", !enabled);
}

const DEFAULT_ON = {
  enabled: true,
  hidePromoted: true,
  hideSuggested: true,
  hideWhoToFollow: true,
  hidePremiumNags: true,
  hideGrokNags: true,
  hideTrendsInFeed: true,
  hideEngagementBait: true
};

function load() {
  chrome.storage.local.get(null, (data) => {
    for (const id of TOGGLE_IDS) {
      const el = $(id);
      if (!el) continue;
      const value = data[id] === undefined ? DEFAULT_ON[id] : !!data[id];
      el.checked = value;
    }

    $("customKeywords").value = Array.isArray(data.customKeywords)
      ? data.customKeywords.join(", ")
      : "";

    $("hiddenCount").textContent = String(data.hiddenCount || 0);
    applyEnabledUI($("enabled").checked);

    // session stats from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "getSessionStats" }, (resp) => {
        if (chrome.runtime.lastError) {
          $("sessionHidden").textContent = "—";
          return;
        }
        if (resp && typeof resp.sessionHidden === "number") {
          $("sessionHidden").textContent = String(resp.sessionHidden);
        }
      });
    });
  });
}

function savePartial(patch, done) {
  chrome.storage.local.set(patch, () => {
    if (done) done();
  });
}

function wire() {
  for (const id of TOGGLE_IDS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("change", () => {
      const value = el.checked;
      savePartial({ [id]: value }, () => {
        if (id === "enabled") applyEnabledUI(value);
        setStatus("Saved");
        setTimeout(() => setStatus(""), 900);
      });
    });
  }

  let kwTimer = null;
  $("customKeywords").addEventListener("input", () => {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(() => {
      const customKeywords = parseKeywords($("customKeywords").value);
      savePartial({ customKeywords }, () => {
        setStatus("Keywords saved");
        setTimeout(() => setStatus(""), 900);
      });
    }, 350);
  });

  $("rescan").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab?.id) {
        setStatus("No active tab");
        return;
      }
      const url = tab.url || "";
      if (!/https?:\/\/(www\.)?(x|twitter)\.com\//i.test(url)) {
        setStatus("Open x.com first");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "rescan" }, (resp) => {
        if (chrome.runtime.lastError) {
          setStatus("Reload x.com, then retry");
          return;
        }
        if (resp?.sessionHidden != null) {
          $("sessionHidden").textContent = String(resp.sessionHidden);
        }
        setStatus("Rescanned");
        setTimeout(() => setStatus(""), 900);
        // refresh all-time count
        chrome.storage.local.get(["hiddenCount"], (d) => {
          $("hiddenCount").textContent = String(d.hiddenCount || 0);
        });
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  load();
});
