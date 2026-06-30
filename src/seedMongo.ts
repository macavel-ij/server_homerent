import fs from "fs";
import path from "path";
import { connectToMongo } from "./db";
import { Location } from "./models/locationModel";
import { Property } from "./models/propertyModel";

async function seed() {
  await connectToMongo();

  const seedDir = path.join(__dirname, "..", "prisma", "seedData");

  // Seed locations
  const locationsRaw = fs.readFileSync(path.join(seedDir, "location.json"), "utf-8");
  const locations = JSON.parse(locationsRaw);

  // Clear existing collections
  await Location.deleteMany({});
  await Property.deleteMany({});

  const locationMap: Record<number, any> = {};

  for (const loc of locations) {
    const match = /POINT\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)/.exec(loc.coordinates || "");
    const lon = match ? parseFloat(match[1]) : 0;
    const lat = match ? parseFloat(match[2]) : 0;

    const doc = new Location({
      address: loc.address,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      postalCode: loc.postalCode,
      coordinates: { type: "Point", coordinates: [lon, lat] },
      originalId: loc.id,
    } as any);
    await doc.save();
    locationMap[loc.id] = doc;
  }

  // Seed properties
  const propsRaw = fs.readFileSync(path.join(seedDir, "property.json"), "utf-8");
  const props = JSON.parse(propsRaw);

  for (const p of props) {
    const locDoc = locationMap[p.locationId];
    const prop = new Property({
      name: p.name,
      description: p.description,
      pricePerMonth: p.pricePerMonth,
      securityDeposit: p.securityDeposit,
      applicationFee: p.applicationFee,
      photoUrls: p.photoUrls,
      amenities: p.amenities,
      highlights: p.highlights,
      isPetsAllowed: p.isPetsAllowed,
      isParkingIncluded: p.isParkingIncluded,
      beds: p.beds,
      baths: p.baths,
      squareFeet: p.squareFeet,
      propertyType: p.propertyType,
      postedDate: p.postedDate,
      averageRating: p.averageRating,
      numberOfReviews: p.numberOfReviews,
      location: locDoc ? locDoc._id : null,
      originalId: p.id,
    } as any);

    await prop.save();
  }

  console.log("Seeding complete");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
