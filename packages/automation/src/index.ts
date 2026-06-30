/**
 * @rg/automation — public API.
 *
 * The desktop utility process imports from here only. The marketplace step
 * modules are intentionally NOT re-exported — they are internal implementation
 * details behind the `MarketplaceAdapter` interface.
 */

export { runAutomation } from './run.js';
export type { AutomationJob, AutomationResult, AutomationEvent } from './run.js';

// Engine pieces a host might want to configure/inspect.
export { parseProxyConfig } from './engine/browser.js';
export type { ProxyConfig } from './engine/browser.js';

// Marketplace contract (for future adapters / typing).
export type { MarketplaceAdapter, AdapterJob, AdapterResult } from './marketplaces/types.js';
