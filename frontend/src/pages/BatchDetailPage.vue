<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { pointStore } from '@/stores/pointStore'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { identifyStore } from '@/stores/identifyStore'
import {
  BATCH_TODO_LABELS,
  buildBatchViews,
  summarizeBatch,
  type BatchPointView,
  type BatchTodoState
} from '@/utils/batch'

const route = useRoute()
const router = useRouter()
const batchState = useStore(batchStore)
const pointState = useStore(pointStore)
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const identifyState = useStore(identifyStore)

const batch = computed(
  () => batchState.batches.find((item) => item.id === route.params.id) ?? null
)

const views = computed<BatchPointView[]>(() => {
  if (!batch.value) return []
  return buildBatchViews(
    batch.value,
    pointState.points,
    recordState.records,
    sporeState.spores,
    identifyState.logs
  )
})

const summary = computed(() => summarizeBatch(views.value))

const TODO_TAG_TYPE: Record<BatchTodoState, 'info' | 'warning' | 'danger' | 'success'> = {
  'missing-spore': 'info',
  'missing-id': 'warning',
  review: 'danger',
  ready: 'success'
}

function todoTagType(todo: BatchTodoState): 'info' | 'warning' | 'danger' | 'success' {
  return TODO_TAG_TYPE[todo]
}

/** 从本次批次安排中移走采集点：只删批次里的引用，采集点与其条目/孢子印/鉴定一律保留 */
async function removePoint(view: BatchPointView): Promise<void> {
  if (!batch.value) return
  const label = view.point ? `「${view.point.name}」` : '该采集点'
  await ElMessageBox.confirm(
    `确认把 ${label} 从批次 ${batch.value.code} 的本次安排中移走？原有采集点、菌物条目、孢子印与鉴定留痕都会保留，只是不再归到本批次下。`,
    '移走采集点',
    { type: 'warning', confirmButtonText: '只调整本次安排' }
  )
  await batchStore.getState().save({
    ...batch.value,
    pointIds: batch.value.pointIds.filter((id) => id !== view.pointId)
  })
  ElMessage.success('已从本次安排移走，下级数据均已保留')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div v-if="batch">
        <h2 class="page-title">
          批次 {{ batch.code }}
          <el-tag v-if="summary.complete" type="success" effect="dark" size="small">已收齐</el-tag>
          <el-tag v-else type="warning" effect="plain" size="small">有待办</el-tag>
        </h2>
        <p class="page-sub">
          负责人 {{ batch.leader || '—' }} · 周期
          <span class="mono">{{ batch.startDate }} ~ {{ batch.endDate }}</span>
          <template v-if="batch.note"> · {{ batch.note }}</template>
        </p>
      </div>
      <div v-else>
        <h2 class="page-title">批次详情</h2>
        <p class="page-sub">未找到该批次，可能已被移除。</p>
      </div>
      <div class="head-actions">
        <el-button @click="router.push('/batches')">返回批次列表</el-button>
        <el-button
          v-if="batch"
          type="primary"
          @click="router.push({ path: '/batches', query: { edit: batch.id } })"
        >
          编辑批次安排
        </el-button>
      </div>
    </div>

    <template v-if="batch">
      <div class="stat-strip">
        <div class="stat-item">
          <b>{{ summary.pointCount }}</b><span>计划采集点</span>
        </div>
        <div class="stat-item">
          <b>{{ summary.recordCount }}</b><span>归拢条目</span>
        </div>
        <div class="stat-item todo">
          <b>{{ summary.missingSpore }}</b><span>缺孢子印</span>
        </div>
        <div class="stat-item todo">
          <b>{{ summary.missingId }}</b><span>缺鉴定</span>
        </div>
        <div class="stat-item todo">
          <b>{{ summary.review }}</b><span>待复核</span>
        </div>
        <div class="stat-item done">
          <b>{{ summary.ready }}</b><span>已齐备</span>
        </div>
      </div>

      <el-card v-for="view in views" :key="view.pointId" shadow="never" class="point-block">
        <template #header>
          <div class="point-head">
            <div class="point-title">
              <span v-if="view.point">{{ view.point.name }}</span>
              <span v-else class="missing-title">采集点已删除（id: {{ view.pointId }}）</span>
              <el-tag size="small" effect="plain">{{ view.records.length }} 条条目</el-tag>
            </div>
            <div class="point-badges">
              <el-tag v-if="view.missingSpore" type="info" size="small" effect="plain">
                缺孢子印 {{ view.missingSpore }}
              </el-tag>
              <el-tag v-if="view.missingId" type="warning" size="small" effect="plain">
                缺鉴定 {{ view.missingId }}
              </el-tag>
              <el-tag v-if="view.review" type="danger" size="small" effect="plain">
                待复核 {{ view.review }}
              </el-tag>
              <el-tag v-if="view.records.length > 0 && view.ready === view.records.length" type="success" size="small" effect="dark">
                本点已齐
              </el-tag>
              <el-button size="small" type="danger" plain @click="removePoint(view)">从本次安排移走</el-button>
            </div>
          </div>
        </template>

        <div v-if="view.point" class="point-meta muted">
          {{ view.point.longitude.toFixed(4) }}, {{ view.point.latitude.toFixed(4) }} ·
          海拔 {{ view.point.altitude }} m · {{ view.point.vegetation }} ·
          基物 {{ view.point.substrate }}
          <template v-if="view.point.companionTrees"> · 伴生 {{ view.point.companionTrees }}</template>
        </div>

        <el-table :data="view.records" border stripe size="small" class="record-table">
          <el-table-column label="采集编号" min-width="150">
            <template #default="{ row }">
              <router-link class="rec-link mono" :to="`/atlas/${row.record.id}`">{{ row.record.code }}</router-link>
            </template>
          </el-table-column>
          <el-table-column prop="record.tempName" label="暂定名" min-width="160" />
          <el-table-column prop="record.collectDate" label="采集日期" width="120" />
          <el-table-column label="孢子印" width="110">
            <template #default="{ row }">
              <span v-if="row.spore">{{ row.spore.color }} · {{ row.spore.hours }}h</span>
              <span v-else class="missing-text">缺孢子印</span>
            </template>
          </el-table-column>
          <el-table-column label="鉴定结论" min-width="170">
            <template #default="{ row }">
              <span v-if="row.log">{{ row.log.conclusion }} · {{ row.log.confidence }}</span>
              <span v-else class="missing-text">缺鉴定</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="todoTagType(row.todo)" size="small" :effect="row.todo === 'ready' ? 'dark' : 'plain'">
                {{ BATCH_TODO_LABELS[row.todo as BatchTodoState] }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-if="view.records.length === 0"
          description="该计划采集点下还没有任何条目，现场还没采或条目尚未录入"
          :image-size="70"
        />
      </el-card>

      <el-empty
        v-if="views.length === 0"
        description="本批次还没有勾选任何计划采集点，点右上「编辑批次安排」补上"
      />
    </template>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 8px;
}
.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-item {
  flex: 1 1 120px;
  background: #fff;
  border: 1px solid #e8e2d6;
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat-item b {
  font-size: 22px;
}
.stat-item span {
  font-size: 12px;
  color: #7f8d82;
}
.stat-item.todo b {
  color: var(--gb-accent);
}
.stat-item.done b {
  color: var(--gb-moss);
}
.point-block {
  border-radius: 12px;
  margin-bottom: 14px;
}
.point-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.point-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.missing-title {
  color: #b06a3a;
  font-weight: 500;
}
.point-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.point-meta {
  margin-bottom: 10px;
}
.record-table {
  margin-top: 8px;
}
.rec-link {
  color: var(--gb-accent);
  text-decoration: none;
}
.rec-link:hover {
  text-decoration: underline;
}
.missing-text {
  color: #b06a3a;
}
</style>
