# Gom Jabbar — chronic pain diary

*Installable web app for logging pain episodes with as little friction as physically possible. Single user, no backend, data lives on the phone and is exportable.*

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

- Call `navigator.storage.persist()` at startup, and again on the first launch as an installed app (recorded in `prefs.installedAt`) and when the browser fires `appinstalled`: installed origins are granted persistence without a prompt.
- While the app is not installed, the log screen nudges to add it to the home screen (§6.1); Settings keeps a static card as the fallback. On iOS the install is what exempts the app from Safari's 7-day storage eviction for unused sites; on Android it is what opens the app from an icon.
- The icon is a white needle with a drop at the tip on the pain-10 red tile (`public/favicon.svg` is the source; the PNGs are renders of it, the maskable one full-bleed with the art at 78%). The name is final (#12).
- Chrome's `beforeinstallprompt` is captured at startup (`lib/install.svelte.ts`) and replayed from the nudge; where no prompt exists the nudge opens a sheet with the manual steps (Share → Aggiungi alla schermata Home on iOS, browser menu elsewhere).
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
  history?: { at: string; readings: Record<SymptomId, number> }[]; // episodes only, see §5.5
  preset?: string;       // the preset this moment was logged from (§5.6)
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
- **Areas are "where", readings are "what".** "Legs, pain 0, swelling 3" means legs swollen, no pain. There is no per-area reading and no symptom switch on the slider; two areas with different symptoms are two entries.
- **Headline reading.** An entry's headline is its highest reading; pain wins ties. Every list (today chips, diary rows, episode cards, report) shows the headline value in the pill, coloured by it, and names the symptom when it is not pain: `3 gonfiore · gambe` (#3).

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
| stretching | intervention | Stretching | Stretching |
| meditation | intervention | Meditazione | Meditation |
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

Front: `head`, `neck`, `shoulder.l/r`, `upperarm.l/r`, `elbow.l/r`, `forearm.l/r`, `hand.l/r`, `chest`, `abdomen`, `pelvis`, `hip.l/r`, `thigh.l/r`, `knee.l/r`, `shin.l/r`, `ankle.l/r`, `foot.l/r`. The hips are narrow strips on the outer edge of the pelvis (hips and flanks); `pelvis` is the unsided middle between abdomen and thighs, grouped with the torso. Lipedema hips and pelvic pain are different things (#2).

Back: `head.back`, `neck.back`, `upperback`, `lowerback`, `shoulder.back.l/r`, `upperarm.back.l/r`, `elbow.back.l/r`, `forearm.back.l/r`, `buttock.l/r`, `thigh.back.l/r`, `knee.back.l/r`, `calf.l/r`, `heel.l/r`, `foot.back.l/r`. The hands are drawn on both figures and share the front ids.

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

Tapping an active episode card opens a sheet with its summary, its level timeline, one slider per symptom the entry tracks (pain always, the others when above 0), the **Rimedi** and **Farmaci** chips (remedies happen in response to pain: this is where "ho preso il farmaco" gets recorded; context tags stay in the edit sheet) and **Aggiorna** / **Termina**, both of which save the chips too, plus a **Modifica zone e note** link to the full edit sheet (§6.2). **Aggiorna** updates every slider's reading at once. The first update stores the starting readings as the first point of `entry.history`, then each update appends `{ at, readings }` with the full readings at that moment, so the history is the complete trail. With a single area, that area follows the pain reading; with several, the initial split is kept. The diary shows the headline symptom's trail as "7 → 4 → 2". Histories written before export version 3 held `{ at, pain }` and were converted, so their first point is the first update, not the start.

### 5.6 Presets

Two kinds of pain: **episodic** (a migraine starts and ends; episodes cover it) and **continuous** (the back is always there, only the level drifts). For the second, a **preset** is a named, saved shape of an entry:

```ts
type Preset = { id: string; name: string; areas: Area[]; symptomIds: SymptomId[]; tags: TagId[]; ongoing: boolean; order: number };
```

- Created from a saved entry: **Crea preset da questa voce** at the bottom of the edit sheet (§6.2, reached from a Today chip or a Diary row) reveals a name field and **Crea preset**. It captures the entry as it stands in the form: the areas, pain plus every other symptom set above 0 (`symptomIds`, pain first), the tags and the episode toggle. The sheet stays open and nothing else is saved. Presets come about after a shape has been logged a few times, so creation lives with the entries, not on the everyday path of the log form (#15).
- The home screen shows a strip of preset chips: `4 Schiena · 2g` (headline of the last entry logged from it, and how long ago; "mai" before the first). Tap → a sheet named after the preset with one slider per `symptomIds`, starting from the last logged levels, and **Salva**. Two taps.
- Each save logs an **ordinary moment** carrying `preset`: its areas at the pain level, its tags, an empty note, an episode when `ongoing` is set (the existing card handles the end). The diary stays honest and every existing feature works.
- Trends draws one line per preset (§6.3). Presets are deleted from Settings (undo toast) and travel in the backup (§8).
- It absorbs the old **Ripeti l'ultima** button, a nameless preset. Rejected alternatives: a `persistent` flag on episodes (one entry with an unbounded history, one diary row for months) and carry-forward in trends only (#5).

## 6. Screens

Bottom tab bar, four tabs, thumb reachable. The app opens on **Log**.

### 6.1 Log (home)

This screen is the product. Layout top to bottom:

1. **Active episode cards** (only if any): "7 · gambe · da 3h", or "3 · gonfiore · gambe · da 3h" when the headline is not pain (§5.1), with a **Termina** button. Tap the card → update sheet (§5.5).
2. **Preset strip** (only if any presets, §5.6): one chip per preset, `4 Schiena · 2g`. Tap → preset sheet.
3. **Today strip**: "Oggi" followed by one small chip per entry logged today (headline level, symptom name when not pain, time). Tap to edit. Shows "niente ancora" when empty.
   Under it, while the app is not installed (no `display-mode: standalone`, no `installedAt` pref): an inline **install nudge** in the backup banner style, "Aggiungi alla schermata Home per tenere i dati al sicuro", with **Aggiungi** and a dismiss. It shows on every launch until the app is installed; dismiss hides it for the current session only. Aggiungi replays the browser install prompt when captured, else opens the how-to sheet (§4.1).
4. **Body map**, front and back side by side, "both sides" toggle, full body / legs / arms chips. Area chips under the map (§5.4).
5. **Time chip**: "Adesso". Tap → chips "Stamattina", "Ieri sera", "1h fa", "3h fa", plus a datetime picker.
6. **Tag strip**: one scrolling row of chips after the time chips, no header, so the chip rows (areas, time, tags) sit together and the sliders form one block. First a chevron chip (**Tutti i tag**), then **every enabled tag**, the most used first (count over every entry, ties in vocabulary order; a fresh install shows vocabulary order). What gets used sits under the thumb, the long tail is a swipe away, and nothing needs a cutoff or a "keep the selected ones visible" rule. Tap toggles the tag on the draft; the order never changes under a finger, it follows usage across saves (#4, #15). The chevron replaces the strip with the same tags grouped by type, for browsing by category: the chip stays in its slot (now pointing up) and a thin rail drops from it along the left of everything it folds, group titles and chips indented together to its right. Group titles use the slider label style: they are field labels, not section markers. Tapping the chip folds it back, and so does a new draft (save, Azzera, another entry to edit).
7. **Intensity slider**: large, full width, 0..10 with the number shown big and a colour ramp. Snaps to integers. Drag or tap.
8. **Episode toggle**: "In corso" switch next to the slider. Off by default the first time, then remembers the last used value. The slider edits the current area's level (§5.4).
9. **Other symptom sliders**, compact, one per enabled symptom other than pain, in vocabulary order. The vocabulary editor (§6.5) decides how long the form is: disable what is never tracked.
10. **Note**: a one-line field that grows with the text.
11. **Azzera** and **Salva**, bottom anchored in a sticky bar. Salva is the primary, full width beside Azzera. Azzera is enabled while the draft holds anything beyond the pain level (areas, a time, tags, a note, another reading) and empties the form with an undo toast "Modulo azzerato · Annulla"; the episode toggle stays. (Repeat last was absorbed by presets, §5.6.)

The form is one page: everything is in the flow and the fast path never scrolls. The first version hid symptoms, tags and note behind a **Dettagli** expander, then behind a **Sintomi · rimedi · note** sheet with a count badge (#1, #4); the tester read the sheet as a separate thing whose input was lost on closing (#15). One scrolling form with a single sticky Salva replaced both: the edit sheet had always been that form and nobody struggled with it. No hint line is needed any more, so the log screen has none.

Fast path: tap region(s) → drag slider → Save. Regions are optional; an entry with only intensity is valid.

On save: haptic tick (`navigator.vibrate` where available), toast "Salvato · Annulla" for 5 seconds, form resets but keeps mirror and episode toggle state. No confirmation dialogs anywhere in the app; destructive actions get an undo toast instead.

### 6.2 Diary

- Reverse-chronological list grouped by day. Each row: time, headline reading as a coloured pill (§5.1), the symptom name when it is not pain, region summary ("gambe, fianchi", "tutto il corpo"), tags, note preview, duration and level trail if episode.
- Tap a row → edit sheet, the same one-page form as Log, prefilled, with Delete and Salva and, at the bottom, **Crea preset da questa voce** (§5.6).
- Shows the last 30 days; a **Mostra altre** button at the bottom loads 60 more days at a time while older entries exist.
- Search by note text and a tag filter are planned (#10).

### 6.3 Trends

Range picker: 7, 30, 90, 365 days.

- **Body heatmap**: the same body SVG, regions coloured by how often and how intensely they appeared in range.
- **Intensity over time**: daily max and mean pain as a bar/line chart. Other symptoms selectable.
- **Per preset** (only when a preset has samples in range): one small line per preset, its first symptom over time, dots coloured by the intensity ramp. Samples only: days without a sample stay empty, no carry-forward (§5.6).
- **Episodes**: count and mean duration.
- **Tags**: for each tag with enough data, mean of the daily maximum on days with vs without it, shown as two small bars with the day counts. Labelled as descriptive. Hidden when fewer than 5 days on either side; usage counts are shown instead until then.
- **Other symptoms**: mean of each non-pain symptom over the entries where it was recorded.
- **Report** button → §7.

### 6.4 Settings

- Language (it / en, follows device by default).
- Theme (system / light / dark).
- Vocabulary editors: symptoms, tags (three groups), reorder by drag, enable/disable, rename, add.
- **Preset** list with delete (undo toast); creation happens from an entry's edit sheet (§5.6), and the empty state says so.
- **Backup**: last backup date, Export JSON (share), Export CSV (share), Import JSON (merge or replace, with a preview of counts before applying).
- Install to home screen hint (shown until installed).
- About and data location note ("your data only lives on this phone").

## 7. Report

A full-screen overlay in a fixed light palette, opened for the current range from Trends, with print CSS for A4; `@media print` hides the app behind it. No library. Contents:

1. Header: date range, generated on, number of entries and episodes.
2. Body heatmap (front and back side by side).
3. Intensity over time chart.
4. Summary numbers: mean/max pain, days with pain ≥ 5, episode count and durations.
5. Tag summary table.
6. Chronological list of episodes and notes (compact).

The chronological list contains episodes and entries with notes, not every entry.

Two buttons: **Stampa / PDF** calls `window.print()`, and **Condividi file** shares the report as a single self-contained HTML file (markup plus every stylesheet rule), which opens and prints anywhere. This is the path on iOS home-screen apps, where `window.print()` is unreliable.

## 8. Export format

```json
{
  "app": "gom-jabbar",
  "version": 4,
  "exportedAt": "2026-09-13T18:00:00Z",
  "vocabulary": { "symptoms": [], "tags": [] },
  "entries": [],
  "presets": []
}
```

CSV export is one row per entry, one column per symptom, regions and tags joined with `|`. Meant for spreadsheets, not for reimport.

Import rules: `replace` wipes and loads; `merge` upserts by `id` with newer `updatedAt` winning and adds vocabulary items that are missing. A sheet shows the file date and counts (new, updated) before committing. Replace is undoable from the toast: the previous state is snapshotted and restored on undo. Every version ever written is accepted: version 1 files (with `regions`), version 2 (history points with `pain`) and version 3 (no `presets`) are upgraded on import. Merge adds presets that are missing by id; replace loads them.

Vocabulary editing (Settings → Vocabolario): rename inline, enable/disable with a switch, reorder with arrows, add at the bottom of each group. Pain cannot be disabled. Renaming a default item changes only the current language; user-made items keep both languages in sync.

## 9. i18n

- Message files `src/i18n/it.json` and `src/i18n/en.json`, flat keys.
- Italian is the default; device language is detected on first run and can be overridden in settings.
- Vocabulary labels are `LocalizedString = { it: string; en: string }`. User-created items get the same text in both unless edited.
- Dates and numbers through `Intl` with the active locale.
- A test asserts both message files have identical key sets.

## 10. Design rules

- Touch targets ≥ 48px. All primary controls in the bottom 60% of the screen.
- Every body region has a human accessible name ("Coscia sx", "Left thigh"); focus is visible on all controls; sheets take focus on open and give it back on close.
- Dark mode via `prefers-color-scheme`, overridable.
- Intensity colour ramp: neutral at 0, warm at 10, perceptually even, readable in both themes and by colour-blind users (ramp plus the number, never colour alone).
- No spinners, no splash beyond the PWA one, no onboarding screens, no hint lines: what needs explaining gets redesigned instead.
- Respect `prefers-reduced-motion`.
- Italian copy first, terse, informal ("Salva", "Annulla", "In corso").

## 11. Testing

- **Unit (Vitest)**: data layer on `fake-indexeddb` (CRUD, episodes, migrations), stats and correlation functions, export/import round trip and merge semantics, region helpers (mirror, limb shortcuts, full body), area operations, i18n key parity.
- **Component (Testing Library)**: every screen and sheet, against the real Dexie on `fake-indexeddb`: the fast path (select region, set intensity, save, entry appears), undo, the inline details and Tutti i tag, Azzera with undo, presets, the episode sheet (history, update and end with undo, hand-off to edit), the diary (day groups, row content, load more, edit and delete with undo), trends (ranges, heatmap, chart tap, tag comparison, symptom means), the report (numbers, sections, share as one HTML file), settings (language, theme, backup export and import with merge, replace and undo) and the vocabulary editor.
- **Manual checklist** before each release: see `CHECKLIST.md`.
- **Bundle size gate**: `npm run size` fails the build above 150 KB gzipped JS; it runs in CI.
- No e2e framework in v1.

## 12. Open work

This document describes the app as built. Anything planned, requested or undecided lives in the GitHub issues; where a section above cites an issue number, that behaviour is not built yet.
