# Tab Crushr

A local-only Manifest V3 Chrome extension for reviewing, saving, and crushing duplicate, stale, and superseded tabs.

Privacy policy: https://cnoles1980.github.io/tab-crushr/privacy.html

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder: `chrome-tab-cleaner`.

## What it can clean

- **Duplicates:** available immediately for open tabs in the current Chrome profile.
- **Related app tabs:** available immediately for selected high-signal sites, including Google Calendar, Gmail, Google Drive, Google Docs/Sheets/Slides/Forms/Drawings, Google Maps, Google Search, and YouTube. These catch similar tabs that are not exact URL duplicates.
- **Stale tabs:** available after 72 hours of tracking data.
- **Superseded tabs:** available after 72 hours of tracking data, when an older tab is later opened and closed in a newer tab.

The extension intentionally does not infer tab history from before it was installed.

Related app tabs are surfaced for review separately from exact duplicates. They are intentionally broader matches, so review them before crushing.

## Profiles and Incognito

Chrome profiles are isolated. Install and enable the extension separately in every Chrome profile you want to clean.

Incognito scanning is off by default. To enable it:

1. Open `chrome://extensions`.
2. Select **Details** for Tab Crushr.
3. Turn on **Allow in incognito**.
4. Open the extension popup and enable the **Incognito** toggle.

Incognito tab tracking uses session storage where Chrome supports it.

## Savings estimates

Tab Crushr estimates memory savings at about 120 MB per closed tab and 90 MB per discarded tab. Chrome does not expose exact per-tab memory to extensions, so these numbers are intentionally approximate.

## Lifetime stats and achievements

Tab Crushr tracks lifetime tabs crushed, estimated memory saved, crush sessions, and Save for Later activity in local extension storage.

The popup shows only the next two closest locked milestones. Earned achievements are available in a separate collapsible drawer. Tab milestones include 250, 500, 1,000, 2,500, 5,000, and continue generating higher goals as totals grow.

## Save for Later

The **Save for Later** button stores each selected page once in local extension storage with the URL and a short description. It does not add items to Chrome bookmarks.

## Development

Run the rule-engine tests:

```powershell
npm test
```

Generate extension icons:

```powershell
npm run icons
```
