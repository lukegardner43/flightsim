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

## The whole country, by postcode area

`uk-areas.json` carries a profile for every UK postcode area — 124 of them,
which is as close as the postcode system gets to "cities and counties". `M`
is Manchester, `EH` is Edinburgh, `TR` is Cornwall, `BT` is Northern Ireland.

It is stored as **archetypes plus a map**, not as 124 separate weight tables:
sixteen characters of British building stock — northern industrial, Scottish
urban, limestone country, London inner, and so on — and a line per area saying
which one it takes. That is not laziness. The difference between Bolton and
Bradford is not something a language model actually knows; the difference
between Bolton and Bath is. Writing it the other way round would have dressed
a guess up as local knowledge.

`ai/embed.js` keeps the archetypes separate in the page too, and the sim merges
them once at startup. Expanded, they were 325 KB of a 534 KB file; stored once,
they are 38 KB. The sim is a single file people open off a phone, and there is
no compression on a `file://` page to hide it.

**Longest match wins**, which the area profiles make essential rather than
merely tidy: a postcode area can be one letter or two, so `BA1 2XX` begins with
`B` exactly as surely as it begins with `BA`. It also means a profile for one
village sits on top of the one for its whole area without either knowing about
the other — `KT23 3HP` still gets the Bookham profile, `KT1 1AA` gets Kingston.

## Regional walls

The weights above say what a building is *made of*. They do not say what it
*looks like*, and those are different questions: a Glasgow tenement, a Rhondda
terrace and a Surrey semi can all come out "stone", "render" and "brick" and
still be drawn on the same five national textures, which is most of why every
British town used to look the same from a thousand feet.

Each profile therefore carries a `texture` block — one small spec per class of
building:

```json
"texture": {
  "house":   { "bond": "ashlar", "win": "tenement", "bays": 2, "rows": 3,
               "tile": [7, 10.5], "trim": "stone", "string": true },
  "block":   { "bond": "ashlar", "win": "tenement", "bays": 3, "rows": 4,
               "tile": [11, 14], "trim": "stone", "string": true, "eaves": true },
  "grand":   { "bond": "ashlar", "win": "sash12", "bays": 3, "rows": 3, "...": "" },
  "masonry": { "bond": "ashlar", "win": "lancet", "bays": 1, "rows": 1, "...": "" }
}
```

All five classes the sim draws are described — `house`, `block`, `shed`,
`grand` and `masonry`.

| field | meaning |
|---|---|
| `bond` | the fabric and its coursing — `brick`, `stock`, `ashlar`, `rubble`, `flint`, `pebbledash`, `harl`, `render`, `timber`, `steel` |
| `win` | the shape of the openings — `sash12`, `sash6`, `sash2`, `casement`, `bay`, `tenement`, `strip`, `picture`, `lancet`, `none` |
| `bays` / `rows` | openings across, storeys down, in one tile |
| `tile` | `[metres across, metres down]` the texture repeats over — this is what sets the *scale* of the wall |
| `trim` | `"stone"` for dressed surrounds |
| `string`, `quoins`, `eaves`, `tilehang` | the regional giveaways |
| `clerestory`, `door` (`true` or `"wide"`), `plinth` | what a working building has instead of windows |

Sheds are the awkward class: metal is the commonest wall material for it in
every region (48–68%), so steel is usually the right bond and a national
texture was not badly wrong. What does differ is **scale and purpose** — a
Milton Keynes distribution shed repeats over 12 m and has a clerestory strip
and roller doors; a Cotswold field barn is coursed rubble on a stone plinth
with one big opening; a Surrey garage court is brick with a normal door.

`wallTexture()` in `index.html` draws it, **white on white**: the wall-material
weights above still tint the result. Pattern here, colour there. A profile with
no `texture` block, or a class it does not describe, keeps the national
texture, so nothing has to be described to work.

One texture per class per *flight*, not per building. The profile is chosen
before `initScene()` runs, so the whole scene is built on the region's own
walls with no extra materials and no extra draw calls. The report says which
ones were used:

```
ai       profile area-g (Glasgow) - dressed 8038 of 8038 footprints OSM left undescribed
         walls   block ashlar/tenement, house ashlar/tenement, grand ashlar/sash12, masonry ashlar/lancet
```

The same caveat applies as to everything else here. What a language model can
honestly claim about a region is the *character* of its walls — coursed stone
or brick, big windows or small, two storeys or four — not any particular
number. The `tile` figures are considered estimates and are the thing most
worth correcting.

## What embed.js checks

Every material, roof shape and building type in a profile — and every `bond`
and `win` in a `texture` block — is checked against what the renderer will
actually accept, read out of `index.html` rather than copied into the checker
(`WALL_MAT`, `ROOF_MAT`, `WALL_BOND`, `WALL_WIN`). This is not theoretical: it immediately found that
the Bookham profile had been asking for `asbestos` roofs since the day it was
written. The sim has never known that word, so a quarter of its sheds had been
falling back to plain grey. They are `eternit` now, which is what a fibre
cement roof is.
