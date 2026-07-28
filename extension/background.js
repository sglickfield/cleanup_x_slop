/* Remove X Slop — background service worker */

const DEFAULT_SETTINGS = {
  enabled: true,
  hidePromoted: true,
  hideSuggested: true,
  hideWhoToFollow: true,
  hidePremiumNags: true,
  hideGrokNags: true,
  hideTrendsInFeed: true,
  hideEngagementBait: true,
  hideCommunityNotesSpam: false,
  hideReplySpam: false,
  customKeywords: [],
  hiddenCount: 0
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (existing) => {
    const merged = { ...DEFAULT_SETTINGS, ...existing };
    // never reset hiddenCount on upgrade if present
    if (typeof existing.hiddenCount !== "number") {
      merged.hiddenCount = 0;
    }
    chrome.storage.local.set(merged);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getDefaults") {
    sendResponse({ defaults: DEFAULT_SETTINGS });
    return true;
  }
  if (message?.type === "incrementHidden") {
    const n = Number(message.count) || 1;
    chrome.storage.local.get(["hiddenCount"], (data) => {
      const next = (data.hiddenCount || 0) + n;
      chrome.storage.local.set({ hiddenCount: next }, () => {
        sendResponse({ hiddenCount: next });
      });
    });
    return true;
  }
  return false;
});
