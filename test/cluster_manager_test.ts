import { assertEquals, assertExists } from "jsr:@std/assert";
import { ClusterManager } from "../src/cluster-manager.ts";

Deno.test("Cluster Manager - singleton instance", () => {
  const instance1 = ClusterManager.getInstance();
  const instance2 = ClusterManager.getInstance();
  
  assertEquals(instance1, instance2, "Should return the same singleton instance");
});

Deno.test("Cluster Manager - initialization", () => {
  const clusterManager = ClusterManager.getInstance();
  
  assertExists(clusterManager);
  // Check that it's a ClusterManager instance
  assertEquals(clusterManager.constructor.name, "ClusterManager");
  
  // Check that internal components are initialized
  const serviceManager = (clusterManager as any).serviceManager;
  const manifestGenerator = (clusterManager as any).manifestGenerator;
  
  assertExists(serviceManager);
  assertExists(manifestGenerator);
});

Deno.test("Cluster Manager - service directories configuration", () => {
  const serviceDirectories = (ClusterManager as any).SERVICE_DIRS;
  
  assertExists(serviceDirectories);
  assertEquals(Array.isArray(serviceDirectories), true);
  assertEquals(serviceDirectories.includes("core-services"), true);
  assertEquals(serviceDirectories.includes("app-services"), true);
  assertEquals(serviceDirectories.includes("other-services"), true);
});

Deno.test("Cluster Manager - service directories configuration", () => {
  const serviceDirectories = (ClusterManager as any).SERVICE_DIRS;
  
  assertExists(serviceDirectories);
  assertEquals(Array.isArray(serviceDirectories), true);
  assertEquals(serviceDirectories.includes("core-services"), true);
  assertEquals(serviceDirectories.includes("app-services"), true);
  assertEquals(serviceDirectories.includes("other-services"), true);
});

// Note: Testing actual cluster operations requires k3d and kubectl to be available
// and would create real cluster resources, so we test the structure and dependencies

Deno.test("Cluster Manager - dependency integration", async () => {
  const clusterManager = ClusterManager.getInstance();
  
  // Test that it can access service manager functionality
  const serviceManager = (clusterManager as any).serviceManager;
  const serviceType = serviceManager.getServiceType("redis");
  
  assertEquals(serviceType, "core-services");
});

Deno.test("Cluster Manager - manifest generator integration", async () => {
  const clusterManager = ClusterManager.getInstance();
  
  // Test that it can access manifest generator
  const manifestGenerator = (clusterManager as any).manifestGenerator;
  assertExists(manifestGenerator);
  
  // Test that it can generate manifests
  const infraServices = await import("../src/infra-service-loader.ts");
  const services = await infraServices.getInfrastructureServices();
  const redis = services["redis"];
  
  if (redis) {
    const manifests = manifestGenerator.generateInfraServiceManifests(redis);
    assertExists(manifests);
    assertEquals(Array.isArray(manifests), true);
    assertEquals(manifests.length > 0, true);
  }
});
