# Is OpenStreetMap missing buildings everywhere, or was Bookham unlucky?

Bookham started this. OpenStreetMap had 5,448 buildings in the 10 km square
around KT23 3HP; Ordnance Survey had 20,972. That is a big enough gap to be
either a national problem or one village nobody has got round to mapping,
and there is no way to tell which by looking harder at Bookham.

So this directory measures other places, chosen at random, by exactly the
same method.

## Running it

Everything happens on github.com. Nothing to install.

1. **Actions** tab → **Audit OSM coverage against Ordnance Survey**
2. **Run workflow** → **Run workflow**

About an hour later it commits `coverage.md` (read this one), `coverage.csv`
(the per-place numbers), and `coverage.json` (everything, for a machine).

Three inputs, all optional:

| Input | Default | What it does |
|---|---|---|
| `samples` | 12 | How many random places. More is slower and better. |
| `postcodes` | — | Name the places yourself instead of drawing them. |
| `radius` | 2500 | Half-width of each measured box. 2500 is a 5 km square. |

## What it actually does, per place

1. Draws a postcode from postcodes.io — a uniform draw over live UK
   postcodes, so roughly a draw over where people live. Northern Ireland is
   dropped, because OS OpenMap Local is Great Britain only.
2. Downloads that 100 km grid square of OS OpenMap Local and clips the
   building layers to a 5 km box around the postcode.
3. Asks Overpass for every OpenStreetMap building in the same box.
4. Matches the two, footprint to footprint, and counts what is on one side
   and not the other.

## Why the matching is not just counting

The two datasets never line up one polygon to one polygon. OS generalises a
terrace of eight houses into a single block; OSM usually draws all eight. A
straight count would report OSM as having four times more buildings in one
street and none at all in the next.

So each OS footprint is matched by position, and counts as present in OSM if
any of these holds:

- the OS polygon's centre is inside an OSM polygon
- an OSM polygon's centre is inside the OS polygon
- their bounding boxes overlap by 30% of the smaller polygon's area

Between them these cover the terrace case, offset geometry, and buildings
one side has split and the other has not.

## What the numbers do not say

- **A half-mapped terrace reads as mapped.** If OS draws one block of eight
  and OSM has drawn two of them, the OS block is matched and the audit
  records nothing missing. The real gap is therefore a little wider than the
  one reported, never narrower.
- **"House-sized" is a footprint between 50 and 400 m².** That is a dwelling
  nearly every time, but a block of forty flats is one large footprint, not
  forty houses, so missing homes are undercounted.
- **OSM-only buildings are not errors.** New build finished after the OS
  release, and sheds and canopies OS does not survey, both land there.
- **Neither dataset is truth.** OS OpenMap Local is surveyed and consistent,
  which is why it is the yardstick here, but it is a generalised product with
  its own release date, and it does not know about anything built since.
- **Twelve places is twelve places.** The per-place spread is wide, so the
  median is stable long before the total is. Run it again with a bigger
  `samples` if a number matters to you.

## The files

| | |
|---|---|
| `sample.js` | Chooses the places, at random or from a list |
| `plan.js` | Works out each box and writes the worklist |
| `osm-fetch.js` | Every OSM building in a box, from whichever mirror answers |
| `compare.js` | The spatial join, and the per-place numbers |
| `report.js` | `coverage.md`, `coverage.csv`, `coverage.json` |
| `run.sh` | The loop the workflow runs, kept here so it can be tested |

`osm-fetch.js` will not record a zero unless two different mirrors say zero
independently. An empty Overpass answer means "that mirror failed" at least
as often as it means "there is nothing here", and an audit that got this
wrong would report a village as 100% missing and be believed.

Contains OS data © Crown copyright and database right. Open Government
Licence v3. Contains OpenStreetMap data © OpenStreetMap contributors, Open
Database Licence.
