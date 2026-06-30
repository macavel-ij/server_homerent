import mongoose, { Schema, Document } from "mongoose";

export interface IManager extends Document {
  cognitoId: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  savedLocations?: {
    title?: string;
    placeId?: string;
    coordinates?: number[]; // [lng, lat]
  }[];
}

const ManagerSchema: Schema = new Schema<IManager>({
  cognitoId: { type: String, required: true, unique: true },
  name: { type: String },
  email: { type: String },
  phoneNumber: { type: String },
  savedLocations: [
    {
      title: { type: String },
      placeId: { type: String },
      coordinates: { type: [Number] }, // [lng, lat]
    },
  ],
});

export const Manager = mongoose.model<IManager>("Manager", ManagerSchema);
