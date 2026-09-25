import type { CollectBatch, CollectPoint, FungusRecord, IdentifyLog, SporePrint } from '@/types'

/** 单条目在批次视角下的齐备状态：缺孢子印 / 缺鉴定 / 待复核 / 齐备 */
export type BatchTodoState = 'missing-spore' | 'missing-id' | 'review' | 'ready'

export interface BatchRecordView {
  record: FungusRecord
  spore: SporePrint | null
  log: IdentifyLog | null
  todo: BatchTodoState
}

export interface BatchPointView {
  /** 批次中引用的采集点 id（采集点可能已被删除） */
  pointId: string
  point: CollectPoint | null
  records: BatchRecordView[]
  missingSpore: number
  missingId: number
  review: number
  ready: number
}

export interface BatchSummary {
  pointCount: number
  recordCount: number
  missingSpore: number
  missingId: number
  review: number
  ready: number
  /** 有条目且无任何待办才算收齐 */
  complete: boolean
}

export const BATCH_TODO_LABELS: Record<BatchTodoState, string> = {
  'missing-spore': '缺孢子印',
  'missing-id': '缺鉴定',
  review: '待复核',
  ready: '齐备'
}

function latestLog(logs: IdentifyLog[], recordId: string): IdentifyLog | null {
  return logs.find((item) => item.recordId === recordId) ?? null
}

function sporeOf(spores: SporePrint[], recordId: string): SporePrint | null {
  return spores.find((item) => item.recordId === recordId) ?? null
}

/** 按条目判定待办状态：先看孢子印，再看鉴定结论，最后看待复核标记 */
export function todoOf(spore: SporePrint | null, log: IdentifyLog | null): BatchTodoState {
  if (!spore) return 'missing-spore'
  if (!log) return 'missing-id'
  if (log.needReview) return 'review'
  return 'ready'
}

/** 批次详情：按计划采集点归拢该点下全部条目，并统计三类待办 */
export function buildBatchViews(
  batch: CollectBatch,
  points: CollectPoint[],
  records: FungusRecord[],
  spores: SporePrint[],
  logs: IdentifyLog[]
): BatchPointView[] {
  return batch.pointIds.map((pointId) => {
    const point = points.find((item) => item.id === pointId) ?? null
    const views: BatchRecordView[] = records
      .filter((record) => record.pointId === pointId)
      .map((record) => {
        const spore = sporeOf(spores, record.id)
        const log = latestLog(logs, record.id)
        return { record, spore, log, todo: todoOf(spore, log) }
      })
    views.sort((a, b) => a.record.code.localeCompare(b.record.code, 'zh-Hans-CN'))
    return {
      pointId,
      point,
      records: views,
      missingSpore: views.filter((item) => item.todo === 'missing-spore').length,
      missingId: views.filter((item) => item.todo === 'missing-id').length,
      review: views.filter((item) => item.todo === 'review').length,
      ready: views.filter((item) => item.todo === 'ready').length
    }
  })
}

/** 汇总整批次待办，用于列表进度与详情顶部统计 */
export function summarizeBatch(views: BatchPointView[]): BatchSummary {
  const summary: BatchSummary = {
    pointCount: views.length,
    recordCount: 0,
    missingSpore: 0,
    missingId: 0,
    review: 0,
    ready: 0,
    complete: false
  }
  for (const view of views) {
    summary.recordCount += view.records.length
    summary.missingSpore += view.missingSpore
    summary.missingId += view.missingId
    summary.review += view.review
    summary.ready += view.ready
  }
  summary.complete = summary.recordCount > 0 && summary.missingSpore + summary.missingId + summary.review === 0
  return summary
}
