export interface VSCodeWorkspace {
  folders: Array<{
    name: string;
    path: string;
  }>;
  settings?: {
    "files.exclude"?: Record<string, boolean>;
    "search.exclude"?: Record<string, boolean>;
    "remote.containers.defaultExtensions"?: string[];
  };
  extensions?: {
    recommendations: string[];
  };
}

export interface ClusterConfig {
  type: 'local' | 'remote';
  name: string;
  context?: string;
}

export interface ServiceGroup {
  name: string;
  services: string[];
}

export interface DevelopmentProfile {
  name: string;
  description: string;
  services: string[];
}

export interface KubernetesConfig {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    replicas?: number;
    selector?: {
      matchLabels: Record<string, string>;
    };
    template?: {
      metadata: {
        labels: Record<string, string>;
      };
      spec: {
        containers: Array<{
          name: string;
          image: string;
          ports?: Array<{
            containerPort: number;
            name?: string;
            protocol?: string;
          }>;
          env?: Array<{
            name: string;
            value?: string;
            valueFrom?: {
              secretKeyRef?: {
                name: string;
                key: string;
              };
              configMapKeyRef?: {
                name: string;
                key: string;
              };
            };
          }>;
          resources?: {
            requests?: {
              cpu?: string;
              memory?: string;
            };
            limits?: {
              cpu?: string;
              memory?: string;
            };
          };
          volumeMounts?: Array<{
            name: string;
            mountPath: string;
            readOnly?: boolean;
          }>;
        }>;
        volumes?: Array<{
          name: string;
          persistentVolumeClaim?: {
            claimName: string;
          };
          configMap?: {
            name: string;
          };
          secret?: {
            secretName: string;
          };
        }>;
        imagePullSecrets?: Array<{
          name: string;
        }>;
      };
    };
  };
}

export interface LocalServiceConfig {
  repoPath: string;
  script?: string;
  env: Record<string, string>;
  namespace?: string;
}

export interface ServiceConfig {
  clonedRepos: Record<string, string>;
  kubeconfig: string | null;
  localServices: Record<string, LocalServiceConfig>;
}

export interface K3dCluster {
  name: string;
  serversRunning: number;
  serversCount?: number;
  agentsRunning?: number;
  agentsCount?: number;
  token: string;
  nodes?: Array<{
    name: string;
    role: string;
    State?: {
      Running?: boolean;
      Status?: string;
      Started?: string;
    };
  }>;
  servers?: Array<{
    name: string;
    role: string;
    state: string;
  }>;
}