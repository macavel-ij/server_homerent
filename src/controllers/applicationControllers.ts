import { Request, Response } from "express";
import mongoose from "mongoose";
import { Application } from "../models/applicationModel";
import { Property } from "../models/propertyModel";
import { Lease } from "../models/leaseModel";
import { Tenant } from "../models/tenantModel";
import { Manager } from "../models/managerModel";
import { Payment } from "../models/paymentModel";
import { createApplicationNotification, createNewApplicationNotificationForManager } from "../utils/notificationUtils";

async function generatePaymentsForLease(lease: any, property: any): Promise<void> {
  try {
    // Ensure paymentFrequency is a valid number
    let paymentFrequency = property.paymentFrequency;
    if (!paymentFrequency || isNaN(Number(paymentFrequency)) || Number(paymentFrequency) < 1) {
      paymentFrequency = 1; // Default to monthly if invalid
    } else {
      paymentFrequency = Number(paymentFrequency); // Convert to number if it's a string
    }
    
    const pricePerMonth = property.pricePerMonth || 0;
    const amountDue = pricePerMonth * paymentFrequency;

    console.log(`[Payment Generation] Starting for lease ${lease._id}`);
    console.log(`[Payment Generation] Property: ${property._id}, Frequency: ${paymentFrequency}, Price: ${pricePerMonth}, Amount Due: ${amountDue}`);

    if (!lease._id || !property._id) {
      console.error("[Payment Generation] ❌ Missing lease or property ID");
      return;
    }

    if (amountDue <= 0) {
      console.warn(`[Payment Generation] ⚠️ Invalid amount due: ${amountDue} (price: ${pricePerMonth}, freq: ${paymentFrequency})`);
      return;
    }

    // CHECK FOR EXISTING PAYMENTS TO PREVENT DUPLICATES
    const existingPayments = await Payment.find({ lease: lease._id }).exec();
    if (existingPayments.length > 0) {
      console.log(`[Payment Generation] ⏭️ Payments already exist for lease ${lease._id}. Skipping generation.`);
      return;
    }

    const leaseStartDate = new Date(lease.startDate);
    const leaseEndDate = new Date(lease.endDate);
    const leaseMonths =
      (leaseEndDate.getFullYear() - leaseStartDate.getFullYear()) * 12 +
      (leaseEndDate.getMonth() - leaseStartDate.getMonth());

    const numPaymentPeriods = Math.ceil(leaseMonths / paymentFrequency);

    console.log(`[Payment Generation] Lease duration: ${leaseMonths} months, Payment periods: ${numPaymentPeriods}`);

    let createdCount = 0;
    for (let i = 0; i < numPaymentPeriods; i++) {
      const dueDate = new Date(leaseStartDate);
      dueDate.setMonth(dueDate.getMonth() + i * paymentFrequency);

      if (dueDate > leaseEndDate) break;

      const payment = new Payment({
        lease: lease._id,
        amountDue,
        amountPaid: 0,
        dueDate,
        paymentStatus: "pending",
        months: paymentFrequency,
        paymentMethod: null,
        paymentDate: null,
      });

      await payment.save();
      createdCount++;
    }

    console.log(`[Payment Generation] ✅ Successfully generated ${createdCount} payment records for lease ${lease._id}`);
  } catch (error) {
    console.error("[Payment Generation] ❌ Error:", error);
  }
}

export const listApplications = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { userId, userType } = req.query as any;
    const filter: any = {};
    if (userId && userType) {
      if (userType === "tenant") {
        filter.tenantCognitoId = String(userId);
      } else if (userType === "manager") {
        const props = await Property.find({ managerCognitoId: String(userId) }).select("_id").exec();
        filter.property = { $in: props.map((p) => p._id) };
      }
    }

    const applications = await Application.find(filter)
      .populate({ path: "property", populate: { path: "location" } })
      .exec();

    const results = await Promise.all(
      applications.map(async (app) => {
        const lease = app.lease ? await Lease.findById(app.lease).exec() : null;
        const tenant = await Tenant.findOne({ cognitoId: app.tenantCognitoId }).exec();
        // Attempt to resolve the manager contact from the property's managerCognitoId
        let manager = null;
        try {
          const prop = (app as any).property as any;
          const managerCognitoId = prop?.managerCognitoId;
          if (managerCognitoId) {
            manager = await Manager.findOne({ cognitoId: managerCognitoId }).exec();
          }
        } catch (e) {
          // ignore and leave manager null
        }
        const appObj = app.toObject();
        // ensure property.location is fully included (if populated above it will be an object)
        return {
          ...appObj,
          property: appObj.property,
          lease,
          tenant,
          manager,
        };
      })
    );

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createApplication = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const {
      applicationDate,
      status,
      propertyId,
      tenantCognitoId,
      name,
      email,
      phoneNumber,
      message,
      rentalMonths,
    } = req.body;

    const property = await (mongoose.Types.ObjectId.isValid(propertyId) ? Property.findById(propertyId).exec() : Property.findOne({ originalId: Number(propertyId) }).exec());
    if (!property) return res.status(404).json({ message: "Property not found" });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (rentalMonths || 12));

    const lease = new Lease({
      startDate,
      endDate,
      rent: property.pricePerMonth,
      deposit: (property as any).securityDeposit || 0,
      property: property._id,
      tenantCognitoId,
    } as any);
    await lease.save();

    // Generate payment records for the lease
    await generatePaymentsForLease(lease, property);

    const application = new Application({
      applicationDate: applicationDate ? new Date(applicationDate) : new Date(),
      status,
      property: property._id,
      tenantCognitoId,
      name,
      email,
      phoneNumber,
      message,
      lease: lease._id,
    } as any);

    await application.save();

    // Create notification for manager about new application
    const managerCognitoId = (property as any)?.managerCognitoId;
    if (managerCognitoId) {
      const propertyName = (property as any)?.title || "Property";
      console.log("[Application] Triggering notification for manager about new application:", {
        managerId: managerCognitoId,
        tenantName: name,
        propertyName,
        applicationId: application._id.toString(),
      });
      await createNewApplicationNotificationForManager(
        managerCognitoId,
        application._id.toString(),
        name,
        propertyName
      );
    }

    // populate property and lease before returning so client gets full details
    const populated = await Application.findById(application._id)
      .populate({ path: "property", populate: { path: "location" } })
      .populate("lease")
      .exec();

    // also include tenant and manager objects for convenience
    const tenantObj = await Tenant.findOne({ cognitoId: populated?.tenantCognitoId }).exec();
    let managerObj = null;
    try {
      const managerCognitoId = (populated as any)?.property?.managerCognitoId;
      if (managerCognitoId) managerObj = await Manager.findOne({ cognitoId: managerCognitoId }).exec();
    } catch (e) {}

    res.status(201).json({ ...populated?.toObject(), tenant: tenantObj, manager: managerObj });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateApplicationStatus = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { status, rentalMonths } = req.body;

    if (!id || !status) {
      return res.status(400).json({ message: "Application ID and status are required" });
    }

    const app = await Application.findById(id).populate("property").exec();
    if (!app) return res.status(404).json({ message: "Application not found" });

    if (status === "Approved") {
      const property = app.property as any;
      
      // If application is already approved, delete the old lease and payments
      if (app.status === "Approved" && app.lease) {
        try {
          await Payment.deleteMany({ lease: app.lease }).exec();
          await Lease.findByIdAndDelete(app.lease).exec();
        } catch (e) {
          console.log("Note: Could not delete old lease, proceeding with new lease creation");
        }
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + (rentalMonths || 12));

      const newLease = new Lease({
        startDate,
        endDate,
        rent: property.pricePerMonth,
        deposit: (property as any).securityDeposit || 0,
        property: property._id,
        tenantCognitoId: app.tenantCognitoId,
      } as any);
      await newLease.save();

      // Generate payment records for the lease
      await generatePaymentsForLease(newLease, property);

      await Property.findByIdAndUpdate(property._id, { $addToSet: { tenants: app.tenantCognitoId } }).exec();

      app.status = status;
      app.lease = newLease._id;
      await app.save();
    } else {
      app.status = status;
      await app.save();
    }

    // Create notification for tenant
    const property = app.property as any;
    const propertyName = property?.address || property?.name || "Property";
    console.log("[Application] Triggering notification for status change:", {
      tenantId: app.tenantCognitoId,
      status,
      propertyName,
      applicationId: app._id.toString(),
    });
    await createApplicationNotification(
      app.tenantCognitoId,
      app._id.toString(),
      status,
      propertyName
    );

    const updated = await Application.findById(app._id)
      .populate({ path: "property", populate: { path: "location" } })
      .populate("lease")
      .exec();

    // Include tenant and manager info like other endpoints do
    const tenant = await Tenant.findOne({ cognitoId: updated?.tenantCognitoId }).exec();
    let manager = null;
    try {
      const managerCognitoId = (updated as any)?.property?.managerCognitoId;
      if (managerCognitoId) {
        manager = await Manager.findOne({ cognitoId: managerCognitoId }).exec();
      }
    } catch (e) {
      // ignore
    }

    const result = { ...updated?.toObject(), tenant, manager };
    res.json(result);
  } catch (err: any) {
    console.error("Error updating application status:", err);
    res.status(500).json({ message: err.message || "Failed to update application status" });
  }
};

export const generatePaymentsForExistingLeases = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    console.log("[Admin Endpoint] Starting payment generation for existing leases...");
    
    // Find all leases
    const allLeases = await Lease.find().populate("property").exec();
    console.log(`[Admin Endpoint] Found ${allLeases.length} total leases`);

    let leasesProcessed = 0;
    let paymentsCreated = 0;
    let leasesSkipped = 0;

    for (const lease of allLeases) {
      try {
        // Check if lease already has payments
        const existingPayments = await Payment.countDocuments({ lease: lease._id });

        if (existingPayments > 0) {
          console.log(`[Admin Endpoint] Lease ${lease._id} already has ${existingPayments} payments - skipping`);
          leasesSkipped++;
          continue;
        }

        const property = lease.property as any;

        // Validate property
        if (!property) {
          console.log(`[Admin Endpoint] ⚠️  Lease ${lease._id} has no property - skipping`);
          continue;
        }

        const paymentFrequency = property.paymentFrequency || 1;
        const pricePerMonth = property.pricePerMonth || 0;

        if (!paymentFrequency || !pricePerMonth) {
          console.log(`[Admin Endpoint] ⚠️  Property ${property._id} (${property.name}) missing config - skipping`);
          continue;
        }

        // Generate payments
        const amountDue = pricePerMonth * paymentFrequency;
        const leaseStartDate = new Date(lease.startDate);
        const leaseEndDate = new Date(lease.endDate);
        const leaseMonths =
          (leaseEndDate.getFullYear() - leaseStartDate.getFullYear()) * 12 +
          (leaseEndDate.getMonth() - leaseStartDate.getMonth());

        const numPaymentPeriods = Math.ceil(leaseMonths / paymentFrequency);

        console.log(`[Admin Endpoint] Generating ${numPaymentPeriods} payments for lease ${lease._id} (${property.name})`);

        for (let i = 0; i < numPaymentPeriods; i++) {
          const dueDate = new Date(leaseStartDate);
          dueDate.setMonth(dueDate.getMonth() + i * paymentFrequency);

          if (dueDate > leaseEndDate) break;

          const payment = new Payment({
            lease: lease._id,
            amountDue,
            amountPaid: 0,
            dueDate,
            paymentStatus: "pending",
            months: paymentFrequency,
            paymentMethod: null,
            paymentDate: null,
          });

          await payment.save();
          paymentsCreated++;
        }

        leasesProcessed++;
      } catch (leaseError) {
        console.error(`[Admin Endpoint] Error processing lease ${lease._id}:`, leaseError);
      }
    }

    const summary = {
      totalLeases: allLeases.length,
      leasesProcessed,
      paymentsCreated,
      leasesSkipped,
    };

    console.log(`[Admin Endpoint] ✅ Complete!`, summary);
    res.json({
      success: true,
      message: "Payment generation completed",
      ...summary,
    });
  } catch (err: any) {
    console.error("[Admin Endpoint] ❌ Error:", err);
    res.status(500).json({ message: err.message || "Failed to generate payments" });
  }
};
