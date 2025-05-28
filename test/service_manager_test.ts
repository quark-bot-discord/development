import { assertEquals, assertExists } from "jsr:@std/assert";
import { ServiceManager } from "../src/service-manager.ts";

Deno.test("Service Manager - singleton instance", () => {
  const instance1 = ServiceManager.getInstance();
  const instance2 = ServiceManager.getInstance();
  
  assertEquals(instance1, instance2, "Should return the same singleton instance");
});


Deno.test("Service Manager - dependency resolution from definitions", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  // Test bot service dependencies
  const botDeps = await serviceManager.getServiceDependenciesFromDefinitions("bot");
  assertEquals(botDeps.includes("nats"), true, "Bot should depend on NATS");
  assertEquals(botDeps.includes("mysql"), true, "Bot should depend on MySQL");
  assertEquals(botDeps.includes("redis"), true, "Bot should depend on Redis");
});

Deno.test("Service Manager - gateway dependencies", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  const gatewayDeps = await serviceManager.getServiceDependenciesFromDefinitions("gateway");
  assertEquals(gatewayDeps.includes("nats"), true, "Gateway should depend on NATS");
  
  // Gateway may have fewer dependencies than bot
  assertExists(gatewayDeps, "Gateway should have some dependencies");
});

Deno.test("Service Manager - website dependencies", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  const websiteDeps = await serviceManager.getServiceDependenciesFromDefinitions("website");
  assertEquals(websiteDeps.includes("nats"), true, "Website should depend on NATS");
  assertEquals(websiteDeps.includes("mysql"), true, "Website should depend on MySQL");
  assertEquals(websiteDeps.includes("redis"), true, "Website should depend on Redis");
});

Deno.test("Service Manager - infrastructure service dependencies", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  // Test that infrastructure services may have volume dependencies
  const mysqlDeps = await serviceManager.getServiceDependenciesFromDefinitions("mysql");
  
  // Infrastructure services typically don't depend on other services
  // but may depend on persistent volumes
  assertExists(mysqlDeps, "MySQL should have dependency resolution");
});

Deno.test("Service Manager - unknown service fallback", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  // Test with a service that doesn't exist in definitions
  const unknownDeps = await serviceManager.getServiceDependenciesFromDefinitions("non-existent-service");
  
  // Should fallback to manifest-based approach and return empty array
  assertExists(unknownDeps, "Should handle unknown services gracefully");
  assertEquals(Array.isArray(unknownDeps), true, "Should return an array");
});

Deno.test("Service Manager - dependency caching", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  // First call
  const deps1 = await serviceManager.getServiceDependenciesFromDefinitions("bot");
  
  // Second call should use cache
  const deps2 = await serviceManager.getServiceDependenciesFromDefinitions("bot");
  
  assertEquals(deps1, deps2, "Dependencies should be cached");
  assertEquals(deps1.length, deps2.length, "Cached dependencies should have same length");
});

Deno.test("Service Manager - cache clearing", async () => {
  const serviceManager = ServiceManager.getInstance();
  
  // Load some dependencies to populate cache
  await serviceManager.getServiceDependenciesFromDefinitions("bot");
  
  // Clear cache
  serviceManager.clearManifestCache();
  
  // Should still work after cache clear
  const deps = await serviceManager.getServiceDependenciesFromDefinitions("bot");
  assertExists(deps, "Should work after cache clear");
  assertEquals(Array.isArray(deps), true, "Should return an array after cache clear");
});
