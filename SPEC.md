# Gom Jabbar — chronic pain diary

*Working name. Installable web app for logging pain episodes with as little friction as physically possible. Single user, no backend, data lives on the phone and is exportable.*

## 1. Goals

1. **Logging is a breeze.** A complete entry takes two taps and a swipe, under five seconds, one hand. Nothing is ever required beyond intensity.
2. **Owns its data.** Everything is stored locally and exportable to a file at any time. No accounts, no server, no analytics.
3. **Works on a phone, offline, always.** Android first, iOS supported. Installed to the home screen, opens instantly.
4. **Useful at the doctor's.** A one-page printable report for any date range.
5. **Flexible enough for lipedema, fibromyalgia and whatever else comes up**, without becoming a form builder.

## 2. Non-goals (v1)

- No diagnosis, advice, or treatment suggestions. Trends are descriptive only.
- No multi-device sync, no cloud, no multi-user.
- No reminders or push notifications.
- No wearable or health-platform integration.
- No native app, no app store.

## 3. Users and context

- Primary user: a single person, the tester. Android phone. Italian speaker.
- Conditions: lipedema, fibromyalgia, others. Pain is often multi-region, symmetric (both legs, both arms), and sometimes full-body. Swelling, heaviness and fatigue matter as much as pain.
- Usage pattern: logging happens when they notice, often at bad moments (in pain, tired, in bed). The UI must tolerate imprecision and never punish a quick entry.

## 4. Platform and stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Svelte 5 + TypeScript + Vite | Tiny bundle, fast, Paolo's pick |
| PWA | `vite-plugin-pwa` (Workbox) | Installable, offline, precached shell |
| Storage | IndexedDB via Dexie | Async, structured, no 5MB cap |
| i18n | JSON message files, tiny store, `it` default, `en` | No heavy lib needed |
| Charts and body map | Hand-written SVG | No chart lib, full control, small |
| Tests | Vitest, `fake-indexeddb`, `@testing-library/svelte` | Paolo's pick |
| Hosting | GitHub Pages via Actions | Static, free, no infra |
| Package manager | npm | Default, no assumptions |

Browser targets: Chrome on Android (primary), Safari on iOS 16.4+ (secondary). Desktop browsers should work but are not designed for.

### 4.1 Persistence rules

- Call `navigator.storage.persist()` on first run and again after install.
- Nudge to install to the home screen on first run. On iOS this is what exempts the app from Safari's 7-day storage eviction for unused sites.
- Every write goes through Dexie; no data in `localStorage` except UI preferences (language, last-used tab, theme).
- Schema versioning through Dexie migrations. Export format carries a `version` field.

### 4.2 Backup

- Settings shows "last backup: N days ago". After 14 days a small inline banner appears on the log screen (dismissable, never modal).
- Backup is one tap: produce the JSON export and hand it to the native share sheet (Web Share API with files, supported on Android Chrome and iOS 15+). Chrome only shares an allowlist of file types that excludes `.json`, so the backup is offered as `.txt` when needed; import accepts both. Fallback: download.
- Dismissing the nudge snoozes it for 7 days.

## 5. Data model

### 5.1 Entry

One entry = one moment or one episode, with one or more symptom scores.

```ts
type Entry = {
  id: string;            // nanoid
  at: string;            // ISO datetime, when it happened / started
  endedAt: string | null;// ISO datetime, set when an episode ends
  ongoing: boolean;      // true = episode still active (endedAt is null)
  readings: Record<SymptomId, number>; // e.g. { pain: 7, swelling: 4 }, 0..10
  areas: Area[];         // [] = unspecified; see below
  tags: TagId[];
  note: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- A **moment** is an entry with `ongoing: false` and `endedAt: null`. It is a sample, "this is how it is right now" (or at a backfilled time).
- An **episode** is an entry created with `ongoing: true`. It shows as an active chip until ended. Ending sets `endedAt` and `ongoing: false`. Duration is derived.
- `readings` always has at least one key. The fast path only sets `pain`.
- **Areas.** `type Area = { regions: RegionId[]; intensity: number }`. An entry has zero or more areas, each a set of regions sharing one level. `readings.pain` is the max over areas when there are any, otherwise a free value (used for "no pain today" or entries with no location).
- An area with `regions: ['*']` means full body and is always the only area.
- Intensity is 0..10 integer. 0 is allowed (useful to record "no pain today").

### 5.2 Vocabulary (editable, shipped with defaults)

```ts
type Symptom = { id: string; label: LocalizedString; enabled: boolean; order: number };
type Tag     = { id: string; label: LocalizedString; group: 'intervention' | 'context' | 'medication'; enabled: boolean; order: number };
```

Default symptoms (it / en):

| id | it | en |
|---|---|---|
| pain | Dolore | Pain |
| swelling | Gonfiore | Swelling |
| heaviness | Pesantezza | Heaviness |
| fatigue | Stanchezza | Fatigue |
| fog | Nebbia mentale | Brain fog |
| tenderness | Dolorabilità al tatto | Tenderness |
| stiffness | Rigidità | Stiffness |

Default tags:

| id | group | it | en |
|---|---|---|---|
| compression | intervention | Compressione | Compression |
| mld | intervention | Linfodrenaggio | Lymphatic drainage |
| exercise | intervention | Movimento | Exercise |
| rest | intervention | Riposo | Rest |
| heat | intervention | Calore | Heat |
| cold | intervention | Freddo | Cold |
| period | context | Ciclo | Period |
| stress | context | Stress | Stress |
| badsleep | context | Dormito male | Slept badly |
| standing | context | In piedi a lungo | Standing long |
| sitting | context | Seduta a lungo | Sitting long |
| hot_weather | context | Caldo | Hot weather |
| travel | context | Viaggio | Travel |

Medications are tags in the `medication` group. None ship by default; the tester adds their own in settings (name only, dose goes in the note if needed).

Users can add, rename, reorder, and disable symptoms and tags. Disabled items stay in history. Deleting is not offered; disabling is enough.

### 5.3 Regions

Body map with front and back figures side by side, labelled, both always visible. Region ids are stable strings; the SVG shapes carry them as `data-region`.

Front: `head`, `neck`, `shoulder.l/r`, `upperarm.l/r`, `forearm.l/r`, `hand.l/r`, `chest`, `abdomen`, `hip.l/r`, `thigh.l/r`, `knee.l/r`, `shin.l/r`, `ankle.l/r`, `foot.l/r`.

Back: `head.back`, `neck.back`, `upperback`, `lowerback`, `shoulder.back.l/r`, `upperarm.back.l/r`, `forearm.back.l/r`, `buttock.l/r`, `thigh.back.l/r`, `knee.back.l/r`, `calf.l/r`, `heel.l/r`.

Special: `*` = full body. When selected, both figures fill and individual regions cannot be toggled until it is deselected.

Multi-region is the norm. Helpers:

- **Mirror**: a "both sides" toggle. When on, tapping a left region also selects its right counterpart and vice versa. Remembered between sessions (lipedema is symmetric, so this will usually stay on).
- **Full body** button above the map.
- **Legs / Arms** shortcut chips that select the whole limb on both sides.

### 5.4 Per-area intensity

Regions are grouped into **areas**, each with its own level. The slider always edits the *current* area.

- Tapping regions builds the first area at the slider's level. With one area this is exactly the two-taps-and-a-swipe fast path.
- Area chips appear under the map: "8 · fianchi, gambe". Tap a chip to make it current; its regions get an outline on the map when there is more than one area.
- **+ Altra zona** starts a new empty area at the current level and makes it current. Subsequent taps go into it. Empty areas are dropped when you switch away or save.
- Tapping a region that belongs to another area moves it into the current one. Tapping a region in the current area removes it.
- Full body replaces all areas with a single one.
- Overall pain shown in the diary and used for trends is the max over areas.
- **Press and hold** a region to toggle its whole limb on that side (whole torso, back or head for unsided regions). Mirror applies.

### 5.5 Episode updates

Tapping an active episode card opens a sheet with its summary, its level timeline, a slider and **Aggiorna** / **Termina**. Updating appends `{ at, pain }` to `entry.history` and sets `readings.pain`. With a single area, that area follows; with several, the initial split is kept. The diary shows the level trail as "7 → 4 → 2".

## 6. Screens

Bottom tab bar, four tabs, thumb reachable. The app opens on **Log**.

### 6.1 Log (home)

This screen is the product. Layout top to bottom:

1. **Active episode cards** (only if any): "7 · gambe · da 3h" with a **Termina** button. Tap the card → update sheet (§5.5).
2. **Today strip**: "Oggi" followed by one small chip per entry logged today (level and time). Tap to edit. Shows "niente ancora" when empty.
3. **Body map**, front and back side by side, "both sides" toggle, full body / legs / arms chips. Area chips under the map (§5.4).
4. **Time chip**: "Adesso". Tap → chips "Stamattina", "Ieri sera", "1h fa", "3h fa", plus a datetime picker.
5. **Intensity slider**: large, full width, 0..10 with the number shown big and a colour ramp. Snaps to integers. Drag or tap.
6. **Episode toggle**: "In corso" switch next to the slider. Off by default the first time, then remembers the last used value. The slider edits the current area's level (§5.4).
7. **Add details** expander (collapsed): other symptom sliders, tag chips grouped by type, note field.
8. **Save** button, full width, bottom anchored. Next to it a **Repeat last** button that clones the last entry with `at = now`.

Fast path: tap region(s) → drag slider → Save. Regions are optional; an entry with only intensity is valid.

On save: haptic tick (`navigator.vibrate` where available), toast "Salvato · Annulla" for 5 seconds, form resets but keeps mirror and episode toggle state. No confirmation dialogs anywhere in the app; destructive actions get an undo toast instead.

### 6.2 Diary

- Reverse-chronological list grouped by day. Each row: time, intensity as a coloured pill, region summary ("gambe, fianchi", "tutto il corpo"), tag icons, note preview, duration if episode.
- Tap a row → edit sheet, same form as Log, prefilled, with Delete (undo toast).
- Sticky day headers. Infinite scroll, loads 30 days at a time.
- Search by note text and filter by tag (small, in a top bar).

### 6.3 Trends

Range picker: 7, 30, 90, 365 days.

- **Body heatmap**: the same body SVG, regions coloured by how often and how intensely they appeared in range.
- **Intensity over time**: daily max and mean pain as a bar/line chart. Other symptoms selectable.
- **Episodes**: count, mean and max duration, hours in pain per week.
- **Tags**: for each tag with enough data, mean of the daily maximum on days with vs without it, shown as two small bars with the day counts. Labelled as descriptive. Hidden when fewer than 5 days on either side; usage counts are shown instead until then.
- **Other symptoms**: mean of each non-pain symptom over the entries where it was recorded.
- **Report** button → §7.

### 6.4 Settings

- Language (it / en, follows device by default).
- Theme (system / light / dark).
- Vocabulary editors: symptoms, tags (three groups), reorder by drag, enable/disable, rename, add.
- **Backup**: last backup date, Export JSON (share), Export CSV (share), Import JSON (merge or replace, with a preview of counts before applying).
- Install to home screen hint (shown until installed).
- About and data location note ("your data only lives on this phone").

## 7. Report

A print-styled HTML page (A4, print CSS), opened for a date range from Trends. The user prints to PDF or shares it. Contents:

1. Header: date range, generated on, number of entries and episodes.
2. Body heatmap (front and back side by side).
3. Intensity over time chart.
4. Summary numbers: mean/max pain, days with pain ≥ 5, episode count and durations.
5. Tag summary table.
6. Chronological list of episodes and notes (compact).

No library; the report is a full-screen overlay in a fixed light palette with a Print / PDF button that calls `window.print()`; `@media print` hides the app behind it. The chronological list contains episodes and entries with notes, not every entry.

## 8. Export format

```json
{
  "app": "gom-jabbar",
  "version": 1,
  "exportedAt": "2026-09-13T18:00:00Z",
  "vocabulary": { "symptoms": [], "tags": [] },
  "entries": []
}
```

CSV export is one row per entry, one column per symptom, regions and tags joined with `|`. Meant for spreadsheets, not for reimport.

Import rules: `replace` wipes and loads; `merge` upserts by `id` with newer `updatedAt` winning and adds vocabulary items that are missing. A sheet shows the file date and counts (new, updated) before committing. Replace is undoable from the toast: the previous state is snapshotted and restored on undo. Version 1 files (with `regions`) are upgraded on import.

Vocabulary editing (Settings → Vocabolario): rename inline, enable/disable with a switch, reorder with arrows, add at the bottom of each group. Pain cannot be disabled. Renaming a default item changes only the current language; user-made items keep both languages in sync.

## 9. i18n

- Message files `src/i18n/it.json` and `src/i18n/en.json`, flat keys.
- Italian is the default; device language is detected on first run and can be overridden in settings.
- Vocabulary labels are `LocalizedString = { it: string; en: string }`. User-created items get the same text in both unless edited.
- Dates and numbers through `Intl` with the active locale.
- A test asserts both message files have identical key sets.

## 10. Design rules

- Touch targets ≥ 48px. All primary controls in the bottom 60% of the screen.
- Dark mode via `prefers-color-scheme`, overridable.
- Intensity colour ramp: neutral at 0, warm at 10, perceptually even, readable in both themes and by colour-blind users (ramp plus the number, never colour alone).
- No spinners, no splash beyond the PWA one, no onboarding screens. First run shows the log screen with a single dismissable hint line.
- Respect `prefers-reduced-motion`.
- Italian copy first, terse, informal ("Salva", "Annulla", "In corso").

## 11. Testing

- **Unit (Vitest)**: data layer on `fake-indexeddb` (CRUD, episodes, migrations), stats and correlation functions, export/import round trip and merge semantics, region helpers (mirror, limb shortcuts, full body), area operations, i18n key parity.
- **Component (Testing Library)**: the fast path (select region, set intensity, save, entry appears), undo, repeat last, episode end.
- **Manual checklist** before each release: install on Android, install on iOS, offline launch, share export, import, print report.
- No e2e framework in v1.

## 12. Milestones

1. **Shell**: Vite + Svelte + PWA + i18n + Dexie. Log screen with body map, slider, save. Diary list. Installable and offline. *This alone should already be usable daily.*
2. **Entries done right**: episodes and active chips, time backfill, details expander, tags, edit/delete with undo, repeat last, mirror and limb shortcuts.
3. **Data safety**: export/import/CSV, backup nudge, settings, vocabulary editors, persistence request.
4. **Insight**: trends, heatmap, tag comparison, report.
5. **Polish**: iOS pass, accessibility pass, performance budget (< 150 KB gzipped JS), release checklist.

## 13. Open decisions

- App display name and icon. "Gom Jabbar" is the working name.
