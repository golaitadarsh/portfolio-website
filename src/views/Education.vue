<script lang="ts" setup>
import DetailLayout from '../layouts/DetailLayout.vue'
</script>

<template>
  <DetailLayout>
    <section class="page-head">
      <div class="meta">
        <span><span class="num">01</span> / Education</span>
        <span>IIT Gandhinagar · 2019—2023</span>
      </div>
      <h1>Built<br /><span class="accent-line">from raw</span><br />stock.</h1>
      <p class="lede">
        Mechanical Engineering at IIT Gandhinagar — four years of cutting, welding, and turning raw aluminium into running hardware. Graduated CPI 8.18, Dean's List, and the institute Gold Medal for service. The instinct for hands-on systems started here.
      </p>
    </section>

    <section class="edu-stage">
      <aside class="institute-card">
        <div class="crest" aria-hidden="true">IIT</div>
        <h3>Indian Institute of Technology — Gandhinagar</h3>
        <p class="location">Gujarat · India</p>
        <p class="degree">
          B.Tech<br />
          <span class="branch">Mechanical Engineering</span>
        </p>
        <div class="meta-row">
          <div class="cell">
            <span class="k">CPI</span>
            <span class="v">8.18<span style="font-weight:400;font-size:0.7em;color:var(--ink-faint)"> /10</span></span>
          </div>
          <div class="cell">
            <span class="k">Duration</span>
            <span class="v">4 yrs</span>
          </div>
          <div class="cell">
            <span class="k">Convocation</span>
            <span class="v">2023</span>
          </div>
          <div class="cell">
            <span class="k">Cohort</span>
            <span class="v">2,000+</span>
          </div>
        </div>
      </aside>

      <div class="edu-right">
        <div class="stat-row" role="list">
          <div class="stat" role="listitem">
            <span class="num">8.18<sup>/10</sup></span>
            <span class="k">Cumulative · CPI</span>
          </div>
          <div class="stat" role="listitem">
            <span class="num">Sem 4</span>
            <span class="k">Dean's List · 2021</span>
          </div>
          <div class="stat" role="listitem">
            <span class="num">Au</span>
            <span class="k">Gold Medal · 2023</span>
          </div>
        </div>

        <div class="medal-card">
          <span class="kicker">Convocation 2023 · Highest institute honour</span>
          <p class="award">Gold Medalist —<br /><em>Outstanding Social Service.</em></p>
          <p class="citation">
            Awarded by IIT Gandhinagar to a single graduate per cohort for contribution to student welfare, campus operations, and community leadership — recognising the Welfare Secretary tenure, vendor-trial system, and 25-member council coordination across a 2,000+ student community.
          </p>
          <div class="footrow">
            <span class="tag accent">Institute Gold</span>
            <span class="tag">1 of 1 awarded</span>
            <span class="tag">Class of 2023</span>
          </div>
        </div>

        <div>
          <p class="kicker" style="margin-bottom:1rem;">Coursework, hands-on weighted</p>
          <ul class="highlight-list">
            <li><span class="k">Mechanism Design</span><span class="v">Linkage kinematics · gear trains · CAD iteration</span></li>
            <li><span class="k">Controls</span><span class="v">PID · system identification · closed-loop hardware</span></li>
            <li><span class="k">Fabrication</span><span class="v">CNC · lathe · laser · welding · 3D-print</span></li>
            <li><span class="k">Materials</span><span class="v">Strength · selection · tolerance stack-up</span></li>
            <li><span class="k">Industrial Systems</span><span class="v">Bulk-material handling · plant ops</span></li>
            <li><span class="k">Embedded</span><span class="v">Arduino · sensor integration · firmware</span></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="pre-strip">
      <div class="section-head">
        <span class="num">01.b</span>
        <h2>Before IITGN</h2>
      </div>
      <div class="timeline">
        <span class="yr">2017—2019</span>
        <p class="body">
          <strong>Senior secondary (CBSE) · PCM stream.</strong> Built the academic record that led to IITGN — alongside competitive Rope Skipping at state and national levels (three State Gold, two CBSE National Silver, RSFI national selection).
        </p>
      </div>
      <div class="timeline">
        <span class="yr">until 2017</span>
        <p class="body">
          <strong>Secondary schooling.</strong> Early engineering curiosity — competitive rope skipping representing state at School Games Federation of India.
        </p>
      </div>
    </section>
  </DetailLayout>
</template>

<style scoped>
.edu-stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: clamp(2rem, 5vw, 5rem);
  padding: clamp(3rem, 7vh, 5rem) var(--gutter-x);
  align-items: start;
}
@media (max-width: 980px) {
  .edu-stage { grid-template-columns: 1fr; }
}

.institute-card {
  position: sticky;
  top: 8rem;
  padding: clamp(1.5rem, 3vh, 2.5rem);
  border: 1px solid var(--rule);
  background: var(--paper);
}
.institute-card .crest {
  width: 56px; height: 56px;
  border: 1px solid var(--ink);
  display: grid; place-items: center;
  font: 800 1.4rem/1 var(--f-sans);
  letter-spacing: -0.02em;
  margin-bottom: 1.5rem;
}
.institute-card h3 {
  font: 800 clamp(1.5rem, 2.2vw, 2rem)/1.05 var(--f-sans);
  letter-spacing: -0.025em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.institute-card .location {
  font: 500 0.7rem/1.2 var(--f-mono);
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  text-transform: uppercase;
  margin-bottom: 1.5rem;
}
.institute-card .degree {
  font: 500 0.95rem/1.4 var(--f-sans);
  color: var(--ink);
  padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
}
.institute-card .degree .branch {
  display: block;
  color: var(--ink-soft);
  font-weight: 400;
  margin-top: 0.15rem;
}
.institute-card .meta-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--rule);
}
.institute-card .meta-row .cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.institute-card .meta-row .cell .k {
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.institute-card .meta-row .cell .v {
  font: 800 1rem/1 var(--f-sans);
  letter-spacing: -0.01em;
}

.edu-right { display: flex; flex-direction: column; gap: clamp(2rem, 5vh, 3rem); }

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--rule);
}
.stat-row .stat {
  padding: clamp(1.25rem, 3vh, 2rem);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.stat-row .stat + .stat { border-left: 1px solid var(--rule); }
.stat .num {
  font: 900 clamp(2.2rem, 5vw, 3.6rem)/0.9 var(--f-sans);
  letter-spacing: -0.04em;
}
.stat .num sup { font-size: 0.45em; vertical-align: 1.25em; letter-spacing: 0; font-weight: 700; color: var(--ink-soft); }
.stat .k {
  font: 500 0.6rem/1.4 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
@media (max-width: 640px) {
  .stat-row { grid-template-columns: 1fr; }
  .stat-row .stat + .stat { border-left: 0; border-top: 1px solid var(--rule); }
}

.medal-card {
  position: relative;
  padding: clamp(2rem, 4vh, 3rem);
  background: var(--ink);
  color: var(--paper);
  overflow: hidden;
}
.medal-card::after {
  content: '';
  position: absolute;
  top: -40px; right: -40px;
  width: 220px; height: 220px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.22;
  filter: blur(20px);
}
.medal-card :deep(.kicker) { color: rgba(255,255,255,0.55); position: relative; z-index: 2; }
.medal-card .award {
  margin-top: 1.25rem;
  font: 800 clamp(1.5rem, 3vw, 2.4rem)/1.05 var(--f-sans);
  letter-spacing: -0.02em;
  text-transform: uppercase;
  position: relative; z-index: 2;
  max-width: 22ch;
}
.medal-card .award em {
  font-style: normal;
  color: var(--accent);
}
.medal-card .citation {
  margin-top: 1.25rem;
  max-width: 56ch;
  font: 400 0.95rem/1.55 var(--f-sans);
  color: rgba(255,255,255,0.72);
  position: relative; z-index: 2;
}
.medal-card .footrow {
  margin-top: 1.5rem;
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  position: relative; z-index: 2;
}
.medal-card :deep(.tag) { color: rgba(255,255,255,0.78); border-color: rgba(255,255,255,0.18); }
.medal-card :deep(.tag.accent) { color: var(--accent-ink); }

.highlight-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
}
.highlight-list li {
  list-style: none;
  background: var(--paper);
  padding: clamp(1.25rem, 2.5vh, 1.75rem);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.highlight-list li .k {
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.highlight-list li .v {
  font: 600 1rem/1.4 var(--f-sans);
  color: var(--ink);
  letter-spacing: -0.005em;
}
@media (max-width: 640px) {
  .highlight-list { grid-template-columns: 1fr; }
}

.timeline {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 1.5rem;
  align-items: start;
  padding: clamp(1.5rem, 3vh, 2rem) 0;
  border-top: 1px solid var(--rule);
}
.timeline .yr {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  text-transform: uppercase;
  padding-top: 0.3rem;
}
.timeline .body {
  font: 400 0.95rem/1.55 var(--f-sans);
  color: var(--ink-soft);
  max-width: 64ch;
}
.timeline .body strong { color: var(--ink); font-weight: 600; }

.pre-strip {
  padding: clamp(2.5rem, 6vh, 4rem) var(--gutter-x);
  border-top: 1px solid var(--rule);
}
</style>
