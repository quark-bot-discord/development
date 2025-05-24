import chalk from "chalk";
import inquirer from "inquirer";
import { ConfigManager } from "./config-manager.ts";
import { ClusterManager } from "./cluster-manager.ts";
import { ServiceManager } from "./service-manager.ts";
import {
  DEVELOPMENT_PROFILES,
  QUARK_REPOS,
  SERVICE_DEPENDENCIES,
  SERVICE_GROUPS,
} from "./constants.ts";
import type { VSCodeWorkspace } from "./types.ts";
import path from "node:path";
import fs from "node:fs/promises";
import process from "node:process";

export class DevEnvironment {
  private config: ConfigManager;
  private cluster: ClusterManager;
  private services: ServiceManager;

  private isInDevContainer(): boolean {
    return (
      process.env.REMOTE_CONTAINERS === "true" ||
      process.env.CODESPACES === "true"
    );
  }

  constructor() {
    this.config = ConfigManager.getInstance();
    this.cluster = ClusterManager.getInstance();
    this.services = ServiceManager.getInstance();
  }

  async setupCluster(): Promise<boolean> {
    const { clusterType } = await inquirer.prompt([
      {
        type: "list",
        name: "clusterType",
        message: "Select cluster type:",
        choices: [
          { name: "Local (k3d)", value: "local" },
          { name: "Remote (existing kubeconfig)", value: "remote" },
        ],
      },
    ]);

    if (clusterType === "local") {
      const clusterName = "quark-dev";
      console.log(chalk.blue("Setting up local k3d cluster..."));

      // Always try to delete the cluster first to ensure clean state
      console.log(chalk.yellow("Cleaning up any existing cluster..."));
      try {
        const wasDeleted = await this.cluster.deleteLocalCluster(clusterName);
        if (!wasDeleted) {
          console.error(chalk.red("Failed to clean up existing cluster"));
          return false;
        }
      } catch (err) {
        console.error(chalk.red("Error cleaning up existing cluster:"), err);
        return false;
      }

      // Create new cluster
      try {
        const success = await this.cluster.createLocalCluster(clusterName);
        if (!success) {
          console.error(chalk.red("Failed to create local cluster"));
          return false;
        }
      } catch (err) {
        console.error(chalk.red("Error creating cluster:"), err);
        return false;
      }

      // Generate kubeconfig
      const kubeconfigPath = await this.cluster.generateKubeconfig(
        `k3d-${clusterName}`,
      );
      if (!kubeconfigPath) {
        console.error(chalk.red("Failed to generate kubeconfig"));
        return false;
      }

      // Update config
      await this.config.setKubeconfig(kubeconfigPath);
      console.log(chalk.green("✓ Local cluster created"));
      return true;
    } else {
      // Remote cluster flow
      const contexts = this.cluster.getAvailableContexts();
      if (contexts.length === 0) {
        console.error(
          chalk.red(
            "No kubernetes contexts found. Please configure kubectl first.",
          ),
        );
        return false;
      }

      const { context } = await inquirer.prompt([
        {
          type: "list",
          name: "context",
          message: "Select kubernetes context:",
          choices: contexts,
        },
      ]);

      const kubeconfigPath = await this.cluster.generateKubeconfig(context);
      if (!kubeconfigPath) {
        console.error(chalk.red("Failed to generate kubeconfig"));
        return false;
      }

      await this.config.setKubeconfig(kubeconfigPath);
      console.log(chalk.green("✓ Kubeconfig generated"));
      return true;
    }
  }

  getServiceDependencies(services: string[]): string[] {
    const allServices = new Set(services);
    let addedServices: boolean;

    do {
      addedServices = false;
      for (const service of allServices) {
        const deps = SERVICE_DEPENDENCIES[service];
        if (deps) {
          for (const dep of deps) {
            if (!allServices.has(dep)) {
              allServices.add(dep);
              addedServices = true;
            }
          }
        }
      }
    } while (addedServices);

    return Array.from(allServices);
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

    const allServices = selectedGroups.flat();

    const { services } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "services",
        message: "Select specific services:",
        choices: allServices.map((service: string) => ({
          name: service,
          checked: false,
        })),
      },
    ]);

    return services;
  }

  async setupRepositories(services: string[]): Promise<void> {
    const repos = new Set(services.filter((service) => QUARK_REPOS[service]));

    if (repos.size > 0) {
      const { selectedRepos } = await inquirer.prompt([
        {
          type: "checkbox",
          name: "selectedRepos",
          message: "Select repositories to clone:",
          choices: Array.from(repos).map((service) => ({
            name: `${service} (${QUARK_REPOS[service]})`,
            value: service,
            checked: true,
          })),
        },
      ]);

      console.log(chalk.blue("\nCloning repositories..."));
      for (const service of selectedRepos) {
        const repoPath = await this.config.cloneRepo(
          service,
          QUARK_REPOS[service],
        );
        console.log(chalk.green(`✓ Cloned ${service}`));

        const { useLocal } = await inquirer.prompt([
          {
            type: "confirm",
            name: "useLocal",
            message:
              `Do you want to use your local ${service} for development?`,
            default: true,
          },
        ]);

        if (useLocal && typeof repoPath === "string") {
          await this.configureLocalDevelopment(service, repoPath);
        }
      }
    }
  }

  async configureLocalDevelopment(
    service: string,
    repoPath: string,
  ): Promise<void> {
    console.log(
      chalk.blue(`\nConfiguring local development for ${service}...`),
    );

    try {
      const packageJson = JSON.parse(
        await fs.readFile(path.join(repoPath, "package.json"), "utf8"),
      );
      const scripts = Object.keys(packageJson.scripts || {});

      const defaultScript = scripts.includes("dev")
        ? "dev"
        : scripts.includes("start")
        ? "start"
        : scripts[0];

      const { script } = await inquirer.prompt([
        {
          type: "list",
          name: "script",
          message: "Select the development script to run:",
          choices: scripts,
          default: defaultScript,
        },
      ]);

      await this.config.addLocalService(service, {
        repoPath,
        script,
        env: { NODE_ENV: "development" },
      });
      console.log(chalk.green(`✓ Local development configured for ${service}`));
    } catch (err) {
      console.error(
        chalk.red(`Failed to configure local development for ${service}:`),
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async createVSCodeWorkspace(services: string[]): Promise<void> {
    const workspaceConfig: VSCodeWorkspace = {
      folders: [
        {
          name: "📦 Quark Development",
          path: ".",
        },
      ],
      settings: {
        "files.exclude": {
          "repos/*": true, // Hide all repos by default
        },
      },
    };

    // Add selected services to workspace
    const clonedRepos = this.config.getClonedRepos();
    for (const service of services) {
      const repoPath = clonedRepos[service];
      if (repoPath) {
        // Add folder to workspace
        workspaceConfig.folders.push({
          name: `🔧 ${service}`,
          path: repoPath,
        });
        // Show this repo in the file explorer
        if (workspaceConfig.settings?.["files.exclude"]) {
          (workspaceConfig.settings["files.exclude"] as Record<
            string,
            boolean
          >)[`repos/${service}`] = false;
        }
      }
    }

    // Write workspace file
    const workspacePath = path.join(process.cwd(), "quark-dev.code-workspace");
    await fs.writeFile(
      workspacePath,
      JSON.stringify(workspaceConfig, null, 2),
    );
  }

  async setup(): Promise<void> {
    if (!this.isInDevContainer()) {
      console.error(chalk.red("⚠️  Error: Quark CLI must be run inside the VS Code devcontainer"));
      console.log(chalk.yellow("\nTo use Quark CLI:"));
      console.log("1. Open this folder in VS Code");
      console.log("2. When prompted, click 'Reopen in Container'");
      console.log("3. Once the devcontainer is ready, run the CLI again");
      return;
    }

    console.log(chalk.blue("🚀 Setting up Quark development environment..."));

    await this.config.load();

    if (!await this.setupCluster()) {
      return;
    }

    // First select which services to develop
    console.log(chalk.blue("\nSelect services to develop locally:"));
    const selectedServices = await this.selectServices();

    // Get dependencies and set up repositories
    console.log(chalk.blue("\nAnalyzing service dependencies..."));
    const servicesWithDeps = this.getServiceDependencies(selectedServices);

    // Clone repositories and configure for development
    await this.setupRepositories(servicesWithDeps);

    // Create VS Code workspace with selected services
    await this.createVSCodeWorkspace(selectedServices);

    console.log(chalk.green("\nSelected services:"));
    for (const service of selectedServices) {
      console.log(`  - ${service}`);
    }

    const addedDeps = servicesWithDeps.filter((s) =>
      !selectedServices.includes(s)
    );
    if (addedDeps.length > 0) {
      console.log(chalk.yellow("\nAdded required dependencies:"));
      for (const dep of addedDeps) {
        console.log(`  - ${dep}`);
      }
    }

    // Apply k8s configurations
    console.log(chalk.blue("\nApplying k8s configurations..."));
    await this.cluster.applyConfigurations(servicesWithDeps);

    console.log(chalk.green("\n✨ Development environment setup complete!"));
    console.log(chalk.yellow("\nNext steps:"));
    console.log("1. Open the quark-dev.code-workspace file");
    console.log("2. Your selected services will be running in the cluster");
    console.log("3. Local development services are mounted and ready for development");
  }
}
