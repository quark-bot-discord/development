// Extract service types directly from the ServiceDefinition interface
// Create a runtime array of all possible service types
export const validServiceTypes = [
  "typescript",
  "javascript",
  "deno",
  "rust",
  "container",
  "job",
] as const;

export const validCommandTypes = [
  "npm",
  "pnpm",
  "cargo",
  "deno",
] as const;

export interface ServiceDefinition {
  name: string;
  type: typeof validServiceTypes[number];
  repository?: string;
  setup?: string[];
  command?: {
    type: typeof validCommandTypes[number];
    run: string[];
  };

  // Container-specific fields
  image?: string;
  replicas?: number;
  args?: string[];
  namespace?: string;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ports?: {
    name: string;
    port: number;
    targetPort?: number | string;
    containerPort?: number;
    servicePort?: number;
    protocol?: string;
  }[];
  volumes?: {
    name: string;
    mountPath: string;
    size?: string;
    hostPath?: string;
    readOnly?: boolean;
    configMap?: string;
    secret?: string;
  }[];
  secrets?: Record<string, Record<string, string>>;
  resources?: {
    requests?: {
      memory?: string;
      cpu?: string;
    };
    limits?: {
      memory?: string;
      cpu?: string;
    };
  };
  dependencies?: string[];
  privileged?: boolean;
  securityContext?: {
    sysctls?: Array<{
      name: string;
      value: string;
    }>;
  };

  // Health check configuration
  healthCheck?: {
    path?: string;
    port?: number;
    initialDelaySeconds?: number;
    periodSeconds?: number;
  };

  // Ingress configuration
  ingress?: {
    hosts: string[];
    path?: string;
    annotations?: Record<string, string>;
    tls?: Array<{
      secretName: string;
      hosts: string[];
    }>;
  };

  // Job-specific fields
  jobConfig?: {
    ttlSecondsAfterFinished?: number;
    restartPolicy?: "Never" | "OnFailure";
  };

  env?: Record<string, string>;
}

export interface InfraServiceConfig {
  name: string;
  namespace: string;
  image: string;
  ports: {
    name: string;
    port: number;
    targetPort?: number | string;
  }[];
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  volumes?: {
    name: string;
    mountPath: string;
    size?: string;
  }[];
}

export interface OrganizationConfig {
  github: {
    organization: string;
    defaultBranch: string;
    defaultVisibility: "public" | "private";
  };
  docker: {
    registry: string;
    organization: string;
  };
}

export interface DevelopmentConfig {
  infraServices: Record<string, InfraServiceConfig>;
  applicationServices:
    | Record<string, ServiceDefinition>
    | (() => Record<string, ServiceDefinition>);
  organization: OrganizationConfig;
}
