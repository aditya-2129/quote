import { useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { analyzeShape } from "@utils/shapeAnalysis";
import type {
  CadViewerProps,
  SceneMeshRecord,
} from "./types";
import {
  axisConstrain,
  makeFindScreenSpaceSnap,
  makeGetSnappedPoint,
  makeMakeDot,
} from "./measure";
import {
  setCameraOrientation,
  fitCamera,
} from "./fitCamera";
import {
  initScene,
  makeAnimateLoop,
  makeResize,
  disposeScene,
} from "./scene";
import { applyClippingPlane, applyViewerAppearance } from "./appearance";
import { createCadViewerHandle } from "./imperativeHandle";

export type { CadViewOrientation, CadDisplayMode, CadViewportTheme, CadViewerHandle } from "./types";

export function CadViewer({
  model,
  selectedMeshId,
  hiddenMeshIds,
  displayMode,
  viewportTheme,
  explode,
  showEdges = true,
  bgColor,
  clippingPlane,
  measureMode,
  selectionFilter = "point",
  onSelectMesh,
  onMeasured,
  onBodyMeasure,
  ref,
}: CadViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const recordsRef = useRef<SceneMeshRecord[]>([]);
  const modelSizeRef = useRef(1);
  const modelScaleRef = useRef(1);
  const selectedMeshIdRef = useRef(selectedMeshId);
  const measureModeRef = useRef(measureMode ?? false);
  const onMeasuredRef = useRef(onMeasured);
  const onSelectMeshRef = useRef(onSelectMesh);
  const measurePointsRef = useRef<THREE.Vector3[]>([]);
  const measureObjectsRef = useRef<THREE.Object3D[]>([]);
  const measurePointARef = useRef<THREE.Vector3 | null>(null);
  const shiftPressedRef = useRef(false);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const snapIndicatorRef = useRef<THREE.Mesh | null>(null);
  const currentSnapRef = useRef<THREE.Vector3 | null>(null);
  const hoveredMeshIdRef = useRef<string | null>(null);
  const selectionFilterRef = useRef<"body" | "point">(selectionFilter);
  const onBodyMeasureRef = useRef(onBodyMeasure);
  useEffect(() => { selectedMeshIdRef.current = selectedMeshId; }, [selectedMeshId]);
  useEffect(() => {
    measureModeRef.current = measureMode ?? false;
    if (!measureMode) {
      if (snapIndicatorRef.current) snapIndicatorRef.current.visible = false;
      if (previewLineRef.current) previewLineRef.current.visible = false;
      measurePointARef.current = null;
    }
  }, [measureMode]);
  useEffect(() => { onMeasuredRef.current = onMeasured; }, [onMeasured]);
  useEffect(() => { onSelectMeshRef.current = onSelectMesh; }, [onSelectMesh]);
  useEffect(() => { selectionFilterRef.current = selectionFilter; }, [selectionFilter]);
  useEffect(() => { onBodyMeasureRef.current = onBodyMeasure; }, [onBodyMeasure]);

  useImperativeHandle(ref, () => createCadViewerHandle({
    cameraRef,
    controlsRef,
    rendererRef,
    sceneRef,
    recordsRef,
    hiddenMeshIds,
    modelSizeRef,
    measurePointsRef,
    measurePointARef,
    measureObjectsRef,
    previewLineRef,
    snapIndicatorRef,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const bundle = initScene(container, model, recordsRef, modelSizeRef, modelScaleRef);
    const { scene, camera, renderer, controls } = bundle;
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
    controlsRef.current = controls;

    // Measure overlay objects
    const previewLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const previewLine = new THREE.Line(
      previewLineGeo,
      new THREE.LineBasicMaterial({ color: "#f59e0b", depthTest: false, transparent: true, opacity: 0.6 }),
    );
    previewLine.renderOrder = 997;
    previewLine.visible = false;
    scene.add(previewLine);
    previewLineRef.current = previewLine;

    const snapIndicatorMat = new THREE.MeshBasicMaterial({ color: "#22c55e", depthTest: false });
    const snapIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 12, 12),
      snapIndicatorMat,
    );
    snapIndicator.renderOrder = 1000;
    snapIndicator.visible = false;
    scene.add(snapIndicator);
    snapIndicatorRef.current = snapIndicator;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const setSnapIndicatorColor = (type: 'vertex' | 'edge' | null) => {
      if (type === 'vertex') snapIndicatorMat.color.set("#22c55e");      // green
      else if (type === 'edge') snapIndicatorMat.color.set("#f59e0b");   // amber
    };

    const findScreenSpaceSnap = makeFindScreenSpaceSnap({ records: recordsRef, renderer, camera });
    const getSnappedPoint = makeGetSnappedPoint({
      findScreenSpaceSnap,
      setSnapIndicatorColor,
      renderer,
      camera,
      pointer,
      raycaster,
      records: recordsRef,
    });
    const makeDot = makeMakeDot({ camera, scene, measureObjectsRef });

    const applyHoverState = (meshId: string | null) => {
      if (hoveredMeshIdRef.current !== null) {
        const prev = recordsRef.current.find(r => r.meshId === hoveredMeshIdRef.current);
        if (prev) {
          const sel = prev.meshId === selectedMeshIdRef.current;
          prev.materials.forEach(m => { m.emissive.set(sel ? "#38bdf8" : "#000000"); m.emissiveIntensity = sel ? 0.65 : 0; });
        }
      }
      if (meshId !== null) {
        const rec = recordsRef.current.find(r => r.meshId === meshId);
        if (rec && rec.meshId !== selectedMeshIdRef.current) {
          rec.materials.forEach(m => { m.emissive.set("#38bdf8"); m.emissiveIntensity = 0.25; });
        }
      }
      hoveredMeshIdRef.current = meshId;
    };

    const handlePointerMove = (event: PointerEvent) => {
      // Hover highlight — always active
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hoverHits = raycaster.intersectObjects(recordsRef.current.map(r => r.mesh), false);
      const hitId = (hoverHits[0]?.object.userData.meshId as string | undefined) ?? null;
      if (hitId !== hoveredMeshIdRef.current) applyHoverState(hitId);

      if (!measureModeRef.current || selectionFilterRef.current === "body") {
        if (!measureModeRef.current) {
          snapIndicator.visible = false;
          previewLine.visible = false;
          currentSnapRef.current = null;
        }
        return;
      }

      const snapped = getSnappedPoint(event);
      if (!snapped) {
        snapIndicator.visible = false;
        previewLine.visible = false;
        currentSnapRef.current = null;
        return;
      }
      currentSnapRef.current = snapped;
      snapIndicator.position.copy(snapped);
      snapIndicator.visible = true;
      const ptA = measurePointARef.current;
      if (ptA) {
        const ptB = shiftPressedRef.current ? axisConstrain(ptA, snapped) : snapped;
        const positions = previewLine.geometry.attributes.position as THREE.BufferAttribute;
        positions.setXYZ(0, ptA.x, ptA.y, ptA.z);
        positions.setXYZ(1, ptB.x, ptB.y, ptB.z);
        positions.needsUpdate = true;
        previewLine.geometry.computeBoundingSphere();
        previewLine.visible = true;
      }
    };

    const handlePointerLeave = () => {
      applyHoverState(null);
      snapIndicator.visible = false;
      previewLine.visible = false;
      currentSnapRef.current = null;
    };

    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = true; };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === "Shift") shiftPressedRef.current = false; };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = recordsRef.current.map(r => r.mesh);
      const hits = raycaster.intersectObjects(meshes, false);

      if (measureModeRef.current) {
        if (selectionFilterRef.current === "body") {
          const meshId = hits[0]?.object.userData.meshId as string | undefined;
          if (!meshId) return;
          const rec = recordsRef.current.find(r => r.meshId === meshId);
          if (!rec) return;
          const analysis = analyzeShape(rec.mesh.geometry);
          onBodyMeasureRef.current?.(analysis, meshId);
          rec.edgeMaterial.color.set("#f59e0b");
          rec.edgeMaterial.opacity = 1;
          rec.edges.visible = true;
          setTimeout(() => {
            const isSelected = rec.meshId === selectedMeshIdRef.current;
            rec.edgeMaterial.color.set(isSelected ? "#38bdf8" : "#111827");
            rec.edgeMaterial.opacity = isSelected ? 1 : 0.38;
          }, 600);
          return;
        }
        const pt = currentSnapRef.current?.clone() ?? (hits.length > 0 ? hits[0].point.clone() : null);
        if (!pt) {
          // Clicked empty space — cancel in-progress measurement
          if (measurePointARef.current !== null) {
            measurePointARef.current = null;
            measureObjectsRef.current.forEach(o => scene.remove(o));
            measureObjectsRef.current = [];
            previewLine.visible = false;
          }
          return;
        }

        if (measurePointARef.current === null) {
          // Clear any previous measurement before starting a new one
          measureObjectsRef.current.forEach(o => scene.remove(o));
          measureObjectsRef.current = [];
          measurePointARef.current = pt;
          makeDot(pt);
        } else {
          const ptB = shiftPressedRef.current ? axisConstrain(measurePointARef.current, pt) : pt;
          makeDot(ptB);
          const lineGeo = new THREE.BufferGeometry().setFromPoints([measurePointARef.current, ptB]);
          const line = new THREE.Line(
            lineGeo,
            new THREE.LineBasicMaterial({ color: "#f59e0b", depthTest: false }),
          );
          line.renderOrder = 998;
          scene.add(line);
          measureObjectsRef.current.push(line);
          const distMm = measurePointARef.current.distanceTo(ptB) / modelScaleRef.current;
          onMeasuredRef.current?.(distMm);
          measurePointARef.current = null;
          previewLine.visible = false;
        }
        return;
      }

      const meshId = hits[0]?.object.userData.meshId as string | undefined;
      if (!meshId || meshId === selectedMeshIdRef.current) {
        onSelectMeshRef.current?.(undefined);
      } else {
        onSelectMeshRef.current?.(meshId);
      }
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    const resize = makeResize({ container, renderer, camera });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    setCameraOrientation({
      orientation: "iso",
      camera,
      controls,
      records: recordsRef.current,
      modelSize: modelSizeRef.current,
    });
    fitCamera({
      camera,
      controls,
      records: recordsRef.current,
      hiddenMeshIds: new Set<string>(),
    });

    const animLoop = makeAnimateLoop({
      renderer,
      scene,
      camera,
      controls,
      gizmoScene: bundle.gizmoScene,
      gizmoCamera: bundle.gizmoCamera,
    });
    animLoop.start();

    return () => {
      animLoop.stop();
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      disposeScene({
        bundle,
        container,
        recordsRef,
        measureObjectsRef,
        measurePointsRef,
        measurePointARef,
        currentSnapRef,
        previewLine,
        snapIndicator,
      });
      previewLineRef.current = null;
      snapIndicatorRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    hoveredMeshIdRef.current = null;
    applyViewerAppearance({
      renderer: rendererRef.current,
      records: recordsRef.current,
      selectedMeshId,
      hiddenMeshIds,
      displayMode,
      viewportTheme,
      explode,
      showEdges,
      bgColor,
    });
  }, [bgColor, displayMode, explode, hiddenMeshIds, selectedMeshId, showEdges, viewportTheme]);

  useEffect(() => {
    applyClippingPlane(rendererRef.current, clippingPlane);
  }, [clippingPlane]);

  return <div ref={containerRef} className="h-full w-full" aria-label={model.fileName} />;
}
