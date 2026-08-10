/* ── site loader + visitor counter ──
   Plays on every page load. Visit count: abacus.jasoncameron.dev free hit counter.
   Counts a new visit when the tab is fresh OR the last counted visit is older
   than SESSION_MS; otherwise reads the current value without incrementing.
   Last known value cached in localStorage as offline fallback.
   The -v2 key replaces the original site-visits one, which a /hit created
   implicitly and so carries no admin token — its 274 could never be cleared.
   This key was created explicitly and reset to zero; the token lives outside
   the repo, so the count can be reset again from a laptop. */
(function () {
  var SESSION_MS = 30 * 60 * 1000;
  var seen = false;
  try {
    var sameTab = !!sessionStorage.getItem('aglShown');
    var lastHit = parseInt(localStorage.getItem('aglLastHit2'), 10) || 0;
    seen = sameTab && (Date.now() - lastHit) < SESSION_MS;
  } catch (e) {}
  var docEl = document.documentElement;
  docEl.classList.add('agl-loading');
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var loadFired = false;
  addEventListener('load', function () { loadFired = true; });
  setTimeout(function () { loadFired = true; }, 3500); /* failsafe */

  /* ── visitor count (resolves with number or null) ── */
  var cached = null;
  try { cached = parseInt(localStorage.getItem('aglCount2'), 10) || null; } catch (e) {}
  var countPromise = new Promise(function (resolve) {
    var done = false;
    var finish = function (v) { if (!done) { done = true; resolve(v); } };
    setTimeout(function () { finish(cached); }, 2500);
    try {
      fetch('https://abacus.jasoncameron.dev/' + (seen ? 'get' : 'hit') + '/adarsh-golait-portfolio/site-visits-v2')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var v = d && d.value;
          if (v > 0) {
            try {
              localStorage.setItem('aglCount2', String(v));
              if (!seen) localStorage.setItem('aglLastHit2', String(Date.now()));
            } catch (e) {}
            finish(v);
          }
          else finish(cached);
        })
        .catch(function () { finish(cached); });
    } catch (e) { finish(cached); }
  });

  function build() {
    var veil = document.createElement('div');
    veil.className = 'agl-veil';
    document.body.appendChild(veil);
    var el = document.createElement('div');
    el.className = 'agl';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Loading portfolio');
    el.innerHTML =
      '<div class="agl-top"><span class="agl-brand"><span class="agl-dot"></span>Adarsh Golait</span><span class="agl-mono">Portfolio — Loading</span></div>' +
      '<div class="agl-mid"><span class="agl-mono">You are</span><span class="agl-odo" id="aglOdo"></span><span class="agl-mono agl-vfoot">here</span></div>' +
      '<div class="agl-bottom"><span class="agl-load"><span class="agl-mono">Loading</span><span class="agl-pct" id="aglPct">0%</span></span><span class="agl-mono">&copy; 2026</span></div>' +
      '<div class="agl-bar"><span class="agl-fill" id="aglFill"></span></div>';
    document.body.appendChild(el);
    /* overlay now covers the page; drop the instant ::before cover next frame */
    requestAnimationFrame(function () { docEl.classList.remove('agl-loading'); docEl.classList.add('agl-lock'); });
    return { el: el, veil: veil };
  }

  var REEL = '01234567890', MAXV = 999999;
  function ord(v) { var t = v % 100; if (t >= 11 && t <= 13) return 'th'; switch (v % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; } }
  function buildOdo(odo, n) {
    odo.innerHTML = '';
    var cols = [];
    for (var i = 0; i < n; i++) {
      if (i > 0 && (n - i) % 3 === 0) {
        var c = document.createElement('span'); c.className = 'agl-comma'; c.textContent = ','; odo.appendChild(c);
      }
      var col = document.createElement('span');
      col.className = 'agl-col' + (reduced ? '' : ' agl-spin');
      var reel = document.createElement('span'); reel.className = 'agl-reel';
      for (var j = 0; j < REEL.length; j++) { var s = document.createElement('span'); s.textContent = REEL[j]; reel.appendChild(s); }
      col.appendChild(reel); cols.push(col); odo.appendChild(col);
    }
    var suf = document.createElement('span'); suf.className = 'agl-suf'; suf.textContent = 'th'; odo.appendChild(suf);
    return cols;
  }
  function settleOdo(odo, cols, value, onDone) {
    if (value === null) { odo.innerHTML = '<span class="agl-col"><span class="agl-reel"><span>&ndash;</span></span></span>'; setTimeout(onDone, 50); return; }
    var shown = Math.min(value, MAXV), str = String(shown);
    /* no leading zeros — match column count to the real digit count */
    if (str.length !== cols.length) { cols = buildOdo(odo, str.length); if (!reduced) void odo.offsetHeight; }
    var suf = odo.querySelector('.agl-suf'); if (suf) suf.textContent = ord(shown);
    cols.forEach(function (col, i) {
      var reel = col.firstChild;
      var d = +str[i];
      if (reduced) { col.classList.remove('agl-spin'); reel.style.transition = 'none'; reel.style.transform = 'translateY(-' + d + 'em)'; return; }
      col.classList.remove('agl-spin');
      reel.style.transform = 'translateY(0)';
      void reel.offsetHeight;
      reel.style.transitionDelay = (i * 70) + 'ms';
      reel.style.transform = 'translateY(-' + d + 'em)';
    });
    setTimeout(onDone, reduced ? 50 : 1100 + str.length * 70);
  }

  function start() {
    var b = build(), el = b.el, veil = b.veil;
    var odo = el.querySelector('#aglOdo'), pctEl = el.querySelector('#aglPct'), fill = el.querySelector('#aglFill');
    var cols = buildOdo(odo, cached ? String(Math.min(cached, MAXV)).length : 3);
    var t0 = performance.now(), MIN = reduced ? 600 : 1900;
    var rolled = false, rollDone = reduced, exited = false;

    countPromise.then(function (v) {
      /* let the reels spin a beat before settling */
      var wait = Math.max(0, (reduced ? 0 : 700) - (performance.now() - t0));
      setTimeout(function () { rolled = true; settleOdo(odo, cols, v, function () { rollDone = true; }); }, wait);
    });

    var p = 0, last = t0;
    function frame(now) {
      if (exited) return;
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var cap = loadFired ? 100.4 : 93;
      p += (cap - p) * Math.min(1, dt * (reduced ? 12 : 2.6));
      var shown = Math.min(100, Math.floor(p));
      pctEl.textContent = shown + '%';
      fill.style.transform = 'scaleX(' + shown / 100 + ')';
      var elapsed = now - t0;
      if (shown >= 100 && elapsed >= MIN && rollDone) { exit(el, veil); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    /* absolute failsafe: never trap the visitor */
    setTimeout(function () { exit(el, veil); }, 8000);
  }

  function exit(el, veil) {
    if (el.dataset.out) return; el.dataset.out = '1';
    el.classList.add('agl-out');
    if (veil) veil.classList.add('agl-out');
    docEl.classList.remove('agl-lock', 'agl-loading');
    try { sessionStorage.setItem('aglShown', '1'); } catch (e) {}
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
    }, 1300);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
