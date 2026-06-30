import express, { RequestHandler } from "express";
import { authMiddleware, allowSelfOrRole } from "../middleware/authMiddleware";
import {
  getManager,
  createManager,
  updateManager,
  getManagerProperties,
  getSavedLocations,
  addSavedLocation,
  removeSavedLocation,
} from "../controllers/managerControllers";

const router = express.Router();

router.get("/:cognitoId", getManager as RequestHandler);
router.put("/:cognitoId", allowSelfOrRole(["manager"]), updateManager as RequestHandler);
router.get("/:cognitoId/properties", getManagerProperties as RequestHandler);
router.post("/", authMiddleware(["manager"]), createManager as RequestHandler);
router.get("/:cognitoId/saved-locations", getSavedLocations as RequestHandler);
router.post("/:cognitoId/saved-locations", allowSelfOrRole(["manager"]), addSavedLocation as RequestHandler);
router.delete("/:cognitoId/saved-locations/:placeId", allowSelfOrRole(["manager"]), removeSavedLocation as RequestHandler);

export default router;
