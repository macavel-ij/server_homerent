import mongoose, { Schema, Document } from "mongoose";

export interface IRating extends Document {
  propertyId: mongoose.Types.ObjectId;
  userId: string; // Cognito ID
  rating: number; // 1-5 stars
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RatingSchema: Schema = new Schema<IRating>(
  {
    propertyId: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate ratings from same user on same property
RatingSchema.index({ propertyId: 1, userId: 1 }, { unique: true });

export const Rating = mongoose.model<IRating>("Rating", RatingSchema);
