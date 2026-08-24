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

## Can this run on a Pro subscription?

Partly, and not in the shape costed above. The three things that decide it:

**Pro is a Sonnet plan.** Claude Code's `default` model resolves to Sonnet 5 on
Pro, Team Standard and Enterprise seats, and to Opus 5 on Max, Team Premium,
Enterprise pay-as-you-go and the API. Session and weekly limits are shared
across models, and Opus carries a separate limit of its own on top.

That is survivable, because the work splits cleanly along the same line. The
tier A landmarks — find published dimensions, fill in the template, check it
renders — are Sonnet work, and they are the bulk by count: about 45 buildings
and 55 bridges. What wants Opus is the framework: the `on:"span"` frame, the
arch and catenary primitives, the screenshot job, and the class of problem the
existing log is made of — a frame decided by 1.3 m of rounding, a model that
cannot attach to a multipolygon relation. That is 50–60 hours of the 345.

**345 agent-hours is not a subscription-shaped amount of work.** For scale, the
published enterprise average is about $13 per developer per active day and
$150–250 per month. This is roughly fifty active developer-days in one project.
Whatever the Pro weekly ceiling is, `/usage` on your own machine is the
authority, and this will not fit inside a month of it.

**Usage credits are the escape hatch, and they have a trap in them.** Turning
credits on (`/usage-credits`, or Settings → Usage on claude.ai) lets the work
continue past the plan limit, billed at API rates — which is where the ~$3,800
figure lands — with a monthly spend limit you set as the hard cap. The trap:
prompt cache lifetime is one hour on a subscription and drops to **five
minutes** once you are drawing on credits. Every estimate above assumes cache
reads at a tenth of the input rate, which is exactly what a five-minute cache
throws away on long iterative sessions. Set `ENABLE_PROMPT_CACHING_1H=1` before
running any of this on credits.

Two more things that do not change with the plan:

- **Parallelism buys wall clock, not quota.** Eight agents against one weekly
  limit exhaust it eight times faster. The one-week wall-clock figure assumes
  headroom that a Pro plan does not have.
- **GitHub Actions is a separate budget.** The pack builds are hours of runner
  time and the screenshot job adds more — free on a public repository, 2,000
  minutes a month on a private one.

So: on Pro alone, the tier A half of both lists is genuinely doable, spread
over months. The framework, and therefore the bridges at all, is Max-shaped or
credit-shaped work.

## The test: the Shard, Tower Bridge, Clifton

Three landmarks were built to check the estimate above. The Shard turned out to
need nothing — it was already modelled, four tapered pieces cut from its own
outline, which is the triage point making itself in miniature. So the test is
really the two bridges, and they are the half the estimate was least sure of.

**It took about fifteen minutes** to make both framework changes, write both
models, write a 216-line test and get the suite green. The estimate said 25–40
agent-hours of framework before bridge number one, then 45–90 minutes for a
named span. That is wrong by more than an order of magnitude, and it is worth
being precise about which part of it was wrong.

### The primitives were not needed

The estimate's central claim was that a top-100 bridge list is mostly curves —
Clifton's chains, the Tyne's arch, Ironbridge's ribs — and that the part
vocabulary has no word for a curve, so an arch primitive and a catenary
primitive had to be built into the renderer first. That was wrong.

A curve does not need a curved solid. A suspension chain is a parabola, and a
parabola sampled into seventy-two short vertical prisms is a chain — built out
of the one solid the renderer already makes, generated by a script that has the
equation in it once. Clifton's chains are 144 parts and no new rendering code
at all. The same trick takes an arch, a rib and a lattice. **Roughly 25 of the
estimated 40 framework hours were for primitives that do not need to exist.**

### Four defects, three of them already there

What the work actually consisted of was not building primitives. It was finding
out what was broken in a code path that had been written for bridges and never
once executed, because no bridge model had ever existed to execute it:

| | |
|---|---|
| A claimed bridge got **no deck at all** | "left entirely to that model" skipped the deck along with the piers, so the road lay flat on the water with the towers standing over it. Latent since the hook was written |
| Every part takes the ground **under itself** | right for a building, fatal for a span: Clifton's deck is 75 m over the Avon, so its chains would have sagged into the gorge and climbed back out, following the terrain instead of crossing it. `datum:"anchor"` pads the whole model from mid-span |
| `modelClaims` ignored `exclude` | "Tower Bridge Approach" and "Tower Bridge Road" both contain "tower bridge", so both ordinary viaducts would have lost their piers |
| Parts under 0.8 m² are **silently discarded** | Clifton's suspension rods were 0.25 m² and would never have been drawn — not wrong in the file, not wrong on screen, simply absent |

Only one change was the anticipated kind of framework work, and it was the
cheap version of it: `atM`, which places a part in metres from the middle of
the bridge instead of in fractions of an outline whose length nobody knows. Ten
lines, not the `on:"span"` frame that was costed.

**So the lesson is not "bridges are cheaper".** It is that the first model in a
new category is a debugging job rather than an authoring job, and that the bugs
are in whatever was written speculatively and never run. That cost is real, it
is per-category rather than per-model, and it is nothing like 40 hours — call
it one to three hours for the first arch bridge, the first cantilever, the
first transporter. The same probably applies to the tier C buildings: a dome is
already a `roof:shape`, and openwork is stacked prisms.

### What fifteen minutes did not buy

Nothing was looked at. Overpass cannot be reached from this machine — two
mirrors are blocked by the egress proxy and the third answers 503 — and the sim
takes its buildings from Overpass at runtime, so neither bridge can be flown
here. Both models are verified **geometrically** and not at all **visually**:
`packs/test/bridgetest.js` runs the real `modelParts` against a synthetic
outline and makes 36 assertions about where the parts actually landed, and each
one was checked by breaking the code on purpose to confirm it fails. That
proves the chains meet their saddles, clear the deck, have no gaps and rise all
the way to the towers. It proves nothing whatever about whether Clifton looks
like Clifton.

That is exactly the loop the estimate said dominates the cost, and it is the
one part of the estimate this test could not touch. Both models also rest on an
assumption that could not be checked: that OpenStreetMap holds a
`man_made=bridge` **area** for each bridge. If it does not, the model never
attaches — and because of the deck fix, what happens then is that the
procedural deck draws as it always did and the report says the model did not
match. The failure is safe, which is the most that can be arranged from here.

### The revision

Bridges come down from ~130 agent-hours to something like **50–70**, of which
the framework is now largely spent. Buildings come down less, because their
tier C primitives were a smaller share to begin with — call it **170–190**. But
both numbers are now dominated by the verification loop, which has not been
built and has not been measured, and neither number means anything until it
exists. **The screenshot-in-CI job is no longer the highest-leverage thing to
build first; it is the only thing left that the estimate is still guessing
about.**
