import { Router } from "express";
import { getAllEvents, getEventDetailsById, getEventsForEntity } from "../controllers/event.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.get("/", requireAuth, getAllEvents);
router.get(
  "/detail/:eventId",
  requireAuth,
  validateObjectIdParam("eventId", "event ID"),
  getEventDetailsById
);
router.get(
  "/:entityType/:entityId",
  requireAuth,
  validateObjectIdParam("entityId", "event entity ID"),
  getEventsForEntity
);

export default router;
