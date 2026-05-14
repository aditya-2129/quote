/**
 * Application-wide type definitions.
 * Extend these as features are implemented.
 */

export interface AppConfig {
  appName: string;
  version: string;
  theme: "dark" | "light";
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  badge?: number;
}

export type Status = "active" | "pending" | "completed" | "archived";
