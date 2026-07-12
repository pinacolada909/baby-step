import { useState, useMemo } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBaby } from '@/contexts/BabyContext'
import { useFeedings, useAddFeeding, useDeleteFeeding } from '@/hooks/useFeedings'
import { useMilkStash, useUseMilkStash } from '@/hooks/useMilkStash'
import { useCaregivers } from '@/hooks/useCaregivers'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { queryKeys } from '@/lib/query-keys'
import type { Feeding, FeedingType, BabyCaregiver, MilkStash, ParsedFeedingData } from '@/types'
import { VoiceInputButton } from '@/components/voice/VoiceInputButton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Utensils, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString()
}

const TYPE_COLORS: Record<FeedingType, string> = {
  breastmilk: 'bg-pink-100 text-pink-700 border-pink-300',
  formula: 'bg-blue-100 text-blue-700 border-blue-300',
  ready_to_feed: 'bg-green-100 text-green-700 border-green-300',
}

const FEEDING_TYPES: FeedingType[] = ['breastmilk', 'formula', 'ready_to_feed']

export function FeedingTrackerPage() {
  const { t } = useLanguage()
  const { user, isDemo } = useAuth()
  const { selectedBaby } = useBaby()
  const babyId = isDemo ? undefined : selectedBaby?.id

  const { data: dbFeedings = [] } = useFeedings(babyId)
  const { data: caregivers = [] } = useCaregivers(babyId)
  const { data: dbStash = [] } = useMilkStash(babyId)
  const addMutation = useAddFeeding()
  const deleteMutation = useDeleteFeeding()
  const useStashMutation = useUseMilkStash()
  useRealtimeSync('feedings', babyId, queryKeys.feeding.byBaby(babyId ?? ''))

  const isPrimary = caregivers.some(
    (c: BabyCaregiver) => c.user_id === user?.id && c.role === 'primary',
  )
  const canDelete = (record: Feeding) =>
    isDemo || isPrimary || record.caregiver_id === user?.id

  const [demoFeedings, setDemoFeedings] = useState<Feeding[]>([])
  const feedings = isDemo ? demoFeedings : dbFeedings

  const [time, setTime] = useState(formatDatetimeLocal(new Date()))
  const [feedingType, setFeedingType] = useState<FeedingType>('breastmilk')
  const [volume, setVolume] = useState('')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedStashId, setSelectedStashId] = useState<string>('')
  const [period, setPeriod] = useState('day')

  // Available stash items for "From Stash" selector (FIFO order, oldest first)
  const availableStash = useMemo<MilkStash[]>(() => {
    if (isDemo) return []
    return dbStash
      .filter((s) => s.volume_ml - s.used_ml > 0)
      .sort((a, b) => new Date(a.stored_at).getTime() - new Date(b.stored_at).getTime())
  }, [dbStash, isDemo])

  const historyFeedings = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000
    return feedings.filter((f) => new Date(f.fed_at).getTime() >= cutoff)
  }, [feedings])

  const todayFeedings = useMemo(() => feedings.filter((f) => isToday(f.fed_at)), [feedings])
  const todayTotal = useMemo(() => todayFeedings.reduce((s, f) => s + (f.volume_ml ?? 0), 0), [todayFeedings])
  const todayAvg = useMemo(() => {
    const withVolume = todayFeedings.filter((f) => f.volume_ml)
    return withVolume.length > 0 ? todayTotal / withVolume.length : 0
  }, [todayFeedings, todayTotal])

  const chartData = useMemo(() => {
    const now = new Date()
    let startDate: Date
    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 86400000)
    } else {
      startDate = new Date(now.getTime() - 30 * 86400000)
    }
    const filtered = feedings.filter((f) => new Date(f.fed_at) >= startDate)
    const buckets: Record<string, { label: string; date: Date; breastmilk: number; formula: number; ready_to_feed: number }> = {}

    filtered.forEach((f) => {
      const d = new Date(f.fed_at)
      const label = period === 'day'
        ? `${d.getHours()}:00`
        : `${d.getMonth() + 1}/${d.getDate()}`
      if (!buckets[label]) buckets[label] = { label, date: d, breastmilk: 0, formula: 0, ready_to_feed: 0 }
      buckets[label][f.feeding_type] += f.volume_ml ?? 0
    })
    return Object.values(buckets)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(({ label, breastmilk, formula, ready_to_feed }) => ({ label, breastmilk, formula, ready_to_feed }))
  }, [feedings, period])

  const typeTranslation = (ft: FeedingType) => t(`feeding.type.${ft}` as `feeding.type.${'breastmilk' | 'formula' | 'ready_to_feed'}`)

  const handleExportCSV = () => {
    const header = ['Time', 'Type', 'Volume (mL)', 'Duration (min)', 'Notes']
    const rows = feedings.map((f) => [
      new Date(f.fed_at).toLocaleString(),
      f.feeding_type,
      f.volume_ml ?? '',
      f.duration_minutes ?? '',
      f.notes ?? '',
    ])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feeding-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAdd = async () => {
    const newTime = new Date(time).getTime()

    // Check for duplicate feeding at the same time
    const duplicate = feedings.find((f) => {
      const existTime = new Date(f.fed_at).getTime()
      return Math.abs(newTime - existTime) < 60_000 // within 1 minute
    })

    if (duplicate) {
      toast.error(t('feeding.overlap'))
      return
    }

    const vol = volume ? parseInt(volume, 10) : null
    const dur = duration ? parseInt(duration, 10) : null
    if ((vol !== null && (isNaN(vol) || vol < 0)) || (dur !== null && (isNaN(dur) || dur < 0))) {
      toast.error(t('common.error'))
      return
    }

    const feeding = {
      baby_id: babyId ?? 'demo',
      caregiver_id: user?.id ?? 'demo',
      fed_at: new Date(time).toISOString(),
      feeding_type: feedingType,
      volume_ml: vol,
      duration_minutes: dur,
      milk_stash_id: selectedStashId || null,
      notes: notes || null,
    }

    if (isDemo) {
      setDemoFeedings((prev) => [
        { ...feeding, id: crypto.randomUUID(), created_at: new Date().toISOString() },
        ...prev,
      ])
    } else {
      await addMutation.mutateAsync(feeding)
      // Auto-deduct from stash if selected
      if (selectedStashId && vol && vol > 0) {
        try {
          await useStashMutation.mutateAsync({ stashId: selectedStashId, volumeMl: vol, babyId: babyId! })
        } catch {
          // Stash deduction failed but feeding was logged - that's ok
        }
      }
    }
    setNotes('')
    setVolume('')
    setDuration('')
    setSelectedStashId('')
    setTime(formatDatetimeLocal(new Date()))
    toast.success(t('feeding.added'))
  }

  const handleDelete = async (id: string) => {
    if (isDemo) {
      setDemoFeedings((prev) => prev.filter((f) => f.id !== id))
    } else {
      await deleteMutation.mutateAsync({ id, babyId: babyId! })
    }
    toast.success(t('feeding.deleted'))
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{t('feeding.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('feeding.subtitle')}</p>
      </div>

      {/* Today's Summary */}
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Utensils className="h-8 w-8 text-orange-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('feeding.today')}</p>
              <div className="mt-1 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xl font-bold text-orange-700">{todayTotal} {t('feeding.ml')}</p>
                  <p className="text-xs text-muted-foreground">{t('feeding.total')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-orange-700">{Math.round(todayAvg)} {t('feeding.ml')}</p>
                  <p className="text-xs text-muted-foreground">{t('feeding.average')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-orange-700">{todayFeedings.length}</p>
                  <p className="text-xs text-muted-foreground">{t('feeding.count')}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Form */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="text-lg font-semibold">{t('feeding.log')}</h2>
          <div>
            <Label>{t('feeding.time')}</Label>
            <Input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <Label>{t('feeding.type')}</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {FEEDING_TYPES.map((ft) => (
                <Button
                  key={ft}
                  variant={feedingType === ft ? 'default' : 'outline'}
                  size="sm"
                  className={feedingType === ft ? '' : TYPE_COLORS[ft]}
                  onClick={() => setFeedingType(ft)}
                >
                  {typeTranslation(ft)}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t('feeding.volume')}</Label>
            <Input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="mL" />
          </div>
          {feedingType === 'breastmilk' && (
            <div>
              <Label>{t('feeding.duration')}</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="min" />
            </div>
          )}
          {feedingType === 'breastmilk' && availableStash.length > 0 && volume && (
            <div>
              <Label>{t('feeding.fromStash')}</Label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedStashId}
                onChange={(e) => setSelectedStashId(e.target.value)}
              >
                <option value="">{t('feeding.fromStash.none')}</option>
                {availableStash.map((s) => {
                  const remaining = s.volume_ml - s.used_ml
                  const age = Math.floor((Date.now() - new Date(s.stored_at).getTime()) / (1000 * 60 * 60 * 24))
                  return (
                    <option key={s.id} value={s.id}>
                      {s.storage_type === 'fridge' ? '🧊' : '❄️'} {remaining}mL • {age}d
                    </option>
                  )
                })}
              </select>
            </div>
          )}
          <div>
            <Label>{t('feeding.notes')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('feeding.notes')} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleAdd}>{t('feeding.add')}</Button>
            {!isDemo && (
              <VoiceInputButton
                trackerType="feeding"
                onParsed={(data) => {
                  const d = data as ParsedFeedingData
                  if (d.time) setTime(formatDatetimeLocal(new Date(d.time)))
                  if (d.feeding_type) setFeedingType(d.feeding_type)
                  if (d.volume_ml != null) setVolume(String(d.volume_ml))
                  if (d.duration_minutes != null) setDuration(String(d.duration_minutes))
                  if (d.notes) setNotes(d.notes)
                }}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-lg font-semibold">{t('feeding.analytics')}</h2>
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              <TabsTrigger value="day">{t('feeding.period.day')}</TabsTrigger>
              <TabsTrigger value="week">{t('feeding.period.week')}</TabsTrigger>
              <TabsTrigger value="month">{t('feeding.period.month')}</TabsTrigger>
            </TabsList>
            <TabsContent value={period}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="breastmilk" stackId="a" fill="#e8a0bf" name={typeTranslation('breastmilk')} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="formula" stackId="a" fill="#9bb8d8" name={typeTranslation('formula')} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="ready_to_feed" stackId="a" fill="#a3c9a8" name={typeTranslation('ready_to_feed')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-muted-foreground">{t('common.noData')}</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('feeding.history')}</h2>
              <p className="text-xs text-muted-foreground">{t('feeding.history.recent')}</p>
            </div>
            {feedings.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="mr-2 h-4 w-4" />
                {t('feeding.export')}
              </Button>
            )}
          </div>
          {historyFeedings.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              {feedings.length === 0 ? t('feeding.empty') : t('feeding.empty.recent')}
            </p>
          ) : (
            <div className="space-y-2">
              {historyFeedings.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={TYPE_COLORS[f.feeding_type]}>
                      {typeTranslation(f.feeding_type)}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{new Date(f.fed_at).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.volume_ml ? `${f.volume_ml} ${t('feeding.ml')}` : ''}
                        {f.duration_minutes ? `${f.duration_minutes} ${t('feeding.min')}` : ''}
                        {f.notes ? ` - ${f.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  {canDelete(f) && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
