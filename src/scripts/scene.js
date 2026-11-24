import {
  BufferAttribute, BufferGeometry, Group, PerspectiveCamera, Points, PointsMaterial, Scene, Vector3, WebGLRenderer,
} from 'three';

// Latent-space background: one point cloud per project. Purely decorative; the cards carry the content.
const COLORS = [0xe23c64, 0x2a5be0, 0x0e9f78, 0xd9921a, 0x7b3fd8, 0x1a8fd6, 0xc2410c];
const EDGE = new Vector3(2.6, 0, 0);
const CENTERS = [[-1, -3, -1], [8, 6, 3], [10, -5, -4], [-4, -6, 3], [2, 8, -8], [6, -1, 6], [13, 1, -2]];

export function initScene(canvasHost, cards, labelHost) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    canvasHost.remove();
    return; // no WebGL: the page still works as plain cards
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  canvasHost.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 1, 28);
  const group = new Group();
  scene.add(group);

  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };

  const clusters = cards.map((card, i) => {
    const n = 360, arr = new Float32Array(n * 3), c = CENTERS[i % CENTERS.length];
    for (let k = 0; k < n; k++) {
      arr[k * 3] = c[0] + gauss() * 1.7;
      arr[k * 3 + 1] = c[1] + gauss() * 1.4;
      arr[k * 3 + 2] = c[2] + gauss() * 1.7;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(arr, 3));
    const mat = new PointsMaterial({ size: 0.2, color: COLORS[i % COLORS.length], transparent: true, opacity: 0.85, depthWrite: false });
    const pts = new Points(geo, mat);
    group.add(pts);
    const label = document.createElement('button');
    label.className = 'plabel';
    label.tabIndex = -1; // the cards are the keyboard path; labels are a mouse shortcut
    label.textContent = card.dataset.name;
    label.addEventListener('click', () => {
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      card.querySelector('details').open = true;
    });
    labelHost.appendChild(label);
    return { card, mat, label, center: new Vector3(...c), tags: card.dataset.tags.split('|'), level: 0, target: 0 };
  });

  // Highlight state is driven by the cards (hover), the hero words (hover on mouse, tap/click on touch)
  // and a readout line under the headline, so the effect is visible without scrolling.
  let hoverId = null, clusterId = null, hoverTag = null, stickyTag = null;
  const matches = document.getElementById('matches');
  const words = [...document.querySelectorAll('[data-tag]')];
  const refresh = () => {
    const tag = hoverTag || stickyTag;
    const id = hoverId || clusterId;
    clusters.forEach((c) => {
      const on = id ? c.card.dataset.id === id : tag ? c.tags.includes(tag) : false;
      const any = id || tag;
      c.target = on ? 1 : any ? -1 : 0;
      c.card.classList.toggle('hit', !!on && (!!tag || !!clusterId) && !hoverId);
      c.card.classList.toggle('dim', c.target === -1 && !!tag && !id);
      c.label.classList.toggle('active', on);
    });
    words.forEach((w) => { w.classList.toggle('on', w.dataset.tag === tag); w.setAttribute('aria-pressed', String(w.dataset.tag === stickyTag)); });
    if (matches) {
      matches.textContent = '';
      if (tag) {
        const hits = clusters.filter((c) => c.tags.includes(tag));
        const lead = document.createElement('span'); lead.textContent = `${tag}: `; matches.appendChild(lead);
        hits.forEach((c) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'mchip'; b.textContent = c.card.dataset.name;
          b.addEventListener('click', () => c.label.click());
          matches.appendChild(b);
        });
      }
    }
  };
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => { hoverId = card.dataset.id; refresh(); });
    card.addEventListener('mouseleave', () => { hoverId = null; refresh(); });
  });
  words.forEach((w) => {
    w.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hoverTag = w.dataset.tag; refresh(); } });
    w.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hoverTag = null; refresh(); } });
    w.addEventListener('click', () => { stickyTag = stickyTag === w.dataset.tag ? null : w.dataset.tag; refresh(); });
    w.addEventListener('focus', () => { if (w.matches(':focus-visible')) { hoverTag = w.dataset.tag; refresh(); } });
    w.addEventListener('blur', () => { hoverTag = null; refresh(); });
  });

  let mx = 0, my = 0, px = -1, py = -1, mouseOn = false;
  addEventListener('pointermove', (e) => {
    mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5;
    mouseOn = e.pointerType === 'mouse'; px = e.clientX; py = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { mouseOn = false; }, { passive: true });
  const edge = new Vector3();
  // Mouse over a cluster (screen-space distance to its centre) highlights it and its card.
  function pickCluster() {
    let best = null, bestScore = 1;
    if (mouseOn && innerWidth >= 700) clusters.forEach((c) => {
      const score = Math.hypot(px - c.sx, py - c.sy) / c.sr;
      if (score < bestScore) { bestScore = score; best = c; }
    });
    const id = best ? best.card.dataset.id : null;
    if (id !== clusterId) { clusterId = id; refresh(); document.body.style.cursor = id ? 'pointer' : ''; }
  }

  const v = new Vector3();
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    group.position.x = w > 900 ? 6 : 0; // keep clusters clear of the headline on wide screens
    group.scale.setScalar(w > 900 ? 1 : 0.75);
  }
  addEventListener('resize', resize); resize();

  let t = 0;
  function frame() {
    t += reduce ? 0 : 0.0016;
    group.rotation.y = -0.45 + t + mx * 0.5;
    group.rotation.x = 0.15 + my * 0.25;
    group.updateMatrixWorld();
    const hide = innerWidth < 700;
    clusters.forEach((c) => {
      c.level += (c.target - c.level) * 0.12;
      c.mat.opacity = 0.85 + c.level * 0.15 - (c.level < 0 ? -c.level * 0.55 : 0);
      c.mat.size = 0.2 + Math.max(c.level, 0) * 0.14;
      v.copy(c.center).applyMatrix4(group.matrixWorld).project(camera);
      c.sx = (v.x * 0.5 + 0.5) * innerWidth; c.sy = (-v.y * 0.5 + 0.5) * innerHeight;
      edge.copy(c.center).add(EDGE).applyMatrix4(group.matrixWorld).project(camera);
      c.sr = Math.max(40, Math.hypot((edge.x * 0.5 + 0.5) * innerWidth - c.sx, (-edge.y * 0.5 + 0.5) * innerHeight - c.sy));
      c.label.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight - 40}px) translate(-50%,-100%)`;
      c.label.style.display = hide ? 'none' : '';
    });
    pickCluster();
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }
  frame();
  if (reduce) addEventListener('pointermove', () => frame(), { passive: true });
}
