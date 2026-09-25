<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { CollectBatch, CollectPoint, FungusRecord, IdentifyLog } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { pointStore } from '@/stores/pointStore'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { identifyStore } from '@/stores/identifyStore'
import { batchProgress, recordGap, type RecordGap } from '@/utils/batch'

interface PointGroup {
  pointId: string
  point: CollectPoint | null
  records: FungusRecord[]
}

const route = useRoute()
const router = useRouter()
const batchState = useStore(batchStore)
const pointState = useStore(pointStore)
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const identifyState = useStore(identifyStore)

const batch = computed(() => batchState.batches.find((item) => item.id === route.params.id) ?? null)

/** 按计划采集点归拢条目；采集点被删时保留占位，便于从批次中移出 */
const groups = computed<PointGroup[]>(() => {
  const current = batch.value
  if (!current) return []
  return current.pointIds.map((pointId) => ({
    pointId,
    point: pointState.points.find((item) => item.id === pointId) ?? null,
    records: recordState.records.filter((item) => item.pointId === pointId)
  }))
})

const progress = computed(() =>
  batch.value
    ? batchProgress(batch.value, recordState.records, sporeState.spores, identifyState.logs)
    : { total: 0, missingSpore: 0, missingIdentify: 0, needReview: 0, ready: 0 }
)

/** 全量条目的缺口状态，避免模板内重复计算 */
const gapMap = computed(() => {
  const map = new Map<string, RecordGap>()
  for (const record of recordState.records) {
    map.set(record.id, recordGap(record.id, sporeState.spores, identifyState.logs))
  }
  return map
})

function gapOf(recordId: string): RecordGap {
  return gapMap.value.get(recordId) ?? { missingSpore: true, missingIdentify: true, needReview: false }
}

/** 每条目的最新鉴定结论（logs 已按日期倒序水合） */
const latestLogMap = computed(() => {
  const map = new Map<string, IdentifyLog>()
  for (const log of identifyState.logs) {
    if (!map.has(log.recordId)) map.set(log.recordId, log)
  }
  return map
})

function latestConclusion(recordId: string): string {
  const log = latestLogMap.value.get(recordId)
  return log ? `${log.conclusion}（${log.confidence}）` : '—'
}

/** 尚未纳入本批次计划的采集点 */
const candidatePoints = computed(() =>
  pointState.points.filter((item) => !batch.value?.pointIds.includes(item.id))
)

const addingPointId = ref('')

async function addPoint(): Promise<void> {
  const current = batch.value
  if (!current || !addingPointId.value) return
  const point = pointState.points.find((item) => item.id === addingPointId.value)
  if (!point) return
  const next: CollectBatch = {
    ...current,
    pointIds: [...current.pointIds, point.id],
    adjustLogs: [
      ...(current.adjustLogs ?? []),
      { date: new Date().toISOString().slice(0, 10), action: '加入采集点', pointId: point.id, pointName: point.name }
    ]
  }
  await batchStore.getState().save(next)
  ElMessage.success(`已将「${point.name}」加入本批次计划`)
  addingPointId.value = ''
}

/** 移出采集点：只改本批次安排并留痕，采集点、条目、孢子印与鉴定数据全部保留 */
async function removePoint(group: PointGroup): Promise<void> {
  const current = batch.value
  if (!current) return
  const name = group.point?.name ?? '已删除的采集点'
  try {
    await ElMessageBox.confirm(
      `将「${name}」从批次「${current.code}」移出？仅调整本次安排，该采集点及其 ${group.records.length} 条条目、孢子印与鉴定留痕全部保留。`,
      '移出采集点',
      { type: 'warning', confirmButtonText: '移出', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  const next: CollectBatch = {
    ...current,
    pointIds: current.pointIds.filter((id) => id !== group.pointId),
    adjustLogs: [
      ...(current.adjustLogs ?? []),
      { date: new Date().toISOString().slice(0, 10), action: '移出采集点', pointId: group.pointId, pointName: name }
    ]
  }
  await batchStore.getState().save(next)
  ElMessage.success(`「${name}」已移出本批次，原有采集数据保留`)
}
</script>

<template>
  <div class="page">
    <template v-if="batch">
      <div class="page-head">
        <div>
          <h2 class="page-title">批次 <span class="mono">{{ batch.code }}</span></h2>
          <p class="page-sub">
            负责人 {{ batch.leader }} · {{ batch.startDate }} ~ {{ batch.endDate }}
            <span v-if="batch.note"> · {{ batch.note }}</span>
          </p>
        </div>
        <el-button @click="router.push('/batches')">返回批次列表</el-button>
      </div>

      <div class="toolbar">
        <div class="summary-tags">
          <el-tag effect="plain" size="small">计划采集点 {{ batch.pointIds.length }}</el-tag>
          <el-tag type="warning" effect="plain" size="small">缺孢子印 {{ progress.missingSpore }}</el-tag>
          <el-tag type="danger" effect="plain" size="small">缺鉴定 {{ progress.missingIdentify }}</el-tag>
          <el-tag type="info" effect="plain" size="small">待复核 {{ progress.needReview }}</el-tag>
          <el-tag type="success" effect="plain" size="small">已齐备 {{ progress.ready }}/{{ progress.total }}</el-tag>
        </div>
        <div class="add-point">
          <el-select v-model="addingPointId" placeholder="选择要加入的采集点" size="small" style="width: 220px">
            <el-option v-for="point in candidatePoints" :key="point.id" :label="point.name" :value="point.id" />
          </el-select>
          <el-button size="small" type="primary" plain :disabled="!addingPointId" @click="addPoint">
            加入计划
          </el-button>
        </div>
      </div>

      <el-card v-for="group in groups" :key="group.pointId" shadow="never" class="point-group">
        <template #header>
          <div class="group-head">
            <div>
              <b>{{ group.point?.name ?? '采集点已删除' }}</b>
              <span v-if="group.point" class="muted">
                · {{ group.point.vegetation }} · {{ group.point.substrate }} · {{ group.point.altitude }} m
              </span>
            </div>
            <div class="group-actions">
              <el-tag effect="plain" size="small">条目 {{ group.records.length }}</el-tag>
              <el-button size="small" type="danger" plain @click="removePoint(group)">移出批次</el-button>
            </div>
          </div>
        </template>
        <el-table v-if="group.records.length > 0" :data="group.records" size="small">
          <el-table-column label="采集编号" width="150">
            <template #default="{ row }">
              <router-link :to="`/atlas/${row.id}`" class="mono code-link">{{ row.code }}</router-link>
            </template>
          </el-table-column>
          <el-table-column prop="tempName" label="暂定名" min-width="140" />
          <el-table-column prop="collectDate" label="采集日期" width="110" />
          <el-table-column label="采集人" width="90">
            <template #default="{ row }">{{ row.collector || '—' }}</template>
          </el-table-column>
          <el-table-column label="最新鉴定" min-width="150">
            <template #default="{ row }">{{ latestConclusion(row.id) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="220">
            <template #default="{ row }">
              <div class="status-tags">
                <el-tag v-if="gapOf(row.id).missingSpore" type="warning" effect="plain" size="small">缺孢子印</el-tag>
                <el-tag v-if="gapOf(row.id).missingIdentify" type="danger" effect="plain" size="small">缺鉴定</el-tag>
                <el-tag v-if="gapOf(row.id).needReview" type="info" effect="plain" size="small">待复核</el-tag>
                <el-tag
                  v-if="!gapOf(row.id).missingSpore && !gapOf(row.id).missingIdentify && !gapOf(row.id).needReview"
                  type="success"
                  effect="plain"
                  size="small"
                >
                  已齐备
                </el-tag>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="该采集点在本批次尚无条目，尚未收齐" :image-size="60" />
      </el-card>
      <el-empty v-if="groups.length === 0" description="本批次暂无计划采集点，可在上方加入" />

      <template v-if="(batch.adjustLogs ?? []).length > 0">
        <h3 class="section-title">计划调整留痕</h3>
        <el-timeline class="adjust-log">
          <el-timeline-item
            v-for="(log, index) in batch.adjustLogs"
            :key="`${log.pointId}-${index}`"
            :timestamp="log.date"
          >
            {{ log.action }}：{{ log.pointName }}（采集点、条目与鉴定数据均保留）
          </el-timeline-item>
        </el-timeline>
      </template>
    </template>

    <el-result v-else icon="warning" title="批次不存在" sub-title="该批次可能已被删除">
      <template #extra>
        <el-button type="primary" @click="router.push('/batches')">返回批次列表</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.toolbar {
  justify-content: space-between;
}
.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.add-point {
  display: flex;
  gap: 8px;
}
.point-group {
  border-radius: 12px;
  margin-bottom: 16px;
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.code-link {
  color: var(--gb-accent);
  text-decoration: none;
}
.code-link:hover {
  text-decoration: underline;
}
.status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.adjust-log {
  padding-left: 4px;
}
</style>
