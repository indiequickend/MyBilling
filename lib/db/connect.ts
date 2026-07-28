import mongoose from "mongoose";

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env and set it to your MongoDB Atlas connection string.",
    );
  }
  return uri;
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reused across hot-reloads/serverless invocations so we don't open a new
// connection per request.
const globalForMongoose = globalThis as unknown as { _mongoose?: MongooseCache };

const cache: MongooseCache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  if (!cache.promise) {
    // Default (10s) can be tight for the very first connection in a fresh
    // process — a cold TLS handshake + replica-set discovery against Atlas
    // occasionally takes longer than that under load.
    mongoose.set("bufferTimeoutMS", 20_000);
    cache.promise = mongoose.connect(requireMongoUri(), {
      maxPoolSize: 10,
    });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}
