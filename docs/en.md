# Défibrillateurs

The **nearest defibrillators (AED)** of your house, and of the places you choose, in Gladys:
distance, address, exact spot, free or restricted access, and whether it is **available now**
according to the hours declared by its operator. The data come from **Géo'DAE**, the French national
database of defibrillators (ministry of Health), published as open data on data.gouv.fr. **No
account, no key.**

> **In an emergency, call 15 (SAMU) or 112 first.** The operator guides you, and can tell you where
> the nearest defibrillator is. This integration is a reminder for everyday life, never a rescue
> service: the data are declared by the operators and may be wrong or out of date.

Unofficial integration, not affiliated with the ministry of Health, Atlasanté nor data.gouv.fr.
Tested against the real national file (2026-11-15), not yet on a real Gladys instance: feedback
welcome.

## What you get

- A **device per watched place**: each house of Gladys with a location, and up to 5 other places
  (school, club, parents' home…).
- For the nearest defibrillator (within 5 km): its **distance**, **name and address**, **exact
  location** (indoor or outdoor, floor, "reception hall"…), **access** (free or restricted), **declared
  hours** and **available now** (yes or no).
- The **number of defibrillators within the radius** (1 km by default), and how many are **available
  now**.
- The **date of the data**.
- A **widget** "Nearest defibrillators": the 3 nearest of a place, with distance, access, a green,
  red or grey badge, and on tap the address, spot, hours and a map link.
- A **scene action** "Nearest defibrillator": a sentence ready to send or to speak, and numbers.

## Requirements

- Gladys Assistant **5.3.0** or later.
- Internet access from Gladys, to download the national file from data.gouv.fr (about 80 MB, once a
  week).
- For the houses: their location set in Gladys (**Settings → Houses**). Places in France (mainland and
  overseas) only.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-defibrillateurs` and confirm.
3. Gladys asks to share the location of the houses: it is only used to find the nearest
   defibrillators, and never leaves your Gladys.

## Configuration

### Settings

- **Radius (m)**: for the counts of defibrillators around each place (1,000 m by default, from 100 to
  5,000). The nearest one is searched up to 5 km whatever the radius.
- **Other places**: up to 5 places besides the houses, as `Name: latitude, longitude`, separated by
  semicolons, with decimal points: `School: 43.6045, 1.4440; Club: 43.5830, 1.4340`. Right-click a
  spot on openstreetmap.org and choose "Show address" to read its coordinates. Renaming a place makes
  it a new device.
- **Language of names and messages**: French by default. Feature names are fixed when a device is
  added; the texts follow the language at once.

### Adding places

Save the configuration: the places appear in the **Discover** tab of the integration. Add the ones you
want to follow.

### Checking

The **Status** button gives the number of places watched, the defibrillators kept within 5 km, the
date of the data and the last error.

## Devices

Each place is a device "Defibrillators – <place>" with these features (names in the configured
language):

| Feature                        | Type     | Value                                              |
| ------------------------------ | -------- | -------------------------------------------------- |
| Nearest defibrillator distance | distance | in metres, within 5 km                             |
| Nearest defibrillator          | text     | name and address                                   |
| Exact location                 | text     | indoor or outdoor, floor, spot                     |
| Access                         | text     | free or restricted access                          |
| Availability hours             | text     | declared hours, "Hours not declared"               |
| Available now                  | binary   | 1 when the declared hours cover the current minute |
| Defibrillators in the radius   | counter  | within the radius of the configuration             |
| Available now in the radius    | counter  | of which available now                             |
| Data date                      | text     | date of the national file                          |

"Available now" is **0 when the hours are not declared**: about two defibrillators in three have
none in the national file. The text of the hours tells the difference.

## Dashboard widget

**Nearest defibrillators** shows the nearest defibrillators of a place: name, distance, access and a
badge "Available" (green), "Closed" (red) or "Hours?" (grey, hours not declared). Tap one to read its
address, exact spot, hours and a link to the map. Settings: the place (the first one by default), 1,
3 or 5 defibrillators, show the hours, show the emergency numbers.

## Scene action

**Nearest defibrillator** (Then → Integrations): for a place (the first one by default), a
**sentence** ready to send in a message or to speak ("Nearest defibrillator to House: Town hall,
120 m, 1 place du Capitole, 31000 Toulouse (reception hall). Free access, available now."), the
**distance** in metres (-1 when none within 5 km), **available now** (1 or 0) and the number
**available now in the radius**.

There is no scene trigger of its own: to be warned when no defibrillator is available any more around
the house, use the device trigger of Gladys on "Available now in the radius" equal to 0.

## Scene examples

- **Babysitter at home**: at 8 pm, send the sentence of the scene action to the babysitter's
  Telegram, with the emergency numbers.
- **Club evening**: when the "Available now in the radius" of the club falls to 0, send a message to
  the coach.

## Data and refresh

- Source: the **Géo'DAE** national file, CSV resource of the dataset "Géo'DAE - Base Nationale des
  Défibrillateurs" on data.gouv.fr, published by Atlasanté, **Licence Ouverte 2.0**.
- The file (about 80 MB, 190,000 rows) is downloaded **once a week**, streamed and filtered on the
  fly: only the defibrillators within 5 km of your places are kept (a few hundred in a city), saved
  under `/data` so that a restart downloads nothing. A new place outside that area downloads it again
  at once. A failed download is tried again 3 hours later, the last data being kept.
- Left out: defibrillators declared out of order, temporarily absent, removed, duplicates, mobile
  ones (in a vehicle), and the ones whose position is questioned.
- "Available now" is evaluated **every minute** from the declared hours (OpenStreetMap format),
  public holidays included, without any request.

## Troubleshooting

- **No device in the Discover tab**: set the location of the house in Gladys, or add a place in the
  configuration, then save.
- **"No data yet"**: the national file could not be downloaded; the Status button gives the error.
  Check the internet access of Gladys.
- **A place is ignored**: the logs of the integration say which one; use decimal points
  (`43.6045, 1.4440`), not commas.
- **A defibrillator is missing or wrong**: the data are declared by the operators on
  geodae.atlasante.fr; report the error there.

## Limitations

- France only (mainland and overseas): Géo'DAE covers no other country.
- The data are declarative: position, hours and state may be wrong. Most defibrillators declare no
  hours; "available now" is then 0 and the badge grey.
- Exceptional closures not declared in the file are unknown.
- The distance is as the crow flies, not on foot.
- Developed without the hardware (no defibrillator involved, only public data): feedback welcome.

## Credits

- Data: **Géo'DAE**, ministry of Health, published by Atlasanté on data.gouv.fr, Licence Ouverte 2.0.
- Built on the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js).
- Not affiliated with the ministry of Health, Atlasanté nor data.gouv.fr.
