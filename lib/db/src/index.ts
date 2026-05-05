import { MongoClient, type Db } from "mongodb";

if (!process.env.MONGODB_URL) {
  throw new Error(
    "MONGODB_URL must be set. Please provide your MongoDB connection string.",
  );
}

const client = new MongoClient(process.env.MONGODB_URL);

let _db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (!_db) {
    await client.connect();
    _db = client.db();
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  await client.close();
  _db = null;
}

export * from "./schema";
