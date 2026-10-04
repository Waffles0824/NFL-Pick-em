import "server-only";

import { notFound } from "next/navigation";
import { AppError } from "@/lib/domain/errors";

export async function loadLeaguePage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) {
      notFound();
    }
    throw error;
  }
}
