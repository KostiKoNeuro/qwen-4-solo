// Qwpie the magpie - renderer. Owns the pet state machine, physics, animation,
// clipboard reactions and per-pixel hit-testing that drives click-through.
(() => {
  'use strict';

  const PET = 120;                 // sprite display size (DIP)
  const GRAVITY = 2600;            // px/s^2
  const WALK_SPEED = 64;
  const SEEK_SPEED = 96;
  const FLOOR_PAD = 0;             // feet sit exactly on the work-area bottom
  const SPRITES = ['idle','walk1','walk2','sleep','grabbed','fall','eat','happy','code','scroll','dizzy'];

  const petEl = document.getElementById('pet');
  const spriteEl = document.getElementById('sprite');
  const bubbleEl = document.getElementById('bubble');
  const zzzEl = document.getElementById('zzz');
  const berryEl = document.getElementById('berry');
  const fxEl = document.getElementById('fx');

  const sprites = {};              // name -> { img, data(ImageData PET x PET) }
  let bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  let workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  let floor = 1040;

  const pet = {
    x: 400, y: 0, vx: 0, vy: 0,
    dir: 1, state: 'idle', t: 0,
    sprite: 'idle', squash: 1, tilt: 0, hop: 0,
    happiness: 0, forced: false,
    decision: 2, anim: 0, walkFrame: 0,
    reactKind: null, reactDur: 0,
    hardImpact: false, bounces: 0,
    berryX: null, eatT: 0,
  };

  let lastCursor = { x: -9999, y: -9999 };
  let ignoringLocal = true;
  let grabbed = false;
  let grabOffset = { x: 0, y: 0 };
  let samples = [];
  let downInfo = null;
  let idleSec = 0;
  let bubbleTimer = null;
  let lastReactAt = 0;
  let lastReport = 0;
  let prevX = 0;

  // ---------- sprites ----------
  function loadSprites() {
    return Promise.all(SPRITES.map((name) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = PET; c.height = PET;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, PET, PET);
        sprites[name] = { img, data: ctx.getImageData(0, 0, PET, PET) };
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `../assets/sprites/${name}.png`;
    })));
  }

  function setSprite(name) {
    if (pet.sprite === name) return;
    pet.sprite = name;
    const s = sprites[name];
    if (s) spriteEl.src = s.img.src;
  }

  // ---------- geometry / hit test ----------
  function applyMetrics(m) {
    bounds = m.bounds; workArea = m.workArea;
    floor = (workArea.y - bounds.y) + workArea.height - FLOOR_PAD;
    pet.x = Math.min(Math.max(pet.x, PET / 2), bounds.width - PET / 2);
    if (pet.state !== 'falling' && pet.state !== 'grabbed') pet.y = floor - PET;
  }

  function overPet(cx, cy) {
    const s = sprites[pet.sprite];
    if (!s) return false;
    const lx = cx - (pet.x - PET / 2);
    const ly = cy - pet.y;
    const pad = 6;
    if (lx < -pad || lx > PET + pad || ly < -pad || ly > PET + pad) return false;
    let sx = Math.round(pet.dir < 0 ? PET - 1 - lx : lx);
    let sy = Math.round(ly);
    sx = Math.min(PET - 1, Math.max(0, sx));
    sy = Math.min(PET - 1, Math.max(0, sy));
    return s.data.data[(sy * PET + sx) * 4 + 3] > 16;
  }

  function updateIgnore() {
    const over = grabbed || overPet(lastCursor.x, lastCursor.y);
    const want = !over;
    if (want !== ignoringLocal) {
      ignoringLocal = want;
      window.magpie.setIgnore(want);
    }
  }

  // ---------- bubble / fx ----------
  function showBubble(text, ms = 3400) {
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hidden');
    bubbleEl.style.animation = 'none';
    void bubbleEl.offsetWidth;
    bubbleEl.style.animation = '';
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
  }
  function hideBubble() { clearTimeout(bubbleTimer); bubbleEl.classList.add('hidden'); }

  function particle(ch, x, y) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.textContent = ch;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    fxEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function dust(x, y) {
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'dust';
      el.style.left = (x + (i - 1.5) * 14) + 'px';
      el.style.top = y + 'px';
      fxEl.appendChild(el);
      setTimeout(() => el.remove(), 500);
    }
  }
  const burst = (chars, x, y, n = 3) => {
    for (let i = 0; i < n; i++) setTimeout(() => particle(chars[i % chars.length], x + (i - n / 2) * 20, y - 20 - (i % 2) * 14), i * 120);
  };

  // ---------- state ----------
  function setState(s) {
    pet.state = s; pet.t = 0;
    petEl.classList.toggle('sleep', s === 'sleep');
    petEl.classList.toggle('grabbed', s === 'grabbed');
    zzzEl.classList.toggle('hidden', s !== 'sleep');
    report(true);
  }

  function report(force) {
    const now = performance.now();
    if (!force && now - lastReport < 200) return;
    lastReport = now;
    window.magpie.reportState({
      state: pet.state, x: Math.round(pet.x), y: Math.round(pet.y),
      dir: pet.dir, sprite: pet.sprite, bubble: bubbleEl.classList.contains('hidden') ? '' : bubbleEl.textContent,
      forced: pet.forced, happiness: pet.happiness,
      cursor: lastCursor, ignoreLocal: ignoringLocal,
      save: { x: Math.round(pet.x), happiness: pet.happiness },
    });
  }

  // ---------- reactions to copied text ----------
  function classify(raw) {
    const t = raw.trim();
    if (/^(https?:\/\/|www\.)\S+$/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(t)) return { kind: 'link', t };
    const num = t.replace(/[\s,]/g, '');
    if (/^[-+]?\d+(\.\d+)?%?$/.test(num) && t.length <= 20) return { kind: 'number', t, n: parseFloat(num) };
    const codeHits = /(function\s|def\s|const\s|let\s|var\s|=>|import\s|class\s|#include|console\.log|print\(|return\s|public\s+static|<\/?[a-z]+>|\{\s*\}|;\s*$)/m;
    const braces = (t.match(/[{};]/g) || []).length;
    if (codeHits.test(t) || (braces >= 3 && /\n/.test(t))) return { kind: 'code', t };
    if (t.length > 220) return { kind: 'long', t };
    return { kind: 'other', t };
  }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const QUIPS = [
    "Hi! I'm Qwpie. I collect the shiny things you copy.",
    "*happy magpie noises*",
    "Magpies recognize themselves in mirrors. Smart like me.",
    "I'm not stuck on your taskbar. I'm decorating it.",
    "Toss me! I mostly land on my feet.",
  ];

  function reactionFor(c) {
    switch (c.kind) {
      case 'link': return { sprite: 'happy', anim: 'hop', text: pick([
        'Ooh, a shiny link! Into my nest it goes. ✨',
        'A URL! *steals it* Mine now.',
        'Links are my favorite treasure. Yoink!',
      ])};
      case 'number': {
        let text;
        if (c.n === 42) text = "42! The answer to everything. *happy magpie noises*";
        else if (c.n === 0) text = "Zero? That's how many bugs I want.";
        else if (Math.abs(c.n) >= 1e6) text = "That's a LOT of seeds. I'm rich!";
        else text = `${c.t}? That's ${c.t} shiny pebbles in my nest!`;
        return { sprite: 'happy', anim: 'hop', text };
      }
      case 'code': return { sprite: 'code', anim: 'type', text: pick([
        'Ah, code. *pecks at it* ...I fixed your semicolons.',
        'Code! My natural habitat. Let me refactor this real quick.',
        '*reads code* Have you tried turning it off and on again?',
      ])};
      case 'long': return { sprite: 'scroll', anim: 'sway', text: pick([
        'War and Peace?! I need a bigger nest for this scroll.',
        "TL;DR: it's shiny. I'll read it later. Maybe.",
        "That's a lot of words. *unrolls scroll* ...I'm tired already.",
      ])};
      default: return { sprite: 'idle', anim: 'none', text: pick([
        "Not shiny, but I'll keep it anyway.",
        'Hmm. Not a link. Still, into the nest.',
      ])};
    }
  }

  function onClipboard(text) {
    const now = performance.now();
    if (now - lastReactAt < 2500) return;
    if (grabbed || pet.state === 'falling') return;
    const c = classify(text);
    if (c.kind === 'other' && Math.random() < 0.4) return;
    lastReactAt = now;
    const r = reactionFor(c);
    const wasForcedSleep = pet.state === 'sleep' && pet.forced;
    if (pet.state === 'sleep') pet.forced = false;
    pet.reactKind = c.kind; pet.reactAnim = r.anim; pet.reactDur = 3.6;
    pet.returnToSleep = wasForcedSleep;
    setSprite(r.sprite);
    showBubble(r.text, 3600);
    setState('react');
    if (c.kind === 'link') burst(['✨', '🔗', '✨'], pet.x, pet.y);
    if (c.kind === 'number') burst(['⭐', '✨'], pet.x, pet.y, 2);
    if (c.kind === 'code') burst(['💚', '✨'], pet.x, pet.y, 2);
  }

  // ---------- actions ----------
  function wake(msg) {
    pet.forced = false;
    setState('idle');
    setSprite('idle');
    pet.squash = 0.8;
    if (msg) showBubble(msg);
    pet.decision = 1.2;
  }
  function naturalSleep() {
    pet.forced = false;
    setState('sleep');
    setSprite('sleep');
    hideBubble();
  }
  function forcedSleep() {
    pet.forced = true;
    setState('sleep');
    setSprite('sleep');
    showBubble('Okay, okay... nap time. 💤', 2200);
  }
  function feed() {
    if (pet.state === 'sleep') wake('*sniff* ...berries?!');
    if (grabbed || pet.state === 'falling') return;
    const margin = PET / 2 + 10;
    pet.berryX = Math.min(Math.max(pet.x + (Math.random() * 400 - 200), margin), bounds.width - margin);
    berryEl.style.left = pet.berryX + 'px';
    berryEl.style.top = floor + 'px';
    berryEl.classList.remove('hidden');
    setState('seek');
  }
  function quip() {
    if (pet.state === 'sleep') wake();
    if (grabbed || pet.state === 'falling') return;
    showBubble(pick(QUIPS));
    burst(['✨'], pet.x, pet.y, 1);
  }

  // ---------- grab / toss ----------
  function onDown(e) {
    if (!overPet(e.clientX, e.clientY)) return;
    e.preventDefault();
    grabbed = true;
    ignoringLocal = false;
    window.magpie.setIgnore(false);
    grabOffset = { x: e.clientX - pet.x, y: e.clientY - pet.y };
    samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (pet.state === 'sleep') pet.forced = false;
    setState('grabbed');
    setSprite('grabbed');
    showBubble(pick(['Hey! Careful with the feathers!', 'Whoa! Up we go!', 'Wheee!']), 1800);
  }
  function onMove(e) {
    lastCursor = { x: e.clientX, y: e.clientY };
    if (grabbed) {
      const now = performance.now();
      samples.push({ t: now, x: e.clientX, y: e.clientY });
      while (samples.length > 2 && now - samples[0].t > 140) samples.shift();
      if (downInfo) downInfo.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    }
  }
  function onUp(e) {
    if (!grabbed) return;
    grabbed = false;
    const now = performance.now();
    const isClick = downInfo && downInfo.moved < 8 && (now - downInfo.t) < 350;
    downInfo = null;
    if (isClick) {
      setState('idle'); setSprite('idle');
      showBubble(pick(QUIPS));
      burst(['❤'], pet.x, pet.y, 1);
      pet.decision = 1.5;
      return;
    }
    let vx = 0, vy = 0;
    if (samples.length >= 2) {
      const a = samples[0], b = samples[samples.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      vx = (b.x - a.x) / dt; vy = (b.y - a.y) / dt;
      const sp = Math.hypot(vx, vy), max = 2600;
      if (sp > max) { vx *= max / sp; vy *= max / sp; }
    }
    pet.vx = vx; pet.vy = vy; pet.bounces = 0; pet.hardImpact = false;
    setState('falling'); setSprite('fall');
    if (Math.hypot(vx, vy) > 900) showBubble('WHEEEEEE!', 1500);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('mouseleave', () => { if (!grabbed) { ignoringLocal = true; window.magpie.setIgnore(true); } });

  // ---------- per-state update ----------
  function update(dt) {
    pet.t += dt;
    pet.squash += (1 - pet.squash) * Math.min(1, dt * 10);
    pet.hop *= Math.pow(0.001, dt);
    const margin = PET / 2 + 4;

    switch (pet.state) {
      case 'idle': {
        setSprite('idle');
        pet.decision -= dt;
        if (pet.decision <= 0) { setState('walk'); pet.decision = 2 + Math.random() * 4; }
        break;
      }
      case 'walk': {
        pet.anim += dt;
        if (pet.anim > 0.16) { pet.anim = 0; pet.walkFrame ^= 1; }
        setSprite(pet.walkFrame ? 'walk2' : 'walk1');
        pet.x += pet.dir * WALK_SPEED * dt;
        if (pet.x < margin) { pet.x = margin; pet.dir = 1; }
        if (pet.x > bounds.width - margin) { pet.x = bounds.width - margin; pet.dir = -1; }
        pet.decision -= dt;
        if (pet.decision <= 0) {
          const r = Math.random();
          if (r < 0.45) { setState('idle'); pet.decision = 1.5 + Math.random() * 3; }
          else { pet.decision = 2 + Math.random() * 4; if (r > 0.8) pet.dir *= -1; }
        }
        break;
      }
      case 'seek': {
        const d = pet.berryX - pet.x;
        pet.dir = d >= 0 ? 1 : -1;
        pet.anim += dt;
        if (pet.anim > 0.14) { pet.anim = 0; pet.walkFrame ^= 1; }
        setSprite(pet.walkFrame ? 'walk2' : 'walk1');
        pet.x += Math.sign(d) * Math.min(SEEK_SPEED * dt, Math.abs(d));
        if (Math.abs(d) < 14) { setState('eat'); pet.eatT = 0; setSprite('eat'); }
        break;
      }
      case 'eat': {
        pet.eatT += dt;
        setSprite('eat');
        pet.hop = Math.abs(Math.sin(pet.eatT * 9)) * 6;
        if (pet.eatT > 0.5 && !berryEl.classList.contains('hidden')) {
          berryEl.classList.add('hidden');
          burst(['❤', '✨', '❤'], pet.x, pet.y, 3);
        }
        if (pet.eatT > 1.5) {
          pet.happiness++;
          showBubble(pick(['Nom nom! 🫐 Thank you!', 'Delicious! You are my favorite human.', 'Berry good! *happy chirp*']), 2600);
          setState('idle'); pet.decision = 1.5;
        }
        break;
      }
      case 'react': {
        pet.reactDur -= dt;
        if (pet.reactAnim === 'hop') pet.hop = Math.abs(Math.sin(pet.t * 7)) * 16;
        else if (pet.reactAnim === 'type') pet.tilt = Math.sin(pet.t * 16) * 4;
        else if (pet.reactAnim === 'sway') pet.tilt = Math.sin(pet.t * 2) * 5;
        if (pet.reactDur <= 0) {
          pet.tilt = 0;
          if (pet.returnToSleep) { pet.returnToSleep = false; forcedSleep(); }
          else { setState('walk'); pet.decision = 2 + Math.random() * 3; }
        }
        break;
      }
      case 'grabbed': {
        const tx = lastCursor.x - grabOffset.x;
        const ty = lastCursor.y - grabOffset.y;
        const k = Math.min(1, dt * 18);
        pet.x += (tx - pet.x) * k;
        pet.y += (ty - pet.y) * k;
        pet.tilt = Math.sin(pet.t * 9) * 7;
        break;
      }
      case 'falling': {
        pet.vy += GRAVITY * dt;
        pet.x += pet.vx * dt;
        pet.y += pet.vy * dt;
        pet.tilt = Math.max(-24, Math.min(24, pet.vx * 0.012));
        if (pet.x < margin) { pet.x = margin; pet.vx = -pet.vx * 0.6; }
        if (pet.x > bounds.width - margin) { pet.x = bounds.width - margin; pet.vx = -pet.vx * 0.6; }
        if (pet.y < 0) { pet.y = 0; pet.vy = -pet.vy * 0.5; }
        if (pet.y + PET >= floor) {
          pet.y = floor - PET;
          const impact = Math.abs(pet.vy);
          if (impact > 900) pet.hardImpact = true;
          if (impact > 160 && pet.bounces < 4) {
            pet.vy = -impact * 0.42; pet.vx *= 0.72; pet.bounces++;
            pet.squash = 0.62; dust(pet.x, floor);
          } else {
            pet.vx = 0; pet.vy = 0; pet.tilt = 0;
            dust(pet.x, floor);
            if (pet.hardImpact) { setState('dizzy'); setSprite('dizzy'); burst(['⭐', '💫', '⭐'], pet.x, pet.y, 3); showBubble('Oof... saw stars. Literally.', 2200); }
            else { setState('land'); pet.squash = 0.7; }
          }
        }
        break;
      }
      case 'land': {
        if (pet.t > 0.28) { setState('idle'); pet.decision = 1 + Math.random() * 1.5; }
        break;
      }
      case 'dizzy': {
        pet.tilt = Math.sin(pet.t * 6) * 6;
        if (pet.t > 1.8) { pet.tilt = 0; setState('idle'); pet.decision = 1.5; }
        break;
      }
      case 'sleep': {
        setSprite('sleep');
        if (!pet.forced && idleSec < 2) wake('*yawn* ...I was dreaming about seeds.');
        break;
      }
    }

    // natural sleep after a minute of no input (never mid-air / mid-grab / mid-reaction)
    if (idleSec >= 60 && !pet.forced && ['idle','walk','seek','eat','land','dizzy'].includes(pet.state)) {
      naturalSleep();
    }

    // keep feet on the floor unless airborne / held
    if (!['falling','grabbed'].includes(pet.state)) pet.y = floor - PET - pet.hop;
    pet.x = Math.min(Math.max(pet.x, margin), bounds.width - margin);
  }

  // ---------- render ----------
  function render() {
    const px = pet.x - PET / 2;
    const py = pet.y;
    petEl.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    const sy = pet.squash;
    const sx = 2 - sy; // conserve volume-ish
    spriteEl.style.transform = `scaleX(${pet.dir * sx}) scaleY(${sy}) rotate(${pet.tilt}deg)`;
    // keep the speech bubble on screen near the edges
    if (!bubbleEl.classList.contains('hidden')) {
      const half = bubbleEl.offsetWidth / 2;
      let shift = 0;
      if (pet.x + half > bounds.width - 4) shift = (bounds.width - 4) - (pet.x + half);
      else if (pet.x - half < 4) shift = 4 - (pet.x - half);
      bubbleEl.style.marginLeft = shift + 'px';
    }
  }

  // ---------- main loop ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    updateIgnore();
    report(false);
    prevX = pet.x;
    requestAnimationFrame(loop);
  }

  // ---------- boot ----------
  window.magpie.onMetrics(applyMetrics);
  window.magpie.onClipboard(onClipboard);
  window.magpie.onIdle((s) => { idleSec = s; });
  window.magpie.onAction((a) => {
    if (a === 'feed') feed();
    else if (a === 'sleep') forcedSleep();
    else if (a === 'wake') wake('Rise and shine! ✨');
    else if (a === 'quip') quip();
  });

  (async () => {
    await loadSprites();
    const init = await window.magpie.getInit();
    applyMetrics(init.metrics);
    if (init.saved && Number.isFinite(init.saved.x)) pet.x = init.saved.x;
    if (init.saved && Number.isFinite(init.saved.happiness)) pet.happiness = init.saved.happiness;
    pet.y = floor - PET;
    setSprite('idle');
    setState('idle');
    pet.decision = 1.5;
    requestAnimationFrame(loop);
    setTimeout(() => showBubble("Hi! I'm Qwpie 🐦 I live on your taskbar now.", 4200), 700);
  })();
})();
