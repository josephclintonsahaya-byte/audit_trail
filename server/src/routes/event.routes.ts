import { Router } from "express";
import { getAllEvents, getEventsForEntity } from "../controllers/event.controller";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.get("/", getAllEvents);
router.get(
  "/:entityType/:entityId",
  validateObjectIdParam("entityId", "event entity ID"),
  getEventsForEntity
);

export default router;
