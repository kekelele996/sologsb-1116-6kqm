<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import type { CollectBatch } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { batchStore } from '@/stores/batchStore'
import { pointStore } from '@/stores/pointStore'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { identifyStore } from '@/stores/identifyStore'
import { buildBatchViews, summarizeBatch } from '@/utils/batch'
import { uid } from '@/utils/id'

const route = useRoute()
const router = useRouter()
const batchState = useStore(batchStore)
const pointState = useStore(pointStore)
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const identifyState = useStore(identifyStore)

/* ---------- 建批次 / 编辑表单 ---------- */
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const editingId = ref<string | null>(null)
const form = reactive({
  code: '',
  leader: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  note: '',
  pointIds: [] as string[]
})

/** 编号重复当场拦截（编辑时排除自身） */
const validateCode = (_rule: unknown, value: string, callback: (error?: Error) => void): void => {
  const code = value.trim()
  if (!code) {
    callback(new Error('请填写批次编号'))
    return
  }
  if (batchStore.getState().codeTaken(code, editingId.value ?? undefined)) {
    callback(new Error(`批次编号「${code}」已存在，请换一个`))
    return
  }
  callback()
}

/** 截止日期不得早于起始日期，倒置当场拦截 */
const validateEndDate = (_rule: unknown, value: string, callback: (error?: Error) => void): void => {
  if (!value) {
    callback(new Error('请选择截止日期'))
    return
  }
  if (form.startDate && value < form.startDate) {
    callback(new Error('截止日期不能早于起始日期'))
    return
  }
  callback()
}

const rules: FormRules = {
  code: [{ validator: validateCode, trigger: 'blur' }],
  leader: [{ required: true, message: '请填写负责人', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择起始日期', trigger: 'change' }],
  endDate: [{ validator: validateEndDate, trigger: 'change' }],
  pointIds: [
    {
      type: 'array',
      required: true,
      min: 1,
      message: '请至少勾选一个计划采集点',
      trigger: 'change'
    }
  ]
}

/** 改起始日期后重新校验截止日期，避免倒置残留 */
watch(
  () => form.startDate,
  () => {
    if (editingId.value || dialogVisible.value) formRef.value?.validateField('endDate').catch(() => undefined)
  }
)

function resetForm(): void {
  editingId.value = null
  form.code = ''
  form.leader = ''
  form.startDate = new Date().toISOString().slice(0, 10)
  form.endDate = form.startDate
  form.note = ''
  form.pointIds = []
  formRef.value?.clearValidate()
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(batch: CollectBatch): void {
  editingId.value = batch.id
  form.code = batch.code
  form.leader = batch.leader
  form.startDate = batch.startDate
  form.endDate = batch.endDate
  form.note = batch.note
  form.pointIds = [...batch.pointIds]
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

/** 截止选择器直接禁掉起始日期之前的日子，倒置在选择时就拦住 */
function disableEndDate(date: Date): boolean {
  return !!form.startDate && date.toISOString().slice(0, 10) < form.startDate
}

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const now = new Date().toISOString()
  const row: CollectBatch = {
    id: editingId.value ?? uid('bt'),
    code: form.code.trim(),
    leader: form.leader.trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    note: form.note.trim(),
    pointIds: [...form.pointIds],
    createdAt: editingId.value
      ? batchState.batches.find((item) => item.id === editingId.value)?.createdAt ?? now
      : now
  }
  await batchStore.getState().save(row)
  ElMessage.success(editingId.value ? '批次安排已更新' : `批次 ${row.code} 已建立`)
  dialogVisible.value = false
}

/* ---------- 批次列表 ---------- */
function pointName(pointId: string): string {
  return pointState.points.find((point) => point.id === pointId)?.name ?? '采集点已删除'
}

const rows = computed(() =>
  batchState.batches.map((batch) => {
    const views = buildBatchViews(
      batch,
      pointState.points,
      recordState.records,
      sporeState.spores,
      identifyState.logs
    )
    return { batch, views, summary: summarizeBatch(views) }
  })
)

async function remove(batch: CollectBatch): Promise<void> {
  await ElMessageBox.confirm(
    `确认移除批次「${batch.code}」？只会删掉这次批次安排，计划内的采集点、条目、孢子印与鉴定留痕全部保留。`,
    '移除批次',
    { type: 'warning', confirmButtonText: '仅移除批次安排' }
  )
  await batchStore.getState().remove(batch.id)
  ElMessage.success('批次安排已移除，下级数据未改动')
}

/** 详情页带 ?edit=id 回来时直接打开编辑弹窗 */
watch(
  () => route.query.edit,
  (editId) => {
    if (typeof editId !== 'string' || !editId) return
    const target = batchState.batches.find((item) => item.id === editId)
    if (target) openEdit(target)
    void router.replace({ path: '/batches' })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">采集批次</h2>
        <p class="page-sub">
          按野外任务批次登记编号、负责人、起止日期并勾选计划采集点；编号重复与日期倒置在建批次时当场拦住。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新建批次
      </el-button>
    </div>

    <el-table :data="rows" border stripe class="batch-table">
      <el-table-column label="批次编号" min-width="150">
        <template #default="{ row }">
          <router-link class="batch-link mono" :to="`/batches/${row.batch.id}`">{{ row.batch.code }}</router-link>
        </template>
      </el-table-column>
      <el-table-column prop="batch.leader" label="负责人" width="100" />
      <el-table-column label="起止日期" width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.batch.startDate }} ~ {{ row.batch.endDate }}</span>
        </template>
      </el-table-column>
      <el-table-column label="计划采集点" min-width="200">
        <template #default="{ row }">
          <el-tag v-for="pointId in row.batch.pointIds" :key="pointId" size="small" effect="plain" class="point-tag">
            {{ pointName(pointId) }}
          </el-tag>
          <span v-if="row.batch.pointIds.length === 0" class="muted">未安排</span>
        </template>
      </el-table-column>
      <el-table-column label="条目 / 待办" width="260">
        <template #default="{ row }">
          <span class="muted">共 {{ row.summary.recordCount }} 条</span>
          <el-tag v-if="row.summary.missingSpore" type="info" size="small" effect="plain">
            缺孢子印 {{ row.summary.missingSpore }}
          </el-tag>
          <el-tag v-if="row.summary.missingId" type="warning" size="small" effect="plain">
            缺鉴定 {{ row.summary.missingId }}
          </el-tag>
          <el-tag v-if="row.summary.review" type="danger" size="small" effect="plain">
            待复核 {{ row.summary.review }}
          </el-tag>
          <el-tag v-if="row.summary.complete" type="success" size="small" effect="dark">已收齐</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="router.push(`/batches/${row.batch.id}`)">详情</el-button>
          <el-button size="small" @click="openEdit(row.batch)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="remove(row.batch)">移除</el-button>
        </template>
      </el-table-column>
      <template #empty>暂无批次，点「新建批次」安排一次野外采集任务</template>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑批次安排' : '新建批次'" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="批次编号" prop="code" required>
              <el-input v-model="form.code" placeholder="如 BHS-2026-A" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人" prop="leader" required>
              <el-input v-model="form.leader" placeholder="本次野外任务负责人" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="起始日期" prop="startDate" required>
              <el-date-picker
                v-model="form.startDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="截止日期" prop="endDate" required>
              <el-date-picker
                v-model="form.endDate"
                type="date"
                value-format="YYYY-MM-DD"
                :disabled-date="disableEndDate"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="计划采集点" prop="pointIds" required>
          <el-checkbox-group v-model="form.pointIds" class="point-pick">
            <el-checkbox v-for="point in pointState.points" :key="point.id" :value="point.id" border>
              {{ point.name }}
              <span class="muted"> · {{ point.vegetation }} · {{ point.substrate }}</span>
            </el-checkbox>
            <span v-if="pointState.points.length === 0" class="muted">
              还没有采集点，请先到「采集点管理」建立
            </span>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="如 秋季栎树林样线复查，重点补孢子印" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">{{ editingId ? '保存修改' : '建立批次' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.batch-table {
  border-radius: 12px;
}
.batch-link {
  color: var(--gb-accent);
  font-weight: 600;
  text-decoration: none;
}
.batch-link:hover {
  text-decoration: underline;
}
.point-tag {
  margin: 2px 6px 2px 0;
}
.point-pick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.point-pick :deep(.el-checkbox) {
  margin-right: 0;
}
</style>
