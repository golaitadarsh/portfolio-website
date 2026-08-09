<script lang="ts" setup>
import { computed, ref } from 'vue'
import DetailLayout from '../layouts/DetailLayout.vue'

type Filter = 'all' | 'corporate' | 'academic'
const filter = ref<Filter>('all')

const TOTAL = 14
const CORPORATE = 8
const ACADEMIC = 6

const visibleCount = computed(() => {
  if (filter.value === 'all') return TOTAL
  if (filter.value === 'corporate') return CORPORATE
  return ACADEMIC
})

const showGroup = (group: 'corporate' | 'academic') =>
  filter.value === 'all' || filter.value === group

const showCard = (cat: 'corporate' | 'academic') =>
  filter.value === 'all' || filter.value === cat
</script>

<template>
  <DetailLayout>
    <section class="page-head">
      <div class="meta">
        <span><span class="num">03</span> / Projects</span>
        <span>14 records · corporate &amp; academic</span>
      </div>
      <h1>Things<br />actually<br /><span class="accent-line">shipped.</span></h1>
      <p class="lede">
        Eight corporate programs at Axis Bank, SmartoKids, and Tata Steel — modular forecasting frameworks, profit-score automation tracks, end-to-end pipeline rebuilds — plus six academic mechanical builds from raw stock to live-drive demonstration. Each one delivered, not just specified.
      </p>
    </section>

    <div class="filters" role="tablist" aria-label="Filter projects">
      <span class="label">Filter</span>
      <div class="chip-row">
        <button class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">All</button>
        <button class="chip" :aria-pressed="filter === 'corporate'" @click="filter = 'corporate'">Corporate</button>
        <button class="chip" :aria-pressed="filter === 'academic'" @click="filter = 'academic'">Academic</button>
      </div>
      <span class="count"><strong>{{ visibleCount }}</strong> / {{ TOTAL }} shown</span>
    </div>

    <div class="group-head" :data-hidden="!showGroup('corporate')">
      <span class="num">03.A</span>
      <h2>Corporate Projects</h2>
      <span class="note">8 records · 2021—Present</span>
    </div>

    <div class="project-grid" :data-hidden="!showGroup('corporate')">
      <article class="pcard featured" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">01</span>
          <span>Axis Bank</span>
          <span>Jul 2023 — Present</span>
          <span class="ptype">Framework Build</span>
        </div>
        <h3>Modular production framework — built from zero, <em>adopted unmodified</em> by external TCS engineering team.</h3>
        <p class="prole">Senior Manager · sole architect &amp; owner</p>
        <p class="pbody">
          Architected and shipped a modular PySpark forecasting framework — 7 reusable modules driven by a single parameter file. Migrated 3 product models end-to-end from legacy SAS to PySpark, eliminated spreadsheet dependencies, and transitioned every model to governed star-schema tables. Same framework picked up unmodified by TCS — generalised architecture validated externally.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">7</span><span class="k">Reusable modules</span></div>
          <div class="pstat"><span class="v">80%+</span><span class="k">Cycle time cut · 2–3wk → 2–4d</span></div>
          <div class="pstat"><span class="v">3</span><span class="k">Models migrated SAS → PySpark</span></div>
          <div class="pstat"><span class="v">9</span><span class="k">Quarterly models owned</span></div>
          <div class="pstat"><span class="v">~75%</span><span class="k">Onboarding-to-delivery cut for mentee</span></div>
        </div>
        <div class="ptags">
          <span class="ptag">PySpark</span><span class="ptag">SparkSQL</span><span class="ptag">Star-schema</span>
          <span class="ptag">Jenkins CI/CD</span><span class="ptag">BitBucket</span><span class="ptag">SAS migration</span>
        </div>
      </article>

      <article class="pcard wide" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">02</span>
          <span>Axis Bank · TCS</span>
          <span>Apr 2024 — Dec 2025</span>
          <span class="ptype">Vendor Program</span>
        </div>
        <h3>Valuation model &amp; profit-score automation with TCS — <em>sole internal owner</em> across 4 teams, 18 months.</h3>
        <p class="prole">Senior Manager · sole program coordinator (no co-owner, no PM role)</p>
        <p class="pbody">
          Coordinated Business, Analytics, Data Engineering, Financial Modelling and a 6–8 person external TCS team across two concurrent automation tracks — 1-year valuation models + 6-month profit scores. Translated internal modelling logic into precise vendor framework requirements; reviewed every iteration; gated production stability before each release. Built validation layer preventing downstream breakages across 12+ monthly cycles.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">8</span><span class="k">Systems delivered</span></div>
          <div class="pstat"><span class="v">4</span><span class="k">Internal teams coordinated</span></div>
          <div class="pstat"><span class="v">2 yrs</span><span class="k">Retro-run capability</span></div>
          <div class="pstat"><span class="v">12+</span><span class="k">Monthly cycles · zero breakage</span></div>
        </div>
        <div class="ptags">
          <span class="ptag">Program Mgmt</span><span class="ptag">Vendor coord</span>
          <span class="ptag">PySpark</span><span class="ptag">Validation layer</span><span class="ptag">CCPS · ATM · TD · MAB · CVS</span>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">03</span>
          <span>Axis Bank</span>
          <span>May 2023 — Present</span>
        </div>
        <h3>Credit Card Profitability Pipeline — <em>90% turnaround cut</em>.</h3>
        <p class="prole">Senior Manager · end-to-end production owner</p>
        <p class="pbody">
          Redesigned the CCPS data pipeline and automated input validation: monthly delivery turnaround dropped from 2–3 days to 3 hours. Owned end-to-end production of an account-level profitability model — revenue, reward cost, credit cost, fee components — whose outputs drove KPIs for Credit Card leadership and field sales across 12+ cycles.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">90%</span><span class="k">Turnaround reduction</span></div>
          <div class="pstat"><span class="v">13+ mo</span><span class="k">Back-corrections executed</span></div>
          <div class="pstat"><span class="v">2</span><span class="k">Migrations · Informatica → TCS</span></div>
        </div>
        <div class="ptags"><span class="ptag">PBT logic</span><span class="ptag">Root-cause</span><span class="ptag">Back-correction</span></div>
      </article>

      <article class="pcard" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">04</span>
          <span>Axis Bank</span>
          <span>Jan — Apr 2025</span>
        </div>
        <h3>Solo operational ownership through <em>complete team transition</em>.</h3>
        <p class="prole">Manager · sole owner during 3-month team rebuild</p>
        <p class="pbody">
          Held full delivery of the Financial Modelling portfolio for 3 months — zero missed deadlines, zero production disruptions, no external support. 10+ concurrent active deliverables, 4 own valuation models, CCPS, NCL multiplier, 4 profit-score handoffs to BA teams, and 5 Agri model ownership transfers. Then designed the structured handover that brought new hires to independent delivery within their first quarter.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">10+</span><span class="k">Concurrent deliverables</span></div>
          <div class="pstat"><span class="v">0</span><span class="k">Missed deadlines</span></div>
          <div class="pstat"><span class="v">1 qtr</span><span class="k">New team to independence</span></div>
        </div>
        <div class="ptags"><span class="ptag">Continuity</span><span class="ptag">SOPs</span><span class="ptag">Knowledge transfer</span></div>
      </article>

      <article class="pcard" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">05</span>
          <span>Axis Bank</span>
          <span>Jan 2025 — Present</span>
        </div>
        <h3>NCL Multiplier — <em>50 lakh+</em> accounts per monthly run.</h3>
        <p class="prole">Senior Manager · end-to-end pipeline owner</p>
        <p class="pbody">
          Owned monthly production of a multi-product loss-rate pipeline across 8 products processing 50 lakh+ accounts — account-level pulls, vintage tracking, fresh slippage identification, annualised outputs (slippages, post-linkage / post-recovery loss rates, bucket multipliers). Built a formula-driven validation layer enabling line-by-line reconciliation per product and period, replacing black-box treatment.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">8</span><span class="k">Products covered</span></div>
          <div class="pstat"><span class="v">50L+</span><span class="k">Accounts / month</span></div>
          <div class="pstat"><span class="v">0</span><span class="k">Missed release cycles</span></div>
        </div>
        <div class="ptags"><span class="ptag">PySpark</span><span class="ptag">Validation layer</span><span class="ptag">Root-cause</span></div>
      </article>

      <article class="pcard wide" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">06</span>
          <span>Axis Bank</span>
          <span>Apr 2025 — Present</span>
          <span class="ptype">Systems Design</span>
        </div>
        <h3>Unified profitability infrastructure — <em>6 crore accounts · 30+ products</em> in one harmonised table.</h3>
        <p class="prole">Senior Manager · designed and shipped from zero</p>
        <p class="pbody">
          Diagnosed the structural data problem — profitability outputs scattered across disconnected frameworks with inconsistent logic, fragmented coverage, no unified account-level view. Mapped customers across multiple frameworks, matched back to source, connected populations falling outside any prior framework. Built bridging logic standardising revenue, fee, cost, expected loss, profit components, resolving overlaps at customer and account level without double-counting.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">~6 cr</span><span class="k">Accounts unified</span></div>
          <div class="pstat"><span class="v">30+</span><span class="k">Products harmonised</span></div>
          <div class="pstat"><span class="v">1</span><span class="k">Consumption-ready master table</span></div>
        </div>
        <div class="ptags">
          <span class="ptag">Master data</span><span class="ptag">Bridging logic</span>
          <span class="ptag">PBT · RAROC · NCL</span><span class="ptag">Schema design</span>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">07</span>
          <span>SmartoKids</span>
          <span>May — Jul 2022</span>
          <span class="ptype">Hardware</span>
        </div>
        <h3>Product development — prototyping &amp; on-ground vendor sourcing.</h3>
        <p class="prole">Internship · Ahmedabad</p>
        <p class="pbody">
          Reverse-engineered 10+ competing hardware products to extract reusable patterns within strict cost &amp; production constraints. Led rapid prototyping concept-to-build using CAD, MDF, laser, and 3D-print. Managed on-ground vendor relationships end-to-end — capability assessment, quote comparison, negotiation support. Built a structured competitor SKU catalog from e-commerce scraping.
        </p>
        <div class="ptags">
          <span class="ptag">Fusion 360</span><span class="ptag">Laser cut</span>
          <span class="ptag">3D print</span><span class="ptag">Vendor sourcing</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1nHJQMDm9WLH55x5v1CwYZo8Knen_4E2s/view" target="_blank" rel="noopener">Internship certificate</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('corporate')">
        <div class="pmeta">
          <span class="pnum">08</span>
          <span>Tata Steel</span>
          <span>May — Jul 2021</span>
          <span class="ptype">Plant Study</span>
        </div>
        <h3>Industrial systems study — bulk material handling.</h3>
        <p class="prole">Vocational Trainee · virtual</p>
        <p class="pbody">
          Studied belt-conveyor systems at a live plant — carcass &amp; cover construction, splicing methods, idler types (troughing, impact, return), drive arrangements (single-drum, snubbed, tandem), power-unit selection for high-load continuous operation. Authored a structured report on vulcanisation vs. mechanical splicing tradeoffs and selection guidance grounded in operational reliability.
        </p>
        <div class="ptags">
          <span class="ptag">Belt conveyors</span><span class="ptag">Technical report</span>
          <span class="ptag">Selection criteria</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1wA0e7VINckpSwxrobc2dkNCyXB_IlRlZ/view" target="_blank" rel="noopener">Certificate</a>
          <a href="https://drive.google.com/file/d/1FeGPjXIIYyOQgPuM2jX-9NvQTsRHz3r9/view" target="_blank" rel="noopener">Report</a>
        </div>
      </article>
    </div>

    <div class="group-head" :data-hidden="!showGroup('academic')">
      <span class="num">03.B</span>
      <h2>Academic Projects</h2>
      <span class="note">6 records · IIT Gandhinagar · 2021—2022</span>
    </div>

    <div class="project-grid" :data-hidden="!showGroup('academic')">
      <article class="pcard wide" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">09</span>
          <span>IITGN · Prof. Harish PM</span>
          <span>Mar — Apr 2022</span>
          <span class="ptype">Featured Build</span>
        </div>
        <h3>Go-Kart — <em>full system build from raw stock to live drive</em>.</h3>
        <p class="prole">10-member team · CAD lead, fabrication, sourcing</p>
        <p class="pbody">
          Converted an initial concept into a build-ready design — finalised dimensions, full CAD, fabrication and assembly sequence. Built frame &amp; chassis from lab stock using cutting, sanding, welding, lathe work, grinding, precision fitting. Sourced engine from Delhi; adapted bicycle braking system as a cost-effective constraint-driven solution; procured chain-drive parts across Gandhinagar/Ahmedabad. Debugged iteratively to working live drive.
        </p>
        <div class="pstat-row">
          <div class="pstat"><span class="v">10</span><span class="k">Team members</span></div>
          <div class="pstat"><span class="v">Raw → drive</span><span class="k">End-to-end</span></div>
          <div class="pstat"><span class="v">Live</span><span class="k">Drive demo delivered</span></div>
        </div>
        <div class="ptags">
          <span class="ptag">Welding</span><span class="ptag">Lathe</span>
          <span class="ptag">CAD</span><span class="ptag">Sourcing</span><span class="ptag">Braking system</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1ISyMh713Xe9EiCL6Ku4CpUzXcwW-FJU1/view" target="_blank" rel="noopener">Project video</a>
          <a href="https://drive.google.com/file/d/1tHUv4p33o5MtHJyL4L_5K1UbzSbgrafH/view" target="_blank" rel="noopener">Team</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">10</span>
          <span>IITGN · Prof. Madhu Vadali</span>
          <span>Apr 2022</span>
        </div>
        <h3>Energy-efficient control of <em>inverted pendulum</em>.</h3>
        <p class="prole">Controls · system identification</p>
        <p class="pbody">
          Designed and fabricated the motor-actuated test rig from scratch — structural robustness prioritised so the setup could sustain repeated hard testing at full motor RPM. Led motor parameter identification (MATLAB System ID Toolbox); designed two constrained experiments to isolate electrical and mechanical parameters. Built a cascaded controller — energy-based swing-up + PD position with current feedforward — and validated on the physical rig.
        </p>
        <div class="ptags">
          <span class="ptag">MATLAB</span><span class="ptag">PID + feedforward</span>
          <span class="ptag">System ID</span><span class="ptag">Laser-cut rig</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1JoBnupwAd_gvdzfio9srCIoMLRYLAzc1/view" target="_blank" rel="noopener">Video</a>
          <a href="https://drive.google.com/file/d/1fkPUp6bHTxHULA7tGd3fxiNw31WdLXKy/view" target="_blank" rel="noopener">Report</a>
          <a href="https://drive.google.com/file/d/16yHCzBDirX8PIeAXZRM4cfcvIgk45CAs/view" target="_blank" rel="noopener">Rig</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">11</span>
          <span>IITGN · Prof. Harish PM</span>
          <span>Jan 2022</span>
        </div>
        <h3>Ball on Beam — mechanism, hardware &amp; <em>closed-loop control</em>.</h3>
        <p class="prole">Mechatronics · firmware · controller tuning</p>
        <p class="pbody">
          Designed the beam-tilting mechanism from first principles — evaluated linkage, direct-drive, gear-sector concepts before committing to gear-sector. Integrated DC motor, driver, position sensor, Arduino into a working closed-loop system. Diagnosed a fundamental actuator-speed mismatch — applied gear reduction + iterative calibration. Documented full P/PD performance envelope; isolated binding constraint to actuator ceiling.
        </p>
        <div class="ptags">
          <span class="ptag">Arduino</span><span class="ptag">Closed-loop</span>
          <span class="ptag">Gear-sector drive</span><span class="ptag">PID</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1FT_Wzwe9H6jTgkuAspJ2YjaYZ-4z4QHe/view" target="_blank" rel="noopener">Project video</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">12</span>
          <span>IITGN · Prof. Harish PM</span>
          <span>Feb 2022</span>
        </div>
        <h3>Oldham coupling — CNC machining &amp; <em>variable offset</em> system.</h3>
        <p class="prole">CNC + mechanism design</p>
        <p class="pbody">
          Owned end-to-end system design — translated a three-disc mechanism into a fully integrated assembly. Designed the variable-offset feature from first principles using slotted acrylic panels for continuously adjustable shaft mounting, demonstrating torque transmission beyond the minimum 15mm specified. Specified and integrated bearings to decouple rotational motion from the fixed acrylic frame — the design decision that eliminated binding.
        </p>
        <div class="ptags">
          <span class="ptag">CNC</span><span class="ptag">Bearings</span>
          <span class="ptag">Acrylic + metal</span><span class="ptag">Tolerance</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1I84sv3gypHiSbgT0E_j8CXTokQ4rwIKe/view" target="_blank" rel="noopener">Image 1</a>
          <a href="https://drive.google.com/file/d/1HIvkyE4g3bxuhzvuUYffncRWfb9ItdH4/view" target="_blank" rel="noopener">Image 2</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">13</span>
          <span>IITGN · Prof. Harish PM</span>
          <span>Feb 2021</span>
        </div>
        <h3>Shoulder joint &amp; Harmony <em>exoskeleton</em> — 5-DOF mechanism.</h3>
        <p class="prole">Anatomical mechanism · working prototype</p>
        <p class="pbody">
          Designed a 5-DOF shoulder exoskeleton mechanism that captured scapular rhythm. Iterated joint geometry, linkage kinematics, and range-of-motion constraints across multiple configurations balancing mechanical complexity against anatomical fidelity. Produced a working 3D-printed prototype validated through physical ROM testing, with each design decision documented against alternatives considered.
        </p>
        <div class="ptags">
          <span class="ptag">5-DOF</span><span class="ptag">3D print</span>
          <span class="ptag">Anatomical ROM</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1brWBERTa9KXhCcc-i8ntMxDyh_Oxmw5-/view" target="_blank" rel="noopener">CAD demo</a>
          <a href="https://drive.google.com/file/d/1G-dXtOLStOF7FJCXPODBiBZG-QkIXGLP/view" target="_blank" rel="noopener">Prototype</a>
        </div>
      </article>

      <article class="pcard" :data-hidden="!showCard('academic')">
        <div class="pmeta">
          <span class="pnum">14</span>
          <span>IITGN · Prof. Harish PM</span>
          <span>Apr 2022</span>
        </div>
        <h3>Umbrella holder for <em>specially-abled individuals</em>.</h3>
        <p class="prole">Anthropometric design · wearable mechanism</p>
        <p class="pbody">
          Designed and fabricated a wearable, hands-free umbrella holder for individuals with limited arm mobility. Applied anthropometric measurements to determine fit parameters across the target user population. Created CAD and fabricated a lightweight mechanism with guided linear actuation; iterated on stability and load distribution within strict weight and wearability constraints.
        </p>
        <div class="ptags">
          <span class="ptag">Anthropometric</span><span class="ptag">Wearable</span>
          <span class="ptag">Linear actuation</span>
        </div>
        <div class="plinks">
          <a href="https://drive.google.com/file/d/1PMKWuZQ9cRLqbe_ZWzoutWbLmvWdJXxK/view" target="_blank" rel="noopener">Project video</a>
        </div>
      </article>
    </div>
  </DetailLayout>
</template>

<style scoped>
.filters {
  position: sticky;
  /* Was a hardcoded 73px, which only ever matched one bar height — on a phone
     the topbar is 63px, so the filter row parked 10px below it and page text
     scrolled through the gap. Track the token the bar is actually sized from. */
  top: var(--topbar-h);
  z-index: 60;
  display: flex;
  gap: 1.5rem;
  align-items: center;
  padding: 0.85rem var(--gutter-x);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--rule);
  flex-wrap: wrap;
}
.filters .label {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.chip-row { display: inline-flex; gap: 0; border: 1px solid var(--rule); }
.chip-row .chip {
  padding: 0.45rem 0.9rem;
  font: 500 0.7rem/1 var(--f-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  transition: all 0.15s ease;
}
.chip-row .chip + .chip { border-left: 1px solid var(--rule); }
.chip-row .chip:hover { color: var(--ink); }
.chip-row .chip[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
}
.filters .count {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.04em;
  color: var(--ink-faint);
}
.filters .count strong { color: var(--ink); }

.project-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1px;
  background: var(--rule);
  border-bottom: 1px solid var(--rule);
}
.pcard {
  grid-column: span 6;
  background: var(--paper);
  padding: var(--pad-box-sm);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;
  transition: background 0.2s ease;
}
.pcard:hover { background: var(--paper-2); }
.pcard.wide { grid-column: span 12; }
.pcard.featured {
  grid-column: span 12;
  background: var(--ink);
  color: var(--paper);
}
.pcard.featured:hover { background: #111114; }
@media (max-width: 980px) {
  .pcard, .pcard.wide, .pcard.featured { grid-column: span 12; }
}

.pcard .pmeta {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.pcard.featured .pmeta { color: rgba(255,255,255,0.55); }
.pcard .pnum { color: var(--ink); }
.pcard.featured .pnum { color: var(--paper); }
.pcard .ptype { margin-left: auto; }

.pcard h3 {
  font: 800 clamp(1.2rem, 1.8vw, 1.6rem)/1.1 var(--f-sans);
  letter-spacing: -0.02em;
  margin: 0.25rem 0 0;
  max-width: 32ch;
  text-wrap: balance;
}
.pcard.featured h3 {
  font-size: clamp(1.8rem, 2.6vw, 2.4rem);
  max-width: 26ch;
}
.pcard h3 em {
  font-style: normal;
  color: var(--accent-ink);
  background: var(--accent);
  padding: 0 0.18em;
}
.pcard.featured h3 em {
  background: var(--accent);
  color: var(--accent-ink);
}

.pcard .prole {
  font: 500 0.78rem/1.4 var(--f-sans);
  letter-spacing: -0.005em;
  color: var(--ink-soft);
}
.pcard.featured .prole { color: rgba(255,255,255,0.62); }

.pcard .pbody {
  font: 400 0.92rem/1.5 var(--f-sans);
  color: var(--ink-soft);
  max-width: 64ch;
  text-wrap: pretty;
}
.pcard.featured .pbody { color: rgba(255,255,255,0.72); font-size: 0.98rem; }

.pcard .pstat-row {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  padding-top: 0.5rem;
  border-top: 1px solid var(--rule);
  margin-top: auto;
}
.pcard.featured .pstat-row { border-color: rgba(255,255,255,0.14); }
.pstat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.pstat .v {
  font: 800 1.05rem/1 var(--f-sans);
  letter-spacing: -0.02em;
}
.pcard.featured .pstat .v { color: var(--accent); }
.pstat .k {
  font: 500 0.58rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.pcard.featured .pstat .k { color: rgba(255,255,255,0.5); }

.pcard .ptags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pcard .ptag {
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--rule);
}
.pcard.featured .ptag { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.18); }

.pcard .plinks {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.pcard .plinks a {
  color: var(--ink);
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--ink);
  transition: gap 0.2s ease;
}
.pcard .plinks a::after { content: ' →'; }
.pcard.featured .plinks a { color: var(--accent); border-color: var(--accent); }
@media (max-width: 720px) {
  /* These artifact links are the point of the card (certificate, report,
     video) but render as 16px-tall mono text. Padding would drag the
     underline off the word, so the hit box is an invisible ::before instead —
     visual identical, thumb-sized target. Row gap grows to keep stacked
     links' boxes from overlapping. */
  .pcard .plinks { gap: 1.5rem 1.25rem; }
  .pcard .plinks a { position: relative; }
  .pcard .plinks a::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    height: 40px;
    transform: translateY(-50%);
  }
  .filters .chip-row .chip { min-height: 40px; padding-inline: 1rem; }
  /* Same call the topbar made: at 0.92 alpha the body copy scrolling under
     this bar ghosts through as a grey smudge no blur radius fixes. Opaque —
     which also drops a backdrop-filter compositing layer on the device that
     can least afford it. */
  .filters { background: var(--paper); backdrop-filter: none; -webkit-backdrop-filter: none; }
}

.group-head {
  display: grid;
  grid-template-columns: 9rem 1fr auto;
  gap: 2rem;
  align-items: baseline;
  padding: var(--pad-sec-sm) var(--gutter-x) var(--pad-box-sm);
  border-bottom: 1px solid var(--rule);
}
@media (max-width: 720px) {
  .group-head { grid-template-columns: 1fr; gap: 0.5rem; }
}
.group-head .num {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  color: var(--ink-faint);
}
.group-head h2 {
  font: 800 clamp(1.6rem, 2.6vw, 2rem)/1 var(--f-sans);
  letter-spacing: -0.025em;
  text-transform: uppercase;
}
.group-head .note {
  font: 500 0.7rem/1.4 var(--f-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
  text-align: right;
}

[data-hidden="true"] { display: none !important; }
</style>
