import express, { RequestHandler } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  createApplication,
  listApplications,
  updateApplicationStatus,
  generatePaymentsForExistingLeases,
} from "../controllers/applicationControllers";

const router = express.Router();

router.post("/", authMiddleware(["tenant"]), createApplication as RequestHandler);
router.put("/:id/status", authMiddleware(["manager"]), updateApplicationStatus as RequestHandler);
router.get("/", authMiddleware(["manager", "tenant"]), listApplications as RequestHandler);

// Admin endpoint to generate payments for existing leases
router.post("/admin/generate-payments", authMiddleware(["manager"]), generatePaymentsForExistingLeases as RequestHandler);

export default router;
