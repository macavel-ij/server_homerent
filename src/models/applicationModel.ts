import mongoose, { Schema, Document } from "mongoose";

export interface IApplication extends Document {
  applicationDate: Date;
  status: string;
  property: mongoose.Types.ObjectId;
  tenantCognitoId: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  message?: string;
  lease?: mongoose.Types.ObjectId;
}

const ApplicationSchema: Schema = new Schema<IApplication>(
  {
    applicationDate: { type: Date, required: true },
    status: { type: String, required: true },
    property: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    tenantCognitoId: { type: String, required: true },
    name: { type: String },
    email: { type: String },
    phoneNumber: { type: String },
    message: { type: String },
    lease: { type: Schema.Types.ObjectId, ref: "Lease" },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

export const Application = mongoose.model<IApplication>("Application", ApplicationSchema);
