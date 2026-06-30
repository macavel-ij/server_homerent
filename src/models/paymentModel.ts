import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  amountDue?: number;
  amountPaid?: number;
  dueDate?: Date;
  paymentDate?: Date;
  paymentStatus?: string;
  paymentMethod?: string;
  months?: number;
  lease: mongoose.Types.ObjectId;
  propertyName?: string;
  propertyAddress?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PaymentSchema: Schema = new Schema<IPayment>({
  amountDue: { type: Number },
  amountPaid: { type: Number },
  dueDate: { type: Date },
  paymentDate: { type: Date },
  paymentStatus: { type: String, default: "pending" },
  paymentMethod: { type: String },
  months: { type: Number, default: 1 },
  lease: { type: Schema.Types.ObjectId, ref: "Lease", required: true },
}, { timestamps: true });

export const Payment = mongoose.model<IPayment>("Payment", PaymentSchema);
