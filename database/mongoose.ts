import mongoose from 'mongoose';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

// Reuse the connection across hot reloads in development
const cached: MongooseCache = (globalThis.mongooseCache ??= {
  conn: null,
  promise: null,
});

export const connectToDatabase = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  if (cached.conn) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Reusing MongoDB connection');
    }
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        // Fail after 5s instead of the 30s default when the cluster is unreachable
        serverSelectionTimeoutMS: 5000,
        // dbName: 'bookified', // use this if the URI has no database name
      })
      .then((connection) => {
        // Never log MONGODB_URI: it contains the password
        if (process.env.NODE_ENV === 'development') {
          console.warn('Connected to MongoDB');
        }
        return connection;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    // Reset so the next call retries
    cached.promise = null;
    console.error(
      'MongoDB connection error. Check MONGODB_URI and the Atlas IP allowlist.',
      e
    );
    throw e;
  }

  // Never log MONGODB_URI: it contains the password
  console.warn('Connected to MongoDB');
  return cached.conn;
};
