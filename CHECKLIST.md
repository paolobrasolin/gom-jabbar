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
- [ ] Log: tap two regions, drag the slider, Save. Undo from the toast. Repeat with "Entrambi i lati" off.
- [ ] Press and hold a thigh: whole leg selects. Long press does not open a context menu or select text.
- [ ] Disegna: one figure fills the map, pinch and drag move it, a finger shades a spot and the layer chip names the segment, a tap is a dot, Annulla tratto takes the dot back. Dietro shows the back. Disegna again: the shading shows on the small map. Salva; open the entry from Diario: the shading is there.
- [ ] "+ Altra zona", tap the same thigh again with a different level and a tag: two chips, the first layer's legs fade on the map, the tag strip shows only the current layer's tags; tapping the first chip brings its regions and tags back. Diary line shows "gambe 8 · coscia sx 3 · Compressione".
- [ ] Tap the mind: the pain slider goes, Nebbia mentale stays; set it, Salva; diary row "6 nebbia mentale · mente". Tap the mind and a thigh: one chip "gambe, mente", both kinds of sliders.
- [ ] "In corso" with two layers, save, tap the episode card: the chips pick the layer, update a level on each, then end it. Undo the end.
- [ ] Time chips: "Ieri sera" lands on yesterday in the diary.
- [ ] Details inline: scroll down past the slider, set another symptom, Tutti i tag → pick a context tag (it joins the strip, pressed), type a note (field grows, keyboard does not cover Salva). Salva. Diary row shows the tag and the note.
- [ ] Azzera: fill the form, Azzera empties it, Annulla from the toast brings everything back.
- [ ] Settings → Esporta backup: share sheet opens, file lands in Drive or Files. Toast "Backup esportato".
- [ ] Settings → Importa the same file: preview counts, Unisci. Then Sostituisci tutto and Undo.
- [ ] Preset: open the entry from Diario, Crea preset da questa voce, name it, Crea preset; chip appears on the log screen; tap it, set a level, Salva; the chip shows the level and "0m"; Andamento has a Per preset line; delete it from Impostazioni and undo.
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
