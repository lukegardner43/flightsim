# What the next two hundred landmarks cost

The question: model the top 100 UK building landmarks that the pipeline does
not already do well — the Shard being the type case — and locate them the way
Polesden Lacey is located, and then do the same for the top 100 bridges.

This is an estimate, not a measurement, and it says which parts are which. The
per-model numbers are read off the sixteen models already in `models/` and the
fifty commits that produced them. The totals are extrapolation.

## What one model has actually cost so far

Sixteen models exist. Their JSON runs from 144 tokens (Norbury Park House: one
part, a placeholder) to 3,380 (Polesden Lacey: 39 parts), median about 610.
That artifact is the small end of the cost. The work is in three other places.

**Research.** Heights, spans, plan form, materials. `WebFetch` answers this
well and cheaply — a Wikipedia or Historic England page comes back as a few
hundred tokens of answer rather than a whole document — so call it 5–15 fetches
and under 10k tokens for a building whose dimensions are published.

**Siting.** The `near`, `radius`, `maxArea`/`minArea`, `exclude` and `uBearing`
that make a model land on the right polygon. This is the part that went wrong
repeatedly, and the record is specific:

| What happened | What it cost |
|---|---|
| Polesden Lacey placed on Polesden Lacey Farm, 800 m north — twice | two rounds, and `packs/check-model-sites.js` was written because of it |
| Polesden also matched its own stable block | the `exclude` list |
| St Nicolas' coordinate 185 m west, on a 7.6 m building | a re-survey against Historic England |
| The Shard took the 23,071 m² London Bridge station block | `maxArea` / `minArea` |
| …then took a 4,805 m² neighbour 109 m away | `packRadius` |
| Polesden's frame decided by 1.3 m of rounding | `uBearing`, and `orienttest` to hold it |
| Polesden is a multipolygon relation, so nothing could attach at all | the outer-member anchor in `modelFor` |

Seven failures across sixteen models. Four of them needed a framework change
rather than an edited coordinate — which is the good news in the table, because
those four are now paid for. The remaining rate, a coordinate or an `exclude`
that has to be fixed on the second look, should be nearer one model in five.

**Looking at it.** The commit titles are the honest record of this loop: *Look
at it*; *The photograph wins, and I should have let it*; *Four equal ranges make
a doughnut, not a house*; *A slice's shape is not the building's shape*;
*Polesden's part names had the compass ninety degrees out*; *The cupola stands
over the entrance*. Polesden took eleven commits. This is where most of the
tokens go, and it is what separates a model that looks like the building from
one that merely has the right dimensions in it.

## The buildings

**Triage first.** A top-100 list is not 100 units of work. Two filters remove a
large part of it: a building whose shape is its extruded footprint is already
right, and a building OpenStreetMap contributors have already given
`building:part` volumes to already renders in the `modelled` tier. The second
filter bites hardest on exactly the famous ones — the City towers, Canary
Wharf, several cathedrals. Expect 25–40 of any top-100 building list to need
nothing. Counting them is an Overpass query per candidate site, a few hours,
and it should run before anything else is written.

Assume the list is then topped back up to 100, which means what remains skews
harder than the Bookham ten, because the easy ones are what triage removed.

| Tier | What it is | Count | Each |
|---|---|---:|---|
| A | one mass and a tower or spire — parish churches, keeps, mills, market halls, train sheds. Exactly what the framework does today | 45 | 30–45 min |
| B | a composed building — a cathedral with transepts and a crossing tower, a country house with wings, a castle with several towers. Polesden-class | 40 | 1.5–3 h |
| C | needs a primitive that does not exist — a dome on a drum (St Paul's, the Royal Albert Hall), openwork (Blackpool Tower), an arch (Wembley) | 15 | 4–8 h, the first of each kind carrying the primitive |

About **190 agent-hours**, plus roughly 20 for the new primitives and 4 for
triage: call it **215**.

## The bridges

Different shape of problem, and the honest answer is that it is a framework
project with a hundred models on the end of it rather than a hundred models.

The hook is already there and has never been used. `index.html` routes a
`man_made=bridge` outline through `modelFor` the same way a building goes, and
`modelClaims()` exists solely so that a named bridge is left alone by the
procedural deck-and-piers code. No bridge model has ever been written against
it. Two things stop one being written today:

**A bridge is usually a line, not an area.** `modelParts` works from
`ringsOf(e)` and an oriented box — it needs a polygon. A few bridges have a
`man_made=bridge` outline; most exist only as a `bridge=yes` way, which is a
centreline. So the current framework can model the minority that somebody has
drawn an outline for, and nothing else.

**The part vocabulary cannot say what a famous bridge is.** Parts are boxes
with `taper`, `plan` and a roof. There is no arch, no catenary, no lattice.
`NO_PIERS` already lists suspension, cable-stayed, cantilever, tied-arch, arch,
truss and transporter as forms the procedural code deliberately draws nothing
for — and that list is very close to a top-100 bridge list. Clifton's chains,
the Forth's cantilevers, the Tyne's arch, Ironbridge's ribs: the identity of
each is a curve the vocabulary has no word for.

So, before bridge number one:

1. `on: "span"` — a frame taken from the bridge centreline, u along the deck
   and v across it, so parts sit in fractions of the span exactly as they now
   sit in fractions of a footprint's box. This is the keystone: it makes every
   bridge in OpenStreetMap addressable instead of the few with outlines.
2. An arch primitive — span, rise, thickness, rib count. Covers masonry
   viaducts, Ironbridge, the Tyne, and most of the list by count.
3. A catenary with hangers — Clifton, Menai, Humber, Severn.
4. A lattice or truss, or an approximation that is honest about being one —
   the Forth, and Blackpool Tower gets it for free.
5. A check equivalent to `orienttest`: does the model's deck actually sit on
   the centreline that was surveyed.

**25–40 agent-hours** for that. Comparable to the taper, `uBearing` and
relation-anchor work already in the log.

Afterwards bridges are *cheaper* per unit than buildings. Spans, tower heights
and clearances are published for every notable bridge, and the forms repeat —
once a masonry viaduct is parametric the next thirty are a table of numbers.

| Tier | What it is | Count | Each |
|---|---|---:|---|
| A | masonry arch, viaduct, beam — near-parametric once the arch exists | 55 | 15–25 min |
| B | a named span needing care | 35 | 45–90 min |
| C | the Forth, Tower Bridge, Pontcysyllte, the transporters, the Falkirk Wheel | 10 | 3–5 h |

About 97 hours of authoring, so **130 agent-hours** including the framework.

## The totals

| | Buildings | Bridges | Both |
|---|---:|---:|---:|
| Agent-hours | 215 | 130 | **345** |
| Billed tokens | ~1.1 bn | ~650 m | **~1.75 bn** |
| At Opus 5 rates | ~$2,400 | ~$1,400 | **~$3,800** |

The token number is billed tokens, which is dominated by cache reads: the
conversation is re-sent every turn, and at a 1-hour cache TTL most of it is
read back at a tenth of the input rate. Novel tokens — what is actually read
fresh and written — are nearer 100 million of that 1.75 billion. The arithmetic
behind the per-hour figure, so it can be rescaled if the rate is wrong:

    ~4 m cache-read tokens/h  x $0.50/m  =  $2.00
    ~0.4 m cache-write        x $6.25/m  =  $2.50
    ~0.2 m fresh input        x $5.00/m  =  $1.00
    ~0.2 m output             x $25.00/m =  $5.00
                                            -----
                                            ~$10.50 per agent-hour

Running tier A on Sonnet 5 — the formulaic ones, where the job is to find
published dimensions and fill a template — and keeping Opus 5 for tier B, tier
C and all framework work takes perhaps 15–20% off, so **around $3,000**.

**Wall clock.** 345 hours in series is about eight weeks at six productive
hours a day. It should not be run in series: each landmark is an independent
entry in a JSON file, which is the same shape as the England pack build, and
that already solved the collision — runners produce files, nobody commits but
the last job, and `models/embed.js` rebuilds the registration at the end. At
eight in parallel this is **about a week**.

## Four things that decide the number more than the tiering does

**The look-at-it loop cannot close in a remote session.** Overpass answers a
`WebFetch` with 503 from this address and two of the three mirrors are blocked
by the egress proxy, and the sim gets its buildings from Overpass at runtime.
So a model can be written here but not flown here. The loop that made the
Bookham ten good has to run in CI with a screenshot as an artifact, or on a
machine that can reach Overpass. **A workflow that renders a named model and
posts the picture is the highest-leverage thing to build first** — six to ten
hours, and without it a hundred models get written and none get checked, which
the log already shows the result of: a glass pyramid where the Shard should be.

**Photographs are what separates "high" from "medium".** The six models rated
high confidence are the six the brief gave a photograph for; the four with no
photograph are medium, and they are the four that read as plausible massing
rather than as the building. `upload.wikimedia.org` is blocked by the egress
proxy here and `WebFetch` returns markdown, not pixels. So either a brief
supplies the images the way the KT23 one did, or the environment's egress
policy gains an image host, or two hundred models land at medium. It costs
nothing to decide this now and it cannot be fixed cheaply afterwards.

**Triage before authoring.** A few hours of Overpass counting may remove a
third of the building list, and it removes the third that would otherwise have
been written twice.

**`modelHere` is a linear scan.** It walks all of `MODELS` for every element
that reaches it, converting each model's coordinate to world space inside the
loop, and `modelClaims` does the same for every bridge. At sixteen models that
is free. At two hundred, against every unnamed building in a cell, it is not —
so a spatial index is a two-hour job that wants doing at fifty models, not at
two hundred.
