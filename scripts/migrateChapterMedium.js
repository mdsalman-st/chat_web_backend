import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMedium } from '../utils/medium.js';

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(backendDirectory, '.env') });

const TARGET_INDEX = {
  boardCode: 1,
  classLevel: 1,
  subjectCode: 1,
  chapterNumber: 1,
  medium: 1,
};
const PARTIAL_FILTER = {
  boardCode: { $type: 'string' },
  classLevel: { $type: 'string' },
  subjectCode: { $type: 'string' },
  chapterNumber: { $type: 'number' },
  medium: { $type: 'string' },
};

function sameFields(index, fields) {
  const keys = Object.keys(index.key || {});
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function normalizeChapterMedium(value) {
  if (value == null || String(value).trim() === '') return 'Both';
  const normalized = normalizeMedium(value, { allowBoth: true });
  if (!normalized) throw new Error(`Unsupported stored medium "${value}"`);
  return normalized;
}

function hasCanonicalIdentity(document) {
  return typeof document.boardCode === 'string'
    && typeof document.classLevel === 'string'
    && typeof document.subjectCode === 'string'
    && typeof document.chapterNumber === 'number';
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri, {
    autoIndex: false,
    dbName: process.env.DB_NAME || 'nexus',
  });
  const collection = mongoose.connection.db.collection(
    process.env.CHAPTERS_COLLECTION || 'chapters'
  );

  const indexList = await collection.indexes();
  const targetIndex = indexList.find((index) => index.unique && sameFields(index, Object.keys(TARGET_INDEX)));
  const indexesToDrop = indexList.filter((index) => {
    if (!index.unique || index.name === '_id_') return false;
    return sameFields(index, ['boardCode', 'classLevel', 'subjectCode', 'chapterNumber'])
      || sameFields(index, ['class', 'subject', 'medium', 'chapterNo']);
  });

  let canonicalDocuments = 0;
  let legacyDocuments = 0;
  let documentsToNormalize = 0;
  const identities = new Map();
  const updates = [];

  for await (const document of collection.find({}, {
    projection: {
      boardCode: 1,
      classLevel: 1,
      subjectCode: 1,
      chapterNumber: 1,
      medium: 1,
    },
  })) {
    if (!hasCanonicalIdentity(document)) {
      legacyDocuments++;
      continue;
    }

    canonicalDocuments++;
    const medium = normalizeChapterMedium(document.medium);
    const identity = JSON.stringify([
      document.boardCode,
      document.classLevel,
      document.subjectCode,
      document.chapterNumber,
      medium,
    ]);
    const existingId = identities.get(identity);
    if (existingId) {
      throw new Error(
        `Migration stopped: duplicate chapter identity after medium normalization ` +
        `(documents ${existingId} and ${document._id}, medium ${medium})`
      );
    }
    identities.set(identity, document._id);

    if (document.medium !== medium) {
      documentsToNormalize++;
      updates.push({
        updateOne: {
          filter: { _id: document._id },
          update: { $set: { medium } },
        },
      });
    }
  }

  console.log(`Canonical chapter documents: ${canonicalDocuments}`);
  console.log(`Legacy documents without canonical identity (left unchanged): ${legacyDocuments}`);
  console.log(`Documents needing medium normalization: ${documentsToNormalize}`);
  console.log(`Legacy unique indexes to replace: ${indexesToDrop.map((index) => index.name).join(', ') || 'none'}`);
  console.log(`Target medium-aware unique index: ${targetIndex ? 'already present' : 'will be created'}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to normalize documents and replace indexes.');
    return;
  }

  for (let offset = 0; offset < updates.length; offset += 500) {
    await collection.bulkWrite(updates.slice(offset, offset + 500), { ordered: true });
  }

  if (!targetIndex) {
    await collection.createIndex(TARGET_INDEX, {
      unique: true,
      name: 'chapter_medium_unique',
      partialFilterExpression: PARTIAL_FILTER,
    });
  }

  for (const index of indexesToDrop) {
    await collection.dropIndex(index.name);
    console.log(`Dropped obsolete unique index: ${index.name}`);
  }

  console.log('Chapter medium migration completed successfully.');
}

main()
  .catch((error) => {
    console.error(`Chapter medium migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
