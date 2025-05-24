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

export interface KubernetesConfig {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
  spec: {
    containers?: Array<{
      name: string;
      image: string;
      env?: Array<{
        name: string;
        value?: string;
        valueFrom?: {
          secretKeyRef?: {
            name: string;
            key: string;
          };
        };
      }>;
    }>;
  };
}
