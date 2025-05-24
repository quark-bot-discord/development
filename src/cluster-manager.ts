import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import chalk from "npm:chalk";
import process from "node:process";
import type { K3dCluster } from "./types.ts";
import { Logger } from "./logger.ts";

export class ClusterManager {
  private static instance: ClusterManager;

  private constructor() {}

  static getInstance(): ClusterManager {
    if (!ClusterManager.instance) {
      ClusterManager.instance = new ClusterManager();
    }
    return ClusterManager.instance;
  }

  createLocalCluster(name: string): boolean {
    try {
      // Check if cluster already exists
      if (this.checkClusterExists(name)) {
        console.log(
          chalk.yellow("Cluster already exists, cleaning up first..."),
        );
        this.deleteLocalCluster(name);
        // Give docker time to clean up
      }

      console.log(chalk.blue("Creating new cluster..."));

      // Create cluster with timeout and explicit network settings
      execSync(
        `k3d cluster create ${name} \
        --api-port 6550 \
        --network k3d-${name} \
        --wait \
        --timeout 120s \
        --no-rollback`,
        {
          stdio: "inherit",
          timeout: 180000, // 3 minute timeout
        },
      );

      // Verify cluster is running
      if (!this.checkClusterRunning(name)) {
        throw new Error("Cluster created but not running");
      }

      return true;
    } catch (err) {
      console.error(
        chalk.red("Failed to create local cluster:"),
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  deleteLocalCluster(name: string): boolean {
    try {
      console.log(chalk.yellow("Stopping cluster..."));
      // First try to stop the cluster (in case it's stuck)
      try {
        execSync(`k3d cluster stop ${name}`, { stdio: "inherit" });
      } catch (_err) {
        // Ignore stop errors
      }

      console.log(chalk.yellow("Deleting cluster..."));
      // Force delete with no confirmation
      execSync(`k3d cluster delete ${name}`, { stdio: "inherit" });

      // Clean up any lingering Docker resources
      console.log(chalk.yellow("Cleaning up Docker resources..."));
      try {
        // Remove containers
        execSync(
          `docker ps -a --filter "name=k3d-${name}" --format "{{.Names}}" | xargs -r docker rm -f`,
          { stdio: "pipe" },
        );
        // Remove networks
        execSync(
          `docker network ls --filter "name=k3d-${name}" --format "{{.Name}}" | xargs -r docker network rm`,
          { stdio: "pipe" },
        );
        // Remove volumes
        execSync(
          `docker volume ls --filter "name=k3d-${name}" --format "{{.Name}}" | xargs -r docker volume rm`,
          { stdio: "pipe" },
        );
      } catch (_err) {
        // Ignore cleanup errors
      }

      // Verify cluster is gone
      const clusterExists = this.checkClusterExists(name);
      if (clusterExists) {
        throw new Error("Failed to completely remove cluster");
      }

      return true;
    } catch (err) {
      console.error(
        chalk.red("Failed to delete local cluster:"),
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  async generateKubeconfig(context: string): Promise<string | null> {
    try {
      // Create kube directory if it doesn't exist
      const kubeDir = path.join(process.cwd(), "kube");
      await fs.mkdir(kubeDir, { recursive: true });

      const kubeconfigPath = path.join(kubeDir, `kubeconfig-${context}.yaml`);

      if (context.startsWith("k3d-")) {
        // For k3d clusters, use k3d's kubeconfig export
        execSync(
          `k3d kubeconfig get ${
            context.replace("k3d-", "")
          } > ${kubeconfigPath}`,
          {
            stdio: "inherit",
          },
        );
      } else {
        // For other clusters, export the specific context
        const config = execSync(
          `kubectl config view --raw --flatten --minify --context=${context} -o yaml`,
          { encoding: "utf8" },
        );
        await fs.writeFile(kubeconfigPath, config);
      }

      // Ensure the kubeconfig is readable
      await fs.chmod(kubeconfigPath, 0o600);

      return kubeconfigPath;
    } catch (err) {
      console.error(
        chalk.red("Failed to generate kubeconfig:"),
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }

  getAvailableContexts(): string[] {
    try {
      return execSync("kubectl config get-contexts -o name", {
        encoding: "utf8",
      })
        .split("\n")
        .filter(Boolean);
    } catch (err) {
      console.error(
        chalk.red("Failed to get kubectl contexts:"),
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }

  applyManifest(filePath: string, namespace?: string): boolean {
    try {
      const cmd = namespace
        ? `kubectl apply -f ${filePath} -n ${namespace}`
        : `kubectl apply -f ${filePath}`;
      execSync(cmd, { stdio: "inherit" });
      return true;
    } catch (err) {
      console.error(
        chalk.red(`Failed to apply manifest ${filePath}:`),
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  createNamespace(namespace: string): boolean {
    try {
      execSync(
        `kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`,
        {
          stdio: "inherit",
        },
      );
      return true;
    } catch (err) {
      console.error(
        chalk.red(`Failed to create namespace ${namespace}:`),
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  async applyConfigurations(services: string[]): Promise<void> {
    // First apply namespace configs
    console.log(chalk.blue("Creating namespaces..."));
    for (const ns of ["core-services", "app-services", "other-services"]) {
      this.createNamespace(ns);
    }

    // Then core services
    console.log(chalk.blue("\nApplying core service configurations..."));
    const coreScriptPath = path.join(
      process.cwd(),
      "quark-k8s",
      "scripts",
      "core.sh",
    );
    execSync(`bash ${coreScriptPath}`, { stdio: "inherit" });

    // Then apply selected service manifests in the right order
    console.log(chalk.blue("\nApplying service configurations..."));
    for (const service of services) {
      // Find the manifest file
      const manifestPaths = [
        path.join(
          process.cwd(),
          "quark-k8s",
          "core-services",
          `${service}.yaml`,
        ),
        path.join(
          process.cwd(),
          "quark-k8s",
          "app-services",
          `${service}.yaml`,
        ),
        path.join(
          process.cwd(),
          "quark-k8s",
          "other-services",
          `${service}.yaml`,
        ),
      ];

      for (const manifestPath of manifestPaths) {
        try {
          await fs.access(manifestPath);
          this.applyManifest(manifestPath);
          break;
        } catch {
          continue;
        }
      }
    }
  }

  private checkClusterExists(name: string): boolean {
    try {
      const output = execSync(`k3d cluster list -o json`, { encoding: "utf8" });
      const clusters = JSON.parse(output) as K3dCluster[];
      return clusters.some((cluster) => cluster.name === name);
    } catch (_err) {
      return false;
    }
  }

  private checkClusterRunning(name: string): boolean {
    try {
      const output = execSync(`k3d cluster list -o json`, { encoding: "utf8" });
      const clusters = JSON.parse(output) as K3dCluster[];
      const cluster = clusters.find((c) => c.name === name);
      return cluster !== undefined && cluster.serversRunning > 0;
    } catch (_err) {
      return false;
    }
  }
  async cleanupCluster(name: string): Promise<boolean> {
    try {
      Logger.info(`Cleaning up cluster ${name}...`);

      // Stop and remove all containers in the cluster
      await execSync(`k3d cluster stop ${name}`);
      await execSync(`k3d cluster delete ${name}`);

      // Remove associated Docker resources
      await execSync(`docker network rm k3d-${name} || true`);

      Logger.success(`Cleaned up cluster ${name}`);
      return true;
    } catch (err) {
      Logger.error(
        `Failed to cleanup cluster: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }
}
