import { assertEquals, assertExists, assertInstanceOf } from "jsr:@std/assert";
import { getInfrastructureServices } from "../src/infra-service-loader.ts";
import type { InfraServiceConfig } from "../src/service-types.ts";

Deno.test("Infrastructure Service Loader - loads all services", async () => {
  const services = await getInfrastructureServices();
  
  // Should load all infrastructure services
  assertExists(services);
  assertInstanceOf(services, Object);
  
  // Check that all expected infrastructure services are loaded
  const expectedServices = ["redis", "mysql", "nats", "elastic-search", "aerospike"];
  
  for (const serviceName of expectedServices) {
    assertExists(services[serviceName], `Service ${serviceName} should be loaded`);
    
    const config = services[serviceName] as InfraServiceConfig;
    assertExists(config.name, `Service ${serviceName} should have a name`);
    assertExists(config.namespace, `Service ${serviceName} should have a namespace`);
    assertExists(config.image, `Service ${serviceName} should have an image`);
    assertExists(config.ports, `Service ${serviceName} should have ports`);
    assertEquals(config.ports.length > 0, true, `Service ${serviceName} should have at least one port`);
  }
});

Deno.test("Infrastructure Service Loader - Redis configuration", async () => {
  const services = await getInfrastructureServices();
  const redis = services["redis"];
  
  assertExists(redis);
  assertEquals(redis.name, "redis");
  assertEquals(redis.namespace, "core-services");
  assertEquals(redis.image, "redis:7");
  assertEquals(redis.ports.length, 1);
  assertEquals(redis.ports[0].port, 6379);
  assertEquals(redis.ports[0].name, "redis");
});

Deno.test("Infrastructure Service Loader - MySQL configuration with secrets", async () => {
  const services = await getInfrastructureServices();
  const mysql = services["mysql"];
  
  assertExists(mysql);
  assertEquals(mysql.name, "mysql");
  assertEquals(mysql.namespace, "core-services");
  assertEquals(mysql.image, "mysql:8");
  assertEquals(mysql.ports.length, 1);
  assertEquals(mysql.ports[0].port, 3306);
  
  // Check that secrets are properly configured
  assertExists(mysql.secrets);
  assertExists(mysql.secrets.MYSQL_ROOT_PASSWORD);
  assertExists(mysql.secrets.MYSQL_PASSWORD);
  
  // Check that non-sensitive env vars are in env, not secrets
  assertExists(mysql.env);
  assertExists(mysql.env.MYSQL_DATABASE);
  assertExists(mysql.env.MYSQL_USER);
});

Deno.test("Infrastructure Service Loader - services with volumes", async () => {
  const services = await getInfrastructureServices();
  const mysql = services["mysql"];
  const elastic = services["elastic-search"];
  
  // MySQL should have volumes
  assertExists(mysql.volumes);
  assertEquals(mysql.volumes.length, 1);
  assertEquals(mysql.volumes[0].name, "mysql-data");
  assertEquals(mysql.volumes[0].mountPath, "/var/lib/mysql");
  assertEquals(mysql.volumes[0].size, "20Gi");
  
  // Elasticsearch should have volumes
  assertExists(elastic.volumes);
  assertEquals(elastic.volumes.length, 1);
  assertEquals(elastic.volumes[0].name, "elastic-data");
  assertEquals(elastic.volumes[0].mountPath, "/usr/share/elasticsearch/data");
  assertEquals(elastic.volumes[0].size, "10Gi");
});

Deno.test("Infrastructure Service Loader - caching behavior", async () => {
  // First call
  const services1 = await getInfrastructureServices();
  
  // Second call should return the same object (cached)
  const services2 = await getInfrastructureServices();
  
  assertEquals(services1, services2, "Services should be cached");
});
