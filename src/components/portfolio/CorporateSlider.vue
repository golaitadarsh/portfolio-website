<script lang="ts" setup>
/* ============================================================
   CORPORATE SLIDER — self-contained animated slider engine
   Vue port of the design prototype's corporate-slider.js.
   Faithful to the "Animated Slider" reference:
     · morphing dark background      (per-project `color`)
     · char-roll project title       (`name`)
     · diagonal card fan             (`card`)
   Autoplay + arrows + dots + keyboard. One screen tall — the
   page stays a single smooth-scroll flow; the slide holds a
   stable state while you scroll past (no scroll-jacking).
   ============================================================ */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import gsap from 'gsap'
import smartokidsPrototypeImg from '../../../assets/projects/smartokids-prototype.jpg'

interface MetricCard {
  kind: 'metric'
  tag: string
  num: number
  unit: string
  viz?: 'network' | 'solo'
  sub: string
  chips: string[]
}
interface PhotoCard {
  kind: 'photo'
  label: string
  big: string
  img: string
  alt: string
}
interface CorporateProject {
  id: string
  num: string
  name: string
  org: string
  role: string
  when: string
  color: string
  highlights: string[]
  card: MetricCard | PhotoCard
}

const CORPORATE_PROJECTS: CorporateProject[] = [
  {
    id: 'modular-framework',
    num: '01',
    name: 'Modular Production Framework across Retail Asset Models',
    org: 'Axis Bank',
    role: 'Senior Manager',
    when: 'July, 2023 – Present · Mumbai',
    color: '#14180E',
    highlights: [
      'Identified that every model release required significant rework and stakeholder coordination. Designed and rolled out a <strong>modular forecasting framework</strong> used across multiple products, creating a common operating structure that improved consistency, reduced execution effort, and later served as a blueprint for broader valuation-model automation efforts.',
      'Led the transition of three retail asset models from legacy systems to a <strong>production-ready PySpark ecosystem</strong>, partnering with Business, Analytics, Finance, and Engineering teams to streamline data flows, eliminate spreadsheet dependencies, and establish a more reliable quarterly delivery process with improved traceability, governance, and audit readiness.',
      'Reduced model upgrade timelines from <strong>2–3 weeks to as little as 1–4 days (80%+ reduction)</strong> by restructuring workflows, standardising upstream dependencies, and introducing repeatable execution processes, enabling faster response to business requests while maintaining delivery quality and stakeholder confidence.',
      'Mentored and onboarded new team members, reducing ramp-up time from <strong>3–4 months to nearly 5 weeks</strong> through structured knowledge transfer, recorded walkthroughs, and hands-on guidance to enable smooth ownership transitions and sustained quarterly delivery across a portfolio of nine forecasting models.',
    ],
    card: {
      kind: 'metric',
      tag: 'Framework',
      num: 80, unit: '%↓',
      sub: 'Model upgrade cycle · 2–3 weeks → 1–4 days',
      chips: ['9 forecasting models', '3 migrated to PySpark', 'Reused as blueprint'],
    },
  },
  {
    id: 'ccps',
    num: '02',
    name: 'Credit Card Profitability Framework Transformation',
    org: 'Axis Bank',
    role: 'Senior Manager',
    when: 'May, 2023 – Present · Mumbai',
    color: '#0E1311',
    highlights: [
      'Reduced monthly turnaround time from <strong>2–3 days to 3 hours (90% reduction)</strong> by redesigning the Credit Card Profit Score (CCPS) operating workflow, automating validations, and eliminating recurring execution bottlenecks across production cycles.',
      'Owned end-to-end delivery of the <strong>Credit Card Profit Score (CCPS)</strong>, an account-level profitability framework used by Credit Card leadership for portfolio reviews, performance management, and profitability-driven decision making.',
      'Served as the central coordination point across Business, Finance, Analytics, Data Engineering, and external partners; translating business changes into framework updates, resolving reporting and data-quality issues, and ensuring uninterrupted delivery across <strong>30+ monthly production cycles</strong> despite evolving requirements and upstream dependencies.',
      'Became the go-to owner for major framework changes, including the integration of <strong>Citibank’s credit card portfolio</strong> into Axis Bank post-acquisition; coordinated with multiple data owners and external vendors across 20+ upstream sources to validate customer coverage, resolve integration gaps, and strengthen the framework to support the expanded portfolio without disrupting monthly reporting cycles.',
    ],
    card: {
      kind: 'metric',
      tag: 'Profitability',
      num: 90, unit: '%↓',
      sub: 'Monthly turnaround · 2–3 days → 3 hours',
      chips: ['CCPS · account-level', '30+ monthly cycles', 'Citi integration'],
    },
  },
  {
    id: 'automation',
    num: '03',
    name: 'Cross-Functional Automation & Platform Transformation',
    org: 'Axis Bank',
    role: 'Senior Manager',
    when: 'April, 2024 – December, 2025 · Mumbai',
    color: '#131013',
    highlights: [
      'Became the <strong>de-facto owner</strong> across two consecutive automation programs (10-month valuation model automation, then 8-month profitability score automation), coordinating four internal teams and a 6-member TCS engineering team to automate 8 models used across Retail Assets and Cards.',
      'Converted years of accumulated modelling logic, business rules, and process dependencies into <strong>production-ready system requirements</strong>, providing the foundation and blueprint for 8 automated valuation and profitability systems.',
      'Extended a single-product automation framework to support <strong>Personal Loans</strong> by reverse-engineering assumptions, cashflow behaviour, risk treatment, and dimensional logic, eliminating recurring manual effort from monthly operations.',
      'Identified scaling challenges in independently developed automations and drove a more <strong>standardized architecture</strong> through reusable modules, common implementation patterns, and framework-level recommendations adopted across products.',
      'Built validation and reconciliation layers that enabled <strong>multi-year historical back-population</strong>, improved release reliability, and increased confidence in outputs used for pricing, profitability, and planning decisions.',
    ],
    card: {
      kind: 'metric',
      tag: 'Automation',
      num: 8, unit: '',
      viz: 'network',
      sub: 'Valuation & profit-score systems automated',
      chips: ['4 internal teams + TCS', '18 months', '2 programs'],
    },
  },
  {
    id: 'solo-ownership',
    num: '04',
    name: 'Solo Operational Ownership Through Full Team Transition',
    org: 'Axis Bank',
    role: 'Manager',
    when: 'January, 2025 – April, 2025 · Mumbai',
    color: '#0F1212',
    highlights: [
      'Held full delivery of the Financial Modelling portfolio as <strong>sole delivery owner for 3 months</strong> through a complete team transition, maintaining zero missed deadlines, zero production disruptions, and zero external support.',
      'Executed <strong>15+ concurrent deliverables</strong>: production for 4 valuation models and 2 profit scores; handoffs of 4 profit scores to BA teams; and ownership transfers of 5 Agri models to incoming hires, all while managing Business + Analytics stakeholders.',
      'Rebuilt the team post-transition: designed a <strong>two-directional structured handover</strong>, authored production-pipeline SOPs, and ran knowledge transfer that took new hires to independent delivery within their first quarter.',
    ],
    card: {
      kind: 'metric',
      tag: 'Ownership',
      num: 15, unit: '+',
      viz: 'solo',
      sub: 'Concurrent deliverables · solo owner, 3 months',
      chips: ['3 months solo', '4 valuation models', '2 profit scores'],
    },
  },
  {
    id: 'smartokids',
    num: '05',
    name: 'Hardware Product Development and Vendor Operations at an Early-Stage Startup',
    org: 'SmartoKids',
    role: 'Product Development Intern',
    when: 'May, 2022 – July, 2022 · Ahmedabad',
    color: '#16120C',
    highlights: [
      'Reverse-engineered <strong>10+ competing STEM and consumer hardware products</strong> to identify reusable design patterns and differentiation opportunities within BOM-cost and manufacturing constraints, informing product ideation and sourcing decisions.',
      'Managed <strong>4+ concurrent hardware development workstreams</strong> from concept to physical prototype across new product concepts and enhancements to existing products in a small-team startup environment.',
      'Designed and prototyped manufacturable hardware concepts using <strong>Fusion 360 and AutoCAD</strong>, translating multi-part assemblies into laser-ready cut files and validating fit, tolerances, and cost/quality through iterative physical builds.',
      'Evaluated and coordinated external vendors across <strong>laser cutting, 3D printing, packaging, and manufacturing</strong> processes, assessing supplier capabilities and quotations while gaining end-to-end exposure to sourcing and pre-production operations.',
    ],
    card: {
      kind: 'photo',
      label: 'SmartoKids · Prototype',
      big: '10+ products',
      img: smartokidsPrototypeImg,
      alt: 'SmartoKids production floor — stacks of laser-cut animal puzzle boards fresh off the die, with cut-sheet waste in the foreground',
    },
  },
]

const mountRef = ref<HTMLElement | null>(null)
let teardown: (() => void) | null = null

onMounted(() => {
  const mount = mountRef.value
  if (!mount) return

  const P = CORPORATE_PROJECTS
  const N = P.length
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const AUTOPLAY = 5200

  let current = 0
  let animating = false
  let animTimer: ReturnType<typeof setTimeout> | null = null
  let inView = false
  let hovered = false
  let autoId: ReturnType<typeof setInterval> | null = null
  let progressTween: gsap.core.Tween | null = null
  let currentLayer: HTMLElement | null = null
  let titleRoll: gsap.core.Timeline | null = null
  let activeVizCard: HTMLElement | null = null
  let attractTimer: number | null = null

  const el = (tag: string, cls?: string | null, html?: string) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (html !== undefined) n.innerHTML = html
    return n
  }

  /* ── skeleton ── */
  const stage = el('div', 'cs-stage')

  const tint = el('div', 'cs-tint')
  const grain = el('div', 'cs-grain')

  const chrome = el('div', 'cs-chrome',
    '<span class="cs-eyebrow"><span class="bar"></span>Selected programs</span>' +
    '<span class="cs-counter"><span class="cs-cur">01</span><span>/ ' + String(N).padStart(2, '0') + '</span></span>')

  const body = el('div', 'cs-body')
  const left = el('div', 'cs-left',
    '<span class="cs-ghost" aria-hidden="true">01</span>' +
    '<div class="cs-left-dyn">' +
    '  <span class="cs-kicker"><span class="dot"></span><span class="cs-role-tag"></span> · <span class="cs-org"></span></span>' +
    '</div>' +
    '<h2 class="cs-title"></h2>' +
    '<div class="cs-left-dyn2">' +
    '  <p class="cs-when"></p>' +
    '  <p class="cs-role"></p>' +
    '  <ul class="cs-highlights"></ul>' +
    '</div>')

  const fan = el('div', 'cs-fan')
  const fanInner = el('div', 'cs-fan-inner')
  fan.appendChild(fanInner)
  body.appendChild(left)
  body.appendChild(fan)

  /* Foot rail — arrows, dots and a count hint read as ONE control cluster,
     left-aligned under the copy column. Parked apart (dots left / arrows far
     right) the arrows sat outside the reading path and were routinely missed. */
  const foot = el('div', 'cs-foot')
  const nav = el('div', 'cs-nav')

  const arrowSvg = (paths: string) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'
  const arrows = el('div', 'cs-arrows')
  const prevBtn = el('button', 'cs-arrow cs-arrow-prev',
    arrowSvg('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>')) as HTMLButtonElement
  prevBtn.type = 'button'; prevBtn.setAttribute('aria-label', 'Previous project')
  const nextBtn = el('button', 'cs-arrow cs-arrow-next',
    arrowSvg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>')) as HTMLButtonElement
  nextBtn.type = 'button'; nextBtn.setAttribute('aria-label', 'Next project')
  prevBtn.addEventListener('click', () => manualGo(current - 1))
  nextBtn.addEventListener('click', () => manualGo(current + 1))
  arrows.appendChild(prevBtn)
  arrows.appendChild(nextBtn)

  const dots = el('div', 'cs-dots')
  P.forEach((_, i) => {
    const d = el('button', 'cs-dot') as HTMLButtonElement
    d.type = 'button'
    d.setAttribute('aria-label', 'Go to project ' + (i + 1))
    d.innerHTML = '<span class="fill"></span>'
    d.addEventListener('click', () => { manualGo(i) })
    dots.appendChild(d)
  })

  // Says out loud that the section holds more than one slide — the fan alone
  // reads as decoration to a first-time viewer.
  const navHint = el('span', 'cs-nav-hint',
    '<b>' + String(N).padStart(2, '0') + '</b> programs — browse')

  nav.appendChild(arrows)
  nav.appendChild(dots)
  nav.appendChild(navHint)
  foot.appendChild(nav)

  stage.appendChild(tint)
  stage.appendChild(grain)
  stage.appendChild(chrome)
  stage.appendChild(body)
  stage.appendChild(foot)
  mount.appendChild(stage)

  const titleEl = left.querySelector<HTMLElement>('.cs-title')!
  const ghostEl = left.querySelector<HTMLElement>('.cs-ghost')!
  const roleTagEl = left.querySelector<HTMLElement>('.cs-role-tag')!
  const orgEl = left.querySelector<HTMLElement>('.cs-org')!
  const dyn2 = left.querySelector<HTMLElement>('.cs-left-dyn2')!
  const whenEl = left.querySelector<HTMLElement>('.cs-when')!
  const roleEl = left.querySelector<HTMLElement>('.cs-role')!
  const hlEl = left.querySelector<HTMLElement>('.cs-highlights')!
  const curEl = chrome.querySelector<HTMLElement>('.cs-cur')!
  const dotEls = Array.from(dots.children) as HTMLElement[]
  const dotFills = dotEls.map((d) => d.querySelector<HTMLElement>('.fill')!)

  /* ── animated viz graphics ──
     network = cross-functional: 5 teams feed data packets into a hub
     solo    = one owner orbited by 15 concurrent deliverables          */
  function buildViz(type: string) {
    const cx = 100, cy = 100
    if (type === 'network') {
      const r = 80, n = 5
      let spokes = '', nodes = '', packets = ''
      for (let i = 0; i < n; i++) {
        const a = (-90 + i * (360 / n)) * Math.PI / 180
        const x = +(cx + r * Math.cos(a)).toFixed(1)
        const y = +(cy + r * Math.sin(a)).toFixed(1)
        spokes += '<line class="vz-spoke" x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '"/>'
        nodes += '<circle class="vz-node" cx="' + x + '" cy="' + y + '" r="6.5"/>'
        packets += '<circle class="vz-packet" data-x="' + x + '" data-y="' + y + '" cx="' + x + '" cy="' + y + '" r="3.6"/>'
      }
      let pulses = ''
      for (let i = 0; i < 3; i++) pulses += '<circle class="vz-pulse" cx="' + cx + '" cy="' + cy + '" r="34"/>'
      return '<svg class="vz-svg vz-net" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<g class="vz-pulses">' + pulses + '</g>' +
        '<g class="vz-spokes">' + spokes + '</g>' +
        '<g class="vz-packets">' + packets + '</g>' +
        '<circle class="vz-ring" cx="' + cx + '" cy="' + cy + '" r="34"/>' +
        '<g class="vz-nodes">' + nodes + '</g>' +
        '</svg>'
    }
    // solo — orbital system (4 + 5 + 6 = 15 deliverables)
    const rings = [{ r: 44, n: 4, dir: 1, dur: 7 }, { r: 66, n: 5, dir: -1, dur: 10.5 }, { r: 88, n: 6, dir: 1, dur: 15 }]
    let guides = '', orbits = ''
    rings.forEach((g, gi) => {
      guides += '<circle class="vz-guide" cx="' + cx + '" cy="' + cy + '" r="' + g.r + '"/>'
      let sats = ''
      for (let i = 0; i < g.n; i++) {
        const a = (i * (360 / g.n)) * Math.PI / 180
        const x = +(cx + g.r * Math.cos(a)).toFixed(1)
        const y = +(cy + g.r * Math.sin(a)).toFixed(1)
        sats += '<circle class="vz-sat" cx="' + x + '" cy="' + y + '" r="' + (4.4 - gi * 0.5) + '"/>'
      }
      orbits += '<g class="vz-spin" data-dur="' + g.dur + '" data-dir="' + g.dir + '">' + sats + '</g>'
    })
    let pulses = ''
    for (let i = 0; i < 3; i++) pulses += '<circle class="vz-pulse" cx="' + cx + '" cy="' + cy + '" r="26"/>'
    return '<svg class="vz-svg vz-solo" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<g class="vz-pulses">' + pulses + '</g>' +
      '<g class="vz-guides">' + guides + '</g>' +
      '<g class="vz-orbit">' + orbits + '</g>' +
      '<circle class="vz-ring" cx="' + cx + '" cy="' + cy + '" r="28"/>' +
      '</svg>'
  }

  /* ── cards ── */
  const cards: HTMLElement[] = []
  function buildCard(p: CorporateProject) {
    const c = el('div', 'cs-card' + (p.card.kind === 'photo' ? ' cs-card-photo' : ''))
    if (p.card.kind === 'photo') {
      c.innerHTML =
        '<img class="cs-photo-img" src="' + p.card.img + '" alt="' + p.card.alt + '" loading="lazy" decoding="async"/>' +
        '<div class="cs-photo-label"><span>' + p.card.label + '</span><b>' + p.card.big + '</b></div>'
    } else {
      const chips = p.card.chips.map((t) => '<span class="cs-chip">' + t + '</span>').join('')
      const bignum = '<div class="big"><span class="cs-bignum" data-to="' + p.card.num + '">' + p.card.num + '</span>' + (p.card.unit ? '<span class="unit">' + p.card.unit + '</span>' : '') + '</div>'
      if (p.card.viz) {
        c.innerHTML =
          '<div class="cs-card-top"><span>' + p.card.tag + '</span><span class="num">' + p.num + '</span></div>' +
          '<div class="cs-metric cs-metric-viz">' +
          '<div class="cs-viz" data-viz="' + p.card.viz + '">' + buildViz(p.card.viz) + '</div>' +
          bignum +
          '</div>' +
          '<div class="cs-card-foot cs-foot-viz"><div class="cs-viz-sub">' + p.card.sub + '</div><div class="cs-viz-chips">' + chips + '</div></div>'
      } else {
        c.innerHTML =
          '<div class="cs-card-top"><span>' + p.card.tag + '</span><span class="num">' + p.num + '</span></div>' +
          '<div class="cs-metric">' + bignum + '<div class="sub">' + p.card.sub + '</div></div>' +
          '<div class="cs-card-foot">' + chips + '</div>'
      }
    }
    return c
  }
  P.forEach((p) => { const c = buildCard(p); fanInner.appendChild(c); cards.push(c) })

  /* ── diagonal fan geometry (wraps so the fan always looks full) ── */
  const POS = [
    { x: -0.34, y: -0.86, rot: -24, s: 0.6,  b: 9, o: 0 },
    { x: -0.17, y: -0.44, rot: -12, s: 1.06, b: 4, o: 0.62 },
    { x: 0.00,  y: 0.00,  rot: 0,   s: 1.00, b: 0, o: 1 },
    { x: -0.06, y: 0.44,  rot: 12,  s: 0.78, b: 4, o: 0.62 },
    { x: -0.12, y: 0.86,  rot: 24,  s: 0.6,  b: 9, o: 0 },
  ]
  function wrapStep(i: number) {
    let d = i - current
    const half = N / 2
    while (d > half) d -= N
    while (d < -half) d += N
    return Math.max(-2, Math.min(2, d))
  }
  /* Fan spacing unit. Was the fan COLUMN height, which meant the neighbour
     cards were flung a fixed fraction of the viewport away — on a tall or
     wide screen they landed outside the clipped stage and read as a card
     sliced by the bottom edge. Deriving it from the card itself (and capping
     at half the column) keeps the whole fan inside frame at every size. */
  function fanH() {
    const colH = fanInner.offsetHeight || (window.innerHeight * 0.6)
    const cardH = cards[0]?.offsetHeight || colH * 0.6
    return Math.min(cardH * 1.05, colH * 0.5)
  }
  function propsForStep(step: number) {
    const h = fanH()
    const p = POS[step + 2]
    return {
      x: p.x * h, y: p.y * h, rotation: p.rot, scale: p.s,
      blur: p.b, opacity: p.o,
      zIndex: step === 0 ? 5 : Math.abs(step) === 1 ? 3 : 1,
    }
  }
  function setCard(card: HTMLElement, step: number, animate: boolean) {
    const pr = propsForStep(step)
    const vars = {
      xPercent: -50, yPercent: -50, x: pr.x, y: pr.y,
      rotation: pr.rotation, scale: pr.scale, opacity: pr.opacity,
      filter: 'blur(' + pr.blur + 'px)', zIndex: pr.zIndex,
    }
    if (animate && !REDUCED) {
      gsap.to(card, Object.assign({ duration: 1.05, ease: 'power3.inOut', overwrite: 'auto' as const }, vars))
    } else {
      gsap.set(card, vars)
    }
  }
  function layoutFan(animate: boolean) {
    cards.forEach((c, i) => {
      const step = wrapStep(i)
      setCard(c, step, animate)
      c.classList.toggle('is-active', step === 0)
    })
  }

  /* ── count-up on the active metric number ── */
  function countUp(card: HTMLElement | undefined) {
    if (!card) return
    const numEl = card.querySelector<HTMLElement>('.cs-bignum')
    if (!numEl) return
    const to = parseFloat(numEl.getAttribute('data-to') || '')
    if (isNaN(to)) return
    if (REDUCED) { numEl.textContent = String(to); return }
    const obj = { v: 0 }
    gsap.killTweensOf(obj)
    gsap.to(obj, {
      v: to, duration: 1.15, ease: 'power2.out',
      onUpdate: () => { numEl.textContent = String(Math.round(obj.v)) },
    })
  }

  /* ── animated viz (cross-functional network / solo orbital) ── */
  type VizCard = HTMLElement & { _vizLoops?: gsap.core.Animation[] | null }
  function stopViz(card: VizCard | null) {
    if (!card) return
    if (card._vizLoops) { card._vizLoops.forEach((t) => t.kill()); card._vizLoops = null }
    const svg = card.querySelector('.vz-svg')
    if (!svg) return
    gsap.killTweensOf(svg.querySelectorAll('*'))
    // resting state: structure visible, the active-only motion bits hidden
    const setAll = (sel: string, vars: gsap.TweenVars) => { const els = svg.querySelectorAll(sel); if (els.length) gsap.set(els, vars) }
    setAll('.vz-spoke', { strokeDashoffset: 0, opacity: 0.6 })
    setAll('.vz-node, .vz-sat, .vz-guide', { opacity: 1, scale: 1 })
    setAll('.vz-packet, .vz-pulse', { opacity: 0 })
    setAll('.vz-spin', { rotation: 0, svgOrigin: '100 100' })
    const ring = svg.querySelector('.vz-ring')
    if (ring) gsap.set(ring, { opacity: 1, scale: 1 })
  }
  function animateViz(card: VizCard) {
    const svg = card.querySelector<SVGSVGElement>('.vz-svg')
    if (!svg || REDUCED) return // CSS default = resting visible state
    if (card._vizLoops) { card._vizLoops.forEach((t) => t.kill()); card._vizLoops = null }
    gsap.killTweensOf(svg.querySelectorAll('*'))
    const ring = svg.querySelector('.vz-ring')
    const pulses = [...svg.querySelectorAll('.vz-pulse')]
    const loops: gsap.core.Animation[] = []

    // shared: hub sonar pulses + breathing ring
    pulses.forEach((pl, i) => {
      const r0 = +(pl.getAttribute('r') || 0)
      loops.push(gsap.fromTo(pl,
        { attr: { r: r0 }, opacity: 0.85 },
        { attr: { r: 98 }, opacity: 0, duration: 2.4, ease: 'power1.out', repeat: -1, delay: 0.3 + i * 0.8 }))
    })
    if (ring) {
      gsap.set(ring, { transformOrigin: '50% 50%', svgOrigin: '100 100' })
      loops.push(gsap.fromTo(ring, { scale: 1, opacity: 1 },
        { scale: 1.13, opacity: 0.55, duration: 1.8, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.7 }))
    }

    if (svg.classList.contains('vz-net')) {
      const spokes = [...svg.querySelectorAll<SVGLineElement>('.vz-spoke')]
      const nodes = [...svg.querySelectorAll('.vz-node')]
      const packets = [...svg.querySelectorAll<SVGCircleElement>('.vz-packet')]
      const lens = spokes.map((l) => l.getTotalLength())
      spokes.forEach((l, i) => { l.style.strokeDasharray = String(lens[i]) })
      const tl = gsap.timeline()
      tl.fromTo(spokes, { strokeDashoffset: (i: number) => lens[i], opacity: 0 },
        { strokeDashoffset: 0, opacity: 0.5, duration: 0.6, stagger: 0.06, ease: 'power2.out' }, 0)
      tl.fromTo(nodes, { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
        { scale: 1, opacity: 1, duration: 0.5, stagger: 0.07, ease: 'back.out(2.4)' }, 0.18)
      if (ring) tl.fromTo(ring, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.1)
      // data packets stream from each team node into the hub
      packets.forEach((pk, i) => {
        const x = +(pk.dataset.x || 0), y = +(pk.dataset.y || 0)
        const ptl = gsap.timeline({ repeat: -1, repeatDelay: 0.15, delay: 0.6 + i * 0.16 })
        ptl.set(pk, { attr: { cx: x, cy: y, r: 3.6 }, opacity: 0 })
          .to(pk, { opacity: 1, duration: 0.18 }, 0)
          .to(pk, { attr: { cx: 100, cy: 100, r: 2 }, duration: 1.0, ease: 'power2.in' }, 0)
          .to(pk, { opacity: 0, duration: 0.2 }, '-=0.22')
        loops.push(ptl)
      })
      loops.push(gsap.to(nodes, { attr: { r: 8.5 }, opacity: 0.6, duration: 1.0, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.6, stagger: { each: 0.14, from: 'random' } }))
    } else {
      const guides = [...svg.querySelectorAll('.vz-guide')]
      const sats = [...svg.querySelectorAll('.vz-sat')]
      const spins = [...svg.querySelectorAll<SVGGElement>('.vz-spin')]
      const tl = gsap.timeline()
      tl.fromTo(guides, { scale: 0, opacity: 0, transformOrigin: '50% 50%', svgOrigin: '100 100' },
        { scale: 1, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' }, 0)
      tl.fromTo(sats, { scale: 0, opacity: 0, transformOrigin: '50% 50%' },
        { scale: 1, opacity: 1, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' }, 0.2)
      if (ring) tl.fromTo(ring, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'power3.out' }, 0.1)
      // continuous orbit — each ring spins at its own speed/direction
      spins.forEach((g) => {
        const dur = +(g.dataset.dur || 8), dir = +(g.dataset.dir || 1)
        loops.push(gsap.fromTo(g, { rotation: 0, svgOrigin: '100 100' },
          { rotation: 360 * dir, duration: dur, ease: 'none', repeat: -1 }))
      })
      loops.push(gsap.to(sats, { opacity: 0.45, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.7, stagger: { each: 0.1, from: 'random' } }))
    }
    card._vizLoops = loops
  }
  function handleViz(idx: number) {
    const card = cards[idx] as VizCard
    if (activeVizCard && activeVizCard !== card) stopViz(activeVizCard as VizCard)
    if (card && card.querySelector('.cs-viz')) { animateViz(card); activeVizCard = card }
    else activeVizCard = null
  }

  /* ── rolling title — two layers stacked in one grid cell ── */
  function buildLayer(text: string) {
    const layer = el('div', 'cs-layer')
    text.split(' ').forEach((word, wi, arr) => {
      const w = el('span', 'cs-w')
      const inner = el('span')
      inner.textContent = word
      w.appendChild(inner)
      layer.appendChild(w)
      if (wi < arr.length - 1) layer.appendChild(document.createTextNode(' '))
    })
    return layer
  }
  function setTitle(text: string) {
    titleEl.innerHTML = ''
    currentLayer = buildLayer(text)
    titleEl.appendChild(currentLayer)
  }
  function rollTitle(text: string, dir: number) {
    if (REDUCED) { setTitle(text); return }
    const d = dir >= 0 ? 1 : -1
    // Kill any in-flight title animation and purge orphaned layers so a
    // roll triggered mid-roll (dot-jump / rapid arrows / autoplay race)
    // can never leave a stale layer visible behind the new one.
    if (titleRoll) { titleRoll.kill(); titleRoll = null }
    gsap.killTweensOf(titleEl.querySelectorAll('.cs-w > span'))
    ;[...titleEl.querySelectorAll('.cs-layer')].forEach((l) => {
      if (l !== currentLayer) l.remove()
    })
    const oldLayer = currentLayer
    const oldChars = oldLayer ? [...oldLayer.querySelectorAll('.cs-w > span')] : []
    const newLayer = buildLayer(text)
    titleEl.appendChild(newLayer)
    const newChars = [...newLayer.querySelectorAll('.cs-w > span')]
    gsap.set(newChars, { yPercent: 118 * d })
    currentLayer = newLayer
    // Cleanup keeps ONLY the layer currently shown. Driven by both the
    // timeline onComplete AND a timeout safety-net, so a stale layer is
    // removed even if the gsap callback is pre-empted by a chained roll.
    const cleanup = () => {
      ;[...titleEl.querySelectorAll('.cs-layer')].forEach((l) => {
        if (l !== currentLayer) l.remove()
      })
    }
    titleRoll = gsap.timeline({
      onComplete: () => { cleanup(); titleRoll = null },
    })
      .to(oldChars, { yPercent: -118 * d, duration: 0.72, stagger: 0.02, ease: 'power3.inOut' }, 0)
      .to(newChars, { yPercent: 0, duration: 0.72, stagger: 0.02, ease: 'power3.inOut' }, 0)
    setTimeout(cleanup, 1100)
  }

  /* ── per-project content ── */
  function setMeta(p: CorporateProject) {
    roleTagEl.textContent = (p.card.kind === 'metric' && p.card.tag) ? p.card.tag : p.role
    orgEl.textContent = p.org
    whenEl.textContent = p.when
    roleEl.textContent = p.role
    hlEl.innerHTML = p.highlights.map((h) => '<li>' + h + '</li>').join('')
    ghostEl.textContent = p.num
  }
  function setChrome(idx: number) {
    curEl.textContent = String(idx + 1).padStart(2, '0')
  }
  function morphBg(p: CorporateProject) {
    if (!REDUCED) gsap.to(tint, { backgroundColor: p.color, duration: 1.1, ease: 'power2.inOut' })
    else tint.style.backgroundColor = p.color
  }
  function setDots(idx: number) {
    dotEls.forEach((dt, i) => dt.classList.toggle('is-active', i === idx))
    gsap.set(dotFills, { scaleX: 0 })
    runProgress(idx)
  }
  function runProgress(idx: number) {
    if (REDUCED) return
    if (progressTween) progressTween.kill()
    progressTween = gsap.fromTo(dotFills[idx], { scaleX: 0 }, {
      scaleX: 1, duration: AUTOPLAY / 1000, ease: 'none',
    })
    if (hovered || !inView) progressTween.pause()
  }

  /* ── transition ── */
  function go(idx: number, dir?: number) {
    idx = ((idx % N) + N) % N
    if (idx === current && currentLayer) return
    if (dir === undefined) dir = 1
    current = idx
    const p = P[idx]
    animating = true
    // Safety net: never let the lock latch if a gsap onComplete is killed/
    // overwritten mid-transition. Reset each go() so it can't clear a newer one.
    if (animTimer) clearTimeout(animTimer)
    animTimer = setTimeout(() => { animating = false }, 1200)
    setChrome(idx)
    morphBg(p)
    layoutFan(true)
    countUp(cards[idx])
    handleViz(idx)
    rollTitle(p.name, dir)
    setDots(idx)
    if (!REDUCED) {
      gsap.to(dyn2, { autoAlpha: 0, y: -10, duration: 0.26, ease: 'power2.in', onComplete: () => {
        setMeta(p)
        gsap.fromTo(dyn2, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', onComplete: () => { animating = false } })
      } })
      gsap.fromTo(roleTagEl.parentNode as Element, { autoAlpha: 0.2 }, { autoAlpha: 1, duration: 0.5, ease: 'power2.out' })
    } else {
      setMeta(p)
      animating = false
    }
  }

  function manualGo(idx: number) {
    if (animating) return
    const dir = idx > current ? 1 : -1
    restartAuto()
    go(idx, dir)
  }

  /* ── autoplay ── */
  function startAuto() {
    stopAuto()
    if (REDUCED) return
    autoId = setInterval(() => {
      if (!animating && inView && !hovered) go(current + 1, 1)
    }, AUTOPLAY)
    runProgress(current)
  }
  function stopAuto() { if (autoId) { clearInterval(autoId); autoId = null } }
  function restartAuto() { startAuto() }

  /* Autoplay holds only over the reading column and the controls. The stage is
     a full viewport tall, so pausing on stage-hover meant autoplay effectively
     never ran on desktop — the pointer is always somewhere inside it — and a
     slider that never advances gives a viewer no signal that more slides
     exist. Over the card fan it keeps cycling; that motion IS the signal. */
  const onEnter = () => { hovered = true; if (progressTween) progressTween.pause() }
  const onLeave = () => { hovered = false; if (progressTween && inView) progressTween.resume() }
  const pauseZones = [left, foot]
  pauseZones.forEach((z) => {
    z.addEventListener('mouseenter', onEnter)
    z.addEventListener('mouseleave', onLeave)
  })
  // Keyboard users get the same hold while focus sits inside the controls.
  foot.addEventListener('focusin', onEnter)
  foot.addEventListener('focusout', onLeave)

  /* ── init ── */
  setMeta(P[0])
  setTitle(P[0].name)
  setChrome(0)
  gsap.set(tint, { backgroundColor: P[0].color })
  layoutFan(false)
  dotEls[0].classList.add('is-active')

  let entered = false
  function applyInView(nowIn: boolean) {
    const was = inView
    inView = nowIn
    if (nowIn && !entered) {
      entered = true
      if (!REDUCED) {
        // opacity only — NOT autoAlpha: cards whose fan slot is opacity 0 would
        // end the tween at 0 and latch inline visibility:hidden, which the
        // opacity-only fan tweens never clear. layoutFan(false) re-asserts the
        // exact per-slot opacities once the entrance settles.
        gsap.from(cards, { y: 42, opacity: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out', delay: 0.1, onComplete: () => layoutFan(false) })
        if (currentLayer) gsap.from(currentLayer.querySelectorAll('.cs-w > span'), { yPercent: 118, duration: 0.7, stagger: 0.02, ease: 'power3.out' })
        gsap.from(dyn2, { autoAlpha: 0, y: 20, duration: 0.6, delay: 0.15, ease: 'power3.out' })
      }
      countUp(cards[current])
      handleViz(current)
      startAuto()
      // One-time ring pulse on the primary control so the cluster announces
      // itself the first time the section is reached, then goes quiet.
      if (!REDUCED) {
        nextBtn.classList.add('is-attract')
        attractTimer = window.setTimeout(() => nextBtn.classList.remove('is-attract'), 4600)
      }
    } else if (nowIn && !was) {
      startAuto()
      // Restart the active card's viz loops (killed on exit below).
      handleViz(current)
    } else if (!nowIn && was) {
      stopAuto()
      if (progressTween) progressTween.pause()
      // The viz loops are infinite gsap tweens (packet streams, orbit spins,
      // sonar pulses). Off-screen they'd keep mutating SVG attrs every frame
      // for the rest of the session — pure invisible work.
      if (activeVizCard) stopViz(activeVizCard as VizCard)
    }
  }

  let ioFired = false
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      ioFired = true
      applyInView(e.isIntersecting && e.intersectionRatio > 0.35)
    })
  }, { threshold: [0, 0.35, 0.7] })
  io.observe(stage)

  // Fallback: if the environment never delivers IO entries, drive the same
  // enter/leave logic from the stage rect so autoplay/entrance still run.
  function rectInView() {
    const r = stage.getBoundingClientRect()
    const vh = window.innerHeight || document.documentElement.clientHeight
    const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0)
    return r.height > 0 && visible / r.height > 0.35
  }
  function fallbackCheck() {
    if (!ioFired) applyInView(rectInView())
  }
  const fallbackTimer = setTimeout(fallbackCheck, 350)
  const onScrollFb = () => { if (!ioFired) requestAnimationFrame(fallbackCheck) }
  const onResizeFb = () => { if (!ioFired) fallbackCheck() }
  window.addEventListener('scroll', onScrollFb, { passive: true })
  window.addEventListener('resize', onResizeFb, { passive: true })

  const onResizeFan = () => { if (!animating) layoutFan(false) }
  window.addEventListener('resize', onResizeFan, { passive: true })
  const onKeydown = (e: KeyboardEvent) => {
    if (!inView || animating) return
    if (e.key === 'ArrowRight') { e.preventDefault(); manualGo(current + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); manualGo(current - 1) }
  }
  window.addEventListener('keydown', onKeydown)

  teardown = () => {
    io.disconnect()
    clearTimeout(fallbackTimer)
    if (animTimer) clearTimeout(animTimer)
    if (attractTimer) clearTimeout(attractTimer)
    stopAuto()
    if (progressTween) progressTween.kill()
    if (titleRoll) titleRoll.kill()
    window.removeEventListener('scroll', onScrollFb)
    window.removeEventListener('resize', onResizeFb)
    window.removeEventListener('resize', onResizeFan)
    window.removeEventListener('keydown', onKeydown)
    pauseZones.forEach((z) => {
      z.removeEventListener('mouseenter', onEnter)
      z.removeEventListener('mouseleave', onLeave)
    })
    foot.removeEventListener('focusin', onEnter)
    foot.removeEventListener('focusout', onLeave)
    cards.forEach((c) => stopViz(c as VizCard))
    gsap.killTweensOf(stage.querySelectorAll('*'))
    mount.innerHTML = ''
  }
})

onBeforeUnmount(() => { teardown?.(); teardown = null })
</script>

<template>
  <div ref="mountRef" class="cs-mount"></div>
</template>

<!-- Unscoped on purpose: the stage DOM is built at runtime, so scoped data
     attrs would never land on it. All classes are cs-*/vz-* prefixed. -->
<style>
.cs-stage {
  position: relative;
  /* The topbar is sticky, so a full 100dvh stage always loses its top rail
     behind the bar — the eyebrow/counter were never visible when the slide
     was scrolled into place. Fit the stage to the space BELOW the bar so one
     screen means one screen. */
  height: calc(100vh - var(--topbar-h));
  height: calc(100dvh - var(--topbar-h));
  min-height: 560px;
  max-height: 1000px;
  overflow: hidden;
  /* Rails in flow, not floating over the copy. The old absolute chrome/foot
     forced the body to reserve their height in padding — a guess that broke
     at short viewports (the kicker slid under the top rail at 720px tall).
     Three rows make the copy row exactly the leftover space, always. */
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #0E1109;
  color: #F2F3EC;
  isolation: isolate;
}


/* ── color-morph wash ── */
.cs-tint {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-color: #14180E;
  mix-blend-mode: multiply;
  pointer-events: none;
}
.cs-grain {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600' preserveAspectRatio='none'><g fill='none' stroke='%23DBFE52' stroke-width='0.6' opacity='0.14'><path d='M0,90 C120,40 220,150 320,100 C420,50 520,150 600,100'/><path d='M0,210 C140,170 240,280 360,230 C480,180 540,270 600,230'/><path d='M0,330 C120,290 240,410 360,350 C480,290 560,410 600,350'/><path d='M0,450 C120,490 220,390 340,470 C460,550 540,410 600,470'/></g></svg>");
  background-size: 1100px 1100px;
  opacity: 0.55;
  mix-blend-mode: screen;
  pointer-events: none;
}

/* ── chrome (top rail) ── */
.cs-chrome {
  position: relative;
  grid-row: 1;
  z-index: 6;
  padding: clamp(1.4rem, 3.4vh, 2.2rem) var(--gutter-x);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.cs-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  font: 500 0.66rem/1 var(--f-mono);
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.66);
}
.cs-eyebrow .bar { width: 26px; height: 2px; background: var(--accent); }
.cs-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  font: 500 0.72rem/1 var(--f-mono);
  letter-spacing: 0.12em;
  color: rgba(242,243,236,0.5);
}
.cs-counter .cs-cur {
  font-weight: 700;
  font-size: 1.6rem;
  letter-spacing: -0.02em;
  color: #F2F3EC;
}

/* ── body grid ── */
.cs-body {
  position: relative;
  grid-row: 2;
  z-index: 4;
  min-height: 0;
  /* Verbatim résumé bullets are the widest content on the page. The copy
     column takes the larger share; the card fan is a supporting graphic, not
     a co-equal half.
     LEFT-ANCHORED, not centred. A centred 1560px box put the slide title at
     x=558 on a 2560px monitor while every other section title sat at x=64 —
     the section read as misaligned against Academic Projects right above it.
     Each column is now capped in px as well as %, so the pair packs from the
     left gutter and the fan stays glued to the copy instead of drifting into
     the middle of an ultrawide stage. */
  display: grid;
  grid-template-columns: minmax(0, min(61%, 1040px)) minmax(0, min(39%, 660px));
  justify-content: start;
  align-items: center;
  gap: clamp(1rem, 2.6vw, 2.6rem);
  padding: clamp(0.9rem, 2.6vh, 2.4rem) var(--gutter-x) clamp(0.9rem, 2.6vh, 2.4rem);
}
@media (max-width: 900px) {
  .cs-body {
    grid-template-columns: 1fr;
    align-content: center;
    gap: clamp(1.5rem, 4vh, 2.5rem);
  }
}

/* ── left column ── */
.cs-left {
  position: relative;
  z-index: 5;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(0.85rem, 1.8vh, 1.3rem);
}
/* ghost index number behind the title */
.cs-ghost {
  position: absolute;
  z-index: -1;
  top: clamp(-1.6rem, -2.6vh, -0.8rem);
  left: clamp(-0.6rem, -1vw, -0.3rem);
  font: 900 clamp(5.5rem, 12vw, 11rem)/0.8 var(--f-sans);
  letter-spacing: -0.06em;
  color: transparent;
  -webkit-text-stroke: 1.5px rgba(242,243,236,0.10);
  pointer-events: none;
  user-select: none;
}
.cs-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  white-space: nowrap;
  font: 500 0.64rem/1.4 var(--f-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.6);
}
.cs-kicker .dot { width: 7px; height: 7px; background: var(--accent); flex-shrink: 0; }
.cs-kicker .cs-org { color: var(--accent); }

/* rolling title — two layers stack in one grid cell (no height math) */
.cs-title {
  display: grid;
  /* Sized for the longest résumé project title (76 chars) — at the old 3.9rem
     it ran four display lines and pushed the highlights under the foot rail. */
  font: 900 clamp(1.55rem, 2.5vw, 2.55rem)/1.04 var(--f-sans);
  letter-spacing: -0.03em;
  text-transform: uppercase;
  text-wrap: balance;
  color: #F2F3EC;
}
.cs-title .cs-layer {
  grid-area: 1 / 1;
}
.cs-title .cs-w {
  display: inline-block;
  overflow: hidden;
  vertical-align: top;
  white-space: nowrap;
}
.cs-title .cs-w > span {
  display: inline-block;
  will-change: transform;
}

.cs-when {
  font: 500 0.76rem/1.4 var(--f-mono);
  letter-spacing: 0.05em;
  color: rgba(242,243,236,0.55);
}
.cs-role {
  font: 600 0.86rem/1.4 var(--f-sans);
  color: rgba(242,243,236,0.82);
}
.cs-highlights {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 70ch;
}
/* Wide screens: the résumé bullets run 200–390 chars each, so a single
   column costs ~24 line-boxes and can't clear the foot rail inside one
   screen. Two balanced columns halve the height AND put the widescreen
   dead space to work — each column still lands in the 45–60ch band. */
@media (min-width: 1240px) {
  .cs-highlights {
    display: block;
    max-width: none;
    columns: 2;
    column-gap: clamp(1.6rem, 2.2vw, 2.6rem);
    column-fill: balance;
  }
  .cs-highlights li { break-inside: avoid; margin-bottom: 0.62rem; }
  .cs-highlights li:last-child { margin-bottom: 0; }
}
.cs-highlights li {
  position: relative;
  padding-left: 1.4rem;
  font: 400 clamp(0.78rem, 0.9vw, 0.9rem)/1.55 var(--f-sans);
  color: rgba(242,243,236,0.72);
  text-wrap: pretty;
}
.cs-highlights li::before {
  content: '';
  position: absolute;
  left: 0; top: 0.62em;
  width: 13px; height: 1px;
  background: var(--accent);
  opacity: 0.85;
}
.cs-highlights li strong { color: #F2F3EC; font-weight: 600; }
@media (max-width: 900px) {
  .cs-highlights li:nth-child(n+3) { display: none; }
}

/* ── right column: diagonal card fan ── */
.cs-fan {
  position: relative;
  height: 100%;
  min-height: 300px;
}
@media (max-width: 900px) {
  .cs-fan { min-height: 42vh; order: 2; }
}
.cs-fan-inner { position: absolute; inset: 0; }

.cs-card {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  /* Height-aware: on short viewports a width-only clamp produced a card
     taller than its own column. */
  width: min(clamp(200px, 74%, 380px), 42vh);
  aspect-ratio: 1.02;
  will-change: transform, filter, opacity;
  contain: layout style;
  background: linear-gradient(158deg, #39432A 0%, #232B18 100%);
  border: 1.5px solid rgba(242,243,236,0.28);
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: clamp(1.1rem, 2.2vw, 1.7rem);
  box-shadow: 0 28px 70px -28px rgba(0,0,0,0.7);
}
.cs-card.is-active {
  z-index: 10 !important;
  border: 2.5px solid var(--accent);
  background: linear-gradient(158deg, #47542F 0%, #2C3620 100%);
  box-shadow: 0 44px 120px -30px rgba(0,0,0,0.85), 0 0 0 2px var(--accent), 0 0 64px -2px rgba(219,254,82,0.6);
}
.cs-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(-45deg, transparent 0, transparent 26px, rgba(242,243,236,0.022) 26px, rgba(242,243,236,0.022) 52px);
  pointer-events: none;
}
.cs-card-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  white-space: nowrap;
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.52);
  z-index: 1;
}
.cs-card-top .num { color: var(--accent); }
.cs-metric { align-self: center; z-index: 1; }
.cs-metric .big {
  font: 900 clamp(2rem, 4.2vw, 3.3rem)/0.9 var(--f-sans);
  letter-spacing: -0.04em;
  color: #F2F3EC;
}
.cs-metric .big .unit { color: var(--accent); }
.cs-metric .sub {
  margin-top: 0.45rem;
  font: 500 0.7rem/1.4 var(--f-mono);
  letter-spacing: 0.03em;
  color: rgba(242,243,236,0.6);
  max-width: 26ch;
}

/* ── radial viz: metric number becomes the hub of an animated diagram ── */
.cs-metric-viz {
  align-self: stretch;
  position: relative;
  display: grid;
  place-items: center;
  /* The viz row is the card's 1fr. Without min-height:0 the row floors at the
     square viz's content size, which pushed the sub + chips past the bottom of
     a ratio-sized card — clipped by overflow:hidden, so the chips just vanished
     (1024x768 lost 128px of card). Zero here lets the row take what's left
     after the header and foot, and the viz below sizes itself to that. */
  min-height: 0;
}
.cs-metric-viz > * { grid-area: 1 / 1; place-self: center; }
.cs-metric-viz .big { position: relative; z-index: 2; font-size: clamp(2.2rem, 4vw, 3.2rem); }
.cs-viz {
  position: relative;
  z-index: 0;
  /* Height-driven: the square is whatever the leftover row gives it, so the
     diagram shrinks instead of the chips disappearing. max-width is a guard
     for cards short enough that the row is taller than the card is wide. */
  height: 100%;
  width: auto;
  max-width: min(112%, 280px);
  aspect-ratio: 1;
  justify-self: center;
  align-self: center;
  pointer-events: none;
}
.cs-viz .vz-svg { width: 100%; height: 100%; display: block; overflow: visible; }
.vz-spoke {
  stroke: rgba(219,254,82,0.65);
  stroke-width: 1.5;
  opacity: 0.6;
  stroke-linecap: round;
}
.vz-node {
  fill: var(--accent);
  filter: drop-shadow(0 0 6px rgba(219,254,82,0.95));
}
.vz-packet {
  fill: #FCFFE6;
  filter: drop-shadow(0 0 7px rgba(219,254,82,1));
  opacity: 0;
}
.vz-pulse {
  fill: none;
  stroke: rgba(219,254,82,0.7);
  stroke-width: 2.5;
  opacity: 0;
}
.vz-guide {
  fill: none;
  stroke: rgba(219,254,82,0.3);
  stroke-width: 1.2;
}
.vz-sat {
  fill: var(--accent);
  filter: drop-shadow(0 0 6px rgba(219,254,82,0.95));
}
.vz-ring {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.8;
  filter: drop-shadow(0 0 9px rgba(219,254,82,0.75));
}

.cs-card-foot.cs-foot-viz {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
}
.cs-foot-viz .cs-viz-sub {
  font: 500 0.7rem/1.4 var(--f-mono);
  letter-spacing: 0.03em;
  color: rgba(242,243,236,0.6);
  max-width: 30ch;
}
.cs-foot-viz .cs-viz-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.cs-card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  z-index: 1;
}
.cs-chip {
  font: 500 0.55rem/1 var(--f-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  padding: 0.3rem 0.45rem;
  border: 1px solid rgba(242,243,236,0.2);
  color: rgba(242,243,236,0.68);
}

/* photo card variant (SmartoKids) */
.cs-card.cs-card-photo { padding: 0; grid-template-rows: 1fr; }
.cs-card.cs-card-photo .cs-photo-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cs-card.cs-card-photo .cs-photo-label {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 2;
  padding: 1.5rem 1.1rem 1rem;
  background: linear-gradient(180deg, transparent, rgba(8,9,5,0.9));
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(242,243,236,0.85);
}
.cs-card.cs-card-photo .cs-photo-label b { color: var(--accent); font-weight: 600; }

/* ── foot rail: one left-aligned control cluster ── */
.cs-foot {
  position: relative;
  grid-row: 3;
  z-index: 6;
  padding: clamp(0.3rem, 1vh, 0.9rem) var(--gutter-x) clamp(1.3rem, 3.2vh, 2.2rem);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;
}
.cs-nav {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: clamp(0.75rem, 1.7vw, 1.35rem);
}
.cs-dots { display: inline-flex; gap: 0.5rem; }
.cs-dot {
  width: 30px;
  height: 3px;
  background: rgba(242,243,236,0.2);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.3s ease;
}
.cs-dot:hover { background: rgba(242,243,236,0.34); }
/* The dot is a 3px-tall rule by design — a 30x3 tap target. Hang an invisible
   40px-tall box off it so a thumb can land on it; the visual is untouched.
   overflow has to go back to visible for the box to escape the rule (.fill is
   inset:0 and only ever scaleX(≤1), so nothing else was relying on the clip). */
.cs-dot { overflow: visible; }
.cs-dot::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 40px;
  transform: translateY(-50%);
}
.cs-dot .fill {
  position: absolute;
  inset: 0;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
}
.cs-arrows { display: inline-flex; gap: 0.55rem; }
.cs-arrow {
  width: 52px; height: 52px;
  /* 1px at 28% on a dark stage reads as trim, not a control. */
  border: 1.5px solid rgba(242,243,236,0.55);
  background: rgba(9,11,6,0.32);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #F2F3EC;
  cursor: pointer;
  transition: border-color 0.25s ease, background 0.25s ease, color 0.25s ease,
    transform 0.25s ease;
}
.cs-arrow svg { width: 20px; height: 20px; display: block; }
.cs-arrow:hover { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); transform: translateY(-2px); }
.cs-arrow:active { transform: translateY(0) scale(0.96); }
.cs-arrow:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* Forward is the primary affordance — filled so the cluster can't be mistaken
   for decoration at a glance. Back stays outlined (secondary). */
.cs-arrow-next {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}
.cs-arrow-next:hover { background: #E9FF7E; border-color: #E9FF7E; }
.cs-arrow-next.is-attract { animation: cs-attract 1.5s ease-out 3; }
@keyframes cs-attract {
  0%   { box-shadow: 0 0 0 0 rgba(219,254,82,0.55); }
  65%  { box-shadow: 0 0 0 18px rgba(219,254,82,0); }
  100% { box-shadow: 0 0 0 0 rgba(219,254,82,0); }
}

.cs-nav-hint {
  font: 500 0.64rem/1 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(242,243,236,0.62);
}
.cs-nav-hint b { color: var(--accent); font-weight: 700; letter-spacing: 0.1em; }

@media (prefers-reduced-motion: reduce) {
  .cs-arrow-next.is-attract { animation: none; }
}

@media (max-width: 820px) {
  .cs-nav-hint { display: none; }
}
@media (max-width: 640px) {
  .cs-arrow { width: 46px; height: 46px; }
  .cs-arrow svg { width: 18px; height: 18px; }
  .cs-dot { width: 22px; }
  .cs-ghost { display: none; }
}

/* ── short-viewport compaction ──
   Lives at the END of the sheet on purpose: these are same-specificity
   overrides of the base rules above, so source order is what makes them
   win. Parked at the top (where they used to be) they were silently dead. */
/* Short / landscape viewports: compact the in-stage chrome (all inside the
   definite-height, overflow-clipped stage) so the centered card is visible
   without scrolling. */
@media (max-height: 800px) {
  .cs-chrome {
    padding-top: clamp(0.8rem, 2vh, 1.3rem);
  }
  .cs-ghost { display: none; }
  .cs-left { gap: clamp(0.5rem, 1.1vh, 0.9rem); }
  .cs-title { line-height: 1; }
  .cs-highlights { margin-top: 0; }
  /* Tighter bullet rhythm buys back the vertical the verbatim copy costs,
     without dropping below the 1.45 line-height readability floor. */
  .cs-highlights { gap: 0.4rem; }
  .cs-highlights li { line-height: 1.45; margin-bottom: 0.36rem; }
}
/* Short AND wide (13" laptops in landscape): the vertical is the scarce axis,
   so buy copy width back from the card column — a wider measure costs the
   bullets fewer lines, which is the only real lever left down here. */
@media (max-height: 800px) and (min-width: 1240px) {
  .cs-body { grid-template-columns: minmax(0, min(68%, 1160px)) minmax(0, min(32%, 560px)); }
}

/* ── narrow viewports ──
   One column means the copy and the fan share the same vertical budget, so
   the card has to give ground or the stack overflows its row and slides
   under both rails. Also lifts the bullet size back up for phone reading. */
@media (max-width: 900px) {
  /* Content-sized, not ratio-sized. A square card can't hold the square viz
     plus a two-line sub plus three chips at one-column width: the 1.02 ratio
     put the content 140px past the box, and since the card is absolutely
     positioned and centred in the fan, that overflow went half up / half down
     — Chrome clipped the chips (overflow:hidden), Safari grew the box and
     parked it on top of the bullets above. Drop the ratio, cap the viz, and
     give the fan a floor tall enough for the tallest card. */
  .cs-fan { min-height: 340px; }
  .cs-card {
    width: min(78%, 320px);
    aspect-ratio: auto;
    min-height: 260px;
  }
  .cs-viz { max-width: min(100%, 168px); }
  .cs-metric-viz .big { font-size: clamp(2rem, 6vw, 2.6rem); }
}
@media (max-width: 640px) {
  /* Phones get an auto-height stage. Two verbatim résumé bullets, the title
     block and a card cannot share 100dvh at a phone measure — forcing them to
     clipped the copy under the rails. A slide that runs a little past one
     screen is the honest trade here; the section still opens full-height. */
  .cs-stage {
    height: auto;
    min-height: calc(100dvh - var(--topbar-h));
    max-height: none;
  }
  .cs-title { font-size: clamp(1.3rem, 5.4vw, 1.8rem); }
  .cs-highlights li { font-size: 0.84rem; line-height: 1.5; }
  /* Wider card at phone width = fewer chip rows = a shorter card. */
  .cs-fan { min-height: 320px; }
  .cs-card { width: min(88%, 300px); min-height: 240px; }
  .cs-viz { max-width: min(100%, 150px); }
}

/* ── phone legibility floor ──
   Mono labels authored for desktop viewing distance. .cs-chip at 0.55rem is
   8.8px — the three evidence chips under each metric are the card's proof,
   and they were the smallest type in the section. Size only; the tracking
   is what gives these their label shape. */
@media (max-width: 720px) {
  .cs-chip     { font-size: 0.66rem; }
  .cs-eyebrow  { font-size: 0.7rem; }
  .cs-kicker   { font-size: 0.7rem; }
  .cs-card-top { font-size: 0.68rem; letter-spacing: 0.16em; }
  .cs-card.cs-card-photo .cs-photo-label { font-size: 0.7rem; }
}
</style>
