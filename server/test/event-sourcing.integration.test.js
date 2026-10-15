const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

require("tsx/cjs");
const app = require("../src/app.ts").default;
const EventStore = require("../src/models/EventStore.ts").default;
const ShipmentProjection = require("../src/models/ShipmentProjection.ts").default;
const {
  appendEvent,
} = require("../src/services/event-sourcing/event-store.service.ts");
const {
  projectShipmentAggregateEvents,
  projectShipmentEvent,
  projectPendingShipmentEvents,
  getShipmentProjection,
} = require("../src/services/event-sourcing/shipment-projection.service.ts");
const {
  startShipmentProjectionWorker,
} = require("../src/services/event-sourcing/shipment-projection.worker.ts");

const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const managerEmail = `event-manager-${suffix}@example.test`;
const staffEmail = `event-staff-${suffix}@example.test`;
const adminEmail = `event-admin-${suffix}@example.test`;
const password = "Event-sourcing-test-password-938!";

const ids = {
  users: [],
  warehouses: [],
  products: [],
  inventories: [],
  shipments: [],
};

let server;
let baseUrl;
let managerToken;
let staffToken;
let adminToken;
let sourceWarehouseId;
let destinationWarehouseId;
let productId;

async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function login(email) {
  const result = await api("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });

  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.token;
}

async function createTestShipment() {
  const result = await api("/api/commands/shipments/create", {
    method: "POST",
    token: managerToken,
    body: {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId, quantity: 2 }],
      expectedVersion: 0,
    },
  });

  assert.equal(result.status, 201, JSON.stringify(result.body));

  const id = result.body.data.aggregateId;
  ids.shipments.push(new mongoose.Types.ObjectId(id));

  return {
    id,
    data: result.body.data,
  };
}

before(async () => {
  assert.ok(
    process.env.MONGODB_URI,
    "MONGODB_URI must be set for event store integration tests"
  );
  assert.ok(
    process.env.JWT_SECRET,
    "JWT_SECRET must be set for event store integration tests"
  );

  await mongoose.connect(process.env.MONGODB_URI);
  await EventStore.init();

  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const manager = await mongoose.connection.collection("users").insertOne({
    name: "Event Store Manager",
    email: managerEmail,
    passwordHash: await bcrypt.hash(password, 4),
    role: "manager",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  ids.users.push(manager.insertedId);
  managerToken = await login(managerEmail);

  const admin = await mongoose.connection.collection("users").insertOne({
    name: "Event Store Admin",
    email: adminEmail,
    passwordHash: await bcrypt.hash(password, 4),
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  ids.users.push(admin.insertedId);
  adminToken = await login(adminEmail);

  const staffRegistration = await api("/api/auth/register", {
    method: "POST",
    body: {
      name: "Event Store Staff",
      email: staffEmail,
      password,
    },
  });

  assert.equal(
    staffRegistration.status,
    201,
    JSON.stringify(staffRegistration.body)
  );

  const staffId = new mongoose.Types.ObjectId(
    staffRegistration.body.user.id
  );

  ids.users.push(staffId);
  staffToken = await login(staffEmail);

  const source = await api("/api/warehouses", {
    method: "POST",
    token: managerToken,
    body: {
      name: `Event source ${suffix}`,
      code: `ES-${suffix}`,
      location: "Integration",
    },
  });

  const destination = await api("/api/warehouses", {
    method: "POST",
    token: managerToken,
    body: {
      name: `Event destination ${suffix}`,
      code: `ED-${suffix}`,
      location: "Integration",
    },
  });

  assert.equal(source.status, 201, JSON.stringify(source.body));
  assert.equal(destination.status, 201, JSON.stringify(destination.body));

  sourceWarehouseId = source.body.warehouse._id;
  destinationWarehouseId = destination.body.warehouse._id;

  ids.warehouses.push(
    new mongoose.Types.ObjectId(sourceWarehouseId),
    new mongoose.Types.ObjectId(destinationWarehouseId)
  );

  const product = await api("/api/products", {
    method: "POST",
    token: managerToken,
    body: {
      name: `Event product ${suffix}`,
      sku: `EP-${suffix}`,
      category: "Integration",
      price: 10,
      quantity: 0,
    },
  });

  assert.equal(product.status, 201, JSON.stringify(product.body));

  productId = product.body.product._id;
  ids.products.push(new mongoose.Types.ObjectId(productId));

  const inventory = await api("/api/inventory", {
    method: "POST",
    token: managerToken,
    body: {
      productId,
      warehouseId: sourceWarehouseId,
      quantity: 8,
    },
  });

  assert.equal(inventory.status, 201, JSON.stringify(inventory.body));

  ids.inventories.push(
    new mongoose.Types.ObjectId(inventory.body.inventory._id)
  );
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  if (mongoose.connection.readyState === 1) {
    const eventEntityIds = [...ids.shipments, ...ids.inventories];

    if (eventEntityIds.length) {
      await mongoose.connection.collection("eventstores").deleteMany({
        aggregateId: { $in: eventEntityIds },
      });

      await mongoose.connection.collection("events").deleteMany({
        $or: [
          { entityId: { $in: eventEntityIds } },
          { "payload.shipmentId": { $in: ids.shipments } },
        ],
      });
    }

    if (ids.shipments.length) {
      await mongoose.connection.collection("shipmentprojections").deleteMany({
        aggregateId: { $in: ids.shipments },
      });
    }

    if (ids.products.length || ids.warehouses.length) {
      await mongoose.connection.collection("inventories").deleteMany({
        $or: [
          { productId: { $in: ids.products } },
          { warehouseId: { $in: ids.warehouses } },
        ],
      });
    }

    for (const collectionName of [
      "shipments",
      "inventories",
      "products",
      "warehouses",
      "users",
    ]) {
      if (ids[collectionName].length) {
        await mongoose.connection
          .collection(collectionName)
          .deleteMany({
            _id: { $in: ids[collectionName] },
          });
      }
    }

    await mongoose.disconnect();
  }
});

test("command/query APIs replay shipment events and reconstruct historical states", async () => {
  const created = await createTestShipment();

  assert.equal(created.data.version, 1);
  assert.equal(created.data.eventCount, 1);
  assert.equal(created.data.state.status, "CREATED");

  const createdStream = await api(
    `/api/queries/shipments/${created.id}/events`,
    { token: managerToken }
  );

  assert.equal(createdStream.status, 200);
  assert.deepEqual(
    createdStream.body.events.map((event) => event.version),
    [1]
  );
  assert.equal(
    createdStream.body.events[0].eventType,
    "SHIPMENT_CREATED"
  );

  const unauthorizedTemperature = await api(
    "/api/commands/shipments/temperature",
    {
      method: "POST",
      token: staffToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 1,
        temperatureC: 4.5,
      },
    }
  );

  assert.equal(unauthorizedTemperature.status, 403);

  const prematureTemperature = await api(
    "/api/commands/shipments/temperature",
    {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 1,
        temperatureC: 4.5,
      },
    }
  );

  assert.equal(prematureTemperature.status, 409);

  const dispatched = await api("/api/commands/shipments/dispatch", {
    method: "POST",
    token: managerToken,
    body: {
      shipmentId: created.id,
      expectedVersion: 1,
    },
  });

  assert.equal(dispatched.status, 200, JSON.stringify(dispatched.body));
  assert.equal(dispatched.body.data.version, 2);
  assert.equal(dispatched.body.data.state.status, "IN_TRANSIT");

  const invalidTemperature = await api(
    "/api/commands/shipments/temperature",
    {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 2,
        temperatureC: "4.5",
      },
    }
  );

  assert.equal(invalidTemperature.status, 400);

  const staleTemperature = await api(
    "/api/commands/shipments/temperature",
    {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 1,
        temperatureC: 4.5,
      },
    }
  );

  assert.equal(staleTemperature.status, 409);
  assert.equal(staleTemperature.body.code, "CONCURRENCY_CONFLICT");

  const temperature = await api(
    "/api/commands/shipments/temperature",
    {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 2,
        temperatureC: 4.5,
      },
    }
  );

  assert.equal(temperature.status, 200, JSON.stringify(temperature.body));
  assert.equal(temperature.body.data.version, 3);
  assert.equal(temperature.body.data.state.status, "IN_TRANSIT");

  const stale = await api("/api/commands/shipments/cancel", {
    method: "POST",
    token: managerToken,
    body: {
      shipmentId: created.id,
      expectedVersion: 1,
    },
  });

  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "CONCURRENCY_CONFLICT");

  const historyV1 = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=1`,
    { token: managerToken }
  );

  const historyV2 = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=2`,
    { token: managerToken }
  );

  const historyV3 = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=3`,
    { token: managerToken }
  );

  assert.equal(historyV1.body.data.version, 1);
  assert.equal(historyV1.body.data.state.status, "CREATED");
  assert.equal(historyV2.body.data.version, 2);
  assert.equal(historyV2.body.data.state.status, "IN_TRANSIT");
  assert.equal(historyV3.body.data.version, 3);
  assert.equal(historyV3.body.data.state.status, "IN_TRANSIT");

  const timestampHistory = await api(
    `/api/queries/shipments/${created.id}/reconstruct?at=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`,
    { token: managerToken }
  );
  assert.equal(timestampHistory.status, 200);
  assert.equal(timestampHistory.body.data.version, 3);
  assert.equal(timestampHistory.body.data.state.status, "IN_TRANSIT");

  const conflictingHistoryQuery = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=1&at=${encodeURIComponent(new Date().toISOString())}`,
    { token: managerToken }
  );
  assert.equal(conflictingHistoryQuery.status, 400);

  const delivered = await api("/api/commands/shipments/deliver", {
    method: "POST",
    token: managerToken,
    body: {
      shipmentId: created.id,
      expectedVersion: 3,
    },
  });

  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.version, 4);
  assert.equal(delivered.body.data.state.status, "DELIVERED");

  await projectShipmentAggregateEvents(created.id);

  assert.equal(
    (await getShipmentProjection(created.id)).version,
    4
  );

  assert.equal(
    await projectShipmentAggregateEvents(created.id),
    0
  );

  const projection = await getShipmentProjection(created.id);

  assert.equal(projection.version, 4);
  assert.equal(projection.state.status, "DELIVERED");

  const outOfOrderEvent = await EventStore.findOne({
    aggregateId: created.id,
    version: 4,
  }).lean();

  await assert.rejects(
    projectShipmentEvent({
      ...outOfOrderEvent,
      version: 6,
    }),
    (error) => error.code === "PROJECTION_VERSION_GAP"
  );

  await ShipmentProjection.deleteOne({
    aggregateId: created.id,
  });

  const stopWorker = startShipmentProjectionWorker();
  const duplicateStopWorker = startShipmentProjectionWorker();

  assert.equal(typeof duplicateStopWorker, "function");

  const projectionDeadline = Date.now() + 5000;

  while (
    Date.now() < projectionDeadline &&
    (await getShipmentProjection(created.id))?.version !== 4
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await stopWorker();

  assert.equal(
    (await getShipmentProjection(created.id)).version,
    4
  );

  const current = await api(
    `/api/queries/shipments/${created.id}`,
    { token: managerToken }
  );

  assert.equal(current.status, 200);
  assert.equal(current.body.data.version, 4);
  assert.equal(current.body.data.eventCount, 4);
  assert.equal(current.body.data.state.status, "DELIVERED");

  const historyBeforeDelivery = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=2`,
    { token: managerToken }
  );

  assert.equal(
    historyBeforeDelivery.body.data.state.status,
    "IN_TRANSIT"
  );

  const stream = await api(
    `/api/queries/shipments/${created.id}/events`,
    { token: managerToken }
  );

  assert.deepEqual(
    stream.body.events.map((event) => event.version),
    [1, 2, 3, 4]
  );

  assert.deepEqual(
    stream.body.events.map((event) => event.eventType),
    [
      "SHIPMENT_CREATED",
      "SHIPMENT_DISPATCHED",
      "SHIPMENT_TEMPERATURE_RECORDED",
      "SHIPMENT_DELIVERED",
    ]
  );

  assert.equal(stream.body.events[2].payload.temperatureC, 4.5);
  assert.ok(stream.body.events.every((event) => event.performedBy));

  const sourceInventory = await api("/api/inventory", { token: managerToken });

  const item = sourceInventory.body.inventories.find(
    (entry) =>
      String(entry.productId?._id) === productId &&
      String(entry.warehouseId?._id) === sourceWarehouseId
  );

  assert.equal(item.quantity, 6);

  const beforeQuery = stream.body.events.length;

  const repeatedQuery = await api(
    `/api/queries/shipments/${created.id}/events`,
    { token: managerToken }
  );

  assert.equal(repeatedQuery.body.events.length, beforeQuery);
});

test("collection endpoints paginate with validation, stable ordering, and existing access controls", async () => {
  const additionalProducts = [];
  for (let index = 0; index < 2; index += 1) {
    const created = await api("/api/products", {
      method: "POST",
      token: managerToken,
      body: {
        name: `Pagination Product ${index} ${suffix}`,
        sku: `PG${index}-${suffix}`,
        category: "Pagination",
        price: 20 + index,
        quantity: 2,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    additionalProducts.push(created.body.product._id);
    ids.products.push(new mongoose.Types.ObjectId(created.body.product._id));
  }

  const extraWarehouse = await api("/api/warehouses", {
    method: "POST",
    token: managerToken,
    body: {
      name: `Pagination Warehouse ${suffix}`,
      code: `PG-${suffix}`,
      location: "Pagination",
    },
  });
  assert.equal(extraWarehouse.status, 201, JSON.stringify(extraWarehouse.body));
  const extraWarehouseId = extraWarehouse.body.warehouse._id;
  ids.warehouses.push(new mongoose.Types.ObjectId(extraWarehouseId));

  for (const product of additionalProducts) {
    const inventory = await api("/api/inventory", {
      method: "POST",
      token: managerToken,
      body: { productId: product, warehouseId: sourceWarehouseId, quantity: 4 },
    });
    assert.equal(inventory.status, 201, JSON.stringify(inventory.body));
    ids.inventories.push(
      new mongoose.Types.ObjectId(inventory.body.inventory._id)
    );
  }

  await createTestShipment();
  await createTestShipment();

  const endpoints = [
    { path: "/api/products", alias: "products", token: undefined },
    { path: "/api/warehouses", alias: "warehouses", token: undefined },
    { path: "/api/inventory", alias: "inventories", token: managerToken },
    { path: "/api/shipments", alias: "shipments", token: managerToken },
    { path: "/api/users", alias: "users", token: adminToken },
  ];

  for (const endpoint of endpoints) {
    const defaultResponse = await api(endpoint.path, {
      token: endpoint.token,
    });
    assert.equal(defaultResponse.status, 200, endpoint.path);
    assert.equal(defaultResponse.body.page, 1, endpoint.path);
    assert.equal(defaultResponse.body.limit, 20, endpoint.path);
    assert.equal(
      defaultResponse.body.totalPages,
      Math.ceil(defaultResponse.body.total / 20),
      endpoint.path
    );
    assert.equal(
      defaultResponse.body.data.length,
      Math.min(defaultResponse.body.total, 20),
      endpoint.path
    );
    assert.ok(Number.isSafeInteger(defaultResponse.body.total), endpoint.path);
    assert.ok(Array.isArray(defaultResponse.body.data), endpoint.path);
    assert.deepEqual(
      defaultResponse.body.data,
      defaultResponse.body[endpoint.alias],
      `${endpoint.path} keeps its legacy array key`
    );

    const pageOne = await api(`${endpoint.path}?limit=2&page=1`, {
      token: endpoint.token,
    });
    const pageTwo = await api(`${endpoint.path}?limit=2&page=2`, {
      token: endpoint.token,
    });
    assert.equal(pageOne.status, 200, endpoint.path);
    assert.equal(pageTwo.status, 200, endpoint.path);
    assert.equal(pageTwo.body.page, 2, endpoint.path);
    assert.equal(pageTwo.body.limit, 2, endpoint.path);
    assert.ok(pageOne.body.data.length > 0, endpoint.path);
    assert.ok(pageTwo.body.data.length > 0, endpoint.path);
    assert.notEqual(
      pageOne.body.data[0]._id,
      pageTwo.body.data[0]._id,
      `${endpoint.path} returns distinct pages`
    );

    const maxLimit = await api(`${endpoint.path}?limit=100`, {
      token: endpoint.token,
    });
    assert.equal(maxLimit.status, 200, endpoint.path);
    assert.equal(maxLimit.body.limit, 100, endpoint.path);
    assert.ok(maxLimit.body.data.length <= 100, endpoint.path);
    assert.equal(
      maxLimit.body.totalPages,
      Math.ceil(maxLimit.body.total / 100),
      endpoint.path
    );

    for (const invalidPage of ["0", "-1", "1.5", "abc"]) {
      const invalid = await api(`${endpoint.path}?page=${invalidPage}`, {
        token: endpoint.token,
      });
      assert.equal(invalid.status, 400, `${endpoint.path} page=${invalidPage}`);
      assert.equal(invalid.body.code, "VALIDATION_ERROR");
    }

    for (const invalidLimit of ["0", "-1", "1.5", "abc", "101"]) {
      const invalid = await api(`${endpoint.path}?limit=${invalidLimit}`, {
        token: endpoint.token,
      });
      assert.equal(
        invalid.status,
        400,
        `${endpoint.path} limit=${invalidLimit}`
      );
      assert.equal(invalid.body.code, "VALIDATION_ERROR");
    }

    const firstPageIds = pageOne.body.data.map((item) => item._id);
    const repeatedPage = await api(`${endpoint.path}?limit=2&page=1`, {
      token: endpoint.token,
    });
    const repeatedPageIds = repeatedPage.body.data.map((item) => item._id);
    const commonIds = repeatedPageIds.filter((id) =>
      firstPageIds.includes(id)
    );
    assert.deepEqual(
      commonIds,
      firstPageIds.filter((id) => repeatedPageIds.includes(id)),
      `${endpoint.path} ordering is stable`
    );

    const rows = pageOne.body.data;
    const expectedRows = [...rows].sort((left, right) => {
      if (endpoint.alias === "shipments") {
        const createdAtOrder =
          Date.parse(right.createdAt) - Date.parse(left.createdAt);
        if (createdAtOrder !== 0) return createdAtOrder;
        return String(right._id).localeCompare(String(left._id));
      }
      return String(left._id).localeCompare(String(right._id));
    });
    assert.deepEqual(
      rows.map((item) => item._id),
      expectedRows.map((item) => item._id),
      `${endpoint.path} has deterministic ordering`
    );
  }

  for (const endpoint of endpoints.filter((item) => item.token)) {
    const anonymous = await api(endpoint.path);
    assert.equal(anonymous.status, 401, endpoint.path);
  }

  assert.equal((await api("/api/inventory", { token: staffToken })).status, 200);
  assert.equal((await api("/api/shipments", { token: staffToken })).status, 200);
  assert.equal((await api("/api/users", { token: managerToken })).status, 403);
  assert.equal((await api("/api/users", { token: staffToken })).status, 403);
});

test("user management routes require an admin role", async () => {
  const requests = [
    { path: "/api/users", method: "GET" },
    { path: "/api/users", method: "POST", body: {} },
    { path: "/api/users/not-an-id", method: "GET" },
    { path: "/api/users/not-an-id", method: "PATCH", body: {} },
    { path: "/api/users/not-an-id", method: "DELETE" },
  ];

  for (const request of requests) {
    const anonymous = await api(request.path, request);
    assert.equal(anonymous.status, 401, `${request.method} ${request.path}`);

    const staff = await api(request.path, { ...request, token: staffToken });
    assert.equal(staff.status, 403, `${request.method} ${request.path} for staff`);

    const manager = await api(request.path, {
      ...request,
      token: managerToken,
    });
    assert.equal(
      manager.status,
      403,
      `${request.method} ${request.path} for manager`
    );
  }
});

test("inventory and audit-event reads require authentication and allow staff and managers", async () => {
  const inventoryId = ids.inventories[0].toString();
  const readRoutes = [
    "/api/inventory",
    `/api/inventory/${inventoryId}`,
    "/api/events",
    `/api/events/Inventory/${inventoryId}`,
  ];

  for (const path of readRoutes) {
    const anonymous = await api(path);
    assert.equal(anonymous.status, 401, `GET ${path}`);

    for (const token of [staffToken, managerToken]) {
      const authenticated = await api(path, { token });
      assert.equal(authenticated.status, 200, `GET ${path}`);
      assert.equal(authenticated.body.success, true);
    }
  }
});

test("product and warehouse mutations require an admin or manager", async () => {
  const invalidProduct = await api("/api/products", {
    method: "POST",
    token: managerToken,
    body: {
      name: `Invalid RBAC product ${suffix}`,
      sku: `BAD-${suffix}`,
      category: "Integration",
      price: -1,
      quantity: 1,
    },
  });
  assert.equal(invalidProduct.status, 400);
  assert.equal(invalidProduct.body.code, "VALIDATION_ERROR");

  const mutationCases = [
    {
      path: "/api/products",
      createBody: {
        name: `RBAC product ${suffix}`,
        sku: `RBAC-${suffix}`,
        category: "Integration",
        price: 12,
        quantity: 4,
      },
      updateBody: { price: 14 },
      responseKey: "product",
      ids: ids.products,
    },
    {
      path: "/api/warehouses",
      createBody: {
        name: `RBAC warehouse ${suffix}`,
        code: `RW-${suffix}`,
        location: "Integration",
      },
      updateBody: { location: "Updated integration location" },
      responseKey: "warehouse",
      ids: ids.warehouses,
    },
  ];

  for (const mutationCase of mutationCases) {
    const anonymousCreate = await api(mutationCase.path, {
      method: "POST",
      body: mutationCase.createBody,
    });
    assert.equal(anonymousCreate.status, 401);

    const staffCreate = await api(mutationCase.path, {
      method: "POST",
      token: staffToken,
      body: mutationCase.createBody,
    });
    assert.equal(staffCreate.status, 403);

    const managerCreate = await api(mutationCase.path, {
      method: "POST",
      token: managerToken,
      body: mutationCase.createBody,
    });
    assert.equal(managerCreate.status, 201, JSON.stringify(managerCreate.body));

    const resourceId = managerCreate.body[mutationCase.responseKey]._id;
    mutationCase.ids.push(new mongoose.Types.ObjectId(resourceId));

    const resourcePath = `${mutationCase.path}/${resourceId}`;
    const anonymousUpdate = await api(resourcePath, {
      method: "PATCH",
      body: mutationCase.updateBody,
    });
    assert.equal(anonymousUpdate.status, 401);

    const staffUpdate = await api(resourcePath, {
      method: "PATCH",
      token: staffToken,
      body: mutationCase.updateBody,
    });
    assert.equal(staffUpdate.status, 403);

    const managerUpdate = await api(resourcePath, {
      method: "PATCH",
      token: managerToken,
      body: mutationCase.updateBody,
    });
    assert.equal(managerUpdate.status, 200, JSON.stringify(managerUpdate.body));

    const anonymousDelete = await api(resourcePath, { method: "DELETE" });
    assert.equal(anonymousDelete.status, 401);

    const staffDelete = await api(resourcePath, {
      method: "DELETE",
      token: staffToken,
    });
    assert.equal(staffDelete.status, 403);

    const managerDelete = await api(resourcePath, {
      method: "DELETE",
      token: managerToken,
    });
    assert.equal(managerDelete.status, 403);
  }
});

test("projection worker ignores non-shipment aggregate events", async () => {
  assert.ok(ids.inventories.length > 0, "Test inventory must exist");
  assert.ok(ids.shipments.length > 0, "Test shipment must exist");

  const inventoryId = ids.inventories[0];
  const shipmentId = ids.shipments[0];

  const shipmentEvent = await EventStore.findOne({
    aggregateId: shipmentId,
  }).lean();

  assert.ok(shipmentEvent, "A shipment event must exist");

  await EventStore.collection.insertOne({
    aggregateId: inventoryId,
    aggregateType: "Inventory",
    eventType: "INVENTORY_CREATED",
    payload: {},
    timestamp: new Date(),
    version: 1,
    performedBy: shipmentEvent.performedBy,
    metadata: {},
  });

  const loggedErrors = [];
  const originalConsoleError = console.error;

  try {
    console.error = (...args) => loggedErrors.push(args);

    await projectPendingShipmentEvents();
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(
    await ShipmentProjection.exists({ aggregateId: inventoryId }),
    null,
    "An Inventory event must not create a Shipment projection"
  );

  assert.equal(
    loggedErrors.length,
    0,
    "Ignoring non-shipment events must not produce projection errors"
  );
});

test("append validation, duplicate versions, and event immutability are enforced", async () => {
  const created = await createTestShipment();

  const event = await EventStore.findOne({
    aggregateId: created.id,
    version: 1,
  });

  assert.ok(event);

  await assert.rejects(
    appendEvent({
      aggregateId: "not-an-object-id",
      aggregateType: "Shipment",
      eventType: "SHIPMENT_DISPATCHED",
      payload: {
        shipmentNumber: "SHP-TEST",
        sourceWarehouseId,
        destinationWarehouseId,
        items: [{ productId, quantity: 1 }],
        status: "IN_TRANSIT",
        createdBy: String(event.performedBy),
      },
      performedBy: event.performedBy,
      expectedVersion: 0,
    }),
    (error) => error.code === "INVALID_ID"
  );

  await assert.rejects(
    appendEvent({
      aggregateId: new mongoose.Types.ObjectId(),
      aggregateType: "Shipment",
      eventType: "SHIPMENT_CREATED",
      payload: {
        shipmentNumber: "SHP-TEST",
        sourceWarehouseId,
        destinationWarehouseId,
        items: [{ productId, quantity: 1 }],
        status: "CREATED",
        createdBy: String(event.performedBy),
      },
      performedBy: event.performedBy,
      expectedVersion: 0,
    }),
    (error) => error.code === "SHIPMENT_NOT_FOUND"
  );

  await assert.rejects(
    appendEvent({
      aggregateId: created.id,
      aggregateType: "Shipment",
      eventType: "SHIPMENT_DISPATCHED",
      payload: [],
      performedBy: new mongoose.Types.ObjectId(),
      expectedVersion: 1,
    }),
    (error) => error.code === "VALIDATION_ERROR"
  );

  await assert.rejects(
    appendEvent({
      aggregateId: created.id,
      aggregateType: "Shipment",
      eventType: "SHIPMENT_DISPATCHED",
      payload: {},
      performedBy: event.performedBy,
      expectedVersion: 1,
    }),
    (error) => error.code === "VALIDATION_ERROR"
  );

  await assert.rejects(
    EventStore.create({
      aggregateId: event.aggregateId,
      aggregateType: "Shipment",
      eventType: "SHIPMENT_DISPATCHED",
      payload: {},
      timestamp: new Date(),
      version: 1,
      performedBy: event.performedBy,
      metadata: {},
    }),
    (error) => error.code === 11000
  );

  const blockedMutations = [
    [
      "updateOne",
      () =>
        EventStore.updateOne(
          { _id: event._id },
          { $set: { eventType: "SHIPMENT_CANCELLED" } }
        ),
    ],
    [
      "updateMany",
      () =>
        EventStore.updateMany(
          { _id: event._id },
          { $set: { eventType: "SHIPMENT_CANCELLED" } }
        ),
    ],
    [
      "bulkWrite",
      () => EventStore.bulkWrite([{ updateOne: { filter: { _id: event._id }, update: { $set: { eventType: "SHIPMENT_CANCELLED" } } } }]),
    ],
    [
      "bulkWrite delete",
      () => EventStore.bulkWrite([{ deleteOne: { filter: { _id: event._id } } }]),
    ],
    [
      "replaceOne",
      () =>
        EventStore.replaceOne(
          { _id: event._id },
          {
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            eventType: "SHIPMENT_CANCELLED",
            payload: event.payload,
            timestamp: event.timestamp,
            version: event.version,
            performedBy: event.performedBy,
            metadata: event.metadata,
          }
        ),
    ],
    [
      "findOneAndUpdate",
      () =>
        EventStore.findOneAndUpdate(
          { _id: event._id },
          { $set: { eventType: "SHIPMENT_CANCELLED" } }
        ),
    ],
    [
      "findOneAndReplace",
      () =>
        EventStore.findOneAndReplace(
          { _id: event._id },
          {
            aggregateId: event.aggregateId,
            aggregateType: event.aggregateType,
            eventType: "SHIPMENT_CANCELLED",
            payload: event.payload,
            timestamp: event.timestamp,
            version: event.version,
            performedBy: event.performedBy,
            metadata: event.metadata,
          }
        ),
    ],
    [
      "findOneAndDelete",
      () => EventStore.findOneAndDelete({ _id: event._id }),
    ],
    [
      "deleteOne",
      () => EventStore.deleteOne({ _id: event._id }),
    ],
    [
      "deleteMany",
      () => EventStore.deleteMany({ _id: event._id }),
    ],
  ];

  for (const [operation, execute] of blockedMutations) {
    await assert.rejects(
      execute(),
      (error) => error.code === "EVENT_STORE_IMMUTABLE",
      `${operation} must be blocked`
    );
  }

  const unchanged = await EventStore.findById(event._id);

  assert.ok(unchanged);
  assert.equal(unchanged.eventType, "SHIPMENT_CREATED");
  assert.equal(unchanged.version, 1);

  const missingVersion = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=99`,
    { token: managerToken }
  );

  assert.equal(missingVersion.status, 404);
  assert.equal(missingVersion.body.code, "VERSION_NOT_FOUND");
});

test("concurrent commands using one expected version produce one winner", async () => {
  const created = await createTestShipment();

  const [dispatch, cancel] = await Promise.all([
    api("/api/commands/shipments/dispatch", {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 1,
      },
    }),
    api("/api/commands/shipments/cancel", {
      method: "POST",
      token: managerToken,
      body: {
        shipmentId: created.id,
        expectedVersion: 1,
      },
    }),
  ]);

  assert.deepEqual(
    [dispatch.status, cancel.status].sort(),
    [200, 409],
    JSON.stringify({
      dispatch: dispatch.body,
      cancel: cancel.body,
    })
  );

  const stream = await api(
    `/api/queries/shipments/${created.id}/events`,
    { token: managerToken }
  );

  assert.deepEqual(
    stream.body.events.map((event) => event.version),
    [1, 2]
  );
});

test("CQRS routes enforce authentication, authorization, and input validation", async () => {
  const unauthenticated = await api(
    "/api/queries/shipments/507f1f77bcf86cd799439011"
  );

  assert.equal(unauthenticated.status, 401);

  const unauthorized = await api("/api/commands/shipments/create", {
    method: "POST",
    token: staffToken,
    body: {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId, quantity: 1 }],
      expectedVersion: 0,
    },
  });

  assert.equal(unauthorized.status, 403);

  const invalid = await api("/api/commands/shipments/create", {
    method: "POST",
    token: managerToken,
    body: {
      sourceWarehouseId: "not-an-id",
      destinationWarehouseId,
      items: [],
      expectedVersion: 0,
    },
  });

  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "VALIDATION_ERROR");
});
