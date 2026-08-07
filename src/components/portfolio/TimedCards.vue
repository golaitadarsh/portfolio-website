<script lang="ts" setup>
/* ============================================================
   TIMED CARDS — Academic Projects showcase (GSAP)
   Vue port of the design prototype's timed-cards.js engine.
   The stage DOM is built imperatively (same as the prototype)
   inside the mount ref; config lives in ACADEMIC_PROJECTS.
   status: 'live' → opens in new tab + live badge
           'soon' → CTA promotes the first artifact link
   ============================================================ */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import gsap from 'gsap'

import goKartImg from '../../../assets/projects/go-kart.jpg'
import pendulumImg from '../../../assets/projects/inverted-pendulum.jpg'
import ballOnBeamImg from '../../../assets/projects/ball-on-beam.jpg'
import oldhamImg from '../../../assets/projects/oldham-coupling.jpg'
import exoskeletonImg from '../../../assets/projects/exoskeleton.jpg'
import umbrellaImg from '../../../assets/projects/umbrella-holder.jpg'

interface ProjectLink { label: string; href: string }
interface AcademicProject {
  id: string
  num: string
  name: string
  title: string
  meta: string
  role: string
  tags: string[]
  bullets: string[]
  links: ProjectLink[]
  href: string
  status: 'live' | 'soon'
  img: string
}

const ACADEMIC_PROJECTS: AcademicProject[] = [
  {
    id: 'go-kart',
    num: '01',
    name: 'Go-Kart',
    title: 'Go-Kart, Concept-to-Drive Build of a Petrol Vehicle',
    meta: 'IITGN · Prof. Harish PM · Mar–Apr 2022 · Featured Build',
    role: '10-member team · full hardware lifecycle',
    tags: ['Welding', 'Lathe', 'CAD', 'Sourcing'],
    bullets: [
      `Took a petrol go-kart from blank slate to live drive as part of a 10-member team, executing the full hardware lifecycle across design, fabrication, sourcing, assembly, integration, and testing under real-world resource constraints.`,
      `Reverse-engineered a reference chassis and developed a parametric Fusion 360 model to validate geometry, clearances, and manufacturability before cutting metal, de-risking downstream execution and minimizing rework to accelerate assembly.`,
      `Fabricated the chassis from raw stock through cutting, welding, lathe and milling operations, while sourcing engines and critical components from across Delhi and local vendors and adapting the design to cost, availability, and fitment limitations.`,
      `Integrated steering, braking, throttle, and chain-driven powertrain subsystems and resolved system-level failures, including engine vibration and control-linkage issues, through iterative isolate-fix-retest cycles to deliver a fully functional vehicle.`,
    ],
    links: [
      { label: 'Project Video', href: 'https://drive.google.com/file/d/1ywxGPlD9dI2tRweamNH_gNEnGWtsXNB3/view?usp=sharing' },
      { label: 'Team', href: 'https://drive.google.com/file/d/1tHUv4p33o5MtHJyL4L_5K1UbzSbgrafH/view' },
    ],
    href: '#',
    status: 'soon',
    img: goKartImg,
  },
  {
    id: 'inverted-pendulum',
    num: '02',
    name: 'Inverted Pendulum',
    title: 'Energy-Efficient Control of an Inverted Pendulum',
    meta: 'IITGN · Prof. Madhu Vadali · Apr 2022',
    role: '4-member team · controls, system identification',
    tags: ['MATLAB', 'PID + feedforward', 'System ID', 'Laser-cut rig'],
    bullets: [
      `Took a motor-actuated inverted pendulum from concept to working prototype as part of a 4-member team, executing the full lifecycle across CAD design, fabrication, electronics integration, controller development, and live hardware validation.`,
      `Designed and fabricated a laser-cut test rig, iterating custom coupler designs and deliberately overbuilding the structure to ensure repeated control experiments isolated software and control failures from mechanical failures.`,
      `Designed constrained experiments to identify unknown system parameters by separately isolating electrical and mechanical dynamics, enabling the development of an energy-efficient two-stage controller that was validated on the physical rig.`,
      `Integrated mechanical, electronic, and software subsystems into a functioning closed-loop system and validated simulated behaviour against real-hardware response through iterative testing and tuning.`,
    ],
    links: [
      { label: 'Project Video', href: 'https://drive.google.com/file/d/1JoBnupwAd_gvdzfio9srCIoMLRYLAzc1/view' },
      { label: 'Report', href: 'https://drive.google.com/file/d/1fkPUp6bHTxHULA7tGd3fxiNw31WdLXKy/view' },
      { label: 'Testing Rig', href: 'https://drive.google.com/file/d/16yHCzBDirX8PIeAXZRM4cfcvIgk45CAs/view' },
    ],
    href: 'https://inverted-pendulum-two.vercel.app/',
    status: 'live',
    img: pendulumImg,
  },
  {
    id: 'ball-on-beam',
    num: '03',
    name: 'Ball on Beam',
    title: 'Ball on Beam — mechanism, hardware & closed-loop control',
    meta: 'IITGN · Prof. Harish PM · Jan 2022',
    role: 'Mechatronics · firmware · controller tuning',
    tags: ['Arduino', 'Closed-loop', 'Gear-sector drive', 'PID'],
    bullets: [
      `Designed the beam-tilting mechanism from first principles — evaluated linkage, direct-drive and gear-sector actuation against torque, speed and fabrication constraints before committing to a gear-sector drive, fabricated in laser-cut MDF.`,
      `Integrated a full mechatronic stack with no reference design — DC motor, driver, position sensor and Arduino — owning component selection, wiring and embedded firmware through to active closed-loop sensor feedback.`,
      `Diagnosed an actuator-speed mismatch threatening system viability — a 1000 RPM motor far beyond the controllable range; applied gear reduction and iterative calibration to bring the system into an operable range.`,
      `Characterised closed-loop performance across P and PD controllers and a sweep of gains — root-cause analysis isolated the binding constraint to the actuator ceiling, validating the control architecture.`,
    ],
    links: [
      { label: 'Project Video', href: 'https://drive.google.com/file/d/1FT_Wzwe9H6jTgkuAspJ2YjaYZ-4z4QHe/view' },
    ],
    href: '#',
    status: 'soon',
    img: ballOnBeamImg,
  },
  {
    id: 'oldham-coupling',
    num: '04',
    name: 'Oldham Coupling',
    title: 'Oldham coupling — CNC machining & variable offset system',
    meta: 'IITGN · Prof. Harish PM · Feb 2022',
    role: 'CNC + mechanism design',
    tags: ['CNC', 'Bearings', 'Acrylic + metal', 'Tolerance'],
    bullets: [
      `Owned end-to-end design of a functional Oldham coupling prototype — translated the three-disc mechanism into a fully integrated assembly of discs, shafts, bearings and structural frame interfacing under rotation.`,
      `Designed the variable-offset feature from first principles — slotted acrylic panels let the shaft position adjust continuously, demonstrating live torque transmission beyond the 15 mm spec.`,
      `Specified bearings at the shaft–panel interface to decouple rotation from the fixed acrylic frame — the key decision that eliminated binding and allowed smooth rotation independent of structural loads.`,
      `Iterated on coupling disc geometry and sliding clearances across multiple versions to resolve fit issues arising from tolerance mismatches between CNC-machined metal components and laser-cut acrylic panels.`,
    ],
    links: [
      { label: 'Project Image-1', href: 'https://drive.google.com/file/d/1I84sv3gypHiSbgT0E_j8CXTokQ4rwIKe/view' },
      { label: 'Project Image-2', href: 'https://drive.google.com/file/d/1HIvkyE4g3bxuhzvuUYffncRWfb9ItdH4/view' },
    ],
    href: '#',
    status: 'soon',
    img: oldhamImg,
  },
  {
    id: 'exoskeleton',
    num: '05',
    name: 'Shoulder Exoskeleton',
    title: 'Shoulder joint & Harmony exoskeleton — 5-DOF mechanism',
    meta: 'IITGN · Prof. Harish PM · Feb 2021',
    role: 'Anatomical mechanism · working prototype',
    tags: ['5-DOF', '3D print', 'Anatomical ROM'],
    bullets: [
      `Designed a 5-DOF shoulder exoskeleton mechanism that captured scapular rhythm — iterated joint geometry, linkage kinematics, and range-of-motion constraints through CAD across multiple configurations to balance mechanical complexity against anatomical fidelity; produced a working 3D-printed prototype validated through physical range-of-motion testing, with each design decision documented against the alternatives considered.`,
    ],
    links: [
      { label: 'CAD Model Demo', href: 'https://drive.google.com/file/d/1brWBERTa9KXhCcc-i8ntMxDyh_Oxmw5-/view' },
      { label: 'Prototype', href: 'https://drive.google.com/file/d/1G-dXtOLStOF7FJCXPODBiBZG-QkIXGLP/view' },
    ],
    href: '#',
    status: 'soon',
    img: exoskeletonImg,
  },
  {
    id: 'umbrella-holder',
    num: '06',
    name: 'Umbrella Holder',
    title: 'Umbrella holder for specially-abled individuals',
    meta: 'IITGN · Prof. Harish PM · Apr 2022',
    role: 'Anthropometric design · wearable mechanism',
    tags: ['Anthropometric', 'Wearable', 'Linear actuation'],
    bullets: [
      `Designed and fabricated a wearable, hands-free umbrella holder for individuals with limited arm mobility — applied anthropometric measurements to determine fit parameters across the target user population, created CAD, and fabricated a lightweight mechanism with guided linear actuation; iterated on stability and load distribution within strict weight and wearability constraints imposed by the intended use case.`,
    ],
    links: [
      { label: 'Project Video', href: 'https://drive.google.com/file/d/1PMKWuZQ9cRLqbe_ZWzoutWbLmvWdJXxK/view' },
    ],
    href: '#',
    status: 'soon',
    img: umbrellaImg,
  },
]

const mountRef = ref<HTMLElement | null>(null)
let teardown: (() => void) | null = null

onMounted(() => {
  const mount = mountRef.value
  if (!mount) return

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const AUTOPLAY_SECONDS = 6
  const CARD_GAP = 14

  const P = ACADEMIC_PROJECTS
  let order = P.map((_, i) => i)       // order[0] = active project
  let animating = false
  let autoplayDead = REDUCED
  let hovered = false
  let inView = false
  let started = false
  let progressTween: gsap.core.Tween | null = null

  const el = (tag: string, cls?: string | null, html?: string) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (html !== undefined) n.innerHTML = html
    return n
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function buildLinks(p: AcademicProject, target: HTMLElement, skipIndex?: number) {
    target.innerHTML = ''
    let shown = 0
    ;(p.links || []).forEach((lnk, i) => {
      if (i === skipIndex) return
      if (shown > 0) target.appendChild(el('span', 'tc-pipe', '|'))
      shown += 1
      const a = el('a') as HTMLAnchorElement
      a.href = lnk.href
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = lnk.label
      target.appendChild(a)
    })
  }

  // The primary artifact each project promotes onto its CTA button. For the
  // one deployed project this is its live site; every other project promotes
  // its first link (video / report / images) so the button is never a dead '#'.
  function buildActions(p: AcademicProject) {
    const soon = p.status !== 'live'
    const primary = (p.links && p.links.length) ? p.links[0] : null
    const wrap = el('div', 'tc-actions' + (soon ? ' is-soon' : ''))
    const a = el('a', 'tc-btn') as HTMLAnchorElement
    let label = 'View Project'
    let href = p.href || '#'
    if (!soon && href && href !== '#') {
      label = 'Visit Site'
    } else if (primary) {
      href = primary.href
      label = /video|demo/i.test(primary.label) ? 'Watch Demo'
            : /report/i.test(primary.label) ? 'Read Report'
            : /image/i.test(primary.label) ? 'View Images'
            : /cad|model/i.test(primary.label) ? 'View CAD'
            : 'View Project'
    }
    a.href = href
    a.setAttribute('data-project', p.id)
    a.innerHTML = '<span>' + label + '</span><span class="tc-btn-arrow">→</span>'
    if (href && href !== '#') {
      a.target = '_blank'
      a.rel = 'noopener'
    } else {
      a.addEventListener('click', (e) => e.preventDefault())
    }
    wrap.appendChild(a)
    wrap.appendChild(soon ? el('span', 'tc-demo-tag', 'Demo') : el('span', 'tc-live-badge', 'Live'))
    return wrap
  }

  /* ─────────── stage skeleton ─────────── */
  const stage = el('div', 'tc-stage')
  stage.innerHTML =
    '<div class="tc-bg is-front"><img alt="" loading="lazy" decoding="async" /><div class="tc-bg-shade"></div></div>' +
    '<div class="tc-bg"><img alt="" loading="lazy" decoding="async" /><div class="tc-bg-shade"></div></div>' +
    '<div class="tc-expander"><img alt="" loading="lazy" decoding="async" /><div class="tc-bg-shade"></div></div>' +
    '<div class="tc-content">' +
    '  <div class="tc-index"><span class="tc-num"><span class="tc-num-inner">01</span></span><span class="tc-count">/ 06</span></div>' +
    '  <div class="tc-info">' +
    '    <p class="tc-meta"></p>' +
    '    <h3 class="tc-title"></h3>' +
    '    <p class="tc-role"></p>' +
    '    <div class="tc-tags"></div>' +
    '    <p class="tc-links"></p>' +
    '    <ul class="tc-bullets"></ul>' +
    '  </div>' +
    '</div>' +
    '<div class="tc-cards"></div>' +
    '<div class="tc-controls">' +
    '  <div class="tc-rail-actions"></div>' +
    '  <button class="tc-arrow tc-prev" type="button" aria-label="Previous project">←</button>' +
    '  <button class="tc-arrow tc-next" type="button" aria-label="Next project">→</button>' +
    '  <div class="tc-progress"><span class="tc-progress-fill"></span></div>' +
    '</div>'
  mount.appendChild(stage)

  const bgA = stage.querySelectorAll<HTMLElement>('.tc-bg')[0]
  const bgB = stage.querySelectorAll<HTMLElement>('.tc-bg')[1]
  const expander = stage.querySelector<HTMLElement>('.tc-expander')!
  const numInner = stage.querySelector<HTMLElement>('.tc-num-inner')!
  const infoEl = stage.querySelector<HTMLElement>('.tc-info')!
  const metaEl = stage.querySelector<HTMLElement>('.tc-meta')!
  const titleEl = stage.querySelector<HTMLElement>('.tc-title')!
  const roleEl = stage.querySelector<HTMLElement>('.tc-role')!
  const bulletsEl = stage.querySelector<HTMLElement>('.tc-bullets')!
  const linksEl = stage.querySelector<HTMLElement>('.tc-links')!
  const tagsEl = stage.querySelector<HTMLElement>('.tc-tags')!
  const cardsEl = stage.querySelector<HTMLElement>('.tc-cards')!
  const progressEl = stage.querySelector<HTMLElement>('.tc-progress')!
  const progressFill = stage.querySelector<HTMLElement>('.tc-progress-fill')!

  /* ─────────── mobile carousel ─────────── */
  const mobile = el('div', 'tc-mobile')
  P.forEach((p) => {
    const card = el('article', 'tcm-card')
    const media = el('div', 'tcm-media')
    const img = el('img') as HTMLImageElement
    // No src yet: this carousel is display:none on desktop, and images
    // without a layout box are exempt from loading="lazy" — the browser
    // fetches them eagerly at mount. Hydrated by the near-viewport observer.
    img.dataset.src = p.img
    img.alt = p.name
    img.loading = 'lazy'
    img.decoding = 'async'
    media.appendChild(img)
    media.appendChild(el('div', 'tc-card-shade'))
    media.appendChild(el('span', 'tcm-num', p.num + ' / 06'))
    const body = el('div', 'tcm-body')
    body.appendChild(el('p', 'tc-meta', escapeHtml(p.meta)))
    const t = el('h3', 'tc-title')
    t.textContent = p.title
    body.appendChild(t)
    body.appendChild(el('p', 'tc-role', escapeHtml(p.role)))
    const tags = el('div', 'tc-tags')
    p.tags.forEach((tg) => tags.appendChild(el('span', 'tc-tag', escapeHtml(tg))))
    body.appendChild(tags)
    const mlinks = el('p', 'tc-links')
    buildLinks(p, mlinks)
    body.appendChild(mlinks)
    const mbul = el('ul', 'tc-bullets')
    ;(p.bullets || []).forEach((b) => mbul.appendChild(el('li', null, escapeHtml(b))))
    body.appendChild(mbul)
    body.appendChild(buildActions(p))
    card.appendChild(media)
    card.appendChild(body)
    mobile.appendChild(card)
  })
  mount.appendChild(mobile)

  /* ─────────── content population ─────────── */
  function splitTitle(text: string) {
    titleEl.innerHTML = ''
    const words = text.split(' ')
    words.forEach((word, i) => {
      const w = el('span', 'tc-w')
      const inner = el('span')
      inner.textContent = word
      w.appendChild(inner)
      titleEl.appendChild(w)
      if (i < words.length - 1) titleEl.appendChild(document.createTextNode(' '))
    })
  }

  function setInfo(p: AcademicProject) {
    numInner.textContent = p.num
    metaEl.textContent = p.meta
    splitTitle(p.title)
    roleEl.textContent = p.role
    bulletsEl.innerHTML = ''
    ;(p.bullets || []).forEach((b) => bulletsEl.appendChild(el('li', null, escapeHtml(b))))
    bulletsEl.setAttribute('data-cols', (p.bullets && p.bullets.length >= 3) ? '2' : '1')
    buildLinks(p, linksEl)
    tagsEl.innerHTML = ''
    p.tags.forEach((tg) => tagsEl.appendChild(el('span', 'tc-tag', escapeHtml(tg))))
    const rail = stage.querySelector<HTMLElement>('.tc-rail-actions')!
    const oldAct = rail.querySelector('.tc-actions')
    if (oldAct) oldAct.remove()
    const act = buildActions(p)
    rail.appendChild(act)
    if (!REDUCED && started) {
      gsap.fromTo(act, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: 'power1.out' })
    }
  }

  function visibleCount() {
    return window.innerWidth < 1280 ? 3 : 4
  }

  function buildCards() {
    cardsEl.innerHTML = ''
    order.slice(1, 1 + visibleCount()).forEach((idx, slot) => {
      const p = P[idx]
      const c = el('button', 'tc-card') as HTMLButtonElement
      c.type = 'button'
      c.setAttribute('aria-label', 'Show project: ' + p.name)
      c.dataset.queue = String(slot)
      const img = el('img') as HTMLImageElement
      img.loading = 'lazy'
      img.decoding = 'async'
      img.src = p.img
      img.alt = ''
      c.appendChild(img)
      c.appendChild(el('div', 'tc-card-shade'))
      c.appendChild(el('span', 'tc-card-num', p.num))
      c.appendChild(el('span', 'tc-card-name', escapeHtml(p.name)))
      c.addEventListener('click', () => {
        stopAutoplay()
        goToQueue(slot, c)
      })
      cardsEl.appendChild(c)
    })
  }

  function setBg(p: AcademicProject) {
    bgA.querySelector('img')!.src = p.img
  }

  /* ─────────── text in/out animation ─────────── */
  function animateTextOut(tl: gsap.core.Timeline, at: number) {
    tl.to([metaEl, titleEl, roleEl, bulletsEl, linksEl, tagsEl], {
      autoAlpha: 0, y: -14, duration: 0.3, stagger: 0.03, ease: 'power2.in',
    }, at)
    tl.to(numInner, { yPercent: -105, duration: 0.3, ease: 'power2.in' }, at)
  }

  function animateTextIn(tl: gsap.core.Timeline, p: AcademicProject, at: number) {
    tl.call(() => setInfo(p), undefined, at)
    tl.fromTo(numInner, { yPercent: 105 }, { yPercent: 0, duration: 0.6, ease: 'power3.out' }, at + 0.05)
    tl.set([metaEl, roleEl, bulletsEl, linksEl, tagsEl], { autoAlpha: 0, y: 18 }, at)
    tl.set(titleEl, { autoAlpha: 1, y: 0 }, at)
    tl.call(() => {
      gsap.fromTo(titleEl.querySelectorAll('.tc-w > span'),
        { yPercent: 115 },
        { yPercent: 0, duration: 0.7, stagger: 0.045, ease: 'power3.out' })
      gsap.fromTo([metaEl, roleEl, bulletsEl, linksEl, tagsEl],
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.07, ease: 'power2.out' })
    }, undefined, at + 0.05)
  }

  /* ─────────── transitions ─────────── */
  function crossfade(p: AcademicProject) {
    bgB.querySelector('img')!.src = p.img
    const tl = gsap.timeline({ onComplete: () => {
      setBg(p)
      gsap.set(bgB, { autoAlpha: 0 })
      animating = false
      scheduleAutoplay()
    } })
    tl.fromTo(bgB, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.7, ease: 'power1.inOut' }, 0)
    if (REDUCED) {
      tl.to(infoEl, { autoAlpha: 0, duration: 0.25 }, 0)
      tl.call(() => setInfo(p), undefined, 0.3)
      tl.to(infoEl, { autoAlpha: 1, duration: 0.3 }, 0.35)
      tl.call(() => buildCards(), undefined, 0.3)
    } else {
      animateTextOut(tl, 0)
      animateTextIn(tl, p, 0.35)
      tl.call(() => buildCards(), undefined, 0.35)
    }
  }

  function expandFromCard(p: AcademicProject, cardElm: HTMLElement) {
    if (REDUCED) { crossfade(p); return }
    const stageRect = stage.getBoundingClientRect()
    const r = cardElm.getBoundingClientRect()
    const slotW = r.width + CARD_GAP

    expander.querySelector('img')!.src = p.img
    gsap.set(expander, {
      display: 'block', autoAlpha: 1,
      left: r.left - stageRect.left, top: r.top - stageRect.top,
      width: r.width, height: r.height, borderRadius: 12,
    })

    const otherCards = Array.from(cardsEl.children).filter((c) => c !== cardElm)
    const after = otherCards.filter((c) => c.compareDocumentPosition(cardElm) & Node.DOCUMENT_POSITION_PRECEDING)
    const tl = gsap.timeline({ onComplete: () => { animating = false; scheduleAutoplay() } })

    tl.to(cardElm, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 0)
    tl.to(expander, {
      left: 0, top: 0, width: stageRect.width, height: stageRect.height,
      borderRadius: 0, duration: 1.0, ease: 'power3.inOut',
    }, 0)
    if (after.length) {
      tl.to(after, { x: '-=' + slotW, duration: 1.0, ease: 'power3.inOut' }, 0)
    }
    animateTextOut(tl, 0)
    animateTextIn(tl, p, 0.5)
    tl.call(() => { setBg(p) }, undefined, 1.0)
    tl.to(expander, { autoAlpha: 0, duration: 0.2 }, 1.08)
    tl.set(expander, { display: 'none' }, 1.3)
    tl.call(() => {
      buildCards()
      const last = cardsEl.lastElementChild
      if (last) {
        gsap.fromTo(last, { x: slotW * 0.6, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.55, ease: 'power3.out' })
      }
    }, undefined, 1.05)
  }

  function rotate(steps: number) {
    const n = order.length
    const s = ((steps % n) + n) % n
    order = order.slice(s).concat(order.slice(0, s))
  }

  function next(manual: boolean) {
    if (animating) return
    animating = true
    if (manual) stopAutoplay(); else killProgress()
    rotate(1)
    const p = P[order[0]]
    const firstCard = cardsEl.children[0] as HTMLElement | undefined
    if (firstCard && !REDUCED) expandFromCard(p, firstCard)
    else crossfade(p)
  }

  function prev() {
    if (animating) return
    animating = true
    stopAutoplay()
    rotate(-1)
    crossfade(P[order[0]])
  }

  function goToQueue(slot: number, cardElm: HTMLElement) {
    if (animating) return
    animating = true
    rotate(slot + 1)
    expandFromCard(P[order[0]], cardElm)
  }

  /* ─────────── autoplay ─────────── */
  function killProgress() {
    if (progressTween) { progressTween.kill(); progressTween = null }
  }

  function scheduleAutoplay() {
    if (autoplayDead || !inView || animating) return
    killProgress()
    progressTween = gsap.fromTo(progressFill, { scaleX: 0 }, {
      scaleX: 1, duration: AUTOPLAY_SECONDS, ease: 'none',
      onComplete: () => next(false),
    })
    if (hovered) progressTween.pause()
  }

  function stopAutoplay() {
    if (autoplayDead) return
    autoplayDead = true
    killProgress()
    gsap.to(progressFill, { scaleX: 0, duration: 0.4 })
    progressEl.classList.add('is-stopped')
  }

  const onEnter = () => { hovered = true; if (progressTween) progressTween.pause() }
  const onLeave = () => { hovered = false; if (progressTween) progressTween.resume() }
  stage.addEventListener('mouseenter', onEnter)
  stage.addEventListener('mouseleave', onLeave)

  stage.querySelector('.tc-next')!.addEventListener('click', () => next(true))
  stage.querySelector('.tc-prev')!.addEventListener('click', () => prev())

  /* ─────────── init ─────────── */
  // Preload every stage image — but only once the section approaches the
  // viewport. At mount this is ~3MB of below-fold JPEGs racing the hero's
  // first-paint assets on page load.
  const preloadAll = () => {
    P.forEach((p) => { const i = new Image(); i.src = p.img })
    // Hydrate the mobile carousel's deferred imgs (see buildLinks note).
    mobile.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((i) => {
      i.src = i.dataset.src!
      delete i.dataset.src
    })
  }
  // Observe the mount, not the stage: on phones the stage is display:none
  // (and the carousel shown), so a stage observer would never fire there.
  const nearIo = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      preloadAll()
      nearIo.disconnect()
    }
  }, { rootMargin: '1200px 0px' })
  nearIo.observe(mount)
  setBg(P[order[0]])
  setInfo(P[order[0]])
  buildCards()

  if (!REDUCED) {
    gsap.set([metaEl, titleEl, roleEl, bulletsEl, linksEl, tagsEl], { autoAlpha: 0, y: 24 })
  }

  function applyInView(nowIn: boolean) {
    const was = inView
    inView = nowIn
    if (nowIn && !started) {
      started = true
      if (!REDUCED) {
        gsap.fromTo(numInner, { yPercent: 105 }, { yPercent: 0, duration: 0.7, ease: 'power3.out' })
        gsap.to([metaEl, titleEl, roleEl, bulletsEl, linksEl, tagsEl], {
          autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out',
        })
        gsap.fromTo(cardsEl.children, { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.07, ease: 'power3.out' })
      }
      scheduleAutoplay()
    } else if (nowIn && !was) {
      if (progressTween && !hovered) progressTween.resume()
      else scheduleAutoplay()
    } else if (!nowIn && was && progressTween) {
      progressTween.pause()
    }
  }

  let ioFired = false
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      ioFired = true
      applyInView(entry.isIntersecting)
    })
  }, { threshold: 0.35 })
  io.observe(stage)

  // Fallback: some environments fail to deliver IO entries at all, which
  // would leave the info block permanently hidden (autoAlpha 0). Drive the
  // same enter/leave logic from the stage rect until the IO proves alive.
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

  let resizeT: ReturnType<typeof setTimeout> | undefined
  const onResizeCards = () => {
    clearTimeout(resizeT)
    resizeT = setTimeout(() => { if (!animating) buildCards() }, 200)
  }
  window.addEventListener('resize', onResizeCards)

  teardown = () => {
    io.disconnect()
    nearIo.disconnect()
    clearTimeout(fallbackTimer)
    clearTimeout(resizeT)
    window.removeEventListener('scroll', onScrollFb)
    window.removeEventListener('resize', onResizeFb)
    window.removeEventListener('resize', onResizeCards)
    stage.removeEventListener('mouseenter', onEnter)
    stage.removeEventListener('mouseleave', onLeave)
    killProgress()
    gsap.killTweensOf(stage.querySelectorAll('*'))
    mount.innerHTML = ''
  }
})

onBeforeUnmount(() => { teardown?.(); teardown = null })
</script>

<template>
  <div ref="mountRef" id="timed-cards"></div>
</template>

<!-- Unscoped on purpose: the stage DOM is built at runtime, so scoped data
     attrs would never land on it. All classes are tc-* prefixed. -->
<style>
#timed-cards {
  margin: 0 calc(-1 * var(--gutter-x)) 0;
}

/* ─────────────────────────── stage ─────────────────────────── */
.tc-stage {
  position: relative;
  height: 100svh;
  min-height: 640px;
  overflow: hidden;
  background: #0B0C0E;
  color: #F4F4F1;
  border-top: 1px solid var(--rule);
}

.tc-bg {
  position: absolute;
  inset: 0;
  opacity: 0;
  will-change: opacity;
}
.tc-bg.is-front { opacity: 1; }
.tc-bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tc-bg .tc-bg-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(8, 9, 11, 0.88) 0%, rgba(8, 9, 11, 0.30) 38%, rgba(8, 9, 11, 0.12) 60%, rgba(8, 9, 11, 0.35) 100%),
    linear-gradient(100deg, rgba(8, 9, 11, 0.72) 0%, rgba(8, 9, 11, 0.25) 48%, rgba(8, 9, 11, 0) 75%);
}

/* ─── big record number, left ─── */
.tc-index {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  flex: none;
}
.tc-num {
  font: 900 clamp(2.6rem, 4.6vw, 4.4rem)/0.85 var(--f-sans);
  letter-spacing: -0.05em;
  color: #F4F4F1;
  overflow: hidden;
  display: inline-block;
}
.tc-num .tc-num-inner { display: inline-block; }
.tc-count {
  font: 500 0.78rem/1 var(--f-mono);
  letter-spacing: 0.22em;
  color: rgba(244, 244, 241, 0.55);
}

/* ─── info block, bottom-left ─── */
.tc-content {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  /* TOP-aligned: index + title hold the SAME position across all six
     projects (never clip the top, never shift per project); the pinned rail
     anchors the bottom. Content flows down into the reserved bottom band. */
  justify-content: flex-start;
  gap: clamp(0.7rem, 1.8vh, 1.2rem);
  padding: clamp(5.5rem, 12vh, 7.5rem) var(--gutter-x) clamp(8.5rem, 15vh, 10rem);
  pointer-events: none;
}
.tc-content > * { pointer-events: auto; }
.tc-info {
  max-width: min(56vw, 880px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.55rem;
}
.tc-meta {
  font: 500 0.7rem/1.6 var(--f-mono);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(244, 244, 241, 0.78);
  text-shadow: 0 1px 3px rgba(8, 9, 11, 0.9);
}
.tc-title {
  font: 800 clamp(1.25rem, 2vw, 1.85rem)/1.08 var(--f-sans);
  letter-spacing: -0.03em;
  text-transform: uppercase;
  text-wrap: balance;
  max-width: min(48vw, 680px);
  text-shadow: 0 2px 10px rgba(8, 9, 11, 0.55);
}
.tc-title .tc-w {
  display: inline-block;
  overflow: hidden;
  vertical-align: bottom;
  padding-bottom: 0.08em;
  margin-bottom: -0.08em;
}
.tc-title .tc-w > span { display: inline-block; will-change: transform; }
.tc-role {
  font: 400 clamp(0.84rem, 0.95vw, 0.95rem)/1.5 var(--f-sans);
  color: rgba(244, 244, 241, 0.92);
  text-shadow: 0 1px 3px rgba(8, 9, 11, 0.9);
}
.tc-links {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.7rem;
  font: 500 0.68rem/1.6 var(--f-mono);
  letter-spacing: 0.08em;
}
.tc-links a {
  color: rgba(244, 244, 241, 0.95);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-shadow: 0 1px 3px rgba(8, 9, 11, 0.9);
  transition: color 0.25s ease;
}
.tc-links a:hover { color: var(--accent); }
.tc-links .tc-pipe { color: rgba(244, 244, 241, 0.3); }
.tc-links:empty { display: none; }

.tc-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.tc-tag {
  font: 500 0.62rem/1 var(--f-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244, 244, 241, 0.85);
  border: 1px solid rgba(244, 244, 241, 0.28);
  padding: 0.5rem 0.7rem;
  border-radius: 999px;
  white-space: nowrap;
}

/* ─── resume bullets — all visible, no scroll, 2-col on dense projects ─── */
.tc-bullets {
  list-style: none;
  margin: 0.1rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem 1.6rem;
  max-width: min(46vw, 680px);
}
.tc-bullets[data-cols="2"] {
  grid-template-columns: 1fr 1fr;
  max-width: min(56vw, 860px);
}
.tc-bullets li {
  position: relative;
  padding-left: 1.05rem;
  font: 400 clamp(0.86rem, 0.98vw, 1rem)/1.55 var(--f-sans);
  color: rgba(244, 244, 241, 0.95);
  text-wrap: pretty;
  /* Legibility over photography: a tight dark contour + soft local halo keep
     the copy readable even where the shade gradients thin out (right column,
     bright floors) — no change to the image treatment itself. */
  text-shadow:
    0 1px 2px rgba(8, 9, 11, 0.9),
    0 0 14px rgba(8, 9, 11, 0.65);
}
.tc-bullets li strong { color: #FFFFFF; font-weight: 600; }
.tc-bullets li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 11px;
  height: 1px;
  background: var(--accent);
  opacity: 0.85;
}

/* ─── view-project button ─── */
.tc-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.4rem;
}
.tc-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 44px;
  padding: 0 1.3rem;
  background: var(--accent);
  color: var(--accent-ink);
  font: 700 0.7rem/1 var(--f-mono);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1), background 0.3s ease;
}
.tc-btn:hover { transform: translateY(-2px); }
.tc-btn .tc-btn-arrow { font-family: var(--f-sans); }
.tc-demo-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(244, 244, 241, 0.52);
}
.tc-demo-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid rgba(244, 244, 241, 0.5);
}
.tc-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font: 500 0.6rem/1 var(--f-mono);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
}
.tc-live-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: tc-pulse 1.8s ease-in-out infinite;
}
@keyframes tc-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.7); }
}
@media (prefers-reduced-motion: reduce) {
  .tc-live-badge::before { animation: none; }
}

/* ─── pinned action rail — bottom-left of the stage ───
   [View Project] [←] [→] [progress] live together at a FIXED position,
   baseline-aligned with the preview-cards row on the right, so nothing
   shifts or collides as per-project content height changes. */
.tc-controls {
  position: absolute;
  left: var(--gutter-x);
  bottom: calc(var(--gutter-y) * 1.4);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 1.05rem;
}
.tc-rail-actions { display: inline-flex; align-items: center; margin-right: 0.35rem; }
.tc-controls .tc-actions { margin-top: 0; }
@media (max-width: 1000px) {
  .tc-progress { display: none; } /* keep the rail clear of the card queue */
}
.tc-arrow {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(244, 244, 241, 0.3);
  border-radius: 50%;
  color: #F4F4F1;
  font-size: 1.05rem;
  transition: background 0.25s ease, color 0.25s ease, border-color 0.25s ease;
}
.tc-arrow:hover { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.tc-arrow:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tc-progress {
  position: relative;
  width: clamp(110px, 12vw, 180px);
  height: 2px;
  background: rgba(244, 244, 241, 0.2);
  overflow: hidden;
}
.tc-progress-fill {
  position: absolute;
  inset: 0;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left center;
}
.tc-progress.is-stopped { opacity: 0; transition: opacity 0.5s ease; }

/* ─── preview cards row, bottom-right ─── */
.tc-cards {
  position: absolute;
  right: var(--gutter-x);
  bottom: calc(var(--gutter-y) * 1.4);
  z-index: 5;
  display: flex;
  gap: 14px;
}
.tc-card {
  position: relative;
  width: clamp(140px, 12.5vw, 188px);
  aspect-ratio: 3 / 2;
  flex: none;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(244, 244, 241, 0.22);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  padding: 0;
  text-align: left;
  transition: border-color 0.25s ease;
}
.tc-card:hover { border-color: var(--accent); }
.tc-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tc-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tc-card .tc-card-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(8, 9, 11, 0.82) 0%, rgba(8, 9, 11, 0.1) 55%);
}
.tc-card .tc-card-num {
  position: absolute;
  top: 8px;
  left: 10px;
  font: 500 0.56rem/1 var(--f-mono);
  letter-spacing: 0.16em;
  color: rgba(244, 244, 241, 0.75);
}
.tc-card .tc-card-name {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 9px;
  font: 600 0.62rem/1.25 var(--f-sans);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #F4F4F1;
}

/* ─── expander clone (card → fullscreen) ─── */
.tc-expander {
  position: absolute;
  z-index: 3;
  display: none;
  overflow: hidden;
  border-radius: 12px;
  will-change: width, height, transform;
}
.tc-expander img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tc-expander .tc-bg-shade { position: absolute; inset: 0; }

/* ─────────────────────── mobile carousel ─────────────────────── */
.tc-mobile { display: none; }

@media (max-width: 860px) {
  .tc-stage { display: none; }

  .tc-mobile {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 0 var(--gutter-x) clamp(2.5rem, 6vh, 4rem);
    background: #0B0C0E;
    border-top: 1px solid var(--rule);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .tc-mobile::-webkit-scrollbar { display: none; }
  .tc-mobile::before, .tc-mobile::after { content: ''; flex: 0 0 1px; }

  .tcm-card {
    flex: 0 0 86%;
    scroll-snap-align: center;
    margin-top: clamp(2rem, 5vh, 3rem);
    border: 1px solid rgba(244, 244, 241, 0.18);
    border-radius: 14px;
    overflow: hidden;
    background: #101114;
    color: #F4F4F1;
    display: flex;
    flex-direction: column;
  }
  .tcm-media {
    position: relative;
    aspect-ratio: 16 / 10;
  }
  .tcm-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .tcm-media .tc-card-shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,9,11,0.7), rgba(8,9,11,0) 55%); }
  .tcm-num {
    position: absolute;
    top: 12px;
    left: 14px;
    font: 500 0.62rem/1 var(--f-mono);
    letter-spacing: 0.18em;
    color: rgba(244, 244, 241, 0.85);
  }
  .tcm-body {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 1.1rem 1.1rem 1.3rem;
  }
  .tcm-body .tc-title { font-size: 1.06rem; }
  .tcm-body .tc-meta { font-size: 0.58rem; }
  .tcm-body .tc-role { font-size: 0.82rem; color: rgba(244,244,241,0.7); }
  .tcm-body .tc-bullets {
    max-width: none;
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }
  .tcm-body .tc-bullets li { font-size: 0.8rem; color: rgba(244,244,241,0.72); }
  .tcm-body .tc-tag { padding: 0.42rem 0.6rem; }
  .tcm-body .tc-actions { margin-top: 0.2rem; }
  /* 17px-tall mono links ("Project video", "Team"). Padding would push the
     underline off the word, so extend the hit box with an invisible ::before
     and widen the row gap so stacked links don't share a target. */
  .tcm-body .tc-links { gap: 1.5rem 1rem; }
  .tcm-body .tc-links a { position: relative; }
  .tcm-body .tc-links a::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    height: 40px;
    transform: translateY(-50%);
  }
}

@media (max-width: 1280px) {
  .tc-info { max-width: min(62vw, 720px); }
}

/* ─── short viewports: compact type so dense projects never overflow ─── */
@media (max-height: 820px) {
  .tc-content {
    padding: clamp(4rem, 9vh, 5.5rem) var(--gutter-x) clamp(7.5rem, 13vh, 8.5rem);
    gap: 0.6rem;
  }
  .tc-info { gap: 0.45rem; }
  .tc-num { font-size: clamp(2rem, 3.6vw, 3.2rem); }
  .tc-title { font-size: clamp(1.1rem, 1.7vw, 1.55rem); }
  .tc-bullets { gap: 0.35rem 1.3rem; }
  .tc-bullets li { font-size: clamp(0.78rem, 0.88vw, 0.9rem); line-height: 1.45; }
}
</style>
