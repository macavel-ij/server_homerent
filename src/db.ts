import mongoose from "mongoose";

export async function connectToMongo(): Promise<void> {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/realestate";
  try {
    await mongoose.connect(uri, {
      // useNewUrlParser and useUnifiedTopology are default in mongoose 6+
    } as mongoose.ConnectOptions);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    throw err;
  }
}

export default mongoose;
