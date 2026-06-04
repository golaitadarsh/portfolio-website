<script lang="ts" setup>
// HomeContent — specs strip + index-list + contact strip. Sits under Hero on `/`.
</script>

<template>
  <section class="home-content">
    <div class="specs">
      <div class="spec">
        <span class="k">Discipline</span>
        <span class="v">Mechanical Eng. · IITGN</span>
      </div>
      <div class="spec">
        <span class="k">Current</span>
        <span class="v">Sr. Manager · Axis Bank</span>
      </div>
      <div class="spec">
        <span class="k">Based</span>
        <span class="v">Mumbai, IN</span>
      </div>
      <div class="spec">
        <span class="k">Status</span>
        <span class="v status-live">
          <span class="dot"></span>
          Open to product ops
        </span>
      </div>
    </div>

    <ul class="index-list" aria-label="Sections">
      <li>
        <RouterLink to="/education">
          <span class="num">01</span>
          <h2>Education<span class="underbar"></span></h2>
          <span class="desc">IIT Gandhinagar — B.Tech Mechanical Engineering. CPI 8.18, Dean's List, Institute Gold Medal for Social Service.</span>
          <span class="arrow" aria-hidden="true">
            <svg viewBox="0 0 36 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="0" y1="7" x2="34" y2="7" stroke-linecap="square"></line>
              <polyline points="27,1 35,7 27,13" stroke-linejoin="miter"></polyline>
            </svg>
          </span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/experience">
          <span class="num">02</span>
          <h2>Experience<span class="underbar"></span></h2>
          <span class="desc">Axis Bank (Manager → Sr. Manager · 2023—now), SmartoKids hardware internship, Tata Steel plant exposure.</span>
          <span class="arrow" aria-hidden="true">
            <svg viewBox="0 0 36 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="0" y1="7" x2="34" y2="7" stroke-linecap="square"></line>
              <polyline points="27,1 35,7 27,13" stroke-linejoin="miter"></polyline>
            </svg>
          </span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/projects">
          <span class="num">03</span>
          <h2>Projects<span class="underbar"></span></h2>
          <span class="desc">14 records — 8 corporate (forecasting framework, TCS automation program, CCPS pipeline) + 6 academic builds (go-kart, inverted pendulum, exoskeleton).</span>
          <span class="arrow" aria-hidden="true">
            <svg viewBox="0 0 36 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="0" y1="7" x2="34" y2="7" stroke-linecap="square"></line>
              <polyline points="27,1 35,7 27,13" stroke-linejoin="miter"></polyline>
            </svg>
          </span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/leadership">
          <span class="num">04</span>
          <h2>Leadership<span class="underbar"></span></h2>
          <span class="desc">Welfare Secretary + Interim Gen. Sec + Interim Cultural Sec at IITGN — sole bridge for a 2,000+ student community. Pegasus'20 co-founder.</span>
          <span class="arrow" aria-hidden="true">
            <svg viewBox="0 0 36 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="0" y1="7" x2="34" y2="7" stroke-linecap="square"></line>
              <polyline points="27,1 35,7 27,13" stroke-linejoin="miter"></polyline>
            </svg>
          </span>
        </RouterLink>
      </li>
      <li>
        <RouterLink to="/recognition">
          <span class="num">05</span>
          <h2>Recognition<span class="underbar"></span></h2>
          <span class="desc">Gold Medalist (IITGN '23), ANCHORS Elite (Axis Bank, 1 of 51 pan-India), Dean's List, Rube Goldberg winner, national-level rope skipping medals.</span>
          <span class="arrow" aria-hidden="true">
            <svg viewBox="0 0 36 14" fill="none" stroke="currentColor" stroke-width="1.5">
              <line x1="0" y1="7" x2="34" y2="7" stroke-linecap="square"></line>
              <polyline points="27,1 35,7 27,13" stroke-linejoin="miter"></polyline>
            </svg>
          </span>
        </RouterLink>
      </li>
    </ul>

    <section class="contact-strip">
      <h3>Open to <em>product &amp; program operations</em> at hardware-first companies.</h3>
      <div class="contact-links">
        <a href="mailto:adarsh.g@iitgn.ac.in">Email</a>
        <a href="https://www.linkedin.com/in/adarsh-golait/" target="_blank" rel="noopener">LinkedIn</a>
        <a href="tel:+918602772536">+91 8602 772 536</a>
      </div>
    </section>
  </section>
</template>

<style scoped>
.home-content {
  background: var(--paper);
  position: relative;
  z-index: 1;
}

.specs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--rule);
}
.specs .spec {
  padding: clamp(1.5rem, 3vh, 2rem) var(--gutter-x);
  display: flex; flex-direction: column; gap: 0.45rem;
}
.specs .spec + .spec { border-left: 1px solid var(--rule); }
.specs .k {
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.specs .v {
  font: 800 1rem/1.3 var(--f-sans);
  letter-spacing: -0.005em;
}
.specs .status-live {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.specs .status-live .dot {
  display: inline-block;
  width: 8px; height: 8px;
  background: var(--accent);
  border-radius: 50%;
}
@media (max-width: 880px) {
  .specs { grid-template-columns: 1fr 1fr; }
  .specs .spec:nth-child(3) { border-left: 0; border-top: 1px solid var(--rule); }
  .specs .spec:nth-child(4) { border-top: 1px solid var(--rule); }
}
@media (max-width: 520px) {
  .specs { grid-template-columns: 1fr; }
  .specs .spec + .spec { border-left: 0; border-top: 1px solid var(--rule); }
}

.index-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.index-list li { border-bottom: 1px solid var(--rule); }
.index-list a {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr) minmax(0, 1.2fr) auto;
  gap: clamp(1rem, 3vw, 3rem);
  align-items: center;
  padding: clamp(1.5rem, 3vh, 2.25rem) var(--gutter-x);
  position: relative;
  transition: background 0.25s ease, padding 0.25s ease;
}
.index-list a:hover {
  background: var(--paper-2);
}
.index-list a:hover .arrow { transform: translateX(8px); }
.index-list a:hover h2 .underbar { transform: scaleX(1); }
@media (max-width: 880px) {
  .index-list a {
    grid-template-columns: 5rem 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.5rem 1rem;
  }
  .index-list a .desc { grid-column: 1 / -1; }
  .index-list a .arrow { grid-column: 2; grid-row: 1; justify-self: end; }
}
.index-list .num {
  font: 500 0.78rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  text-transform: uppercase;
}
.index-list h2 {
  font: 800 clamp(1.6rem, 3.6vw, 2.6rem)/1 var(--f-sans);
  letter-spacing: -0.025em;
  text-transform: uppercase;
  position: relative;
  display: inline-block;
}
.index-list h2 .underbar {
  position: absolute;
  left: 0; right: 0; bottom: -0.18em;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.index-list .desc {
  font: 400 clamp(0.92rem, 1.05vw, 1rem)/1.45 var(--f-sans);
  color: var(--ink-soft);
  max-width: 56ch;
  text-wrap: pretty;
}
.index-list .arrow {
  width: 36px; height: 14px;
  transition: transform 0.3s ease;
}
.index-list .arrow svg { display: block; }
.index-list .arrow svg :deep(line),
.index-list .arrow svg :deep(polyline) { stroke: var(--ink); }

.contact-strip {
  padding: clamp(2.5rem, 5vh, 4rem) var(--gutter-x);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: center;
  border-top: 1px solid var(--rule);
  background: var(--ink);
  color: var(--paper);
}
@media (max-width: 720px) { .contact-strip { grid-template-columns: 1fr; align-items: start; } }
.contact-strip h3 {
  font: 800 clamp(1.4rem, 2.6vw, 2rem)/1.15 var(--f-sans);
  letter-spacing: -0.025em;
  max-width: 32ch;
  text-transform: uppercase;
}
.contact-strip h3 em { font-style: normal; color: var(--accent); }
.contact-links { display: flex; gap: 0; flex-wrap: wrap; border: 1px solid rgba(255,255,255,0.18); }
.contact-links a {
  padding: 0.85rem 1.25rem;
  font: 500 0.72rem/1 var(--f-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
  transition: background 0.2s ease, color 0.2s ease;
}
.contact-links a + a { border-left: 1px solid rgba(255,255,255,0.18); }
.contact-links a:hover { background: var(--accent); color: var(--accent-ink); }
@media (max-width: 520px) {
  .contact-links { flex-direction: column; }
  .contact-links a + a { border-left: 0; border-top: 1px solid rgba(255,255,255,0.18); }
}
</style>
