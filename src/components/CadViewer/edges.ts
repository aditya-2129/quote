import * as THREE from "three";

/**
 * Compute edges per BREP face group so that flat-face tessellation diagonals
 * get correct dihedral angles (≈0°) and are culled by the threshold.
 * Without this, OCCT's per-face vertex pools give EdgesGeometry no adjacency
 * across triangle boundaries, so every triangle edge renders.
 */
export function buildFaceAwareEdges(geo: THREE.BufferGeometry, thresholdDeg: number): THREE.BufferGeometry {
  const idx = geo.index;
  const pos = geo.attributes.position;
  const groups = geo.groups;

  const allEdgePositions: number[] = [];

  const processGroup = (startIdx: number, countIdx: number) => {
    const numTri = Math.floor(countIdx / 3);
    if (numTri === 0) return;

    const subPos: number[] = [];
    const subIdx: number[] = [];

    for (let t = 0; t < numTri; t++) {
      const base = subPos.length / 3;
      const ia = startIdx + t * 3;
      const a = idx ? idx.getX(ia)     : ia;
      const b = idx ? idx.getX(ia + 1) : ia + 1;
      const c = idx ? idx.getX(ia + 2) : ia + 2;
      subPos.push(pos.getX(a), pos.getY(a), pos.getZ(a));
      subPos.push(pos.getX(b), pos.getY(b), pos.getZ(b));
      subPos.push(pos.getX(c), pos.getY(c), pos.getZ(c));
      subIdx.push(base, base + 1, base + 2);
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute("position", new THREE.Float32BufferAttribute(subPos, 3));
    subGeo.setIndex(subIdx);
    const edgeGeo = new THREE.EdgesGeometry(subGeo, thresholdDeg);
    const ePosArr = edgeGeo.attributes.position;
    for (let i = 0; i < ePosArr.count; i++) {
      allEdgePositions.push(ePosArr.getX(i), ePosArr.getY(i), ePosArr.getZ(i));
    }
    edgeGeo.dispose();
    subGeo.dispose();
  };

  if (groups.length > 0) {
    for (const g of groups) processGroup(g.start, g.count);
  } else {
    const totalIdx = idx ? idx.count : Math.floor(pos.count / 3) * 3;
    processGroup(0, totalIdx);
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(allEdgePositions, 3));
  return result;
}
