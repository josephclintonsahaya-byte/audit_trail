import { Router } from "express";
import {
  createUser,
  changeUserPassword,
  deleteUser,
  getUserById,
  getUsers,
  updateUser,
} from "../controllers/user.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.use(requireAuth, authorizeRoles("admin"));

router.post("/", createUser);
router.get("/", getUsers);
router.get("/:id", validateObjectIdParam("id", "user ID"), getUserById);
router.patch("/:id", validateObjectIdParam("id", "user ID"), updateUser);
router.patch("/:id/password", validateObjectIdParam("id", "user ID"), changeUserPassword);
router.delete("/:id", validateObjectIdParam("id", "user ID"), deleteUser);

export default router;
