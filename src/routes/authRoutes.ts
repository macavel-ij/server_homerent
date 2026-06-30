import express, { RequestHandler } from "express";
import { signUp, signIn, signInWithGoogle, getMe, updateMe, changePassword } from "../controllers/authControllers";
import { authRequired } from "../middleware/authMiddleware";

const router = express.Router();

router.post("/signup", signUp as RequestHandler);
router.post("/signin", signIn as RequestHandler);
router.post("/google", signInWithGoogle as RequestHandler);
// Provide a simple GET /auth landing to list available auth endpoints
router.get("/", (req, res) => {
	res.json({
		message: "Auth endpoints",
		endpoints: [
			{ method: "POST", path: "/auth/signup" },
			{ method: "POST", path: "/auth/signin" },
			{ method: "POST", path: "/auth/google" },
			{ method: "GET", path: "/auth/me" },
			{ method: "PUT", path: "/auth/me" },
			{ method: "PUT", path: "/auth/change-password" }
		]
	});
});
router.get("/me", authRequired(), getMe as RequestHandler);
router.put("/me", authRequired(), updateMe as RequestHandler);
router.put("/change-password", authRequired(), changePassword as RequestHandler);

export default router;
