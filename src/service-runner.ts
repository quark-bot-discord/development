import { Logger } from "./logger.ts";
import { getApplicationServices } from "./service-loader.ts";
import type { LocalServiceConfig } from "./types.ts";
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

  private getServiceCommand(service: string, appConfig: ServiceDefinition): Deno.Command {
    const { command } = appConfig;
    const cwd = `/workspace/repos/${service}`;

    if (!command) {
      throw new Error(`No command specified for service: ${service}`);
    }

    return new Deno.Command(command.type, {
      args: command.run,
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
  }

  async startService(service: string, _serviceConfig: LocalServiceConfig) {
    const applicationServices = await getApplicationServices();
    const appConfig = applicationServices[service];
    if (!appConfig) {
      Logger.error(
        `No application configuration found for service: ${service}`,
      );
      return;
    }

    Logger.info(`\nStarting ${service} (${appConfig.type})...`);
    
    try {
      const process = this.getServiceCommand(service, appConfig);
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
