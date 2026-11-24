import * as THREE from 'three';

// Latent-space background: one point cloud per project. Purely decorative; the cards carry the content.
const COLORS = [0xe23c64, 0x2a5be0, 0x0e9f78, 0xd9921a, 0x7b3fd8, 0x1a8fd6, 0xc2410c];
const CENTERS = [[-1, -3, -1], [8, 6, 3], [10, -5, -4], [-4, -6, 3], [2, 8, -8], [6, -1, 6], [-7, 1, 5]];

export function initScene(canvasHost, cards, labelHost) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    canvasHost.remove();
    return; // no WebGL: the page still works as plain cards
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 1, 28);
  const group = new THREE.Group();
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
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ size: 0.2, color: COLORS[i % COLORS.length], transparent: true, opacity: 0.85, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    group.add(pts);
    const label = document.createElement('button');
    label.className = 'plabel';
    label.textContent = card.dataset.name;
    label.addEventListener('click', () => {
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      card.querySelector('details').open = true;
    });
    labelHost.appendChild(label);
    return { card, mat, label, center: new THREE.Vector3(...c), tags: card.dataset.tags.split('|'), level: 0, target: 0 };
  });

  // Highlight state is driven by the cards (hover) and by the hero words (data-tag).
  let hoverId = null, hoverTag = null;
  const refresh = () => clusters.forEach((c) => {
    const on = hoverId ? c.card.dataset.id === hoverId : hoverTag ? c.tags.includes(hoverTag) : false;
    const any = hoverId || hoverTag;
    c.target = on ? 1 : any ? -1 : 0;
    c.card.classList.toggle('hit', !!on && !!hoverTag && !hoverId);
    c.card.classList.toggle('dim', c.target === -1 && !!hoverTag);
    c.label.classList.toggle('active', on);
  });
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => { hoverId = card.dataset.id; refresh(); });
    card.addEventListener('mouseleave', () => { hoverId = null; refresh(); });
  });
  document.querySelectorAll('[data-tag]').forEach((w) => {
    const on = () => { hoverTag = w.dataset.tag; refresh(); };
    const off = () => { hoverTag = null; refresh(); };
    w.addEventListener('mouseenter', on); w.addEventListener('mouseleave', off);
    w.addEventListener('focus', on); w.addEventListener('blur', off);
  });

  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

  const v = new THREE.Vector3();
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
      c.label.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight - 40}px) translate(-50%,-100%)`;
      c.label.style.display = hide ? 'none' : '';
    });
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }
  frame();
  if (reduce) addEventListener('pointermove', () => frame(), { passive: true });
}
