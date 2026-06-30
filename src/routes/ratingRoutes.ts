import express, { RequestHandler } from "express";
import {
  rateProperty,
  getPropertyRatings,
  getUserRatingStatus,
} from "../controllers/ratingControllers";
import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Get ratings for a property (public endpoint with optional auth)
router.get("/:propertyId", getPropertyRatings as RequestHandler);

// Get user's rating status for a property
router.get(
  "/:propertyId/user-status",
  authMiddleware(["tenant", "manager"]),
  getUserRatingStatus as RequestHandler
);

// Submit or update a rating
router.post(
  "/:propertyId",
  authMiddleware(["tenant", "manager"]),
  rateProperty as RequestHandler
);

export default router;
