import { useRef } from 'react'
import type { Player, ItemInstance } from '@study-rpg/core'

interface SaveFile {
  schemaVersion: number
  exportedAt: number
  player: Player
  instances: ItemInstance[]
}

interface Props {
  player: Player
  instances: ItemInstance[]
  schemaVersion: number
  onImport: (payload: { player: Player; instances: ItemInstance[] }) => void
}

function isSaveFile(x: unknown): x is SaveFile {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.schemaVersion !== 'number') return false
  if (typeof o.exportedAt !== 'number') return false
  if (!o.player || typeof o.player !== 'object') return false
  if (!Array.isArray(o.instances)) return false
  const p = o.player as Record<string, unknown>
  if (typeof p.id !== 'string' || typeof p.level !== 'number') return false
  return true
}

function tsSuffix(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

export function PersistenceButtons({ player, instances, schemaVersion, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)

  function handleExport() {
    const data: SaveFile = {
      schemaVersion,
      exportedAt: Date.now(),
      player,
      instances,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `study-rpg-save-${tsSuffix(new Date())}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as unknown
        if (!isSaveFile(parsed)) {
          alert('存檔格式錯誤：缺少必要欄位 (schemaVersion / exportedAt / player / instances)')
          return
        }
        if (parsed.schemaVersion !== schemaVersion) {
          alert(`不支援的存檔版本 v${parsed.schemaVersion}（current: v${schemaVersion}）`)
          return
        }
        if (!confirm('這會覆蓋現有存檔，確定？')) return
        onImport({ player: parsed.player, instances: parsed.instances })
      } catch (err) {
        alert(`存檔解析失敗：${err instanceof Error ? err.message : String(err)}`)
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <button onClick={handleExport}>
        <span className="label">💾 Export 存檔</span>
        <span className="hint">下載 JSON · 換裝置可 Import 回來</span>
      </button>
      <button onClick={() => fileRef.current?.click()}>
        <span className="label">📂 Import 存檔</span>
        <span className="hint">從 JSON 還原（會覆蓋現有進度）</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFilePick}
        style={{ display: 'none' }}
      />
    </>
  )
}
