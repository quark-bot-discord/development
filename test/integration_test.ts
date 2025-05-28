import { assertEquals, assertExists, assertInstanceOf, assertStringIncludes } from "jsr:@std/assert";
import { getInfrastructureServices } from "../src/infra-service-loader.ts";
import { getApplicationServices } from "../src/service-loader.ts";
import { ManifestGenerator } from "../src/manifest-generator.ts";
import { ServiceManager } from "../src/service-manager.ts";
import { ClusterManager } from "../src/cluster-manager.ts";

Deno.test("Integration - End-to-end manifest generation", async () => {
  // Load services
  const infraServices = await getInfrastructureServices();
  const appServices = await getApplicationServices();
  
  assertExists(infraServices);
  assertExists(appServices);
  
  // Generate manifests for infrastructure services
  const generator = new ManifestGenerator();
  
  for (const [serviceName, config] of Object.entries(infraServices)) {
    const manifests = generator.generateInfraServiceManifests(config);
    
    assertExists(manifests, `Should generate manifests for ${serviceName}`);
    assertEquals(manifests.length > 0, true, `Should generate at least one manifest for ${serviceName}`);
    
    // Every infrastructure service should have at least a Deployment and Service
    const kinds = manifests.map(m => m.kind);
    assertEquals(kinds.includes("Deployment"), true, `${serviceName} should have a Deployment`);
    assertEquals(kinds.includes("Service"), true, `${serviceName} should have a Service`);
  }
  
  // Generate manifests for application services
  for (const [serviceName, config] of Object.entries(appServices)) {
    const manifests = generator.generateAppServiceManifests(config, "app-services");
    
    assertExists(manifests, `Should generate manifests for ${serviceName}`);
    assertEquals(manifests.length > 0, true, `Should generate at least one manifest for ${serviceName}`);
    
    // Every application service should have at least a ConfigMap and Deployment
    const kinds = manifests.map(m => m.kind);
    assertEquals(kinds.includes("ConfigMap"), true, `${serviceName} should have a ConfigMap`);
    assertEquals(kinds.includes("Deployment"), true, `${serviceName} should have a Deployment`);
  }
});

Deno.test("Integration - Service dependency resolution", async () => {
  const serviceManager = ServiceManager.getInstance();
  const appServices = await getApplicationServices();
  
  // Test dependency resolution for all application services
  for (const serviceName of Object.keys(appServices)) {
    const dependencies = await serviceManager.getServiceDependenciesFromDefinitions(serviceName);
    
    assertExists(dependencies, `Should resolve dependencies for ${serviceName}`);
    assertEquals(Array.isArray(dependencies), true, `Dependencies for ${serviceName} should be an array`);
    
    // Dependencies should be strings
    for (const dep of dependencies) {
      assertEquals(typeof dep, "string", `Dependency ${dep} should be a string`);
    }
  }
});

Deno.test("Integration - Complete YAML generation and validation", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  
  // Test complete YAML generation for Redis
  const redis = infraServices["redis"];
  assertExists(redis);
  
  const manifests = generator.generateInfraServiceManifests(redis);
  const yaml = generator.manifestsToYaml(manifests);
  
  assertExists(yaml);
  assertStringIncludes(yaml, "apiVersion: v1");
  assertStringIncludes(yaml, "kind: PersistentVolume");
  assertStringIncludes(yaml, "kind: PersistentVolumeClaim");
  assertStringIncludes(yaml, "kind: Deployment");
  assertStringIncludes(yaml, "kind: Service");
  assertStringIncludes(yaml, "name: redis");
  assertStringIncludes(yaml, "namespace: core-services");
  
  // Validate YAML structure
  const yamlParts = yaml.split("---");
  assertEquals(yamlParts.length, manifests.length, "YAML should have correct number of documents");
});

Deno.test("Integration - Secret handling workflow", async () => {
  const generator = new ManifestGenerator();
  const infraServices = await getInfrastructureServices();
  
  // Test with MySQL which has secrets
  const mysql = infraServices["mysql"];
  assertExists(mysql);
  assertExists(mysql.secrets);
  
  const manifests = generator.generateInfraServiceManifests(mysql);
  const yaml = generator.manifestsToYaml(manifests);
  
  // Should contain Secret manifest
  assertStringIncludes(yaml, "kind: Secret");
  assertStringIncludes(yaml, "mysql-secrets");
  assertStringIncludes(yaml, "MYSQL_ROOT_PASSWORD");
  assertStringIncludes(yaml, "MYSQL_PASSWORD");
  
  // Deployment should reference the secret
  assertStringIncludes(yaml, "secretRef:");
  assertStringIncludes(yaml, "name: mysql-secrets");
});

Deno.test("Integration - Service type resolution consistency", async () => {
  const serviceManager = ServiceManager.getInstance();
  const infraServices = await getInfrastructureServices();
  const appServices = await getApplicationServices();
  
  // Test that infrastructure services are properly categorized
  for (const serviceName of Object.keys(infraServices)) {
    const serviceType = serviceManager.getServiceType(serviceName);
    assertEquals(serviceType, "core-services", `Infrastructure service ${serviceName} should be core-services`);
  }
  
  // Test that known application services are properly categorized
  const knownAppServices = ["bot", "gateway", "website"];
  for (const serviceName of knownAppServices) {
    if (appServices[serviceName]) {
      const serviceType = serviceManager.getServiceType(serviceName);
      assertEquals(serviceType, "app-services", `Application service ${serviceName} should be app-services`);
    }
  }
});

Deno.test("Integration - Manager component interactions", () => {
  // Test that all manager singletons are properly initialized and can interact
  const serviceManager = ServiceManager.getInstance();
  const clusterManager = ClusterManager.getInstance();
  
  assertExists(serviceManager);
  assertExists(clusterManager);
  
  // Test that cluster manager has access to service manager
  const clusterServiceManager = (clusterManager as any).serviceManager;
  assertEquals(clusterServiceManager, serviceManager, "ClusterManager should use the same ServiceManager singleton");
  
  // Test that service manager can resolve service types
  assertEquals(serviceManager.getServiceType("redis"), "core-services");
  assertEquals(serviceManager.getServiceType("bot"), "app-services");
});
