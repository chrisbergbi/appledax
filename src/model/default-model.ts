import type { DataModel } from './types';
import defaultModelData from './default-model.json';
import { setModel } from './store';

/**
 * Load the built-in default model into the store.
 * This model is used when no user-uploaded model is present.
 */
export function loadDefaultModel(): void {
  const model = defaultModelData as DataModel;
  setModel(model, true);
}

/**
 * Re-load the default model (e.g. after user clears their uploaded model).
 */
export function restoreDefaultModel(): void {
  loadDefaultModel();
}
