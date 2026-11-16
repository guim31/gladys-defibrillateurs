# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A device per watched place (each located house of Gladys, and up to 5 places
  of the configuration) with its **nearest defibrillator** from the national
  Géo'DAE database: distance, name and address, exact location, free or
  restricted access, declared hours, and **available now** according to them.
- The **number of defibrillators within a radius** (1 km by default) and how
  many are available now, plus the date of the data.
- A widget **Nearest defibrillators**: the 1, 3 or 5 nearest of a place, with
  a badge (available, closed, hours not declared), details and a map link, and
  the emergency numbers.
- A scene action **Nearest defibrillator**: a sentence ready to send or speak,
  the distance, available now and the count available in the radius.
- The national file is downloaded once a week, streamed and filtered around
  the places, and kept under `/data`. English, French, German and Spanish.
