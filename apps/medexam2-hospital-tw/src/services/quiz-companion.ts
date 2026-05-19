import { getHospitalDB } from '../db/schema'

export const QUIZ_COMPANION_META_KEY = 'quiz.companionDoctorId'

export async function getQuizCompanionDoctorId(): Promise<string | null> {
  const db = getHospitalDB()
  const row = await db.meta.get(QUIZ_COMPANION_META_KEY)
  return typeof row?.value === 'string' ? row.value : null
}

export async function setQuizCompanionDoctorId(id: string): Promise<void> {
  const db = getHospitalDB()
  await db.meta.put({ key: QUIZ_COMPANION_META_KEY, value: id })
}
