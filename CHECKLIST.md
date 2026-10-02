# Release checklist

Automated on every push: type check, unit tests, build, bundle size gate, licence notices. A push to `main` also deploys to Pages, and the installed app switches to the release by itself within seconds of its next open or return to the foreground (SPEC §4). So the manual pass below cannot hold a release back from the tester: it runs right after the deploy, on the live app, and what it finds is fixed by another release. What another release cannot fix, a database upgrade above all, is proven before merging, by the migration tests and their fixtures (CLAUDE.md, "User data is never lost").

Before merging a schema or export change into `main`: every step of the protocol in CLAUDE.md, "User data is never lost" (fixtures of the version left and of the version arrived at, the rule in `UPGRADES`, the frozen rules in `lib/legacy.ts`, export → import → export). The phone upgrades within seconds of the deploy; nothing after it can take an upgrade back.

Release, from a clean tree on `main`:

```sh
git merge --ff-only development
npm version patch      # refuses if check or tests fail; commits and tags vX.Y.Z
git push               # tags follow (push.followTags is set)
```

A bad release is undone by another one: revert on `development` and release again as above. Never redeploy an older tag, re-run the deploy on an old commit or reset `main`: older code finds the database the newer one upgraded: since #113 it refuses to touch it and the app is stuck asking for a reload, and builds from before #113 write rows of the old shape into it (CLAUDE.md, "User data is never lost", rule 8).

The Settings footer shows `Gom Jabbar X.Y.Z · <commit day> · <short commit>`; `-dirty` after the hash means a local build, never a deploy.

Manual, on a real phone, right after the deploy (the tester already has the release):

## Android (Chrome)
- [ ] Open the Pages URL, install to the home screen, launch from the icon: opens straight on the log screen, no browser chrome.
- [ ] Airplane mode, relaunch: still opens and shows the diary.
- [ ] The update: with the app installed and the previous release on it, deploy, then bring the app back from Recents without touching it: within seconds it reloads by itself and the Settings footer shows the new version. Touch something first and it waits: it reloads the next time it comes back from Recents.
- [ ] Navigation (#37): no tab bar. ☰, first in the top row, drops down Diario, Andamento, Impostazioni; a tap elsewhere closes it. Each screen has ← and its name; ← and Android's back gesture both return to the log, and back from the log leaves the app. Relaunch from Diario: the app opens on the log.
- [ ] The top row at the largest font: ☰, "in corso" and Preset keep their words, wrapping to a second line rather than shrinking.
- [ ] The drawer: tap a region on an empty form; the drawer's top row does not change height and the figure does not move. The stage ends a little above the drawer, not touching it.
- [ ] One banner at a time: in a browser tab (not installed) with a backup due, only the install nudge shows; ✕ it and the backup banner takes its place.
- [ ] Log: tap two regions, drag the slider, Save. Undo from the toast. Repeat with Sx·dx on.
- [ ] Press and hold a thigh: nothing happens, no context menu, no text selected.
- [ ] The stage: one figure fills the slot, the brain in its corner, the rail on the left (Sx·dx off and F·R on by default, Tutto, Testa, Tronco, Gambe, Braccia; with Sx·dx off each limb splits into a left and a right button on one row). Tap a thigh: the thumbnail lights the thigh behind; F·R off, it does not, a thumbnail of the other side above the brain, then Disegna and the zoom (+, −, Adatta) on the right. Pinch with Disegna off: it zooms; + and Adatta do the same; Salva shows the whole figure again. A tap just beside a wrist still selects it. Swipe sideways across the body: the back shows, centred like the front, the segment under the finger is not toggled; tap the thumbnail to come back. A short or slanted drag toggles nothing.
- [ ] The drawer: collapsed it holds the layer tabs, the current layer's panel with Dolore, and Salva; the figure behind never changes size. Tap Altro or drag it up: the drawer slides over the figure, the panel goes on with the other sliders and the tags, and below it the kind switch on its own row, the time row captioned Quando (Inizio and a Fine row for an episode) and the note. Corpo, +, and Salva slide it back. Pick "1h fa": the handle reads "Altro · 1h fa".
- [ ] Disegna: Annulla and Cancella appear above it, the brain steps aside. A finger on the skin shades a spot and the layer chip names the segment, a tap is a dot, Annulla takes the dot back; a swipe from the air beside the body turns it, one on the skin paints a line; pinch zooms, two fingers pan, Adatta and a turn show the whole figure again. Disegna off: the shading stays, the segments toggle again. Salva; open the entry from Diario: the shading is there, on the side that holds it.
- [ ] "+" in the tabs, tap the same thigh again with a different level and a tag: two chips, the first layer's legs fade on the map, the tag strip shows only the current layer's tags; tapping the first chip brings its regions and tags back. Diary line shows "gambe 8 · coscia sx 3 · Compressione".
- [ ] Tap the mind: the pain slider goes, Nebbia mentale stays; set it, Salva; diary row "6 nebbia mentale · mente". Tap the mind and a thigh: one chip "coscia sx, mente" (or dx), both kinds of sliders.
- [ ] Where it hurts, in words (#33): tap the neck and both shoulders, the chip reads "collo, spalle"; a knee alone, "ginocchio sx"; the back of a knee alone, "dietro il ginocchio sx"; Testa lights the head but not the neck, and a head tap does not light the back view; Gambe reads "gambe", Tronco "tronco"; six scattered taps read three names and "+ 3". The same words on the diary row.
- [ ] "Episodio" with two layers, save: "1 in corso", filled with its level, appears between ☰ and Preset; open it and pick the episode: the chips pick the layer, update a level on each (Aggiorna), then end it from the sheet. Undo the end. The diary row shows the latest level and the trail "7 → 4"; tap it: the sheet lists the readings, tap one to edit it, Modifica zone e note opens the head with Inizio and Fine.
- [ ] "Episodio", Inizio "3h fa", Fine "1h fa", Salva: no "in corso" button, a diary row with "2h". Open it, Fine → In corso, Salva: "1 in corso" is back.
- [ ] Diary search (#10): 🔍 in the Diario bar, the keyboard comes up; "ginocchio sx" lists only readings with the left knee, a tag's name lists its readings, updates included ("aggiornamento · inizio …", a tap opens the episode), a word from an old note finds it past the 30 days; the count reads "N voci · M giorni". ✕ empties the field; back closes the search and shows the whole diary, back again returns to the log.
- [ ] Time chips: "Ieri sera" lands on yesterday in the diary. Same from a preset sheet.
- [ ] Details inline: scroll down past the slider, set another symptom, Tutti i tag → pick a context tag (it joins the strip, pressed), type a note (field grows, keyboard does not cover Salva). Salva. Diary row shows the tag and the note.
- [ ] Azzera: fill the form, Azzera empties it, Annulla from the toast brings everything back.
- [ ] Messages (#94): Salva shows "Salvato · Annulla" dark with a bar running out over 10 s; a finger on it stops the bar, lifting it lets it run on. Salva with the slider untouched: "Quanto? Sposta la barra" in amber. A backup to file: "Backup su file fatto", quiet and short. Both in light and dark.
- [ ] Settings → Backup su file: share sheet opens, file lands in Drive or Files. Toast "Backup su file fatto".
- [ ] Settings → Ripristina da file, the same file: the Ripristina sheet shows the counts ("… che qui mancano (anche se cancellate) …"), Unisci and Annulla. Then Sostituisci tutto and Annulla. Copie automatiche lists "Prima di Unisci" and "Prima di Sostituisci tutto"; leave Settings and come back: they are still there, and Ripristina on one opens the sheet with Scarica come file.
- [ ] Preset: on the log pick zones and move a second slider, Preset → Nuovo preset; the form shows the zones, Chiede has Dolore and the second symptom pressed; unpress one, press another, name it, Crea preset; the Preset button stays plain and the log form is as it was; the dropdown lists the new preset with an empty dot and "mai". Pick it, set its sliders, Salva in its sheet: the dropdown shows the level and "0m", the diary row is named after the preset, Andamento has a Per preset line. Undo on "Preset creato" removes it from the dropdown. From a Diario entry, Crea preset da questa voce opens the form over the sheet; Escape closes only the form. In Impostazioni tap Modifica, rename, toggle a Chiede chip, Salva, undo; delete it and undo.
- [ ] Preset with two zones: on the log pick the legs, "+ Altra zona", a shoulder, Preset → Nuovo preset; Chiede changes when you tap the other layer chip; Crea preset; pick it from Preset: the sheet has two layer chips, every slider at 0, the sliders follow the chips, Salva; the log form is empty afterwards; the diary row shows both levels ("Nome · gambe 5 · spalla 3").
- [ ] Vocabolario: add a medication tag, rename, disable, reorder. It shows up (or not) under Tutti i tag on the log form; a disabled symptom loses its slider. Sintomi shows Corpo and Mente; add one under Mente, it appears only with the mind (or nothing) selected. A used item says "N voci", an unused one has a bin: delete it, Annulla puts it back in its place. Switch Language to English: the defaults translate, a renamed item stays as typed.
- [ ] Dolore off (#36): the log's slider becomes Gonfiore at 5, Salva saves swelling; move Pesantezza above Gonfiore and it leads instead. Switch Dolore back on.
- [ ] Andamento (#38): the Sintomo row under the ranges lists the symptoms read, Dolore first; pick Gonfiore: Media, Giorni ≥ 5, the map, Nel tempo and the tag comparison change, Altri sintomi lists Dolore instead. Report per il medico says "Sintomo: Gonfiore" and shows its numbers.
- [ ] Andamento with data: heatmap, its symptom chips (the brain lights up under Nebbia mentale), chart tap shows a day, range chips.
- [ ] Report ends with the line "Diario personale: … non è un dispositivo medico.", in the app, in the PDF and in the shared file.
- [ ] Report → Stampa / PDF → Save as PDF. Report → Condividi file → open the HTML from Drive.
- [ ] Settings footer: the version, the release day and the hash. In airplane mode, Privacy policy opens at its Italian part; its header reaches Termini d'uso and Licenze open source in Italian, English jumps to the English part, Gom Jabbar opens the app.
- [ ] Dark and light theme, both readable. System theme switch updates the status bar colour.
- [ ] Large text (#23): Android Settings → Display → Font size and Display size both at the largest, in light and in dark, and once outdoors in daylight. Log: Tutto reachable at the top of the left rail, rail captions whole, the zoom buttons full size, the menu inside the screen, the banner's text on its own line above its buttons, Salva reachable (the page scrolls), the toast readable above the drawer. Diario: times whole. Andamento: the tag comparison shows bars. Report: toolbar buttons wrap, none squeezed.
- [ ] Backup nudge without Drive appears after 14 days (or set lastBackupAt back in devtools), "Più tardi" snoozes it.
- [ ] Settings → Backup → Google Drive, from the installed app: Backup su Drive goes to Google and comes back into the app, the backup lands ("Backup su Drive fatto"); a second tap within the hour uploads without leaving; Ripristina da Drive lists it and opens the import preview; Scollega, then Backup su Drive asks Google again.
- [ ] Cancella tutto, after a Backup su Drive: the sheet names the last backup and says the Drive file stays; the button stays grey until «cancella» is typed; confirming reloads into a fresh install (default vocabulary, Italian or the phone's language, install nudge). Then Ripristina da Drive (it asks Google again), Sostituisci tutto: the diary is back, entry for entry. Same with a file from Backup su file.
- [ ] Banner with Drive: in `gj.drive` in devtools set `lastWriteAt` 8 days back, relaunch: "Ultimo backup su Drive 8 giorni fa.", its button backs up to Drive, "Più tardi" snoozes it.

## iOS (Safari)
- [ ] Share → Add to Home Screen. Launch from the icon.
- [ ] Storage persists after a week of not opening (only if installed; Safari evicts otherwise).
- [ ] Slider drag, long press without magnifier or callout, share sheet for backup.
- [ ] Printing from the home-screen app may not work: use Report → Condividi file, open in Files, then Share → Print.
- [ ] Safe areas: nothing hidden under the notch or the home indicator.
