import IORedis from "ioredis";
import { env } from "../utils/env";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
