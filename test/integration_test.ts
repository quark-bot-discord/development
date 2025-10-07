import { assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert";
import { getInfrastructureServices } from "../src/services/infra-service-loader.ts";
import { getApplicationServices } from "../src/services/service-loader.ts";
import { ManifestGenerator } from "../src/kubernetes/manifest-generator.ts";
import { ServiceManager } from "../src/core/service-manager.ts";
import { ClusterManager } from "../src/core/cluster-manager.ts";

Deno.test("Integration - End-to-end manifest generation", async () => {
  // Load services
  const infraServices = await getInfrastructureServices();
  const appServices = await getApplicationServices();
  
  assertExists(infraServices);
  assertExists(appServices);
  
  // Generate manifests for infrastructure services - test with a random service
  const generator = new ManifestGenerator();
  const infraServiceNames = Object.keys(infraServices);
  if (infraServiceNames.length > 0) {
    // Pick the first service for testing
    const serviceName = infraServiceNames[0];
    const config = infraServices[serviceName];
    
    const manifests = generator.generateInfraServiceManifests(config);
    assertExists(manifests, `Should generate manifests for ${serviceName}`);
    assertEquals(manifests.length > 0, true, `Should generate at least one manifest for ${serviceName}`);
    
    // Every infrastructure service should have at least a Deployment and Service
    const kinds = manifests.map(m => m.kind);
    assertEquals(kinds.includes("Deployment"), true, `${serviceName} should have a Deployment`);
    assertEquals(kinds.includes("Service"), true, `${serviceName} should have a Service`);
  }
  
  // Generate manifests for application services - test with a random service
  const appServiceNames = Object.keys(appServices);
  if (appServiceNames.length > 0) {
    // Pick the first service for testing
    const serviceName = appServiceNames[0];
    const config = appServices[serviceName];
    
    const manifests = generator.generateAppServiceManifests(config, "app-services");
    assertExists(manifests, `Should generate manifests for ${serviceName}`);
    assertEquals(manifests.length > 0, true, `Should generate at least one manifest for ${serviceName}`);
    
    // Application services should have at least a Deployment
    const kinds = manifests.map(m => m.kind);
    assertEquals(kinds.includes("Deployment"), true, `${serviceName} should have a Deployment`);
  }
});

Deno.test("Integration - Service dependency resolution", async () => {
  const serviceManager = ServiceManager.getInstance();
  const appServices = await getApplicationServices();
  
  // Test dependency resolution for a single application service
  const appServiceNames = Object.keys(appServices);
  if (appServiceNames.length > 0) {
    const serviceName = appServiceNames[0];
    const dependencies = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    assertExists(dependencies, `Should resolve dependencies for ${serviceName}`);
    assertEquals(Array.isArray(dependencies), true, `Dependencies for ${serviceName} should be an array`);
  }
});

Deno.test("Integration - Complete YAML generation and validation", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  
  // Test YAML generation with the first available service
  const infraServiceNames = Object.keys(infraServices);
  if (infraServiceNames.length > 0) {
    const serviceName = infraServiceNames[0];
    const config = infraServices[serviceName];
    
    const manifests = generator.generateInfraServiceManifests(config);
    const yaml = generator.manifestsToYaml(manifests);
    
    assertExists(yaml);
    assertStringIncludes(yaml, "apiVersion:");
    assertStringIncludes(yaml, "kind:");
    assertStringIncludes(yaml, "metadata:");
    
    // Validate YAML structure
    const yamlParts = yaml.split("---");
    assertEquals(yamlParts.length, manifests.length, "YAML should have correct number of documents");
  }
});

Deno.test("Integration - Secret handling workflow", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  
  // Find a service with secrets
  const serviceWithSecrets = Object.entries(infraServices)
    .find(([_, config]) => config.secrets && Object.keys(config.secrets).length > 0);
  
  if (serviceWithSecrets) {
    const [_serviceName, config] = serviceWithSecrets;
    
    const manifests = generator.generateInfraServiceManifests(config);
    const yaml = generator.manifestsToYaml(manifests);
    
    // Should contain Secret manifest
    assertStringIncludes(yaml, "kind: Secret");
    
    // Deployment should reference the secret
    assertStringIncludes(yaml, "secretKeyRef:");
  }
});

Deno.test("Integration - Manager component interactions", () => {
  // Test that all manager singletons are properly initialized and can interact
  const serviceManager = ServiceManager.getInstance();
  const clusterManager = ClusterManager.getInstance();
  
  assertExists(serviceManager);
  assertExists(clusterManager);
  
  // Test that cluster manager has access to service manager
  const clusterServiceManager = (clusterManager as unknown as { serviceManager: unknown }).serviceManager;
  assertEquals(clusterServiceManager, serviceManager, "ClusterManager should use the same ServiceManager singleton");
});
