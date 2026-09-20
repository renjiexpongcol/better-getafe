import { config } from '../config/index.js';
export const effectiveSettings = async () => config.snapshot();
export const updateSettings = (values, actor) => config.update(values, actor);
export const settingsHistory = async () => config.provider.history();
