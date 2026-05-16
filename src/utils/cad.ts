import * as THREE from "three";
import type { StepGeometryInput } from "../types";

type BrepFace = {
  first: number;
  last: number;
  color?: number[];
};

type OcctMesh = {
  name?: string;
  color?: number[];
  brep_faces?: BrepFace[];
  attributes?: {
    position?: { array?: number[] };
    normal?: { array?: number[] };
  };
  index?: { array?: number[] };
};

type OcctNode = {
  name?: string;
  meshes?: number[];
  children?: OcctNode[];
};

export type CadTreeNode = {
  id: string;
  name: string;
  meshIds: string[];
  children: CadTreeNode[];
};

export type CadMesh = {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  color: string;
  faceColors?: string[];
  triangleCount: number;
  vertexCount: number;
  center: THREE.Vector3;
  occtIndex: number;
};

export type CadImportResult = {
  fileName: string;
  meshes: CadMesh[];
  rootNode: CadTreeNode;
  geometry: StepGeometryInput;
  source: "step" | "sample";
  warning?: string;
};

function createBoxGeometrySummary(
  fileName: string,
  width: number,
  height: number,
  depth: number,
): StepGeometryInput {
  return {
    fileName,
    boundingBoxMm: { x: width, y: height, z: depth },
    volumeMm3: width * height * depth,
    surfaceAreaMm2: 2 * (width * height + width * depth + height * depth),
    faceCount: 6,
    edgeCount: 12,
    vertexCount: 8,
  };
}

export function createSampleCadModel(): CadImportResult {
  const base = new THREE.BoxGeometry(96, 34, 58);
  const boss = new THREE.CylinderGeometry(14, 14, 12, 48);
  boss.rotateX(Math.PI / 2);
  boss.translate(-26, 0, 35);
  const pocket = new THREE.BoxGeometry(36, 10, 32);
  pocket.translate(24, 0, 31);
  const meshes = [
    createCadMesh("sample-base", "Base plate", base, "#00e51b", 0),
    createCadMesh("sample-boss", "Cylindrical boss", boss, "#0b2dff", 1),
    createCadMesh("sample-pocket", "Machined pocket", pocket, "#ffe500", 2),
  ];

  return {
    fileName: "sample-machined-bracket.step",
    meshes,
    rootNode: {
      id: "sample-root",
      name: "sample-machined-bracket.step",
      meshIds: meshes.map((mesh) => mesh.id),
      children: [],
    },
    geometry: {
      ...createBoxGeometrySummary("sample-machined-bracket.step", 96, 46, 70),
      volumeMm3: 196_000,
      surfaceAreaMm2: 34_800,
      faceCount: 42,
      edgeCount: 116,
      vertexCount: 188,
    },
    source: "sample",
  };
}

function colorToHex(color?: number[]): string {
  if (!color || color.length < 3) {
    return "#a8b0ba";
  }

  return new THREE.Color(color[0], color[1], color[2]).getStyle();
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");

  return Math.trunc((index?.count ?? position.count) / 3);
}

function createCadMesh(
  id: string,
  name: string,
  geometry: THREE.BufferGeometry,
  color: string,
  occtIndex: number,
  faceColors?: string[],
): CadMesh {
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox?.getCenter(center);

  return {
    id,
    name,
    geometry,
    color,
    faceColors,
    triangleCount: triangleCount(geometry),
    vertexCount: geometry.getAttribute("position").count,
    center,
    occtIndex,
  };
}

type OcctGeometryResult = {
  geometry: THREE.BufferGeometry;
  faceColors: string[];
};

function geometryFromOcctMesh(mesh: OcctMesh): OcctGeometryResult | null {
  const positions = mesh.attributes?.position?.array;
  const indexes = mesh.index?.array;

  if (!positions || positions.length < 9) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );

  if (indexes && indexes.length >= 3) {
    geometry.setIndex(indexes);
  }

  const normals = mesh.attributes?.normal?.array;
  if (normals && normals.length === positions.length) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
  } else {
    geometry.computeVertexNormals();
  }

  const faceColors: string[] = [];
  if (mesh.brep_faces && mesh.brep_faces.length > 0) {
    faceColors.push(colorToHex(mesh.color));
    for (const face of mesh.brep_faces) {
      faceColors.push(colorToHex(face.color ?? mesh.color));
    }

    const totalTriangles = indexes
      ? Math.trunc(indexes.length / 3)
      : Math.trunc(positions.length / 9);
    let triangleIndex = 0;
    let faceIndex = 0;
    while (triangleIndex < totalTriangles) {
      const firstIndex = triangleIndex;
      let lastIndex: number;
      let materialIndex: number;
      if (faceIndex >= mesh.brep_faces.length) {
        lastIndex = totalTriangles;
        materialIndex = 0;
      } else if (triangleIndex < mesh.brep_faces[faceIndex].first) {
        lastIndex = mesh.brep_faces[faceIndex].first;
        materialIndex = 0;
      } else {
        lastIndex = mesh.brep_faces[faceIndex].last + 1;
        materialIndex = faceIndex + 1;
        faceIndex += 1;
      }
      geometry.addGroup(firstIndex * 3, (lastIndex - firstIndex) * 3, materialIndex);
      triangleIndex = lastIndex;
    }
  }

  geometry.computeBoundingBox();
  return { geometry, faceColors };
}

function triangleArea(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return new THREE.Vector3().crossVectors(ab, ac).length() / 2;
}

function triangleVolume(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  return a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
}

function analyzeBufferGeometries(
  fileName: string,
  meshes: CadMesh[],
): StepGeometryInput {
  const bounds = new THREE.Box3();
  let surfaceAreaMm2 = 0;
  let signedVolumeMm3 = 0;
  let vertexCount = 0;
  let faceCount = 0;

  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      bounds.union(geometry.boundingBox);
    }

    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    vertexCount += mesh.vertexCount;

    const readVertex = (vertexIndex: number) =>
      new THREE.Vector3(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex),
      );

    const triangleCount = index ? index.count / 3 : position.count / 3;
    faceCount += mesh.triangleCount;

    for (let i = 0; i < triangleCount; i += 1) {
      const aIndex = index ? index.getX(i * 3) : i * 3;
      const bIndex = index ? index.getX(i * 3 + 1) : i * 3 + 1;
      const cIndex = index ? index.getX(i * 3 + 2) : i * 3 + 2;
      const a = readVertex(aIndex);
      const b = readVertex(bIndex);
      const c = readVertex(cIndex);

      surfaceAreaMm2 += triangleArea(a, b, c);
      signedVolumeMm3 += triangleVolume(a, b, c);
    }
  }

  const size = new THREE.Vector3();
  bounds.getSize(size);

  return {
    fileName,
    boundingBoxMm: { x: size.x, y: size.y, z: size.z },
    volumeMm3: Math.abs(signedVolumeMm3),
    surfaceAreaMm2,
    faceCount: Math.round(faceCount),
    edgeCount: Math.round(faceCount * 1.5),
    vertexCount,
  };
}

function buildFallbackTree(fileName: string, meshes: CadMesh[]): CadTreeNode {
  return {
    id: "root",
    name: fileName,
    meshIds: [],
    children: meshes.map((mesh) => ({
      id: `node-${mesh.id}`,
      name: mesh.name,
      meshIds: [mesh.id],
      children: [],
    })),
  };
}

function buildTreeNode(
  node: OcctNode,
  meshIdByOcctIndex: Map<number, string>,
  path: string,
): CadTreeNode {
  const children = node.children ?? [];

  return {
    id: path,
    name: node.name?.trim() || "Assembly",
    meshIds: (node.meshes ?? [])
      .map((meshIndex) => meshIdByOcctIndex.get(meshIndex))
      .filter((meshId): meshId is string => Boolean(meshId)),
    children: children.map((child, index) =>
      buildTreeNode(child, meshIdByOcctIndex, `${path}-${index}`),
    ),
  };
}

export async function importStepFile(file: File): Promise<CadImportResult> {
  const isStep = /\.(step|stp)$/i.test(file.name);
  if (!isStep) {
    throw new Error("Upload a .step or .stp CAD file.");
  }

  return importStepBytes(file.name, new Uint8Array(await file.arrayBuffer()));
}

export async function importStepUrl(
  fileName: string,
  url: string,
): Promise<CadImportResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${fileName}.`);
  }

  return importStepBytes(
    fileName,
    new Uint8Array(await response.arrayBuffer()),
  );
}

export async function importStepBytes(
  fileName: string,
  buffer: Uint8Array,
): Promise<CadImportResult> {
  const isStep = /\.(step|stp)$/i.test(fileName);
  if (!isStep) {
    throw new Error("Upload a .step or .stp CAD file.");
  }

  const { default: occtimportjs } = await import("occt-import-js");
  const occt = await occtimportjs({
    locateFile: (path) => `/${path}`,
  });
  const result = occt.ReadStepFile(buffer, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  });

  if (!result.success || !Array.isArray(result.meshes)) {
    throw new Error(
      result.error || "Open Cascade could not read this STEP file.",
    );
  }

  const sourceMeshes = result.meshes as OcctMesh[];
  const meshes = sourceMeshes
    .map((mesh, index) => {
      const geo = geometryFromOcctMesh(mesh);
      if (!geo) {
        return null;
      }

      return createCadMesh(
        `part-${index}`,
        mesh.name?.trim() || `Part ${index + 1}`,
        geo.geometry,
        colorToHex(mesh.color),
        index,
        geo.faceColors.length > 0 ? geo.faceColors : undefined,
      );
    })
    .filter((mesh): mesh is CadMesh => mesh !== null);

  if (meshes.length === 0) {
    throw new Error("The STEP file did not contain renderable mesh geometry.");
  }

  // Build a map from OCCT mesh index to CadMesh ID
  const meshIdByOcctIndex = new Map<number, string>();
  meshes.forEach((mesh) => {
    meshIdByOcctIndex.set(mesh.occtIndex, mesh.id);
  });

  return {
    fileName,
    meshes,
    rootNode:
      result.root && typeof result.root === "object"
        ? buildTreeNode(
            result.root as OcctNode,
            meshIdByOcctIndex,
            "root",
          )
        : buildFallbackTree(fileName, meshes),
    geometry: analyzeBufferGeometries(fileName, meshes),
    source: "step",
  };
}
