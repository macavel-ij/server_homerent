import { Request, Response } from "express";
import { Rating } from "../models/ratingModel";
import { Property } from "../models/propertyModel";

// Helper function to normalize rating distribution keys to strings
const normalizeRatingDistribution = (dist: any): Record<string, number> => {
  const normalized: Record<string, number> = {
    "5": 0,
    "4": 0,
    "3": 0,
    "2": 0,
    "1": 0,
  };

  if (dist && typeof dist === "object") {
    Object.entries(dist).forEach(([key, value]: [string, any]) => {
      const numKey = parseInt(key);
      if (numKey >= 1 && numKey <= 5) {
        normalized[String(numKey)] = Number(value) || 0;
      }
    });
  }

  return normalized;
};

// Get ratings for a property
export const getPropertyRatings = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user?.id;

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const ratings = await Rating.find({ propertyId }).sort({ createdAt: -1 });

    const userRating = userId ? ratings.find((r) => r.userId === userId) : null;

    res.json({
      averageRating: property.averageRating || 0,
      numberOfReviews: property.numberOfReviews || 0,
      ratingDistribution: normalizeRatingDistribution(property.ratingDistribution),
      userRating: userRating ? { rating: userRating.rating, comment: userRating.comment } : null,
      recentRatings: ratings.slice(0, 5).map((r) => ({
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// Submit or update a rating
export const rateProperty = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const n = Number(rating);
    if (!propertyId || Number.isNaN(n) || n < 1 || n > 5) {
      return res.status(400).json({ message: "Invalid rating (must be 1-5)" });
    }

    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    // Check if user already rated this property
    let existingRating = await Rating.findOne({ propertyId, userId });
    let isNew = false;

    if (existingRating) {
      // Update existing rating
      const oldRating = existingRating.rating;
      existingRating.rating = n;
      if (comment) existingRating.comment = comment;
      await existingRating.save();

      // Recalculate stats: adjust for rating change
      const oldCount = (property as any).numberOfReviews || 1;
      const oldAvg = (property as any).averageRating || 0;
      const newAvg = (oldAvg * oldCount - oldRating + n) / oldCount;

      let ratingDist = normalizeRatingDistribution((property as any).ratingDistribution);

      // Decrease old rating count, increase new rating count
      const oldRatingKey = String(oldRating);
      const newRatingKey = String(n);
      ratingDist[oldRatingKey] = Math.max(0, (ratingDist[oldRatingKey] || 1) - 1);
      ratingDist[newRatingKey] = (ratingDist[newRatingKey] || 0) + 1;

      (property as any).averageRating = newAvg;
      (property as any).ratingDistribution = ratingDist;
    } else {
      // Create new rating
      const newRating = new Rating({
        propertyId,
        userId,
        rating: n,
        comment,
      });
      await newRating.save();
      isNew = true;

      // Update property stats for new rating
      const oldAvg = (property as any).averageRating || 0;
      const oldCount = (property as any).numberOfReviews || 0;
      const newCount = oldCount + 1;
      const newAvg = (oldAvg * oldCount + n) / newCount;

      let ratingDist = normalizeRatingDistribution((property as any).ratingDistribution);

      const newRatingKey = String(n);
      ratingDist[newRatingKey] = (ratingDist[newRatingKey] || 0) + 1;

      (property as any).averageRating = newAvg;
      (property as any).numberOfReviews = newCount;
      (property as any).ratingDistribution = ratingDist;
    }

    await property.save();

    const populated = await property.populate("location");
    const obj = typeof populated.toObject === "function" ? populated.toObject() : populated;
    (obj as any).name = (obj as any).title || (obj as any).name;

    res.json({
      success: true,
      message: isNew ? "Rating submitted successfully!" : "Rating updated successfully!",
      property: obj,
      isNew,
    });
  } catch (err: any) {
    // Handle unique constraint violation
    if (err.code === 11000) {
      return res.status(400).json({ message: "You have already rated this property" });
    }
    res.status(500).json({ message: err.message });
  }
};

// Get user's rating status for a property
export const getUserRatingStatus = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.json({ hasRated: false, rating: null });
    }

    const rating = await Rating.findOne({ propertyId, userId });
    res.json({
      hasRated: !!rating,
      rating: rating ? { value: rating.rating, comment: rating.comment } : null,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
