# AI interpretations of a place

## What this is

OSM will tell you that a footprint exists. For most British buildings it will
not tell you what the building is, how many storeys it has, what it is built
of, or what shape its roof is. The sim therefore guesses, from a UK-wide
average baked into `estimateHeight()` — which is why a Surrey village came out
looking like a business park.

A profile in this directory replaces that national average with a description
of one particular place, written by a language model.

## What a profile may and may not do

**It supplies judgement, never geometry.** Every footprint, road, waterway and
position still comes from OpenStreetMap. A profile cannot place a building,
move one, or invent one. It can only say what a building already known to
exist is probably like.

**OSM always wins.** A profile is consulted only where OSM has said nothing.
If a building carries `building:levels`, `height`, `building:material`,
`building:colour`, `roof:shape` or `roof:colour`, the profile does not touch
that field.

**An inference is never reported as a measurement.** Storeys guessed from a
profile are written to `ai:levels`, not `building:levels`, and buildings
dressed this way stay in the `estimated` tier. The report line says exactly how
many footprints were dressed:

```
ai       profile kt23-3hp (Great Bookham, Mole Valley, Surrey) - dressed 1483 of 1483
         footprints OSM left undescribed
```

**It is off unless you ask for it.** The checkbox only appears when a profile
exists for the place you typed.

## How `kt23-3hp.json` was produced

Written by Claude Opus 5 from training knowledge alone. No live lookup, no
aerial imagery, no OSM query, no site visit. The model was asked what Great
Bookham is like and wrote down what it believed.

That provenance is the whole point, and the file records its own confidence
per section. Read `known_gaps` before trusting anything in it. In particular
nothing in the file is specific to the `HP` sector — it is a description of
KT23 generally.

## Judging whether it works

`scratchpad/aitest.js` flies the same place twice against identical data — once
on OSM alone, once with the profile — and reports what changed. On a Bookham-
shaped test village with building tags stripped down to bare footprints:

| | OSM alone | with `kt23-3hp` |
|---|---|---|
| Buildings drawn | 1,483 | 1,483 |
| Road length | 618 km | 618 km |
| Tier: measured / estimated | 0 / 1,483 | 0 / 1,483 |
| Wall area read as houses | 74% | 98% |
| Wall area read as offices/flats | 26% | 1% |
| Wall area read as sheds | 0% | 1% |

Identical buildings in identical places; what changed is what they are made of
and what shape their roofs are. In a commuter village where roughly nothing is
an office block, 26% office frontage is wrong and 1% is closer.

**That table is not proof it is right.** It shows the profile changed the
answer in the direction it intended. Whether Bookham really is 44% detached and
52% tile roofs is not something a language model knows, and it is not something
this test checks. The honest claim is narrower: for a place where OSM is
silent, a locality-specific prior beats a national average — and when it is
wrong, it is wrong in a file you can open and edit.

Known corrections already made to this profile during testing: the first draft
made every roof clay terracotta, and offered `garage` as a plausible type for a
5,000 m² footprint.

## Adding a profile

1. Copy `kt23-3hp.json` and edit it. `matches` is a list of prefixes tested
   against the place name you type, uppercased with spaces removed.
2. Run `node ai/embed.js`. The sim is a single file you can open from disk, so
   it cannot fetch these at runtime — the script copies them into `index.html`
   between the `AI-PROFILES` markers.
3. `node ai/embed.js --check` fails if `index.html` is out of date, which is
   worth wiring into CI.

Weights within a list need not sum to 1; they are normalised.
