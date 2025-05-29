/**
 * @fileoverview Manages repository cloning and VS Code workspace configuration.
 * 
 * This module handles the setup of development repositories and VS Code workspace
 * configuration files. It manages repository cloning, dependency resolution,
 * and creates properly configured workspace files for development environments.
 * 
 * @example
 * ```typescript
 * import { WorkspaceManager } from './workspace-manager.ts';
 * 
 * const workspaceManager = new WorkspaceManager();
 * const services = ['frontend', 'api', 'database'];
 * await workspaceManager.setupRepositories(services);
 * ```
 * 
 * @author veryCrunchy
 * @since 1.0.0
 */

import { Logger } from "../logger.ts";
import { ServiceManager } from "../../core/service-manager.ts";
import { ConfigManager } from "../../core/config-manager.ts";
import { SERVICE_GROUPS, QUARK_REPOS } from "../../../q4/const/constants.ts";
import type { VSCodeWorkspace } from "../../types/types.ts";
import { execSync } from "node:child_process";
import { exists } from "@std/fs";

/**
 * Manages workspace setup including repository cloning and VS Code configuration.
 * 
 * The WorkspaceManager handles the complete workspace setup process including:
 * - Repository cloning with dependency resolution
 * - VS Code workspace file generation
 * - Service filtering and organization
 * - Error handling and recovery
 * 
 * @example
 * ```typescript
 * const manager = new WorkspaceManager();
 * 
 * // Setup repositories for selected services
 * const services = ['frontend', 'api-gateway', 'user-service'];
 * await manager.setupRepositories(services);
 * 
 * // Create VS Code workspace configuration
 * await manager.createVSCodeWorkspace(services);
 * ```
 */
export class WorkspaceManager {
  /** Service manager instance for dependency resolution */
  private readonly serviceManager: ServiceManager;
  
  /** Configuration manager instance for tracking cloned repositories */
  private readonly configManager: ConfigManager;

  /**
   * Creates a new WorkspaceManager instance.
   * 
   * @example
   * ```typescript
   * const manager = new WorkspaceManager();
   * ```
   */
  constructor() {
    this.serviceManager = ServiceManager.getInstance();
    this.configManager = ConfigManager.getInstance();
  }

  /**
   * Sets up repositories for the specified services including their dependencies.
   * 
   * This method performs the complete repository setup workflow:
   * 1. Resolves service dependencies
   * 2. Filters services that have repositories
   * 3. Clones missing repositories
   * 4. Handles errors and provides detailed feedback
   * 
   * @param services - Array of service names to set up repositories for
   * 
   * @returns A promise that resolves when all repositories are set up
   * 
   * @example
   * ```typescript
   * const services = [
   *   'frontend',
   *   'api-gateway',
   *   'user-service',
   *   'auth-service'
   * ];
   * 
   * try {
   *   await manager.setupRepositories(services);
   *   console.log('All repositories set up successfully');
   * } catch (error) {
   *   console.error('Repository setup failed:', error.message);
   * }
   * ```
   * 
   * @throws {Error} When repository cloning fails for any service
   * @throws {Error} When dependency resolution fails
   */
  async setupRepositories(services: string[]): Promise<void> {
    const allDeps = new Set<string>();

    Logger.step(1, 3, "Resolving service dependencies...");
    for (const service of services) {
      const deps = await this.serviceManager.getServiceDependenciesFromDefinitions(service);
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

  /**
   * Creates a VS Code workspace configuration file with proper folder structure.
   * 
   * Generates a VS Code workspace file that includes:
   * - The main q4 project folder
   * - Individual service repository folders
   * - Recommended extensions for development
   * - Optimized settings for the development workflow
   * 
   * @param services - Array of service names to include in the workspace
   * 
   * @returns A promise that resolves when the workspace file is created
   * 
   * @example
   * ```typescript
   * const services = ['frontend', 'api-gateway', 'user-service'];
   * await manager.createVSCodeWorkspace(services);
   * 
   * // Creates quark-dev.code-workspace with:
   * // - q4 main folder
   * // - frontend, api-gateway, user-service folders
   * // - Recommended extensions and settings
   * ```
   * 
   * @throws {Error} When workspace file creation fails
   */
  async createVSCodeWorkspace(services: string[]): Promise<void> {
    // Filter out infrastructure services and Kubernetes resources
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
          path: "/workspace/q4"
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

  /**
   * Clones a single service repository if it doesn't already exist.
   * 
   * This method handles the cloning of individual service repositories with
   * proper error handling and validation. It checks for existing repositories
   * and tracks cloned repositories in the configuration manager.
   * 
   * @param service - The name of the service to clone
   * 
   * @returns A promise that resolves when the repository is cloned or already exists
   * 
   * @example
   * ```typescript
   * try {
   *   await manager.cloneServiceRepo('frontend');
   *   console.log('Frontend repository ready');
   * } catch (error) {
   *   console.error('Failed to clone frontend:', error.message);
   * }
   * ```
   * 
   * @throws {Error} When the service has no repository mapping
   * @throws {Error} When git clone operation fails
   * @throws {Error} When filesystem operations fail
   * 
   * @private
   */
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

  /**
   * Gets the list of services that have repository mappings.
   * 
   * @returns An array of service names that have repositories available
   * 
   * @example
   * ```typescript
   * const availableServices = manager.getServicesWithRepositories();
   * console.log('Services with repos:', availableServices);
   * ```
   */
  getServicesWithRepositories(): string[] {
    return Object.keys(QUARK_REPOS);
  }

  /**
   * Checks if a service has a repository mapping.
   * 
   * @param service - The service name to check
   * @returns True if the service has a repository mapping
   * 
   * @example
   * ```typescript
   * const hasRepo = manager.hasRepository('frontend');
   * if (hasRepo) {
   *   console.log('Frontend service has a repository');
   * }
   * ```
   */
  hasRepository(service: string): boolean {
    return service in QUARK_REPOS;
  }

  /**
   * Gets the repository URL for a service.
   * 
   * @param service - The service name
   * @returns The GitHub repository URL for the service
   * 
   * @example
   * ```typescript
   * const url = manager.getRepositoryUrl('frontend');
   * console.log('Frontend repo:', url);
   * // Output: https://github.com/quark-bot-discord/quark-frontend.git
   * ```
   * 
   * @throws {Error} When the service has no repository mapping
   */
  getRepositoryUrl(service: string): string {
    if (!(service in QUARK_REPOS)) {
      throw new Error(`No repository mapping found for service: ${service}`);
    }
    
    const repoName = QUARK_REPOS[service as keyof typeof QUARK_REPOS];
    return `https://github.com/quark-bot-discord/${repoName}.git`;
  }

  /**
   * Gets the local repository path for a service.
   * 
   * @param service - The service name
   * @returns The local filesystem path where the repository is or will be cloned
   * 
   * @example
   * ```typescript
   * const path = manager.getRepositoryPath('frontend');
   * console.log('Frontend path:', path);
   * // Output: /workspace/repos/frontend
   * ```
   */
  getRepositoryPath(service: string): string {
    return `/workspace/repos/${service}`;
  }

  /**
   * Checks if a repository is already cloned locally.
   * 
   * @param service - The service name to check
   * @returns A promise that resolves to true if the repository exists locally
   * 
   * @example
   * ```typescript
   * const isCloned = await manager.isRepositoryCloned('frontend');
   * if (isCloned) {
   *   console.log('Frontend repository is already available locally');
   * }
   * ```
   */
  async isRepositoryCloned(service: string): Promise<boolean> {
    const repoPath = this.getRepositoryPath(service);
    return await exists(repoPath);
  }

  /**
   * Filters services to only include those with repositories and excludes Kubernetes resources.
   * 
   * @param services - Array of service names to filter
   * @returns Array of services that have repositories and are not Kubernetes resources
   * 
   * @example
   * ```typescript
   * const allServices = ['frontend', 'api', 'configmap:app-config', 'secret:auth'];
   * const repoServices = manager.filterServicesWithRepositories(allServices);
   * console.log(repoServices); // ['frontend', 'api']
   * ```
   */
  filterServicesWithRepositories(services: string[]): string[] {
    return services.filter(service => 
      service in QUARK_REPOS && 
      !service.startsWith('configmap:') && 
      !service.startsWith('secret:') && 
      !service.startsWith('pvc:')
    );
  }

  /**
   * Updates all git submodules to their latest versions.
   * 
   * This method performs a complete submodule update workflow:
   * 1. Initializes any uninitialized submodules
   * 2. Updates all submodules to their latest remote versions
   * 3. Optionally commits and pushes changes if auto-commit is enabled
   * 
   * @param autoCommit - Whether to automatically commit and push submodule updates
   * @returns A promise that resolves when the update is complete
   * 
   * @example
   * ```typescript
   * const manager = new WorkspaceManager();
   * 
   * // Update submodules with auto-commit
   * await manager.updateSubmodules(true);
   * 
   * // Update submodules without committing
   * await manager.updateSubmodules(false);
   * ```
   */
  async updateSubmodules(autoCommit = true): Promise<void> {
    Logger.step(1, 3, "Checking submodule status...");
    
    try {
      // First check if we have any submodules that aren't initialized
      const initCmd = new Deno.Command('git', {
        args: ['submodule', 'status'],
        stdout: 'piped',
      });
      const { stdout: initStdout } = await initCmd.output();
      const status = new TextDecoder().decode(initStdout);
      
      if (status.includes('-')) {
        Logger.info("Initializing uninitialized submodules...");
        await new Deno.Command('git', {
          args: ['submodule', 'init'],
        }).output();
      }

      Logger.step(2, 3, "Updating submodules to latest versions...");
      const updateCmd = new Deno.Command('git', {
        args: ['submodule', 'update', '--remote', '--recursive'],
        stderr: 'piped',
      });
      const updateResult = await updateCmd.output();
      
      if (!updateResult.success) {
        const error = new TextDecoder().decode(updateResult.stderr);
        if (error.includes("Please make sure you have the correct access rights")) {
          throw new Error("Access denied. Please check your Git credentials and try again.");
        } else {
          throw new Error(`Failed to update submodules: ${error}`);
        }
      }

      Logger.step(3, 3, "Checking for changes...");
      const statusCmd = new Deno.Command('git', {
        args: ['status', '--porcelain'],
        stdout: 'piped',
      });
      const { stdout } = await statusCmd.output();
      const changes = new TextDecoder().decode(stdout);

      if (changes.length > 0) {
        if (autoCommit) {
          Logger.info("Changes detected, committing updates...");
          await new Deno.Command('git', {
            args: ['add', '.'],
          }).output();
          
          await new Deno.Command('git', {
            args: ['commit', '-m', 'chore: update submodules'],
          }).output();
          
          await new Deno.Command('git', {
            args: ['push'],
          }).output();

          Logger.success("Submodules updated and changes pushed successfully");
        } else {
          Logger.info("Changes detected in submodules. Use git status to review changes.");
        }
      } else {
        Logger.success("All submodules are up to date");
      }
    } catch (error) {
      Logger.error(`Failed to update submodules: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
