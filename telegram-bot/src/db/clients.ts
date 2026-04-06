import { ObjectId, WithId } from "mongodb";

import { getDb } from ".";

const COLLECTION = "clients";

export interface Client {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  registeredAt: Date;
  isApproved: boolean;
}

export type ClientDocument = WithId<Client>;

function col() {
  return getDb().collection<Client>(COLLECTION);
}

export async function ensureIndexes(): Promise<void> {
  await col().createIndex({ telegramId: 1 }, { unique: true, name: "client" });
}

export async function registerClient(data: Client): Promise<boolean> {
  const result = await col().updateOne({ telegramId: data.telegramId }, { $setOnInsert: data }, { upsert: true });
  return result.upsertedCount === 1;
}

export async function getClientByTelegramId(telegramId: number): Promise<ClientDocument | null> {
  return col().findOne({ telegramId });
}

export async function getAllClients(): Promise<ClientDocument[]> {
  return col().find().toArray();
}

export async function updateClient(
  telegramId: number,
  updates: Partial<Omit<Client, "telegramId" | "registeredAt">>,
): Promise<boolean> {
  const result = await col().updateOne({ telegramId }, { $set: updates });
  return result.matchedCount > 0;
}

export async function approveClient(filter: { telegramId: number } | { username: string }): Promise<boolean> {
  const result = await col().updateOne(filter, { $set: { isApproved: true } });
  return result.matchedCount > 0;
}

export async function getPendingClients(limit: number): Promise<ClientDocument[]> {
  return col().find({ isApproved: false }).sort({ registeredAt: -1 }).limit(limit).toArray();
}

export async function deleteClient(telegramId: number): Promise<boolean> {
  const result = await col().deleteOne({ telegramId });
  return result.deletedCount > 0;
}

export async function getClientById(id: ObjectId): Promise<ClientDocument | null> {
  return col().findOne({ _id: id });
}
