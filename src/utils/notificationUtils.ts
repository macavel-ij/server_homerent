import { createNotification } from "../controllers/notificationControllers";
import { INotification } from "../models/notificationModel";

const formatCurrencyForNotification = (value: number) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "N/A";

  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
  }).format(numericValue);

  return `TSh ${formatted}`;
};

/**
 * Create notification for application status change
 */
export const createApplicationNotification = async (
  tenantCognitoId: string,
  applicationId: string,
  status: string,
  propertyName: string
) => {
  try {
    const normalizedStatus = status.toLowerCase();
    const statusMap: Record<string, { title: string; message: string }> = {
      approved: {
        title: "Application Approved! 🎉",
        message: `Your application for ${propertyName} has been approved. You can now view lease details and make payments.`,
      },
      rejected: {
        title: "Application Rejected",
        message: `Unfortunately, your application for ${propertyName} has been rejected. Please contact the property manager for more information.`,
      },
      pending: {
        title: "Application Submitted",
        message: `Your application for ${propertyName} has been submitted for review.`,
      },
    };

    const statusInfo = statusMap[normalizedStatus] || {
      title: "Application Status Updated",
      message: `Your application status has been updated to: ${status}`,
    };

    await createNotification({
      recipientId: tenantCognitoId,
      type: "application",
      title: statusInfo.title,
      message: statusInfo.message,
      status: (normalizedStatus as "pending" | "approved" | "rejected"),
      relatedId: applicationId,
      relatedModel: "Application" as const,
      actionUrl: `/applications?id=${applicationId}`,
      metadata: {
        applicationId,
        propertyName,
      },
    });
  } catch (error) {
    console.error("Error creating application notification:", error);
    // Don't throw - notification failures shouldn't break the main flow
  }
};

/**
 * Create notification for payment
 */
export const createPaymentNotification = async (
  tenantCognitoId: string,
  paymentId: string,
  paymentStatus: string,
  amount: number,
  propertyName: string
) => {
  try {
    const normalizedStatus = paymentStatus.toLowerCase();
    const statusMap: Record<string, { title: string; message: string }> = {
      completed: {
        title: "Payment Successful! ✅",
        message: `Your payment of ${formatCurrencyForNotification(amount)} for ${propertyName} has been processed successfully.`,
      },
      successful: {
        title: "Payment Successful! ✅",
        message: `Your payment of ${formatCurrencyForNotification(amount)} for ${propertyName} has been processed successfully.`,
      },
      paid: {
        title: "Payment Successful! ✅",
        message: `Your payment of ${formatCurrencyForNotification(amount)} for ${propertyName} has been processed successfully.`,
      },
      failed: {
        title: "Payment Failed ❌",
        message: `Your payment of ${formatCurrencyForNotification(amount)} for ${propertyName} failed. Please try again.`,
      },
      pending: {
        title: "Payment Pending",
        message: `Your payment of ${formatCurrencyForNotification(amount)} for ${propertyName} is being processed.`,
      },
    };

    const statusInfo = statusMap[normalizedStatus] || {
      title: "Payment Status Updated",
      message: `Your payment status has been updated to: ${paymentStatus}`,
    };

    // Map payment status to notification enum values
    let mappedStatus: "pending" | "approved" | "rejected" | "successful" | "failed" = "pending";
    if (normalizedStatus === "completed" || normalizedStatus === "successful" || normalizedStatus === "paid") {
      mappedStatus = "successful";
    } else if (normalizedStatus === "failed") {
      mappedStatus = "failed";
    }

    const notificationData = {
      recipientId: tenantCognitoId,
      type: "payment" as const,
      title: statusInfo.title,
      message: statusInfo.message,
      status: mappedStatus,
      relatedId: paymentId,
      relatedModel: "Payment" as const,
      actionUrl: `/payments?id=${paymentId}`,
      metadata: {
        paymentId,
        amount,
        propertyName,
      },
    };

    console.log("[Notification] Creating payment notification:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] Payment notification created successfully");
  } catch (error) {
    console.error("Error creating payment notification:", error);
  }
};

/**
 * Create notification for new message
 */
export const createMessageNotification = async (
  recipientCognitoId: string,
  senderName: string,
  chatId: string,
  messagePreview: string
) => {
  try {
    const notificationData = {
      recipientId: recipientCognitoId,
      type: "message" as const,
      title: `New Message from ${senderName}`,
      message: messagePreview.substring(0, 100),
      relatedId: chatId,
      relatedModel: "Message" as const,
      actionUrl: `/chats?chatId=${chatId}`,
      metadata: {
        chatId,
        senderName,
      },
    };

    console.log("[Notification] Creating message notification:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] Message notification created successfully");
  } catch (error) {
    console.error("Error creating message notification:", error);
  }
};

/**
 * Create notification for rating
 */
export const createRatingNotification = async (
  managerCognitoId: string,
  ratingId: string,
  rating: number,
  propertyName: string,
  comment?: string
) => {
  try {
    const notificationData = {
      recipientId: managerCognitoId,
      type: "rating" as const,
      title: `New Rating: ${rating} ⭐`,
      message: `Your property "${propertyName}" received a ${rating}-star rating.${comment ? " Comment: " + comment.substring(0, 50) : ""}`,
      relatedId: ratingId,
      relatedModel: "Rating" as const,
      actionUrl: `/properties`,
      metadata: {
        ratingId,
        rating,
        propertyName,
      },
    };

    console.log("[Notification] Creating rating notification:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] Rating notification created successfully");
  } catch (error) {
    console.error("Error creating rating notification:", error);
  }
};

/**
 * Create notification for lease events
 */
export const createLeaseNotification = async (
  tenantCognitoId: string,
  leaseId: string,
  eventType: "created" | "ending" | "renewed" | "terminated",
  propertyName: string
) => {
  try {
    const eventMap: Record<string, { title: string; message: string }> = {
      created: {
        title: "Lease Created",
        message: `Your lease for ${propertyName} has been created. You can now view details and payment schedule.`,
      },
      ending: {
        title: "Lease Ending Soon",
        message: `Your lease for ${propertyName} will be ending soon. Please contact your property manager if you wish to renew.`,
      },
      renewed: {
        title: "Lease Renewed",
        message: `Your lease for ${propertyName} has been renewed.`,
      },
      terminated: {
        title: "Lease Terminated",
        message: `Your lease for ${propertyName} has been terminated.`,
      },
    };

    const eventInfo = eventMap[eventType];

    const notificationData = {
      recipientId: tenantCognitoId,
      type: "lease" as const,
      title: eventInfo.title,
      message: eventInfo.message,
      relatedId: leaseId,
      relatedModel: "Lease" as const,
      actionUrl: `/leases`,
      metadata: {
        leaseId,
        eventType,
        propertyName,
      },
    };

    console.log("[Notification] Creating lease notification:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] Lease notification created successfully");
  } catch (error) {
    console.error("Error creating lease notification:", error);
  }
};

/**
 * Create system notification
 */
export const createSystemNotification = async (
  recipientCognitoId: string,
  title: string,
  message: string,
  actionUrl?: string
) => {
  try {
    await createNotification({
      recipientId: recipientCognitoId,
      type: "system",
      title,
      message,
      actionUrl,
    });
  } catch (error) {
    console.error("Error creating system notification:", error);
  }
};

/**
 * Create notification for manager when new application is received
 */
export const createNewApplicationNotificationForManager = async (
  managerCognitoId: string,
  applicationId: string,
  tenantName: string,
  propertyName: string
) => {
  try {
    const notificationData = {
      recipientId: managerCognitoId,
      type: "application" as const,
      title: "New Application Received 📋",
      message: `New application from ${tenantName} for ${propertyName}. Please review and approve or reject.`,
      status: "pending" as const,
      relatedId: applicationId,
      relatedModel: "Application" as const,
      actionUrl: `/applications?id=${applicationId}`,
      metadata: {
        applicationId,
        tenantName,
        propertyName,
      },
    };

    console.log("[Notification] Creating new application notification for manager:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] New application notification for manager created successfully");
  } catch (error) {
    console.error("Error creating new application notification for manager:", error);
  }
};

/**
 * Create notification for manager when tenant makes payment
 */
export const createPaymentNotificationForManager = async (
  managerCognitoId: string,
  paymentId: string,
  tenantName: string,
  amount: number,
  propertyName: string,
  paymentStatus: string,
  propertyId?: string
) => {
  try {
    const statusMap: Record<string, { title: string; message: string }> = {
      paid: {
        title: "Payment Received! ✅",
        message: `${tenantName} has paid ${formatCurrencyForNotification(amount)} for ${propertyName}.`,
      },
      successful: {
        title: "Payment Received! ✅",
        message: `${tenantName} has paid ${formatCurrencyForNotification(amount)} for ${propertyName}.`,
      },
      completed: {
        title: "Payment Received! ✅",
        message: `${tenantName} has paid ${formatCurrencyForNotification(amount)} for ${propertyName}.`,
      },
      partial: {
        title: "Partial Payment Received 📌",
        message: `${tenantName} has made a partial payment of ${formatCurrencyForNotification(amount)} for ${propertyName}.`,
      },
      failed: {
        title: "Payment Failed ❌",
        message: `Payment from ${tenantName} for ${formatCurrencyForNotification(amount)} on ${propertyName} has failed.`,
      },
    };

    const normalizedStatus = paymentStatus.toLowerCase();
    const statusInfo = statusMap[normalizedStatus] || {
      title: "Payment Status Update",
      message: `${tenantName} payment status: ${paymentStatus}`,
    };

    let mappedStatus: "pending" | "approved" | "rejected" | "successful" | "failed" = "pending";
    if (normalizedStatus === "paid" || normalizedStatus === "successful" || normalizedStatus === "completed") {
      mappedStatus = "successful";
    } else if (normalizedStatus === "failed") {
      mappedStatus = "failed";
    }

    const notificationData = {
      recipientId: managerCognitoId,
      type: "payment" as const,
      title: statusInfo.title,
      message: statusInfo.message,
      status: mappedStatus,
      relatedId: paymentId,
      relatedModel: "Payment" as const,
      actionUrl: propertyId ? `/payments?propertyId=${propertyId}` : `/payments?id=${paymentId}`,
      metadata: {
        paymentId,
        propertyId,
        tenantName,
        amount,
        propertyName,
      },
    };

    console.log("[Notification] Creating payment notification for manager:", notificationData);
    await createNotification(notificationData);
    console.log("[Notification] Payment notification for manager created successfully");
  } catch (error) {
    console.error("Error creating payment notification for manager:", error);
  }
};
