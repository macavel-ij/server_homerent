import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  recipientId: string; // Cognito ID of the recipient
  type: "application" | "payment" | "message" | "rating" | "lease" | "system";
  title: string;
  message: string;
  relatedId?: string; // ID of the related entity (applicationId, paymentId, etc.)
  relatedModel?: "Application" | "Payment" | "Message" | "Rating" | "Lease";
  status: "pending" | "approved" | "rejected" | "successful" | "failed";
  isRead: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const NotificationSchema: Schema = new Schema<INotification>(
  {
    recipientId: {
      type: String,
      required: true,
      index: true, // Index for quick lookups by user
    },
    type: {
      type: String,
      enum: ["application", "payment", "message", "rating", "lease", "system"],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    relatedId: {
      type: String,
    },
    relatedModel: {
      type: String,
      enum: ["Application", "Payment", "Message", "Rating", "Lease"],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "successful", "failed"],
      default: "pending",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true, // Index for quick unread count
    },
    actionUrl: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Compound index for efficient querying of unread notifications
NotificationSchema.index({ recipientId: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);
