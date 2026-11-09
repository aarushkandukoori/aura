/**
 * Usernames for the people a plan creates: a suggestion for the user, and handles for the new
 * friends they described. A username must be valid (the same rule as everywhere: 3-24 lowercase
 * letters, numbers, dots and underscores, not an app page) and free (no character already has it).
 */
import { username as checkUsername } from '../api/http.ts'
import { hasWorld, q } from '../db/index.ts'
import { usernameTakenByCharacters } from '../seed/content.ts'

/** "Zoë Park!" -> "zoe.park": lowercase, no accents, spaces become dots, other symbols go. */
export function handleFrom(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 24)
}

function isValid(name: string): boolean {
  try {
    return checkUsername(name) === name
  } catch {
    return false // too short, a reserved app page...
  }
}

/** Taken by a character in the content files, or by anyone already in this world's database. */
function isTaken(name: string): boolean {
  if (usernameTakenByCharacters(name)) return true
  return hasWorld() && q('SELECT 1 FROM accounts WHERE username = ?').get(name) !== undefined
}

/**
 * The first wish that is valid and free; otherwise the first usable wish with a number on the
 * end ("jake.kicks2"). Wishes can be anything ("Jake Morales", "@jake.kicks").
 */
export function freeUsername(wishes: (string | null | undefined)[], fallback = 'aura.friend'): string {
  const usable = [...wishes, fallback].map((wish) => handleFrom(wish ?? '')).filter(isValid)
  const free = usable.find((name) => !isTaken(name))
  if (free) return free
  const base = (usable[0] ?? fallback).slice(0, 20)
  for (let number = 2; number < 10_000; number++) {
    const name = `${base}${number}`
    if (isValid(name) && !isTaken(name)) return name
  }
  return `${base}${Date.now() % 10_000}`
}
