import { Request, Response } from "express";
import { Lease } from "../models/leaseModel";
import { Tenant } from "../models/tenantModel";
import { Payment } from "../models/paymentModel";
import { Property } from "../models/propertyModel";

export const getLeases = async (req: Request, res: Response): Promise<void> => {
  try {
    const leases = await Lease.find()
      .populate({ path: "property" })
      .populate({ path: "tenant" })
      .exec();
    
    // Auto-generate missing payments for any leases that don't have them
    for (const lease of leases) {
      const existingPayments = await Payment.find({ lease: lease._id }).exec();
      if (existingPayments.length === 0) {
        try {
          const property = await Property.findById((lease as any).property?._id || (lease as any).property).exec();
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
          }
        } catch (err) {
          // Silently continue if auto-generation fails
        }
      }
    }
    
    // Enrich with tenant info and payments
    const enriched = await Promise.all(
      leases.map(async (lease: any) => {
        const obj = lease.toObject ? lease.toObject() : lease;
        // If tenant field is empty but tenantCognitoId exists, fetch tenant details
        if (!obj.tenant && obj.tenantCognitoId) {
          const tenantDoc = await Tenant.findOne({ cognitoId: obj.tenantCognitoId }).exec();
          if (tenantDoc) {
            obj.tenant = tenantDoc.toObject ? tenantDoc.toObject() : tenantDoc;
          }
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

export const getPropertyLeases = async (req: Request, res: Response): Promise<void> => {
  try {
    const { propertyId } = req.params;
    const leases = await Lease.find({ property: propertyId })
      .populate({ path: "property" })
      .populate({ path: "tenant" })
      .exec();
    
    // Auto-generate missing payments for any leases that don't have them
    for (const lease of leases) {
      const existingPayments = await Payment.find({ lease: lease._id }).exec();
      if (existingPayments.length === 0) {
        try {
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
          }
        } catch (err) {
          // Silently continue if auto-generation fails
        }
      }
    }
    
    // Enrich with tenant info and payments with calculated status
    const enriched = await Promise.all(
      leases.map(async (lease: any) => {
        const obj = lease.toObject ? lease.toObject() : lease;
        // If tenant field is empty but tenantCognitoId exists, fetch tenant details
        if (!obj.tenant && obj.tenantCognitoId) {
          const tenantDoc = await Tenant.findOne({ cognitoId: obj.tenantCognitoId }).exec();
          if (tenantDoc) {
            obj.tenant = tenantDoc.toObject ? tenantDoc.toObject() : tenantDoc;
          }
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
        
        // Calculate aggregated payment status for the lease
        if (obj.payments && obj.payments.length > 0) {
          const allPaid = obj.payments.every((p: any) => String(p.paymentStatus || "").toLowerCase() === "paid");
          const anyPaid = obj.payments.some((p: any) => String(p.paymentStatus || "").toLowerCase() === "paid");
          obj.aggregatedPaymentStatus = allPaid ? "paid" : anyPaid ? "partial" : "unpaid";
          
          // Calculate total months paid
          obj.monthsPaid = obj.payments
            .filter((p: any) => String(p.paymentStatus || "").toLowerCase() === "paid")
            .reduce((sum: number, p: any) => sum + (p.months || 1), 0);
        }
        
        return obj;
      })
    );
    
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getLeasePayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const payments = await Payment.find({ lease: id })
      .sort({ paymentDate: -1, createdAt: -1 })
      .exec();
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const checkPropertyOccupancy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { propertyId } = req.params;
    
    // Check for active leases (lease period that hasn't ended yet)
    const now = new Date();
    const activeLease = await Lease.findOne({
      property: propertyId,
      endDate: { $gte: now }, // Lease hasn't ended yet
    }).exec();

    const isOccupied = !!activeLease;
    
    res.json({ 
      isOccupied,
      leaseId: activeLease?._id || null,
      tenant: activeLease?.tenantCognitoId || null,
      endDate: activeLease?.endDate || null,
      message: isOccupied ? "This property is currently rented" : "This property is available"
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
