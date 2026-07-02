/* MONOLITH — scroll-driven frame scrub + interactions */
(() => {
  'use strict';

  /* ---------------- Frame-scrub engine ---------------- */
  // manifest.json => { "hero": {count, fps, pad}, ... }. Frames at /frames/<name>/001.jpg
  async function initScrubbers() {
    let manifest = {};
    try {
      const res = await fetch('frames/manifest.json', { cache: 'no-store' });
      if (res.ok) manifest = await res.json();
    } catch (e) { /* fall back below */ }

    document.querySelectorAll('.scrub').forEach((section) => {
      const name = section.dataset.frames;
      const canvas = section.querySelector('[data-canvas]');
      const fallback = section.querySelector('[data-fallback]');
      const info = manifest[name];

      if (!info || !info.count) {
        if (fallback) {
          fallback.style.backgroundImage = `url('frames/${name}/poster.jpg')`;
          fallback.classList.add('show');
        }
        if (canvas) canvas.style.display = 'none';
        bindReveals(section);
        return;
      }

      const count = info.count;
      const pad = info.pad || 3;
      const ctx = canvas.getContext('2d', { alpha: false });
      const frames = new Array(count + 1);
      const isLoaded = (im) => im && im.complete && im.naturalWidth > 0;
      let loaded = 0;
      let targetIndex = 1;
      let drawnImg = null;
      const dpr = Math.min(devicePixelRatio || 1, 2);

      const src = (i) => `frames/${name}/${String(i).padStart(pad, '0')}.jpg`;

      function best(i) {
        if (isLoaded(frames[i])) return frames[i];
        for (let d = 1; d < count; d++) {
          if (isLoaded(frames[i - d])) return frames[i - d];
          if (isLoaded(frames[i + d])) return frames[i + d];
        }
        return null;
      }

      function render(force) {
        const img = best(targetIndex);
        if (!img) return;
        if (img === drawnImg && !force) return;
        drawnImg = img;
        const cw = canvas.width, ch = canvas.height;
        const ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
        let dw, dh;
        if (ir > cr) { dh = ch; dw = ch * ir; } else { dw = cw; dh = cw / ir; }
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }

      function resize() {
        const r = canvas.getBoundingClientRect();
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        render(true);
      }

      let firstError = false;
      for (let i = 1; i <= count; i++) {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => { loaded++; if (i === targetIndex || !drawnImg) render(); };
        im.onerror = () => {
          if (i === 1 && !firstError) {
            firstError = true;
            if (fallback) { fallback.style.backgroundImage = `url('frames/${name}/poster.jpg')`; fallback.classList.add('show'); }
            canvas.style.display = 'none';
          }
        };
        im.src = src(i);
        frames[i] = im;
      }

      function onScroll() {
        const rect = section.getBoundingClientRect();
        const total = section.offsetHeight - window.innerHeight;
        const p = clamp(-rect.top / total, 0, 1);
        targetIndex = 1 + Math.round(p * (count - 1));
        render();
        updateReveals(section, p);
      }

      // Each handler gets its OWN rAF gate — a shared flag lets the first
      // scroll listener starve the rest and freeze the canvas on frame 1.
      window.addEventListener('resize', rafThrottle(resize));
      window.addEventListener('scroll', rafThrottle(onScroll), { passive: true });
      resize();
      onScroll();

      (window.__scrub = window.__scrub || {})[name] = {
        get index() { return targetIndex; },
        get loaded() { return loaded; },
        count,
        get drawn() { return drawnImg && drawnImg.src.split('/').pop(); },
      };
    });
  }

  /* ---------------- Reveals ---------------- */
  function bindReveals(scope) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.2 });
    scope.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  }
  function updateReveals(section, p) {
    section.querySelectorAll('.reveal').forEach((el) => {
      const at = parseFloat(el.dataset.at || '0');
      if (p >= at) el.classList.add('in');
      else el.classList.remove('in');
    });
  }
  function initSectionReveals() {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.18 });
    document.querySelectorAll('.specs .reveal, .customize .reveal, .footer .reveal').forEach((el) => io.observe(el));
    const cards = document.querySelectorAll('.spec-card');
    const io2 = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        if (e.isIntersecting) {
          const idx = [...cards].indexOf(e.target);
          e.target.animate(
            [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }],
            { duration: 700, delay: (idx % 4) * 80, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' }
          );
          io2.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    cards.forEach((c) => io2.observe(c));
  }

  /* ---------------- Manifesto word lighting ---------------- */
  function initManifesto() {
    const sec = document.querySelector('.manifesto');
    const words = document.querySelectorAll('.manifesto .r-word');
    if (!sec || !words.length) return;
    function onScroll() {
      const rect = sec.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh - rect.top) / (vh + rect.height * 0.6), 0, 1);
      const lit = Math.round(p * words.length * 1.3);
      words.forEach((w, i) => w.classList.toggle('lit', i < lit));
    }
    window.addEventListener('scroll', rafThrottle(onScroll), { passive: true });
    onScroll();
  }

  /* ---------------- Nav + progress ---------------- */
  function initChrome() {
    const nav = document.getElementById('nav');
    const bar = document.querySelector('[data-progress]');
    function onScroll() {
      nav.classList.toggle('is-stuck', window.scrollY > 40);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (clamp(window.scrollY / h, 0, 1) * 100) + '%';
    }
    window.addEventListener('scroll', rafThrottle(onScroll), { passive: true });
    onScroll();
  }

  /* ---------------- Customizer ---------------- */
  function initCustomizer() {
    const root = document.querySelector('.customizer');
    if (!root) return;
    const board = root.querySelector('[data-cz-board]');
    const keysWrap = root.querySelector('[data-cz-keys]');
    const glow = root.querySelector('[data-cz-glow]');
    const nameEl = root.querySelector('[data-cz-name]');
    const priceEl = root.querySelector('[data-cz-price]');
    const feelEl = root.querySelector('[data-cz-feel]');
    const buyEl = root.querySelector('[data-cz-buy]');
    const BASE = 299;

    for (let i = 0; i < 70; i++) {
      const k = document.createElement('div');
      k.className = 'cz-key';
      keysWrap.appendChild(k);
    }
    const keys = [...keysWrap.children];

    const state = {
      switch: { val: 'Obsidian Linear', add: 0, feel: 'glass-smooth, 45g, silent bottom-out' },
      keycap: { val: 'Graphite', cap: '#26282e', leg: '#d7dae2', add: 0 },
      case: { val: 'Void Black', case: '#17181c', add: 0 },
      rgb: { val: 'Spectrum', a: '#2de2ff', b: '#ff2d9b' },
    };

    function apply() {
      board.style.background = `linear-gradient(180deg, ${shade(state.case.case, 8)}, ${shade(state.case.case, -10)})`;
      keys.forEach((k, i) => {
        k.style.setProperty('--cap', state.keycap.cap);
        const t = (i % 14) / 13;
        k.style.setProperty('--glow', mix(state.rgb.a, state.rgb.b, t));
      });
      glow.style.background = `linear-gradient(120deg, ${state.rgb.a}, ${state.rgb.b})`;
      document.documentElement.style.setProperty('--rgb-a', state.rgb.a);
      document.documentElement.style.setProperty('--rgb-b', state.rgb.b);
      const price = BASE + state.switch.add + state.keycap.add + state.case.add;
      nameEl.textContent = `${state.switch.val} · ${state.keycap.val} · ${state.case.val} · ${state.rgb.val}`;
      priceEl.textContent = `$${price}`;
      feelEl.textContent = state.switch.feel;
      buyEl.textContent = `Add to cart — $${price}`;
    }

    root.querySelectorAll('.cz-group').forEach((group) => {
      const kind = group.dataset.czSwitch !== undefined ? 'switch'
        : group.dataset.czKeycap !== undefined ? 'keycap'
        : group.dataset.czCase !== undefined ? 'case' : 'rgb';
      group.querySelectorAll('.cz-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.cz-opt').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          const d = btn.dataset;
          if (kind === 'switch') state.switch = { val: d.val, add: +d.add, feel: d.feel };
          if (kind === 'keycap') state.keycap = { val: d.val, cap: d.cap, leg: d.leg, add: +d.add };
          if (kind === 'case') state.case = { val: d.val, case: d.case, add: +d.add };
          if (kind === 'rgb') state.rgb = { val: d.val, a: d.a, b: d.b };
          apply();
        });
      });
    });
    buyEl.addEventListener('click', (e) => {
      e.preventDefault();
      buyEl.textContent = '✓ Added to cart';
      setTimeout(apply, 1400);
    });
    apply();
  }

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rafThrottle(fn) {
    let queued = false;
    return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
  }
  function hexToRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => Math.round(clamp(x, 0, 255)).toString(16).padStart(2, '0')).join(''); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function shade(hex, amt) { const c = hexToRgb(hex); return rgbToHex(c[0] + amt * 2.55, c[1] + amt * 2.55, c[2] + amt * 2.55); }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initChrome();
    initManifesto();
    initSectionReveals();
    initCustomizer();
    initScrubbers();
  });
})();
