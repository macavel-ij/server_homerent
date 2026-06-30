import { Request, Response } from "express";
import { v2 as cloudinary } from "cloudinary";
import config from "../config";

export const cloudinaryTest = async (req: Request, res: Response) => {
  try {
    const hasCloudinaryConfig = !!(
      config.cloudinary.url || (config.cloudinary.apiKey && config.cloudinary.apiSecret && config.cloudinary.cloudName)
    );

    if (!hasCloudinaryConfig) {
      res.status(400).json({ ok: false, message: "Cloudinary not configured on server" });
      return;
    }

    const dataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";

    const result = await cloudinary.uploader.upload(dataUri, { folder: "properties-test" });

    res.json({ ok: true, result });
    return;
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    return;
  }
};

export default { cloudinaryTest };
