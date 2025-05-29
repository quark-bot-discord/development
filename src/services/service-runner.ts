import { Logger } from "../development/logger.ts";
import { getApplicationServices } from "./service-loader.ts";
import type { LocalServiceConfig } from "../types/types.ts";
import type { ServiceDefinition } from "./service-types.ts";

export class ServiceRunner {
  private static instance: ServiceRunner;

  private constructor() {}

  static getInstance(): ServiceRunner {
    if (!ServiceRunner.instance) {
      ServiceRunner.instance = new ServiceRunner();
    }
    return ServiceRunner.instance;
  }

  private getServiceCommand(service: string, appConfig: ServiceDefinition, serviceConfig: LocalServiceConfig): Deno.Command {
    const { command } = appConfig;
    const cwd = `/workspace/repos/${service}`;

    if (!command) {
      throw new Error(`No command specified for service: ${service}`);
    }

    // Combine environment variables from both configs
    // Service config (from q4) takes precedence over local config
    const env = {
      ...Deno.env.toObject(), // Include current environment
      ...serviceConfig.env,   // Include local service config env vars
      ...(appConfig.env || {}), // Include application config env vars if defined
    };

    return new Deno.Command(command.type, {
      args: command.run,
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      env,
    });
  }

  /**
   * Runs setup commands for a service
   * @param service Service name
   * @param appConfig Application configuration
   */
  private async runSetupCommands(service: string, appConfig: ServiceDefinition): Promise<void> {
    if (!appConfig.setup || appConfig.setup.length === 0) {
      return; // No setup commands to run
    }

    const cwd = `/workspace/repos/${service}`;
    Logger.info(`Running setup commands for ${service}...`);

    for (const setupCommand of appConfig.setup) {
      Logger.info(`  Running: ${setupCommand}`);
      
      // Parse the command - assume it's a shell command for now
      const parts = setupCommand.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      try {
        const process = new Deno.Command(cmd, {
          args,
          cwd,
          stdout: "inherit",
          stderr: "inherit",
        });
        
        const result = await process.output();
        
        if (!result.success) {
          throw new Error(`Setup command failed with exit code ${result.code}`);
        }
        
        Logger.success(`  ✓ ${setupCommand}`);
      } catch (error) {
        Logger.error(`Setup command failed: ${setupCommand}`);
        throw error;
      }
    }
  }

  async startService(service: string, serviceConfig: LocalServiceConfig) {
    const applicationServices = await getApplicationServices();
    const appConfig = applicationServices[service];
    if (!appConfig) {
      Logger.error(
        `No application configuration found for service: ${service}`,
      );
      return;
    }

    Logger.info(`\nStarting ${service} (${appConfig.type})...`);
    
    // Log environment variable usage for debugging
    const serviceEnvCount = Object.keys(serviceConfig.env).length;
    const appEnvCount = Object.keys(appConfig.env || {}).length;
    Logger.info(`Using ${serviceEnvCount + appEnvCount} environment variables (${serviceEnvCount} from service config, ${appEnvCount} from app config).`);
    
    try {
      // Run setup commands before starting the service
      await this.runSetupCommands(service, appConfig);

      const process = this.getServiceCommand(service, appConfig, serviceConfig);
      const child = process.spawn();
      Logger.success(`${service} started with PID ${child.pid}`);
    } catch (error) {
      Logger.error(
        `Failed to start ${service}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Prints the environment variables for a service without starting it
   * @param service Service name
   * @param serviceConfig Service configuration
   */
  async printServiceEnv(service: string, serviceConfig: LocalServiceConfig): Promise<void> {
    const applicationServices = await getApplicationServices();
    const appConfig = applicationServices[service];
    if (!appConfig) {
      Logger.error(`No application configuration found for service: ${service}`);
      return;
    }

    // Combine the environment variables
    const env = {
      ...serviceConfig.env,
      ...(appConfig.env || {}),
    };

    Logger.info(`\nEnvironment variables for ${service}:`);
    
    // Display environment variables in sorted order
    Object.keys(env).sort().forEach(key => {
      Logger.info(`  ${key}=${env[key]}`);
    });
  }

  async startAllServices(
    services: Record<string, LocalServiceConfig>,
  ): Promise<void> {
    if (Object.keys(services).length === 0) {
      Logger.error(
        "No local services configured. Use 'quark add' to add services.",
      );
      Deno.exit(1);
    }

    Logger.info("Starting local services...");
    for (const [service, config] of Object.entries(services)) {
      await this.startService(service, config);
    }
  }
}
