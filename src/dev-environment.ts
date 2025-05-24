export class DevEnvironment {
  private readonly clusterManager: ClusterManager;
  private readonly serviceManager: ServiceManager;

   constructor() {
    this.clusterManager = ClusterManager.getInstance();
    this.serviceManager = ServiceManager.getInstance();
  }

  private async selectClusterType(): Promise<ClusterConfig> {
    const { clusterType } = await inquirer.prompt([
      {
        type: "list",
        name: "clusterType",
        message: "Select cluster type:",
        choices: [
          { name: "Local (k3d)", value: "local" },
          { name: "Remote", value: "remote" },
        ],
      },
    ]);

    if (clusterType === "local") {
      return {
        type: "local",
        name: "quark-dev"
      };
    }

    const { context } = await inquirer.prompt([
      {
        type: "input",
        name: "context",
        message: "Enter remote cluster context:",
        validate: (input) => input.length > 0,
      },
    ]);

    return {
      type: "remote",
      name: "remote-cluster",
      context
    };
  }

  async setupCluster(services: string[]): Promise<void> {
    Logger.step(1, 3, "Setting up kubernetes cluster...");
    
    const clusterConfig = await this.selectClusterType();
    
    if (clusterConfig.type === "local") {
      if (!await this.clusterManager.createLocalCluster(clusterConfig.name)) {
        throw new Error("Failed to create local cluster");
      }
    } else {
      if (!await this.clusterManager.useRemoteCluster(clusterConfig.context!)) {
        throw new Error("Failed to configure remote cluster");
      }
    }

    Logger.step(2, 3, "Applying service configurations...");
    for (const service of services) {
      try {
        await this.clusterManager.applyServiceConfig(service);
        Logger.success(`Applied configuration for ${service}`);
      } catch (error) {
        Logger.error(`Failed to apply configuration for ${service}: ${error.message}`);
      }
    }

    Logger.step(3, 3, "Cluster setup complete");
  }
}

  async selectServices(): Promise<string[]> {
    const { profile } = await inquirer.prompt([
      {
        type: "list",
        name: "profile",
        message: "Select a development profile:",
        choices: [
          ...Object.entries(DEVELOPMENT_PROFILES).map(([key, profile]) => ({
            name: `${profile.name} - ${profile.description}`,
            value: key,
          })),
          {
            name: "Custom - Select individual services",
            value: "custom",
          },
        ],
      },
    ]);

    if (profile !== "custom") {
      return DEVELOPMENT_PROFILES[profile as keyof typeof DEVELOPMENT_PROFILES]
        .services;
    }

    const { selectedGroups } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedGroups",
        message: "Select service groups:",
        choices: Object.values(SERVICE_GROUPS).map((group) => ({
          name: group.name,
          value: group.services,
          checked: false,
        })),
      },
    ]);

    return selectedGroups.flat();
  }
}

  async setupRepositories(services: string[]): Promise<void> {
    const allDeps = new Set<string>();
    
    Logger.step(1, 3, "Resolving service dependencies...");
    for (const service of services) {
      const deps = await this.serviceManager.getServiceDependencies(service);
      deps.forEach(dep => allDeps.add(dep));
    }

    Logger.step(2, 3, "Setting up repositories...");
    for (const service of [...services, ...allDeps]) {
      try {
        await this.cloneServiceRepo(service);
        Logger.success(`Cloned ${service}`);
      } catch (error) {
        Logger.error(`Failed to clone ${service}: ${error.message}`);
      }
    }

    Logger.step(3, 3, "Repository setup complete");
  }
}
