import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  DistributedLock,
  RedisLike,
} from '@shared/lock/distributed-lock.service';

export const REDIS_PROVIDER = 'REDIS';

/**
 * Nest injectable that provides distributed lock using Redis.
 * Used for cron safety so only one instance enqueues per schedule.
 */
@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly lock: DistributedLock;

  constructor(@Inject(REDIS_PROVIDER) private readonly redis: Redis) {
    this.lock = new DistributedLock(this.redis as unknown as RedisLike);
  }

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    return this.lock.acquire(key, ttlMs);
  }

  async release(key: string, token: string): Promise<void> {
    return this.lock.release(key, token);
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
