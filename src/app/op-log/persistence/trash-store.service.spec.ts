import { TestBed } from '@angular/core/testing';

import { TrashStoreService } from './trash-store.service';
import { STORE_NAMES } from './db-keys.const';
import { TrashedItem, TrashEntityType } from '../../features/trash/trash.model';

/**
 * These specs drive the real `idb` stack against the in-memory `fake-indexeddb`
 * engine installed by `src/test.ts`, which swaps in a fresh `IDBFactory` before
 * every spec. No database names or cleanup are needed here: each spec starts
 * from version 0, so `runDbUpgrade` builds the trash store and its indexes for
 * real rather than against a mock.
 */
describe('TrashStoreService', () => {
  let service: TrashStoreService;

  const item = (
    id: string,
    deletedAt: number,
    entityType: TrashEntityType = 'TASK',
  ): TrashedItem => ({
    id,
    entityType,
    data: { id, title: id },
    restoreContext: { tagIds: [], subTaskIds: [], backlog: false },
    deletedAt,
  });

  const idsOf = (items: TrashedItem[]): string[] => items.map((i) => i.id).sort();

  /** The connection the service is currently caching, typed just enough to spy on. */
  interface CachedDb {
    getAll: (storeName: string) => Promise<TrashedItem[]>;
    objectStoreNames: DOMStringList;
  }
  const cachedDb = (): CachedDb => (service as unknown as { _db: CachedDb })._db;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TrashStoreService] });
    service = TestBed.inject(TrashStoreService);
  });

  describe('put / getAll / getById', () => {
    it('should round-trip stored items', async () => {
      await service.put([item('T1', 1000), item('T2', 2000)]);

      expect(idsOf(await service.getAll())).toEqual(['T1', 'T2']);
    });

    it('should upsert on a repeated id so one record survives, last write winning', async () => {
      await service.put([item('T1', 1000)]);
      await service.put([item('T1', 5000)]);

      const all = await service.getAll();
      expect(all.length).toBe(1);
      expect(all[0].deletedAt).toBe(5000);
    });

    it('should return undefined for an id that was never stored', async () => {
      expect(await service.getById('nope')).toBeUndefined();
    });

    it('should not open the database for an empty put', async () => {
      await service.put([]);

      // The early return must come before _ensureInit, otherwise a no-op write
      // opens (and on iOS re-opens) a connection for nothing.
      expect((service as unknown as { _db?: unknown })._db).toBeUndefined();
    });
  });

  describe('getAllByType', () => {
    it('should return only items of the requested entity type', async () => {
      await service.put([
        item('T1', 1000),
        item('T2', 2000),
        // Cast: the union is currently TASK-only, but the entityType index is
        // the whole reason records carry the discriminator. A second type must
        // stay filtered out once the union grows.
        item('N1', 3000, 'NOTE' as TrashEntityType),
      ]);

      expect(idsOf(await service.getAllByType('TASK'))).toEqual(['T1', 'T2']);
    });

    it('should return an empty list when no item has that type', async () => {
      await service.put([item('N1', 1000, 'NOTE' as TrashEntityType)]);

      expect(await service.getAllByType('TASK')).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should delete the named ids and leave the rest', async () => {
      await service.put([item('T1', 1000), item('T2', 2000), item('T3', 3000)]);

      await service.remove(['T1', 'T3']);

      expect(idsOf(await service.getAll())).toEqual(['T2']);
    });

    it('should ignore ids that are not stored', async () => {
      await service.put([item('T1', 1000)]);

      await service.remove(['ghost']);

      expect(idsOf(await service.getAll())).toEqual(['T1']);
    });

    it('should not open the database for an empty remove', async () => {
      await service.remove([]);

      expect((service as unknown as { _db?: unknown })._db).toBeUndefined();
    });
  });

  describe('removeExpired', () => {
    // The range is IDBKeyRange.upperBound(cutoff, true) — EXCLUSIVE. An item
    // deleted exactly at the cutoff is still inside the retention window, so
    // flipping this bound silently purges a whole day early.
    it('should purge strictly older items and keep one exactly at the cutoff', async () => {
      await service.put([
        item('older', 999),
        item('atCutoff', 1000),
        item('newer', 1001),
      ]);

      await service.removeExpired(1000);

      expect(idsOf(await service.getAll())).toEqual(['atCutoff', 'newer']);
    });

    it('should return the ids it removed', async () => {
      await service.put([item('old1', 100), item('old2', 200), item('keep', 5000)]);

      const removed = await service.removeExpired(1000);

      expect(removed.sort()).toEqual(['old1', 'old2']);
    });

    it('should return an empty list and keep everything when nothing has expired', async () => {
      await service.put([item('T1', 5000), item('T2', 6000)]);

      expect(await service.removeExpired(1000)).toEqual([]);
      expect(idsOf(await service.getAll())).toEqual(['T1', 'T2']);
    });

    it('should tolerate an empty store', async () => {
      expect(await service.removeExpired(Date.now())).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should drop every record', async () => {
      await service.put([item('T1', 1000), item('T2', 2000)]);

      await service.clear();

      expect(await service.getAll()).toEqual([]);
    });
  });

  describe('connection-closing recovery (#6643)', () => {
    const connectionClosingError = (): DOMException =>
      new DOMException(
        "Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.",
        'InvalidStateError',
      );

    it('should drop the stale handle, re-open, and retry the read once', async () => {
      await service.put([item('T1', 1000)]);

      // iOS/Capacitor can close the connection underneath us; the cached
      // IDBDatabase then rejects every call until it is replaced.
      const staleDb = cachedDb();
      let hasThrown = false;
      spyOn(staleDb, 'getAll').and.callFake(() => {
        hasThrown = true;
        throw connectionClosingError();
      });

      const all = await service.getAll();

      expect(hasThrown).toBe(true);
      expect(idsOf(all)).toEqual(['T1']);
    });

    it('should rethrow an unrelated error instead of retrying', async () => {
      await service.put([item('T1', 1000)]);

      const getAllSpy = spyOn(cachedDb(), 'getAll').and.throwError('boom');

      await expectAsync(service.getAll()).toBeRejectedWithError('boom');
      expect(getAllSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('schema', () => {
    it('should create the trash store with both query indexes', async () => {
      await service.put([item('T1', 1000)]);

      expect(Array.from(cachedDb().objectStoreNames)).toContain(STORE_NAMES.TRASH);
    });
  });
});
