import { writable } from 'svelte/store';

export const globalLoading = writable(false);

export function startGlobalLoading() {
  globalLoading.set(true);
}

export function stopGlobalLoading() {
  globalLoading.set(false);
}

// Удобный helper, если захочешь оборачивать async-операции
export async function withGlobalLoading<T>(fn: () => Promise<T>): Promise<T> {
  startGlobalLoading();
  try {
    return await fn();
  } finally {
    stopGlobalLoading();
  }
}
