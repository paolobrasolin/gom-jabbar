# Release checklist

Automated on every push: type check, unit tests, build, bundle size gate, deploy to Pages.

Manual, on a real phone, before telling anyone to update:

## Android (Chrome)
- [ ] Open the Pages URL, install to the home screen, launch from the icon: opens straight on the log screen, no browser chrome.
- [ ] Airplane mode, relaunch: still opens and shows the diary.
- [ ] Log: tap two regions, drag the slider, Save. Undo from the toast. Repeat with "Entrambi i lati" off.
- [ ] Press and hold a thigh: whole leg selects. Long press does not open a context menu or select text.
- [ ] "+ Altra zona" with a second level: chips show both, diary line shows "gambe 8 · spalle 3".
- [ ] "In corso", save, tap the episode card: update the level, then end it. Undo the end.
- [ ] Time chips: "Ieri sera" lands on yesterday in the diary.
- [ ] Details: other symptoms, tags, note. Diary row shows the tag and the note.
- [ ] Settings → Esporta backup: share sheet opens, file lands in Drive or Files. Toast "Backup esportato".
- [ ] Settings → Importa the same file: preview counts, Unisci. Then Sostituisci tutto and Undo.
- [ ] Vocabolario: add a medication tag, rename, disable, reorder. It shows up (or not) under Dettagli.
- [ ] Andamento with data: heatmap, chart tap shows a day, range chips.
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
