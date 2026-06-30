import express from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getNotificationsByType,
} from "../controllers/notificationControllers";

const router = express.Router();

// Apply authMiddleware to all routes (allow both tenant and manager roles)
router.get("/", authMiddleware(["tenant", "manager", "admin"]), getNotifications);

// Get unread notification count
router.get("/count/unread", authMiddleware(["tenant", "manager", "admin"]), getUnreadNotificationCount);

// Get notifications by type
router.get("/type/:type", authMiddleware(["tenant", "manager", "admin"]), getNotificationsByType);

// Mark a specific notification as read
router.patch("/:notificationId/read", authMiddleware(["tenant", "manager", "admin"]), markAsRead);

// Mark all notifications as read
router.patch("/read/all", authMiddleware(["tenant", "manager", "admin"]), markAllAsRead);

// Delete a notification
router.delete("/:notificationId", authMiddleware(["tenant", "manager", "admin"]), deleteNotification);

export default router;
