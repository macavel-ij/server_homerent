import express, { RequestHandler } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  getPayments,
  createPayment,
  updatePayment,
  getTenantPayments,
  getLeasePaymentStatus,
} from "../controllers/paymentControllers";

const router = express.Router();

// Get payments for a specific lease
router.get(
  "/lease/:leaseId",
  authMiddleware(["tenant", "manager"]),
  getPayments as RequestHandler
);

// Get payment status for a lease
router.get(
  "/:leaseId/payment-status",
  authMiddleware(["tenant", "manager"]),
  getLeasePaymentStatus as RequestHandler
);

// Get all payments for a tenant
router.get(
  "/tenant/:tenantCognitoId",
  authMiddleware(["tenant"]),
  getTenantPayments as RequestHandler
);

// Create a new payment
router.post(
  "/",
  authMiddleware(["manager"]),
  createPayment as RequestHandler
);

// Update a payment
router.put(
  "/:paymentId",
  authMiddleware(["tenant", "manager"]),
  updatePayment as RequestHandler
);

export default router;
