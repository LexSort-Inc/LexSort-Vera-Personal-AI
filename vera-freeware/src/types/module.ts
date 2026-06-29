export interface AvailableModule {
  name: string;
  display_name: string;
  version: string;
  description: string;
  size_bytes: number;
  sha256: string;
  requires_pro: boolean;
  icon: string;
  download_url: string;
}

export interface InstalledModule {
  name: string;
  display_name: string;
  version: string;
  icon: string;
  installed_at: string;
}

export interface SidebarModule {
  name: string;
  display_name: string;
  icon: string;
}

export type ModuleStatus = "installed" | "beta" | "design" | "available" | "soon";

export interface VeraModule {
  id: string;
  name: string;
  display_name: string;
  status: ModuleStatus;
  icon: string;
  description: string;
  flags?: ("beta" | "design_preview")[];
  isFree?: boolean;
}
