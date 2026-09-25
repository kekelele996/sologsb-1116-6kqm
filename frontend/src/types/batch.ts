/** 批次计划调整动作 */
export const BATCH_ADJUST_ACTIONS = ['加入采集点', '移出采集点'] as const
export type BatchAdjustAction = (typeof BATCH_ADJUST_ACTIONS)[number]

/** 批次计划调整留痕（只记录安排变化，不触碰采集点与条目数据） */
export interface BatchAdjustLog {
  date: string
  action: BatchAdjustAction
  pointId: string
  /** 调整时的采集点名称快照，采集点日后删除仍可查 */
  pointName: string
}

/** CollectBatch 采集批次 */
export interface CollectBatch {
  id: string
  /** 批次编号（唯一） */
  code: string
  /** 负责人 */
  leader: string
  /** 开始日期 */
  startDate: string
  /** 结束日期 */
  endDate: string
  /** 计划采集点 id 列表 */
  pointIds: string[]
  /** 计划调整留痕 */
  adjustLogs: BatchAdjustLog[]
  /** 备注（本批次调查目标） */
  note: string
}
