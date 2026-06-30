import mongoose, { Schema, Document } from "mongoose";

export interface ILocation extends Document {
  address: string;
  city: string;
  state?: string;
  country?: string;
  postalCode?: string;
  coordinates: {
    type: string;
    coordinates: [number, number]; // [longitude, latitude]
  };
}

const LocationSchema: Schema = new Schema<ILocation>({
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String },
  country: { type: String },
  postalCode: { type: String },
  coordinates: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true },
  },
});

LocationSchema.index({ coordinates: "2dsphere" });

export const Location = mongoose.model<ILocation>("Location", LocationSchema);
