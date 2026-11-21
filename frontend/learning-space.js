import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// HTML buttons expose the same nodes when WebGL is unavailable or a keyboard is used.
export function mountSpace(
  el,
  { nodes = [], edges = [], onSelect, stack = false },
) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  el.append(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 90);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 16;
  camera.position.set(stack ? 3 : 1.5, stack ? 3.5 : 1.2, stack ? 6.7 : 8.7);
  controls.target.set(0, 0.1, 0);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight("#fff7ec", "#667eb1", 2));
  const light = new THREE.DirectionalLight("#fff4da", 3.4);
  light.position.set(-3, 6, 4);
  scene.add(light);
  const grid = new THREE.GridHelper(18, 30, "#425688", "#26385d");
  grid.position.y = -1.72;
  scene.add(grid);
  const labels = [],
    picks = [];
  const positions = nodes.map((n, i) => new THREE.Vector3(...n.position));
  function mesh(geo, color, pos) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.42,
        metalness: 0.12,
      }),
    );
    m.position.copy(pos);
    group.add(m);
    return m;
  }
  edges.forEach(([a, b]) => {
    if (!positions[a] || !positions[b]) return;
    const g = new THREE.BufferGeometry().setFromPoints([
      positions[a],
      positions[b],
    ]);
    group.add(
      new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x94b4e5 })),
    );
  });
  if (stack) {
    mesh(
      new THREE.CylinderGeometry(1.45, 1.51, 0.16, 48),
      "#7288ad",
      new THREE.Vector3(0, -1.52, 0),
    );
  }
  nodes.forEach((n, i) => {
    const m = mesh(
      stack
        ? new THREE.BoxGeometry(2.2, 0.34, 1.24)
        : new THREE.IcosahedronGeometry(i === 0 ? 0.36 : 0.25, 1),
      n.color,
      positions[i],
    );
    if (stack) m.rotation.y = i * 0.055;
    m.userData.index = i;
    picks.push(m);
    const label = document.createElement("button");
    label.type = "button";
    label.className = "space-node";
    label.textContent = n.label;
    label.onclick = () => onSelect?.(i);
    el.append(label);
    labels.push(label);
  });
  const draw = () => {
    renderer.render(scene, camera);
    labels.forEach((lbl, i) => {
      const p = positions[i].clone();
      p.y += stack ? 0.02 : 0.41;
      p.project(camera);
      lbl.style.left = (p.x * 0.5 + 0.5) * 100 + "%";
      lbl.style.top = (0.5 - p.y * 0.5) * 100 + "%";
      lbl.hidden = p.z > 1 || p.z < -1;
    });
  };
  const resize = () => {
    const w = el.clientWidth,
      h = el.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    draw();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  controls.addEventListener("change", draw);
  let down;
  renderer.domElement.onpointerdown = (e) => {
    down = [e.clientX, e.clientY];
  };
  renderer.domElement.onpointerup = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5)
      return;
    const b = renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        (2 * (e.clientX - b.left)) / b.width - 1,
        1 - (2 * (e.clientY - b.top)) / b.height,
      ),
      camera,
    );
    const hit = ray.intersectObjects(picks)[0];
    if (hit) onSelect?.(hit.object.userData.index);
  };
  controls.update();
  resize();
  return () => {
    ro.disconnect();
    controls.dispose();
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material?.dispose();
    });
    renderer.dispose();
    renderer.forceContextLoss();
    el.replaceChildren();
  };
}
