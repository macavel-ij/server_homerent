import { Request, Response } from "express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import config from "../config";
// use require to avoid runtime TS module-declaration checks in ts-node
// (we provide a .d.ts for editors/compile-time; runtime can use require)
const streamifier: any = require("streamifier");
import { Property } from "../models/propertyModel";
import { Location } from "../models/locationModel";

// configure cloudinary via explicit env vars first, then fallback to CLOUDINARY_URL
const cloudinaryConfigAvailable =
  !!(config.cloudinary.apiKey && config.cloudinary.apiSecret && config.cloudinary.cloudName) ||
  !!config.cloudinary.url;

if (config.cloudinary.apiKey && config.cloudinary.apiSecret && config.cloudinary.cloudName) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
} else if (config.cloudinary.url) {
  cloudinary.config({ secure: true });
}

export const getProperties = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, priceMin, priceMax, location: locationQuery, bbox, beds, baths, propertyType } = req.query;

    const filter: any = {};

    if (priceMin) filter.pricePerMonth = { ...(filter.pricePerMonth || {}), $gte: Number(priceMin) };
    if (priceMax) filter.pricePerMonth = { ...(filter.pricePerMonth || {}), $lte: Number(priceMax) };

    // Beds/baths: treat provided values as minimums (e.g., beds=2 => 2+ beds)
    if (beds && String(beds).trim() !== "") {
      const n = Number(beds);
      if (!Number.isNaN(n)) filter.beds = { ...(filter.beds || {}), $gte: n };
    }
    if (baths && String(baths).trim() !== "") {
      const n = Number(baths);
      if (!Number.isNaN(n)) filter.baths = { ...(filter.baths || {}), $gte: n };
    }

    // Property type exact match
    if (propertyType && String(propertyType).trim() !== "") {
      const pt = String(propertyType).trim();
      if (pt !== "any") filter.propertyType = pt;
    }
    if (latitude && longitude) {
      try {
        const lat = Number(latitude);
        const lng = Number(longitude);
        // default search radius in kilometers (tunable)
        const radiusKm = Number(req.query.radiusKm) || 10; // 10 km default

        const baseFilter = { ...filter };
        // remove any direct location filters (they won't apply to ObjectId)
        delete (baseFilter as any).location;

        const pipeline: any[] = [{ $match: baseFilter }];
        pipeline.push({
          $lookup: {
            from: "locations",
            localField: "location",
            foreignField: "_id",
            as: "location",
          },
        });
        pipeline.push({ $unwind: { path: "$location", preserveNullAndEmptyArrays: true } });

        const sphereRadius = radiusKm / 6378.1; // convert km to radians
        pipeline.push({
          $match: {
            "location.coordinates": { $geoWithin: { $centerSphere: [[lng, lat], sphereRadius] } },
          },
        });

        const properties = await Property.aggregate(pipeline).exec();
        const response = properties.map((p: any) => {
          const obj = p;
          (obj as any).name = (obj as any).title || (obj as any).name;
          return obj;
        });
        return res.json(response);
      } catch (err) {
        // if aggregation fails, fall through to the default find below
        // eslint-disable-next-line no-console
        console.warn("latitude/longitude aggregation failed, falling back:", err);
      }
    }

    // If a textual location query is provided, perform a case-insensitive match
    // against property title and populated location fields (city/address).
    if (locationQuery && String(locationQuery).trim().length > 0 && !bbox) {
      const q = String(locationQuery).trim();
      // Use aggregation to allow matching against the referenced Location document
      // Escape special regex characters properly
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedQ, "i");
      const pipeline: any[] = [{ $match: filter }];
      pipeline.push({
        $lookup: {
          from: "locations",
          localField: "location",
          foreignField: "_id",
          as: "location",
        },
      });
      pipeline.push({ $unwind: { path: "$location", preserveNullAndEmptyArrays: true } });
      pipeline.push({
        $match: {
          $or: [
            { title: { $regex: regex } },
            { "location.address": { $regex: regex } },
            { "location.city": { $regex: regex } },
          ],
        },
      });

      const properties = await Property.aggregate(pipeline).exec();
      const response = properties.map((p: any) => {
        const obj = p;
        (obj as any).name = (obj as any).title || (obj as any).name;
        return obj;
      });
      return res.json(response);
    }

    // If bbox parameter provided, use a geoWithin box filter at the DB level so
    // we return only properties whose stored location lies inside the bbox.
    if (bbox && typeof bbox === "string") {
      try {
        const parts = (bbox as string).split(",").map((p) => parseFloat(p));
        if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
          const [minLng, minLat, maxLng, maxLat] = parts;
          // Build an aggregation pipeline that looks up the referenced Location
          // document and applies the geo filter against the Location.coordinates
          // field. Properties reference Location by ObjectId, so applying
          // $geoWithin directly on `location` (the ObjectId) returns no results.
          const bboxBox = { $box: [[minLng, minLat], [maxLng, maxLat]] };

          // Remove any existing location filter (it may be an ObjectId or other geo filter)
          const baseFilter = { ...filter };
          delete baseFilter.location;

          const pipeline: any[] = [{ $match: baseFilter }];
          pipeline.push({
            $lookup: {
              from: "locations",
              localField: "location",
              foreignField: "_id",
              as: "location",
            },
          });
          pipeline.push({ $unwind: { path: "$location", preserveNullAndEmptyArrays: true } });
          pipeline.push({
            $match: {
              "location.coordinates": { $geoWithin: bboxBox },
            },
          });

          const properties = await Property.aggregate(pipeline).exec();

          const response = properties.map((p: any) => {
            const obj = p;
            (obj as any).name = (obj as any).title || (obj as any).name;
            return obj;
          });
          return res.json(response);
        }
      } catch (e) {
      }
    }

    const properties = await Property.find(filter).populate("location").exec();

    const response = properties.map((p: any) => {
      const obj = typeof p.toObject === "function" ? p.toObject() : p;
      (obj as any).name = (obj as any).title || (obj as any).name;
      return obj;
    });
    res.json(response);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getProperty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await Property.findById(id).populate("location").exec();
    if (!property) return res.status(404).json({ message: "Not found" });
    const obj = typeof property.toObject === "function" ? property.toObject() : property;
    (obj as any).name = (obj as any).title || (obj as any).name;
    res.json(obj);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const createProperty = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const { address, city, state, country, postalCode, ...propertyData } = req.body;

    const hasCloudinaryConfig = !!(
      process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_URL.includes("<your_api_key>")
    ) || (!!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET && !!process.env.CLOUDINARY_CLOUD_NAME && !process.env.CLOUDINARY_API_KEY.includes("<your_api_key>"));

    console.info("Cloudinary configured:", hasCloudinaryConfig);

    if (!hasCloudinaryConfig && (files || []).length > 0) {
      res.status(400).json({ message: "Cloudinary is not configured. Image upload is required to store images in the cloud." });
      return;
    }

    const photoUrls = await Promise.all(
      (files || []).map(async (file) => {
        console.info("Attempting Cloudinary upload for:", file.originalname);
        const url = await new Promise<string>((resolve, reject) => {
          const opts = { folder: "properties", resource_type: "image" } as any;
          const uploadStream = cloudinary.uploader.upload_stream(opts, (error, result) => {
            if (error) {
              console.warn("Cloudinary upload error callback:", error && error.message ? error.message : error);
              return reject(error);
            }
            console.info("Cloudinary upload result (raw):", result);
            const resolvedUrl = (result && (result.secure_url || result.url)) as string | undefined;
            if (!resolvedUrl) {
              console.warn("Cloudinary upload returned no URL, result:", result);
              return reject(new Error("No URL returned from Cloudinary"));
            }
            return resolve(resolvedUrl);
          });
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
        console.info("Cloudinary upload succeeded, url:", url);
        return url;
      })
    );

    console.info("Uploaded photo URLs:", photoUrls);
    let lon = 0;
    let lat = 0;
    if (propertyData.latitude != null && propertyData.longitude != null) {
      const parsedLat = parseFloat(propertyData.latitude as any);
      const parsedLon = parseFloat(propertyData.longitude as any);
      if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)) {
        lat = parsedLat;
        lon = parsedLon;
        console.info("Using coordinates provided by client for location:", { lat, lon });
      }
    }

    if (lat === 0 && lon === 0) {
      const geocodingUrl = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ street: address, city, country, postalcode: postalCode, format: "json", limit: "1" }).toString()}`;
      const geocodingResponse = await axios.get(geocodingUrl, { headers: { "User-Agent": "RealEstateApp" } });
      lon = parseFloat(geocodingResponse.data[0]?.lon || "0");
      lat = parseFloat(geocodingResponse.data[0]?.lat || "0");
      console.info("Nominatim geocoding result:", { lat, lon });
    }

    const location = new Location({
      address,
      city,
      state,
      country,
      postalCode,
      coordinates: { type: "Point", coordinates: [lon, lat] },
    });
    await location.save();

    const sanitizedPropertyData: any = {
      ...propertyData,
      pricePerMonth:
        propertyData.pricePerMonth != null
          ? Number(propertyData.pricePerMonth)
          : undefined,
      beds: propertyData.beds != null ? Number(propertyData.beds) : undefined,
      baths: propertyData.baths != null ? Number(propertyData.baths) : undefined,
      squareFeet:
        propertyData.squareFeet != null
          ? Number(propertyData.squareFeet)
          : undefined,
      paymentFrequency:
        propertyData.paymentFrequency != null
          ? Number(propertyData.paymentFrequency)
          : 1, // Default to 1 (monthly)
    };

    // Remove photoUrls from sanitized data - they come from file uploads, not body
    delete sanitizedPropertyData.photoUrls;

    // Parse acceptedPaymentMethods if it's a JSON string
    if ((propertyData as any).acceptedPaymentMethods) {
      try {
        const paymentMethodsValue = (propertyData as any).acceptedPaymentMethods;
        if (typeof paymentMethodsValue === "string") {
          const parsed = JSON.parse(paymentMethodsValue);
          sanitizedPropertyData.acceptedPaymentMethods = Array.isArray(parsed) ? parsed : [paymentMethodsValue];
        } else if (Array.isArray(paymentMethodsValue)) {
          sanitizedPropertyData.acceptedPaymentMethods = paymentMethodsValue;
        }
      } catch (e) {
        // If parsing fails, keep the original value or use default
        sanitizedPropertyData.acceptedPaymentMethods = (propertyData as any).acceptedPaymentMethods || ["credit_card"];
      }
    }

    // Parse amenities if it's a JSON string
    if ((propertyData as any).amenities) {
      try {
        const amenitiesValue = (propertyData as any).amenities;
        if (typeof amenitiesValue === "string") {
          const parsed = JSON.parse(amenitiesValue);
          sanitizedPropertyData.amenities = Array.isArray(parsed) ? parsed : [amenitiesValue];
        } else if (Array.isArray(amenitiesValue)) {
          sanitizedPropertyData.amenities = amenitiesValue;
        }
      } catch (e) {
        // If parsing fails, keep the original value
        sanitizedPropertyData.amenities = (propertyData as any).amenities;
      }
    }

    // Parse isPinned if provided (forms often submit booleans as strings)
    if ((propertyData as any).isPinned != null) {
      const raw = (propertyData as any).isPinned;
      sanitizedPropertyData.isPinned = raw === true || raw === "true" || raw === "1";
    }

    // Parse isPetsAllowed if provided
    if ((propertyData as any).isPetsAllowed != null) {
      const raw = (propertyData as any).isPetsAllowed;
      sanitizedPropertyData.isPetsAllowed = raw === true || raw === "true" || raw === "1";
    }

    // Parse isParkingIncluded if provided
    if ((propertyData as any).isParkingIncluded != null) {
      const raw = (propertyData as any).isParkingIncluded;
      sanitizedPropertyData.isParkingIncluded = raw === true || raw === "true" || raw === "1";
    }

    // Ensure propertyType is always valid (required field, use default if not provided)
    if (!propertyData.propertyType || propertyData.propertyType.trim() === '') {
      sanitizedPropertyData.propertyType = "Apartment"; // Default to Apartment if not provided
    }

    if ((propertyData as any).name && !sanitizedPropertyData.title) {
      sanitizedPropertyData.title = (propertyData as any).name;
    }

    const property = new Property({
      ...sanitizedPropertyData,
      photoUrls,
      location: location._id,
    } as any);

    await property.save();

    const populated = await property.populate("location");
    const responseObj: any = typeof populated.toObject === "function" ? populated.toObject() : populated;
    (responseObj as any).name = (responseObj as any).title || (responseObj as any).name;
    console.info("Created property:", {
      id: responseObj._id,
      title: responseObj.title,
      name: responseObj.name,
      photoUrls: responseObj.photoUrls,
      managerCognitoId: responseObj.managerCognitoId,
    });
    res.status(201).json(responseObj);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const updateProperty = async (req: Request, res: Response) => {
  try {
    const { id: propertyId } = req.params;
    const files = req.files as Express.Multer.File[] | undefined;
    const propertyData = req.body;

    if (!propertyId) {
      res.status(400).json({ message: "Property ID is required" });
      return;
    }

    // Find existing property
    const existingProperty = await Property.findById(propertyId).populate("location").exec();
    if (!existingProperty) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    // Handle new photo uploads if provided
    let photoUrls = existingProperty.photoUrls || [];
    if (files && files.length > 0) {
      const hasCloudinaryConfig =
        (!!config.cloudinary.cloudName && !!config.cloudinary.apiKey && !!config.cloudinary.apiSecret) ||
        (!!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET && !!process.env.CLOUDINARY_CLOUD_NAME && !process.env.CLOUDINARY_API_KEY.includes("<your_api_key>"));

      if (!hasCloudinaryConfig) {
        res.status(400).json({ message: "Cloudinary is not configured. Image upload is required to store images in the cloud." });
        return;
      }

      const newPhotoUrls = await Promise.all(
        files.map(async (file) => {
          const url = await new Promise<string>((resolve, reject) => {
            const opts = { folder: "properties", resource_type: "image" } as any;
            const uploadStream = cloudinary.uploader.upload_stream(opts, (error, result) => {
              if (error) return reject(error);
              const resolvedUrl = (result && (result.secure_url || result.url)) as string | undefined;
              if (!resolvedUrl) return reject(new Error("No URL returned from Cloudinary"));
              return resolve(resolvedUrl);
            });
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
          });
          return url;
        })
      );
      photoUrls = newPhotoUrls;
    }

    const sanitizedPropertyData: any = {
      ...propertyData,
      pricePerMonth: propertyData.pricePerMonth != null ? Number(propertyData.pricePerMonth) : existingProperty.pricePerMonth,
      beds: propertyData.beds != null ? Number(propertyData.beds) : existingProperty.beds,
      baths: propertyData.baths != null ? Number(propertyData.baths) : existingProperty.baths,
      squareFeet: propertyData.squareFeet != null ? Number(propertyData.squareFeet) : existingProperty.squareFeet,
      paymentFrequency: propertyData.paymentFrequency != null ? Number(propertyData.paymentFrequency) : existingProperty.paymentFrequency,
    };

    // Ensure propertyType is always valid (use existing if empty or not provided)
    if (!propertyData.propertyType || propertyData.propertyType.trim() === '') {
      sanitizedPropertyData.propertyType = existingProperty.propertyType;
    }

    // Parse acceptedPaymentMethods if it's a JSON string
    if (propertyData.acceptedPaymentMethods) {
      try {
        const paymentMethodsValue = propertyData.acceptedPaymentMethods;
        if (typeof paymentMethodsValue === "string") {
          const parsed = JSON.parse(paymentMethodsValue);
          sanitizedPropertyData.acceptedPaymentMethods = Array.isArray(parsed) ? parsed : [paymentMethodsValue];
        } else if (Array.isArray(paymentMethodsValue)) {
          sanitizedPropertyData.acceptedPaymentMethods = paymentMethodsValue;
        }
      } catch (e) {
        sanitizedPropertyData.acceptedPaymentMethods = propertyData.acceptedPaymentMethods || existingProperty.acceptedPaymentMethods;
      }
    }

    // Parse amenities if it's a JSON string
    if (propertyData.amenities) {
      try {
        const amenitiesValue = propertyData.amenities;
        if (typeof amenitiesValue === "string") {
          const parsed = JSON.parse(amenitiesValue);
          sanitizedPropertyData.amenities = Array.isArray(parsed) ? parsed : [amenitiesValue];
        } else if (Array.isArray(amenitiesValue)) {
          sanitizedPropertyData.amenities = amenitiesValue;
        }
      } catch (e) {
        sanitizedPropertyData.amenities = propertyData.amenities;
      }
    }

    // Parse boolean fields
    if (propertyData.isPetsAllowed != null) {
      const raw = propertyData.isPetsAllowed;
      sanitizedPropertyData.isPetsAllowed = raw === true || raw === "true" || raw === "1";
    }

    if (propertyData.isParkingIncluded != null) {
      const raw = propertyData.isParkingIncluded;
      sanitizedPropertyData.isParkingIncluded = raw === true || raw === "true" || raw === "1";
    }

    // Map name to title for backend storage
    if (propertyData.name && !sanitizedPropertyData.title) {
      sanitizedPropertyData.title = propertyData.name;
    }

    // Update property fields
    const updateData: any = {
      ...sanitizedPropertyData,
      updatedAt: new Date(),
    };

    // Handle photos: if new photos uploaded, use those; otherwise use kept photos or existing
    if (files && files.length > 0) {
      updateData.photoUrls = photoUrls;
    } else if (propertyData.photoUrls && Array.isArray(propertyData.photoUrls)) {
      // Filter out only valid string URLs (kept photos)
      const validPhotoUrls = propertyData.photoUrls.filter(
        (url: any) => typeof url === 'string' && url.trim().length > 0
      );
      if (validPhotoUrls.length > 0) {
        updateData.photoUrls = validPhotoUrls;
      }
    }
    // Otherwise, existing photos remain unchanged

    // CRITICAL: Ensure propertyType is NEVER empty before update
    if (!updateData.propertyType || updateData.propertyType.toString().trim() === '') {
      updateData.propertyType = existingProperty.propertyType || 'Apartment';
    }

    // Handle location update if location fields provided
    const locationFieldsProvided = propertyData.address || propertyData.city || propertyData.state || propertyData.country || propertyData.postalCode;
    
    if (locationFieldsProvided || Object.keys(propertyData).some(key => ['address', 'city', 'state', 'country', 'postalCode'].includes(key))) {
      console.info("Location update initiated. Provided fields:", {
        address: propertyData.address,
        city: propertyData.city,
        state: propertyData.state,
        country: propertyData.country,
        postalCode: propertyData.postalCode,
      });
      
      const address = propertyData.address || (existingProperty.location as any)?.address || '';
      const city = propertyData.city || (existingProperty.location as any)?.city || '';
      const state = propertyData.state || (existingProperty.location as any)?.state || '';
      const country = propertyData.country || (existingProperty.location as any)?.country || '';
      const postalCode = propertyData.postalCode || (existingProperty.location as any)?.postalCode || '';

      // Prefer explicit coordinates from the client when available; otherwise geocode the address.
      let lon = 0;
      let lat = 0;
      if (propertyData.latitude != null && propertyData.longitude != null) {
        const parsedLat = parseFloat(propertyData.latitude as any);
        const parsedLon = parseFloat(propertyData.longitude as any);
        if (!Number.isNaN(parsedLat) && !Number.isNaN(parsedLon)) {
          lat = parsedLat;
          lon = parsedLon;
        }
      }

      if (lat === 0 && lon === 0 && address && city && country) {
        try {
          const geocodingResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
              q: `${address}, ${city}, ${state}, ${country}`,
              format: 'json',
            },
          });
          lon = parseFloat(geocodingResponse.data[0]?.lon || "0");
          lat = parseFloat(geocodingResponse.data[0]?.lat || "0");
        } catch (e) {
          console.warn("Geocoding failed:", e);
        }
      }

      // Update or create location
      if (existingProperty.location && typeof existingProperty.location === 'object' && '_id' in existingProperty.location) {
        // Update existing location
        const updatedLocation = await Location.findByIdAndUpdate(
          (existingProperty.location as any)._id,
          {
            address,
            city,
            state,
            country,
            postalCode,
            coordinates: { type: "Point", coordinates: [lon, lat] },
          },
          { new: true }
        ).exec();
        
        if (!updatedLocation) {
          console.warn("Failed to update location document");
        }
      } else {
        // Create new location
        const location = new Location({
          address,
          city,
          state,
          country,
          postalCode,
          coordinates: { type: "Point", coordinates: [lon, lat] },
        });
        await location.save();
        updateData.location = location._id;
      }
    }

    const updatedProperty = await Property.findByIdAndUpdate(
      propertyId,
      updateData,
      { new: true }
    ).populate("location").exec();

    if (!updatedProperty) {
      res.status(404).json({ message: "Property not found after update" });
      return;
    }

    console.info("Property update successful. Updated property:", {
      id: updatedProperty._id,
      title: updatedProperty.title,
      location: (updatedProperty as any).location,
    });

    const responseObj: any = typeof updatedProperty.toObject === "function" ? updatedProperty.toObject() : updatedProperty;
    (responseObj as any).name = (responseObj as any).title || (responseObj as any).name;
    res.json(responseObj);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteProperty = async (req: Request, res: Response) => {
  try {
    const { id: propertyId } = req.params;

    // Check if the property exists
    const existingProperty = await Property.findById(propertyId).exec();

    if (!existingProperty) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    // Delete the associated location if it exists
    if (existingProperty.location) {
      try {
        await Location.findByIdAndDelete(existingProperty.location).exec();
        console.info("Location deleted for property:", propertyId);
      } catch (locationErr) {
        console.warn("Failed to delete location:", locationErr);
        // Don't fail the property deletion if location deletion fails
      }
    }

    // Delete the property
    const deletedProperty = await Property.findByIdAndDelete(propertyId).exec();

    if (!deletedProperty) {
      res.status(404).json({ message: "Property not found" });
      return;
    }

    console.info("Property deleted successfully:", propertyId);
    res.status(200).json({ 
      message: "Property deleted successfully",
      deletedPropertyId: propertyId
    });
  } catch (err: any) {
    console.error("Error deleting property:", err.message);
    res.status(500).json({ message: err.message || "Failed to delete property" });
  }
};
