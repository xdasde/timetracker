import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function readSubscriptions(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.subscriptions && typeof parsed.subscriptions === 'object'
      ? { ...parsed.subscriptions }
      : {};
  } catch {
    return {};
  }
}

export class SubscriptionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.subscriptions = readSubscriptions(filePath);
  }

  upsert(subscription) {
    this.subscriptions[subscription.endpoint] = {
      subscription,
      updatedAt: new Date().toISOString(),
    };
    this.#persist();
  }

  remove(endpoint) {
    if (!Object.prototype.hasOwnProperty.call(this.subscriptions, endpoint)) return false;
    delete this.subscriptions[endpoint];
    this.#persist();
    return true;
  }

  list() {
    return Object.values(this.subscriptions).map(entry => entry.subscription);
  }

  get size() {
    return Object.keys(this.subscriptions).length;
  }

  #persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = join(dirname(this.filePath), `.${process.pid}-${Date.now()}-subscriptions.tmp`);
    writeFileSync(tempPath, JSON.stringify({ version: 1, subscriptions: this.subscriptions }, null, 2) + '\n', { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }
}
