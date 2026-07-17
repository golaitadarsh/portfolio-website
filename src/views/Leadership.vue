<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DetailLayout from '../layouts/DetailLayout.vue'
import PorPhotoWall from '../components/portfolio/PorPhotoWall.vue'
import type { WallPhoto } from '../components/portfolio/PorPhotoWall.vue'

import convocationImg from '../../assets/por/01-convocation-2022.jpg'
import tenderVisitImg from '../../assets/por/03-tender-visit-mess.jpg'
import amritMahotsavImg from '../../assets/por/10-azadi-amrit-mahotsav.jpg'
import outletLaunchImg from '../../assets/por/04-bringing-food-vendors.jpg'
import garbaNightImg from '../../assets/por/11-campus-events-garba.jpg'
import smartLaundryImg from '../../assets/por/06-smart-laundry.jpg'
import treePlantationImg from '../../assets/por/14-tree-plantation-drive.jpg'
import promNightImg from '../../assets/por/12-organised-prom.jpg'
import runYourCafeImg from '../../assets/por/13-run-your-own-cafe.jpg'

const WALL_PHOTOS: WallPhoto[] = [
  { src: convocationImg, cap: 'Convocation 2022' },
  { src: tenderVisitImg, cap: 'Mess Tender Visit' },
  { src: amritMahotsavImg, cap: 'Amrit Mahotsav' },
  { src: outletLaunchImg, cap: 'Outlet Launch' },
  { src: garbaNightImg, cap: 'Garba Night' },
  { src: smartLaundryImg, cap: 'Smart Laundry' },
  { src: treePlantationImg, cap: 'Tree Plantation Drive' },
  { src: promNightImg, cap: 'Prom Night' },
  { src: runYourCafeImg, cap: 'Run Your Own Café' },
]

const rootEl = ref<HTMLElement | null>(null)
const railWrap = ref<HTMLElement | null>(null)
const railTip = ref<HTMLElement | null>(null)

let motionOK = false
let alive = true
let raf: number | null = null
let revealIO: IntersectionObserver | null = null
let railIO: IntersectionObserver | null = null

/* ── count-up: parses prefix / number / suffix from the text
   (₹80+ lakh, 3,600+, 58K all work); restores exact original at end ── */
function runCounters(scope: HTMLElement) {
  scope.querySelectorAll<HTMLElement>('.cnt').forEach((el) => {
    if (el.dataset.done) return
    el.dataset.done = '1'
    const orig = el.dataset.orig || (el.dataset.orig = el.textContent || '')
    if (!motionOK) {
      el.textContent = orig
      return
    }
    const m = orig.match(/^([^0-9]*)([\d,]+)(.*)$/s)
    if (!m) return
    const target = parseInt(m[2].replace(/,/g, ''), 10)
    const commas = m[2].includes(',')
    const t0 = performance.now()
    const dur = 850
    const tick = (t: number) => {
      if (!alive) return
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      if (p < 1) {
        const n = Math.round(target * e)
        el.textContent = m[1] + (commas ? n.toLocaleString('en-US') : String(n)) + m[3]
        requestAnimationFrame(tick)
      } else {
        el.textContent = orig
      }
    }
    requestAnimationFrame(tick)
  })
}

/* ── rewind counters so they replay on next reveal ── */
function resetCounters(scope: HTMLElement) {
  scope.querySelectorAll<HTMLElement>('.cnt').forEach((el) => {
    delete el.dataset.done
    if (el.dataset.orig) el.textContent = el.dataset.orig
  })
}

onMounted(() => {
  const root = rootEl.value
  const wrap = railWrap.value
  const tip = railTip.value
  if (!root || !wrap || !tip) return

  motionOK = matchMedia('(prefers-reduced-motion: no-preference)').matches
  if (motionOK) root.classList.add('anim')

  /* section titles + year clusters reveal; rewind when they exit below */
  revealIO = new IntersectionObserver(
    (es) => {
      es.forEach((en) => {
        if (en.isIntersecting) en.target.classList.add('on')
        else if (en.boundingClientRect.top > 0) en.target.classList.remove('on')
      })
    },
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  )
  root.querySelectorAll('.section-title, .yr-group').forEach((el) => revealIO!.observe(el))

  /* scroll-scrubbed rail: fill tracks a playhead at 72% viewport height */
  const entries = Array.from(wrap.querySelectorAll<HTMLElement>('.entry'))
  const lis = Array.from(wrap.querySelectorAll<HTMLElement>('.bullets > li'))

  const frame = () => {
    const r = wrap.getBoundingClientRect()
    const t = motionOK
      ? Math.max(0, Math.min(r.height, window.innerHeight * 0.72 - r.top))
      : r.height
    tip.style.height = `${t}px`

    entries.forEach((e) => {
      e.classList.toggle('on', t >= e.getBoundingClientRect().top - r.top + 8)
    })
    lis.forEach((li) => {
      const nd = li.querySelector('.nd')
      const y = li.getBoundingClientRect().top - r.top + 12
      if (t >= y) {
        if (!li.classList.contains('on')) {
          li.classList.add('on')
          runCounters(li)
        }
        nd?.classList.add('lit')
      } else {
        if (li.classList.contains('on')) {
          li.classList.remove('on')
          resetCounters(li)
        }
        nd?.classList.remove('lit')
      }
    })
  }
  const loop = () => {
    frame()
    raf = requestAnimationFrame(loop)
  }

  /* run the rAF loop only while the rail is near the viewport */
  railIO = new IntersectionObserver(
    (es) => {
      const en = es[es.length - 1]
      if (en.isIntersecting) {
        if (raf == null) raf = requestAnimationFrame(loop)
      } else {
        if (raf != null) {
          cancelAnimationFrame(raf)
          raf = null
        }
        frame() /* settle state once when leaving */
      }
    },
    { rootMargin: '30% 0px 45% 0px' },
  )
  railIO.observe(wrap)
})

onBeforeUnmount(() => {
  alive = false
  if (raf != null) cancelAnimationFrame(raf)
  raf = null
  revealIO?.disconnect()
  railIO?.disconnect()
})
</script>

<template>
  <DetailLayout>
    <div ref="rootEl">
      <section class="page-head">
        <div class="meta">
          <span><span class="num">04</span> / Positions of Responsibility</span>
          <span>IIT Gandhinagar · 2019—2023</span>
        </div>
        <h1>The bridge<br />between<br /><span class="accent-line">3,600 students</span></h1>
        <p class="lede">
          Three concurrent council roles, a 25-member team, and a community of 3,600+ students. Replaced an unstructured vendor selection process with a trial-based system, ran convocation for the Class of 2022 with a 68-member execution team, and led a 104-student contingent for Inter-IIT Cultural Meet — all in a single year.
        </p>
      </section>

      <section id="por" class="section por-section">
        <h2 class="section-title">Positions of<br /><span class="accent-line">Responsibility</span></h2>

        <div class="rail-wrap" ref="railWrap">
          <div class="rail" aria-hidden="true"><div class="rail-tip" ref="railTip"></div></div>

          <article class="entry">
            <span class="bix"><i></i>Student Council, IIT Gandhinagar</span>
            <div class="entry-head">
              <p class="entry-title">Welfare Secretary | Interim General Secretary | Interim Cultural Secretary</p>
              <span class="entry-when">May, 2022 — April, 2023</span>
            </div>

            <div class="split">
              <ul class="bullets">
                <li><span class="nd"></span><span class="tx">Represented a <strong><span class="cnt">3,600+</span> student community</strong> on institute decisions spanning food services, laundry, healthcare, commercial establishments, hostels and student affairs — coordinating with administration, external vendors, and a <span class="cnt">25</span>-member council as the sole bridge between students and the institute.</span></li>
                <li><span class="nd"></span><span class="tx">Student representative in <strong>procurement and tender evaluations</strong> for campus mess and laundry contracts — conducted operational due diligence across vendor facilities in Gujarat, Rajasthan and Delhi before contributing to institute-wide provider selection.</span></li>
                <li><span class="nd"></span><span class="tx"><em>Designed a trial-based vendor selection system</em> via the Commercial Establishment &amp; Management Committee — engaged <span class="cnt">20+</span> national chains and regional players, ran live campus trials, and onboarded outlets on demonstrated performance rather than lowest-cost bids.</span></li>
                <li><span class="nd"></span><span class="tx">Owned planning and governance of student initiatives with cumulative budgets exceeding <strong><span class="cnt">₹80+ lakh</span></strong> as a student signing authority; led Convocation 2022 through a <span class="cnt">68</span>-member team and IITGN's <span class="cnt">104</span>-member Inter-IIT Cultural Meet contingent end-to-end.</span></li>
              </ul>

              <div class="visual-rail">
                <PorPhotoWall :photos="WALL_PHOTOS" label="Photo wall — Student Council, IIT Gandhinagar" />
              </div>
            </div>
          </article>

          <article class="entry">
            <span class="bix"><i></i>Welfare Council, IIT Gandhinagar</span>
            <div class="entry-head">
              <p class="entry-title">Coordinator for Commercial Outlets</p>
              <span class="entry-when">May, 2021 — April, 2022</span>
            </div>

            <ul class="bullets">
              <li><span class="nd"></span><span class="tx">Identified and assessed <strong><span class="cnt">20+</span> vendor operators</strong> across food and service categories through independent on-ground outreach and capability assessments spanning national chains and regional operators.</span></li>
              <li><span class="nd"></span><span class="tx">Designed and implemented a <em>data-driven vendor evaluation framework</em> — ran multiple 1–2 day campus trials and collected structured community feedback to replace ad-hoc vendor selection with an evidence-based process.</span></li>
              <li><span class="nd"></span><span class="tx">Onboarded and launched <strong><span class="cnt">6</span> food and service outlets</strong> serving a <span class="cnt">3,600+</span> student community — managing end-to-end negotiations, approvals, scheduling, and operational go-live.</span></li>
              <li><span class="nd"></span><span class="tx">Hosted an institute-wide ice cream social for <strong><span class="cnt">4,500+</span> students, faculty, staff and service personnel</strong> — from vendor selection and procurement to on-ground execution.</span></li>
              <li><span class="nd"></span><span class="tx">Led multiple blood donation drives with GCRI and Ahmedabad Civil Hospital — coordinated <span class="cnt">400+</span> registrations via slot-based crowd management, the institute's highest post-pandemic collection.</span></li>
            </ul>
          </article>

          <article class="entry">
            <span class="bix"><i></i>Virtual Event during COVID-19</span>
            <div class="entry-head">
              <p class="entry-title">Co-Founder — Pegasus'20 (International Online Event)</p>
              <span class="entry-when">September, 2020</span>
            </div>

            <ul class="bullets">
              <li><span class="nd"></span><span class="tx">Co-founded and delivered Pegasus'20 end-to-end during COVID with a <span class="cnt">30</span>-member team; secured 5 sponsors + 3 gifting partners, managed INR <span class="cnt">58K</span> prize pool, and closed at INR <span class="cnt">52K</span> profit.</span></li>
            </ul>
          </article>
        </div>
      </section>

      <section id="extra" class="section">
        <h2 class="section-title">Other<br /><span class="accent-line">Extra-Curricular</span></h2>

        <div class="yrs">
          <div class="yr-group">
            <div class="yr-col">
              <div class="yr" aria-label="2020"><span>2</span><span>0</span><span>2</span><span>0</span></div>
            </div>
            <div class="yr-roles">
              <div class="yr-role"><p class="r">Events Coordinator <span class="o">— Amalthea '20 (Annual Technical Summit, IITGN)</span></p><span class="d">September, 2020 — May, 2021</span></div>
              <div class="yr-role"><p class="r">Finance Coordinator, Events Team <span class="o">— Blithchron '21 (Annual Cultural Fest, IITGN)</span></p><span class="d">August, 2020 — February, 2021</span></div>
            </div>
          </div>

          <div class="yr-group">
            <div class="yr-col">
              <div class="yr" aria-label="2019"><span>2</span><span>0</span><span>1</span><span>9</span></div>
            </div>
            <div class="yr-roles">
              <div class="yr-role"><p class="r">Event Management Executive <span class="o">— Blithchron '20 (Annual Cultural Fest, IITGN)</span></p><span class="d">September, 2019 — February, 2020</span></div>
              <div class="yr-role"><p class="r">Event Management Executive <span class="o">— Amalthea '19 (Annual Technical Summit, IITGN)</span></p><span class="d">August, 2019 — October, 2019</span></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </DetailLayout>
</template>

<style scoped>
/* page-head already draws a bottom hairline */
.por-section { border-top: 0; }

/* ── rail ── */
.rail-wrap {
  position: relative;
  --railpad: clamp(2.4rem, 4.5vw, 3.4rem);
  padding-left: var(--railpad);
}
.rail {
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--ink-trace);
}
.rail-tip {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: var(--ink);
}
.rail-tip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 11px;
  height: 11px;
  background: var(--accent);
  border: 2px solid var(--ink);
  border-radius: 50%;
  transform: translate(-50%, 50%);
}

.bix {
  display: block;
  font: 500 0.66rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  color: var(--ink-faint);
  text-transform: uppercase;
  margin-bottom: 0.55rem;
  transition: color 0.3s ease;
}
.entry.on .bix { color: var(--ink); }
.bix i {
  font-style: normal;
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--paper);
  border: 1.5px solid var(--ink-faint);
  margin-right: 0.5rem;
  vertical-align: baseline;
  transition: background 0.3s ease, border-color 0.3s ease;
}
.entry.on .bix i {
  background: var(--accent);
  border-color: var(--ink);
}

.nd {
  position: absolute;
  left: calc(7px - var(--railpad));
  top: 0.34em;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--paper);
  border: 1.5px solid var(--ink-faint);
  transform: translateX(-50%);
  transition: background 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
}
.nd.lit {
  background: var(--accent);
  border-color: var(--ink);
  transform: translateX(-50%) scale(1.3);
}

.split {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  align-items: start;
}
.bullets li .tx { display: inline-block; }

/* ── extra-curricular year clusters ── */
.yrs {
  display: flex;
  flex-direction: column;
  gap: clamp(2.25rem, 5vh, 3.5rem);
}
.yr-group {
  display: grid;
  grid-template-columns: minmax(7.5rem, 11rem) minmax(0, 1fr);
  gap: clamp(1.5rem, 4vw, 3rem);
  padding-top: 1.5rem;
  position: relative;
}
.yr-group::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--ink);
  transform-origin: left center;
}
.yr {
  overflow: hidden;
  white-space: nowrap;
  width: max-content;
  max-width: none;
  font: 900 clamp(2.8rem, 6.5vw, 4.8rem)/1 var(--f-sans);
  letter-spacing: -0.04em;
  color: transparent;
  -webkit-text-stroke: 1.5px rgba(9, 9, 11, 0.42);
}
.yr span { display: inline-block; }
.yr-role {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1.25rem;
  padding: 0.95rem 0;
  border-bottom: 1px solid var(--rule);
}
.yr-role:first-child { padding-top: 0.1rem; }
.yr-role .r {
  font: 600 0.95rem/1.5 var(--f-sans);
  letter-spacing: -0.005em;
  color: var(--ink);
}
.yr-role .r .o {
  font-weight: 400;
  color: var(--ink-soft);
}
.yr-role .d {
  font: 500 0.72rem/1.5 var(--f-mono);
  color: var(--ink-faint);
  letter-spacing: 0.05em;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .split { grid-template-columns: 1fr; }
  .yr-group { grid-template-columns: 1fr; gap: 0.75rem; }
  .yr-role { flex-direction: column; align-items: flex-start; gap: 0.2rem; }
}

/* ── motion: hidden pre-states only when JS mounted (.anim) + motion allowed,
   so reduced-motion and print render fully static ── */
@media (prefers-reduced-motion: no-preference) {
  .anim .section-title {
    opacity: 0;
    transform: translateY(26px);
    transition: opacity 0.8s cubic-bezier(0.22, 1, 0.36, 1), transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .section-title.on {
    opacity: 1;
    transform: none;
  }

  .anim .rail-tip { height: 0; }
  .anim .entry-title {
    opacity: 0;
    transform: translateX(-22px);
    transition: opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .entry.on .entry-title {
    opacity: 1;
    transform: none;
  }
  .anim .entry-when {
    opacity: 0;
    transition: opacity 0.6s ease 0.25s;
  }
  .anim .entry.on .entry-when { opacity: 1; }
  .anim .visual-rail {
    opacity: 0;
    transform: translateY(22px);
    transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
  }
  .anim .entry.on .visual-rail {
    opacity: 1;
    transform: none;
  }
  .anim .bullets li .tx {
    clip-path: inset(-4% 102% -8% -2%);
    transition: clip-path 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.05s;
  }
  .anim .bullets li.on .tx { clip-path: inset(-4% -3% -8% -2%); }
  .anim .nd.lit { animation: ndPop 0.4s cubic-bezier(0.2, 1.4, 0.3, 1); }

  .anim .yr-group::before {
    transform: scaleX(0);
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .yr-group.on::before { transform: scaleX(1); }
  .anim .yr span {
    transform: translateY(112%);
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .yr span:nth-child(2) { transition-delay: 0.07s; }
  .anim .yr span:nth-child(3) { transition-delay: 0.14s; }
  .anim .yr span:nth-child(4) { transition-delay: 0.21s; }
  .anim .yr-group.on .yr span { transform: none; }
  .anim .yr-role {
    opacity: 0;
    transform: translateY(14px);
    transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .anim .yr-role:nth-child(1) { transition-delay: 0.2s; }
  .anim .yr-role:nth-child(2) { transition-delay: 0.34s; }
  .anim .yr-group.on .yr-role {
    opacity: 1;
    transform: none;
  }
}

@keyframes ndPop {
  0% { transform: translateX(-50%) scale(0.6); }
  60% { transform: translateX(-50%) scale(1.55); }
  100% { transform: translateX(-50%) scale(1.3); }
}

@media print {
  .section-title,
  .tx,
  .entry-when,
  .entry-title,
  .visual-rail,
  .yr span,
  .yr-role {
    opacity: 1 !important;
    transform: none !important;
    clip-path: none !important;
    animation: none !important;
  }
  .rail-tip { height: 100% !important; }
  .yr-group::before { transform: none !important; }
}
</style>
