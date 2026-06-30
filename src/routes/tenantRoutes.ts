import express, { RequestHandler } from "express";
import { allowSelfOrRole } from "../middleware/authMiddleware";
import {
  getTenant,
  createTenant,
  updateTenant,
  getCurrentResidences,
  addFavoriteProperty,
  removeFavoriteProperty,
  getSavedLocations,
  addSavedLocation,
  removeSavedLocation,
} from "../controllers/tenantControllers";

const router = express.Router();

router.get("/:cognitoId", getTenant as RequestHandler);
router.put("/:cognitoId", allowSelfOrRole(["tenant"]), updateTenant as RequestHandler);
router.post("/", createTenant as RequestHandler);
router.get("/:cognitoId/current-residences", getCurrentResidences as RequestHandler);
router.post("/:cognitoId/favorites/:propertyId", allowSelfOrRole(["tenant"]), addFavoriteProperty as RequestHandler);
router.delete("/:cognitoId/favorites/:propertyId", allowSelfOrRole(["tenant"]), removeFavoriteProperty as RequestHandler);
router.get("/:cognitoId/saved-locations", allowSelfOrRole(["tenant"]), getSavedLocations as RequestHandler);
router.post("/:cognitoId/saved-locations", allowSelfOrRole(["tenant"]), addSavedLocation as RequestHandler);
router.delete("/:cognitoId/saved-locations/:placeId", allowSelfOrRole(["tenant"]), removeSavedLocation as RequestHandler);

export default router;
