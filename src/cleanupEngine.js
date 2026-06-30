export const TRACKING_WINDOW_MS = 72 * 60 * 60 * 1000;

export const DEFAULT_LIFETIME_STATS = {
  tabsCrushed: 0,
  memorySavedMb: 0,
  crushActions: 0,
  savedForLater: 0,
  achievementsUnlocked: []
};

const COUNT_LADDER = [250, 500, 1000, 2500, 5000];

const NAMED_ACHIEVEMENTS = new Map([
  ["tabsCrushed:1", ["first_crush", "First Crush"]],
  ["tabsCrushed:10", ["tab_tamer", "Tab Tamer"]],
  ["tabsCrushed:25", ["window_wrangler", "Window Wrangler"]],
  ["tabsCrushed:100", ["century_crusher", "Century Crusher"]],
  ["memorySavedMb:1024", ["one_gig_lift", "One Gig Lift"]],
  ["memorySavedMb:5120", ["ram_reclaimer", "RAM Reclaimer"]],
  ["crushActions:10", ["clean_sweep", "Clean Sweep"]],
  ["savedForLater:10", ["later_stack", "Later Stack"]]
]);

export const DEFAULT_SETTINGS = {
  trackingStartedAt: 0,
  includeIncognito: false,
  discardInsteadOfClose: false,
  protectPinnedAudibleActive: true,
  allowlistDomains: []
};

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid"
]);

const RELATED_APP_RULES = [
  {
    label: "Google Calendar",
    match(parsed) {
      return parsed.hostname === "calendar.google.com" && parsed.pathname.startsWith("/calendar");
    }
  },
  {
    label: "Gmail",
    match(parsed) {
      return parsed.hostname === "mail.google.com";
    }
  },
  {
    label: "Google Drive",
    match(parsed) {
      return parsed.hostname === "drive.google.com";
    }
  },
  {
    label: "Google Docs",
    match(parsed) {
      return parsed.hostname === "docs.google.com" && [
        "/document",
        "/spreadsheets",
        "/presentation",
        "/forms",
        "/drawings"
      ].some((prefix) => parsed.pathname.startsWith(prefix));
    }
  },
  {
    label: "Google Maps",
    match(parsed) {
      return parsed.hostname === "google.com" && parsed.pathname.startsWith("/maps");
    }
  },
  {
    label: "Google Search",
    match(parsed) {
      return parsed.hostname === "google.com" && parsed.pathname === "/search";
    }
  },
  {
    label: "YouTube",
    match(parsed) {
      return (
        parsed.hostname === "youtube.com" ||
        parsed.hostname === "www.youtube.com" ||
        parsed.hostname === "m.youtube.com" ||
        parsed.hostname === "youtu.be"
      );
    }
  }
];

export function isCleanableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeUrl(url) {
  if (!isCleanableUrl(url)) {
    return null;
  }

  const parsed = new URL(url);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();

  const keptParams = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("utm_") || TRACKING_PARAMS.has(lowerKey)) {
      continue;
    }
    keptParams.push([key, value]);
  }

  keptParams.sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    return keyCompare || aValue.localeCompare(bValue);
  });

  parsed.search = "";
  for (const [key, value] of keptParams) {
    parsed.searchParams.append(key, value);
  }

  let pathname = parsed.pathname || "/";
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, "");
  }

  const port = parsed.port ? `:${parsed.port}` : "";
  const query = parsed.searchParams.toString();
  return `${parsed.protocol}//${parsed.hostname}${port}${pathname}${query ? `?${query}` : ""}`;
}

function relatedHostname(hostname) {
  return hostname.toLowerCase().replace(/^(www|m)\./, "");
}

export function relatedAppGroup(url) {
  if (!isCleanableUrl(url)) {
    return null;
  }

  const parsed = new URL(url);
  parsed.hostname = relatedHostname(parsed.hostname);
  const rule = RELATED_APP_RULES.find((item) => item.match(parsed));

  if (rule) {
    return {
      key: `related:${rule.label.toLowerCase().replace(/\s+/g, "-")}`,
      label: rule.label
    };
  }

  const label = parsed.hostname;
  return {
    key: `related:site:${label}`,
    label
  };
}

export function getDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function matchesAllowlist(domain, allowlistDomains = []) {
  return allowlistDomains.some((entry) => {
    const normalized = String(entry || "").trim().toLowerCase();
    return normalized && (domain === normalized || domain.endsWith(`.${normalized}`));
  });
}

export function tabStorageKey(tab) {
  return `${tab.incognito ? "incognito" : "normal"}:${tab.id}`;
}

export function mergeSettings(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function mergeLifetimeStats(stats = {}) {
  return {
    ...DEFAULT_LIFETIME_STATS,
    ...stats,
    achievementsUnlocked: Array.isArray(stats.achievementsUnlocked) ? stats.achievementsUnlocked : []
  };
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function formatMemoryThreshold(mb) {
  if (mb >= 1024 * 1024) {
    return `${formatCompactNumber(mb / (1024 * 1024))} TB`;
  }
  return `${formatCompactNumber(mb / 1024)} GB`;
}

function countThresholds(baseThresholds, current, minimumMax = 5000) {
  const thresholds = new Set(baseThresholds);
  let multiplier = 1;
  let highest = Math.max(...thresholds);
  const target = Math.max(minimumMax, Number(current || 0) * 1.25);

  while (highest < target) {
    for (const step of COUNT_LADDER) {
      const threshold = step * multiplier;
      thresholds.add(threshold);
      highest = Math.max(highest, threshold);
    }
    multiplier *= 10;
  }

  return [...thresholds].sort((a, b) => a - b);
}

function memoryThresholds(current) {
  const thresholds = new Set([1024, 5120, 10240, 25600, 51200, 102400, 256000, 512000]);
  let highest = Math.max(...thresholds);
  const target = Math.max(512000, Number(current || 0) * 1.25);

  while (highest < target) {
    highest *= 2;
    thresholds.add(highest);
  }

  return [...thresholds].sort((a, b) => a - b);
}

function namedAchievement(metric, threshold, fallbackName) {
  const named = NAMED_ACHIEVEMENTS.get(`${metric}:${threshold}`);
  if (named) {
    return { id: named[0], name: named[1] };
  }
  return {
    id: `${metric}_${threshold}`,
    name: fallbackName
  };
}

function pluralize(noun, value) {
  return value === 1 ? noun : `${noun}s`;
}

function countAchievement(metric, threshold, nameNoun, description, verb) {
  const label = formatCompactNumber(threshold);
  const named = namedAchievement(metric, threshold, `${label} ${nameNoun}`);
  return {
    ...named,
    description: typeof description === "function"
      ? description(label, threshold)
      : `${verb} ${label} ${pluralize(description, threshold)}.`,
    metric,
    threshold
  };
}

function memoryAchievement(threshold) {
  const label = formatMemoryThreshold(threshold);
  const named = namedAchievement("memorySavedMb", threshold, `${label} Lift`);
  return {
    ...named,
    description: `Save roughly ${label} of memory.`,
    metric: "memorySavedMb",
    threshold
  };
}

export function buildAchievementDefinitions(stats = {}) {
  const merged = mergeLifetimeStats(stats);
  return [
    ...countThresholds([1, 10, 25, 100], merged.tabsCrushed)
      .map((threshold) => countAchievement("tabsCrushed", threshold, "Tab Crusher", "tab", "Crush")),
    ...memoryThresholds(merged.memorySavedMb).map(memoryAchievement),
    ...countThresholds([10, 25, 50, 100], merged.crushActions)
      .map((threshold) => countAchievement("crushActions", threshold, "Crush Session", "session", "Run")),
    ...countThresholds([10, 25, 50, 100], merged.savedForLater)
      .map((threshold) => countAchievement(
        "savedForLater",
        threshold,
        "Later Stack",
        (label) => `Save ${label} tabs for later.`,
        "Save"
      ))
  ];
}

export function evaluateAchievements(stats = {}) {
  const merged = mergeLifetimeStats(stats);
  const unlocked = new Set(merged.achievementsUnlocked);
  const newlyUnlocked = [];
  const achievements = buildAchievementDefinitions(merged);

  for (const achievement of achievements) {
    if (Number(merged[achievement.metric] || 0) >= achievement.threshold && !unlocked.has(achievement.id)) {
      unlocked.add(achievement.id);
      newlyUnlocked.push(achievement);
    }
  }

  return {
    stats: {
      ...merged,
      achievementsUnlocked: [...unlocked]
    },
    achievements: achievements.map((achievement) => {
      const current = Number(merged[achievement.metric] || 0);
      return {
        ...achievement,
        current,
        remaining: Math.max(0, achievement.threshold - current),
        unlocked: unlocked.has(achievement.id),
        progress: Math.min(1, current / achievement.threshold)
      };
    }),
    newlyUnlocked
  };
}

export function isProtectedTab(tab, settings = DEFAULT_SETTINGS) {
  if (!isCleanableUrl(tab.url)) {
    return true;
  }

  if (settings.protectPinnedAudibleActive && (tab.pinned || tab.audible || tab.active)) {
    return true;
  }

  return matchesAllowlist(getDomain(tab.url), settings.allowlistDomains);
}

function getRecord(records, tab) {
  return records[tabStorageKey(tab)] || records[String(tab.id)] || {};
}

function getTabSortTime(item) {
  return Number(
    item.tab.lastAccessed ||
      item.record.lastActivatedAt ||
      item.record.lastNavigationAt ||
      item.record.firstSeenAt ||
      item.record.createdAt ||
      0
  );
}

function chooseDuplicateKeeper(items) {
  return [...items].sort((a, b) => {
    const aProtected = Number(isProtectedTab(a.tab, a.settings));
    const bProtected = Number(isProtectedTab(b.tab, b.settings));
    if (aProtected !== bProtected) {
      return bProtected - aProtected;
    }

    if (Number(a.tab.active) !== Number(b.tab.active)) {
      return Number(b.tab.active) - Number(a.tab.active);
    }

    if (Number(a.tab.pinned) !== Number(b.tab.pinned)) {
      return Number(b.tab.pinned) - Number(a.tab.pinned);
    }

    return getTabSortTime(b) - getTabSortTime(a);
  })[0];
}

function makeCandidate(reason, tab, record, normalizedUrl, details, now, extra = {}) {
  const lastNavigationAt = Number(record.lastNavigationAt || record.lastReloadAt || record.firstSeenAt || 0);
  return {
    id: `${reason}:${tab.id}:${normalizedUrl}`,
    reason,
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || normalizedUrl,
    url: tab.url,
    domain: getDomain(tab.url),
    normalizedUrl,
    incognito: Boolean(tab.incognito),
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    ageMs: Math.max(0, now - Number(record.firstSeenAt || record.createdAt || now)),
    lastNavigationAt,
    details,
    ...extra
  };
}

export function buildCleanupCandidates(input) {
  const now = Number(input.now || Date.now());
  const settings = mergeSettings(input.settings);
  const tabs = input.tabs || [];
  const records = input.records || {};
  const recentlyClosed = input.recentlyClosed || [];
  const trackingReady = Boolean(settings.trackingStartedAt && now - settings.trackingStartedAt >= TRACKING_WINDOW_MS);
  const candidatesByTab = new Map();
  const normalizedItems = [];

  for (const tab of tabs) {
    if (tab.incognito && !settings.includeIncognito) {
      continue;
    }

    const normalizedUrl = normalizeUrl(tab.url);
    if (!normalizedUrl) {
      continue;
    }

    const record = getRecord(records, tab);
    normalizedItems.push({ tab, record, normalizedUrl, settings });
  }

  const groups = new Map();
  for (const item of normalizedItems) {
    const group = groups.get(item.normalizedUrl) || [];
    group.push(item);
    groups.set(item.normalizedUrl, group);
  }

  for (const [normalizedUrl, group] of groups.entries()) {
    if (group.length < 2) {
      continue;
    }

    const keeper = chooseDuplicateKeeper(group);
    for (const item of group) {
      if (item.tab.id === keeper.tab.id || isProtectedTab(item.tab, settings)) {
        continue;
      }

      candidatesByTab.set(item.tab.id, makeCandidate(
        "duplicate",
        item.tab,
        item.record,
        normalizedUrl,
        `Duplicate of tab ${keeper.tab.id}`,
        now
      ));
    }
  }

  const relatedGroups = new Map();
  for (const item of normalizedItems) {
    const related = relatedAppGroup(item.tab.url);
    if (!related) {
      continue;
    }

    const group = relatedGroups.get(related.key) || { related, items: [] };
    group.items.push(item);
    relatedGroups.set(related.key, group);
  }

  for (const group of relatedGroups.values()) {
    if (group.items.length < 2) {
      continue;
    }

    const relatedSettings = { ...settings, protectPinnedAudibleActive: false };
    const distinctUrls = new Set(group.items.map((item) => item.normalizedUrl));
    if (distinctUrls.size < 2) {
      continue;
    }

    for (const item of group.items) {
      if (
        candidatesByTab.has(item.tab.id) ||
        isProtectedTab(item.tab, relatedSettings)
      ) {
        continue;
      }

      candidatesByTab.set(item.tab.id, makeCandidate(
        "related",
        item.tab,
        item.record,
        item.normalizedUrl,
        `Multiple ${group.related.label} tabs are open (${group.items.length} total)`,
        now,
        { groupLabel: group.related.label }
      ));
    }
  }

  if (trackingReady) {
    for (const item of normalizedItems) {
      if (candidatesByTab.has(item.tab.id) || isProtectedTab(item.tab, settings)) {
        continue;
      }

      const firstSeenAt = Number(item.record.firstSeenAt || item.record.createdAt || 0);
      const lastNavigationAt = Number(item.record.lastNavigationAt || item.record.lastReloadAt || firstSeenAt);
      if (firstSeenAt && lastNavigationAt && now - lastNavigationAt >= TRACKING_WINDOW_MS) {
        candidatesByTab.set(item.tab.id, makeCandidate(
          "stale",
          item.tab,
          item.record,
          item.normalizedUrl,
          "No tracked reload or navigation in 72+ hours",
          now
        ));
      }
    }

    for (const item of normalizedItems) {
      if (candidatesByTab.has(item.tab.id) || isProtectedTab(item.tab, settings)) {
        continue;
      }

      const firstSeenAt = Number(item.record.firstSeenAt || item.record.createdAt || 0);
      const supersedingClose = recentlyClosed.find((closed) => (
        closed.normalizedUrl === item.normalizedUrl &&
        Number(closed.openedAt || 0) > firstSeenAt &&
        Number(closed.closedAt || 0) > firstSeenAt
      ));

      if (firstSeenAt && supersedingClose) {
        candidatesByTab.set(item.tab.id, makeCandidate(
          "superseded",
          item.tab,
          item.record,
          item.normalizedUrl,
          "Same page was opened and closed in a newer tab",
          now
        ));
      }
    }
  }

  return {
    trackingReady,
    trackingAgeMs: settings.trackingStartedAt ? Math.max(0, now - settings.trackingStartedAt) : 0,
    candidates: [...candidatesByTab.values()].sort((a, b) => (
      a.reason.localeCompare(b.reason) ||
      String(a.groupLabel || a.domain).localeCompare(String(b.groupLabel || b.domain)) ||
      a.domain.localeCompare(b.domain) ||
      a.title.localeCompare(b.title)
    ))
  };
}

export function summarizeCandidates(candidates) {
  return candidates.reduce((summary, candidate) => {
    summary[candidate.reason] = (summary[candidate.reason] || 0) + 1;
    return summary;
  }, {});
}
