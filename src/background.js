import {
  DEFAULT_SETTINGS,
  DEFAULT_LIFETIME_STATS,
  buildCleanupCandidates,
  evaluateAchievements,
  mergeLifetimeStats,
  mergeSettings,
  normalizeUrl,
  tabStorageKey
} from "./cleanupEngine.js";

const SETTINGS_KEY = "settings";
const TAB_RECORDS_KEY = "tabRecords";
const RECENTLY_CLOSED_KEY = "recentlyClosed";
const AUDIT_LOG_KEY = "auditLog";
const SAVED_LATER_KEY = "savedLater";
const LIFETIME_STATS_KEY = "lifetimeStats";
const MAX_RECENTLY_CLOSED = 250;
const MAX_AUDIT_ITEMS = 100;
const MAX_SAVED_LATER = 100;
const CLOSED_TAB_RAM_MB = 120;
const DISCARDED_TAB_RAM_MB = 90;

const storage = chrome.storage;

async function getLocal(keys) {
  return storage.local.get(keys);
}

async function setLocal(values) {
  return storage.local.set(values);
}

async function getSession(keys) {
  if (!storage.session) {
    return getLocal(keys);
  }
  return storage.session.get(keys);
}

async function setSession(values) {
  if (!storage.session) {
    return setLocal(values);
  }
  return storage.session.set(values);
}

async function getSettings() {
  const result = await getLocal([SETTINGS_KEY]);
  const settings = mergeSettings(result[SETTINGS_KEY]);
  if (!settings.trackingStartedAt) {
    settings.trackingStartedAt = Date.now();
    await setLocal({ [SETTINGS_KEY]: settings });
  }
  return settings;
}

async function updateSettings(patch) {
  const settings = mergeSettings({ ...(await getSettings()), ...patch });
  await setLocal({ [SETTINGS_KEY]: settings });
  return settings;
}

async function getNormalState() {
  const result = await getLocal([TAB_RECORDS_KEY, RECENTLY_CLOSED_KEY, AUDIT_LOG_KEY, SAVED_LATER_KEY, LIFETIME_STATS_KEY]);
  return {
    records: result[TAB_RECORDS_KEY] || {},
    recentlyClosed: result[RECENTLY_CLOSED_KEY] || [],
    auditLog: result[AUDIT_LOG_KEY] || [],
    savedLater: result[SAVED_LATER_KEY] || [],
    lifetimeStats: mergeLifetimeStats(result[LIFETIME_STATS_KEY])
  };
}

async function getIncognitoState() {
  const result = await getSession([TAB_RECORDS_KEY, RECENTLY_CLOSED_KEY]);
  return {
    records: result[TAB_RECORDS_KEY] || {},
    recentlyClosed: result[RECENTLY_CLOSED_KEY] || []
  };
}

async function setRecords(records, incognito) {
  const target = incognito ? setSession : setLocal;
  await target({ [TAB_RECORDS_KEY]: records });
}

async function updateTabRecord(tab, patch = {}) {
  if (!tab || typeof tab.id !== "number") {
    return;
  }

  const now = Date.now();
  const key = tabStorageKey(tab);
  const state = tab.incognito ? await getIncognitoState() : await getNormalState();
  const existing = state.records[key] || {};
  const url = tab.url || existing.url || "";
  const record = {
    ...existing,
    tabId: tab.id,
    windowId: tab.windowId ?? existing.windowId,
    incognito: Boolean(tab.incognito),
    title: tab.title || existing.title || "",
    url,
    normalizedUrl: normalizeUrl(url),
    firstSeenAt: existing.firstSeenAt || now,
    createdAt: existing.createdAt || now,
    lastSeenAt: now,
    ...patch
  };

  state.records[key] = record;
  await setRecords(state.records, Boolean(tab.incognito));
}

async function removeTabRecord(tabId, removeInfo) {
  const incognito = Boolean(removeInfo?.isWindowClosing && false);
  await removeTabRecordFromStore(tabId, false);
  await removeTabRecordFromStore(tabId, true);
  void incognito;
}

async function removeTabRecordFromStore(tabId, incognito) {
  const state = incognito ? await getIncognitoState() : await getNormalState();
  const key = `${incognito ? "incognito" : "normal"}:${tabId}`;
  const record = state.records[key];
  if (!record) {
    return;
  }

  delete state.records[key];
  await setRecords(state.records, incognito);

  if (record.normalizedUrl) {
    const closed = {
      normalizedUrl: record.normalizedUrl,
      url: record.url,
      title: record.title,
      openedAt: record.firstSeenAt || record.createdAt,
      closedAt: Date.now(),
      incognito
    };
    await addRecentlyClosed(closed, incognito);
  }
}

async function addRecentlyClosed(item, incognito) {
  const state = incognito ? await getIncognitoState() : await getNormalState();
  const next = [item, ...state.recentlyClosed].slice(0, MAX_RECENTLY_CLOSED);
  const target = incognito ? setSession : setLocal;
  await target({ [RECENTLY_CLOSED_KEY]: next });
}

async function addAudit(items, action) {
  if (!items.length) {
    return;
  }

  const { auditLog } = await getNormalState();
  const now = Date.now();
  const estimatedRamMb = estimateRamSavings(1, action);
  const entries = items.map((candidate) => ({
    action,
    reason: candidate.reason,
    title: candidate.title,
    url: candidate.url,
    domain: candidate.domain,
    tabId: candidate.tabId,
    incognito: candidate.incognito,
    estimatedRamMb,
    at: now
  }));

  await setLocal({ [AUDIT_LOG_KEY]: [...entries, ...auditLog].slice(0, MAX_AUDIT_ITEMS) });
}

async function updateLifetimeStats(patch) {
  const normal = await getNormalState();
  const next = mergeLifetimeStats({
    ...normal.lifetimeStats,
    tabsCrushed: normal.lifetimeStats.tabsCrushed + Number(patch.tabsCrushed || 0),
    memorySavedMb: normal.lifetimeStats.memorySavedMb + Number(patch.memorySavedMb || 0),
    crushActions: normal.lifetimeStats.crushActions + Number(patch.crushActions || 0),
    savedForLater: normal.lifetimeStats.savedForLater + Number(patch.savedForLater || 0)
  });
  const evaluated = evaluateAchievements(next);
  await setLocal({ [LIFETIME_STATS_KEY]: evaluated.stats });
  return evaluated;
}

function estimateRamSavings(count, action) {
  return count * (action === "discard" ? DISCARDED_TAB_RAM_MB : CLOSED_TAB_RAM_MB);
}

function tabDescription(candidate) {
  const source = `${candidate.title || ""} ${candidate.domain || ""}`
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/[_-]+/g, " ")
    .trim();
  const words = source.split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length) {
    return words.join(" ");
  }
  return candidate.domain || "Saved tab";
}

function selectableItems(state) {
  return [...(state.candidates || []), ...(state.allTabs || [])];
}

async function saveForLater(candidateIds) {
  const state = await buildState();
  const selected = selectableItems(state).filter((candidate) => candidateIds.includes(candidate.id));
  const normal = await getNormalState();
  const existingKeys = new Set(normal.savedLater.map((item) => item.normalizedUrl || item.url));
  const additions = [];

  for (const candidate of selected) {
    const key = candidate.normalizedUrl || candidate.url;
    if (!key || existingKeys.has(key)) {
      continue;
    }
    existingKeys.add(key);
    additions.push({
      id: `${Date.now()}:${candidate.tabId}:${additions.length}`,
      description: tabDescription(candidate),
      title: candidate.title,
      url: candidate.url,
      normalizedUrl: candidate.normalizedUrl,
      domain: candidate.domain,
      savedAt: Date.now()
    });
  }

  if (additions.length) {
    await setLocal({ [SAVED_LATER_KEY]: [...additions, ...normal.savedLater].slice(0, MAX_SAVED_LATER) });
  }

  const achievements = additions.length
    ? await updateLifetimeStats({ savedForLater: additions.length })
    : evaluateAchievements(normal.lifetimeStats);
  return {
    ...(await buildState()),
    savedCount: additions.length,
    newlyUnlockedAchievements: achievements.newlyUnlocked
  };
}

async function removeSavedLater(id) {
  const normal = await getNormalState();
  await setLocal({ [SAVED_LATER_KEY]: normal.savedLater.filter((item) => item.id !== id) });
  return buildState();
}

async function queryTabs() {
  return chrome.tabs.query({});
}

async function syncCurrentTabs() {
  const tabs = await queryTabs();
  await Promise.all(tabs.map((tab) => updateTabRecord(tab)));
  return tabs;
}

async function getCombinedRecords() {
  const normal = await getNormalState();
  const incognito = await getIncognitoState();
  return {
    records: { ...normal.records, ...incognito.records },
    recentlyClosed: [...normal.recentlyClosed, ...incognito.recentlyClosed],
    auditLog: normal.auditLog,
    savedLater: normal.savedLater,
    lifetimeStats: normal.lifetimeStats
  };
}

function isAllowedIncognitoAccess() {
  return new Promise((resolve) => {
    chrome.extension.isAllowedIncognitoAccess(resolve);
  });
}

async function buildState() {
  const [settings, tabs, incognitoAllowed] = await Promise.all([
    getSettings(),
    syncCurrentTabs(),
    isAllowedIncognitoAccess()
  ]);
  const combined = await getCombinedRecords();
  const scanSettings = {
    ...settings,
    includeIncognito: settings.includeIncognito && incognitoAllowed
  };
  const result = buildCleanupCandidates({
    tabs,
    records: combined.records,
    recentlyClosed: combined.recentlyClosed,
    settings: scanSettings,
    now: Date.now()
  });
  const achievementState = evaluateAchievements(combined.lifetimeStats);

  return {
    settings,
    incognitoAllowed,
    tabsCount: tabs.filter((tab) => !tab.incognito || scanSettings.includeIncognito).length,
    auditLog: combined.auditLog,
    savedLater: combined.savedLater,
    lifetimeStats: achievementState.stats,
    achievements: achievementState.achievements,
    ramHeuristics: {
      closeMbPerTab: CLOSED_TAB_RAM_MB,
      discardMbPerTab: DISCARDED_TAB_RAM_MB
    },
    ...result
  };
}

async function applyCleanup(candidateIds, action) {
  const state = await buildState();
  const selected = selectableItems(state).filter((candidate) => candidateIds.includes(candidate.id));
  const successful = [];

  if (action === "discard") {
    for (const candidate of selected) {
      try {
        await chrome.tabs.discard(candidate.tabId);
        successful.push(candidate);
      } catch {
        // Active or special tabs may not be discardable by Chrome.
      }
    }
  } else {
    for (const candidate of selected) {
      try {
        await chrome.tabs.remove(candidate.tabId);
        successful.push(candidate);
      } catch {
        // The tab may have been closed manually after the review list was built.
      }
    }
  }

  const estimatedRamMb = estimateRamSavings(successful.length, action);
  await addAudit(successful, action);
  const achievements = successful.length
    ? await updateLifetimeStats({
      tabsCrushed: successful.length,
      memorySavedMb: estimatedRamMb,
      crushActions: 1
    })
    : evaluateAchievements(state.lifetimeStats || DEFAULT_LIFETIME_STATS);

  return {
    ...(await buildState()),
    newlyUnlockedAchievements: achievements.newlyUnlocked,
    lastActionStats: {
      action,
      count: successful.length,
      totalTabsAtScan: state.tabsCount,
      percent: state.tabsCount ? Math.round((successful.length / state.tabsCount) * 100) : 0,
      estimatedRamMb
    }
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await updateSettings({ ...DEFAULT_SETTINGS, ...settings, trackingStartedAt: settings.trackingStartedAt || Date.now() });
  const normal = await getNormalState();
  await setLocal({ [LIFETIME_STATS_KEY]: evaluateAchievements(normal.lifetimeStats).stats });
  await syncCurrentTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await getSettings();
  await syncCurrentTabs();
});

chrome.tabs.onCreated.addListener((tab) => {
  updateTabRecord(tab, { createdAt: Date.now(), firstSeenAt: Date.now(), lastNavigationAt: Date.now() });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const patch = {};
  if (changeInfo.url) {
    patch.url = changeInfo.url;
    patch.normalizedUrl = normalizeUrl(changeInfo.url);
    patch.lastNavigationAt = Date.now();
  }
  if (changeInfo.title) {
    patch.title = changeInfo.title;
  }
  if (changeInfo.status === "loading") {
    patch.lastNavigationAt = Date.now();
  }
  updateTabRecord({ ...tab, id: tabId }, patch);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateTabRecord(tab, { lastActivatedAt: Date.now() });
  } catch {
    // Tab may have disappeared between activation and lookup.
  }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  removeTabRecord(tabId, removeInfo);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || typeof details.tabId !== "number" || details.tabId < 0) {
    return;
  }

  chrome.tabs.get(details.tabId).then((tab) => {
    updateTabRecord(tab, {
      url: details.url || tab.url,
      normalizedUrl: normalizeUrl(details.url || tab.url),
      lastNavigationAt: Date.now(),
      lastTransitionType: details.transitionType
    });
  }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      return buildState();
    }

    if (message?.type === "UPDATE_SETTINGS") {
      await updateSettings(message.patch || {});
      return buildState();
    }

    if (message?.type === "APPLY_CLEANUP") {
      return applyCleanup(message.candidateIds || [], message.action || "close");
    }

    if (message?.type === "SAVE_FOR_LATER") {
      return saveForLater(message.candidateIds || []);
    }

    if (message?.type === "REMOVE_SAVED_LATER") {
      return removeSavedLater(message.id);
    }

    if (message?.type === "ADD_ALLOWLIST_DOMAIN") {
      const settings = await getSettings();
      const domain = String(message.domain || "").trim().toLowerCase();
      if (domain && !settings.allowlistDomains.includes(domain)) {
        await updateSettings({ allowlistDomains: [...settings.allowlistDomains, domain].sort() });
      }
      return buildState();
    }

    return { error: "Unknown message type" };
  })().then(sendResponse).catch((error) => {
    sendResponse({ error: error?.message || String(error) });
  });
  return true;
});
