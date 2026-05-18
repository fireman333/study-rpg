/**
 * Doctor rename service — `add-doctor-rename` change.
 *
 * Players may rename any doctor in the roster at any time. Default names are
 * auto-generated at recruit / starter-pull time as `"<displayName> 醫師 #<seq>"`;
 * this service mutates `doctor.name` to a player-supplied custom string OR
 * restores it back to the default template (with `<seq>` recomputed from the
 * doctor's current ordinal position by `obtainedAt` among same-subject peers).
 *
 * Validation lives here (not in UI) so future entry points (CLI debug, bulk
 * import) share the same rules. UI may add UX hints (maxLength, char counter)
 * but the service is the source of truth.
 */

import { DEFAULT_DOCTOR_TITLE_BY_RARITY } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export const DOCTOR_NAME_MAX_LENGTH = 20

export async function renameDoctor(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim()
  if (trimmed.length === 0) throw new Error('名字不可為空')
  if (trimmed.length > DOCTOR_NAME_MAX_LENGTH) {
    throw new Error(`名字最多 ${DOCTOR_NAME_MAX_LENGTH} 個字`)
  }

  const db = getHospitalDB()
  const doctor = await db.doctors.get(id)
  if (!doctor) throw new Error('找不到該醫師')

  await db.doctors.put({ ...doctor, name: trimmed })
}

/**
 * Restore a doctor's name to the auto-generated tier-aware default
 * `"<displayName> <title> #<seq>"`. `<title>` is
 * `DEFAULT_DOCTOR_TITLE_BY_RARITY[doctor.rarity]` (大P / 主任 / Senior V /
 * Young V / R). `<seq>` is the 1-based index of the doctor among same-subject
 * peers sorted by `obtainedAt` ascending.
 *
 * In the medexam2-tw corpus `subject.id === subject.displayName` for all 14
 * subjects, so the service uses `subjectId` directly. If a fork (TOEFL / law /
 * other content packs) needs a different displayName, pass it explicitly.
 */
export async function restoreDefaultDoctorName(
  id: string,
  displayNameOverride?: string,
): Promise<void> {
  const db = getHospitalDB()
  const doctor = await db.doctors.get(id)
  if (!doctor) throw new Error('找不到該醫師')

  const peers = await db.doctors.where('subjectId').equals(doctor.subjectId).sortBy('obtainedAt')
  const seq = peers.findIndex((d) => d.id === id) + 1
  if (seq === 0) throw new Error('找不到該醫師在科別內的排序')

  const displayName = displayNameOverride ?? doctor.subjectId
  const title = DEFAULT_DOCTOR_TITLE_BY_RARITY[doctor.rarity]
  const defaultName = `${displayName} ${title} #${seq}`
  await db.doctors.put({ ...doctor, name: defaultName })
}
