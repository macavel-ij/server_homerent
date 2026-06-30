import mongoose, { Schema, Document } from "mongoose";
import { ILocation } from "./locationModel";

export interface IProperty extends Document {
  title?: string;
  description?: string;
  pricePerMonth?: number;
  photoUrls?: string[];
  location: ILocation | mongoose.Types.ObjectId;
  beds?: number;
  baths?: number;
  squareFeet?: number;
  propertyType?: string;
  amenities?: string[];
  managerCognitoId?: string;
  tenants?: string[];
  isPinned?: boolean;
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
  averageRating?: number;
  numberOfReviews?: number;
  ratingDistribution?: Record<string, number>; // e.g., { "5": 100, "4": 50, "3": 25, "2": 10, "1": 5 }
  paymentFrequency?: number; // Number of months for payment (e.g., 3 for quarterly)
  acceptedPaymentMethods?: string[]; // e.g., ["credit_card", "bank_transfer"]
}

const PropertySchema: Schema = new Schema<IProperty>(
  {
    title: { type: String },
    description: { type: String },
    pricePerMonth: { type: Number },
    photoUrls: { type: [String], default: [] },
    location: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    beds: { type: Number },
    baths: { type: Number },
    squareFeet: { type: Number },
    propertyType: { type: String },
    amenities: { type: [String], default: [] },
    managerCognitoId: { type: String },
    tenants: { type: [String], default: [] },
    isPinned: { type: Boolean, default: false },
    isPetsAllowed: { type: Boolean, default: false },
    isParkingIncluded: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0 },
    numberOfReviews: { type: Number, default: 0 },
    ratingDistribution: {
      type: Schema.Types.Mixed,
      default: { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 },},
    paymentFrequency: { type: Number, default: 1 },
    acceptedPaymentMethods: { type: [String], default: ["credit_card"] },
  }, { timestamps: true });
export const Property = mongoose.model<IProperty>("Property", PropertySchema);
