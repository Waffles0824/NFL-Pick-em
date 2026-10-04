import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DataStore, Database } from "@/lib/db/types";
import { MemoryStore } from "@/lib/db/memory";

const filePath = path.join(process.cwd(), ".data", "demo.json");
const lockPath = `${filePath}.lock`;
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function acquireLock() {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fs.open(lockPath, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > 5_000) await fs.unlink(lockPath);
      } catch {
        // Another process removed the lock.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("The demo league file is busy.");
}

async function writeStore(data: Database): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data));
  await fs.rename(temporary, filePath);
}

async function readStore(): Promise<MemoryStore> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return new MemoryStore(JSON.parse(raw) as Database);
  } catch {
    const { buildDemoDatabase } = await import("@/lib/seed/demo");
    const data = await buildDemoDatabase(new Date());
    await writeStore(data);
    return new MemoryStore(data);
  }
}

export function getDemoStore(): DataStore {
  return new Proxy({} as MemoryStore, {
    get(_target, property) {
      // A `then` method makes this proxy a thenable. Async functions would
      // adopt it and wait forever, because this trap never calls resolve.
      if (property === "then" || typeof property === "symbol") return undefined;
      if (property === "mode") return "demo";
      return (...args: unknown[]) =>
        enqueue(async () => {
          const lock = await acquireLock();
          try {
            const store = await readStore();
            const method = store[property as keyof MemoryStore];
            if (typeof method !== "function") return method;
            const result = await (
              method as (...methodArgs: unknown[]) => Promise<unknown>
            ).apply(store, args);
            if (/^(insert|update|upsert|delete|set|create|save|replace|write)/.test(String(property))) {
              await writeStore(store.data);
            }
            return result;
          } finally {
            await lock.close();
            await fs.unlink(lockPath).catch(() => undefined);
          }
        });
    },
  }) as unknown as DataStore;
}

export async function resetDemoDatabase(): Promise<void> {
  const { buildDemoDatabase } = await import("@/lib/seed/demo");
  const data = await buildDemoDatabase(new Date());
  await getDemoStore().replaceAll?.(data);
}
