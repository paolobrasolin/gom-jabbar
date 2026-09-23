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

Two kinds of thing (#20): something **chronic**, which is always there and whose level drifts, and an **episode**, which starts and ends. Both are made of the same unit, an **entry**: one reading at one time, with one or more symptom scores.

```ts
type Entry = {
  id: string;            // nanoid
  kind: 'chronic' | 'episode';
  at: string;            // ISO datetime: a chronic snapshot's reference time; an episode reading's time, the head's being the start
  layers: Layer[];       // never empty; see below and §5.4
  note: string;
  episodeId?: string;    // episode only: the head's id; the head is the entry whose episodeId is its own id (§5.5)
  endedAt?: string | null; // head only: when the episode ended, null while it is active
  presetId?: string;     // the preset this entry was logged from (§5.6)
  createdAt: string;
  updatedAt: string;
};
```

Rules:

- A **chronic** entry is a snapshot, "this is how it is right now" (or at a backfilled time). It has no start and no end, only its reference time. Updating a chronic thing is logging another snapshot; a preset (§5.6) names the thing so its snapshots read as one stream.
- An **episode** is a chain of entries (§5.5): the **head**, the reading it started with, and its **updates**, later readings pointing at it. The head carries the end: `endedAt` null while the episode is active, set once it is over. An episode may be logged already over (start and end both set on the form, §6.1) or ended later from its card or its form. Duration is derived from the head.
- Readings live only in entries. Nothing is stored twice: the head is the start, the latest update is where the episode stands, and every stat reads every entry, the updates included.
- `kind` is redundant with `episodeId` (an episode entry has one, a chronic one does not) and kept as the readable label; both always agree. Before version 8 an episode was one row with an `ongoing` flag and a `history` of readings (§8).
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

The body is one figure on a **stage** (#22, §6.1), front or back, turned over by a sideways swipe or a tap on a card showing the other side; Trends and the report show the two views side by side. The figures and their segmentation are the **CHOIR body map** (Collaborative Health Outcomes Information Registry, Stanford; Scherrer et al., PAIN Reports 2021), a validated 74-segment pain map: 36 front and 38 back segments, in a female and a male silhouette with identical segmentation, chosen in Settings (§6.4). The polygons come from the MIT-licensed CHOIRBM R package, vendored in `scripts/choir/` with attribution; `scripts/choir.mjs` writes `src/lib/figures.ts`, keyed by CHOIR code with the female 112–117 renumbered to the male order so a code means the same segment on both figures.

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

Special: `*` = full body. When selected, the whole figure fills, both views, and individual regions cannot be toggled until it is deselected. The mind stays toggleable.

**Drawing** (#18). The tester can shade exactly where it hurts without picking a segment, as on a clinical pain drawing. **Disegna**, in the right rail of the stage (§6.1), turns the finger into a brush: on the skin one finger paints; a finger in the air beside the body still swipes to turn it, and the card of the other side always does. Two fingers pan and pinch (from the fit to 6× it; the **+**, **−** and **Adatta** buttons of the rail do the same, in either mode, and a turn, a new draft or a figure switch fit the figure again), a second finger cancels the stroke in progress, nothing painting again until every finger is up; a third finger freezes the pair. The mind steps aside while the brush is out: it is not drawn on. The pan and zoom are a transform on the SVG, since native pinch zooms the whole app. When a gesture ends it is cut at every segment border into **pieces**, and a piece is what is stored: `{ region, fig, view, points: [x, y][], w }`, the segment it lies in, the figure it was drawn on (the two silhouettes have different coordinates), the view, its points in that figure's viewBox coordinates, simplified (Ramer–Douglas–Peucker) and rounded to a tenth, and the brush width; a tap is a one-point piece, drawn as a dot. The centreline is sampled every 4 units (the smallest segment containing each sample, or the nearest one when a sample falls outside the figure) and each cut is bisected to within a quarter unit of the border, the two pieces ending and starting on their own side of it, so every point of a piece lies in its segment and the round caps close the hairline gap. A piece shorter than a brush width is a graze and is dropped, unless the gesture has nothing longer: a dot or a short stroke always yields one piece. The pieces' segments join the layer exactly as taps would, mirror never applying, so summaries, the heatmap and the stats keep working on regions, and paint never lies outside the segments it selected. Pieces live on the layer, so they inherit its level, and each goes wherever its segment goes (§5.4). A piece lands where a body tap would (§5.4): in the current layer. **Annulla tratto** and **Cancella disegno**, above the brush while it is out, take back the last gesture (all its pieces, while they are still the last ones; on a loaded drawing, one piece at a time) and every piece of the current layer, the latter with an undo toast; the regions stay, they may have been tapped as well. A layer emptied of regions is dropped with its paint; full body keeps the layer's paint and takes new pieces without touching its star. Pieces are drawn in their layer's colour, each clipped to its own segment so a round cap never shows on a neighbour (the gesture in progress is clipped to the silhouette), on the stage and on the card of the other side, and only on the figure they were drawn on: after a switch in Settings the regions still show, the shading waits for a switch back. On the Trends heatmap and on the report (§6.3, §7) every piece in range on the current figure, from the layers carrying the symptom shown, is laid over it at low opacity, so overlap builds density the way a stack of pain drawings does. The brush is put away with the draft (save, Azzera, another entry).

The pieces are separate from the layout: `BodyFigure.svelte` renders one view of the body as SVG content (regions, shading, the stroke in progress, the hit layer), `Stage.svelte` puts one under a camera with the rails around it, `BodyMap.svelte` puts two side by side with the mind between for Trends and the report; the camera maths is `lib/camera.ts` and the fingers are `lib/gesture.svelte.ts`, both pure of any layout. Each view is fitted and centred on its own content box (`viewBox` in `lib/regions.ts`): the CHOIR back sits off the front's centre and is a little smaller.

**The mind** (#19). A brain figure, seen from above, stands for it: on the stage it is a card in the right rail, under the card of the other side (on the read-only pair, between the two heads), selectable like a region and stored as one: the region id `mind`, added and never renamed. It is not a CHOIR segment: no side, no view, no mirror, no limb, `REGION_BY_ID` does not know it, `MIND` and its shape live in `lib/regions.ts`. It is where the mental symptoms live: selecting it turns the layer's sliders to them (§6.1). Full body does not cover the mind; on the heatmap it lights up under a mental symptom like any region under pain (§6.3). The tester's picture (#16) is "body and mind": physical dimensions from the body, mental ones from the mind. This is per-entry logging of how the head feels right now, not the periodic check-in with a validated scale (#7).

Multi-region is the norm. Helpers, in the stage's left rail (§6.1), each an icon with a short caption and a full name for assistive tech:

- **Tutto** (full body), **Testa**, **Torso** (the front and back trunk), **Gambe** and **Braccia**: a set joins the current layer as a whole, or leaves it when it is all there. With Sx·dx off, Gambe and Braccia split into a left and a right button on one row.
- **F·R** (fronte e retro): a tap takes the same part on the other view along, limbs and head; the trunk families do not correspond and stay on their view. On by default.
- **Sx·dx**: a tap takes the other side along. Off by default since #22 (before, on: an install from before is reset once, since that was never a choice). Both mirrors are remembered between sessions and never apply to paint or to the mind.
- A tap just off the skin, within 10 figure units, lands on the nearest segment: wrists and ankles are small.

There is no hold gesture: press and hold used to take the whole limb, and went with #22 in favour of the rail, which is visible.

### 5.4 Layers

An entry is a stack of **layers** (#29): each its own regions, its own sliders, its own tags, its own paint. They are independent and may overlap: a region in one layer says nothing about the others. One layer is *current*; the map, the sliders and the tag strip edit it and nothing else.

- The form opens with one layer without regions. Tapping regions puts them in it; with one layer this is exactly the two-taps-and-a-swipe fast path, and no chip is shown.
- Layer chips appear in the spine of the drawer (§6.1) once something is located, as the tabs of the current layer's panel: the layer's headline (§5.1) and where, "8 · fianchi, gambe", "6 nebbia mentale · mente", "4 · fianchi · Compressione". Tap a chip to make it current; with more than one layer its regions get an outline on the figure and the other layers fade to a ghost, paint included, so overlap stays visible.
- **+**, at the end of the tabs, starts a new empty layer at the current pain level, makes it current and brings the figure back if the drawer was open. Subsequent taps go into it. A layer without regions is dropped when you switch away or save (except the only one).
- Tapping a region in the current layer removes it, with its paint; so does a limb or a set chip; tapping one that is not there adds it, whatever the other layers hold. A tap never moves a region between layers. Whenever a tap takes paint away, a toast "Tratti cancellati · Annulla" offers to undo it.
- Full body fills the current layer: its regions become the star (and the mind, if selected), its paint stays; off again, the body goes with its paint and the mind stays.
- **The mind is one region among the others** (#28): tapping it puts it in the current layer or takes it out, so body and mind make one pill, "7 · gambe, mente". Mirror never applies to it, sets and limbs never include it, and it stays toggleable under full body. Which sliders a layer shows follows its regions (§6.1).
- Tags belong to the layer: a remedy for the legs is not one for the head. The strip and the grouped list, in the layer's panel, toggle the current layer's tags.
- Overall pain shown in the diary and used for trends is the max over the layers' pain; a layer holding only the mind has none.

Before 0.5.0 an entry had *areas*: a partition of the body with one level each, and one set of readings and tags for the whole entry. Selecting a region in one area silently took it out of another, and the mind needed rules of its own to carry a level. Layers are what areas were meant to be.

### 5.5 Episodes

An episode is a chain of entries with the same `episodeId`: the head first, then its updates in time order. The head is the entry whose `episodeId` is its own id; it carries `endedAt`. An update is one more reading of the episode: its own `at`, its own layers (the regions, paint and tags of the reading before it, with the levels and remedies given), no note, no end, no preset (it inherits its head's). The **trail** the diary shows, "7 → 4 → 2", is the headline symptom over the chain, and the level shown for an episode anywhere (its card, its diary row, the report) is its latest reading's.

Tapping an active episode card opens a sheet with its summary as it stands, how long it has lasted, its **readings** as a row of tappable points (time and level; tap one to edit that entry), the layer chips when there is more than one layer (the same chips as the form, §5.4: the sliders and the remedy chips below follow the selected layer), one slider per symptom the layer tracks (pain when the layer shows the body; the others when above 0), the **Rimedi** and **Farmaci** chips (remedies happen in response to pain: this is where "ho preso il farmaco" gets recorded; context tags stay in the edit sheet), **Aggiorna** and **Termina**, plus a **Modifica zone e note** link to the head's form (§6.2). **Aggiorna** logs an update with every slider of every layer and the chips as picked; the toast takes it back. **Termina** sets the head's end now; if a slider or a chip moved it first logs that reading, so a remedy taken at the end is not lost; undo reopens and removes that reading. An ended episode's sheet, reached from its diary row, has the readings and the edit link but no sliders.

Editing an episode's form (§6.1): the head's form shows Inizio and Fine; Fine set to **In corso** reopens it, to a time ends it; switching to Cronico makes it a snapshot (only while it has no updates: a head with updates keeps its kind, its end still moves). An update's form has no kind and no end, only when, and no preset creation: it is a reading of its episode. Deleting a head deletes its chain, with one undo toast for all of it; deleting an update leaves the rest.

Before version 8 an episode was a single row: `ongoing` said it was active, its `layers` held the latest readings and `history` the trail, one record of readings per layer per point (the starting readings first since version 3; before, the first update). Version 8 splits it into the chain (§8). That row was rejected in #5 as "one entry with an unbounded history" and reappeared as option 2 of #20; the chain is what both wanted: one kind of thing carries readings, and an episode is a span that groups them.

### 5.6 Presets

The recurring shape of either kind (§5.1): the back that is always there and only drifts, the migraine that comes back the same way. A **preset** is a named, saved shape of an entry:

```ts
type PresetLayer = { regions: RegionId[]; asks: SymptomId[]; strokes?: Stroke[] };
type Preset = { id: string; name: string; layers: PresetLayer[]; kind: 'chronic' | 'episode'; order: number };
```

A preset layer is a where, with its paint, and **what it asks there**: the sliders its sheet shows for that layer, pain first, in vocabulary order. It has no readings (they are set at each save) and no tags (a tag is a fact about one reading, like the level, and the tag comparison in Trends, §6.3, needs it to vary between readings). Before version 9 the sliders were one list on the preset, `symptomIds`, shared by every layer; two body layers could not ask different things nor take different levels (§8).

- **Created from the log screen** (#21). The strip (§6.1) always starts with a **+** chip, "+ Nuovo preset" before the first exists. It opens the **preset form** in a sheet: a name field; the stage, the layer tabs and the kind switch of the log form (§6.1) and nothing else, no time, tags, sliders or note; and, in the layer's panel where the log form has its slider, a **Chiede** row that follows the current tab, like the tag strip of the log form (§5.4): one chip per enabled symptom that layer's regions show, pain first, in vocabulary order, the sliders the preset will ask there. The form opens on the log form as it stands, empty included (its time, note and tags are not part of a shape and are not shown); each layer's chips start pressed for pain (when it shows the body) and for every symptom above 0 on it. Membership is explicit, so a symptom at 0 today still belongs to the shape and one set today can be left out. **Crea preset** needs only a name: a layer asking nothing is a location that records pain 0 when it shows the body and nothing otherwise, and a preset asking nothing at all is a one-tap "nothing to report" for its places (its sheet has the time chips and Salva alone). It saves the preset alone, no entry, closes, and marks the log form with it: the new chip shows pressed and the ordinary Salva logs the first reading under the name (so does the chip's sheet, which then empties the form); the toast "Preset creato · Annulla" deletes it and unlinks the form. The layers are stored with their regions, paint and asks; readings and tags stay behind. A layer asks only what its regions show, whatever the chips said before the regions changed.
- **Also from an entry**: **Crea preset da questa voce** at the bottom of the edit sheet (§6.2, not from an update's form) opens the same preset form, over the sheet, on the entry as it stands in the form; the sheet stays open and nothing else is saved. The first version created presets only there, after a shape had been logged a few times (#15); since #20 the preset is what names a chronic stream, so it comes first.
- **Edited in place** from Settings (§6.4): **Modifica** on its row, same form, **Salva** keeps the id and the order, so every entry logged from it stays in its stream; the toast restores the previous shape. This is the repair for a wrong first guess: recreating would orphan the stream.
- The home screen shows a strip of preset chips: `4 Schiena · 2g` (headline of the latest reading logged from it, and how long ago; "mai" before the first; for an episode preset the latest reading is the last update of the last episode it opened). Tap → a sheet named after the preset with the time chips (§6.1: the reference time of a chronic reading, the start of an episode; "Adesso" unless said otherwise), one slider per symptom the layer asks for, every one at 0 (a reading is what it is now, never what it was), and **Salva**. Two taps. With several layers the sheet has the layer chips of the episode sheet (§5.5) and the sliders follow the selected one; each layer keeps its own levels.
- Each save logs an **ordinary entry** carrying `presetId`: its layers, each with the levels of its own sliders (a body layer records pain 0 when it does not ask for pain), no tags, an empty note; a chronic snapshot, or the head of a new episode when the preset's kind is episode (the card handles the rest, §5.5). The diary stays honest and every existing feature works. A diary row logged from a preset is named after it (§6.2).
- Trends draws one line per preset (§6.3), the updates of the episodes it opened included. Presets are deleted from Settings (undo toast) and travel in the backup (§8).
- It absorbs the old **Ripeti l'ultima** button, a nameless preset. Rejected alternatives: a `persistent` flag on episodes and carry-forward in trends only (#5); a stored `chronic` entry kind with its own unbounded history (#20, option 2), which would have duplicated what a preset and its snapshots already are.

## 6. Screens

Bottom tab bar, four tabs, thumb reachable. The app opens on **Log**.

### 6.1 Log (home)

This screen is the product. Layout top to bottom:

1. **Active episode cards** (only if any): "7 · gambe · da 3h", or "3 · gonfiore · gambe · da 3h" when the headline is not pain (§5.1), with a **Termina** button. Tap the card → update sheet (§5.5).
2. **Preset strip** (§5.6): a **+** chip first, so it never scrolls away ("+ Nuovo preset" while there are none), then one chip per preset, `4 Schiena · 2g`, pressed while the form carries that preset. Tap a preset → preset sheet; + → preset form.
3. While the app is not installed (no `display-mode: standalone`, no `installedAt` pref): an inline **install nudge** in the backup banner style, "Aggiungi alla schermata Home per tenere i dati al sicuro", with **Aggiungi** and a dismiss. It shows on every launch until the app is installed; dismiss hides it for the current session only. Aggiungi replays the browser install prompt when captured, else opens the how-to sheet (§4.1).
4. **The stage** (§5.3): one figure, front or back, as large as the slot the drawer leaves it, captioned DAVANTI or DIETRO at the top left, under a camera. Left rail, bottom aligned: Tutto, Testa, Torso, Gambe, Braccia (a left and a right button on one row when Sx·dx is off), then F·R and Sx·dx on the last row. Right rail, top down: a card with the other side, its selection and paint on it, which turns the figure over; the mind, a card of the same width; **Disegna**, with Annulla tratto and Cancella disegno above it while it is on (the mind steps aside then); **+**, **−** and **Adatta**. A sideways swipe anywhere turns the figure while the brush is away, from the air beside the body while it is out. The stage never changes size while an entry is being made: the drawer slides over it.
5. **The drawer**, over the stage, collapsed until pulled: the **spine**, the layer tabs (§5.4) with **+** and the handle, **Altro**, at its end; the current layer's **panel** with its headline slider, pain when the layer shows the body, the first mind symptom when it holds only the mind; and the Azzera / Salva bar. That is the fast path, and it is all there is until the handle is tapped or dragged up. Open, the drawer covers the figure and the panel goes on with the layer's other sliders and its tag strip, and below the panel come the entry's own fields: the kind switch, the time row, the note. The handle reads **Corpo** then, and it, **+** and Salva slide the drawer back. While collapsed the handle says what is set past the fast path: "Altro · 1h fa", "Altro · Fine 3h fa", "Altro · Oggi 12:30".
6. **Kind and time** (#20), in the drawer under the panel: **Cronico / Episodio** is one switch with two halves, on its own row; then the time row, captioned **Quando** for a chronic entry and **Inizio** for an episode, with the chips "Adesso", "1h fa", "3h fa", "Stamattina", "Ieri sera" and "Scegli…" (a datetime picker); for an episode a **Fine** row follows: "In corso" (pressed by default: the episode is still going), "Adesso" (the moment it is pressed), "1h fa", "3h fa", "Scegli…". An end makes the entry an episode already over, saved straight to the diary; without one it becomes an active card. The next draft keeps the kind, never the end. The rows are the `TimeChips` component, shared with the preset sheet (§5.6).
7. **Tag strip**, in the layer's panel after its sliders: a chevron chip (**Tutti i tag**), then **every enabled tag**, the most used first (count over every entry, ties in vocabulary order; a fresh install shows vocabulary order). What gets used sits under the thumb, the long tail is a swipe away, and nothing needs a cutoff or a "keep the selected ones visible" rule. Tap toggles the tag on the current layer (§5.4); the order never changes under a finger, it follows usage across saves (#4, #15). The chevron replaces the strip with the same tags grouped by type, for browsing by category: the chip stays in its slot (now pointing up) and a thin rail drops from it along the left of everything it folds, group titles and chips indented together to its right. Group titles use the slider label style: they are field labels, not section markers. Tapping the chip folds it back, and so does a new draft (save, Azzera, another entry to edit).
8. **Headline slider**: large, full width, 0..10 with the number shown big and a colour ramp. Snaps to integers. Drag or tap. It edits the current layer's pain (§5.4), or, while the layer holds only the mind, its first mind symptom (item 9).
9. **Other symptom sliders**, compact, one per enabled symptom, in vocabulary order, **by what the current layer holds** (§5.2): body regions → the pain slider and the body symptoms; the mind → the mind symptoms, the first of them as the headline, no pain; both, or nothing → pain, the body symptoms, then the mind symptoms. A hidden slider keeps its value on the draft, but only what the layer shows is saved (§5.1): the pain level survives a detour through the mind, a mental reading set while the brain was selected does not survive its deselection, and a reading set with nothing selected is saved without a location. The vocabulary editor (§6.4) decides how long the form is: disable what is never tracked.
10. **Note**: a one-line field that grows with the text, last of the entry's fields.
11. **Azzera** and **Salva**, at the bottom of the drawer whatever its state. Salva is the primary, full width beside Azzera. Azzera is enabled while the draft holds anything beyond the pain level (a region, a time, an end, a tag, a note, another reading, on any layer, or a preset just named) and empties the form with an undo toast "Modulo azzerato · Annulla"; the kind stays. (Repeat last was absorbed by presets, §5.6.)

Nothing on the screen scrolls and the fast path is always in view. The first version hid symptoms, tags and note behind a **Dettagli** expander, then behind a **Sintomi · rimedi · note** sheet with a count badge (#1, #4); the tester read the sheet as a separate thing whose input was lost on closing (#15). One scrolling form with a single sticky Salva replaced both, with two small figures in it. The tester's picture of the screen was a figure you touch (#16), and a figure that fills the screen leaves no room for a form under it: the rest went into a drawer that slides over the figure (#22), its collapsed state the fast path, so the figure never changes size and the layer's tabs, its headline and Salva never leave the thumb. What belongs to a layer is in its panel under its tab; what belongs to the entry sits below the panel. The only hint line left is the empty spine's "Nessuna zona: tocca la figura".

There is no "Oggi" strip of today's entries either. It duplicated the top of the diary, sat right under the preset strip looking like it (same chips, opposite action: edit an old entry versus log a new one), and cost a row on the screen that must not scroll. The save toast is the receipt; the diary is the review.

Fast path: tap region(s) → drag slider → Salva. Regions are optional; an entry with only intensity is valid.

On save: haptic tick (`navigator.vibrate` where available), toast "Salvato · Annulla" for 5 seconds, form resets but keeps the mirrors and the kind, and fits the figure again. No confirmation dialogs anywhere in the app; destructive actions get an undo toast instead.

### 6.2 Diary

- Reverse-chronological list grouped by day. One row per chronic entry and per episode (its head's time; updates are never rows of their own, §5.5). Each row: time, headline reading as a coloured pill (§5.1; an episode's is its latest reading's), the symptom name when it is not pain, region summary ("gambe, fianchi", "tutto il corpo"; with several layers each with its level, "gambe 8 · fianchi 4"), the tags of every layer, note preview, and for an episode "in corso" or its duration and the trail over its readings ("2h · 7 → 4"). A row logged from a preset leads with the preset's name instead of its regions ("4 · Schiena · Calore"; with several layers the levels stay, "Gambe · gambe 8 · fianchi 4"), so a chronic stream reads as updates of one named thing (#20); a preset since deleted leaves the row as any other.
- Tap a chronic row → edit sheet, the same stage and drawer as Log at a fixed height, prefilled, opening on the view holding most of the entry, with Elimina and Salva in the drawer's bar and, last of the entry's fields, **Crea preset da questa voce**, which opens the preset form over the sheet (§5.6). A sheet over a sheet covers it, backdrop included, and peels off one at a time: Escape and the backdrop close the top one. Tap an episode row → the episode sheet (§5.5), whose Modifica link opens the head's form and whose readings open each update's.
- Shows the last 30 days; a **Mostra altre** button at the bottom loads 60 more days at a time while older entries exist.
- Search by note text and a tag filter are planned (#10).

### 6.3 Trends

Range picker: 7, 30, 90, 365 days.

- **Body heatmap**: the same body SVG, read for **one symptom at a time**: pain by default, with a chip row to pick any other symptom recorded in range. A region is coloured by the mean level of that symptom over the entries that selected it, an entry counting once at the max over its layers that carry the symptom, and by how often it appeared; a layer without the symptom contributes nothing. Every stroke in range from such layers is laid over it at low opacity in its level's colour (§5.3). The mind is one more region: it lights up under a mental symptom.
- **Intensity over time**: daily max and mean pain as a bar/line chart. Other symptoms selectable.
- **Per preset** (only when a preset has samples in range): one small line per preset, pain over time when any of its layers asks for it, else the first symptom its first layer asks for, dots coloured by the intensity ramp. Samples only: days without a sample stay empty, no carry-forward (§5.6).
- **Episodes**: count and mean duration (heads only). Every other number counts every entry, an episode's updates included: the daily max sees the 8 a migraine started at, not only the 3 it ended at, and a three-day episode contributes to every day it was updated on. Region frequency on the heatmap counts an episode once per reading, as a chronic preset logged daily already does.
- **Tags**: for each tag with enough data, mean of the daily maximum on days with vs without it, shown as two small bars with the day counts. Labelled as descriptive. Hidden when fewer than 5 days on either side; usage counts are shown instead until then.
- **Other symptoms**: mean of each non-pain symptom over the entries where it was recorded.
- **Report** button → §7.

### 6.4 Settings

- Language (it / en, follows device by default).
- Theme (system / light / dark).
- Figure: which CHOIR silhouette the body map draws, female or male (§5.3). Same regions either way, so switching loses nothing.
- Vocabulary editors: symptoms (two groups, **Corpo** and **Mente**, each with its own add field; a symptom is born in the group it was added to and moves within it), tags (three groups), reorder, enable/disable, rename, add.
- **Preset** list, each with **Modifica** (the preset form, in place) and **Elimina** (undo toast) (§5.6); the empty state points at the + chip on the log screen.
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
  "version": 9,
  "exportedAt": "2026-09-13T18:00:00Z",
  "vocabulary": { "symptoms": [], "tags": [] },
  "entries": [],
  "presets": []
}
```

CSV export is one row per entry (an episode's updates are rows of their own, linked by `episodeId`): id, kind, time, episodeId, endedAt, presetId, one column per symptom (the max over the layers), then the layers (`regions:symptom=level;…:tags`, joined with `|`), the tags of every layer and the note. Meant for spreadsheets, not for reimport.

Import rules: `replace` wipes and loads; `merge` upserts by `id` with newer `updatedAt` winning and adds vocabulary items that are missing. A sheet shows the file date and counts (new, updated) before committing. Replace is undoable from the toast: the previous state is snapshotted and restored on undo. Every version ever written is accepted: version 1 files (with `regions`), version 2 (history points with `pain`), version 3 (no `presets`), version 4 (named region ids, §5.3), version 5 (symptoms without a `category`, §5.2), version 6 (`readings`, `areas` and `tags` on the entry), version 7 (`ongoing` and `history` on the entry, `preset` and `ongoing` on presets) and version 8 (`symptomIds` on presets) are upgraded on import; a symptom without a category gets the default for its id whatever the file version says. `strokes` on a layer (§5.3) is additive: files without it import unchanged. Version 6 → 7 (#29): one layer per area with the area's level as its pain (an area holding only the mind had no pain: its level was the highest mental reading, derived, and is not kept); the entry's other readings are placed by symptom category, mind readings on the first layer holding the brain, body readings on the first layer with a body, else the first layer, so nothing is dropped; the entry's tags go to the first layer; history points are placed the same way; presets likewise. The symptom categories come from the file's own vocabulary, the default for the id when it is missing. Version 7 → 8 (#20): an episode becomes a chain (§5.5). A row that was `ongoing`, had an `endedAt` or carried a `history` at all is the head, `kind: 'episode'`, its own id as `episodeId`, `endedAt` as it was (null while active); every history point becomes an update, id `<head id>:<n>`, at the point's time with the head's regions and paint and the point's readings, no tags and no note. When the first point sits at the start (histories since version 3) the head takes its readings and the point is not repeated; the row's own readings were the latest, so when they differ from the last point's (edited after the last update) they are one more update at `updatedAt`. Histories from before version 3 do not start at the head: the head keeps its readings and every point is an update. Any other row is `kind: 'chronic'`. `preset` becomes `presetId`; on presets `ongoing` becomes `kind`. `ongoing`, `history` and `preset` are dropped only after their replacements are written, and one row may come back as several. The same rule runs as the Dexie 8 upgrade, heads rewritten in place and updates added beside them, nothing cleared. Version 8 → 9 (#21): a preset's `symptomIds` become `asks` on each of its layers (§5.6), the old list in its order kept to what that layer's regions show by symptom category, which is what the old sheet ended up recording there; a preset without layers gets one unlocated layer asking the whole list; a symptom no layer shows is asked nowhere (the old sheet asked it and threw the answer away). `symptomIds` goes once replaced; a layer's `readings` and `tags` stay as they were, unread, as fields the code no longer knows. Entries are untouched. The same rule runs as the Dexie 9 upgrade. Merge adds presets that are missing by id; replace loads them.

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
- Every gesture on the figure has a visible control that does the same (#22, #23): the swipe has the card of the other side, the pinch has +, − and Adatta, a tap in the air has the nearest segment. No hold gestures.
- Italian copy first, terse, informal ("Salva", "Annulla", "In corso").

## 11. Testing

- **Unit (Vitest)**: data layer on `fake-indexeddb` (CRUD, episode chains, migrations), stats and correlation functions, export/import round trip and merge semantics, region helpers (mirrors, quick sets, full body, view boxes, the nearest segment), layer operations, the version 6 → 7, 7 → 8 and 8 → 9 conversions, i18n key parity.
- **Component (Testing Library)**: every screen and sheet, against the real Dexie on `fake-indexeddb`: the fast path (select region, set intensity, save, entry appears), undo, the stage (swipe and card, near-skin taps, both mirrors, the rail, zoom, paint), the drawer (handle, faces, the time on the handle) and Tutti i tag, Azzera with undo, presets, the episode sheet (readings, update and end with undo, hand-off to edit), the kind chips and the end row, the diary (day groups, row content, load more, edit and delete with undo), trends (ranges, heatmap, chart tap, tag comparison, symptom means), the report (numbers, sections, share as one HTML file), settings (language, theme, backup export and import with merge, replace and undo) and the vocabulary editor.
- **Manual checklist** before each release: see `CHECKLIST.md`.
- **Bundle size gate**: `npm run size` fails the build above 150 KB gzipped JS; it runs in CI.
- No e2e framework in v1.

## 12. Open work

This document describes the app as built. Anything planned, requested or undecided lives in the GitHub issues; where a section above cites an issue number, that behaviour is not built yet.
