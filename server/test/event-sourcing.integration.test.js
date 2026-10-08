const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

require("tsx/cjs");
const app = require("../src/app.ts").default;
const EventStore = require("../src/models/EventStore.ts").default;
const { appendEvent } = require("../src/services/event-sourcing/event-store.service.ts");

const apiBaseUrl = process.env.EVENT_SOURCING_API_BASE_URL || "http://127.0.0.1";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const managerEmail = `event-manager-${suffix}@example.test`;
const staffEmail = `event-staff-${suffix}@example.test`;
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
let sourceWarehouseId;
let destinationWarehouseId;
let productId;

async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
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
  return { id, data: result.body.data };
}

before(async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI must be set for event store integration tests");
  assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be set for event store integration tests");
  await mongoose.connect(process.env.MONGODB_URI);
  await EventStore.init();
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
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

  const staffRegistration = await api("/api/auth/register", {
    method: "POST",
    body: { name: "Event Store Staff", email: staffEmail, password },
  });
  assert.equal(staffRegistration.status, 201, JSON.stringify(staffRegistration.body));
  const staffId = new mongoose.Types.ObjectId(staffRegistration.body.user.id);
  ids.users.push(staffId);
  staffToken = await login(staffEmail);

  const source = await api("/api/warehouses", {
    method: "POST",
    body: { name: `Event source ${suffix}`, code: `ES-${suffix}`, location: "Integration" },
  });
  const destination = await api("/api/warehouses", {
    method: "POST",
    body: { name: `Event destination ${suffix}`, code: `ED-${suffix}`, location: "Integration" },
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
    body: { productId, warehouseId: sourceWarehouseId, quantity: 8 },
  });
  assert.equal(inventory.status, 201, JSON.stringify(inventory.body));
  ids.inventories.push(new mongoose.Types.ObjectId(inventory.body.inventory._id));
});

after(async () => {
  if (server) await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  if (mongoose.connection.readyState === 1) {
    const eventEntityIds = [...ids.shipments, ...ids.inventories];
    if (eventEntityIds.length) {
      await mongoose.connection.collection("eventstores").deleteMany({
        aggregateId: { $in: ids.shipments },
      });
      await mongoose.connection.collection("events").deleteMany({
        $or: [
          { entityId: { $in: eventEntityIds } },
          { "payload.shipmentId": { $in: ids.shipments } },
        ],
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
    for (const collection of ["shipments", "inventories", "products", "warehouses", "users"]) {
      if (ids[collection].length) {
        await mongoose.connection.collection(collection).deleteMany({
          _id: { $in: ids[collection] },
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
  assert.deepEqual(createdStream.body.events.map((event) => event.version), [1]);
  assert.equal(createdStream.body.events[0].eventType, "SHIPMENT_CREATED");

  const dispatched = await api("/api/commands/shipments/dispatch", {
    method: "POST",
    token: managerToken,
    body: { shipmentId: created.id, expectedVersion: 1 },
  });
  assert.equal(dispatched.status, 200, JSON.stringify(dispatched.body));
  assert.equal(dispatched.body.data.version, 2);
  assert.equal(dispatched.body.data.state.status, "IN_TRANSIT");

  const stale = await api("/api/commands/shipments/cancel", {
    method: "POST",
    token: managerToken,
    body: { shipmentId: created.id, expectedVersion: 1 },
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
  assert.equal(historyV1.body.data.version, 1);
  assert.equal(historyV1.body.data.state.status, "CREATED");
  assert.equal(historyV2.body.data.version, 2);
  assert.equal(historyV2.body.data.state.status, "IN_TRANSIT");

  const delivered = await api("/api/commands/shipments/deliver", {
    method: "POST",
    token: managerToken,
    body: { shipmentId: created.id, expectedVersion: 2 },
  });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
  assert.equal(delivered.body.data.version, 3);
  assert.equal(delivered.body.data.state.status, "DELIVERED");

  const current = await api(`/api/queries/shipments/${created.id}`, {
    token: managerToken,
  });
  assert.equal(current.status, 200);
  assert.equal(current.body.data.version, 3);
  assert.equal(current.body.data.eventCount, 3);
  assert.equal(current.body.data.state.status, "DELIVERED");

  const historyBeforeDelivery = await api(
    `/api/queries/shipments/${created.id}/reconstruct?version=2`,
    { token: managerToken }
  );
  assert.equal(historyBeforeDelivery.body.data.state.status, "IN_TRANSIT");

  const stream = await api(`/api/queries/shipments/${created.id}/events`, {
    token: managerToken,
  });
  assert.deepEqual(stream.body.events.map((event) => event.version), [1, 2, 3]);
  assert.deepEqual(stream.body.events.map((event) => event.eventType), [
    "SHIPMENT_CREATED",
    "SHIPMENT_DISPATCHED",
    "SHIPMENT_DELIVERED",
  ]);
  assert.ok(stream.body.events.every((event) => event.performedBy));

  const sourceInventory = await api("/api/inventory");
  const item = sourceInventory.body.inventories.find(
    (entry) => String(entry.productId?._id) === productId &&
      String(entry.warehouseId?._id) === sourceWarehouseId
  );
  assert.equal(item.quantity, 6);

  const beforeQuery = stream.body.events.length;
  const repeatedQuery = await api(`/api/queries/shipments/${created.id}/events`, {
    token: managerToken,
  });
  assert.equal(repeatedQuery.body.events.length, beforeQuery);
});

test("append validation, duplicate versions, and event immutability are enforced", async () => {
  const created = await createTestShipment();
  const event = await EventStore.findOne({ aggregateId: created.id, version: 1 });
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

  await assert.rejects(
    EventStore.updateOne({ _id: event._id }, { $set: { eventType: "SHIPMENT_CANCELLED" } }),
    (error) => error.code === "EVENT_STORE_IMMUTABLE"
  );
  await assert.rejects(
    EventStore.deleteOne({ _id: event._id }),
    (error) => error.code === "EVENT_STORE_IMMUTABLE"
  );
  const unchanged = await EventStore.findById(event._id);
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
      body: { shipmentId: created.id, expectedVersion: 1 },
    }),
    api("/api/commands/shipments/cancel", {
      method: "POST",
      token: managerToken,
      body: { shipmentId: created.id, expectedVersion: 1 },
    }),
  ]);

  assert.deepEqual(
    [dispatch.status, cancel.status].sort(),
    [200, 409],
    JSON.stringify({ dispatch: dispatch.body, cancel: cancel.body })
  );
  const stream = await api(`/api/queries/shipments/${created.id}/events`, {
    token: managerToken,
  });
  assert.deepEqual(stream.body.events.map((event) => event.version), [1, 2]);
});

test("CQRS routes enforce authentication, authorization, and input validation", async () => {
  const unauthenticated = await api("/api/queries/shipments/507f1f77bcf86cd799439011");
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
