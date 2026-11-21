import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree, invalidate } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei/core/RoundedBox";
import { Edges } from "@react-three/drei/core/Edges";
import * as THREE from "three";

const mint = "#4c63c6",
  dark = "#223ba4",
  pale = "#b4bde6",
  copper = "#de5130",
  gold = "#dcab69";
function Cube({ p, s, color, r = 0.055, edge = false, rot = [0, 0, 0] }) {
  return (
    <RoundedBox args={s} radius={r} smoothness={3} position={p} rotation={rot}>
      <meshStandardMaterial color={color} roughness={0.43} metalness={0.09} />
      {edge && <Edges threshold={32} color="#d0e8d9" />}
    </RoundedBox>
  );
}
function Disc({ p, r, h, color, top = r }) {
  return (
    <mesh position={p}>
      <cylinderGeometry args={[top, r, h, 72]} />
      <meshStandardMaterial color={color} roughness={0.38} metalness={0.2} />
    </mesh>
  );
}
function Rod({ start, end, r = 0.027, color = gold }) {
  const a = new THREE.Vector3(...start),
    b = new THREE.Vector3(...end),
    mid = a.clone().add(b).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return (
    <mesh position={mid} quaternion={q}>
      <cylinderGeometry args={[r, r, a.distanceTo(b), 10]} />
      <meshStandardMaterial color={color} metalness={0.36} roughness={0.36} />
    </mesh>
  );
}
function Dial() {
  return (
    <group position={[0, 1.39, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
      <Disc p={[0, 0, 0]} r={0.22} h={0.13} color={gold} />
      <Disc p={[0, 0.085, 0]} r={0.125} h={0.05} color={dark} />
    </group>
  );
}
function Pan({ x, ball }) {
  return (
    <group position={[x, 0, 0]}>
      {[
        [0, -0.58],
        [-0.56, 0.35],
        [0.56, 0.35],
      ].map(([dx, z], i) => (
        <Rod key={i} start={[0, 1.49, 0]} end={[dx, -0.03, z]} />
      ))}
      <Disc p={[0, -0.095, 0]} r={0.46} top={0.73} h={0.15} color={gold} />
      <Disc p={[0, -0.017, 0]} r={0.735} h={0.055} color="#f0ca92" />
      {ball ? (
        <>
          <mesh position={[0.05, 0.36, 0]}>
            <sphereGeometry args={[0.39, 44, 32]} />
            <meshStandardMaterial color={copper} roughness={0.32} />
          </mesh>
        </>
      ) : (
        <group rotation={[0, -0.19, 0]}>
          <Cube p={[-0.18, 0.205, 0.12]} s={[0.45, 0.43, 0.44]} color={mint} />
          <Cube p={[0.17, 0.21, -0.15]} s={[0.44, 0.44, 0.44]} color={dark} />
          <Cube p={[-0.06, 0.63, -0.02]} s={[0.43, 0.41, 0.43]} color={pale} />
        </group>
      )}
    </group>
  );
}
function Scale() {
  return (
    <group rotation={[0, -0.16, 0]}>
      <Disc p={[0, -0.95, 0]} r={1.23} top={1.19} h={0.23} color={dark} />
      <Disc p={[0, -0.81, 0]} r={1.17} top={1.09} h={0.115} color={mint} />
      <Disc p={[0, -0.69, 0]} r={0.55} top={0.4} h={0.16} color={gold} />
      <Disc p={[0, 0.25, 0]} r={0.18} top={0.12} h={1.88} color={mint} />
      <Disc p={[0, 0.99, 0]} r={0.2} top={0.19} h={0.12} color={gold} />
      <Cube p={[0, 1.36, 0]} s={[4.35, 0.2, 0.22]} color={mint} r={0.095} />
      <Dial />
      <mesh position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.17, 36, 20]} />
        <meshStandardMaterial color={gold} metalness={0.24} roughness={0.3} />
      </mesh>
      <Pan x={-1.89} />
      <Pan x={1.89} ball />
    </group>
  );
}
function Instruments({ rates }) {
  return (
    <group position={[0, -0.7, 0]} rotation={[0, -0.16, 0]}>
      <Cube p={[0, -0.16, 0]} s={[5, 0.27, 1.95]} r={0.13} color="#aaa79a" />
      {[mint, copper, "#8496d9"].map((color, i) => {
        const height = 0.14 + 2.35 * (rates[i] || 0);
        return (
          <group key={color} position={[(i - 1) * 1.47, 0, 0]}>
            <Disc p={[0, 0.03, 0]} h={0.13} r={0.58} color="#edeadd" />
            <Disc
              p={[0, height / 2 + 0.1, 0]}
              r={0.46}
              h={height}
              color={color}
            />
            <Disc p={[0, height + 0.12, 0]} h={0.055} r={0.48} color={color} />
          </group>
        );
      })}
    </group>
  );
}
function Rig({ host, rates }) {
  const g = useRef(null);
  const { invalidate: refresh } = useThree();
  useEffect(() => {
    let last = null;
    const down = (e) => {
        last = e.clientX;
        host.setPointerCapture(e.pointerId);
      },
      move = (e) => {
        if (last === null || !g.current) return;
        g.current.rotation.y += (e.clientX - last) * 0.009;
        last = e.clientX;
        refresh();
      },
      up = () => (last = null);
    const key = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        g.current.rotation.y += e.key === "ArrowLeft" ? -0.17 : 0.17;
        refresh();
      }
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("keydown", key);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("keydown", key);
    };
  }, [host, refresh]);
  return (
    <group ref={g} position={[0, -0.1, 0]}>
      {rates ? <Instruments rates={rates} /> : <Scale />}
    </group>
  );
}
function FitCamera({ compact }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(
      size.width / (compact ? 6.5 : 6.75),
      size.height / (compact ? 3.95 : 3.72),
    );
    camera.lookAt(0, 0.22, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [size, camera, compact, invalidate]);
  return null;
}
export function mountModel(host, rates) {
  const ctxCanvas = document.createElement("canvas");
  const ctx = ctxCanvas.getContext("webgl2");
  if (!ctx) return null;
  ctx.getExtension("WEBGL_lose_context")?.loseContext();
  const root = createRoot(host);
  function draw(values) {
    root.render(
      <Canvas
        orthographic
        camera={{ position: [3.9, 3, 8.7], near: 0.1, far: 80, zoom: 50 }}
        dpr={[1, 1.7]}
        frameloop="demand"
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
          preserveDrawingBuffer: true,
        }}
        onCreated={() => {
          host.parentElement?.classList.add("rendered");
          invalidate();
        }}
      >
        <ambientLight intensity={1.4} />
        <hemisphereLight args={["#fff9e9", "#80a994", 1.5]} />
        <directionalLight
          position={[-3, 6, 5]}
          intensity={3.4}
          color="#fff6df"
        />
        <directionalLight
          position={[5, 4, -4]}
          intensity={2.7}
          color="#bafbe6"
        />
        <FitCamera compact={!!values} />
        <Rig host={host} rates={values} />
      </Canvas>,
    );
  }
  draw(rates);
  return { update: draw, destroy: () => root.unmount() };
}
