import { Injectable, inject } from '@angular/core';
import { CatalogUseCases } from '../application/catalog.use-cases';
import { ChannelSchedule } from '../domain/media';

/** Share EPG requests across cards/player; retain only a bounded one-minute cache. */
@Injectable({ providedIn: 'root' })
export class ScheduleStore {
  private readonly catalog = inject(CatalogUseCases);
  private readonly entries = new Map<
    string,
    { expires: number; result: Promise<ChannelSchedule> }
  >();
  get(id: string) {
    const cached = this.entries.get(id);
    if (cached && cached.expires > Date.now()) return cached.result;
    const result = Promise.resolve().then(() => this.catalog.schedule(id));
    const entry = { expires: Date.now() + 60_000, result };
    this.entries.delete(id);
    this.entries.set(id, entry);
    if (this.entries.size > 128) this.entries.delete(this.entries.keys().next().value!);
    void result.catch(() => {
      if (this.entries.get(id) === entry) this.entries.delete(id);
    });
    return result;
  }
}
