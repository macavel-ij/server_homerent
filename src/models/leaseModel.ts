import mongoose, { Schema, Document } from "mongoose";

export interface ILease extends Document {
  startDate: Date;
  endDate: Date;
  rent?: number;
  deposit?: number;
  property: mongoose.Types.ObjectId;
  tenant?: mongoose.Types.ObjectId;
  tenantCognitoId: string;
}

const LeaseSchema: Schema = new Schema<ILease>({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rent: { type: Number },
  deposit: { type: Number },
  property: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  tenant: { type: Schema.Types.ObjectId, ref: "Tenant" },
  tenantCognitoId: { type: String, required: true },
});

export const Lease = mongoose.model<ILease>("Lease", LeaseSchema);
