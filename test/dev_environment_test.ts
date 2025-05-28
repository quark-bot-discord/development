import { assertEquals, assertExists, assertInstanceOf, assertStringIncludes } from "jsr:@std/assert";
import { DevEnvironment } from "../src/dev-environment.ts";

Deno.test("Dev Environment - instantiation", () => {
  const devEnv = new DevEnvironment();
  assertExists(devEnv);
  assertInstanceOf(devEnv, DevEnvironment);
});

Deno.test("Dev Environment - service selection validation", async () => {
  const devEnv = new DevEnvironment();
  
  // Access private serviceManager for testing
  const serviceManager = (devEnv as any).serviceManager;
  assertExists(serviceManager);
  
  // Test that service manager is properly initialized
  const serviceType = serviceManager.getServiceType("redis");
  assertEquals(serviceType, "core-services");
});

Deno.test("Dev Environment - dependency resolution integration", async () => {
  const devEnv = new DevEnvironment();
  const serviceManager = (devEnv as any).serviceManager;
  
  // Test that the new dependency resolution method is available
  const dependencies = await serviceManager.getServiceDependenciesFromDefinitions("bot");
  assertExists(dependencies);
  assertEquals(Array.isArray(dependencies), true);
  
  // Bot should have dependencies on core services
  const hasCoreServiceDeps = dependencies.some((dep: string) => 
    ["redis", "mysql", "nats"].includes(dep)
  );
  assertEquals(hasCoreServiceDeps, true, "Bot should depend on core services");
});

Deno.test("Dev Environment - cluster manager integration", () => {
  const devEnv = new DevEnvironment();
  
  // Access private clusterManager for testing
  const clusterManager = (devEnv as any).clusterManager;
  assertExists(clusterManager);
  
  // Should be properly initialized
  assertInstanceOf(clusterManager, Object);
});

Deno.test("Dev Environment - config manager integration", () => {
  const devEnv = new DevEnvironment();
  
  // Access private configManager for testing
  const configManager = (devEnv as any).configManager;
  assertExists(configManager);
  
  // Should be properly initialized
  assertInstanceOf(configManager, Object);
});

// Note: The full setup() method requires user interaction and cluster creation,
// so we test the components it uses rather than the full method

Deno.test("Dev Environment - repository filtering logic", async () => {
  const devEnv = new DevEnvironment();
  
  // Test the logic that would be used in setupRepositories
  const testServices = ["bot", "redis", "configmap:test", "secret:test", "pvc:test"];
  
  // Filter out infrastructure services and kubernetes resources
  const SERVICE_GROUPS = (await import("../q4/const/constants.ts")).SERVICE_GROUPS;
  const QUARK_REPOS = (await import("../q4/const/constants.ts")).QUARK_REPOS;
  
  const servicesWithRepos = testServices.filter(service => 
    service in QUARK_REPOS && 
    !service.startsWith('configmap:') && 
    !service.startsWith('secret:') && 
    !service.startsWith('pvc:')
  );
  
  // Should only include bot (has repo), exclude redis (core service), and k8s resources
  assertEquals(servicesWithRepos.includes("bot"), true);
  assertEquals(servicesWithRepos.includes("redis"), false);
  assertEquals(servicesWithRepos.includes("configmap:test"), false);
  assertEquals(servicesWithRepos.includes("secret:test"), false);
  assertEquals(servicesWithRepos.includes("pvc:test"), false);
});
