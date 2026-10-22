import { Router } from "express";
import { getMe, login, register } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  loginRateLimiter,
  registrationRateLimiter,
} from "../middleware/auth-rate-limit.middleware";

const router = Router();

router.post("/register", registrationRateLimiter, register);
router.post("/login", loginRateLimiter, login);
router.get("/me", requireAuth, getMe);

export default router;
