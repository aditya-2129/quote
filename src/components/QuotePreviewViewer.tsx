import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CadImportResult } from "@utils/index";

export type QuotePreviewViewerHandle = {
  fit: (meshIds?: string[]) => void;
  /** Render an isometric snapshot at the given size and return PNG dataURL. Resets the camera to default framing first; restores size after. Returns null if the scene isn't ready. */
  screenshot: (width?: number, height?: number) => string | null;
};

type Props = {
  model: CadImportResult;
  hiddenMeshIds: Set<string>;
  selectedMeshIds?: Set<string>;
  bgColor?: string;
  ref?: Ref<QuotePreviewViewerHandle>;
};

type Record = {
  meshId: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  materials: THREE.MeshStandardMaterial[];
  edgeMaterial: THREE.LineBasicMaterial;
};

export function QuotePreviewViewer({
  model,
  hiddenMeshIds,
  selectedMeshIds,
  bgColor = "#f8fafc",
  ref,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const recordsRef = useRef<Record[]>([]);
  // Render-on-demand: requestRender() schedules a single rAF; the frame loop
  // only spins while damping is settling, then stops.
  const requestRenderRef = useRef<() => void>(() => {});

  const fit = (meshIds?: string[]) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const box = new THREE.Box3();
    const targets = meshIds && meshIds.length > 0
      ? (() => {
          const want = new Set(meshIds);
          return recordsRef.current.filter(r => want.has(r.meshId));
        })()
      : recordsRef.current.filter(r => r.mesh.visible);
    targets.forEach(r => box.expandByObject(r.mesh));
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const distance = maxSize * 1.9;

    controls.target.copy(center);
    camera.position.set(center.x + distance, center.y + distance * 0.78, center.z + distance);
    camera.near = Math.max(distance / 500, 0.01);
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
    controls.update();
    requestRenderRef.current();
  };

  const screenshot = (width = 600, height = 540): string | null => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const scene = sceneRef.current;
    if (!renderer || !camera || !controls || !scene) return null;

    // Save current viewport + per-mesh visibility / highlight so the on-screen
    // preview snaps back unchanged after the snapshot.
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevAspect = camera.aspect;
    const prevVisibility = recordsRef.current.map(r => ({
      mesh: r.mesh.visible,
      edges: r.edges.visible,
      emissive: r.materials.map(m => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity })),
      edgeColor: r.edgeMaterial.color.clone(),
      edgeOpacity: r.edgeMaterial.opacity,
    }));

    // Force the full assembly into view: every mesh visible, no selection
    // highlight. The user might have a single part isolated for editing — the
    // exported quotation should still show the whole assembly.
    recordsRef.current.forEach((r) => {
      r.mesh.visible = true;
      r.edges.visible = true;
      r.materials.forEach(m => {
        m.emissive.set("#000000");
        m.emissiveIntensity = 0;
      });
      r.edgeMaterial.color.set("#111827");
      r.edgeMaterial.opacity = 0.38;
    });

    // Resize for the snapshot and reset camera to default isometric framing.
    // The third arg `updateStyle=false` keeps the DOM canvas style at its
    // current size so the user doesn't see a flicker; only the drawing buffer
    // grows for the snapshot.
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    fit(); // bounds expand to include every now-visible mesh
    controls.update();
    renderer.render(scene, camera);

    // toDataURL must run synchronously after render(): the WebGL drawing
    // buffer isn't preserved across frames (preserveDrawingBuffer = false).
    const dataUrl = renderer.domElement.toDataURL("image/png");

    // Restore visibility + highlight.
    recordsRef.current.forEach((r, i) => {
      const prev = prevVisibility[i];
      if (!prev) return;
      r.mesh.visible = prev.mesh;
      r.edges.visible = prev.edges;
      r.materials.forEach((m, j) => {
        const e = prev.emissive[j];
        if (!e) return;
        m.emissive.copy(e.color);
        m.emissiveIntensity = e.intensity;
      });
      r.edgeMaterial.color.copy(prev.edgeColor);
      r.edgeMaterial.opacity = prev.edgeOpacity;
    });

    // Restore the live preview size + camera.
    renderer.setSize(prevSize.x, prevSize.y, true);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    controls.update();
    renderer.render(scene, camera);

    return dataUrl;
  };

  useImperativeHandle(ref, () => ({ fit, screenshot }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(bgColor);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    // Quote preview is view-only — left orbits, right pans, wheel zooms.
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight("#ffffff", "#6b7280", 2.7));
    const keyLight = new THREE.DirectionalLight("#ffffff", 3.2);
    keyLight.position.set(160, 220, 180);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#bdefff", 1.4);
    fillLight.position.set(-220, 100, -160);
    scene.add(fillLight);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const bounds = new THREE.Box3();
    const tempMeshes: THREE.Mesh[] = [];
    model.meshes.forEach((cadMesh) => {
      const geometry = cadMesh.geometry.clone();
      const makeMat = (color: string) =>
        new THREE.MeshStandardMaterial({
          color,
          metalness: 0.12,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });
      const materials =
        cadMesh.faceColors && cadMesh.faceColors.length > 0
          ? cadMesh.faceColors.map(makeMat)
          : [makeMat(cadMesh.color)];
      const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
      mesh.userData.meshId = cadMesh.id;
      tempMeshes.push(mesh);
      bounds.expandByObject(mesh);
    });

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const scale = 420 / maxSize;

    tempMeshes.forEach((mesh, index) => {
      mesh.geometry.translate(-center.x, -center.y, -center.z);
      mesh.scale.setScalar(scale);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeVertexNormals();

      const cadMesh = model.meshes[index];
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: "#111827",
        transparent: true,
        opacity: 0.38,
      });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), edgeMaterial);
      edges.scale.copy(mesh.scale);

      modelGroup.add(mesh);
      modelGroup.add(edges);
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.MeshStandardMaterial[])
        : [mesh.material as THREE.MeshStandardMaterial];
      recordsRef.current.push({ meshId: cadMesh.id, mesh, edges, materials: mats, edgeMaterial });
    });

    // Render-on-demand frame pump: render once, then only re-render if something
    // requests it (camera change via OrbitControls, visibility/selection effects,
    // resize, or fit). Damping stays smooth because OrbitControls fires `change`
    // on every interpolated tick until it converges.
    let pendingFrame = 0;
    const renderFrame = () => {
      pendingFrame = 0;
      controls.update();
      renderer.render(scene, camera);
    };
    const requestRender = () => {
      if (pendingFrame !== 0) return;
      pendingFrame = window.requestAnimationFrame(renderFrame);
    };
    requestRenderRef.current = requestRender;
    controls.addEventListener("change", requestRender);

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const width = Math.max(container.clientWidth || bounds.width, 1);
      // Floor at 120px so a fully-collapsed parent doesn't reduce to zero, but
      // otherwise honour whatever height the parent gives us (the Quote page
      // uses a ~280px slot; the Viewer page gives full available height).
      const height = Math.max(container.clientHeight || bounds.height, 120);
      renderer.setSize(width, height, true);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      requestRender();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    fit();

    return () => {
      if (pendingFrame !== 0) window.cancelAnimationFrame(pendingFrame);
      controls.removeEventListener("change", requestRender);
      requestRenderRef.current = () => {};
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      recordsRef.current.forEach((r) => {
        r.mesh.geometry.dispose();
        r.edges.geometry.dispose();
        r.materials.forEach(m => m.dispose());
        r.edgeMaterial.dispose();
      });
      recordsRef.current = [];
      container.removeChild(renderer.domElement);
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
    };
  // Scene setup is intentionally tied to model identity; bg and visibility
  // changes are applied by the narrower effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Apply visibility + selection highlight without rebuilding the scene.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer) renderer.setClearColor(bgColor);
    // Only apply the cyan highlight in "show full assembly" mode, where it
    // distinguishes the selected part from the rest. In isolate mode the
    // selected part is the ONLY thing visible, so the highlight just washes
    // out the real material colour for no information gain.
    const isolating = hiddenMeshIds.size > 0;
    recordsRef.current.forEach((r) => {
      const hidden = hiddenMeshIds.has(r.meshId);
      const selected = !isolating && (selectedMeshIds?.has(r.meshId) ?? false);
      r.mesh.visible = !hidden;
      r.edges.visible = !hidden;
      r.materials.forEach(m => {
        m.emissive.set(selected ? "#38bdf8" : "#000000");
        m.emissiveIntensity = selected ? 0.55 : 0;
      });
      r.edgeMaterial.color.set(selected ? "#38bdf8" : "#111827");
      r.edgeMaterial.opacity = selected ? 1 : 0.38;
    });
    requestRenderRef.current();
  }, [hiddenMeshIds, selectedMeshIds, bgColor]);

  return <div ref={containerRef} className="h-full w-full" aria-label={model.fileName} />;
}
