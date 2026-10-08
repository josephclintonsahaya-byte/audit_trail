const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:5000";
const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const managerEmail = `shipment-manager-${suffix}@example.test`;
const adminEmail = `shipment-admin-${suffix}@example.test`;
const staffEmail = `shipment-staff-${suffix}@example.test`;
const testPassword = "Shipment-test-password-938!";
const createdIds = {
  users: [],
  products: [],
  warehouses: [],
  inventories: [],
  shipments: [],
};

let managerToken;
let adminToken;
let staffToken;
let sourceWarehouseId;
let destinationWarehouseId;
let primaryProductId;
let rollbackProductId;
let newDestinationProductId;

async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {},
  };
}

async function createWarehouse(name, code) {
  const result = await api("/api/warehouses", {
    method: "POST",
    body: { name, code, location: "Integration test", status: "active" },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const id = result.body.warehouse._id;
  createdIds.warehouses.push(new mongoose.Types.ObjectId(id));
  return id;
}

async function createProduct(name, sku) {
  const result = await api("/api/products", {
    method: "POST",
    body: {
      name,
      sku,
      category: "Integration test",
      price: 10,
      quantity: 0,
      status: "active",
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const id = result.body.product._id;
  createdIds.products.push(new mongoose.Types.ObjectId(id));
  return id;
}

async function createInventory(productId, warehouseId, quantity) {
  const result = await api("/api/inventory", {
    method: "POST",
    token: managerToken,
    body: { productId, warehouseId, quantity },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const id = result.body.inventory._id;
  createdIds.inventories.push(new mongoose.Types.ObjectId(id));
  return id;
}

async function createShipment(items, overrides = {}) {
  const result = await api("/api/shipments", {
    method: "POST",
    token: managerToken,
    body: {
      sourceWarehouseId,
      destinationWarehouseId,
      items,
      ...overrides,
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const id = result.body.shipment._id;
  createdIds.shipments.push(new mongoose.Types.ObjectId(id));
  return result.body.shipment;
}

async function getInventoryQuantity(productId, warehouseId) {
  const result = await api("/api/inventory");
  assert.equal(result.status, 200);
  const inventory = result.body.inventories.find(
    (record) =>
      String(record.productId?._id) === String(productId) &&
      String(record.warehouseId?._id) === String(warehouseId)
  );
  return inventory?.quantity;
}

async function getEntityEvents(entityType, entityId) {
  const result = await api(`/api/events/${entityType}/${entityId}`);
  assert.equal(result.status, 200);
  return result.body.events;
}

before(async () => {
  assert.ok(process.env.MONGODB_URI, "MONGODB_URI must be set for integration tests");
  assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be set for integration tests");
  await mongoose.connect(process.env.MONGODB_URI);

  const now = new Date();
  const manager = await mongoose.connection.collection("users").insertOne({
    name: "Shipment Integration Manager",
    email: managerEmail,
    passwordHash: await bcrypt.hash(testPassword, 4),
    role: "manager",
    createdAt: now,
    updatedAt: now,
  });
  createdIds.users.push(manager.insertedId);

  const managerLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: managerEmail, password: testPassword },
  });
  assert.equal(managerLogin.status, 200, JSON.stringify(managerLogin.body));
  managerToken = managerLogin.body.token;

  const admin = await mongoose.connection.collection("users").insertOne({
    name: "Shipment Integration Admin",
    email: adminEmail,
    passwordHash: await bcrypt.hash(testPassword, 4),
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });
  createdIds.users.push(admin.insertedId);
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: testPassword },
  });
  assert.equal(adminLogin.status, 200);
  adminToken = adminLogin.body.token;

  const staffRegistration = await api("/api/auth/register", {
    method: "POST",
    body: {
      name: "Shipment Integration Staff",
      email: staffEmail,
      password: testPassword,
    },
  });
  assert.equal(staffRegistration.status, 201, JSON.stringify(staffRegistration.body));
  const staffId = new mongoose.Types.ObjectId(staffRegistration.body.user.id);
  createdIds.users.push(staffId);
  const staffLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: staffEmail, password: testPassword },
  });
  assert.equal(staffLogin.status, 200);
  staffToken = staffLogin.body.token;

  sourceWarehouseId = await createWarehouse(
    `Shipment Source ${suffix}`,
    `TS-${suffix}`.slice(0, 20)
  );
  destinationWarehouseId = await createWarehouse(
    `Shipment Destination ${suffix}`,
    `TD-${suffix}`.slice(0, 20)
  );
  primaryProductId = await createProduct(
    `Shipment Product ${suffix}`,
    `TP-${suffix}`.slice(0, 20)
  );
  rollbackProductId = await createProduct(
    `Rollback Product ${suffix}`,
    `TR-${suffix}`.slice(0, 20)
  );
  newDestinationProductId = await createProduct(
    `New Destination Product ${suffix}`,
    `TN-${suffix}`.slice(0, 20)
  );
  await createInventory(primaryProductId, sourceWarehouseId, 10);
  await createInventory(primaryProductId, destinationWarehouseId, 2);
  await createInventory(rollbackProductId, destinationWarehouseId, 3);
  await createInventory(newDestinationProductId, sourceWarehouseId, 4);
});

after(async () => {
  if (mongoose.connection.readyState === 1) {
    const eventEntityIds = [
      ...createdIds.shipments,
      ...createdIds.inventories,
    ];
    if (eventEntityIds.length > 0) {
      await mongoose.connection.collection("events").deleteMany({
        $or: [
          { entityId: { $in: eventEntityIds } },
          { "payload.shipmentId": { $in: createdIds.shipments } },
        ],
      });
      await mongoose.connection.collection("eventstores").deleteMany({
        aggregateId: { $in: createdIds.shipments },
      });
    }

    if (createdIds.products.length || createdIds.warehouses.length) {
      await mongoose.connection.collection("inventories").deleteMany({
        $or: [
          { productId: { $in: createdIds.products } },
          { warehouseId: { $in: createdIds.warehouses } },
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
      const ids = createdIds[collectionName];
      if (ids.length > 0) {
        await mongoose.connection
          .collection(collectionName)
          .deleteMany({ _id: { $in: ids } });
      }
    }
    await mongoose.disconnect();
  }
});

test("shipment workflow, validation, authorization, movement and transaction rollback", async () => {
  const identity = await api("/api/auth/me", { token: managerToken });
  assert.equal(identity.status, 200);
  assert.equal(identity.body.user.email, managerEmail);

  const productDelete = await api(`/api/products/${primaryProductId}`, {
    method: "DELETE",
  });
  assert.equal(productDelete.status, 409);
  assert.equal(productDelete.body.code, "PRODUCT_IN_USE");

  const warehouseDelete = await api(`/api/warehouses/${sourceWarehouseId}`, {
    method: "DELETE",
  });
  assert.equal(warehouseDelete.status, 409);
  assert.equal(warehouseDelete.body.code, "WAREHOUSE_IN_USE");

  let result = await api("/api/shipments", {
    method: "POST",
    body: {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: primaryProductId, quantity: 1 }],
    },
  });
  assert.equal(result.status, 401, "shipment creation requires authentication");

  result = await api("/api/shipments", {
    method: "POST",
    token: staffToken,
    body: {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: primaryProductId, quantity: 1 }],
    },
  });
  assert.equal(result.status, 403, "staff cannot create shipments");

  const invalidRequests = [
    {
      sourceWarehouseId,
      destinationWarehouseId: sourceWarehouseId,
      items: [{ productId: primaryProductId, quantity: 1 }],
      expected: 400,
    },
    {
      sourceWarehouseId: "invalid",
      destinationWarehouseId,
      items: [{ productId: primaryProductId, quantity: 1 }],
      expected: 400,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId: "507f1f77bcf86cd799439099",
      items: [{ productId: primaryProductId, quantity: 1 }],
      expected: 404,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: "507f1f77bcf86cd799439099", quantity: 1 }],
      expected: 404,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: primaryProductId, quantity: 0 }],
      expected: 400,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: primaryProductId, quantity: -1 }],
      expected: 400,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [],
      expected: 400,
    },
    {
      sourceWarehouseId,
      destinationWarehouseId,
      items: [{ productId: "invalid", quantity: 1 }],
      expected: 400,
    },
  ];

  for (const invalid of invalidRequests) {
    const { expected, ...body } = invalid;
    result = await api("/api/shipments", {
      method: "POST",
      token: managerToken,
      body,
    });
    assert.equal(result.status, expected, JSON.stringify({ body, response: result.body }));
  }

  const shipment = await createShipment([
    { productId: primaryProductId, quantity: 3 },
  ]);
  assert.equal(shipment.status, "CREATED");
  assert.equal(shipment.createdBy._id, (await api("/api/auth/me", { token: managerToken })).body.user.id);
  assert.equal(typeof shipment.sourceWarehouseId.name, "string");

  result = await api(`/api/shipments/${shipment._id}`, {
    method: "PATCH",
    token: managerToken,
    body: { items: [{ productId: primaryProductId, quantity: 3 }] },
  });
  assert.equal(result.status, 200, "manager can edit a draft shipment");
  result = await api(`/api/shipments/${shipment._id}`, {
    method: "PATCH",
    token: managerToken,
    body: { status: "IN_TRANSIT" },
  });
  assert.equal(result.status, 400, "status must use explicit workflow actions");

  const createdEvents = await getEntityEvents("Shipment", shipment._id);
  assert.ok(createdEvents.some((event) => event.eventType === "SHIPMENT_CREATED"));
  assert.ok(createdEvents.some((event) => event.eventType === "SHIPMENT_UPDATED"));

  result = await api("/api/shipments", { token: managerToken });
  assert.equal(result.status, 200);
  assert.ok(result.body.shipments.some((entry) => entry._id === shipment._id));
  result = await api(`/api/shipments/${shipment._id}`, { token: managerToken });
  assert.equal(result.status, 200);
  result = await api("/api/shipments/not-an-object-id", { token: managerToken });
  assert.equal(result.status, 400);

  result = await api(`/api/shipments/${shipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "CREATED shipment cannot be delivered");

  result = await api(`/api/shipments/${shipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.shipment.status, "IN_TRANSIT");
  assert.equal(await getInventoryQuantity(primaryProductId, sourceWarehouseId), 10);

  result = await api(`/api/shipments/${shipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "repeated dispatch is rejected");
  assert.ok(
    (await getEntityEvents("Shipment", shipment._id)).some(
      (event) => event.eventType === "SHIPMENT_DISPATCHED"
    )
  );

  result = await api(`/api/shipments/${shipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.shipment.status, "DELIVERED");
  assert.equal(await getInventoryQuantity(primaryProductId, sourceWarehouseId), 7);
  assert.equal(await getInventoryQuantity(primaryProductId, destinationWarehouseId), 5);

  result = await api(`/api/shipments/${shipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "repeated delivery is rejected");
  result = await api(`/api/shipments/${shipment._id}/cancel`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "delivered shipment cannot be cancelled");
  result = await api(`/api/shipments/${shipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "delivered shipment cannot be dispatched");

  const shipmentEvents = await getEntityEvents("Shipment", shipment._id);
  for (const eventType of [
    "SHIPMENT_CREATED",
    "SHIPMENT_DISPATCHED",
    "SHIPMENT_DELIVERED",
  ]) {
    assert.ok(shipmentEvents.some((event) => event.eventType === eventType));
  }
  for (const event of shipmentEvents) {
    assert.equal(event.performedBy._id, shipment.createdBy._id);
  }

  const inventoriesResponse = await api("/api/inventory");
  assert.equal(inventoriesResponse.status, 200);
  const sourceInventoryId = inventoriesResponse.body.inventories.find(
    (entry) =>
      String(entry.productId?._id) === primaryProductId &&
      String(entry.warehouseId?._id) === sourceWarehouseId
  )._id;
  const destinationInventoryId = inventoriesResponse.body.inventories.find(
    (entry) =>
      String(entry.productId?._id) === primaryProductId &&
      String(entry.warehouseId?._id) === destinationWarehouseId
  )._id;
  const sourceInventoryEvents = await getEntityEvents(
    "Inventory",
    sourceInventoryId
  );
  const destinationInventoryEvents = await getEntityEvents(
    "Inventory",
    destinationInventoryId
  );
  assert.ok(sourceInventoryEvents.some((event) => event.eventType === "STOCK_DECREASED"));
  assert.ok(destinationInventoryEvents.some((event) => event.eventType === "STOCK_INCREASED"));
  const decreaseEvent = sourceInventoryEvents.find(
    (event) => event.eventType === "STOCK_DECREASED"
  );
  const increaseEvent = destinationInventoryEvents.find(
    (event) => event.eventType === "STOCK_INCREASED"
  );
  assert.equal(decreaseEvent.payload.previousQuantity, 10);
  assert.equal(decreaseEvent.payload.newQuantity, 7);
  assert.equal(decreaseEvent.payload.quantity, 3);
  assert.equal(increaseEvent.payload.previousQuantity, 2);
  assert.equal(increaseEvent.payload.newQuantity, 5);
  assert.equal(increaseEvent.payload.quantity, 3);
  assert.equal(decreaseEvent.performedBy._id, shipment.createdBy._id);
  assert.equal(increaseEvent.performedBy._id, shipment.createdBy._id);

  const cancelledShipment = await createShipment([
    { productId: primaryProductId, quantity: 1 },
  ]);
  result = await api(`/api/shipments/${cancelledShipment._id}/cancel`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.shipment.status, "CANCELLED");
  result = await api(`/api/shipments/${cancelledShipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409);
  result = await api(`/api/shipments/${cancelledShipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409);

  const rollbackShipment = await createShipment([
    { productId: primaryProductId, quantity: 2 },
    { productId: rollbackProductId, quantity: 1 },
  ]);
  result = await api(`/api/shipments/${rollbackShipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200);
  result = await api(`/api/shipments/${rollbackShipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "missing source inventory aborts delivery");
  assert.equal(await getInventoryQuantity(primaryProductId, sourceWarehouseId), 7);
  assert.equal(await getInventoryQuantity(primaryProductId, destinationWarehouseId), 5);
  assert.equal(await getInventoryQuantity(rollbackProductId, destinationWarehouseId), 3);
  result = await api(`/api/shipments/${rollbackShipment._id}`, {
    token: managerToken,
  });
  assert.equal(result.body.shipment.status, "IN_TRANSIT");

  const rollbackEvents = await getEntityEvents(
    "Shipment",
    rollbackShipment._id
  );
  assert.equal(
    rollbackEvents.some((event) => event.eventType === "SHIPMENT_DELIVERED"),
    false
  );
  const allEvents = (await api("/api/events")).body.events;
  assert.equal(
    allEvents.some(
      (event) =>
        ["STOCK_DECREASED", "STOCK_INCREASED"].includes(event.eventType) &&
        String(event.payload.shipmentId) === rollbackShipment._id
    ),
    false
  );

  const insufficientShipment = await createShipment([
    { productId: primaryProductId, quantity: 99 },
  ]);
  await api(`/api/shipments/${insufficientShipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  result = await api(`/api/shipments/${insufficientShipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 409, "insufficient stock rejects delivery");
  assert.equal(await getInventoryQuantity(primaryProductId, sourceWarehouseId), 7);
  result = await api(`/api/shipments/${insufficientShipment._id}/deliver`, {
    method: "POST",
    token: staffToken,
  });
  assert.equal(result.status, 403, "staff cannot deliver shipments");

  const cancelledTransit = await createShipment([
    { productId: primaryProductId, quantity: 1 },
  ]);
  await api(`/api/shipments/${cancelledTransit._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  result = await api(`/api/shipments/${cancelledTransit._id}/cancel`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200, "IN_TRANSIT shipment may be cancelled");
  assert.equal(await getInventoryQuantity(primaryProductId, sourceWarehouseId), 7);

  const autoDestinationShipment = await createShipment([
    { productId: newDestinationProductId, quantity: 2 },
  ]);
  await api(`/api/shipments/${autoDestinationShipment._id}/dispatch`, {
    method: "POST",
    token: managerToken,
  });
  result = await api(`/api/shipments/${autoDestinationShipment._id}/deliver`, {
    method: "POST",
    token: managerToken,
  });
  assert.equal(result.status, 200);
  assert.equal(
    await getInventoryQuantity(newDestinationProductId, destinationWarehouseId),
    2,
    "delivery creates destination inventory when none exists"
  );

  const draftForDelete = await createShipment([
    { productId: primaryProductId, quantity: 1 },
  ]);
  result = await api(`/api/shipments/${draftForDelete._id}`, {
    method: "DELETE",
    token: managerToken,
  });
  assert.equal(result.status, 403, "manager cannot delete a shipment");
  result = await api(`/api/shipments/${draftForDelete._id}`, {
    method: "DELETE",
    token: staffToken,
  });
  assert.equal(result.status, 403, "staff cannot delete a shipment");
  result = await api(`/api/shipments/${draftForDelete._id}`, {
    method: "DELETE",
    token: adminToken,
  });
  assert.equal(result.status, 200, "admin can delete a draft shipment");
  assert.ok(
    (await getEntityEvents("Shipment", draftForDelete._id)).some(
      (event) => event.eventType === "SHIPMENT_DELETED"
    ),
    "deletion preserves a shipment audit event"
  );

  console.log(
    "Shipment integration passed: workflow, movement, events, authorization and rollback"
  );
});
