import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAllMachines, getAllMaterials } from "../db/queries";
import {
  buildMachineCatalog,
  buildMaterialCatalog,
  type MachineCatalog,
  type MaterialCatalog,
} from "../utils/quoteCosting";
import { colorForMaterial } from "../utils/format";
import type { Op, Part } from "../utils/quoteTypes";

export type MaterialMeta = {
  label: string;
  density: number;
  hex: string;
  grade: string;
  forms: string[];
  rates: Record<string, number>;
  isPurchased: boolean;
  isActive: boolean;
};

export type MachineMeta = {
  label: string;
  rate: number;
  short: string;
};

export type CatalogContextValue = {
  materials: Record<string, MaterialMeta>;
  machines: Record<string, MachineMeta>;
  materialCosts: MaterialCatalog;
  machineCosts: MachineCatalog;
  isLoaded: boolean;
  refreshCatalog: () => Promise<void>;
  materialLabel: (materialId: string) => string;
  partMaterialLabel: (part: Part) => string;
  machineLabel: (machineId: string) => string;
  machineShortLabel: (machineId: string) => string;
  opMachineLabel: (operation: Op) => string;
  opMachineShortLabel: (operation: Op) => string;
};

const EMPTY_MATERIALS: Record<string, MaterialMeta> = {};
const EMPTY_MACHINES: Record<string, MachineMeta> = {};
const EMPTY_MATERIAL_COSTS: MaterialCatalog = {};
const EMPTY_MACHINE_COSTS: MachineCatalog = {};

const CatalogContext = createContext<CatalogContextValue | null>(null);

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [materials, setMaterials] = useState<Record<string, MaterialMeta>>(EMPTY_MATERIALS);
  const [machines, setMachines] = useState<Record<string, MachineMeta>>(EMPTY_MACHINES);
  const [materialCosts, setMaterialCosts] = useState<MaterialCatalog>(EMPTY_MATERIAL_COSTS);
  const [machineCosts, setMachineCosts] = useState<MachineCatalog>(EMPTY_MACHINE_COSTS);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshCatalog = useCallback(async () => {
    const [materialRows, machineRows] = await Promise.all([getAllMaterials(false), getAllMachines(false)]);
    setMaterialCosts(buildMaterialCatalog(materialRows));
    setMachineCosts(buildMachineCatalog(machineRows));
    setMaterials(Object.fromEntries(materialRows.map(material => [
      material.id,
      {
        label: material.name,
        density: material.densityKgPerM3,
        hex: colorForMaterial(material.id),
        grade: material.category || "",
        forms: material.availableForms || [],
        rates: material.formRates || {},
        isPurchased: (material.category || "").toLowerCase() === "purchased",
        isActive: material.isActive,
      },
    ])));
    setMachines(Object.fromEntries(machineRows.map(machine => [
      machine.id,
      { label: machine.name, rate: machine.ratePerHour, short: machine.shortName },
    ])));
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshCatalog();
    });
    const onFocus = () => void refreshCatalog();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCatalog();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      cancelled = true;
    };
  }, [refreshCatalog]);

  const value = useMemo<CatalogContextValue>(() => ({
    materials,
    machines,
    materialCosts,
    machineCosts,
    isLoaded,
    refreshCatalog,
    materialLabel: (materialId: string) => materials[materialId]?.label || "Unknown material",
    partMaterialLabel: (part: Part) => part.materialLabelSnapshot?.trim()
      || (part.material ? materials[part.material]?.label || "Unknown material" : "—"),
    machineLabel: (machineId: string) => machines[machineId]?.label || "Unknown machine",
    machineShortLabel: (machineId: string) => machines[machineId]?.short || machines[machineId]?.label || "Unknown",
    opMachineLabel: (operation: Op) => operation.machineLabelSnapshot?.trim()
      || (operation.machine ? machines[operation.machine]?.label || "Unknown machine" : "—"),
    opMachineShortLabel: (operation: Op) => operation.machineLabelSnapshot?.trim()
      || (operation.machine ? machines[operation.machine]?.short || machines[operation.machine]?.label || "Unknown" : "—"),
  }), [machineCosts, machines, materialCosts, materials, isLoaded, refreshCatalog]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}
