# TrackFlow / Audit Trail

## Shipment and inventory transfer

Shipments are created in `CREATED` status, dispatched to `IN_TRANSIT`, and delivered to `DELIVERED`. A shipment can be cancelled while it is `CREATED` or `IN_TRANSIT`. Stock is transferred exactly once, at delivery; dispatch changes the workflow state but does not change inventory.

Delivery runs as one MongoDB transaction: source stock decreases, destination stock increases (creating a destination inventory record if needed), shipment status changes, and the shipment/stock audit events are saved together. Insufficient or missing source stock aborts the entire operation.

MongoDB transactions require a replica set, including for local development. The Compose MongoDB service is configured as a single-node `rs0` replica set and initializes it on startup. Start it with `docker compose up -d`; the existing named data volume is retained. The default replica-set member address supports the local development URI `mongodb://localhost:27017/audit-trail`.

Shipment API routes require a JWT. Admin and manager roles may create, edit, dispatch, deliver, or cancel; only admins may delete a draft shipment. Authenticated users may view shipments.

## Event sourcing and CQRS

**Event Sourcing** stores the sequence of business facts rather than treating the latest shipment document as the history. For example, `CREATED → LOADED → TEMPERATURE_SPIKE → ARRIVED` records what happened at each step; replay applies each event to rebuild the current state or the state at any earlier version. **CQRS** separates commands, which validate and append events, from queries, which read the event stream and reconstruct state. **Optimistic concurrency control (OCC)** requires commands to specify the version they observed. If another command has already advanced that version, the stale command receives `409 CONCURRENCY_CONFLICT` instead of overwriting it.

The dedicated `eventstores` collection is the source of truth for shipment streams. The existing `events` collection remains the general audit log for user, inventory, and other activity; it is not the versioned Event Store. Shipment documents are retained as a transactionally updated compatibility snapshot for existing APIs and inventory workflows. Event-sourced queries below replay the Event Store and do not use that snapshot as their state source.

### CQRS routes

Commands require a manager/admin JWT and append a shipment domain event:

| Method and path | Command |
| --- | --- |
| `POST /api/commands/shipments/create` | Create a shipment with `expectedVersion: 0` |
| `POST /api/commands/shipments/dispatch` | Dispatch `{ shipmentId, expectedVersion }` |
| `POST /api/commands/shipments/deliver` | Deliver `{ shipmentId, expectedVersion }` |
| `POST /api/commands/shipments/cancel` | Cancel `{ shipmentId, expectedVersion }` |

The create response provides the generated `aggregateId` and version `1`; subsequent commands pass the version returned by the preceding command. Delivery applies inventory changes, the shipment snapshot update, the Event Store append, and existing audit events in one MongoDB transaction.

Authenticated query routes are read-only:

| Method and path | Result |
| --- | --- |
| `GET /api/queries/shipments/:id` | Reconstruct current shipment state |
| `GET /api/queries/shipments/:id/events` | Read stream ordered by version ascending |
| `GET /api/queries/shipments/:id/reconstruct?version=N` | Reconstruct state at a specific existing version |

The legacy `/api/shipments` interface remains available for compatibility. Its shipment writes now append corresponding versioned events in the same transaction. Existing records created before Event Store rollout are lazily imported as a `SHIPMENT_IMPORTED` baseline when first modified; their earlier history cannot be recovered if it was never recorded.

Event versions start at 1 and increase per aggregate. The unique `(aggregateType, aggregateId, version)` index prevents duplicate versions and is the final protection against concurrent writers; stream reads use the same index for ordered replay. The `(eventType, timestamp)` index supports event-type/time lookups. Event Store Mongoose middleware rejects update/delete operations and no mutation routes or services are provided. MongoDB itself is not configured with a database-level immutable-collection policy, so direct privileged database access can bypass the application guard.

The existing Compose MongoDB is already a single-node `rs0` replica set. The backend ensures the Event Store indexes are initialized before serving requests. No Docker topology changes, projection worker, separate read-model worker, or UI were added in this milestone.

### Shipment integration tests

With the replica-set MongoDB running and the API started from `server` with a valid `JWT_SECRET`, run `npm test` in a second terminal. Integration tests create uniquely named records and remove their test data afterward. The focused Event Sourcing test can be run with `node --test test/event-sourcing.integration.test.js`.

## API validation and errors

Requests are validated at the API boundary and again by Mongoose schemas. API errors use a stable JSON shape with `success: false`, a safe `message`, and an application `code`; validation errors may also include field-level `errors`. Unexpected server errors are logged server-side and returned without stack traces or database details. Successful responses include `success: true` while retaining the existing resource keys (`product`, `products`, `shipment`, etc.) for compatibility.

Focused validation and error-response checks can be run from `server` with `node --test test/validation.test.js`.
