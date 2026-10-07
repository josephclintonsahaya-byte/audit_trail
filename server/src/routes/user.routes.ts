import { Router } from "express";
import { createUser, getUsers, getUserById,  updateUser,   deleteUser,} from "../controllers/user.controller";
import { validateObjectIdParam } from "../middleware/validation.middleware";


const router = Router();

router.post("/", createUser);
router.get("/", getUsers);
router.get("/:id", validateObjectIdParam("id", "user ID"), getUserById);
router.patch("/:id", validateObjectIdParam("id", "user ID"), updateUser);
router.delete("/:id", validateObjectIdParam("id", "user ID"), deleteUser);

export default router;