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
  layers: Layer[];       // never empty; see below and §5.4
  history?: { at: string; layers: Record<SymptomId, number>[] }[]; // episodes only, see §5.5
  preset?: string;       // the preset this moment was logged from (§5.6)
  note: string;
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- A **moment** is an entry with `ongoing: false` and `endedAt: null`. It is a sample, "this is how it is right now" (or at a backfilled time).
- An **episode** is an entry created with `ongoing: true`. It shows as an active chip until ended. Ending sets `endedAt` and `ongoing: false`. Duration is derived.
- **Layers.** `type Layer = { regions: RegionId[]; readings: Record<SymptomId, number>; tags: TagId[]; strokes?: Stroke[] }` (#29). An entry is a stack of one or more layers, each a where (regions, optionally shaded by hand inside its body regions, §5.3), a what (readings, e.g. `{ pain: 7, swelling: 4 }`, 0..10) and the tags that go with it. Layers are independent: a region may sit in several, a tag on several, each has its own sliders (§5.4). A layer without regions is a reading without a location ("no pain today", or a mental reading with nothing selected): the form always starts with one, and an entry keeps at most that one and only when nothing is located.
- The entry has no readings and no tags of its own. Where a whole-entry value is needed it is derived: **the max per symptom over the layers**, **the union of the tags** in order of first appearance. The fast path sets `pain` on the one layer.
- A region `*` among a layer's regions means full body for that layer; the mind (`mind`) may sit beside the star, and is a region like any other. A layer keeps only the readings its regions show (§6.1): no pain on a layer holding just the mind, no mental readings on a body layer, everything on a layer without regions.
- Levels are 0..10 integers. 0 is allowed.
- **Headline reading.** An entry's headline is its highest derived reading; pain wins ties. Every list (diary rows, episode cards, preset chips, report) shows the headline value in the pill, coloured by it, and names the symptom when it is not pain: `3 gonfiore · gambe` (#3). A layer's own headline is its level on the map and its chip.

### 5.2 Vocabulary (editable, shipped with defaults)

```ts
type Symptom = { id: string; label: LocalizedString; category: 'body' | 'mind'; enabled: boolean; order: number };
type Tag     = { id: string; label: LocalizedString; group: 'intervention' | 'context' | 'medication'; enabled: boolean; order: number };
```

A symptom belongs to the **body** (pain and its siblings) or to the **mind** (§5.3). The category decides which sliders the log form shows (§6.1) and which group of the vocabulary editor the symptom sits in (§6.4); the tester adds mental ones there. Rows written before version 6 had no category: `fog` reads as mind, everything else as body, in the Dexie upgrade and on import alike (§8). `anxiety` and `depression` arrived with version 6: the Dexie upgrade adds them to an older database when their ids are free (the importer adds nothing, so a file round-trips unchanged).

Default symptoms (it / en):

| id | category | it | en |
|---|---|---|---|
| pain | body | Dolore | Pain |
| swelling | body | Gonfiore | Swelling |
| heaviness | body | Pesantezza | Heaviness |
| fatigue | body | Stanchezza | Fatigue |
| fog | mind | Nebbia mentale | Brain fog |
| tenderness | body | Dolorabilità al tatto | Tenderness |
| stiffness | body | Rigidità | Stiffness |
| anxiety | mind | Ansia | Anxiety |
| depression | mind | Depressione | Depression |

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

Body map with front and back figures side by side, labelled, both always visible. The figures and their segmentation are the **CHOIR body map** (Collaborative Health Outcomes Information Registry, Stanford; Scherrer et al., PAIN Reports 2021), a validated 74-segment pain map: 36 front and 38 back segments, in a female and a male silhouette with identical segmentation, chosen in Settings (§6.4). The polygons come from the MIT-licensed CHOIRBM R package, vendored in `scripts/choir/` with attribution; `scripts/choir.mjs` writes `src/lib/figures.ts`, keyed by CHOIR code with the female 112–117 renumbered to the male order so a code means the same segment on both figures.

Region ids are three-digit codes, one per CHOIR segment, stable strings stored in user data; the SVG shapes carry them as `data-region`:

- first digit: view, 1 front, 2 back;
- second digit: family, 0 head, 1 front trunk, 2 back trunk, 3 upper arm, 4 lower arm, 5 upper leg, 6 lower leg (digit 2 is only used at the back, digit 1 only in front);
- third digit: the part, top to bottom, with the parity giving the side: even left, odd right.

| family | parts (even/odd) | front | back |
|---|---|---|---|
| 0 head | top 0/1, face or nape 2/3, neck 4/5 | 100–105 | 200–205 |
| 1 front trunk | chest 0/1, abdomen 2/3, groin 4/5 | 110–115 | |
| 2 back trunk | upper 0/1, mid 2/3, lower 4/5, buttock 6/7 | | 220–227 |
| 3 upper arm | shoulder 0/1, upper arm 2/3, elbow 4/5 | 130–135 | 230–235 |
| 4 lower arm | forearm 0/1, wrist 2/3, hand 4/5 | 140–145 | 240–245 |
| 5 upper leg | hip 0/1, thigh 2/3, knee 4/5 | 150–155 | 250–255 |
| 6 lower leg | shin or calf 0/1, ankle or heel 2/3, foot 4/5 | 160–165 | 260–265 |

Every region is bilateral. `REGIONS` in `lib/regions.ts` carries, per code, the view, the display group (head, arm, torso, back, hip, leg), the side, the name key and the CHOIR code, so an export can speak CHOIR. A knee is x5x in every view; the trunk families differ front and back because their segments do not correspond. A segment added later takes the next free slot of its family, so it may sort out of top-to-bottom order.

Before version 5 the ids were names (`thigh.l`, `chest`, `hand.l` shared by both views). `LEGACY_REGIONS` maps each of them to today's codes: an unsided id to both sides, a hand to the front and the back hand. Dexie version 5 and the importer convert every area of entries and presets; nothing is dropped (§4.1).

Special: `*` = full body. When selected, both figures fill and individual regions cannot be toggled until it is deselected. The mind stays toggleable.

**Drawing** (#18). The tester can shade exactly where it hurts without picking a segment, as on a clinical pain drawing. A **Disegna** chip in the tools row enters drawing mode: the map's slot shows one body figure enlarged (2.5× the fitted size) around the current layer's regions, without the mind, which is not drawn on. One finger paints; two fingers pan and pinch (1.5× to 6×), and a second finger cancels the stroke in progress, nothing painting again until every finger is up; a third finger freezes the pair. Two chips under the figure switch between front and back; the one holding most of the current layer's regions opens first. The pan and zoom are a transform on the SVG, since native pinch zooms the whole app. When a gesture ends it is cut at every segment border into **pieces**, and a piece is what is stored: `{ region, fig, view, points: [x, y][], w }`, the segment it lies in, the figure it was drawn on (the two silhouettes have different coordinates), the view, its points in that figure's viewBox coordinates, simplified (Ramer–Douglas–Peucker) and rounded to a tenth, and the brush width; a tap is a one-point piece, drawn as a dot. The centreline is sampled every 4 units (the smallest segment containing each sample, or the nearest one when a sample falls outside the figure) and each cut is bisected to within a quarter unit of the border, the two pieces ending and starting on their own side of it, so every point of a piece lies in its segment and the round caps close the hairline gap. A piece shorter than a brush width is a graze and is dropped, unless the gesture has nothing longer: a dot or a short stroke always yields one piece. The pieces' segments join the layer exactly as taps would, mirror never applying, so summaries, the heatmap and the stats keep working on regions, and paint never lies outside the segments it selected. Pieces live on the layer, so they inherit its level, and each goes wherever its segment goes (§5.4). A piece lands where a body tap would (§5.4): in the current layer. **Annulla tratto** takes back the last gesture (all its pieces, while they are still the last ones; on a loaded drawing, one piece at a time) and **Cancella disegno** every piece of the current layer, with an undo toast; the regions stay, they may have been tapped as well. A layer emptied of regions is dropped with its paint; full body keeps the layer's paint and takes new pieces without touching its star. Pieces are drawn in their layer's colour, each clipped to its own segment so a round cap never shows on a neighbour (the gesture in progress is clipped to the silhouette), on both views of the ordinary map, and only on the figure they were drawn on: after a switch in Settings the regions still show, the shading waits for a switch back. On the Trends heatmap and on the report (§6.3, §7) every piece in range on the current figure, from the layers carrying the symptom shown, is laid over it at low opacity, so overlap builds density the way a stack of pain drawings does. Drawing mode ends with the draft (save, Azzera, another entry).

The pieces are separate so the layout can change without them (#22): `BodyFigure.svelte` renders one view of the body as SVG content (regions, shading, the stroke in progress, the hit layer), `BodyMap.svelte` puts two of them side by side with the mind between, `PaintSurface.svelte` puts one under a camera; the camera maths is `lib/camera.ts` and the fingers are `lib/gesture.svelte.ts`, both pure of any layout.

**The mind** (#19). A brain figure, seen from above, stands for it: it sits between the two bodies, level with their heads, in the air the columns leave there so the silhouettes stay put, selectable like a region and stored as one: the region id `mind`, added and never renamed. It is not a CHOIR segment: no side, no view, no mirror, no limb, `REGION_BY_ID` does not know it, `MIND` and its shape live in `lib/regions.ts`. It is where the mental symptoms live: selecting it turns the layer's sliders to them (§6.1). Full body does not cover the mind; on the heatmap it lights up under a mental symptom like any region under pain (§6.3). The tester's picture (#16) is "body and mind": physical dimensions from the body, mental ones from the mind. This is per-entry logging of how the head feels right now, not the periodic check-in with a validated scale (#7).

Multi-region is the norm. Helpers:

- **Mirror**: a "both sides" toggle. When on, tapping a left region also selects its right counterpart and vice versa. Remembered between sessions (lipedema is symmetric, so this will usually stay on).
- **Full body** button above the map.
- **Legs / Arms** shortcut chips that select the whole limb on both sides.

### 5.4 Layers

An entry is a stack of **layers** (#29): each its own regions, its own sliders, its own tags, its own paint. They are independent and may overlap: a region in one layer says nothing about the others. One layer is *current*; the map, the sliders and the tag strip edit it and nothing else.

- The form opens with one layer without regions. Tapping regions puts them in it; with one layer this is exactly the two-taps-and-a-swipe fast path, and no chip is shown.
- Layer chips appear under the map once something is located: the layer's headline (§5.1) and where, "8 · fianchi, gambe", "6 nebbia mentale · mente", "4 · fianchi · Compressione". Tap a chip to make it current; with more than one layer its regions get an outline on the map and the other layers fade to a ghost, paint included, so overlap stays visible.
- **+ Altra zona** starts a new empty layer at the current pain level and makes it current. Subsequent taps go into it. A layer without regions is dropped when you switch away or save (except the only one).
- Tapping a region in the current layer removes it, with its paint; so does a limb or a set chip; tapping one that is not there adds it, whatever the other layers hold. A tap never moves a region between layers. Whenever a tap takes paint away, a toast "Tratti cancellati · Annulla" offers to undo it.
- Full body fills the current layer: its regions become the star (and the mind, if selected), its paint stays; off again, the body goes with its paint and the mind stays.
- **The mind is one region among the others** (#28): tapping it puts it in the current layer or takes it out, so body and mind make one pill, "7 · gambe, mente". Mirror never applies to it, sets and limbs never include it, and it stays toggleable under full body. Which sliders a layer shows follows its regions (§6.1).
- Tags belong to the layer: a remedy for the legs is not one for the head. The strip and the grouped list toggle the current layer's tags.
- Overall pain shown in the diary and used for trends is the max over the layers' pain; a layer holding only the mind has none.
- **Press and hold** a region to toggle its whole limb on that side (whole torso, back or head for unsided regions). Mirror applies.

Before 0.5.0 an entry had *areas*: a partition of the body with one level each, and one set of readings and tags for the whole entry. Selecting a region in one area silently took it out of another, and the mind needed rules of its own to carry a level. Layers are what areas were meant to be.

### 5.5 Episode updates

Tapping an active episode card opens a sheet with its summary, its level timeline, the layer chips when there is more than one layer (the same chips as the form, §5.4: the sliders and the remedy chips below follow the selected layer), one slider per symptom the layer tracks (pain when the layer shows the body; the others when above 0), the **Rimedi** and **Farmaci** chips (remedies happen in response to pain: this is where "ho preso il farmaco" gets recorded; context tags stay in the edit sheet) and **Aggiorna** / **Termina**, both of which save the chips too, plus a **Modifica zone e note** link to the full edit sheet (§6.2). **Aggiorna** updates every slider of every layer at once. The first update stores the starting readings as the first point of `entry.history`, then each update appends `{ at, layers }`, one record of readings per layer, aligned with `entry.layers`, so the history is the complete trail. The diary shows the headline symptom's trail as "7 → 4 → 2", the max over the layers at each point. Histories written before export version 3 held `{ at, pain }` and were converted, so their first point is the first update, not the start; those written before version 7 held one `readings` record and were placed on the layers like the entry's own (§8).

### 5.6 Presets

Two kinds of pain: **episodic** (a migraine starts and ends; episodes cover it) and **continuous** (the back is always there, only the level drifts). For the second, a **preset** is a named, saved shape of an entry:

```ts
type Preset = { id: string; name: string; layers: Layer[]; symptomIds: SymptomId[]; ongoing: boolean; order: number };
```

- Created from a saved entry: **Crea preset da questa voce** at the bottom of the edit sheet (§6.2, reached from a Today chip or a Diary row) reveals a name field and **Crea preset**. It captures the entry as it stands in the form: the layers (regions, tags and paint; their readings are set at each save), the sliders to ask for (`symptomIds`: pain first when some layer shows the body, then every other symptom set above 0 on any layer) and the episode toggle. The sheet stays open and nothing else is saved. Presets come about after a shape has been logged a few times, so creation lives with the entries, not on the everyday path of the log form (#15).
- The home screen shows a strip of preset chips: `4 Schiena · 2g` (headline of the last entry logged from it, and how long ago; "mai" before the first). Tap → a sheet named after the preset with one slider per `symptomIds`, starting from the last logged levels, and **Salva**. Two taps.
- Each save logs an **ordinary moment** carrying `preset`: its layers, each taking from the sheet's sliders the readings its regions show (a body layer records pain 0 when the preset does not ask for it), an empty note, an episode when `ongoing` is set (the existing card handles the end). The diary stays honest and every existing feature works.
- Trends draws one line per preset (§6.3). Presets are deleted from Settings (undo toast) and travel in the backup (§8).
- It absorbs the old **Ripeti l'ultima** button, a nameless preset. Rejected alternatives: a `persistent` flag on episodes (one entry with an unbounded history, one diary row for months) and carry-forward in trends only (#5).

## 6. Screens

Bottom tab bar, four tabs, thumb reachable. The app opens on **Log**.

### 6.1 Log (home)

This screen is the product. Layout top to bottom:

1. **Active episode cards** (only if any): "7 · gambe · da 3h", or "3 · gonfiore · gambe · da 3h" when the headline is not pain (§5.1), with a **Termina** button. Tap the card → update sheet (§5.5).
2. **Preset strip** (only if any presets, §5.6): one chip per preset, `4 Schiena · 2g`. Tap → preset sheet.
3. While the app is not installed (no `display-mode: standalone`, no `installedAt` pref): an inline **install nudge** in the backup banner style, "Aggiungi alla schermata Home per tenere i dati al sicuro", with **Aggiungi** and a dismiss. It shows on every launch until the app is installed; dismiss hides it for the current session only. Aggiungi replays the browser install prompt when captured, else opens the how-to sheet (§4.1).
4. **Body map**, front and back side by side with the mind between them (§5.3), "both sides" toggle, full body / legs / arms / **Disegna** chips (§5.3). While drawing, the map's slot holds one enlarged figure, then the front / back chips with **Annulla tratto** and **Cancella disegno**, and a one-line hint. Layer chips under the map (§5.4).
5. **Time chip**: "Adesso". Tap → chips "Stamattina", "Ieri sera", "1h fa", "3h fa", plus a datetime picker.
6. **Tag strip**: one scrolling row of chips after the time chips, no header, so the chip rows (layers, time, tags) sit together and the sliders form one block. First a chevron chip (**Tutti i tag**), then **every enabled tag**, the most used first (count over every entry, ties in vocabulary order; a fresh install shows vocabulary order). What gets used sits under the thumb, the long tail is a swipe away, and nothing needs a cutoff or a "keep the selected ones visible" rule. Tap toggles the tag on the current layer (§5.4); the order never changes under a finger, it follows usage across saves (#4, #15). The chevron replaces the strip with the same tags grouped by type, for browsing by category: the chip stays in its slot (now pointing up) and a thin rail drops from it along the left of everything it folds, group titles and chips indented together to its right. Group titles use the slider label style: they are field labels, not section markers. Tapping the chip folds it back, and so does a new draft (save, Azzera, another entry to edit).
7. **Intensity slider**: large, full width, 0..10 with the number shown big and a colour ramp. Snaps to integers. Drag or tap. Hidden while the current layer holds only the mind (item 9). It edits the current layer's pain (§5.4).
8. **Episode toggle**: "In corso" switch next to the slider. Off by default the first time, then remembers the last used value.
9. **Other symptom sliders**, compact, one per enabled symptom other than pain, in vocabulary order, **by what the current layer holds** (§5.2): body regions → the pain slider and the body symptoms; the mind → the mind symptoms, all compact, no pain; both, or nothing → pain, the body symptoms, then the mind symptoms. A hidden slider keeps its value on the draft, but only what the layer shows is saved (§5.1): the pain level survives a detour through the mind, a mental reading set while the brain was selected does not survive its deselection, and a reading set with nothing selected is saved without a location. The vocabulary editor (§6.4) decides how long the form is: disable what is never tracked.
10. **Note**: a one-line field that grows with the text.
11. **Azzera** and **Salva**, bottom anchored in a sticky bar. Salva is the primary, full width beside Azzera. Azzera is enabled while the draft holds anything beyond the pain level (a region, a time, a tag, a note, another reading, on any layer) and empties the form with an undo toast "Modulo azzerato · Annulla"; the episode toggle stays. (Repeat last was absorbed by presets, §5.6.)

The form is one page: everything is in the flow and the fast path never scrolls. The first version hid symptoms, tags and note behind a **Dettagli** expander, then behind a **Sintomi · rimedi · note** sheet with a count badge (#1, #4); the tester read the sheet as a separate thing whose input was lost on closing (#15). One scrolling form with a single sticky Salva replaced both: the edit sheet had always been that form and nobody struggled with it. No hint line is needed any more, so the log screen has none.

There is no "Oggi" strip of today's entries either. It duplicated the top of the diary, sat right under the preset strip looking like it (same chips, opposite action: edit an old entry versus log a new one), and cost a row on the screen that must not scroll. The save toast is the receipt; the diary is the review.

Fast path: tap region(s) → drag slider → Save. Regions are optional; an entry with only intensity is valid.

On save: haptic tick (`navigator.vibrate` where available), toast "Salvato · Annulla" for 5 seconds, form resets but keeps mirror and episode toggle state. No confirmation dialogs anywhere in the app; destructive actions get an undo toast instead.

### 6.2 Diary

- Reverse-chronological list grouped by day. Each row: time, headline reading as a coloured pill (§5.1), the symptom name when it is not pain, region summary ("gambe, fianchi", "tutto il corpo"; with several layers each with its level, "gambe 8 · fianchi 4"), the tags of every layer, note preview, duration and level trail if episode.
- Tap a row → edit sheet, the same one-page form as Log, prefilled, with Delete and Salva and, at the bottom, **Crea preset da questa voce** (§5.6).
- Shows the last 30 days; a **Mostra altre** button at the bottom loads 60 more days at a time while older entries exist.
- Search by note text and a tag filter are planned (#10).

### 6.3 Trends

Range picker: 7, 30, 90, 365 days.

- **Body heatmap**: the same body SVG, read for **one symptom at a time**: pain by default, with a chip row to pick any other symptom recorded in range. A region is coloured by the mean level of that symptom over the entries that selected it, an entry counting once at the max over its layers that carry the symptom, and by how often it appeared; a layer without the symptom contributes nothing. Every stroke in range from such layers is laid over it at low opacity in its level's colour (§5.3). The mind is one more region: it lights up under a mental symptom.
- **Intensity over time**: daily max and mean pain as a bar/line chart. Other symptoms selectable.
- **Per preset** (only when a preset has samples in range): one small line per preset, its first symptom over time, dots coloured by the intensity ramp. Samples only: days without a sample stay empty, no carry-forward (§5.6).
- **Episodes**: count and mean duration.
- **Tags**: for each tag with enough data, mean of the daily maximum on days with vs without it, shown as two small bars with the day counts. Labelled as descriptive. Hidden when fewer than 5 days on either side; usage counts are shown instead until then.
- **Other symptoms**: mean of each non-pain symptom over the entries where it was recorded.
- **Report** button → §7.

### 6.4 Settings

- Language (it / en, follows device by default).
- Theme (system / light / dark).
- Figure: which CHOIR silhouette the body map draws, female or male (§5.3). Same regions either way, so switching loses nothing.
- Vocabulary editors: symptoms (two groups, **Corpo** and **Mente**, each with its own add field; a symptom is born in the group it was added to and moves within it), tags (three groups), reorder, enable/disable, rename, add.
- **Preset** list with delete (undo toast); creation happens from an entry's edit sheet (§5.6), and the empty state says so.
- **Backup**: last backup date, Export JSON (share), Export CSV (share), Import JSON (merge or replace, with a preview of counts before applying).
- Install to home screen hint (shown until installed).
- About and data location note ("your data only lives on this phone").

## 7. Report

A full-screen overlay in a fixed light palette, opened for the current range from Trends, with print CSS for A4; `@media print` hides the app behind it. No library. Contents:

1. Header: date range, generated on, number of entries and episodes.
2. Body heatmap for pain (front and back side by side), strokes as shading (§5.3).
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
  "version": 7,
  "exportedAt": "2026-09-13T18:00:00Z",
  "vocabulary": { "symptoms": [], "tags": [] },
  "entries": [],
  "presets": []
}
```

CSV export is one row per entry, one column per symptom (the max over the layers), then the layers (`regions:symptom=level;…:tags`, joined with `|`), the tags of every layer, the note and the history. Meant for spreadsheets, not for reimport.

Import rules: `replace` wipes and loads; `merge` upserts by `id` with newer `updatedAt` winning and adds vocabulary items that are missing. A sheet shows the file date and counts (new, updated) before committing. Replace is undoable from the toast: the previous state is snapshotted and restored on undo. Every version ever written is accepted: version 1 files (with `regions`), version 2 (history points with `pain`), version 3 (no `presets`), version 4 (named region ids, §5.3), version 5 (symptoms without a `category`, §5.2) and version 6 (`readings`, `areas` and `tags` on the entry) are upgraded on import; a symptom without a category gets the default for its id whatever the file version says. `strokes` on a layer (§5.3) is additive: files without it import unchanged. Version 6 → 7 (#29): one layer per area with the area's level as its pain (an area holding only the mind had no pain: its level was the highest mental reading, derived, and is not kept); the entry's other readings are placed by symptom category, mind readings on the first layer holding the brain, body readings on the first layer with a body, else the first layer, so nothing is dropped; the entry's tags go to the first layer; history points are placed the same way; presets likewise. The symptom categories come from the file's own vocabulary, the default for the id when it is missing. Merge adds presets that are missing by id; replace loads them.

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

- **Unit (Vitest)**: data layer on `fake-indexeddb` (CRUD, episodes, migrations), stats and correlation functions, export/import round trip and merge semantics, region helpers (mirror, limb shortcuts, full body), layer operations, the version 6 → 7 conversion, i18n key parity.
- **Component (Testing Library)**: every screen and sheet, against the real Dexie on `fake-indexeddb`: the fast path (select region, set intensity, save, entry appears), undo, the inline details and Tutti i tag, Azzera with undo, presets, the episode sheet (history, update and end with undo, hand-off to edit), the diary (day groups, row content, load more, edit and delete with undo), trends (ranges, heatmap, chart tap, tag comparison, symptom means), the report (numbers, sections, share as one HTML file), settings (language, theme, backup export and import with merge, replace and undo) and the vocabulary editor.
- **Manual checklist** before each release: see `CHECKLIST.md`.
- **Bundle size gate**: `npm run size` fails the build above 150 KB gzipped JS; it runs in CI.
- No e2e framework in v1.

## 12. Open work

This document describes the app as built. Anything planned, requested or undecided lives in the GitHub issues; where a section above cites an issue number, that behaviour is not built yet.
