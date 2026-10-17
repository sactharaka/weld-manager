# Weld Manager (iPad)

Daily welder / fitter tracking and weld traceability for piping spools and structural work.

## Workflow on the iPad

1. **Data tab → New project** (Piping or Structural).
2. Import from OneDrive / Files: **drawing PDF** → **weld map (.wmproj)** → **management sheet (.xlsx)**.
   Drawing numbers are read from each page's title block; the management sheet supplies spools and the stage columns to track.
3. **Weld map → Assign spool**: pick a spool, tap welds or drag a box around them.
4. **Weld map → Record**: set today's fitter / welder once, tap a weld, press *Fit-up today* / *Welded today* / *NDT accept*.
   *Multi-select* records many welds at once. *+ Add weld* adds weld numbers on drawings that have no weld map (structural).
5. **Spool sheet**: hydro / surface / delivery dates per spool; fab / welding / NDT dates fill in automatically once every weld reaches that stage.
6. **Daily**: per-welder and per-fitter totals for any day → *Export this day to Excel*.
7. **Data → Export**: daily report, management sheet (dates written back into your layout), weld traceability register, JSON backup.
   Choose *Save to Files → OneDrive* in the share sheet to get them to the Windows PC.

Optional: **Weld detail file** — any Excel with *Drawing* and *Weld No.* columns plus Size / Thickness / Material / WPS / Joint / Heat No. columns. Values fill blank fields only.

## Development (Windows)

```bash
npm install
npx expo start          # scan the QR code with Expo Go on the iPad
npx expo start --web    # browser version for quick testing on the PC
```

`src/engine/pdfjsSource.ts` is generated — re-run `node scripts/build-engine.js` after upgrading `pdfjs-dist`.

## Building for the App Store (no Mac needed)

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

Then in App Store Connect add it to TestFlight (or publish as an unlisted / custom app).

## Known limits (v1)

- Management sheet export edits your original file in place (colours, borders, merges kept); only the stage date and remark cells are written.
- Data lives on this iPad only — export a backup to OneDrive regularly.
