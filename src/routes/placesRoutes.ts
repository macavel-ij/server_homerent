import express, { RequestHandler } from "express";

const router = express.Router();

// Google Places Autocomplete endpoint
const getPlacesAutocomplete: RequestHandler = async (req, res) => {
  try {
    const { input, country = "tz" } = req.query;

    if (!input || typeof input !== "string" || input.trim().length < 2) {
      res.json({ predictions: [] });
      return;
    }

    const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!googleKey) {
      console.error("Google Maps API key not found in environment");
      console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes("GOOGLE")));
      res.status(500).json({ error: "Google Maps API key not configured" });
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&components=country:${country}&types=address|geocode&key=${googleKey}&language=en`;

    console.log(`[Places] Autocomplete request for: "${input}" in country: "${country}"`);
    console.log(`[Places] API URL: ${url.substring(0, 100)}...`);
    
    const response = await fetch(url);
    const data = await response.json();

    console.log(`[Places] Response status: ${response.status}`);
    console.log(`[Places] Response:`, { 
      predictionsCount: data.predictions?.length || 0, 
      status: data.status,
      errorMessage: data.error_message
    });
    
    res.json(data);
  } catch (error) {
    console.error("[Places] Autocomplete error:", error);
    res.status(500).json({ error: "Failed to fetch suggestions", details: String(error) });
  }
};

// Google Places Details endpoint
const getPlacesDetails: RequestHandler = async (req, res) => {
  try {
    const { place_id } = req.query;

    if (!place_id || typeof place_id !== "string") {
      res.status(400).json({ error: "place_id is required" });
      return;
    }

    const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!googleKey) {
      console.error("Google Maps API key not found in environment");
      res.status(500).json({ error: "Google Maps API key not configured" });
      return;
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${googleKey}&fields=geometry,formatted_address,name`;

    console.log(`[Places] Details request for place_id: ${place_id}`);
    
    const response = await fetch(url);
    const data = await response.json();

    console.log(`[Places] Details response:`, { status: data.status, errorMessage: data.error_message });
    
    res.json(data);
  } catch (error) {
    console.error("[Places] Details error:", error);
    res.status(500).json({ error: "Failed to fetch place details", details: String(error) });
  }
};

router.get("/autocomplete", getPlacesAutocomplete);
router.get("/details", getPlacesDetails);

export default router;
