export interface ServiceDefinition {
  name: string;
  type: 'typescript' | 'javascript' | 'rust';
  repository: string;
  setup?: string[];
  command: {
    type: 'npm' | 'pnpm' | 'cargo' | 'deno';
    run: string[];
  };
  env: Record<string, string>;
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
  volumes?: {
    name: string;
    mountPath: string;
    size: string;
  }[];
}

export interface OrganizationConfig {
  github: {
    organization: string;
    defaultBranch: string;
    defaultVisibility: 'public' | 'private';
  };
  docker: {
    registry: string;
    organization: string;
  };
}

export interface DevelopmentConfig {
  infraServices: Record<string, InfraServiceConfig>;
  applicationServices: Record<string, ServiceDefinition> | (() => Record<string, ServiceDefinition>);
  organization: OrganizationConfig;
}
