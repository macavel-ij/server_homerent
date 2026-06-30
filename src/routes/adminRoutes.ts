import express from "express";
import adminControllers from "../controllers/adminControllers";

const router = express.Router();

router.post("/cloudinary-test", adminControllers.cloudinaryTest);

export default router;
