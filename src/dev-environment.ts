import { Logger } from "./logger.ts";
import inquirer from "inquirer";
import { ClusterManager } from "./cluster-manager.ts";
import { ServiceManager } from "./service-manager.ts";
import { ConfigManager } from "./config-manager.ts";
import { SERVICE_GROUPS, DEVELOPMENT_PROFILES, QUARK_REPOS } from "@quark/q4";
import type { VSCodeWorkspace, ClusterConfig } from "./types.ts";
import { execSync } from "node:child_process";
import { exists } from "@std/fs";

export class DevEnvironment {
  private serviceManager: ServiceManager;
  private clusterManager: ClusterManager;
  private configManager: ConfigManager;

  constructor() {
    this.serviceManager = ServiceManager.getInstance();
    this.clusterManager = ClusterManager.getInstance();
    this.configManager = ConfigManager.getInstance();
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
        name: "quark-dev",
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
      context,
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
    try {
      await this.clusterManager.applyConfigurations(services);
      Logger.success("Service configurations applied successfully");
    } catch (error) {
      Logger.error(
        `Failed to apply service configurations: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    Logger.step(3, 3, "Cluster setup complete");
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

  async setupRepositories(services: string[]): Promise<void> {
    const allDeps = new Set<string>();

    Logger.step(1, 3, "Resolving service dependencies...");
    for (const service of services) {
      const deps = await this.serviceManager.getServiceDependencies(service);
      deps.forEach((dep) => allDeps.add(dep));
    }

    Logger.step(2, 3, "Setting up repositories...");
    const servicesWithDeps = [...new Set([...services, ...allDeps])];
    const servicesWithRepos = servicesWithDeps.filter(service => 
      service in QUARK_REPOS && 
      !service.startsWith('configmap:') && 
      !service.startsWith('secret:') && 
      !service.startsWith('pvc:')
    );

    for (const service of servicesWithRepos) {
      try {
        await this.cloneServiceRepo(service);
        Logger.success(`Cloned ${service}`);
      } catch (error) {
        Logger.error(`Failed to clone ${service}: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to stop the setup process
      }
    }

    Logger.step(3, 3, "Repository setup complete");
  }

  private async createVSCodeWorkspace(services: string[]): Promise<void> {
    // Filter out infrastructure services
    const appServices = services.filter(service => {
      const isInfraService = SERVICE_GROUPS.core.services.includes(service);
      const isKubeResource = service.startsWith('configmap:') || 
                           service.startsWith('secret:') || 
                           service.startsWith('pvc:');
      return !isInfraService && !isKubeResource;
    });

    const workspace: VSCodeWorkspace = {
      folders: [
        {
          name: "q4",
          path: "/workspace"
        },
        ...appServices.map((service) => ({
          name: service,
          path: `/workspace/repos/${service}`,
        }))
      ],
      settings: {
        "files.exclude": {
          node_modules: true,
          ".git": true,
          dist: true,
          coverage: true,
        },
        "search.exclude": {
          "**/node_modules": true,
          "**/dist": true,
        },
        "remote.containers.defaultExtensions": [
          "denoland.vscode-deno",
          "ms-kubernetes-tools.vscode-kubernetes-tools",
          "github.vscode-pull-request-github"
        ]
      },
      extensions: {
        recommendations: [
          "denoland.vscode-deno",
          "ms-kubernetes-tools.vscode-kubernetes-tools",
          "github.vscode-pull-request-github"
        ]
      },
    };

    await Deno.writeTextFile(
      "/workspace/quark-dev.code-workspace",
      JSON.stringify(workspace, null, 2),
    );

    Logger.success("Created VS Code workspace configuration");
  }

  async setup(): Promise<void> {
    // Select services
    const services = await this.selectServices();

    // Set up cluster
    await this.setupCluster(services);

    // Set up repositories
    await this.setupRepositories(services);

    // Create workspace configuration
    await this.createVSCodeWorkspace(services);
  }

  async cleanup(): Promise<void> {
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message:
          "This will remove the development cluster and all its resources. Continue?",
        default: false,
      },
    ]);

    if (!confirm) {
      Logger.info("Cleanup cancelled");
      return;
    }

    Logger.step(1, 2, "Cleaning up development cluster...");
    if (!await this.clusterManager.cleanupCluster("quark-dev")) {
      throw new Error("Failed to cleanup cluster");
    }

    Logger.step(2, 2, "Cleanup complete");
  }

  private async cloneServiceRepo(service: string): Promise<void> {
    const repoPath = `/workspace/repos/${service}`;

    try {
      if (!(service in QUARK_REPOS)) {
        throw new Error(`No repository mapping found for service: ${service}`);
      }

      // Skip if repo already exists
      if (await exists(repoPath)) {
        Logger.info(`Repository for ${service} already exists at ${repoPath}`);
        return;
      }

      const repoName = QUARK_REPOS[service as keyof typeof QUARK_REPOS];
      const repoUrl = `https://github.com/quark-bot-discord/${repoName}.git`;
      Logger.info(`Cloning ${service} from ${repoUrl}`)

      execSync(`git clone ${repoUrl} ${repoPath}`, {
        stdio: "inherit",
      });

      Logger.success(`Cloned ${service} to ${repoPath}`);
      this.configManager.addClonedRepo(service, repoPath);
    } catch (error) {
      if (error instanceof Error) {
        Logger.error(`Failed to clone ${service}: ${error.message}`);
      } else {
        Logger.error(`Failed to clone ${service}: ${String(error)}`);
      }
      throw error;
    }
  }
}
