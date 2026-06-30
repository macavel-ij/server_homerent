import express, { RequestHandler } from "express";
import { signUp, signIn, signInWithGoogle, getMe, updateMe, changePassword } from "../controllers/authControllers";
import { authRequired } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/signup", signUp as RequestHandler);
router.post("/signin", signIn as RequestHandler);
router.post("/google", signInWithGoogle as RequestHandler);
router.get("/me", authRequired(), getMe as RequestHandler);
router.put("/me", authRequired(), updateMe as RequestHandler);
router.put("/change-password", authRequired(), changePassword as RequestHandler);

export default router;
