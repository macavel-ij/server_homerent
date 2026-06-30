import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
  tenantId: mongoose.Types.ObjectId;
  managerId: mongoose.Types.ObjectId;
  propertyId: mongoose.Types.ObjectId;
  lastMessage?: string;
  lastMessageAt: Date;
  lastMessageSenderId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessageSenderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
chatSchema.index({ tenantId: 1, managerId: 1, propertyId: 1 });
chatSchema.index({ tenantId: 1, lastMessageAt: -1 });
chatSchema.index({ managerId: 1, lastMessageAt: -1 });

const Chat = mongoose.model<IChat>("Chat", chatSchema);

export default Chat;
