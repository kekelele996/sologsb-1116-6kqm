/** CollectBatch 采集批次 */
export interface CollectBatch {
  id: string
  /** 批次编号（唯一） */
  code: string
  /** 负责人 */
  leader: string
  /** 起始日期（YYYY-MM-DD） */
  startDate: string
  /** 截止日期（YYYY-MM-DD） */
  endDate: string
  /** 备注 */
  note: string
  /** 本次安排勾选的计划采集点（仅批次安排，移除不影响采集点本身） */
  pointIds: string[]
  createdAt: string
}
