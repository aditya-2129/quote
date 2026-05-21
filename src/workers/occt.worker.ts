import * as Comlink from 'comlink';

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
  children?: OcctNode[];
  meshes?: number[];
};

export interface OcctImportOptions {
  linearUnit?: 'millimeter' | 'inch';
  linearDeflectionType?: 'bounding_box_ratio' | 'absolute';
  linearDeflection?: number;
  angularDeflection?: number;
}

export interface SerializableMesh {
  name?: string;
  color?: number[];
  brep_faces?: BrepFace[];
  positions: Float32Array;
  indexes?: Uint32Array;
  normals?: Float32Array;
  occtIndex: number;
}

export interface WorkerImportResult {
  success: boolean;
  error?: string;
  meshes?: SerializableMesh[];
  root?: OcctNode;
}

export const occtWorkerApi = {
  async importStep(buffer: Uint8Array, options?: OcctImportOptions): Promise<WorkerImportResult> {
    try {
      const { default: occtimportjs } = await import('occt-import-js');
      const occt = await occtimportjs({
        locateFile: (path) => '/' + path,
      });
      const result = occt.ReadStepFile(buffer, {
        linearUnit: options?.linearUnit ?? 'millimeter',
        linearDeflectionType: options?.linearDeflectionType ?? 'bounding_box_ratio',
        linearDeflection: options?.linearDeflection ?? 0.001,
        angularDeflection: options?.angularDeflection ?? 0.5,
      });

      if (!result.success || !Array.isArray(result.meshes)) {
        return {
          success: false,
          error: result.error || 'Open Cascade could not read this STEP file.',
        };
      }

      const sourceMeshes = result.meshes as OcctMesh[];
      const serializableMeshes: SerializableMesh[] = [];
      const transferList: (ArrayBuffer | SharedArrayBuffer)[] = [];

      for (let i = 0; i < sourceMeshes.length; i++) {
        const mesh = sourceMeshes[i];
        const posArray = mesh.attributes?.position?.array;
        if (!posArray || posArray.length < 9) {
          continue;
        }

        const positions = new Float32Array(posArray);
        transferList.push(positions.buffer);

        let indexes: Uint32Array | undefined;
        if (mesh.index?.array && mesh.index.array.length >= 3) {
          indexes = new Uint32Array(mesh.index.array);
          transferList.push(indexes.buffer);
        }

        let normals: Float32Array | undefined;
        if (mesh.attributes?.normal?.array && mesh.attributes.normal.array.length === posArray.length) {
          normals = new Float32Array(mesh.attributes.normal.array);
          transferList.push(normals.buffer);
        }

        serializableMeshes.push({
          name: mesh.name,
          color: mesh.color,
          brep_faces: mesh.brep_faces,
          positions,
          indexes,
          normals,
          occtIndex: i,
        });
      }

      const response: WorkerImportResult = {
        success: true,
        meshes: serializableMeshes,
        root: result.root as OcctNode,
      };

      return Comlink.transfer(response, transferList);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Import failed in worker',
      };
    }
  },
};

Comlink.expose(occtWorkerApi);
