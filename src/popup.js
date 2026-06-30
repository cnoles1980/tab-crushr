const state = {
  candidates: [],
  hiddenCandidateIds: new Set(),
  selectedCandidateIds: new Set(),
  lastScanState: null
};

const elements = {
  trackingStatus: document.querySelector("#trackingStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  includeIncognito: document.querySelector("#includeIncognito"),
  discardInsteadOfClose: document.querySelector("#discardInsteadOfClose"),
  protectPinnedAudibleActive: document.querySelector("#protectPinnedAudibleActive"),
  notice: document.querySelector("#notice"),
  candidateCount: document.querySelector("#candidateCount"),
  tabCount: document.querySelector("#tabCount"),
  selectedPercent: document.querySelector("#selectedPercent"),
  ramSavings: document.querySelector("#ramSavings"),
  impactText: document.querySelector("#impactText"),
  lifetimeTabs: document.querySelector("#lifetimeTabs"),
  lifetimeRam: document.querySelector("#lifetimeRam"),
  achievementList: document.querySelector("#achievementList"),
  earnedAchievementList: document.querySelector("#earnedAchievementList"),
  candidateList: document.querySelector("#candidateList"),
  keepButton: document.querySelector("#keepButton"),
  saveButton: document.querySelector("#saveButton"),
  crushButton: document.querySelector("#crushButton"),
  savedLaterList: document.querySelector("#savedLaterList"),
  auditLog: document.querySelector("#auditLog")
};

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function formatDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

function formatDate(ms) {
  if (!ms) {
    return "unknown";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(ms));
}

function reasonLabel(reason) {
  return {
    duplicate: "Duplicates",
    related: "Related tabs",
    stale: "Stale tabs",
    superseded: "Superseded tabs"
  }[reason] || reason;
}

function selectedVisibleCandidates() {
  return state.candidates.filter((candidate) => (
    state.selectedCandidateIds.has(candidate.id) &&
    !state.hiddenCandidateIds.has(candidate.id)
  ));
}

function estimateSelectedRamMb() {
  const heuristics = state.lastScanState?.ramHeuristics || { closeMbPerTab: 120, discardMbPerTab: 90 };
  const perTab = elements.discardInsteadOfClose.checked ? heuristics.discardMbPerTab : heuristics.closeMbPerTab;
  return selectedVisibleCandidates().length * perTab;
}

function formatRam(mb) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function syncActionButtons() {
  const selected = selectedVisibleCandidates();
  const hasSelection = selected.length > 0;
  const totalTabs = state.lastScanState?.tabsCount || 0;
  const percent = totalTabs ? Math.round((selected.length / totalTabs) * 100) : 0;
  elements.keepButton.disabled = !hasSelection;
  elements.saveButton.disabled = !hasSelection;
  elements.crushButton.disabled = !hasSelection;
  elements.selectedPercent.textContent = `${percent}%`;
  elements.ramSavings.textContent = formatRam(estimateSelectedRamMb());
}

function renderNotice(scanState) {
  const notices = [];
  const remainingMs = Math.max(0, 72 * 60 * 60 * 1000 - scanState.trackingAgeMs);

  if (!scanState.trackingReady) {
    notices.push(`Stale and superseded checks unlock after 72 hours of tracking. About ${formatDuration(remainingMs)} remaining.`);
  }

  if (scanState.settings.includeIncognito && !scanState.incognitoAllowed) {
    notices.push("Incognito scanning is toggled on here, but Chrome has not granted this extension incognito access yet.");
  }

  elements.notice.hidden = notices.length === 0;
  elements.notice.textContent = notices.join(" ");
}

function groupBy(items, keyFn) {
  if (Map.groupBy) {
    return Map.groupBy(items, keyFn);
  }

  return items.reduce((map, item) => {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
    return map;
  }, new Map());
}

function renderCandidateRow(candidate) {
  const row = document.createElement("article");
  row.className = "candidate";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedCandidateIds.has(candidate.id);
  checkbox.setAttribute("aria-label", `Select ${candidate.title}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedCandidateIds.add(candidate.id);
    } else {
      state.selectedCandidateIds.delete(candidate.id);
    }
    syncActionButtons();
  });

  const main = document.createElement("div");
  const heading = document.createElement("h3");
  heading.className = "candidateTitle";
  heading.title = candidate.title;
  heading.textContent = candidate.title;

  const meta = document.createElement("div");
  meta.className = "meta";
  const stateNotes = [
    candidate.active ? "ACTIVE" : "",
    candidate.pinned ? "pinned" : "",
    candidate.audible ? "audible" : "",
    candidate.incognito ? "incognito" : ""
  ].filter(Boolean);
  meta.textContent = [
    ...stateNotes,
    candidate.domain,
    `age ${formatDuration(candidate.ageMs)}`,
    `last nav ${formatDate(candidate.lastNavigationAt)}`
  ].join(" | ");

  const url = document.createElement("div");
  url.className = "url";
  url.textContent = candidate.url;

  main.append(heading, meta, url);

  const keepDomain = document.createElement("button");
  keepDomain.className = "domainButton";
  keepDomain.type = "button";
  keepDomain.textContent = "Always keep domain";
  keepDomain.addEventListener("click", async () => {
    await sendMessage({ type: "ADD_ALLOWLIST_DOMAIN", domain: candidate.domain });
    await refresh();
  });

  row.append(checkbox, main, keepDomain);
  return row;
}

function renderCandidateGroup(parent, reason, candidates) {
  if (reason !== "related") {
    for (const candidate of candidates) {
      parent.append(renderCandidateRow(candidate));
    }
    return;
  }

  const siteGroups = groupBy(candidates, (candidate) => candidate.groupLabel || candidate.domain);
  for (const [site, siteCandidates] of siteGroups.entries()) {
    const siteGroup = document.createElement("details");
    siteGroup.className = "siteGroup";
    siteGroup.open = true;

    const siteTitle = document.createElement("summary");
    siteTitle.className = "siteTitle";
    siteTitle.textContent = `${site} (${siteCandidates.length})`;
    siteGroup.append(siteTitle);

    for (const candidate of siteCandidates) {
      siteGroup.append(renderCandidateRow(candidate));
    }

    parent.append(siteGroup);
  }
}

function renderCandidates() {
  const visible = state.candidates.filter((candidate) => !state.hiddenCandidateIds.has(candidate.id));
  elements.candidateCount.textContent = String(visible.length);
  elements.candidateList.textContent = "";

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No cleanup candidates right now.";
    elements.candidateList.append(empty);
    syncActionButtons();
    return;
  }

  const groups = groupBy(visible, (candidate) => candidate.reason);

  for (const [reason, candidates] of groups.entries()) {
    const group = document.createElement("section");
    group.className = "reasonGroup";

    const title = document.createElement("h2");
    title.className = "reasonTitle";
    title.textContent = `${reasonLabel(reason)} (${candidates.length})`;
    group.append(title);

    renderCandidateGroup(group, reason, candidates);
    elements.candidateList.append(group);
  }

  syncActionButtons();
}

function renderImpact(scanState) {
  const unlocks = scanState.newlyUnlockedAchievements || [];
  const unlockText = unlocks.length
    ? ` Achievement unlocked: ${unlocks.map((achievement) => achievement.name).join(", ")}.`
    : "";
  const stats = scanState.lastActionStats;
  if (stats) {
    const verb = stats.action === "discard" ? "Discarded" : "Crushed";
    elements.impactText.hidden = false;
    elements.impactText.textContent = `${verb} ${stats.count} tab${stats.count === 1 ? "" : "s"} (${stats.percent}% of scanned tabs), freeing about ${formatRam(stats.estimatedRamMb)}.${unlockText}`;
    return;
  }

  if (typeof scanState.savedCount === "number") {
    elements.impactText.hidden = false;
    elements.impactText.textContent = scanState.savedCount
      ? `Saved ${scanState.savedCount} new tab${scanState.savedCount === 1 ? "" : "s"} for later.${unlockText}`
      : "Those tabs were already saved for later.";
    return;
  }

  elements.impactText.hidden = true;
  elements.impactText.textContent = "";
}

function renderLifetime(scanState) {
  const stats = scanState.lifetimeStats || {};
  elements.lifetimeTabs.textContent = formatNumber(stats.tabsCrushed);
  elements.lifetimeRam.textContent = formatRam(stats.memorySavedMb || 0);
}

function renderAchievements(achievements = []) {
  elements.achievementList.textContent = "";
  elements.earnedAchievementList.textContent = "";

  if (!achievements.length) {
    const empty = document.createElement("div");
    empty.className = "achievementEmpty";
    empty.textContent = "Crush tabs to unlock achievements.";
    elements.achievementList.append(empty);
    return;
  }

  const nextMilestones = achievements
    .filter((achievement) => !achievement.unlocked)
    .sort((a, b) => (
      b.progress - a.progress ||
      a.remaining - b.remaining ||
      a.threshold - b.threshold
    ))
    .slice(0, 2);
  const earnedAchievements = achievements
    .filter((achievement) => achievement.unlocked)
    .sort((a, b) => (
      a.metric.localeCompare(b.metric) ||
      a.threshold - b.threshold
    ));

  if (!nextMilestones.length) {
    const empty = document.createElement("div");
    empty.className = "achievementEmpty";
    empty.textContent = "All visible milestones unlocked. New ones appear as your totals grow.";
    elements.achievementList.append(empty);
  }

  for (const achievement of nextMilestones) {
    const item = document.createElement("div");
    item.className = "achievement locked";

    const badge = document.createElement("div");
    badge.className = "achievementBadge";
    badge.textContent = `${Math.round((achievement.progress || 0) * 100)}%`;
    badge.title = "Progress";

    const body = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = achievement.name;

    const description = document.createElement("span");
    description.textContent = `${formatNumber(achievement.remaining)} to go - ${achievement.description}`;

    body.append(title, description);
    item.append(badge, body);
    elements.achievementList.append(item);
  }

  if (!earnedAchievements.length) {
    const empty = document.createElement("div");
    empty.className = "achievementEmpty";
    empty.textContent = "No earned achievements yet.";
    elements.earnedAchievementList.append(empty);
    return;
  }

  for (const achievement of earnedAchievements) {
    const item = document.createElement("div");
    item.className = "achievement unlocked";

    const badge = document.createElement("div");
    badge.className = "achievementBadge";
    badge.textContent = "OK";
    badge.title = "Unlocked";

    const body = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = achievement.name;

    const description = document.createElement("span");
    description.textContent = achievement.description;

    body.append(title, description);
    item.append(badge, body);
    elements.earnedAchievementList.append(item);
  }
}

function renderSavedLater(savedLater = []) {
  elements.savedLaterList.textContent = "";
  if (!savedLater.length) {
    const empty = document.createElement("div");
    empty.className = "savedEmpty";
    empty.textContent = "Nothing saved yet.";
    elements.savedLaterList.append(empty);
    return;
  }

  for (const item of savedLater.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "savedItem";

    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.description;
    link.title = item.url;

    const meta = document.createElement("span");
    meta.textContent = item.domain;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      const scanState = await sendMessage({ type: "REMOVE_SAVED_LATER", id: item.id });
      applyState(scanState);
    });

    row.append(link, meta, remove);
    elements.savedLaterList.append(row);
  }
}

function renderAudit(auditLog = []) {
  elements.auditLog.textContent = "";
  if (!auditLog.length) {
    const empty = document.createElement("div");
    empty.className = "auditItem";
    empty.textContent = "No cleanup actions yet.";
    elements.auditLog.append(empty);
    return;
  }

  for (const item of auditLog.slice(0, 12)) {
    const line = document.createElement("div");
    line.className = "auditItem";
    line.textContent = `${formatDate(item.at)}: ${item.action} ${item.domain} (${item.reason}, ~${formatRam(item.estimatedRamMb || 0)})`;
    elements.auditLog.append(line);
  }
}

function applyState(scanState) {
  if (scanState.error) {
    elements.notice.hidden = false;
    elements.notice.textContent = scanState.error;
    return;
  }

  state.lastScanState = scanState;
  state.candidates = scanState.candidates || [];
  state.selectedCandidateIds = new Set(
    state.candidates
      .filter((candidate) => candidate.reason !== "related")
      .map((candidate) => candidate.id)
  );
  elements.includeIncognito.checked = Boolean(scanState.settings.includeIncognito);
  elements.includeIncognito.disabled = !scanState.incognitoAllowed;
  elements.discardInsteadOfClose.checked = Boolean(scanState.settings.discardInsteadOfClose);
  elements.protectPinnedAudibleActive.checked = Boolean(scanState.settings.protectPinnedAudibleActive);
  elements.crushButton.textContent = scanState.settings.discardInsteadOfClose ? "Discard Tabs" : "Crush Tabs";
  elements.tabCount.textContent = String(scanState.tabsCount || 0);
  elements.trackingStatus.textContent = scanState.trackingReady
    ? "72-hour tracking window is active."
    : "Tracking has started. Stale cleanup is warming up.";
  renderNotice(scanState);
  renderImpact(scanState);
  renderLifetime(scanState);
  renderAchievements(scanState.achievements);
  renderCandidates();
  renderSavedLater(scanState.savedLater);
  renderAudit(scanState.auditLog);
}

async function refresh() {
  elements.refreshButton.disabled = true;
  const scanState = await sendMessage({ type: "GET_STATE" });
  applyState(scanState);
  elements.refreshButton.disabled = false;
}

async function updateSetting(key, value) {
  const scanState = await sendMessage({ type: "UPDATE_SETTINGS", patch: { [key]: value } });
  applyState(scanState);
}

async function applyCleanup(action) {
  const selected = selectedVisibleCandidates();
  if (!selected.length) {
    return;
  }

  const scanState = await sendMessage({
    type: "APPLY_CLEANUP",
    action,
    candidateIds: selected.map((candidate) => candidate.id)
  });
  state.hiddenCandidateIds.clear();
  applyState(scanState);
}

async function saveForLater() {
  const selected = selectedVisibleCandidates();
  if (!selected.length) {
    return;
  }

  const scanState = await sendMessage({
    type: "SAVE_FOR_LATER",
    candidateIds: selected.map((candidate) => candidate.id)
  });
  applyState(scanState);
}

elements.refreshButton.addEventListener("click", refresh);
elements.includeIncognito.addEventListener("change", () => updateSetting("includeIncognito", elements.includeIncognito.checked));
elements.discardInsteadOfClose.addEventListener("change", () => updateSetting("discardInsteadOfClose", elements.discardInsteadOfClose.checked));
elements.protectPinnedAudibleActive.addEventListener("change", () => updateSetting("protectPinnedAudibleActive", elements.protectPinnedAudibleActive.checked));
elements.keepButton.addEventListener("click", () => {
  for (const candidate of selectedVisibleCandidates()) {
    state.hiddenCandidateIds.add(candidate.id);
    state.selectedCandidateIds.delete(candidate.id);
  }
  renderCandidates();
});
elements.saveButton.addEventListener("click", saveForLater);
elements.crushButton.addEventListener("click", () => applyCleanup(elements.discardInsteadOfClose.checked ? "discard" : "close"));

refresh();
