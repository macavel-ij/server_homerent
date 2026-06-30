import mongoose, { Schema, Document } from "mongoose";

export interface ITenant extends Document {
  cognitoId: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  favorites: mongoose.Types.ObjectId[]; // refs to Property
  savedLocations?: {
    title?: string;
    placeId?: string;
    coordinates?: number[]; // [lng, lat]
  }[];
}

const TenantSchema: Schema = new Schema<ITenant>({
  cognitoId: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  phoneNumber: { type: String },
  favorites: [{ type: Schema.Types.ObjectId, ref: "Property" }],
  savedLocations: [
    {
      title: { type: String },
      placeId: { type: String },
      coordinates: { type: [Number] }, // [lng, lat]
    },
  ],
});

export const Tenant = mongoose.model<ITenant>("Tenant", TenantSchema);
