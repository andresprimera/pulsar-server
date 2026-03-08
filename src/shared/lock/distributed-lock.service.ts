/**
 * Distributed lock using Redis SET key value NX PX ttl.
 * Intended for cron safety: only one instance acquires and enqueues.
 * Caller must inject a Redis-compatible client (e.g. from BullMQ or a dedicated connection).
 */

export interface RedisLike {
  set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
}

export class DistributedLock {
  constructor(private readonly redis: RedisLike) {}

  /**
   * Try to acquire a lock. Returns a token if acquired, null otherwise.
   * Use the token with release() so only the holder can release.
   */
  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /**
   * Release the lock only if the current value matches the token (holder check).
   */
  async release(key: string, token: string): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const redisWithEval = this.redis as RedisLike & {
      eval?: (
        script: string,
        nkeys: number,
        ...args: string[]
      ) => Promise<unknown>;
    };
    if (typeof redisWithEval.eval === 'function') {
      await redisWithEval.eval(script, 1, key, token);
    } else {
      const current = await this.redis.get(key);
      if (current === token) {
        await this.redis.del(key);
      }
    }
  }
}
