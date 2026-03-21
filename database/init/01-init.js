// Runs in mongosh on first MongoDB initialisation (docker-entrypoint-initdb.d).
// Reads every *.json file from /schemas and creates the declared collections + indexes.

const fs = require('fs');
const path = require('path');

const schemasDir = '/schemas';
const dbName = process.env.MONGODB_DB_NAME || 'npm-download-bot';
const targetDb = db.getSiblingDB(dbName);

const files = fs.readdirSync(schemasDir).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const schema = JSON.parse(fs.readFileSync(path.join(schemasDir, file), 'utf8'));

  print(`Initialising collection: ${schema.collection}`);
  targetDb.createCollection(schema.collection);

  for (const { key, options } of schema.indexes ?? []) {
    targetDb.getCollection(schema.collection).createIndex(key, options);
    print(`  Created index "${options.name}": ${JSON.stringify(key)}`);
  }
}
