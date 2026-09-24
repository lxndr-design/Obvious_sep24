# Bay Planner Source Ledger — East Bay (Oakland / Berkeley)

Scout: East Bay source scout · Verified: 2026-09-24, ~13:00–13:40 PT (America/Los_Angeles) · Spec basis: Bay Planner Shared Project Contract v1 (art_UO2gSFe1) §2, §7

Verification standard (per spec §2): a source counts ONLY if fetched this session — an iCal/feed URL returned real event data, or a page listed real upcoming events with dates/venues. Statuses: **verified** (fetched, event-bearing) / **needs-rendering** (real site, JS-only content observed) / **blocked** (policy/API restriction) / **dead** (no upcoming content / closed / squatted). All URLs below were fetched or curl-probed on 2026-09-24; nothing is a candidate or unvetted guess. Timezone for all sources: America/Los_Angeles (all observed times displayed in PT; LiveWhale RSS returned `-0700` offset).

## Summary table (verified: 16)

| # | Name | Category | Access | Listing URL | Proof event (fetched this session) | Verified (PT) |
|---|------|----------|--------|-------------|-------------------------------------|---------------|
| 1 | Berkeley SkyDeck (Luma calendar) | Startup accelerator (tech) | luma-page (iCal needs capture) | https://luma.com/calendar/cal-QzSyFbecenFng8a | SkyDeck's Pad-13 Pitch Competition (Batch 22), 2150 Shattuck Ave, Berkeley | 2026-09-24 |
| 2 | Silicon Valley East Bay Founders Meetups (Luma) | Founders networking (tech) | luma-page | https://luma.com/eastbayfounders | GTM: The Product Pillar (The Mindset), 4733 Chabot Dr suite 175 | 2026-09-24 |
| 3 | East Bay AI Builders & Operators (Luma) | AI builders meetup (tech) | luma-page | https://luma.com/eastbayai | How AI Runs My Company, Albany Library (Sept) | 2026-09-24 |
| 4 | Oakland Adult Recess (Luma calendar) | Community sports/social | luma-page | https://luma.com/calendar/cal-78pVigwpP4AIC3f | Oakland Beach Tennis Open 2026, Oakland, CA ($25) | 2026-09-24 |
| 5 | Oakland Museum of California (OMCA) | Museum/culture | html-structured | https://museumca.org/events/ | Friday Nights at OMCA with Los Tranquilos, Sep 25, 5–9pm, OMCA campus | 2026-09-24 |
| 6 | The Freight | Music venue | html-structured | https://thefreight.org/shows/ | Bill Frisell & Harmony Five, Fri Sep 25 2026, The Freight | 2026-09-24 |
| 7 | The UC Theatre | Music venue | html-structured | https://www.theuctheatre.org/events | Son Lux, Wed Oct 07, doors 7pm / show 8pm | 2026-09-24 |
| 8 | Berkeley Repertory Theatre | Theater | html-structured | https://www.berkeleyrep.org/shows | The Cook, Sep 4–Oct 11 2026, Peet's Theatre (per-day performances listed) | 2026-09-24 |
| 9 | Chabot Space & Science Center | Science center | html-structured | https://chabotspace.org/programs/events-listing/ | Hike & Sip, Sep 26 2026, 5:00–9:30pm, 10000 Skyline Blvd, Oakland | 2026-09-24 |
| 10 | The Crucible | Industrial arts | html-structured | https://www.thecrucible.org/events/ | Free Public Tour, Thursdays (incl. Oct 15 2026) + Gather & Make classes, 1260 7th St, Oakland | 2026-09-24 |
| 11 | Lawrence Hall of Science | Science education | html-structured | https://lawrencehallofscience.org/visitors/events/ | Analog Saturdays, Sat 09/19 + 09/26/2026, 11am–3pm, 1 Centennial Dr, Berkeley | 2026-09-24 |
| 12 | Kala Art Institute | Art gallery | html-structured | https://www.kala.org/gallery/events/ | Hello Moon closing reception, Sat Oct 25, 3–5pm, 2990 San Pablo Ave, Berkeley | 2026-09-24 |
| 13 | BAMPFA | Art museum/film | html-structured | https://bampfa.org/visit/calendar | Maren Hassinger: Living Moving Growing, through Nov 29, 2155 Center St, Berkeley | 2026-09-24 |
| 14 | Visit Berkeley | Regional aggregator | html-structured | https://www.visitberkeley.com/events/ | On the Waterfront: The Other Side of Berkeley, Thu Sep 24, 1931 Center Street | 2026-09-24 |
| 15 | Oakland Art Murmur | Visual arts (galleries) | html-structured | https://oaklandartmurmur.org/events/ | Under The Thumb, Sep 1–Oct 31 2026, Werkshack, 481 25th St, Oakland | 2026-09-24 |
| 16 | Oakland First Fridays | Street festival | html-static (staleness caveat) | https://www.oaklandfirstfridays.org/ | "NEXT FIRST FRIDAY: September 4TH, 5–9:30pm, Telegraph Ave (27th–West Grand)" — date already stale at fetch | 2026-09-24 |

Access-method count: luma-page 4 · html-structured 11 (incl. 1 aggregator) · html-static 1 · event-bearing iCal/RSS 0 (see gaps — closest lead is events.berkeley.edu, LiveWhale).

## Per-source evidence notes

All fetches on 2026-09-24 (PT morning). "Detail URLs" = linked from listing; individual detail pages were not separately fetched unless stated.

### 1. Berkeley SkyDeck — Luma calendar
- Org: Berkeley SkyDeck (UC Berkeley-affiliated startup accelerator). Region: East Bay (Berkeley). Audience: tech/startup — priority-1 for Bay Planner.
- Access: Luma calendar page, server-rendered enough that fetch-web extracted titles/orgs/venues. Calendar id: `cal-QzSyFbecenFng8a`.
- Listing URL: https://luma.com/calendar/cal-QzSyFbecenFng8a · detail example: event pages under luma.com (not separately fetched).
- Proof event: "SkyDeck's Pad-13 Pitch Competition (Batch 22)" at Berkeley SkyDeck, 2150 Shattuck Ave., Penthouse floor, Berkeley, CA 94704; also "Pad-13 End of Program Celebration (Batch 22)" (venue TBD). Dates render on the page; plain-text extraction dropped them — browser rendering or Luma API needed for exact times.
- Cadence: hourly suitable. Timezone: America/Los_Angeles. Coverage limits: only SkyDeck's own events; Luma pages list dates via JS components.
- Evidence: fetch-web of the calendar page returned titled upcoming events with host + venue; raw HTML (curl) contains the "Add iCal Subscription" control, confirming a subscribable iCal feed exists per help.luma.com/p/ical-syncing.

### 2. Silicon Valley East Bay Founders Meetups — Luma calendar
- Org: independent founder community (host Sugata Sanyal et al.). Region: East Bay (Pleasanton + Berkeley sessions). Audience: founders/professional networking — priority-1.
- Access: luma-page. Listing: https://luma.com/eastbayfounders
- Proof events (September section): "GTM: The Product Pillar (The Mindset)" — 4733 Chabot Dr suite 175; "Customer Success in the AI Era" — Berkeley; "FINANCIAL SYSTEMS FOR FOUNDERS (2nd/3rd session)" — 4733 Chabot Dr suite 175.
- Cadence: hourly. Timezone: America/Los_Angeles. Limits: month-grouped listing; exact dates via rendered page.

### 3. East Bay AI Builders & Operators — Luma calendar
- Org: community lunch series ("Free monthly weekday lunch for East Bay folks shipping AI work"). Region: East Bay (Albany/Berkeley area). Audience: AI/tech — priority-1.
- Access: luma-page. Listing: https://luma.com/eastbayai
- Proof event: "How AI Runs My Company" by Chuck Temple — Albany Library (September).
- Cadence: hourly. Timezone: America/Los_Angeles.

### 4. Oakland Adult Recess — Luma calendar
- Org: community sports group. Region: East Bay (Oakland). Audience: broader community/social.
- Access: luma-page. Listing: https://luma.com/calendar/cal-78pVigwpP4AIC3f
- Proof events: "Oakland Beach Tennis Open 2026" ($25, Oakland, CA); "Fultra Sport Fall Morning/Evening Season" ($100).
- Cadence: hourly. Timezone: America/Los_Angeles.

### 5. Oakland Museum of California (OMCA)
- Region: East Bay (Oakland, 1000 Oak St). Audience: broader culture/community.
- Access: html-structured — WordPress "The Events Calendar"-style listing, server-rendered with dates, times, venues, prices, categories. Same platform family as Chabot, Art Murmur, Kala, BAMPFA (see integration notes).
- Listing: https://museumca.org/events/ (monthly views; also /recurring-events/). Detail example: linked per-event pages (not separately fetched).
- Proof events: "Friday Nights at OMCA with Los Tranquilos — September 25 [2026] from 5:00 pm – 9:00 pm, OMCA campus" (upcoming at fetch); plus October 4 and November 1 "OMCA Architecture Walk and Talk" entries, and recurring series descriptions (Friday Nights Apr–Oct, ThursDates, Spotlight Sundays third Sundays).
- Cadence: every 6 hours (scraped calendar). Timezone: America/Los_Angeles. Limits: page title contains a stale 2022 date-range string (harmless SEO remnant); ongoing/annual events are prose, not structured occurrences.

### 6. The Freight (Freight & Salvage)
- Region: East Bay (Berkeley). Audience: broader music.
- Access: html-structured — server-rendered upcoming-shows list with dates, doors/show times, prices.
- Listing: https://thefreight.org/shows/ (secondary ticketing-calendar host: https://secure.thefreight.org/events). Detail example: per-show pages linked from listing.
- Proof events: "Bill Frisell & Harmony Five — Friday, Sep 25th 2026, $54/$59"; "Michael Cleveland — Thursday, Sep 24th 2026" (same day as fetch).
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: co-presented shows marked "tickets sold by co-presenter" (registration URL on detail page).

### 7. The UC Theatre
- Region: East Bay (Berkeley). Audience: broader music.
- Access: html-structured — Webflow CMS event list, server-rendered with date blocks, doors/show times, prices, genres.
- Listing: https://www.theuctheatre.org/events
- Proof events: "Son Lux — Oct 07, Doors 7:00 pm / Show 8:00 pm, $30 + fees"; "Fruit Bats — Oct 01".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: many listings show "SOLD OUT" (registration status is extractable); venue address not in listing text.

### 8. Berkeley Repertory Theatre
- Region: East Bay (Berkeley). Audience: broader theater.
- Access: html-structured — "What's On" page lists productions plus every individual performance (date, time, theatre, access notes).
- Listing: https://www.berkeleyrep.org/shows (ticketing: https://tickets.berkeleyrep.org/events). Detail example: per-production sections on the same page.
- Proof event: "The Cook — Fri, Sep 4, 2026 - Sun, Oct 11, 2026 — Peet's Theatre", with individual performances listed through Oct 11 incl. Oct 6, Oct 7, Oct 8 (1:00PM + 8:00PM).
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: multi-week production runs → many same-title occurrences; dedup by title+venue with distinct occurrence times.

### 9. Chabot Space & Science Center
- Region: East Bay (Oakland, 10000 Skyline Blvd). Audience: broader science/community.
- Access: html-structured — WordPress events listing with dates, times, prices ("Buy Tickets").
- Listing: https://chabotspace.org/programs/events-listing/ (calendar view at /programs/calendar-view/ defaults to today and showed "no events" for its default day — list view is the reliable one).
- Proof events: "Hike & Sip — September 26 @ 5:00 pm - 9:30 pm, $40"; "Family Nature Adventures: Spiders — October 10 @ 10:30 am".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: calendar-view URL not useful for scraping; use events-listing.

### 10. The Crucible
- Region: East Bay (Oakland, 1260 7th St). Audience: broader industrial arts/community.
- Access: html-structured — WordPress events page listing upcoming classes/tours.
- Listing: https://www.thecrucible.org/events/
- Proof events: "Free Public Tours — Thursdays @ 6-8 PM, September 17, October 15, November 19, 2026"; "Gather & Make: Coral Glass Bowl (SEP 17)".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: class titles embed dates in parentheses (e.g. "SEP 17") — parser note; tours are recurring series with explicit date lists.

### 11. Lawrence Hall of Science
- Region: East Bay (Berkeley, 1 Centennial Drive). Audience: broader science education.
- Access: html-structured — events page with dated entries. UC Berkeley also runs a separate platform instance: https://my.lawrencehallofscience.org/events (discovered; not event-verified this session).
- Listing: https://lawrencehallofscience.org/visitors/events/
- Proof events: "Analog Saturdays — Saturday 09/12, 09/19, 09/26/2026, 11:00 a.m.–3:00 p.m."; "Indigenous Peoples' Day — Monday 10/12/2026".
- Cadence: every 6 hours. Timezone: America/Los_Angeles.

### 12. Kala Art Institute
- Region: East Bay (Berkeley, 2990 San Pablo Ave). Audience: broader art.
- Access: html-structured — gallery events page with explicit Date/Time/Venue fields per entry.
- Listing: https://www.kala.org/gallery/events/
- Proof events: "Closing Reception: Hello Moon — Saturday, October 25, 3–5 pm, Mercy and Roger Smullen Print & Media Study Center" (upcoming at fetch); "What We Hold: Kala 2025-26 Fellowship Exhibition Opening Reception — September 19, 2026, 2:00–4:00 pm, Kala Gallery".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: some entries are exhibitions-with-receptions; one listed event was off-site (SF) — venue filter needed.

### 13. BAMPFA
- Region: East Bay (Berkeley, 2155 Center Street). Audience: broader art/film.
- Access: html-structured — WordPress calendar month pages (https://bampfa.org/visit/calendar, /visit/calendar/2026-09). 
- Proof events: "Maren Hassinger: Living Moving Growing — Through November 29"; "Alice Diop in Person — Through September 18" (film series); film series listings (Godard, Scorsese) with end dates.
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: calendar pages emphasize exhibition run-throughs; specific screening datetimes live on detail pages — connector must follow through to detail pages for fixed-time occurrences.

### 14. Visit Berkeley (regional aggregator)
- Region: East Bay (Berkeley-wide). Audience: aggregator/tourism (cross-cutting; useful for dedup ground truth).
- Access: html-structured — server-rendered event listing with dates + full venue addresses.
- Listing: https://www.visitberkeley.com/events/
- Proof events: "On the Waterfront: The Other Side of Berkeley — Thursday, September 24th, 1931 Center Street" (fetch day); "Legally Blonde The Musical — Friday, September 25th, 2640 College Ave"; "The Australian Ballet: Oscar© — Zellerbach Hall".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: Simpleview CMS aggregator — entries duplicate venue sources; treat as cross-check/merge input, not primary provenance. Site notes "all events are subject to change."

### 15. Oakland Art Murmur
- Region: East Bay (Oakland Uptown/25th St corridor). Audience: broader visual arts.
- Access: html-structured — WordPress "The Events Calendar" listing with dates, times, gallery names + street addresses.
- Listing: https://oaklandartmurmur.org/events/ (program page: /first-friday/). Detail example: /event/<slug>/ pages.
- Proof events: "Under The Thumb – A Glass & Mixed Media Group Show — September 1 @ 1:00 pm - October 31 @ 5:00 pm, Werkshack, 481 25th Street, Oakland"; "Hannah Franco: Poiesis — September 4 - October 3, Slate Contemporary Gallery, 5510 College Ave".
- Cadence: every 6 hours. Timezone: America/Los_Angeles. Limits: exhibition-style entries (start-to-end ranges); First Friday art-walk recurrence described on /first-friday/ but no structured monthly occurrences there.

### 16. Oakland First Fridays
- Region: East Bay (Oakland, Telegraph Ave between 27th and West Grand). Audience: broader community festival.
- Access: html-static (Wix-style marketing page). Listing: https://www.oaklandfirstfridays.org/
- Proof text at fetch: "NEXT FIRST FRIDAY: September 4TH | 5pm - 9:30pm" and "Oakland United: Culture & Pride … When: September 4, 2026 … Where: 27th - West Grand Oakland CA" — page content was already one cycle stale on fetch date (Sep 24). 
- Cadence: every 6 hours cheap, but treat as LOW freshness confidence; first-Friday recurrence is deterministic so Bay Planner can synthesize upcoming dates while marking source freshness stale. Timezone: America/Los_Angeles. Limits: no structured calendar, no per-event detail pages verified.

## Integration notes for the connector owner

1. **WordPress "The Events Calendar" (Tribe) adapter covers ~6 sources**: OMCA, Chabot, Art Murmur, Kala, BAMPFA, The Crucible all render the same plugin's listing markup (Date/Time/Venue patterns). Build one parser, parametrize per host. Tribe installs usually also expose iCal/REST endpoints — worth probing per-site during implementation (not verified this session).
2. **Luma adapter for 4 calendars** (SkyDeck, eastbayfounders, eastbayai, Oakland Adult Recess). Documented ingestion path is the per-calendar iCal subscription (help.luma.com/p/ical-syncing — fetched this session; calendars show an "Add iCal Subscription" control in raw HTML). The actual .ics URL is generated in-browser (my probes of three plausible .ics URL patterns returned 404, and the public API requires a key — public-api.luma.com returned HTTP 400 "Please provide an API key"). Plan: one-time manual capture of each calendar's iCal subscription URL (admin action), or Playwright. Luma pages themselves are partially server-rendered (titles/venues extractable; dates need rendering).
3. **Needs Playwright / JS rendering** (real sites, content verified absent from server HTML): Cal Performances (secure.calperformances.org/events?view=list — Tessitura TNEW app, "Retrieving Events…" with no events in HTML), Visit Oakland (visitoakland.com/events/ — only intro copy server-rendered), Oakland Tech Week (oaklandtechweek.com/events — title-only fetch), Berkeley Public Library (berkeleypubliclibrary.libnet.info/events — Communico platform, shell-only HTML; old Drupal /events/calendar page now just redirects notice), Oakland Symphony (oaklandsymphony.org/oaksymcalendar/ — no embed or content in HTML), UC Berkeley events.berkeley.edu (LiveWhale; see gaps).
4. **Priority-1 (tech/startup) East Bay coverage is thin**: verified only Luma-based (sources 1–3). East Bay SBDC events empty, Kapor Center has no maintained calendar (hosts on Eventbrite), Impact Hub Oakland closed. Recommend: expand Luma calendar discovery (more East Bay tech calendars exist — e.g. luma.com/Fused found but its calendar showed no events at fetch), and route "Oakland Tech Week 2026" (Oct) through the Playwright connector.
5. **Dedup ground truth**: Visit Berkeley overlaps venue sources (e.g., Analog Saturdays appears on both Visit Berkeley and Lawrence Hall listings) — good benchmark fixture for merge logic.

## Gaps, blocked, and dead leads (recorded, not silently dropped)

| Lead | URL | Status | What failed / finding |
|---|---|---|---|
| UC Berkeley events calendar (LiveWhale) | https://events.berkeley.edu/ | needs-rendering / feed-params unknown | Listing page is JS-rendered (only "Manage Events" boilerplate in server text). Platform identified as LiveWhale via 404 page generator tag. `/live/ical` and `/live/rss` return HTTP 200 but **zero** VEVENTs/items on bare requests (probed 2026-09-24); homepage HTML shows template placeholders `{{ ical_all_series }}` / `{{ ical_download_href }}`, so real feed URLs carry parameters that require browser inspection. Highest-value remaining lead. |
| Luma iCal subscription URLs | (per-calendar, e.g. SkyDeck) | blocked (needs manual capture or login) | Three plausible .ics URL patterns returned 404 {"message":"Not found."}; public API keyed (HTTP 400). Help doc confirms mechanism; URL generation happens in-browser. |
| Luma city discovery for Oakland/Berkeley | https://luma.com/oakland, https://luma.com/berkeley | dead (paths squatted) | Both vanity paths resolve to single past events (lu.ma/oakland → April 2025 mayoral comedy event; lu.ma/berkeley → past meditation lecture), not city pages. luma.com/eastbay → 404. City discovery VERIFIED to exist only for some cities (luma.com/sf → "Popular events in San Francisco", 150+ events fetched; luma.com/discover → 200, but featured content skews LA/SF). |
| Luma single-event leads | luma.com/fw3e8z8k, luma.com/kkguqajp, luma.com/Fused | dead / empty | fw3e8z8k and kkguqajp resolve to single past events (Berkeley Tech Startups Networking @ Beta Lounge; Berkeley AI Founders Happy Hour @ Westbrae Beer Garden — organizers worth following). Fused Gaming Web3 Founders Oakland calendar exists but listed no events in fetched text. |
| Meetup (OpenOakland and other East Bay groups) | https://www.meetup.com/openoakland/ | blocked (policy/API) | Group page server-renders (2,516 members; monthly "Civic Tech for the Community" meetings at City Hall Hearing Room 3, 1 Frank H. Ogawa Plaza — dates/venues visible), but Meetup's API requires OAuth credentials and unlicensed scraping is against ToS. Needs official API key decision; OpenOakland also publishes first-Tuesday cadence on openoakland.org/calendar/. |
| Eventbrite organizer pages (Ashkenaz, Kapor Center) | https://www.eventbrite.com/o/ashkenaz-music-dance-community-center-2395546258 | blocked (bot-gated) | Fetch returned title-only body (no listing). Eventbrite API requires a key. Ashkenaz's own site (ashkenaz.com) shows no event calendar in server HTML (homepage is testimonials). |
| Cal Performances | https://secure.calperformances.org/events?view=list | needs-rendering | Tessitura "TNEW" ticketing app: server HTML contains "Retrieving Events… Please wait" and no event data. Season-announcement PDF exists (calperformances.org) but is not a feed. |
| Visit Oakland | https://www.visitoakland.com/events/ | needs-rendering | Intro copy server-rendered; event list absent from fetched text (JS-loaded). |
| Oakland Tech Week 2026 | https://oaklandtechweek.com/events | needs-rendering | Fetch returned page title only (JS app). Big October 2026 tech cluster — worth the Playwright connector. |
| Berkeley Public Library | https://berkeleypubliclibrary.libnet.info/events | needs-rendering | Communico platform; fetched HTML is accessibility-header only, no events. Old berkeleypubliclibrary.org/events/calendar confirms "Event Calendars Have Moved" to libnet.info. |
| Oakland Symphony | https://www.oaklandsymphony.org/oaksymcalendar/ | needs-rendering | OakSymCalendar page returned no calendar content or embed URL in HTML grep; /concerts/ page is season prose without dated events. |
| CITRIS and the Banatao Institute | https://citris-uc.org/events/ | dead (no upcoming) | Page states "0 events found. There are no upcoming events." Only past events listed at fetch. |
| Impact Hub Oakland | (site/yelp) | dead (closed) | No functioning events site found; Yelp listing marked "CLOSED". |
| East Bay SBDC | https://www.eastbaysbdc.org/events/ | dead (no events) | "No Events Found" at fetch; workshops page carries stale COVID-era notice ("temporarily suspending all in-person training events"). |
| Kapor Center | https://www.kaporcenter.org/ | dead (no calendar) | No maintained public events calendar on site; events (e.g., People's Hackathon, Oakland Tech Week appearances) surface via Eventbrite — see blocked Eventbrite row. |

## Method note

Verification was done with two mechanisms this session: (1) fetch-web page retrieval (fallback cache mode) for listing pages, and (2) curl probes from the project sandbox for status codes and raw HTML (LiveWhale feed endpoints, Luma .ics pattern candidates, Luma public API, vanity-slug status codes). Every "verified" source above showed real event content in one of those fetches; every "needs-rendering"/"blocked"/"dead" row records exactly what was observed. No source was counted from a search snippet alone, and no URLs were invented — search-discovered URLs that failed are listed as gaps with the failure evidence.
