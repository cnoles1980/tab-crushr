import test from "node:test";
import assert from "node:assert/strict";
import {
  TRACKING_WINDOW_MS,
  buildAchievementDefinitions,
  buildCleanupCandidates,
  evaluateAchievements,
  normalizeUrl,
  relatedAppGroup
} from "../src/cleanupEngine.js";

const now = Date.UTC(2026, 5, 24, 12, 0, 0);

function tab(id, url, overrides = {}) {
  return {
    id,
    windowId: 1,
    title: `Tab ${id}`,
    url,
    active: false,
    audible: false,
    pinned: false,
    incognito: false,
    lastAccessed: now - id * 1000,
    ...overrides
  };
}

function record(tabItem, overrides = {}) {
  return {
    tabId: tabItem.id,
    url: tabItem.url,
    normalizedUrl: normalizeUrl(tabItem.url),
    firstSeenAt: now - 30 * 60 * 1000,
    createdAt: now - 30 * 60 * 1000,
    lastNavigationAt: now - 30 * 60 * 1000,
    ...overrides
  };
}

function key(tabItem) {
  return `${tabItem.incognito ? "incognito" : "normal"}:${tabItem.id}`;
}

test("normalizes tracking params, fragments, and query order", () => {
  assert.equal(
    normalizeUrl("https://Example.com/path/?b=2&utm_source=x&a=1#section"),
    "https://example.com/path?a=1&b=2"
  );
});

test("detects duplicate tabs immediately and keeps the most recently accessed tab", () => {
  const older = tab(1, "https://example.com/docs?a=1&utm_medium=email", { lastAccessed: now - 10_000 });
  const newer = tab(2, "https://example.com/docs?a=1", { lastAccessed: now });
  const result = buildCleanupCandidates({
    tabs: [older, newer],
    records: {
      [key(older)]: record(older),
      [key(newer)]: record(newer)
    },
    settings: { trackingStartedAt: now },
    now
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].reason, "duplicate");
  assert.equal(result.candidates[0].tabId, older.id);
});

test("recognizes related Google Calendar tabs across different dates and views", () => {
  const week = tab(21, "https://calendar.google.com/calendar/u/0/r/week/2026/6/24");
  const month = tab(22, "https://calendar.google.com/calendar/u/0/r/month/2026/7/1", { lastAccessed: now });
  const result = buildCleanupCandidates({
    tabs: [week, month],
    records: {
      [key(week)]: record(week),
      [key(month)]: record(month)
    },
    settings: { trackingStartedAt: now },
    now
  });

  assert.equal(relatedAppGroup(week.url)?.label, "Google Calendar");
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.tabId).sort((a, b) => a - b),
    [week.id, month.id]
  );
  assert.ok(result.candidates.every((candidate) => candidate.reason === "related"));
});

test("recognizes related YouTube tabs even when the video URLs are different", () => {
  const firstVideo = tab(23, "https://www.youtube.com/watch?v=aaa");
  const secondVideo = tab(24, "https://youtu.be/bbb", { lastAccessed: now });
  const result = buildCleanupCandidates({
    tabs: [firstVideo, secondVideo],
    records: {
      [key(firstVideo)]: record(firstVideo),
      [key(secondVideo)]: record(secondVideo)
    },
    settings: { trackingStartedAt: now },
    now
  });

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.tabId).sort((a, b) => a - b),
    [firstVideo.id, secondVideo.id]
  );
  assert.ok(result.candidates.every((candidate) => candidate.reason === "related"));
  assert.ok(result.candidates.every((candidate) => candidate.groupLabel === "YouTube"));
});

test("recognizes related tabs for any same site", () => {
  const character = tab(27, "https://www.dndbeyond.com/characters/123456");
  const campaign = tab(28, "https://www.dndbeyond.com/campaigns/98765");
  const sourcebook = tab(29, "https://dndbeyond.com/sources/basic-rules", { lastAccessed: now });
  const result = buildCleanupCandidates({
    tabs: [character, campaign, sourcebook],
    records: {
      [key(character)]: record(character),
      [key(campaign)]: record(campaign),
      [key(sourcebook)]: record(sourcebook)
    },
    settings: { trackingStartedAt: now },
    now
  });

  assert.equal(relatedAppGroup(character.url)?.label, "dndbeyond.com");
  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.tabId).sort((a, b) => a - b),
    [character.id, campaign.id, sourcebook.id]
  );
  assert.ok(result.candidates.every((candidate) => candidate.reason === "related"));
  assert.ok(result.candidates.every((candidate) => candidate.groupLabel === "dndbeyond.com"));
});

test("includes active tabs in related same-site review groups", () => {
  const character = tab(30, "https://www.dndbeyond.com/characters/123456", { active: true });
  const campaign = tab(31, "https://www.dndbeyond.com/campaigns/98765");
  const sourcebook = tab(32, "https://dndbeyond.com/sources/basic-rules");
  const result = buildCleanupCandidates({
    tabs: [character, campaign, sourcebook],
    records: {
      [key(character)]: record(character),
      [key(campaign)]: record(campaign),
      [key(sourcebook)]: record(sourcebook)
    },
    settings: {
      trackingStartedAt: now,
      protectPinnedAudibleActive: true
    },
    now
  });

  assert.equal(result.candidates.length, 3);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.tabId).sort((a, b) => a - b),
    [character.id, campaign.id, sourcebook.id]
  );
  assert.ok(result.candidates.every((candidate) => candidate.reason === "related"));
  assert.equal(result.candidates.find((candidate) => candidate.tabId === character.id)?.active, true);
});

test("keeps allowlisted domains out of related same-site groups", () => {
  const first = tab(33, "https://docs.example.com/a");
  const second = tab(34, "https://docs.example.com/b");
  const result = buildCleanupCandidates({
    tabs: [first, second],
    records: {
      [key(first)]: record(first),
      [key(second)]: record(second)
    },
    settings: {
      trackingStartedAt: now,
      allowlistDomains: ["example.com"],
      protectPinnedAudibleActive: true
    },
    now
  });

  assert.equal(result.candidates.length, 0);
});

test("keeps exact duplicate matches ahead of broader related matches", () => {
  const older = tab(25, "https://www.youtube.com/watch?v=aaa&utm_source=email");
  const newer = tab(26, "https://www.youtube.com/watch?v=aaa", { lastAccessed: now });
  const result = buildCleanupCandidates({
    tabs: [older, newer],
    records: {
      [key(older)]: record(older),
      [key(newer)]: record(newer)
    },
    settings: { trackingStartedAt: now },
    now
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].reason, "duplicate");
  assert.equal(result.candidates[0].tabId, older.id);
});

test("does not propose stale tabs before the 72 hour tracking window is ready", () => {
  const stale = tab(3, "https://example.com/old");
  const result = buildCleanupCandidates({
    tabs: [stale],
    records: {
      [key(stale)]: record(stale, {
        firstSeenAt: now - TRACKING_WINDOW_MS,
        lastNavigationAt: now - TRACKING_WINDOW_MS
      })
    },
    settings: { trackingStartedAt: now - TRACKING_WINDOW_MS + 1 },
    now
  });

  assert.equal(result.trackingReady, false);
  assert.equal(result.candidates.length, 0);
});

test("proposes stale tabs after 72 hours without reload or navigation", () => {
  const stale = tab(4, "https://example.com/old");
  const result = buildCleanupCandidates({
    tabs: [stale],
    records: {
      [key(stale)]: record(stale, {
        firstSeenAt: now - TRACKING_WINDOW_MS - 10,
        lastNavigationAt: now - TRACKING_WINDOW_MS - 10
      })
    },
    settings: { trackingStartedAt: now - TRACKING_WINDOW_MS - 10 },
    now
  });

  assert.equal(result.trackingReady, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].reason, "stale");
});

test("detects older tabs superseded by a newer opened and closed tab", () => {
  const old = tab(5, "https://example.com/report");
  const oldRecord = record(old, {
    firstSeenAt: now - TRACKING_WINDOW_MS - 1000,
    lastNavigationAt: now - 60 * 60 * 1000
  });

  const result = buildCleanupCandidates({
    tabs: [old],
    records: {
      [key(old)]: oldRecord
    },
    recentlyClosed: [{
      normalizedUrl: normalizeUrl(old.url),
      openedAt: now - 60 * 60 * 1000,
      closedAt: now - 30 * 60 * 1000
    }],
    settings: { trackingStartedAt: now - TRACKING_WINDOW_MS - 1000 },
    now
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].reason, "superseded");
});

test("protects active, pinned, audible, and allowlisted tabs", () => {
  const active = tab(6, "https://keep.example.com/page", { active: true });
  const allowlisted = tab(7, "https://docs.example.com/page");
  const result = buildCleanupCandidates({
    tabs: [active, allowlisted],
    records: {
      [key(active)]: record(active, {
        firstSeenAt: now - TRACKING_WINDOW_MS - 1,
        lastNavigationAt: now - TRACKING_WINDOW_MS - 1
      }),
      [key(allowlisted)]: record(allowlisted, {
        firstSeenAt: now - TRACKING_WINDOW_MS - 1,
        lastNavigationAt: now - TRACKING_WINDOW_MS - 1
      })
    },
    settings: {
      trackingStartedAt: now - TRACKING_WINDOW_MS - 1,
      allowlistDomains: ["example.com"],
      protectPinnedAudibleActive: true
    },
    now
  });

  assert.equal(result.candidates.length, 0);
});

test("unlocks lifetime achievements from tab and memory totals", () => {
  const result = evaluateAchievements({
    tabsCrushed: 10,
    memorySavedMb: 1024,
    crushActions: 1,
    savedForLater: 0,
    achievementsUnlocked: []
  });

  assert.deepEqual(
    result.newlyUnlocked.map((achievement) => achievement.id),
    ["first_crush", "tab_tamer", "one_gig_lift"]
  );
  assert.ok(result.stats.achievementsUnlocked.includes("tab_tamer"));
});

test("does not re-announce already unlocked achievements", () => {
  const result = evaluateAchievements({
    tabsCrushed: 11,
    memorySavedMb: 1200,
    crushActions: 2,
    savedForLater: 0,
    achievementsUnlocked: ["first_crush", "tab_tamer", "one_gig_lift"]
  });

  assert.deepEqual(result.newlyUnlocked, []);
});

test("generates high tab milestones dynamically", () => {
  const definitions = buildAchievementDefinitions({ tabsCrushed: 4800 });
  const tabThresholds = definitions
    .filter((achievement) => achievement.metric === "tabsCrushed")
    .map((achievement) => achievement.threshold);

  assert.ok(tabThresholds.includes(250));
  assert.ok(tabThresholds.includes(500));
  assert.ok(tabThresholds.includes(1000));
  assert.ok(tabThresholds.includes(2500));
  assert.ok(tabThresholds.includes(5000));
  assert.ok(Math.max(...tabThresholds) > 5000);
});
