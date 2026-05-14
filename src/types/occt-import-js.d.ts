declare module "occt-import-js" {
  type OcctModule = {
    ReadStepFile: (
      content: Uint8Array,
      params: Record<string, unknown> | null,
    ) => {
      success: boolean;
      error?: string;
      meshes?: unknown[];
      root?: unknown;
    };
  };

  export default function occtimportjs(options?: {
    locateFile?: (path: string) => string;
  }): Promise<OcctModule>;
}
