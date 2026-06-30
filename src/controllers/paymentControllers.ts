import { Request, Response } from "express";
import { Payment } from "../models/paymentModel";
import { Lease } from "../models/leaseModel";
import { Application } from "../models/applicationModel";
import { Tenant } from "../models/tenantModel";
import { Manager } from "../models/managerModel";
import { createPaymentNotification, createPaymentNotificationForManager } from "../utils/notificationUtils";

export const getPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leaseId } = req.params;

    if (!leaseId) {
      res.status(400).json({ message: "leaseId is required" });
      return;
    }

    const payments = await Payment.find({ lease: leaseId })
      .populate({
        path: "lease",
        populate: {
          path: "property",
          select: "_id title pricePerMonth acceptedPaymentMethods paymentFrequency location",
          populate: {
            path: "location",
            select: "address city state country postalCode",
          },
        },
      })
      .sort({ paymentDate: -1, createdAt: -1 })
      .exec();

    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leaseId, amountDue, amountPaid, dueDate, paymentStatus, paymentMethod, months } = req.body;

    if (!leaseId || amountDue === undefined) {
      res.status(400).json({ message: "leaseId and amountDue are required" });
      return;
    }

    const lease = await Lease.findById(leaseId).exec();
    if (!lease) {
      res.status(404).json({ message: "Lease not found" });
      return;
    }

    // Determine payment status automatically based on amounts
    const newAmountPaid = amountPaid || 0;
    let finalPaymentStatus = paymentStatus || "pending";
    
    if (newAmountPaid >= amountDue) {
      finalPaymentStatus = "paid";
    } else if (newAmountPaid > 0) {
      finalPaymentStatus = "partial";
    } else {
      finalPaymentStatus = "pending";
    }

    const payment = new Payment({
      lease: leaseId,
      amountDue,
      amountPaid: newAmountPaid,
      dueDate: dueDate || new Date(),
      paymentStatus: finalPaymentStatus,
      paymentMethod: paymentMethod || "credit_card",
      months: months || 1,
      paymentDate: newAmountPaid > 0 ? new Date() : undefined,
    });

    await payment.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate({
        path: "lease",
      })
      .populate({
        path: "lease.property",
        select: "_id title pricePerMonth acceptedPaymentMethods paymentFrequency location",
      })
      .populate({
        path: "lease.property.location",
        select: "address city state country postalCode",
      })
      .exec();

    res.status(201).json(populatedPayment);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updatePayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { amountPaid, paymentStatus, paymentMethod, paymentDate } = req.body;

    if (!paymentId) {
      res.status(400).json({ message: "paymentId is required" });
      return;
    }

    // Get the current payment to check amounts
    const currentPayment = await Payment.findById(paymentId).exec();
    if (!currentPayment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    // Determine the new payment status automatically if amountPaid is being updated
    let newPaymentStatus = paymentStatus;
    let newPaymentDate = paymentDate;
    
    if (amountPaid !== undefined) {
      const newAmountPaid = amountPaid;
      const amountDue = currentPayment.amountDue || 0;

      if (newAmountPaid >= amountDue) {
        newPaymentStatus = "paid";
        newPaymentDate = new Date(); // Set payment date when paid
      } else if (newAmountPaid > 0) {
        newPaymentStatus = "partial";
        newPaymentDate = new Date();
      } else {
        newPaymentStatus = "pending";
      }
    }

    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        ...(amountPaid !== undefined && { amountPaid }),
        ...(newPaymentStatus && { paymentStatus: newPaymentStatus }),
        ...(paymentMethod && { paymentMethod }),
        ...(newPaymentDate && { paymentDate: newPaymentDate }),
      },
      { new: true }
    )
      .populate({
        path: "lease",
        populate: {
          path: "property",
          select: "_id title name address pricePerMonth acceptedPaymentMethods paymentFrequency location managerCognitoId",
        },
      })
      .exec();

    if (!payment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    // Create notification if payment status changed to paid/successful
    if (newPaymentStatus === "paid" || newPaymentStatus === "successful") {
      const lease = await Lease.findById(payment.lease).exec();
      if (lease) {
        const propertyName = (payment.lease as any)?.property?.name || 
                           (payment.lease as any)?.property?.address || 
                           "Property";
        const amountValue = amountPaid || currentPayment.amountPaid || 0;
        
        console.log("[Payment] Triggering notification for payment status:", {
          tenantId: lease.tenantCognitoId,
          status: newPaymentStatus,
          amount: amountValue,
          propertyName,
          paymentId: payment._id.toString(),
        });
        
        // Notify tenant about successful payment
        await createPaymentNotification(
          lease.tenantCognitoId,
          payment._id.toString(),
          newPaymentStatus,
          amountValue,
          propertyName
        );

        // Notify manager about tenant payment
        const tenant = await Tenant.findOne({ cognitoId: lease.tenantCognitoId }).exec();
        const tenantName = tenant?.name || "Tenant";
        
        const property = (payment.lease as any)?.property;
        if (property?.managerCognitoId) {
          console.log("[Payment] Triggering notification for manager about tenant payment:", {
            managerId: property.managerCognitoId,
            tenantName,
            amount: amountValue,
            propertyName,
            paymentId: payment._id.toString(),
            propertyId: property._id?.toString(),
          });
          
          await createPaymentNotificationForManager(
            property.managerCognitoId,
            payment._id.toString(),
            tenantName,
            amountValue,
            propertyName,
            newPaymentStatus,
            property._id?.toString()
          );
        }
      }
    }

    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getTenantPayments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tenantCognitoId } = req.params;

    if (!tenantCognitoId) {
      res.status(400).json({ message: "tenantCognitoId is required" });
      return;
    }

    console.log(`\n[getTenantPayments] START - tenantCognitoId: ${tenantCognitoId}`);

    // Step 1: Get approved applications with all data
    const approvedApps = await Application.find({
      tenantCognitoId,
      status: "Approved",
    })
      .populate("lease")
      .populate("property")
      .exec();

    console.log(`[getTenantPayments] Found ${approvedApps.length} approved applications`);

    // Step 2: Enrich with location data for each property
    for (let app of approvedApps) {
      if (app.property && typeof (app.property as any)._id === "string" || (app.property as any)._id) {
        const Property = require("../models/propertyModel").Property;
        const Location = require("../models/locationModel").Location;
        
        const prop = await Property.findById((app.property as any)._id)
          .populate("location")
          .lean()
          .exec();
        
        if (prop) {
          app.property = prop as any;
          console.log(
            `[Property Enrichment] ${(app.property as any).title}: location fetched = ${!!(app.property as any).location}`
          );
        }
      }
    }

    // Step 3: Deduplicate by property - keep only one lease per property (most recent)
    const propertyMap = new Map();

    approvedApps.forEach((app) => {
      if (!app.lease || !app.property) {
        console.log(`[Skip] Missing lease or property`);
        return;
      }

      const property = app.property as any;
      const propertyId = property._id?.toString();
      const leaseId = (app.lease as any)?._id?.toString();
      const leaseStartDate = (app.lease as any)?.startDate
        ? new Date((app.lease as any).startDate).getTime()
        : 0;

      if (!propertyId || !leaseId) {
        console.log(`[Skip] Missing propertyId or leaseId`);
        return;
      }

      console.log(`[Processing] Property: "${property.title}", Lease: ${leaseId}`);

      const existing = propertyMap.get(propertyId);

      // Keep the most recent lease for this property
      if (!existing || leaseStartDate > existing.leaseStartDate) {
        propertyMap.set(propertyId, {
          propertyId,
          leaseId,
          lease: app.lease,
          property: app.property,
          location: property.location,
          leaseStartDate,
        });
        if (existing) {
          console.log(
            `[Dedupe] Property "${property.title}": replacing lease ${existing.leaseId} with ${leaseId}`
          );
        } else {
          console.log(`[Dedupe] Property "${property.title}": added lease ${leaseId}`);
        }
      } else {
        console.log(
          `[Dedupe] Property "${property.title}": skipping older lease ${leaseId}`
        );
      }
    });

    const uniqueProperties = Array.from(propertyMap.values());
    const uniqueLeaseIds = uniqueProperties.map((p) => p.leaseId);

    console.log(
      `[getTenantPayments] Deduplicated: ${approvedApps.length} → ${uniqueProperties.length} properties`
    );

    if (uniqueProperties.length === 0) {
      console.log(`[getTenantPayments] No properties found`);
      res.json({ leases: [], payments: [] });
      return;
    }

    // Step 4: Get all payments for unique leases
    const allPayments = await Payment.find({
      lease: { $in: uniqueLeaseIds },
    })
      .sort({ createdAt: -1 })
      .exec();

    console.log(`[getTenantPayments] Found ${allPayments.length} payments for ${uniqueLeaseIds.length} leases`);
    console.log(`[getTenantPayments] Consolidating multiple payments per lease...`);

    // Step 5: Consolidate all payments by lease - sum months and amounts
    const paymentsByLease = new Map();

    allPayments.forEach((payment) => {
      const leaseId = payment.lease.toString();
      const existing = paymentsByLease.get(leaseId);

      if (!existing) {
        // First payment for this lease
        paymentsByLease.set(leaseId, {
          _id: payment._id,
          lease: payment.lease,
          amountDue: payment.amountDue || 0,
          amountPaid: payment.amountPaid || 0,
          months: payment.months || 1,
          dueDate: payment.dueDate,
          paymentDate: payment.paymentDate,
          paymentStatus: payment.paymentStatus || "pending",
          paymentMethod: payment.paymentMethod,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          totalPayments: 1, // Track how many payments were consolidated
        });
      } else {
        // Consolidate additional payments - sum amounts and months
        existing.amountDue += payment.amountDue || 0;
        existing.amountPaid += payment.amountPaid || 0;
        existing.months += payment.months || 1;
        existing.totalPayments += 1;
        
        // Use earliest dueDate or pending status for the consolidated entry
        if (payment.dueDate && (!existing.dueDate || new Date(payment.dueDate) < new Date(existing.dueDate))) {
          existing.dueDate = payment.dueDate;
        }
        
        // If any payment is pending, mark consolidated as pending
        if (String(payment.paymentStatus || "").toLowerCase() === "pending") {
          existing.paymentStatus = "pending";
        }
      }
    });

    // Step 6: Build final response - one entry per unique property with consolidated payments
    const leasesWithPayments = await Promise.all(
      uniqueProperties.map(async (propData) => {
        const property = propData.property as any;
        const location = propData.location as any;
        const leaseId = propData.leaseId;
        const consolidatedPayment = paymentsByLease.get(leaseId);

        // Ensure we have property info
        const propertyTitle = property?.title || "Unknown Property";
        const propertyAddress = location?.address || "Address not available";
        const pricePerMonth = property?.pricePerMonth || 0;

        // Fetch manager details if managerCognitoId exists
        let managerInfo = null;
        if (property?.managerCognitoId) {
          try {
            const Manager = require("../models/managerModel").Manager;
            const manager = await Manager.findOne({ cognitoId: property.managerCognitoId })
              .select("name email phoneNumber")
              .lean()
              .exec();
            
            if (manager) {
              managerInfo = {
                name: manager.name || "Property Manager",
                email: manager.email || "",
                phoneNumber: manager.phoneNumber || "",
              };
              console.log(`[Manager] Fetched manager for property "${propertyTitle}": ${managerInfo.name}`);
            }
          } catch (err) {
            console.log(`[Manager] Error fetching manager for property: ${err}`);
          }
        }

        console.log(
          `[Output] Property: "${propertyTitle}" @ "${propertyAddress}", Consolidated Payment: ${consolidatedPayment?._id}, Months: ${consolidatedPayment?.months}, Total Amount Due: $${consolidatedPayment?.amountDue}`
        );

        const paymentObj = consolidatedPayment ? consolidatedPayment : null;

        return {
          _id: leaseId,
          lease: leaseId,
          property: {
            _id: property._id,
            title: propertyTitle,
            address: propertyAddress,
            city: location?.city || "",
            state: location?.state || "",
            pricePerMonth: pricePerMonth,
            paymentFrequency: property?.paymentFrequency || 1,
            acceptedPaymentMethods: property?.acceptedPaymentMethods || ["credit_card"],
          },
          manager: managerInfo,
          payments: paymentObj
            ? [
                {
                  ...paymentObj,
                  propertyName: propertyTitle,
                  propertyAddress: propertyAddress,
                  pricePerMonth: pricePerMonth,
                  acceptedPaymentMethods: property?.acceptedPaymentMethods || ["credit_card"],
                  manager: managerInfo, // Include manager info in payment
                },
              ]
            : [],
          startDate: propData.lease?.startDate,
          endDate: propData.lease?.endDate,
          rent: propData.lease?.rent,
          tenant: propData.lease?.tenant,
        };
      })
    );

    // Step 6.5: CRITICAL FIX - Ensure each lease has EXACTLY ONE consolidated payment
    // This prevents duplicate property entries in the frontend table
    const finalLeasesWithPayments = leasesWithPayments.map((lease) => {
      // Consolidate all payments for this lease into a single payment object
      if (lease.payments && lease.payments.length > 0) {
        const allPayments = lease.payments;
        let consolidatedPayment = { ...allPayments[0] }; // Start with first payment (copy)
        
        // Get property's paymentFrequency for recalculation
        const propertyPaymentFrequency = Number(lease.property?.paymentFrequency) || 1;
        const pricePerMonth = Number(lease.property?.pricePerMonth) || 0;
        
        console.log(`[DEBUG] Consolidation start for ${lease.property?.title}`);
        console.log(`  - propertyPaymentFrequency: ${propertyPaymentFrequency} (type: ${typeof propertyPaymentFrequency})`);
        console.log(`  - pricePerMonth: ${pricePerMonth} (type: ${typeof pricePerMonth})`);
        
        // ⚡ ALWAYS set months to property's paymentFrequency (what manager set)
        consolidatedPayment.months = propertyPaymentFrequency;
        
        // ⚡ RECALCULATE amountDue = pricePerMonth × monthsCovered
        consolidatedPayment.amountDue = pricePerMonth * propertyPaymentFrequency;
        consolidatedPayment.pricePerMonth = pricePerMonth;
        
        console.log(`  - Single payment amountDue: ${consolidatedPayment.amountDue} (${pricePerMonth} × ${propertyPaymentFrequency})`);
        
        // ⚡ Ensure acceptedPaymentMethods is from property (not old payment data)
        consolidatedPayment.acceptedPaymentMethods = 
          lease.property?.acceptedPaymentMethods || 
          allPayments[0].acceptedPaymentMethods || 
          ["credit_card"];
        
        // If there are multiple payments, sum them up
        if (allPayments.length > 1) {
          console.log(`  - Processing ${allPayments.length} payments for consolidation`);
          let totalAmountDue = 0;
          let totalAmountPaid = 0;
          // ⚡ Months Covered = property's paymentFrequency (what manager set), NOT sum
          let totalMonths = propertyPaymentFrequency; // Each payment covers this many months
          let earliestDueDate = allPayments[0].dueDate;
          let latestPaymentDate: Date | undefined = undefined;

          allPayments.forEach((p) => {
            totalAmountPaid += Number(p.amountPaid) || 0;

            if (p.paymentDate) {
              const pd = new Date(p.paymentDate);
              if (!latestPaymentDate || pd > latestPaymentDate) latestPaymentDate = pd;
            }

            if (p.dueDate && new Date(p.dueDate) < new Date(earliestDueDate)) {
              earliestDueDate = p.dueDate;
            }
          });

          // ⚡ RECALCULATE amountDue = pricePerMonth × monthsCovered (use pricePerMonth from property)
          totalAmountDue = Number(pricePerMonth) * Number(totalMonths);
          
          console.log(`  - Multi-payment consolidation: ${Number(pricePerMonth)} × ${Number(totalMonths)} = ${totalAmountDue}`);

          // Ensure totalMonths has a sensible value (minimum 1)
          if (!totalMonths || totalMonths < 1) {
            totalMonths = propertyPaymentFrequency; // Fallback: use property frequency
            totalAmountDue = Number(pricePerMonth) * Number(totalMonths); // Recalculate with fallback
          }

          // Determine consolidated paymentStatus from totals (not from presence of any pending row)
          let consolidatedStatus = "pending";
          if (totalAmountPaid >= totalAmountDue && totalAmountDue > 0) {
            consolidatedStatus = "paid";
          } else if (totalAmountPaid > 0) {
            consolidatedStatus = "partial";
          }

          consolidatedPayment = {
            _id: allPayments[0]._id,
            amountDue: totalAmountDue,
            amountPaid: totalAmountPaid,
            months: totalMonths,  // ← Always property.paymentFrequency (what manager set)
            dueDate: earliestDueDate,
            paymentDate: latestPaymentDate,
            paymentStatus: consolidatedStatus,
            propertyName: allPayments[0].propertyName,
            propertyAddress: allPayments[0].propertyAddress,
            pricePerMonth: pricePerMonth,
            // ⚡ Get acceptedPaymentMethods from property, not from old payment record
            acceptedPaymentMethods: lease.property?.acceptedPaymentMethods || allPayments[0].acceptedPaymentMethods || ["credit_card"],
            paymentMethod: allPayments[0].paymentMethod,
            createdAt: allPayments[0].createdAt,
            updatedAt: allPayments[0].updatedAt,
          };
          
          console.log(
            `[Consolidation] Property "${consolidatedPayment.propertyName}": ${allPayments.length} payments consolidated, Each covers: ${propertyPaymentFrequency} months (manager's frequency), Total Due: $${totalAmountDue}`
          );
        } else {
          // For single payment, recalculate status based on amountPaid vs amountDue
          console.log(
            `  - Single payment only: 1 payment, Months: ${propertyPaymentFrequency}, Amount Due: ${consolidatedPayment.amountDue}, Amount Paid: ${consolidatedPayment.amountPaid}`
          );
          
          let consolidatedStatus = "pending";
          if (Number(consolidatedPayment.amountPaid) >= Number(consolidatedPayment.amountDue) && Number(consolidatedPayment.amountDue) > 0) {
            consolidatedStatus = "paid";
          } else if (Number(consolidatedPayment.amountPaid) > 0) {
            consolidatedStatus = "partial";
          }
          
          consolidatedPayment.paymentStatus = consolidatedStatus;
          
          console.log(
            `  - Single payment status recalculated: ${consolidatedStatus} (Paid: ${consolidatedPayment.amountPaid} vs Due: ${consolidatedPayment.amountDue})`
          );
        }

        return {
          ...lease,
          payments: [consolidatedPayment], // Only ONE payment per lease
        };
      }
      return lease;
    });

    console.log(
      `[getTenantPayments] Total Entries: ${finalLeasesWithPayments.length} leases with single consolidated payment each`
    );

    // Step 7: Build enriched payments (for backward compatibility)
    const enrichedPayments = finalLeasesWithPayments.flatMap((lease) =>
      lease.payments.map((p) => ({
        ...p,
        lease: lease.lease,
      }))
    );

    console.log(
      `[getTenantPayments] COMPLETE - ${finalLeasesWithPayments.length} properties, ${enrichedPayments.length} payments\n`
    );

    res.json({
      leases: finalLeasesWithPayments,
      payments: enrichedPayments,
    });
  } catch (err: any) {
    console.error("[getTenantPayments Error]", err);
    res.status(500).json({ message: err.message });
  }
};

export const getLeasePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { leaseId } = req.params;

    if (!leaseId) {
      res.status(400).json({ message: "leaseId is required" });
      return;
    }

    // Get all payments for this lease
    const payments = await Payment.find({ lease: leaseId }).exec();

    if (payments.length === 0) {
      res.json({
        leaseId,
        paymentStatus: "no_payments",
        totalPaid: 0,
        totalDue: 0,
        allPaymentsPaid: false,
      });
      return;
    }

    // Calculate totals
    const totalDue = payments.reduce((sum, p) => sum + (p.amountDue || 0), 0);
    const totalPaid = payments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
    const allPaymentsPaid = payments.every((p) => p.paymentStatus === "paid");
    const anyPaymentPaid = payments.some((p) => p.paymentStatus === "paid");
    
    let paymentStatus = "pending";
    if (allPaymentsPaid) {
      paymentStatus = "fully_paid";
    } else if (anyPaymentPaid) {
      paymentStatus = "partially_paid";
    }

    res.json({
      leaseId,
      paymentStatus,
      totalPaid,
      totalDue,
      allPaymentsPaid,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
