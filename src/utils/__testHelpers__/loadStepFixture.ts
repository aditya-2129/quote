import * as fs from "fs";
import * as path from "path";
import process from "process";
import * as THREE from "three";

interface OCCTMesh {
  name?: string;
  attributes?: {
    position?: { array?: number[] };
  };
  index?: { array?: number[] };
}

export interface LoadedMesh {
  id: string;
  geometry: THREE.BufferGeometry;
}

interface OcctModule {
  ReadStepFile: (
    buffer: Uint8Array,
    options: {
      linearUnit: string;
      linearDeflectionType: string;
      linearDeflection: number;
      angularDeflection: number;
    }
  ) => {
    success: boolean;
    error?: string;
    meshes?: unknown[];
    root?: unknown;
  };
}

const cache = new Map<string, LoadedMesh[]>();

let occtInstance: OcctModule | null = null;

async function getOcctInstance(): Promise<OcctModule> {
  if (occtInstance) return occtInstance;

  // Resolve absolute path to WASM file inside node_modules
  const wasmPath = path.resolve(process.cwd(), "node_modules/occt-import-js/dist/occt-import-js.wasm");

  // Dynamically import occt-import-js to avoid static import/typing issues
  const { default: occtimportjs } = (await import("occt-import-js")) as unknown as {
    default: (options: { locateFile: (name: string) => string }) => Promise<OcctModule>;
  };

  occtInstance = await occtimportjs({
    locateFile: (name: string) => {
      if (name.endsWith(".wasm")) {
        return wasmPath;
      }
      return name;
    },
  });
  return occtInstance;
}

/**
 * Loads a STEP file from the filesystem and parses it into THREE.BufferGeometry meshes
 * with caching to ensure fast execution.
 */
export async function loadStepFixture(filePath: string): Promise<LoadedMesh[]> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

  if (cache.has(absolutePath)) {
    return cache.get(absolutePath)!;
  }

  const buffer = fs.readFileSync(absolutePath);
  const occt = await getOcctInstance();
  const result = occt.ReadStepFile(new Uint8Array(buffer), {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.001,
    angularDeflection: 0.5,
  });

  if (!result.success || !Array.isArray(result.meshes)) {
    throw new Error(result.error || `Open Cascade could not read STEP file: ${filePath}`);
  }

  const sourceMeshes = result.meshes as OCCTMesh[];
  const meshes: LoadedMesh[] = sourceMeshes
    .map((mesh, index) => {
      const positions = mesh.attributes?.position?.array;
      const indexes = mesh.index?.array;
      if (!positions || positions.length < 9) return null;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      if (indexes && indexes.length >= 3) {
        geometry.setIndex(indexes);
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      return {
        id: `part-${index}`,
        geometry,
      };
    })
    .filter((m): m is LoadedMesh => m !== null);

  if (meshes.length === 0) {
    throw new Error(`The STEP file ${filePath} did not contain renderable mesh geometry.`);
  }

  cache.set(absolutePath, meshes);
  return meshes;
}
