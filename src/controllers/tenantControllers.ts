import { Request, Response } from "express";
import mongoose from "mongoose";
import { Tenant } from "../models/tenantModel";
import { Property } from "../models/propertyModel";
import { Lease } from "../models/leaseModel";
import { Payment } from "../models/paymentModel";

async function findPropertyByIdOrOriginal(id: string) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    const p = await Property.findById(id).exec();
    if (p) return p;
  }
  return Property.findOne({ originalId: Number(id) }).exec();
}

export const getTenant = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const tenant = await Tenant.findOne({ cognitoId })
      .populate({
        path: "favorites",
        populate: { path: "location" }
      })
      .exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createTenant = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, name, email, phoneNumber } = req.body;
    const existing = await Tenant.findOne({ cognitoId }).exec();
    if (existing) return res.status(409).json({ message: "Tenant already exists" });
    const tenant = new Tenant({ cognitoId, name, email, phoneNumber });
    await tenant.save();
    res.status(201).json(tenant);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateTenant = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const { name, email, phoneNumber } = req.body;
    // Allow updating by cognitoId or Mongo _id
    const updated = await Tenant.findOneAndUpdate(
      { $or: [{ cognitoId }, { _id: cognitoId }] },
      { name, email, phoneNumber },
      { new: true }
    ).exec();
    if (!updated) return res.status(404).json({ message: "Tenant not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getCurrentResidences = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const leases = await Lease.find({ tenantCognitoId: cognitoId })
      .populate({ path: "property", populate: { path: "location" } })
      .sort({ startDate: -1 })
      .exec();
    
    // Auto-generate missing payments for any leases that don't have them
    for (const lease of leases) {
      const existingPayments = await Payment.countDocuments({ lease: lease._id });
      if (existingPayments === 0) {
        // No payments exist for this lease - generate them
        try {
          const propertyId = (lease as any).property?._id || (lease as any).property;
          const property = await Property.findById(propertyId).exec();
          
          if (property && property.pricePerMonth && property.paymentFrequency) {
            const startDate = new Date(lease.startDate);
            const endDate = new Date(lease.endDate);
            const monthsDuration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
            const paymentFrequency = property.paymentFrequency;
            const amountDue = property.pricePerMonth * paymentFrequency;
            const numPayments = Math.ceil(monthsDuration / paymentFrequency);

            for (let i = 0; i < numPayments; i++) {
              const dueDate = new Date(startDate);
              dueDate.setMonth(dueDate.getMonth() + i * paymentFrequency);

              // Only create if due date is within lease period
              if (dueDate <= endDate) {
                const payment = new Payment({
                  lease: lease._id,
                  amountDue,
                  amountPaid: 0,
                  dueDate,
                  paymentStatus: "pending",
                  months: paymentFrequency,
                });
                await payment.save();
              }
            }
            console.log(`[Auto-Generate] Generated ${numPayments} payments for lease ${lease._id}`);
          }
        } catch (err: any) {
          console.error(`[Auto-Generate] Failed to generate payments for lease ${lease._id}:`, err.message);
        }
      }
    }
    
    // Enrich leases with their payment records and proper property details
    const enriched = await Promise.all(
      leases.map(async (lease: any) => {
        const obj = lease.toObject ? lease.toObject() : lease;
        
        // Ensure property is properly populated
        if (obj.property && typeof obj.property === 'object') {
          // Property already populated
        } else if (obj.property) {
          // Property is just an ID, fetch it
          const propDoc = await Property.findById(obj.property).exec();
          obj.property = propDoc ? (propDoc.toObject ? propDoc.toObject() : propDoc) : null;
        }
        
        // Fetch and attach payments for this lease
        const payments = await Payment.find({ lease: lease._id }).exec();
        obj.payments = payments.map((p) => {
          const paymentObj = p.toObject ? p.toObject() : p;
          // Add property details to each payment for easy access in frontend
          paymentObj.propertyName = obj.property?.name || 'Unknown Property';
          paymentObj.propertyAddress = obj.property?.address || '';
          return paymentObj;
        });
        
        return obj;
      })
    );
    
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const addFavoriteProperty = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, propertyId } = req.params;
    const tenant = await Tenant.findOne({ cognitoId }).exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const property = await findPropertyByIdOrOriginal(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });
    const exists = tenant.favorites.some((f) => f.equals(property._id));
    if (exists) return res.status(409).json({ message: "Property already added as favorite" });
    tenant.favorites.push(property._id);
    await tenant.save();
    const populated = await tenant.populate("favorites");
    res.json(populated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const removeFavoriteProperty = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, propertyId } = req.params;
    const tenant = await Tenant.findOne({ cognitoId }).exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const property = await findPropertyByIdOrOriginal(propertyId);
    if (!property) return res.status(404).json({ message: "Property not found" });
    tenant.favorites = tenant.favorites.filter((f) => !f.equals(property._id));
    await tenant.save();
    const populated = await tenant.populate("favorites");
    res.json(populated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getSavedLocations = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const tenant = await Tenant.findOne({ cognitoId }).exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant.savedLocations || []);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const addSavedLocation = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const { title, placeId, coordinates } = req.body;
    const tenant = await Tenant.findOne({ cognitoId }).exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    tenant.savedLocations = tenant.savedLocations || [];
    if (placeId && tenant.savedLocations.some((s: any) => s.placeId === placeId)) {
      return res.status(409).json({ message: "Location already saved" });
    }

    tenant.savedLocations.push({ title, placeId, coordinates });
    await tenant.save();
    res.status(201).json(tenant.savedLocations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const removeSavedLocation = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, placeId } = req.params;
    const tenant = await Tenant.findOne({ cognitoId }).exec();
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    tenant.savedLocations = (tenant.savedLocations || []).filter((s: any) => s.placeId !== placeId);
    await tenant.save();
    res.json(tenant.savedLocations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
