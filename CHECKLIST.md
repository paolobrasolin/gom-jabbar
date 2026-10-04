# Release checklist

Automated on every push: type check, unit tests, build, bundle size gate, licence notices. A push to `main` also deploys to Pages, and the installed app switches to the release by itself within seconds of its next open or return to the foreground (SPEC §4). So the manual pass below cannot hold a release back from the tester: it runs right after the deploy, on the live app, and what it finds is fixed by another release. What another release cannot fix, a database upgrade above all, is proven before merging, by the migration tests and their fixtures (CLAUDE.md, "User data is never lost").

Before merging a schema or export change into `main`: every step of the protocol in CLAUDE.md, "User data is never lost" (fixtures of the version left and of the version arrived at, the rule in `UPGRADES`, the frozen rules in `lib/legacy.ts`, export → import → export). The phone upgrades within seconds of the deploy; nothing after it can take an upgrade back.

Optional, for a database version: a rehearsal on real storage, never on the tester's phone. Pages only serves `main`, so both builds are served in turn at the same address (one origin, one database), in desktop Chrome or on a dev phone over the LAN:
- [ ] The previous release: `git worktree add ../gj-prev vX.Y.Z`, then `npm ci && npm run build && npm run preview` there. Open it, Settings → Ripristina da file with the output of `node scripts/seed.mjs`, Sostituisci tutto, then Backup su file.
- [ ] Stop it; `npm run build && npm run preview` here, same port. Open the app twice: no notice, the diary as it was; Copie automatiche shows one "Prima dell'aggiornamento". Backup su file again.
- [ ] The two backups hold the same entries, presets and vocabulary, field for field, except what the new rule in `UPGRADES` says. `git worktree remove ../gj-prev`.

Release, from a clean tree on `main`:

```sh
git merge --ff-only development
npm version minor      # or patch; refuses unless check, tests, build, size and notices pass; commits and tags vX.Y.Z
git push               # tags follow (push.followTags is set); this deploys
git checkout development && git merge --ff-only main && git push   # development carries the version commit too
```

`minor` for a batch the tester will notice or a schema change, `patch` otherwise.

A bad release is undone by another one: revert on `development` and release again as above. Never redeploy an older tag, re-run the deploy on an old commit or reset `main`: older code finds the database the newer one upgraded: since #113 it refuses to touch it and the app is stuck asking for a reload, and builds from before #113 write rows of the old shape into it (CLAUDE.md, "User data is never lost", rule 8).

The Settings footer shows `Gom Jabbar X.Y.Z · <commit day> · <short commit>`; `-dirty` after the hash means a local build, never a deploy.

Manual, on a real Android phone with Chrome, right after the deploy (the tester already has the release). What the tests already prove (search, undo toasts, import and merge counts, the vocabulary editor's rules) is not repeated here: these are the things only a phone shows. A few steps need Chrome's DevTools on the phone's page: USB debugging on in the phone's developer options, the phone plugged in, `chrome://inspect` on the computer, then Inspect on the app's tab.

## Install and update
- [ ] Open the Pages URL in Chrome, install to the home screen, launch from the icon: it opens straight on the log screen, no browser chrome, locked to portrait.
- [ ] Airplane mode, relaunch: it still opens and shows the diary.
- [ ] The update: with the previous release installed, deploy, then bring the app back from Recents without touching it: within seconds it reloads by itself and the Settings footer shows the new version. Touch something first and it waits: it reloads the next time it comes back from Recents.
- [ ] Storage kept: in the installed app, Settings → Backup shows no "Il browser può cancellare i dati" line. In a plain browser tab it may show; that is expected.

## Getting around
- [ ] ☰, first in the top row, drops down Diario, Andamento, Impostazioni; a tap elsewhere closes it. Each screen has ← and its name; ← and Android's back gesture both return to the log, and back from the log leaves the app. Relaunch from Diario: the app opens on the log.
- [ ] One banner at a time: in a browser tab (not installed) with a backup due, only the install nudge shows; ✕ it and the backup banner takes its place.

## The stage
- [ ] One figure fills the slot, the brain in its corner. The left rail: Sx·dx off and F·R on by default, Tutto, Testa, Tronco, Gambe, Braccia (with Sx·dx off each limb splits into a left and a right button on one row). The right rail: a thumbnail of the other side above the brain, then Disegna and the zoom (+, −, Adatta). On a short screen the rails fade where they hide a button.
- [ ] Tap a thigh: the thumbnail lights the thigh behind; with F·R off it does not. A tap just beside a wrist still selects it. Press and hold a thigh: no context menu, no text selected.
- [ ] Swipe sideways across the body: the back shows, centred like the front, and the segment under the finger is not toggled; tap the thumbnail to come back. A short or slanted drag toggles nothing.
- [ ] Pinch with Disegna off: it zooms; + and Adatta do the same; Salva shows the whole figure again.
- [ ] Disegna: Annulla and Cancella appear above it, the brain steps aside. A finger on the skin shades a spot and the layer chip names the segment, a tap is a dot, Annulla takes the dot back; a swipe from the air beside the body turns the figure, one on the skin paints a line; pinch zooms, two fingers pan. Shade on the front, turn to the back, shade there, turn back: both shadings are where they were put. Disegna off: the shading stays, the segments toggle again. Salva; open the entry from Diario: the shading is there, on the side that holds it.
- [ ] Where it hurts, in words (#33): the neck and both shoulders read "collo, spalle"; a knee alone "ginocchio sx"; the back of a knee alone "dietro il ginocchio sx"; Testa lights the head but not the neck; Gambe reads "gambe", Tronco "tronco"; six scattered taps read three names and "+ 3". The same words on the diary row.

## The drawer and Salva
- [ ] Collapsed, the drawer holds the layer tabs, the current layer's panel with its headline slider, and Azzera and Salva; tapping a region on an empty form changes neither the drawer's height nor the figure. The slider reads "assente" and "massimo" inside its track; drag it from 0 to 10: no word is ever half hidden by the thumb.
- [ ] The chevron ⌃ at the end of the tabs, a tap or a drag up: the drawer slides over the figure, the panel goes on with the other sliders and the tags, and below it the kind switch, the time row (Quando; Inizio and a Fine row for an episode) and the note. ⌄, + and Salva slide it back.
- [ ] Pick "1h fa": Salva reads "Salva · 1h fa"; back to Adesso, just "Salva".
- [ ] Tap two regions, drag the slider, Salva: "Salvato · Annulla", dark, with a bar running out over 10 s; a finger on it stops the bar, lifting it lets it run on. Annulla. Salva with the slider untouched: "Quanto? Sposta la barra" in amber.
- [ ] Layers: + in the row, tap the same thigh again with a different level and a tag: two chips, the first layer's legs fade on the map, the tag strip shows only the current layer's tags; tapping the first chip brings its regions and tags back. The diary line reads "gambe 8 · coscia sx 3 · Compressione".
- [ ] With two layers a bin stands before +: it deletes the current layer, "Zona eliminata · Annulla" brings it back. + then a level with no place, Salva: "Dove? Tocca la figura", and the figure shows.
- [ ] Tap the mind: the pain slider goes, Nebbia mentale stays; set it, Salva; the diary row reads "6 nebbia mentale · mente". Mind and a thigh: one chip "coscia sx, mente" (or dx), both kinds of sliders.
- [ ] Details: scroll past the slider, set another symptom, Tutti i tag → a context tag (it joins the strip, pressed), a note (the field grows, the keyboard does not cover Salva). Salva. The diary row shows the tag and the note, on two lines at most.

## Episodes
- [ ] "Episodio" with two layers, Salva: "1 in corso", filled with its level, appears between ☰ and Preset. Open it: the chips pick the layer; update a level on each (Aggiorna); under the sliders, Altri sintomi unfolds the others, blank: set one, Aggiorna. Then Termina adesso, and Annulla from the toast. The diary row reads "Episodio · in corso · 7 → 4"; tap it: the readings, each with ›, open their entry.
- [ ] Delete an episode from its start's edit sheet (Elimina): its row goes; Annulla brings it back with every reading.
- [ ] "Episodio", Inizio "3h fa", Fine "1h fa", Salva: no "in corso" button, a diary row "Episodio · 2h". Open it, Fine → In corso, Salva: "1 in corso" is back.
- [ ] If an episode has gone a day without a reading: its line in "in corso" ends with "ancora?", its sheet opens on "Ancora in corso?"; Finito all'ultima lettura ends it at that reading's time.
- [ ] In an entry's edit sheet change something, then Android's back: "Modifiche scartate · Annulla" brings the sheet back with the change.

## Presets
- [ ] On the log pick zones and move a second slider, Preset → Nuovo preset: the form shows the zones, Chiede has Dolore and the second symptom pressed; change one, name it, Crea preset. The log form is as it was; the dropdown lists the preset with an empty dot and "mai". Pick it, set its sliders, Salva: the dropdown shows the level and "0m", the diary row is named after the preset, Andamento has a Per preset line.
- [ ] An episode preset's sheet says Inizio over its times and Inizia episodio on its button.
- [ ] From a Diario entry, Crea preset da questa voce opens the form over the sheet; back closes only the form.

## Andamento and the report
- [ ] With data: the Sintomo row lists the symptoms read, Dolore first; pick Gonfiore: Media, Giorni per livello peggiore, the map and Nel tempo change. The map's colour key reads "assente" and "massimo" under its ends. A chart tap shows a day; the range chips change everything.
- [ ] Report per il medico → Stampa / PDF → Save as PDF; Condividi file → open the HTML from Drive. Both end with "Diario personale: … non è un dispositivo medico." and show the colour key.

## Backup
- [ ] Settings → Backup su file: the share sheet opens, the file lands in Drive or Files, "Backup su file fatto". Ripristina da file picks it from the phone's own picker and opens the Ripristina sheet; Annulla.
- [ ] Google Drive, from the installed app (the Content-Security-Policy must let every step through, #117): Backup su Drive goes to Google and comes back into the app, "Backup su Drive fatto"; a second tap within the hour uploads without leaving; Ripristina da Drive lists it and opens the import preview; Scollega, then Backup su Drive asks Google again.
- [ ] Drive offline: airplane mode, Backup su Drive: "Rete assente o instabile.", nothing else changes.
- [ ] Drive conflict: back up to Drive from the phone, then from the app in desktop Chrome on the same account, then from the phone again: "Su Drive c'è un backup più recente di questo telefono", and Sovrascrivi writes the phone's.
- [ ] Banner with Drive: in DevTools, `gj.drive` in localStorage, set `lastWriteAt` 8 days back, relaunch: "Ultimo backup su Drive 8 giorni fa.", its button backs up to Drive, ✕ snoozes it. Without Drive, the same with `lastBackupAt` in `gj.prefs` 15 days back.
- [ ] Cancella tutto, after a Backup su Drive: the sheet names the last backup and says the Drive file stays; the button stays grey until «cancella» is typed; confirming reloads into a fresh install (default vocabulary, Italian or the phone's language). Then Ripristina da Drive (it asks Google again), Sostituisci tutto: the diary is back, entry for entry.

## Look and language
- [ ] Impostazioni → Lingua → English: the screens, the defaults and the report are in English; a renamed symptom stays as typed. Back to Italiano.
- [ ] Dark and light theme, both readable, a 0 readable on its grey in both. A system theme switch updates the status bar colour.
- [ ] Large text (#23, #34): Android Settings → Display → Font size and Display size both at the largest, in light and in dark, and once outdoors in daylight. Log: Tutto reachable at the top of the left rail, rail captions whole, the zoom buttons full size, the menu inside the screen, the banner's text on its own line above its buttons, Salva reachable (the page scrolls), the toast readable above the drawer. Top row: ☰, "in corso" and Preset keep their words, wrapping rather than shrinking. Diario: times whole. Report: toolbar buttons wrap, none squeezed.
- [ ] Settings footer: the version, the release day and the hash. In airplane mode, Privacy policy opens at its Italian part; its header reaches Termini d'uso and Licenze open source in Italian, English jumps to the English part, Gom Jabbar opens the app.

## iOS
Not checked: nobody has an iPhone to run it on, and the tester uses Android. What SPEC says for iOS (Condividi file instead of printing from the home-screen app, storage kept only when installed) is untested.
