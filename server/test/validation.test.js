const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

require("tsx/cjs");
const app = require("../src/app.ts").default;
const { errorHandler } = require("../src/middleware/error.middleware.ts");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("successful responses retain their status and include the success flag", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.status, "ok");
});

test("malformed JSON uses the centralized error response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    success: false,
    message: "Request body contains invalid JSON",
    code: "INVALID_JSON",
  });
});

test("malformed resource IDs are rejected before database access", async () => {
  const response = await fetch(`${baseUrl}/api/products/not-an-object-id`);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.code, "INVALID_ID");
  assert.equal(body.message, "Invalid product ID");
});

test("request validation returns safe field-level errors", async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x", email: "invalid", password: "short" }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(body.errors).sort(), ["email", "name", "password"]);
});

test("product validation rejects negative amounts before database access", async () => {
  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Widget",
      sku: "WIDGET-1",
      category: "Tools",
      price: -1,
      quantity: -1,
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.deepEqual(Object.keys(body.errors).sort(), ["price", "quantity"]);
});

test("authentication failures share the centralized error format", async () => {
  const response = await fetch(`${baseUrl}/api/shipments`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.code, "AUTH_REQUIRED");
});

test("duplicate key errors return a safe conflict response", () => {
  const response = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  errorHandler(
    { code: 11000, keyPattern: { email: 1 }, message: "internal database detail" },
    {},
    response,
    () => {}
  );

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    success: false,
    message: "Email already exists",
    code: "USER_EMAIL_TAKEN",
  });
});

test("unexpected errors do not expose implementation details", () => {
  const response = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    errorHandler(new Error("database connection string"), {}, response, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
});
