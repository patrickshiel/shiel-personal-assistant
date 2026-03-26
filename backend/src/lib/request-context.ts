import { AsyncLocalStorage } from "node:async_hooks";

type ContextState = {
  userId?: string;
};

const store = new AsyncLocalStorage<ContextState>();

export function runWithContext<T>(state: ContextState, fn: () => T): T {
  return store.run(state, fn);
}

export function getContextUserId(): string | undefined {
  return store.getStore()?.userId;
}
