/* Remove X Slop — content script for x.com / twitter.com */

(() => {
  "use strict";

  if (window.__RXS_LOADED__) return;
  window.__RXS_LOADED__ = true;

  const STORAGE_KEYS = [
    "enabled",
    "hidePromoted",
    "hideSuggested",
    "hideWhoToFollow",
    "hidePremiumNags",
    "hideGrokNags",
    "hideTrendsInFeed",
    "hideEngagementBait",
    "hideCommunityNotesSpam",
    "hideReplySpam",
    "customKeywords"
  ];

  const DEFAULTS = {
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
    customKeywords: []
  };

  /** Labels that mark algorithmic / ad / promo junk in the timeline */
  const SUGGESTED_LABELS = [
    "suggested for you",
    "recommended for you",
    "based on your likes",
    "based on your follows",
    "popular in your area",
    "might like",
    "you might like",
    "similar to posts you've liked"
  ];

  const WHO_TO_FOLLOW_LABELS = [
    "who to follow",
    "suggested accounts",
    "people you may know",
    "creators for you"
  ];

  const PREMIUM_NAG_LABELS = [
    "subscribe to premium",
    "upgrade to premium",
    "get verified",
    "get premium",
    "try premium",
    "x premium",
    "don't miss out on premium",
    "see fewer ads with premium"
  ];

  const GROK_NAG_LABELS = [
    "try grok",
    "ask grok",
    "grok something",
    "meet grok",
    "upgrade to super-grok",
    "super-grok"
  ];

  const TREND_LABELS = [
    "what's happening",
    "trending now",
    "trends for you",
    "live on x"
  ];

  const ENGAGEMENT_BAIT_PATTERNS = [
    /\b(like|rt|retweet|share)\s+(if|this)\b/i,
    /\bif you (agree|also|feel|think)\b.*\b(like|rt|retweet)\b/i,
    /\b(rt|retweet)\s+to\s+(save|spread|help|win)\b/i,
    /\b(comment|drop)\s+["']?.{0,20}["']?\s+(if|below)\b/i,
    /\b(1\s*like|one like)\s*=\s*1\b/i,
    /\b(tag|mention)\s+(someone|a friend|3 people)\b/i,
    /\bthis (will|is going to) (blow|go viral)\b/i,
    /\b(follow\s*back|f4f|l4l)\b/i,
    /\b(dm me|link in bio)\b/i
  ];

  let settings = { ...DEFAULTS };
  let observer = null;
  let scanScheduled = false;
  let sessionHidden = 0;

  // ——— storage ———

  function loadSettings(cb) {
    try {
      chrome.storage.local.get(STORAGE_KEYS, (data) => {
        settings = { ...DEFAULTS, ...data };
        if (!Array.isArray(settings.customKeywords)) {
          settings.customKeywords = [];
        }
        if (cb) cb();
      });
    } catch (_) {
      settings = { ...DEFAULTS };
      if (cb) cb();
    }
  }

  function bumpHidden(n = 1) {
    sessionHidden += n;
    try {
      chrome.runtime.sendMessage({ type: "incrementHidden", count: n });
    } catch (_) {
      /* ignore if extension context invalidated */
    }
  }

  // ——— helpers ———

  function normalizeText(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function visibleText(el, maxLen = 800) {
    if (!el) return "";
    const t = el.innerText || el.textContent || "";
    return t.length > maxLen ? t.slice(0, maxLen) : t;
  }

  function markHidden(el, reason) {
    if (!el || el.dataset.rxsHidden === "1") return false;
    el.dataset.rxsHidden = "1";
    el.dataset.rxsReason = reason || "slop";
    bumpHidden(1);
    return true;
  }

  function unhideAll() {
    document.querySelectorAll('[data-rxs-hidden="1"]').forEach((el) => {
      delete el.dataset.rxsHidden;
      delete el.dataset.rxsReason;
    });
  }

  function closestTimelineCell(el) {
    if (!el) return null;
    // Prefer a full timeline row / cell when possible
    return (
      el.closest('[data-testid="cellInnerDiv"]') ||
      el.closest("article") ||
      el.closest('[role="article"]') ||
      el
    );
  }

  function tweetText(article) {
    const body =
      article.querySelector('[data-testid="tweetText"]') ||
      article.querySelector('[lang]');
    return body ? body.innerText || "" : visibleText(article, 400);
  }

  function socialContextText(article) {
    // X often puts "Suggested for you" / "Promoted" above the tweet body
    const root = article.closest('[data-testid="cellInnerDiv"]') || article;
    const texts = [];
    root.querySelectorAll('span, div[dir="ltr"]').forEach((node) => {
      const t = (node.childNodes.length === 1 && node.textContent) || "";
      if (t && t.length < 80) texts.push(t);
    });
    // also scan first ~200 chars of the cell
    texts.push(visibleText(root, 220));
    return normalizeText(texts.join(" | "));
  }

  // ——— detectors ———

  function isPromoted(article) {
    if (article.querySelector('[data-testid="placementTracking"]')) return true;
    // "Promoted" label often appears as a small span
    const ctx = socialContextText(article);
    if (/\bpromoted\b/.test(ctx)) return true;
    // Aria / title paths
    if (article.querySelector('[aria-label*="Promoted" i]')) return true;
    return false;
  }

  function isSuggested(article) {
    const ctx = socialContextText(article);
    return SUGGESTED_LABELS.some((l) => ctx.includes(l));
  }

  function isEngagementBait(article) {
    const text = tweetText(article);
    if (!text || text.length < 8) return false;
    return ENGAGEMENT_BAIT_PATTERNS.some((re) => re.test(text));
  }

  function matchesCustomKeywords(article) {
    const kws = settings.customKeywords;
    if (!kws || !kws.length) return false;
    const text = normalizeText(visibleText(article, 1200));
    return kws.some((kw) => {
      const k = normalizeText(kw);
      return k && text.includes(k);
    });
  }

  function classifyTweet(article) {
    if (settings.hidePromoted && isPromoted(article)) return "promoted";
    if (settings.hideSuggested && isSuggested(article)) return "suggested";
    if (settings.hideEngagementBait && isEngagementBait(article)) {
      return "engagement-bait";
    }
    if (matchesCustomKeywords(article)) return "keyword";
    return null;
  }

  function isWhoToFollowBlock(node) {
    const text = normalizeText(visibleText(node, 300));
    if (!text) return false;
    // Exact-ish module headers
    if (
      WHO_TO_FOLLOW_LABELS.some((l) => text.includes(l)) &&
      (text.includes("follow") || text.includes("suggested"))
    ) {
      // Avoid nuking the whole page if "follow" appears in a real tweet
      const hasFollowButtons =
        node.querySelectorAll('[data-testid$="-follow"], [data-testid="placementTracking"]').length >= 1 ||
        node.querySelectorAll('button, [role="button"]').length >= 2;
      const shortModule = text.length < 600;
      return hasFollowButtons || shortModule;
    }
    // Dedicated testids sometimes used
    if (node.querySelector('[data-testid="UserCell"]') && text.includes("who to follow")) {
      return true;
    }
    return false;
  }

  function isPremiumNagBlock(node) {
    const text = normalizeText(visibleText(node, 400));
    if (!text) return false;
    return PREMIUM_NAG_LABELS.some((l) => text.includes(l));
  }

  function isGrokNagBlock(node) {
    const text = normalizeText(visibleText(node, 400));
    if (!text) return false;
    // Avoid hiding normal tweets that merely mention Grok once in passing
    // Prefer short promo modules / buttons
    const short = text.length < 500;
    const hasGrokLabel = GROK_NAG_LABELS.some((l) => text.includes(l));
    if (!hasGrokLabel) return false;
    // If it's a full tweet with substantial content, skip unless pure promo
    const isTweet = node.matches?.("article") || node.querySelector?.("article");
    if (isTweet && text.length > 180) return false;
    return short || !!node.querySelector('a[href*="grok"]');
  }

  function isTrendModule(node) {
    const text = normalizeText(visibleText(node, 250));
    if (!text) return false;
    if (!TREND_LABELS.some((l) => text.includes(l))) return false;
    // Trends modules list trend rows; real tweets rarely lead with "Trending now"
    return (
      text.length < 800 ||
      node.querySelectorAll('[data-testid="trend"]').length > 0
    );
  }

  // ——— scan ———

  function processArticle(article) {
    if (!article || article.dataset.rxsScanned === "1") {
      // re-check only if settings changed — handled by full rescan
      if (article.dataset.rxsHidden === "1") return;
    }
    article.dataset.rxsScanned = "1";

    const reason = classifyTweet(article);
    if (reason) {
      const cell = closestTimelineCell(article);
      markHidden(cell, reason);
    }
  }

  function processCell(cell) {
    if (!cell || cell.dataset.rxsHidden === "1") return;

    // Module-level junk (not a single tweet)
    if (settings.hideWhoToFollow && isWhoToFollowBlock(cell)) {
      markHidden(cell, "who-to-follow");
      return;
    }
    if (settings.hidePremiumNags && isPremiumNagBlock(cell)) {
      // Don't hide a normal tweet that mentions Premium once
      const isTweet = cell.querySelector('article[data-testid="tweet"]');
      const textLen = (cell.innerText || "").length;
      if (!isTweet || textLen < 220) {
        markHidden(cell, "premium-nag");
        return;
      }
    }
    if (settings.hideGrokNags && isGrokNagBlock(cell)) {
      markHidden(cell, "grok-nag");
      return;
    }
    if (settings.hideTrendsInFeed && isTrendModule(cell)) {
      // only hide if this looks like an in-feed module, not the Explore page header
      const onExplore = /\/explore/i.test(location.pathname);
      if (!onExplore) {
        markHidden(cell, "trend-module");
        return;
      }
    }

    const article =
      cell.matches?.('article[data-testid="tweet"]')
        ? cell
        : cell.querySelector?.('article[data-testid="tweet"], article[role="article"], article');
    if (article) processArticle(article);
  }

  function scan() {
    if (!settings.enabled) return;

    // Timeline tweets
    document
      .querySelectorAll('article[data-testid="tweet"], article[role="article"]')
      .forEach(processArticle);

    // Timeline cells (modules + tweets)
    document.querySelectorAll('[data-testid="cellInnerDiv"]').forEach(processCell);

    // Standalone promo banners outside cells
    document
      .querySelectorAll('[data-testid="placementTracking"]')
      .forEach((el) => {
        if (settings.hidePromoted) {
          markHidden(closestTimelineCell(el), "promoted");
        }
      });

    // Aside "Who to follow" / "What's happening" on desktop — optional
    // Only hide in-feed clones; leave right rail alone so navigation stays familiar
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  function fullRescan() {
    // Clear scan markers so classification re-runs under new settings
    document.querySelectorAll("[data-rxs-scanned]").forEach((el) => {
      delete el.dataset.rxsScanned;
    });
    unhideAll();
    sessionHidden = 0;
    if (settings.enabled) scan();
  }

  function startObserver() {
    if (observer) observer.disconnect();
    const root = document.body || document.documentElement;
    observer = new MutationObserver((mutations) => {
      if (!settings.enabled) return;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          scheduleScan();
          break;
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  // ——— messages / storage updates ———

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      let relevant = false;
      for (const key of STORAGE_KEYS) {
        if (key in changes) {
          settings[key] = changes[key].newValue;
          relevant = true;
        }
      }
      if (relevant) fullRescan();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "rescan") {
        fullRescan();
        sendResponse({ ok: true, sessionHidden });
        return true;
      }
      if (msg?.type === "getSessionStats") {
        sendResponse({ sessionHidden });
        return true;
      }
      return false;
    });
  } catch (_) {
    /* extension context may be unavailable in some edge cases */
  }

  // SPA navigation on X: path changes without full reload
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // give React a moment to paint
      setTimeout(fullRescan, 400);
    }
  }, 800);

  // boot
  loadSettings(() => {
    startObserver();
    scan();
    // a couple of delayed passes for late-rendered timeline
    setTimeout(scan, 800);
    setTimeout(scan, 2000);
  });
})();
