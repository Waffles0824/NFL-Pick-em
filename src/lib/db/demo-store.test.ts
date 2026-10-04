import { describe, expect, it } from "vitest";
import { getDemoStore } from "@/lib/db/demo-store";

describe("demo store", () => {
  it("is not treated as a promise and loads a profile", async () => {
    const store = getDemoStore();
    const loaded = await Promise.race([
      Promise.resolve(store),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("demo store was treated as a thenable")), 1000);
      }),
    ]);
    expect(loaded).toBe(store);

    const profile = await Promise.race([
      store.getProfileByEmail("dylan@sunday-sheet.test"),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("demo store lookup hung")), 3000);
      }),
    ]);
    expect(profile?.displayName).toBe("Dylan Brooks");
  });

  it("shows a session written by one store to the next store", async () => {
    const tokenHash = `test-session-${Date.now()}`;
    const writer = getDemoStore();
    const dylan = await writer.getProfileByEmail("dylan@sunday-sheet.test");
    expect(dylan).toBeTruthy();
    await writer.createSession?.({
      id: crypto.randomUUID(),
      userId: dylan!.id,
      tokenHash,
      createdAt: new Date().toISOString(),
    });

    const reader = getDemoStore();
    const session = await reader.getSessionByTokenHash?.(tokenHash);
    expect(session?.userId).toBe(dylan!.id);

    const snapshot = await reader.snapshot?.();
    expect(snapshot).toBeTruthy();
    snapshot!.sessions = snapshot!.sessions.filter((item) => item.tokenHash !== tokenHash);
    await reader.replaceAll?.(snapshot!);
    expect(await reader.getSessionByTokenHash?.(tokenHash)).toBeNull();
  });
});