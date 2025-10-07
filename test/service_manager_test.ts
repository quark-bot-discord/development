import { assertEquals, assertExists } from "jsr:@std/assert";
import { ServiceManager } from "../src/core/service-manager.ts";
import { getInfrastructureServices } from "../src/services/infra-service-loader.ts";
import { getApplicationServices } from "../src/services/service-loader.ts";

Deno.test("Service Manager - singleton instance", () => {
  const instance1 = ServiceManager.getInstance();
  const instance2 = ServiceManager.getInstance();
  
  assertEquals(instance1, instance2, "Should return the same singleton instance");
});

Deno.test("Service Manager - dependency resolution from definitions", async () => {
  const serviceManager = ServiceManager.getInstance();
  const appServices = await getApplicationServices();
  const appServiceNames = Object.keys(appServices);
  
  if (appServiceNames.length > 0) {
    // Test with the first available service
    const serviceName = appServiceNames[0];
    const deps = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    assertExists(deps, `${serviceName} should have dependency resolution`);
    assertEquals(Array.isArray(deps), true, "Dependencies should be an array");
  }
});

Deno.test("Service Manager - infrastructure service dependencies", async () => {
  const serviceManager = ServiceManager.getInstance();
  const infraServices = await getInfrastructureServices();
  const infraServiceNames = Object.keys(infraServices);
  
  if (infraServiceNames.length > 0) {
    // Test with the first available infrastructure service
    const serviceName = infraServiceNames[0];
    const deps = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    assertExists(deps, `${serviceName} should have dependency resolution`);
    assertEquals(Array.isArray(deps), true, "Dependencies should be an array");
  }
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
  const appServices = await getApplicationServices();
  const appServiceNames = Object.keys(appServices);
  
  if (appServiceNames.length > 0) {
    // Test with the first available service
    const serviceName = appServiceNames[0];
    
    // First call
    const deps1 = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    // Second call should use cache
    const deps2 = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    assertEquals(deps1, deps2, "Dependencies should be cached");
    assertEquals(deps1.length, deps2.length, "Cached dependencies should have same length");
  }
});

Deno.test("Service Manager - cache clearing", async () => {
  const serviceManager = ServiceManager.getInstance();
  const appServices = await getApplicationServices();
  const appServiceNames = Object.keys(appServices);
  
  if (appServiceNames.length > 0) {
    // Test with the first available service
    const serviceName = appServiceNames[0];
    
    // Load some dependencies to populate cache
    await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    // Clear cache
    serviceManager.clearManifestCache();
    
    // Should still work after cache clear
    const deps = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    assertExists(deps, "Should work after cache clear");
    assertEquals(Array.isArray(deps), true, "Should return an array after cache clear");
  }
});
