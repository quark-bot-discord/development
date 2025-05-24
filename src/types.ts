export interface VSCodeWorkspace {
  folders: Array<{
    name: string;
    path: string;
  }>;
  settings?: Record<string, unknown>;
}

export interface K3dCluster {
  name: string;
  status: string;
}

export interface ServiceConfig {
  repoPath: string;
  script: string;
  env: Record<string, string>;
}
