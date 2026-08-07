<script lang="ts" setup>
import DetailLayout from '../layouts/DetailLayout.vue'
</script>

<template>
  <DetailLayout>
    <section class="page-head">
      <div class="meta">
        <span><span class="num">02</span> / Work Experience</span>
        <span>3 organisations · 4+ years</span>
      </div>
      <h1>Built<br />infrastructure<br /><span class="accent-line">from zero.</span></h1>
      <p class="lede">
        Three years owning production-grade systems at Axis Bank as the sole accountable operator — modular forecasting frameworks, multi-vendor program coordination, and pipeline turnarounds cut by 90%. Before that, hardware product prototyping at a consumer startup and a live plant tour at Tata Steel.
      </p>
    </section>

    <div class="ledger">
      <div class="cell">
        <span class="k">Tenure</span>
        <span class="v">3.5<small> yrs</small></span>
      </div>
      <div class="cell">
        <span class="k">Roles held</span>
        <span class="v">5</span>
      </div>
      <div class="cell">
        <span class="k">Models owned</span>
        <span class="v">9<small> quarterly</small></span>
      </div>
      <div class="cell">
        <span class="k">Promotions</span>
        <span class="v">1</span>
      </div>
    </div>

    <article class="role" data-state="current">
      <div class="role-meta">
        <span class="badge live">Active</span>
        <span class="dates">Jul 2023<br />— Present</span>
        <span class="loc">Mumbai, IN</span>
      </div>
      <div class="role-body">
        <p class="company">Axis Bank · Financial Modelling Team</p>
        <h2>Operations &amp; Framework Build — Retail Asset &amp; Agri Models</h2>

        <div class="titles">
          <div class="title-row">
            <span class="title">Senior Manager <em>Promoted</em></span>
            <span class="span">May 2025 — Present</span>
          </div>
          <div class="title-row">
            <span class="title">Manager</span>
            <span class="span">Jul 2023 — Apr 2025</span>
          </div>
        </div>

        <p class="summary">
          Sole accountable owner for the production pipeline of 9 quarterly models (4 Retail Asset + 5 Agri products). Architected a modular PySpark forecasting framework — 7 reusable modules driven by a single parameter file — adopted unmodified by an external TCS engineering team. Concurrently ran an 18-month vendor automation program across 4 internal teams as the only internal program coordinator.
        </p>

        <div class="impact-grid">
          <div class="impact">
            <span class="v accent-num">90%</span>
            <span class="k">CCPS turnaround cut · 2–3d → 3h</span>
          </div>
          <div class="impact">
            <span class="v">7</span>
            <span class="k">Reusable PySpark modules · TCS-adopted</span>
          </div>
          <div class="impact">
            <span class="v">8</span>
            <span class="k">Systems delivered · vendor program</span>
          </div>
          <div class="impact">
            <span class="v">10+</span>
            <span class="k">Concurrent deliverables · solo period</span>
          </div>
        </div>

        <div class="scope">
          <div class="item">
            <div class="k">Stack</div>
            <div class="v">PySpark · SparkSQL · Jenkins CI/CD · BitBucket · Jira</div>
          </div>
          <div class="item">
            <div class="k">Cross-functional reach</div>
            <div class="v">Business · Analytics · Data Engineering · Finance · TCS vendor team</div>
          </div>
          <div class="item">
            <div class="k">Recognition</div>
            <div class="v">ANCHORS Elite · ANCHORS Team Player · BIU Team Award (FY25)</div>
          </div>
          <div class="item">
            <div class="k">Continuity</div>
            <div class="v">100% production uptime through 3-month team transition</div>
          </div>
        </div>

        <div class="pill-row">
          <span class="tag solid">Forecasting Framework</span>
          <span class="tag">Vendor Program Mgmt</span>
          <span class="tag">SAS → PySpark Migration</span>
          <span class="tag">Profit Score Automation</span>
          <span class="tag">Validation Layer Design</span>
          <span class="tag">Star-schema Governance</span>
        </div>
      </div>
    </article>

    <article class="role">
      <div class="role-meta">
        <span class="badge">Internship</span>
        <span class="dates">May 2022<br />— Jul 2022</span>
        <span class="loc">Ahmedabad, IN</span>
      </div>
      <div class="role-body">
        <p class="company">SmartoKids Commerce Pvt. Ltd.</p>
        <h2>Product Development Intern — Prototyping &amp; Vendor Sourcing</h2>

        <p class="summary">
          Reverse-engineered 10+ competing hardware products to extract reusable design patterns within explicit cost and production constraints. Led rapid prototyping concept-to-build (CAD, laser, MDF, 3D-print) and ran on-ground vendor relationships end-to-end — visiting suppliers, assessing capability, comparing quotes, supporting negotiation.
        </p>

        <div class="impact-grid">
          <div class="impact">
            <span class="v">10+</span>
            <span class="k">Competitor SKUs reverse-engineered</span>
          </div>
          <div class="impact">
            <span class="v">Multi</span>
            <span class="k">Prototype iteration cycles shipped</span>
          </div>
          <div class="impact">
            <span class="v">On-site</span>
            <span class="k">Vendor visits · quote comparison</span>
          </div>
        </div>

        <div class="pill-row">
          <span class="tag">Hardware Prototyping</span>
          <span class="tag">CAD · Fusion 360</span>
          <span class="tag">Laser Cut · 3D Print</span>
          <span class="tag">Vendor Sourcing</span>
          <span class="tag">Competitor Catalog</span>
        </div>
      </div>
    </article>

    <article class="role">
      <div class="role-meta">
        <span class="badge">Vocational</span>
        <span class="dates">May 2021<br />— Jul 2021</span>
        <span class="loc">Virtual</span>
      </div>
      <div class="role-body">
        <p class="company">Tata Steel</p>
        <h2>Vocational Trainee — Industrial Systems Exposure</h2>

        <p class="summary">
          Studied bulk-material handling equipment at a live Tata Steel plant — belt-conveyor construction, idler types, drive arrangements, and power-unit selection for continuous high-load operation. Authored a structured technical report translating plant observations into decision-oriented documentation on splicing tradeoffs, belt inclination limits, and selection guidance.
        </p>

        <div class="pill-row">
          <span class="tag">Bulk Material Handling</span>
          <span class="tag">Belt Conveyors</span>
          <span class="tag">Plant Systems</span>
          <span class="tag">Technical Reporting</span>
        </div>
      </div>
    </article>
  </DetailLayout>
</template>

<style scoped>
.ledger {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--rule);
}
.ledger .cell {
  padding: var(--pad-box-sm) var(--gutter-x);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ledger .cell + .cell { border-left: 1px solid var(--rule); }
.ledger .k {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.ledger .v {
  font: 800 clamp(1.6rem, 3vw, 2.4rem)/1 var(--f-sans);
  letter-spacing: -0.03em;
}
.ledger .v small {
  font-size: 0.45em;
  vertical-align: 0.8em;
  color: var(--ink-soft);
  font-weight: 500;
  letter-spacing: 0;
}
@media (max-width: 880px) {
  .ledger { grid-template-columns: repeat(2, 1fr); }
  .ledger .cell:nth-child(3) { border-left: 0; border-top: 1px solid var(--rule); }
  .ledger .cell:nth-child(4) { border-top: 1px solid var(--rule); }
}

.role {
  display: grid;
  grid-template-columns: 9rem 1fr;
  gap: clamp(1.5rem, 3vw, 3rem);
  padding: var(--pad-sec-sm) var(--gutter-x);
  border-bottom: 1px solid var(--rule);
  position: relative;
}
.role[data-state="current"]::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: var(--accent);
}
.role-meta { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.4rem; }
.role-meta .badge {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.role-meta .badge.live { color: var(--ink); }
.role-meta .badge.live::before {
  content: '';
  display: inline-block;
  width: 6px; height: 6px;
  background: var(--accent);
  margin-right: 0.5rem;
  vertical-align: middle;
}
.role-meta .dates {
  font: 500 0.78rem/1.4 var(--f-mono);
  color: var(--ink);
  letter-spacing: 0.02em;
}
.role-meta .loc {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  text-transform: uppercase;
}

.role-body { min-width: 0; }
.role-body .company {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 0.5rem;
}
.role-body h2 {
  font: 800 clamp(1.6rem, 3vw, 2.4rem)/1.05 var(--f-sans);
  letter-spacing: -0.025em;
  max-width: 22ch;
  margin-bottom: 1rem;
}
.role-body .titles {
  display: grid;
  gap: 0;
  margin: 1.25rem 0 1.5rem;
  border-top: 1px solid var(--rule);
}
.role-body .title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: baseline;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--rule);
}
.role-body .title-row .title {
  font: 600 0.98rem/1.3 var(--f-sans);
  letter-spacing: -0.005em;
}
.role-body .title-row .title em {
  font-style: normal;
  color: var(--accent-ink);
  background: var(--accent);
  padding: 0.05rem 0.4rem;
  margin-left: 0.4rem;
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  vertical-align: 0.18em;
}
.role-body .title-row .span {
  font: 500 0.7rem/1 var(--f-mono);
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}

.role-body .summary {
  font: 400 clamp(1rem, 1.2vw, 1.08rem)/1.55 var(--f-sans);
  color: var(--ink-soft);
  max-width: 70ch;
  text-wrap: pretty;
  margin-bottom: 1.5rem;
}

.impact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  border: 1px solid var(--rule);
  background: var(--paper-2);
}
.impact-grid .impact {
  padding: 1.1rem 1.25rem;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.impact-grid .impact + .impact { border-left: 1px solid var(--rule); }
@media (max-width: 880px) {
  .impact-grid { grid-template-columns: 1fr; }
  .impact-grid .impact + .impact { border-left: 0; border-top: 1px solid var(--rule); }
}
.impact .v {
  font: 900 clamp(1.5rem, 2.4vw, 1.9rem)/1 var(--f-sans);
  letter-spacing: -0.03em;
}
.impact .v.accent-num {
  color: var(--ink);
  background: linear-gradient(180deg, transparent 60%, var(--accent) 60%);
  padding: 0 0.2rem;
  margin-left: -0.2rem;
  display: inline-block;
  width: max-content;
}
.impact .k {
  font: 500 0.62rem/1.3 var(--f-mono);
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  text-transform: uppercase;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.5rem;
}

.scope {
  margin-top: 1.5rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 720px) { .scope { grid-template-columns: 1fr; } }
.scope .item {
  padding: 1rem 1.1rem;
  border: 1px solid var(--rule);
}
.scope .item .k {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}
.scope .item .v {
  font: 500 0.92rem/1.45 var(--f-sans);
  color: var(--ink);
}

@media (max-width: 720px) {
  .role { grid-template-columns: 1fr; }
}
</style>
