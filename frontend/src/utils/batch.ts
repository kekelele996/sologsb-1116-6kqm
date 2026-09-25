import type { CollectBatch, FungusRecord, IdentifyLog, SporePrint } from '@/types'

/** 单条条目的缺口状态：缺孢子印 / 缺鉴定 / 待复核 */
export interface RecordGap {
  missingSpore: boolean
  missingIdentify: boolean
  needReview: boolean
}

/** 判断一条菌物条目在孢子印与鉴定留痕上的缺口 */
export function recordGap(recordId: string, spores: SporePrint[], logs: IdentifyLog[]): RecordGap {
  const recordLogs = logs
    .filter((item) => item.recordId === recordId)
    .sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
  const latest = recordLogs[0]
  return {
    missingSpore: !spores.some((item) => item.recordId === recordId),
    missingIdentify: !latest,
    needReview: latest?.needReview ?? false
  }
}

/** 批次进度统计：按计划采集点归拢其下条目 */
export interface BatchProgress {
  total: number
  missingSpore: number
  missingIdentify: number
  needReview: number
  /** 孢子印、鉴定齐全且无需复核的条目数 */
  ready: number
}

export function batchProgress(
  batch: CollectBatch,
  records: FungusRecord[],
  spores: SporePrint[],
  logs: IdentifyLog[]
): BatchProgress {
  const scoped = records.filter((item) => batch.pointIds.includes(item.pointId))
  const progress: BatchProgress = { total: scoped.length, missingSpore: 0, missingIdentify: 0, needReview: 0, ready: 0 }
  for (const item of scoped) {
    const gap = recordGap(item.id, spores, logs)
    if (gap.missingSpore) progress.missingSpore += 1
    if (gap.missingIdentify) progress.missingIdentify += 1
    if (gap.needReview) progress.needReview += 1
    if (!gap.missingSpore && !gap.missingIdentify && !gap.needReview) progress.ready += 1
  }
  return progress
}
