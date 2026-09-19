import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function readEvents(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.events && typeof parsed.events === 'object'
      ? { ...parsed.events }
      : {};
  } catch {
    return {};
  }
}

export class EventStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.events = readEvents(filePath);
  }

  claim(eventId) {
    if (typeof eventId !== 'string' || !eventId) throw new Error('Event-ID fehlt.');
    if (Object.prototype.hasOwnProperty.call(this.events, eventId)) return false;
    this.events[eventId] = { claimedAt: new Date().toISOString() };
    this.#persist();
    return true;
  }

  #persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = join(dirname(this.filePath), `.${process.pid}-${Date.now()}-events.tmp`);
    writeFileSync(tempPath, JSON.stringify({ version: 1, events: this.events }, null, 2) + '\n', { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }
}
