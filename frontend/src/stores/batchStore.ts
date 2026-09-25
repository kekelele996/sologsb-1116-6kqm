import { createStore } from 'zustand/vanilla'
import type { CollectBatch } from '@/types'
import { db, syncAll, syncDelete, syncPut } from '@/hooks/usePersistentStore'

export interface BatchState {
  batches: CollectBatch[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (batch: CollectBatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const batchStore = createStore<BatchState>((set, get) => ({
  batches: [],
  loaded: false,
  hydrate: async () => {
    const batches = await syncAll<CollectBatch>(db.batches)
    batches.sort((a, b) => (b.startDate + b.code).localeCompare(a.startDate + a.code))
    set({ batches, loaded: true })
  },
  save: async (batch) => {
    await syncPut<CollectBatch>(db.batches, batch)
    await get().hydrate()
  },
  remove: async (id) => {
    await syncDelete<CollectBatch>(db.batches, id)
    await get().hydrate()
  }
}))
