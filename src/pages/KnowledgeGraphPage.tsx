import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowRight,
  BrainCircuit,
  Eye,
  FlaskConical,
  Layers,
  Network,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { STATUS_META } from '../data/mockData';
import type { KnowledgeNode, NavPage, UserRole } from '../types';

interface KnowledgeGraphPageProps {
  role: UserRole;
  nodes: KnowledgeNode[];
  reduceMotion: boolean;
  onNavigate: (page: NavPage) => void;
}

interface ProjectedLabel {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  scale: number;
}

export const KnowledgeGraphPage: React.FC<KnowledgeGraphPageProps> = ({
  role,
  nodes,
  reduceMotion,
  onNavigate,
}) => {
  const [viewScope, setViewScope] = useState<'student' | 'class'>(
    role === 'teacher' ? 'class' : 'student'
  );
  const [fallback2D, setFallback2D] = useState(reduceMotion);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('recursion');
  const [labels, setLabels] = useState<ProjectedLabel[]>([]);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef({ theta: 0.28, phi: 1.32, radius: 13.5 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const selectedIdRef = useRef(selectedNodeId);

  useEffect(() => {
    selectedIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    setViewScope(role === 'teacher' ? 'class' : 'student');
  }, [role]);

  useEffect(() => {
    if (fallback2D || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x091a32, 0.032);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xbae6fd, 1.4));
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight.position.set(8, 10, 8);
    scene.add(dirLight);
    const cyanLight = new THREE.PointLight(0x0ea5e9, 2.2, 30);
    cyanLight.position.set(-8, -5, 6);
    scene.add(cyanLight);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPos[i] = (Math.random() - 0.5) * 42;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.08, transparent: true, opacity: 0.65 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const nodeMeshes: { id: string; mesh: THREE.Mesh; ring: THREE.Mesh; basePos: THREE.Vector3 }[] = [];
    const nodePosMap = new Map<string, THREE.Vector3>();

    nodes.forEach((node) => {
      const status = viewScope === 'class' ? node.classStatus : node.status;
      const colorHex = STATUS_META[status].hex;
      const pos = new THREE.Vector3(...node.position);
      nodePosMap.set(node.id, pos);

      const sphereRadius = status === 'weak' ? 0.52 : 0.42;
      const geo = new THREE.SphereGeometry(sphereRadius, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        emissive: new THREE.Color(colorHex),
        emissiveIntensity: status === 'weak' ? 0.65 : 0.35,
        roughness: 0.25,
        metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { nodeId: node.id };
      scene.add(mesh);

      const ringGeo = new THREE.RingGeometry(sphereRadius * 1.25, sphereRadius * 1.48, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: status === 'weak' ? 0.65 : 0.3,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      scene.add(ring);

      nodeMeshes.push({ id: node.id, mesh, ring, basePos: pos });
    });

    const flowParticles: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number }[] = [];
    nodes.forEach((node) => {
      const toPos = nodePosMap.get(node.id);
      if (!toPos) return;
      node.prerequisites.forEach((preId) => {
        const fromPos = nodePosMap.get(preId);
        if (!fromPos) return;
        const lineGeo = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4 });
        scene.add(new THREE.Line(lineGeo, lineMat));

        const pGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        scene.add(pMesh);
        flowParticles.push({ mesh: pMesh, from: fromPos, to: toPos, t: Math.random() });
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      rotationRef.current.theta -= dx * 0.006;
      rotationRef.current.phi = Math.max(0.45, Math.min(2.6, rotationRef.current.phi - dy * 0.006));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (isDraggingRef.current) {
        const dx = Math.abs(e.clientX - lastMouseRef.current.x);
        const dy = Math.abs(e.clientY - lastMouseRef.current.y);
        if (dx < 4 && dy < 4) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const intersects = raycaster.intersectObjects(nodeMeshes.map((n) => n.mesh));
          if (intersects.length > 0) {
            const hitId = intersects[0].object.userData.nodeId;
            if (hitId) setSelectedNodeId(hitId);
          }
        }
      }
      isDraggingRef.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rotationRef.current.radius = Math.max(7.5, Math.min(20, rotationRef.current.radius + e.deltaY * 0.008));
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let animId = 0;
    let frameCount = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      frameCount++;

      if (!isDraggingRef.current && !reduceMotion) {
        rotationRef.current.theta += 0.0016;
      }

      const { theta, phi, radius } = rotationRef.current;
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(0.4, 0.4, 0);

      nodeMeshes.forEach(({ id, mesh, ring }) => {
        ring.lookAt(camera.position);
        const isSel = id === selectedIdRef.current;
        const targetScale = isSel ? 1.28 + Math.sin(frameCount * 0.08) * 0.07 : 1;
        mesh.scale.setScalar(targetScale);
        ring.scale.setScalar(isSel ? 1.45 : 1);
      });

      flowParticles.forEach((fp) => {
        fp.t = (fp.t + 0.007) % 1;
        fp.mesh.position.lerpVectors(fp.from, fp.to, fp.t);
      });

      stars.rotation.y += 0.0003;
      renderer.render(scene, camera);

      if (frameCount % 2 === 0) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const nextLabels: ProjectedLabel[] = nodeMeshes.map(({ id, basePos }) => {
          const v = basePos.clone().project(camera);
          const x = (v.x * 0.5 + 0.5) * w;
          const y = (-v.y * 0.5 + 0.5) * h;
          return {
            id,
            x,
            y,
            visible: v.z < 1 && x > -40 && x < w + 40 && y > -20 && y < h + 20,
            scale: Math.max(0.8, Math.min(1.15, 1.3 - v.z * 0.4)),
          };
        });
        setLabels(nextLabels);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [nodes, viewScope, fallback2D, reduceMotion]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const activeStatus = viewScope === 'class' ? selectedNode.classStatus : selectedNode.status;
  const activeScore = viewScope === 'class' ? selectedNode.classMastery : selectedNode.studentMastery;
  const activeMeta = STATUS_META[activeStatus];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Network className="w-6 h-6 text-sky-600" />
            3D 互动知识图谱（Python 数据结构星图）
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            拖拽旋转 · 滚轮缩放 · 点击任意节点查看多证据掌握度与先修依赖关系（颜色 + 文字双编码）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-sky-50 border border-sky-200 p-1 text-xs">
            <button
              onClick={() => setViewScope('student')}
              className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                viewScope === 'student' ? 'bg-sky-600 text-white' : 'text-slate-600 hover:text-sky-700'
              }`}
            >
              个人掌握度视角
            </button>
            <button
              onClick={() => setViewScope('class')}
              className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                viewScope === 'class' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-sky-700'
              }`}
            >
              全班平均掌握度
            </button>
          </div>

          <button
            onClick={() => setFallback2D(!fallback2D)}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-sky-600" />
            {fallback2D ? '切回 3D 星图模式' : '2D 降级兼容视图'}
          </button>

          {!fallback2D && (
            <button
              onClick={() => {
                rotationRef.current = { theta: 0.28, phi: 1.32, radius: 13.5 };
              }}
              className="p-2 rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-slate-600 cursor-pointer"
              title="重置视角"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-slate-500 font-medium">状态图例（颜色+文字说明）：</span>
        {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => {
          const m = STATUS_META[k];
          return (
            <span
              key={k}
              className={`px-2.5 py-1 rounded-full border ${m.bg} ${m.border} ${m.color} font-semibold flex items-center gap-1.5`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.hex }} />
              {m.label}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* 3D / 2D Canvas (Deep Ocean-Blue Space for glowing 3D contrast) */}
        <div className="xl:col-span-8 relative rounded-2xl border border-sky-300/80 bg-gradient-to-br from-[#08172e] via-[#0c2342] to-[#0a1d38] overflow-hidden min-h-[520px] shadow-xl shadow-sky-900/15">
          {!fallback2D ? (
            <>
              <div ref={mountRef} className="w-full h-[520px] cursor-grab active:cursor-grabbing" />
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {labels.map((lbl) => {
                  if (!lbl.visible) return null;
                  const node = nodes.find((n) => n.id === lbl.id);
                  if (!node) return null;
                  const st = viewScope === 'class' ? node.classStatus : node.status;
                  const sc = viewScope === 'class' ? node.classMastery : node.studentMastery;
                  const isSelected = node.id === selectedNodeId;
                  const dotHex = STATUS_META[st].hex;
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      style={{
                        transform: `translate(-50%, -140%) translate(${lbl.x}px, ${lbl.y}px) scale(${lbl.scale})`,
                      }}
                      className={`pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold backdrop-blur-md border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-sky-500 text-white border-white shadow-lg shadow-sky-400/40 z-20'
                          : 'bg-slate-950/75 text-sky-50 border-sky-400/35 hover:border-sky-300 z-10'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotHex }} />
                      <span>{node.label}</span>
                      <span className="text-sky-200">{sc > 0 ? `${sc}%` : '未学'}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-slate-950/70 border border-sky-400/30 text-[11px] text-sky-100">
                🖱️ 左键拖拽旋转 3D 星图 · 滚轮缩放 · 浅蓝光粒表示先修知识依赖方向
              </div>
            </>
          ) : (
            <div className="p-5 space-y-4 bg-white/95 h-full">
              <div className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
                已启用低性能设备 2D 降级卡片视图，保留全部先修关系与掌握度详情。
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {nodes.map((node) => {
                  const st = viewScope === 'class' ? node.classStatus : node.status;
                  const sc = viewScope === 'class' ? node.classMastery : node.studentMastery;
                  const meta = STATUS_META[st];
                  return (
                    <button
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedNodeId === node.id
                          ? 'bg-sky-50 border-sky-500 shadow-sm'
                          : 'bg-white border-sky-100 hover:border-sky-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">{node.chapter}</span>
                        <span className={`${meta.color} font-semibold`}>{meta.label}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800">{node.label}</div>
                      <div className="mt-2 h-1.5 rounded-full bg-sky-100 overflow-hidden">
                        <div className="h-full" style={{ width: `${sc}%`, backgroundColor: meta.hex }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="xl:col-span-4 glass-panel rounded-2xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-sky-600 font-semibold">{selectedNode.chapter}</span>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">{selectedNode.label}</h2>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${activeMeta.bg} ${activeMeta.border} ${activeMeta.color}`}
              >
                {activeScore > 0 ? `${activeScore}% · ` : ''}
                {activeMeta.label}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">{selectedNode.description}</p>

            {selectedNode.keyFormula && (
              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 font-mono text-xs text-sky-900 font-medium">
                {selectedNode.keyFormula}
              </div>
            )}

            <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3.5 space-y-2.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-sky-600" />
                多证据综合掌握度拆解（非单次答题决定）
              </div>
              {[
                { label: '课堂测验证据', val: selectedNode.evidence.quizScore },
                { label: '课后作业证据', val: selectedNode.evidence.homeworkScore },
                { label: '先修节点支撑度', val: selectedNode.evidence.prereqScore },
              ].map((ev) => (
                <div key={ev.label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-600">{ev.label}</span>
                    <span className="text-slate-800 font-mono font-semibold">{ev.val}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                      style={{ width: `${ev.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600">先修依赖节点：</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedNode.prerequisites.length === 0 ? (
                  <span className="text-xs text-slate-400">入门根节点，无先修要求</span>
                ) : (
                  selectedNode.prerequisites.map((preId) => {
                    const pre = nodes.find((n) => n.id === preId);
                    if (!pre) return null;
                    return (
                      <button
                        key={preId}
                        onClick={() => setSelectedNodeId(preId)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-sky-50 border border-sky-200 text-xs text-sky-700 font-medium cursor-pointer"
                      >
                        ← {pre.label} ({viewScope === 'class' ? pre.classMastery : pre.studentMastery}%)
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-sky-100">
            <button
              onClick={() => onNavigate('diagnostics')}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-sky-500/20"
            >
              <BrainCircuit className="w-4 h-4" />
              {role === 'teacher' ? '查看本节点班级错因与投屏讲评' : `进入 AI 错题诊断（关联 ${selectedNode.mistakeCount} 题）`}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('virtual-lab')}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-semibold cursor-pointer flex items-center justify-center gap-2"
            >
              <FlaskConical className="w-4 h-4" />
              启动关联 3D 虚拟实验演示
            </button>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 justify-center pt-1">
              <Sparkles className="w-3 h-3 text-sky-500" />
              完成变式巩固后，此处掌握度将实时跃升
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
