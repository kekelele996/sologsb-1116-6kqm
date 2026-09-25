<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { CollectBatch } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { pointStore } from '@/stores/pointStore'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { identifyStore } from '@/stores/identifyStore'
import { batchProgress, type BatchProgress } from '@/utils/batch'
import { uid } from '@/utils/id'

const router = useRouter()
const batchState = useStore(batchStore)
const pointState = useStore(pointStore)
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const identifyState = useStore(identifyStore)

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  code: '',
  leader: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  pointIds: [] as string[],
  note: ''
})

/** 编号重复、日期倒置均通过表单规则当场拦截 */
const rules: FormRules = {
  code: [
    {
      validator: (_rule, value: string, callback) => {
        const code = (value ?? '').trim()
        if (!code) {
          callback(new Error('请填写批次编号'))
          return
        }
        const duplicated = batchState.batches.some(
          (item) => item.code.trim().toLowerCase() === code.toLowerCase()
        )
        if (duplicated) {
          callback(new Error(`批次编号「${code}」已存在，请更换`))
          return
        }
        callback()
      },
      trigger: 'blur'
    }
  ],
  leader: [{ required: true, message: '请填写负责人', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [
    { required: true, message: '请选择结束日期', trigger: 'change' },
    {
      validator: (_rule, value: string, callback) => {
        if (value && form.startDate && value < form.startDate) {
          callback(new Error('结束日期不能早于开始日期'))
          return
        }
        callback()
      },
      trigger: 'change'
    }
  ],
  pointIds: [{ type: 'array', required: true, min: 1, message: '请至少勾选一个计划采集点', trigger: 'change' }]
}

/** 开始日期变动后联动复核结束日期，避免先填结束再改开始造成的倒置漏网 */
function onStartDateChange(): void {
  if (form.endDate) {
    formRef.value?.validateField('endDate').catch(() => undefined)
  }
}

async function openDialog(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  form.code = ''
  form.leader = ''
  form.startDate = today
  form.endDate = today
  form.pointIds = []
  form.note = ''
  dialogVisible.value = true
  await nextTick()
  formRef.value?.clearValidate()
}

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const batch: CollectBatch = {
    id: uid('bat'),
    code: form.code.trim(),
    leader: form.leader.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    pointIds: [...form.pointIds],
    adjustLogs: [],
    note: form.note.trim()
  }
  await batchStore.getState().save(batch)
  dialogVisible.value = false
  ElMessage.success(`批次「${batch.code}」已建立`)
}

const progressMap = computed(() => {
  const map = new Map<string, BatchProgress>()
  for (const batch of batchState.batches) {
    map.set(batch.id, batchProgress(batch, recordState.records, sporeState.spores, identifyState.logs))
  }
  return map
})

function progressOf(batchId: string): BatchProgress {
  return progressMap.value.get(batchId) ?? { total: 0, missingSpore: 0, missingIdentify: 0, needReview: 0, ready: 0 }
}

function percentOf(batchId: string): number {
  const progress = progressOf(batchId)
  if (progress.total === 0) return 0
  return Math.round((progress.ready / progress.total) * 100)
}

/** 批次收齐状态：有条目且全部齐备为「已收齐」，否则「待补齐」 */
function statusOf(batchId: string): { type: 'success' | 'warning' | 'info'; text: string } {
  const progress = progressOf(batchId)
  if (progress.total === 0) return { type: 'info', text: '暂无条目' }
  if (progress.ready === progress.total) return { type: 'success', text: '已收齐' }
  return { type: 'warning', text: '待补齐' }
}

function pointNames(batch: CollectBatch): string {
  return batch.pointIds
    .map((id) => pointState.points.find((item) => item.id === id)?.name ?? '采集点已删除')
    .join('、')
}

async function removeBatch(batch: CollectBatch): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除批次「${batch.code}」？仅删除本次批次安排，采集点、条目、孢子印与鉴定留痕全部保留。`,
      '删除批次',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  await batchStore.getState().remove(batch.id)
  ElMessage.success('批次已删除，相关采集数据保留')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">采集批次</h2>
        <p class="page-sub">
          按外业批次归拢计划采集点，随时查看各批次缺孢子印、缺鉴定与待复核的条目，确认哪次任务还没收齐。
        </p>
      </div>
      <el-button type="primary" @click="openDialog">新建批次</el-button>
    </div>

    <div class="card-grid">
      <el-card v-for="batch in batchState.batches" :key="batch.id" shadow="hover" class="batch-card">
        <div class="batch-head">
          <div class="batch-title">
            <span class="mono batch-code">{{ batch.code }}</span>
            <el-tag :type="statusOf(batch.id).type" size="small">{{ statusOf(batch.id).text }}</el-tag>
          </div>
          <span class="muted">{{ batch.startDate }} ~ {{ batch.endDate }}</span>
        </div>
        <el-descriptions :column="1" size="small" border class="desc">
          <el-descriptions-item label="负责人">{{ batch.leader }}</el-descriptions-item>
          <el-descriptions-item label="计划采集点">
            {{ pointNames(batch) || '—' }}（{{ batch.pointIds.length }} 个）
          </el-descriptions-item>
          <el-descriptions-item label="备注">{{ batch.note || '—' }}</el-descriptions-item>
        </el-descriptions>
        <div class="gap-row">
          <el-tag type="warning" effect="plain" size="small">缺孢子印 {{ progressOf(batch.id).missingSpore }}</el-tag>
          <el-tag type="danger" effect="plain" size="small">缺鉴定 {{ progressOf(batch.id).missingIdentify }}</el-tag>
          <el-tag type="info" effect="plain" size="small">待复核 {{ progressOf(batch.id).needReview }}</el-tag>
          <el-tag type="success" effect="plain" size="small">
            已齐备 {{ progressOf(batch.id).ready }}/{{ progressOf(batch.id).total }}
          </el-tag>
        </div>
        <el-progress :percentage="percentOf(batch.id)" :stroke-width="8" class="progress" />
        <div class="batch-actions">
          <el-button size="small" type="primary" @click="router.push(`/batches/${batch.id}`)">批次详情</el-button>
          <el-button size="small" type="danger" plain @click="removeBatch(batch)">删除批次</el-button>
        </div>
      </el-card>
      <el-empty v-if="batchState.batches.length === 0" description="暂无采集批次，点击右上角新建" />
    </div>

    <el-dialog v-model="dialogVisible" title="新建采集批次" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="批次编号" prop="code">
          <el-input v-model="form.code" placeholder="如 PC-2026-10" clearable />
        </el-form-item>
        <el-form-item label="负责人" prop="leader">
          <el-input v-model="form.leader" placeholder="本次外业负责人" clearable />
        </el-form-item>
        <el-form-item label="开始日期" prop="startDate">
          <el-date-picker
            v-model="form.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择开始日期"
            style="width: 100%"
            @change="onStartDateChange"
          />
        </el-form-item>
        <el-form-item label="结束日期" prop="endDate">
          <el-date-picker
            v-model="form.endDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="计划采集点" prop="pointIds">
          <div class="point-checks">
            <el-checkbox-group v-model="form.pointIds">
              <el-checkbox v-for="point in pointState.points" :key="point.id" :value="point.id">
                {{ point.name }}
              </el-checkbox>
            </el-checkbox-group>
            <p v-if="pointState.points.length === 0" class="muted empty-tip">
              暂无采集点，请先在「采集点管理」中建立
            </p>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="本批次调查目标（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="pointState.points.length === 0" @click="submit">建立批次</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.batch-card {
  border-radius: 12px;
}
.batch-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}
.batch-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.batch-code {
  font-size: 15px;
  font-weight: 600;
}
.desc {
  margin-bottom: 10px;
}
.gap-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.progress {
  margin-bottom: 12px;
}
.batch-actions {
  display: flex;
  gap: 8px;
}
.point-checks {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.empty-tip {
  margin: 4px 0 0;
}
</style>
