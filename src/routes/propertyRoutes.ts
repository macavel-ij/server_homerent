import express, { RequestHandler } from "express";
import {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
} from "../controllers/propertyControllersMongo";
import { getPropertyLeases } from "../controllers/leaseControllers";
import multer from "multer";
import { authMiddleware } from "../middleware/authMiddleware";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

router.get("/", getProperties as RequestHandler);
router.get("/:propertyId/leases", authMiddleware(["manager", "tenant"]), getPropertyLeases as RequestHandler);
router.get("/:id", getProperty as RequestHandler);
router.post(
  "/",
  authMiddleware(["manager"]),
  upload.array("photos"),
  createProperty
);
router.put(
  "/:id",
  authMiddleware(["manager"]),
  upload.array("photos"),
  updateProperty
);
router.delete(
  "/:id",
  authMiddleware(["manager"]),
  deleteProperty as RequestHandler
);

export default router;
