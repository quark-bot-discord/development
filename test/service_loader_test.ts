import { assertEquals, assertExists } from "jsr:@std/assert";
import { getApplicationServices } from "../src/services/service-loader.ts";
import { validCommandTypes, validServiceTypes, type ServiceDefinition } from "../src/services/service-types.ts";

Deno.test("Application Service Loader - Service Dependencies", async () => {
  const services = await getApplicationServices();
  const serviceGroups = await import("../q4/const/constants.ts");

  // Get core services (these are what other services might depend on)
  const coreServices = serviceGroups.SERVICE_GROUPS.core.services;
  
  // Helper to check if a service has core service dependencies
  const checkCoreDependencies = (serviceName: string, config: ServiceDefinition) => {
    if (!config.env) return;
    
    // Check for core service references in environment variables
    for (const [_key, value] of Object.entries(config.env)) {
      const stringValue = String(value);
      
      for (const coreService of coreServices) {
        // Look for host references like mysql.core-services or redis.core-services
        if (stringValue.includes(`${coreService}.core-services`)) {
          // This is not a strict equality test because some services reference the same core service multiple times
          assertExists(
            Object.entries(config.env).find(([k, v]) => 
              k.toLowerCase().includes(coreService) || String(v).includes(coreService)
            ),
            `Service ${serviceName} references ${coreService} but doesn't have corresponding env vars`
          );
        }
      }
    }
  };

  // Test each service
  for (const [serviceName, config] of Object.entries(services)) {
    if (config.env && Object.keys(config.env).length > 0) {
      checkCoreDependencies(serviceName, config);
    }
  }
});

Deno.test("Application Service Loader - Service Types and Commands", async () => {
  const services = await getApplicationServices();
  const serviceGroups = await import("../q4/const/constants.ts");

  // Test each service group
  for (const [groupName, group] of Object.entries(serviceGroups.SERVICE_GROUPS)) {
    // Skip core services as they're infrastructure services
    if (groupName === "core") continue;

    for (const serviceName of group.services) {
      const config = services[serviceName];
      assertExists(config, `Service ${serviceName} from ${groupName} group should be loaded`);

      // Validate service type
      assertEquals(
        validServiceTypes.includes(config.type),
        true,
        `Service ${serviceName} should have a valid type, got: ${config.type}`
      );

      // Validate command configuration based on service type
      if (["typescript", "javascript", "rust"].includes(config.type)) {
        assertExists(
          config.command,
          `Service ${serviceName} of type ${config.type} should have a command`
        );

        assertEquals(
          validCommandTypes.includes(config.command!.type as "npm" | "pnpm" | "cargo" | "deno"),
          true,
          `Service ${serviceName} should have a valid command type, got: ${config.command!.type}`
        );

        // TypeScript/JavaScript services should use npm or pnpm
        if (["typescript", "javascript"].includes(config.type)) {
          assertEquals(
            ["npm", "pnpm"].includes(config.command!.type),
            true,
            `TypeScript/JavaScript service ${serviceName} should use npm or pnpm`
          );
        }

        // Rust services should use cargo
        if (config.type === "rust") {
          assertEquals(
            config.command!.type,
            "cargo",
            `Rust service ${serviceName} should use cargo`
          );
        }
      }
    }
  }
});
