/**
 * @fileoverview Manages environment initialization, cleanup, and submodule operations.
 * 
 * This module handles the overall orchestration of development environment setup,
 * cleanup operations, and Git submodule management. It provides the main entry
 * points for environment lifecycle management.
 * 
 * @example
 * ```typescript
 * import { EnvironmentInitializer } from './environment-initializer.ts';
 * 
 * const initializer = new EnvironmentInitializer();
 * await initializer.setup();
 * ```
 * 
 * @author veryCrunchy
 * @since 1.0.0
 */

import inquirer from "inquirer";
import { Logger } from "../logger.ts";
import { ClusterManager } from "../../core/cluster-manager.ts";
import { ClusterSelector } from "./cluster-selector.ts";
import { ProfileManager } from "./profile-manager.ts";
import { WorkspaceManager } from "./workspace-manager.ts";

/**
 * Orchestrates the complete development environment setup and management.
 * 
 * The EnvironmentInitializer coordinates all aspects of environment setup including
 * service selection, cluster configuration, repository management, and workspace
 * creation. It also handles cleanup operations and Git submodule management.
 * 
 * @example
 * ```typescript
 * const initializer = new EnvironmentInitializer();
 * 
 * // Complete environment setup
 * await initializer.setup();
 * 
 * // Clean up environment
 * await initializer.cleanup();
 * 
 * // Update Git submodules
 * await initializer.updateSubmodules();
 * ```
 */
export class EnvironmentInitializer {
  /** Cluster manager for cluster operations */
  private readonly clusterManager: ClusterManager;
  
  /** Cluster selector for interactive cluster setup */
  private readonly clusterSelector: ClusterSelector;
  
  /** Profile manager for service selection */
  private readonly profileManager: ProfileManager;
  
  /** Workspace manager for repository and workspace setup */
  private readonly workspaceManager: WorkspaceManager;

  /**
   * Creates a new EnvironmentInitializer instance.
   * 
   * @example
   * ```typescript
   * const initializer = new EnvironmentInitializer();
   * ```
   */
  constructor() {
    this.clusterManager = ClusterManager.getInstance();
    this.clusterSelector = new ClusterSelector();
    this.profileManager = new ProfileManager();
    this.workspaceManager = new WorkspaceManager();
  }

  /**
   * Performs complete development environment setup.
   * 
   * This method orchestrates the entire setup process:
   * 1. Interactive service selection via profiles
   * 2. Git submodule status checking and optional updates
   * 3. Kubernetes cluster setup and configuration
   * 4. Repository cloning with dependency resolution
   * 5. VS Code workspace file creation
   * 
   * The setup process includes comprehensive error handling and user feedback
   * throughout each phase.
   * 
   * @returns A promise that resolves when setup is complete
   * 
   * @example
   * ```typescript
   * try {
   *   await initializer.setup();
   *   console.log('Development environment ready!');
   * } catch (error) {
   *   console.error('Setup failed:', error.message);
   * }
   * ```
   * 
   * @throws {Error} When any phase of setup fails
   * @throws {Error} When user cancels setup during interactive prompts
   */
  async setup(): Promise<void> {
    // Select services
    const services = await this.profileManager.selectServices();

    // Check if there are any potential submodule updates
    try {
      const fetchCmd = new Deno.Command('git', {
        args: ['submodule', 'foreach', 'git', 'fetch'],
      });
      await fetchCmd.output();

      const statusCmd = new Deno.Command('git', {
        args: ['submodule', 'foreach', 'git', 'status', '-uno'],
        stdout: 'piped',
      });
      const { stdout } = await statusCmd.output();
      const submoduleStatus = new TextDecoder().decode(stdout);
      
      if (submoduleStatus.includes('behind')) {
        const { updateSubmodules } = await inquirer.prompt([{
          type: 'confirm',
          name: 'updateSubmodules',
          message: 'Updates available for submodules. Would you like to update them before continuing?',
          default: true,
        }]);

        if (updateSubmodules) {
          await this.updateSubmodules(false); // Don't auto-commit during setup
        }
      }
    } catch (error) {
      Logger.warn(`Failed to check submodule status: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Set up cluster
    await this.clusterSelector.setupCluster(services);

    // Set up repositories
    await this.workspaceManager.setupRepositories(services);

    // Create workspace configuration
    await this.workspaceManager.createVSCodeWorkspace(services);
  }

  /**
   * Performs complete development environment cleanup.
   * 
   * This method handles the safe removal of development clusters and their
   * associated resources. It includes interactive confirmation to prevent
   * accidental data loss.
   * 
   * @returns A promise that resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * try {
   *   await initializer.cleanup();
   *   console.log('Environment cleaned up successfully');
   * } catch (error) {
   *   console.error('Cleanup failed:', error.message);
   * }
   * ```
   * 
   * @throws {Error} When cluster cleanup fails
   */
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

  /**
   * Updates Git submodules to their latest versions.
   * 
   * This method handles the complete submodule update workflow:
   * 1. Initializes any uninitialized submodules
   * 2. Updates all submodules to their latest remote versions
   * 3. Checks for changes and optionally commits them
   * 4. Provides detailed error handling for access issues
   * 
   * @param autoCommit - Whether to automatically commit and push submodule updates
   * 
   * @returns A promise that resolves when submodule updates are complete
   * 
   * @example
   * ```typescript
   * // Update submodules and auto-commit changes
   * await initializer.updateSubmodules(true);
   * 
   * // Update submodules without auto-committing
   * await initializer.updateSubmodules(false);
   * ```
   * 
   * @throws {Error} When Git operations fail
   * @throws {Error} When access permissions are insufficient
   * @throws {Error} When submodule update conflicts occur
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

  /**
   * Gets the cluster selector instance for advanced cluster operations.
   * 
   * @returns The cluster selector instance
   * 
   * @example
   * ```typescript
   * const clusterSelector = initializer.getClusterSelector();
   * const config = await clusterSelector.selectClusterType();
   * ```
   */
  getClusterSelector(): ClusterSelector {
    return this.clusterSelector;
  }

  /**
   * Gets the profile manager instance for advanced profile operations.
   * 
   * @returns The profile manager instance
   * 
   * @example
   * ```typescript
   * const profileManager = initializer.getProfileManager();
   * const profiles = profileManager.getAvailableProfiles();
   * ```
   */
  getProfileManager(): ProfileManager {
    return this.profileManager;
  }

  /**
   * Gets the workspace manager instance for advanced workspace operations.
   * 
   * @returns The workspace manager instance
   * 
   * @example
   * ```typescript
   * const workspaceManager = initializer.getWorkspaceManager();
   * const hasRepo = workspaceManager.hasRepository('frontend');
   * ```
   */
  getWorkspaceManager(): WorkspaceManager {
    return this.workspaceManager;
  }

  /**
   * Performs a dry run of the setup process without making actual changes.
   * 
   * This method validates the setup configuration and reports what would
   * be done without actually performing the operations. Useful for testing
   * and validation.
   * 
   * @returns A promise that resolves to a summary of what would be done
   * 
   * @example
   * ```typescript
   * const summary = await initializer.dryRunSetup();
   * console.log('Setup would include:', summary);
   * ```
   */
  async dryRunSetup(): Promise<{
    services: string[];
    repositories: string[];
    clusterType: string;
  }> {
    Logger.info("Performing dry run of environment setup...");
    
    const services = await this.profileManager.selectServices();
    const repositories = await this.workspaceManager.filterServicesWithRepositories(services);
    
    // Note: This is a simplified dry run - in a full implementation,
    // you might want to also simulate cluster selection
    
    return {
      services,
      repositories,
      clusterType: "local", // Default for dry run
    };
  }

  /**
   * Validates the current environment configuration.
   * 
   * Checks the current state of the development environment and reports
   * any issues or missing components.
   * 
   * @returns A promise that resolves to validation results
   * 
   * @example
   * ```typescript
   * const validation = await initializer.validateEnvironment();
   * if (validation.isValid) {
   *   console.log('Environment is properly configured');
   * } else {
   *   console.log('Issues found:', validation.issues);
   * }
   * ```
   */
  async validateEnvironment(): Promise<{
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for workspace file
    try {
      await Deno.stat("/workspace/quark-dev.code-workspace");
    } catch {
      issues.push("VS Code workspace file not found");
      recommendations.push("Run setup to create workspace configuration");
    }

    // Check for common repositories
    const commonServices = ['frontend', 'api-gateway'];
    for (const service of commonServices) {
      if (await this.workspaceManager.hasRepository(service)) {
        const isCloned = await this.workspaceManager.isRepositoryCloned(service);
        if (!isCloned) {
          issues.push(`Repository for ${service} not cloned`);
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
