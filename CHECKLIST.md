# Release checklist

Automated on every push: type check, unit tests, build, bundle size gate. A push to `main` also deploys to Pages, and installed phones pick it up on their next open without asking, so only merge into `main` what has passed the manual pass below.

Release, from a clean tree on `main`:

```sh
git merge --ff-only development
npm version patch      # refuses if check or tests fail; commits and tags vX.Y.Z
git push               # tags follow (push.followTags is set)
```

Settings shows `Versione X.Y.Z+<short commit>`; `-dirty` after the hash means a local build, never a deploy.

Manual, on a real phone, before telling anyone to update:

## Android (Chrome)
- [ ] Open the Pages URL, install to the home screen, launch from the icon: opens straight on the log screen, no browser chrome.
- [ ] Airplane mode, relaunch: still opens and shows the diary.
- [ ] Log: tap two regions, drag the slider, Save. Undo from the toast. Repeat with Sx·dx on.
- [ ] Press and hold a thigh: nothing happens, no context menu, no text selected.
- [ ] The stage: one figure fills the slot, the brain in its corner, the rail on the left (Sx·dx off and F·R on by default, Tutto, Testa, Torso, Gambe, Braccia; with Sx·dx off each limb splits into a left and a right button on one row). Tap a thigh: the thumbnail lights the thigh behind; F·R off, it does not, a thumbnail of the other side above the brain, then Disegna and the zoom (+, −, Adatta) on the right. Pinch with Disegna off: it zooms; + and Adatta do the same; Salva shows the whole figure again. A tap just beside a wrist still selects it. Swipe sideways across the body: the back shows, centred like the front, the segment under the finger is not toggled; tap the thumbnail to come back. A short or slanted drag toggles nothing.
- [ ] The drawer: collapsed it holds the layer tabs, the current layer's panel with Dolore, and Salva; the figure behind never changes size. Tap Altro or drag it up: the drawer slides over the figure, the panel goes on with the other sliders and the tags, and below it the kind switch on its own row, the time row captioned Quando (Inizio and a Fine row for an episode) and the note. Corpo, +, and Salva slide it back. Pick "1h fa": the handle reads "Altro · 1h fa".
- [ ] Disegna: Annulla and Cancella appear above it, the brain steps aside. A finger on the skin shades a spot and the layer chip names the segment, a tap is a dot, Annulla takes the dot back; a swipe from the air beside the body turns it, one on the skin paints a line; pinch zooms, two fingers pan, Adatta and a turn show the whole figure again. Disegna off: the shading stays, the segments toggle again. Salva; open the entry from Diario: the shading is there, on the side that holds it.
- [ ] "+" in the tabs, tap the same thigh again with a different level and a tag: two chips, the first layer's legs fade on the map, the tag strip shows only the current layer's tags; tapping the first chip brings its regions and tags back. Diary line shows "gambe 8 · coscia sx 3 · Compressione".
- [ ] Tap the mind: the pain slider goes, Nebbia mentale stays; set it, Salva; diary row "6 nebbia mentale · mente". Tap the mind and a thigh: one chip "gambe, mente", both kinds of sliders.
- [ ] "Episodio" with two layers, save, tap the episode card: the chips pick the layer, update a level on each (Aggiorna), then end it. Undo the end. The diary row shows the latest level and the trail "7 → 4"; tap it: the sheet lists the readings, tap one to edit it, Modifica zone e note opens the head with Inizio and Fine.
- [ ] "Episodio", Inizio "3h fa", Fine "1h fa", Salva: no card, a diary row with "2h". Open it, Fine → In corso, Salva: the card is back.
- [ ] Time chips: "Ieri sera" lands on yesterday in the diary. Same from a preset sheet.
- [ ] Details inline: scroll down past the slider, set another symptom, Tutti i tag → pick a context tag (it joins the strip, pressed), type a note (field grows, keyboard does not cover Salva). Salva. Diary row shows the tag and the note.
- [ ] Azzera: fill the form, Azzera empties it, Annulla from the toast brings everything back.
- [ ] Settings → Esporta backup: share sheet opens, file lands in Drive or Files. Toast "Backup esportato".
- [ ] Settings → Importa the same file: preview counts, Unisci. Then Sostituisci tutto and Undo.
- [ ] Preset: on Registra pick zones and move a second slider, tap "+ Nuovo preset"; the form shows the zones, Chiede has Dolore and the second symptom pressed; unpress one, press another, name it, Crea preset; the chip appears pressed and the form is still filled; Salva; the chip shows the level and "0m" and is no longer pressed; the diary row is named after the preset; Andamento has a Per preset line. Undo on "Preset creato" removes the chip and the next Salva has no name. From a Diario entry, Crea preset da questa voce opens the form over the sheet; Escape closes only the form. In Impostazioni tap Modifica, rename, toggle a Chiede chip, Salva, undo; delete it and undo.
- [ ] Preset with two zones: on Registra pick the legs, "+ Altra zona", a shoulder, "+ Nuovo preset"; Chiede changes when you tap the other layer chip; Crea preset; tap the chip: the sheet has two layer chips, every slider at 0, the sliders follow the chips, Salva; the log form is empty afterwards; the diary row shows both levels ("Nome · gambe 5 · spalla 3").
- [ ] Update from 0.5.0 with data: every old episode is one diary row with its trail, Andamento's counts include the updates, every old preset still opens its sheet with the same sliders, Settings → Esporta gives a version 9 file.
- [ ] Vocabolario: add a medication tag, rename, disable, reorder. It shows up (or not) under Tutti i tag on the log form; a disabled symptom loses its slider. Sintomi shows Corpo and Mente; add one under Mente, it appears only with the mind (or nothing) selected.
- [ ] Andamento with data: heatmap, its symptom chips (the brain lights up under Nebbia mentale), chart tap shows a day, range chips.
- [ ] Report → Stampa / PDF → Save as PDF. Report → Condividi file → open the HTML from Drive.
- [ ] Dark and light theme, both readable. System theme switch updates the status bar colour.
- [ ] Backup nudge appears after 14 days (or set lastBackupAt back in devtools), "Più tardi" snoozes it.

## iOS (Safari)
- [ ] Share → Add to Home Screen. Launch from the icon.
- [ ] Storage persists after a week of not opening (only if installed; Safari evicts otherwise).
- [ ] Slider drag, long press without magnifier or callout, share sheet for backup.
- [ ] Printing from the home-screen app may not work: use Report → Condividi file, open in Files, then Share → Print.
- [ ] Safe areas: nothing hidden under the notch or the home indicator.

## Before a schema change
- [ ] Bump the Dexie version with an upgrade function and add a migration test.
- [ ] Bump `EXPORT_VERSION` if the export shape changes, keep `parseImport` accepting older files.
