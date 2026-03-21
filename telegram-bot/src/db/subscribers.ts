import { WithId } from 'mongodb';
import { getDb } from '.';

const COLLECTION = 'subscribers';

export interface Subscriber {
  telegramId: number;
  username?: string;
  subscribedAt: Date;
}

export type SubscriberDocument = WithId<Subscriber>;

function col() {
  return getDb().collection<Subscriber>(COLLECTION);
}

export async function verifyIndexes(): Promise<void> {
  const indexes = await col().indexes();
  if (!indexes.some((idx) => idx.name === 'subscriber')) {
    throw new Error(
      'Required unique index "subscriber" is missing on the subscribers collection. Ensure the database was initialised correctly.',
    );
  }
}

// Returns true if newly subscribed, false if already existed.
export async function addSubscriber(data: Subscriber): Promise<boolean> {
  const result = await col().updateOne(
    { telegramId: data.telegramId },
    { $setOnInsert: data },
    { upsert: true },
  );
  return result.upsertedCount === 1;
}

export async function getAllSubscribers(): Promise<SubscriberDocument[]> {
  return col().find().toArray();
}

// Returns true if the document was found and removed.
export async function removeSubscriber(telegramId: number): Promise<boolean> {
  const result = await col().deleteOne({ telegramId });
  return result.deletedCount > 0;
}
