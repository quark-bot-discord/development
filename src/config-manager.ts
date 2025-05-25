
import { exists } from "@std/fs";
import { Logger } from "./logger.ts";
import type { LocalServiceConfig, ServiceConfig } from "./types.ts";

export class ConfigManager {
  private static instance: ConfigManager;
  private config: ServiceConfig;
  private static readonly CONFIG_FILE = "quark-dev-config.json";

  private constructor() {
    this.config = {
      clonedRepos: {},
      kubeconfig: null,
      localServices: {},
    };
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async load(): Promise<void> {
    try {
      const content = await Deno.readTextFile(ConfigManager.CONFIG_FILE);
      const loadedConfig = JSON.parse(content);

      // Validate loaded config
      if (!this.validateConfig(loadedConfig)) {
        throw new Error("Invalid config file structure");
      }

      this.config = loadedConfig;
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        Logger.error(
          `Failed to load config: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Use default config if file doesn't exist or is invalid
      this.config = {
        clonedRepos: {},
        kubeconfig: null,
        localServices: {},
      };
    }
  }

  private validateConfig(config: unknown): config is ServiceConfig {
    if (!config || typeof config !== "object") return false;

    const { clonedRepos, kubeconfig, localServices } = config as ServiceConfig;

    // Validate clonedRepos
    if (typeof clonedRepos !== "object" || !clonedRepos) return false;
    for (const [key, value] of Object.entries(clonedRepos)) {
      if (typeof key !== "string" || typeof value !== "string") return false;
    }

    // Validate kubeconfig
    if (kubeconfig !== null && typeof kubeconfig !== "string") return false;

    // Validate localServices
    if (typeof localServices !== "object" || !localServices) return false;
    for (const [_key, value] of Object.entries(localServices)) {
      if (!this.validateLocalServiceConfig(value)) return false;
    }

    return true;
  }

  private validateLocalServiceConfig(config: unknown): config is LocalServiceConfig {
    if (!config || typeof config !== "object") return false;

    const { repoPath, script, env, namespace } = config as LocalServiceConfig;

    return (
      typeof repoPath === "string" &&
      typeof script === "string" &&
      typeof env === "object" &&
      env !== null &&
      (namespace === undefined || typeof namespace === "string")
    );
  }

  async save(): Promise<void> {
    try {
      await Deno.writeTextFile(
        ConfigManager.CONFIG_FILE,
        JSON.stringify(this.config, null, 2),
      );
    } catch (err) {
      Logger.error(
        `Failed to save config: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async addLocalService(
    service: string,
    config: LocalServiceConfig,
  ): Promise<void> {
    if (!this.validateLocalServiceConfig(config)) {
      throw new Error(`Invalid configuration for service: ${service}`);
    }

    // Ensure repo path exists
    if (!(await exists(config.repoPath))) {
      throw new Error(`Repository path does not exist: ${config.repoPath}`);
    }

    this.config.localServices[service] = config;
    await this.save();
  }

  async removeLocalService(service: string): Promise<void> {
    delete this.config.localServices[service];
    await this.save();
  }

  async updateLocalService(
    service: string,
    updates: Partial<LocalServiceConfig>,
  ): Promise<void> {
    const current = this.config.localServices[service];
    if (!current) {
      throw new Error(`Service not found: ${service}`);
    }

    // Merge updates with current config
    const updated = { ...current, ...updates };
    if (!this.validateLocalServiceConfig(updated)) {
      throw new Error(`Invalid configuration update for service: ${service}`);
    }

    this.config.localServices[service] = updated;
    await this.save();
  }

  setKubeconfig(kubeconfig: string | null): void {
    this.config.kubeconfig = kubeconfig;
    this.save().catch((err) => {
      Logger.error(
        `Failed to save kubeconfig: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  getKubeconfig(): string | null {
    return this.config.kubeconfig;
  }

  addClonedRepo(service: string, repoPath: string): void {
    this.config.clonedRepos[service] = repoPath;
    this.save().catch((err) => {
      Logger.error(
        `Failed to save cloned repo: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  getClonedRepoPath(service: string): string | undefined {
    return this.config.clonedRepos[service];
  }

  getLocalServices(): Record<string, LocalServiceConfig> {
    return { ...this.config.localServices };
  }

  getLocalServiceConfig(service: string): LocalServiceConfig | undefined {
    return this.config.localServices[service];
  }
}
