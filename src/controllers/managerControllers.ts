import { Request, Response } from "express";
import { Manager } from "../models/managerModel";
import { Property } from "../models/propertyModel";
import { Lease } from "../models/leaseModel";
import { Payment } from "../models/paymentModel";
import { Tenant } from "../models/tenantModel";
import { Application } from "../models/applicationModel";

export const getManager = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    // Allow fetching by cognitoId or by Mongo _id (some properties store managerId)
    const manager = await Manager.findOne({ $or: [{ cognitoId }, { _id: cognitoId }] }).exec();
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    // Normalize response so client always gets username, name and phoneNumber
    const mgr = manager.toObject ? manager.toObject() : manager;
    const username = mgr.email ? String(mgr.email).split("@")[0] : undefined;

    res.json({
      id: mgr._id,
      cognitoId: mgr.cognitoId,
      username,
      name: mgr.name,
      email: mgr.email,
      phoneNumber: mgr.phoneNumber,
      savedLocations: mgr.savedLocations || [],
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createManager = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, name, email, phoneNumber } = req.body;
    const existing = await Manager.findOne({ cognitoId }).exec();
    if (existing) return res.status(409).json({ message: "Manager already exists" });
    const manager = new Manager({ cognitoId, name, email, phoneNumber });
    await manager.save();
    res.status(201).json(manager);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateManager = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const { name, email, phoneNumber } = req.body;
    // Allow updating by cognitoId or Mongo _id
    const updated = await Manager.findOneAndUpdate(
      { $or: [{ cognitoId }, { _id: cognitoId }] },
      { name, email, phoneNumber },
      { new: true }
    ).exec();
    if (!updated) return res.status(404).json({ message: "Manager not found" });

    const mgr = updated.toObject ? updated.toObject() : updated;
    const username = mgr.email ? String(mgr.email).split("@")[0] : undefined;
    res.json({
      id: mgr._id,
      cognitoId: mgr.cognitoId,
      username,
      name: mgr.name,
      email: mgr.email,
      phoneNumber: mgr.phoneNumber,
      savedLocations: mgr.savedLocations || [],
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getManagerProperties = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    
    // Fetch all properties for this manager
    const properties = await Property.find({ managerCognitoId: cognitoId })
      .populate("location")
      .sort({ createdAt: -1 })
      .exec();

    // Get property IDs
    const propertyIds = properties.map((p) => p._id);

    // Fetch ONLY APPROVED applications for these properties
    const approvedApplications = await Application.find({
      property: { $in: propertyIds },
      status: "Approved"
    }).exec();

    // Extract lease IDs from approved applications
    const approvedLeaseIds = approvedApplications
      .filter((app) => app.lease)
      .map((app) => app.lease);

    // Fetch leases ONLY for approved applications
    const leases = await Lease.find({ _id: { $in: approvedLeaseIds } })
      .populate({
        path: "tenant",
        select: "name email cognitoId _id photoUrl"
      })
      .exec();

    // Get lease IDs
    const leaseIds = leases.map((l) => l._id);

    // Fetch all payments for these approved leases
    const payments = await Payment.find({ lease: { $in: leaseIds } })
      .select("amountDue amountPaid paymentStatus dueDate paymentDate months lease _id")
      .exec();

    // Group payments by lease ID for efficient lookup
    const paymentsByLeaseId = new Map();
    payments.forEach((payment) => {
      const leaseIdStr = String(payment.lease);
      if (!paymentsByLeaseId.has(leaseIdStr)) {
        paymentsByLeaseId.set(leaseIdStr, []);
      }
      paymentsByLeaseId.get(leaseIdStr).push(payment);
    });

    // Get all unique tenantCognitoIds to fetch tenant data as fallback
    const tenantCognitoIds = leases
      .map((l: any) => l.tenantCognitoId)
      .filter((id: string | null) => id != null);

    const tenantsByIdMap = new Map();
    if (tenantCognitoIds.length > 0) {
      const tenants = await Tenant.find({ cognitoId: { $in: tenantCognitoIds } })
        .select("name email cognitoId _id photoUrl")
        .exec();
      
      tenants.forEach((t) => {
        tenantsByIdMap.set(String(t.cognitoId), t);
      });
    }

    // Convert properties to objects and attach ONLY approved leases
    const response = properties.map((p: any) => {
      const obj = typeof p.toObject === "function" ? p.toObject() : p;
      (obj as any).name = (obj as any).title || (obj as any).name;
      
      // Attach leases that belong to this property AND are from approved applications
      (obj as any).leases = leases
        .filter((lease) => String(lease.property) === String(p._id))
        .map((lease) => {
          const leaseObj = typeof lease.toObject === "function" ? lease.toObject() : lease;
          const leaseIdStr = String(lease._id);
          
          // Get tenant data - prefer populated tenant, fallback to CognitoId lookup
          let tenantData: any = leaseObj.tenant;
          if (!tenantData || typeof tenantData === "string" || typeof tenantData === "object" && !(tenantData as any).name) {
            tenantData = tenantsByIdMap.get(leaseObj.tenantCognitoId) || leaseObj.tenant;
          }
          
          return {
            _id: leaseObj._id,
            startDate: leaseObj.startDate,
            endDate: leaseObj.endDate,
            rent: leaseObj.rent,
            deposit: leaseObj.deposit,
            tenantCognitoId: leaseObj.tenantCognitoId,
            tenant: tenantData,
            payments: paymentsByLeaseId.get(leaseIdStr) || []
          };
        });
      
      return obj;
    });

    res.json(response);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getSavedLocations = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const manager = await Manager.findOne({ cognitoId }).exec();
    if (!manager) return res.status(404).json({ message: "Manager not found" });
    res.json((manager as any).savedLocations || []);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const addSavedLocation = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId } = req.params;
    const { title, placeId, coordinates } = req.body;
    const manager = await Manager.findOne({ cognitoId }).exec();
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    (manager as any).savedLocations = (manager as any).savedLocations || [];
    if (placeId && (manager as any).savedLocations.some((s: any) => s.placeId === placeId)) {
      return res.status(409).json({ message: "Location already saved" });
    }

    (manager as any).savedLocations.push({ title, placeId, coordinates });
    await manager.save();
    res.status(201).json((manager as any).savedLocations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const removeSavedLocation = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { cognitoId, placeId } = req.params;
    const manager = await Manager.findOne({ cognitoId }).exec();
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    (manager as any).savedLocations = ((manager as any).savedLocations || []).filter((s: any) => s.placeId !== placeId);
    await manager.save();
    res.json((manager as any).savedLocations);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
