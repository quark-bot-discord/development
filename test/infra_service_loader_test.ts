import { assertEquals, assertExists } from "jsr:@std/assert";
import { getInfrastructureServices } from "../src/services/infra-service-loader.ts";

Deno.test("Infrastructure Service Loader - Service configuration validation", async () => {
  const services = await getInfrastructureServices();
  const serviceNames = Object.keys(services);
  
  // Test with the first available service
  if (serviceNames.length > 0) {
    const serviceName = serviceNames[0];
    const service = services[serviceName];
    
    assertExists(service);
    assertEquals(typeof service.name, "string");
    assertEquals(typeof service.namespace, "string");
    assertEquals(typeof service.image, "string");
    assertExists(service.ports);
    assertEquals(Array.isArray(service.ports), true);
  }
});

Deno.test("Infrastructure Service Loader - Service with secrets validation", async () => {
  const services = await getInfrastructureServices();
  
  // Find a service with secrets
  const serviceWithSecrets = Object.entries(services).find(([_, config]) => 
    config.secrets && Object.keys(config.secrets).length > 0
  );
  
  if (serviceWithSecrets) {
    const [_, service] = serviceWithSecrets;
    assertExists(service);
    assertExists(service.secrets);
    
    // Check that at least one secret exists
    const secretKeys = Object.keys(service.secrets);
    assertEquals(secretKeys.length > 0, true);
    
    // Check the first secret is a string
    const firstSecretKey = secretKeys[0];
    assertEquals(typeof service.secrets[firstSecretKey], "string");
  }
});

Deno.test("Infrastructure Service Loader - Service ports validation", async () => {
  const services = await getInfrastructureServices();
  const serviceNames = Object.keys(services);
  
  // Ensure we have services loaded
  assertEquals(serviceNames.length > 0, true, "Should load at least one infrastructure service");
  
  // Test all services have ports configuration
  for (const serviceName of serviceNames) {
    const config = services[serviceName];
    assertExists(config.ports, `Service should have ports configuration`);
    assertEquals(Array.isArray(config.ports), true, `Service ports should be an array`);
  }
});

Deno.test("Infrastructure Service Loader - Volume configuration validation", async () => {
  const services = await getInfrastructureServices();
  
  // Find a service with volume configuration
  const serviceWithVolumes = Object.entries(services).find(([_, config]) => 
    config.volumes && config.volumes.length > 0
  );
  
  if (serviceWithVolumes) {
    const [_, service] = serviceWithVolumes;
    assertExists(service.volumes);
    assertEquals(Array.isArray(service.volumes), true);
    
    // Validate the first volume
    const firstVolume = service.volumes[0];
    assertExists(firstVolume);
    assertExists(firstVolume.name);
    assertExists(firstVolume.mountPath);
    assertEquals(typeof firstVolume.name, "string");
    assertEquals(typeof firstVolume.mountPath, "string");
  }
});

Deno.test("Infrastructure Service Loader - Service completeness validation", async () => {
  const services = await getInfrastructureServices();
  const serviceNames = Object.keys(services);
  
  // Ensure we have services loaded
  assertEquals(serviceNames.length > 0, true, "Should load at least one infrastructure service");
  
  for (const serviceName of serviceNames) {
    const service = services[serviceName];
    
    // Check for required properties
    assertExists(service, `Service ${serviceName} should exist`);
    assertExists(service.name, `Service ${serviceName} should have a name property`);
    assertExists(service.image, `Service ${serviceName} should have an image property`);
    assertExists(service.namespace, `Service ${serviceName} should have a namespace property`);
    assertExists(service.ports, `Service ${serviceName} should have ports configuration`);
    
    // Check data types
    assertEquals(typeof service.name, "string", `Service ${serviceName}'s name should be a string`);
    assertEquals(typeof service.image, "string", `Service ${serviceName}'s image should be a string`);
    assertEquals(typeof service.namespace, "string", `Service ${serviceName}'s namespace should be a string`);
    assertEquals(Array.isArray(service.ports), true, `Service ${serviceName}'s ports should be an array`);
    
    // Port structure validation
    if (service.ports.length > 0) {
      const firstPort = service.ports[0];
      assertExists(firstPort.name, `Port in service ${serviceName} should have a name`);
      assertExists(firstPort.port, `Port in service ${serviceName} should have a port number`);
      assertEquals(typeof firstPort.name, "string", `Port name in service ${serviceName} should be a string`);
      assertEquals(typeof firstPort.port, "number", `Port number in service ${serviceName} should be a number`);
    }
  }
});

Deno.test("Infrastructure Service Loader - Service namespace validation", async () => {
  const services = await getInfrastructureServices();
  const serviceNames = Object.keys(services);
  
  // First ensure we have some services to test
  assertEquals(serviceNames.length > 0, true, "Should load at least one infrastructure service");
  
  // Check if all services have namespaces
  for (const serviceName of serviceNames) {
    const service = services[serviceName];
    assertExists(service.namespace, `Service ${serviceName} should have a namespace`);
    assertEquals(typeof service.namespace, "string", `Service ${serviceName}'s namespace should be a string`);
  }
  
  // Get the most common namespace - this is business logic that all infra services
  // should typically be in the same namespace
  const namespaces: Record<string, number> = {};
  for (const serviceName of serviceNames) {
    const ns = services[serviceName].namespace;
    namespaces[ns] = (namespaces[ns] || 0) + 1;
  }
  
  // Find the most common namespace
  let mostCommonNamespace = "";
  let highestCount = 0;
  
  for (const [ns, count] of Object.entries(namespaces)) {
    if (count > highestCount) {
      mostCommonNamespace = ns;
      highestCount = count;
    }
  }
  
  // Verify the dynamic behavior - namespace consistency
  // This tests that most infra services are in the expected namespace (core-services)
  // without hardcoding the namespace value
  const servicesInMostCommonNamespace = serviceNames.filter(name => 
    services[name].namespace === mostCommonNamespace
  ).length;
  
  // Ensure at least 70% of services are in the same namespace
  const minimumConsistencyPercentage = 0.7;
  const namespaceConsistencyRatio = servicesInMostCommonNamespace / serviceNames.length;
  
  assertEquals(
    namespaceConsistencyRatio >= minimumConsistencyPercentage, 
    true, 
    `At least ${minimumConsistencyPercentage * 100}% of services should share the same namespace (found ${namespaceConsistencyRatio * 100}%)`
  );
});
