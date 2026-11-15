export type LeafStatus = "pass" | "partial" | "no-data" | "fail";

export type TreeRule = {
  label: string;
  status: LeafStatus;
};

export type TreeProgressDetail = {
  phase: string;
  status: string;
  failed?: boolean;
  label?: string;
  index?: number | null;
  anchor?: { x: number; y: number };
};

export type TreeTheme = "light" | "dark";

export type TreeController = EventTarget & {
  model: { branches: Array<{ label: string }> };
  isReduced: boolean;
  svg: SVGSVGElement;
  palette: { colors: Record<LeafStatus, string> };
  setTheme(theme: TreeTheme): void;
  reset(rules?: TreeRule[]): TreeController;
  dispose(): void;
  cancel(): void;
  evidence(options?: { failAt?: string | null }): Promise<boolean>;
  growTrunk(options?: { fail?: boolean }): Promise<boolean>;
  interpretRule(index: number, options?: { fail?: boolean }): Promise<boolean>;
  judgeRule(
    index: number,
    status?: LeafStatus,
    options?: { fail?: boolean },
  ): Promise<boolean>;
  finish(options?: { fail?: boolean }): Promise<boolean>;
};

export type TreeGrowthApi = {
  Controller: new (
    host: Element,
    options?: { rules?: TreeRule[] | number; duration?: number; theme?: TreeTheme },
  ) => TreeController;
  colors: Record<LeafStatus, string>;
};

declare global {
  interface Window {
    TreeGrowth?: TreeGrowthApi;
  }
}
