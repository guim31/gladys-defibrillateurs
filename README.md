# Gladys Défibrillateurs

External integration for [Gladys Assistant](https://gladysassistant.com): the
**nearest defibrillators (AED)** of your house and of the places you choose,
from **Géo'DAE**, the French national database of defibrillators (open data on
data.gouv.fr): distance, address, exact spot, free or restricted access, and
whether it is **available now** according to its declared hours. **No account,
no key.**

> In an emergency, call **15 or 112** first. The data are declared by the
> operators and may be wrong: this integration is a reminder, never a rescue
> service.

Unofficial: not affiliated with the French ministry of Health, Atlasanté nor
data.gouv.fr. Developed without the hardware (public data only) and tested
against the real national file (2026-11-15), not yet on a real Gladys
installation: feedback welcome.

User documentation: [English](docs/en.md) · [français](docs/fr.md) ·
[Deutsch](docs/de.md) · [español](docs/es.md).

## What you get in Gladys

- One read-only device per watched place (each located house, up to 5 other
  places): nearest defibrillator (distance, name and address, exact location,
  access, declared hours, available now), the number within a radius (1 km by
  default) and how many are available now, the date of the data.
- A dashboard widget: the 1, 3 or 5 nearest of a place, with a badge, details
  and a map link, and the emergency numbers.
- A scene action, "Nearest defibrillator": a sentence ready to send or speak,
  and numbers.

## Requirements

- Gladys Assistant 5.3.0 or later, with Internet access.
- Places in France (mainland and overseas): the location of the house set in
  Gladys, or places given as coordinates in the configuration.

## Installation

In Gladys, **Integrations → Install from GitHub**, then paste
`https://github.com/guim31/gladys-defibrillateurs`. Save the configuration and
add your places from the Discover tab.

## How it works

- The national CSV (about 80 MB, 190,000 rows, regenerated daily by
  Atlasanté) is downloaded **once a week** from its stable data.gouv.fr link,
  streamed and filtered on the fly: only the defibrillators within 5 km of the
  places are kept, and saved under `/data`. The whole file is never held in
  memory (about 110 MB of RSS while reading it). A new place outside that area
  triggers a new download.
- Rows declared out of order, temporarily absent, removed, duplicates, mobile
  devices and doubtful positions are left out.
- The hours (`c_dispo_horaires`, OpenStreetMap syntax) are read in the subset
  the file uses; "Mo-Su off", which the declaration form writes when nothing
  was entered (about 60 % of the file), reads as "hours not declared". Public
  holidays are computed offline (Alsace-Moselle and overseas included).
  Availability is evaluated every minute, without any request.

## Limitations

- Most defibrillators declare no hours: "available now" is then 0 and the
  widget badge grey ("Hours?").
- The data are declarative, and the distance is as the crow flies.
- Rare hour texts outside the subset (about 0.15 % of the file) read as not
  declared.

## Development

```bash
npm install
npm test               # node --test, no network access
npm run lint           # ESLint
npm run format:check   # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store .   # store admission checks
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the conventions. The test
fixture (`test/fixtures/geodae`) is a real extract of the national file,
captured on 2026-11-15 (operator names, SIREN and photos blanked).

## Credits

- Data: **Géo'DAE**, French ministry of Health, published by Atlasanté on
  data.gouv.fr, Licence Ouverte 2.0 (Etalab).
- Public holidays: same rules as
  [gladys-holidays](https://github.com/guim31/gladys-holidays) (date-holidays).
- Cover: the ILCOR universal AED sign (heart and lightning bolt), redrawn.
- Structure shared with
  [gladys-decheteries](https://github.com/guim31/gladys-decheteries).
- Built from the official
  [integration template](https://github.com/GladysAssistant/integration-template-js).

## License

[Apache 2.0](LICENSE).
