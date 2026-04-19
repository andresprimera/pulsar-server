import 'reflect-metadata';
import mongoose from 'mongoose';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

/**
 * Drops the MongoDB database named in MONGODB_URI, then boots a Nest
 * application context so SeederService runs (same as a normal server start).
 */
async function main(): Promise<void> {
  process.env.SEED_DB = 'true';

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pulsar';
  console.log(
    `Dropping database for ${uri.replace(/:([^:@]+)@/, ':****@')} ...`,
  );

  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log('Seeding (Nest application context)...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  await app.close();

  console.log('Database reset and seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
