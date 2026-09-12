import { describe, expect, it } from 'vitest'

import type { Group, GroupMember, User } from '@/api/types'

import { rankSuggestions } from './suggestions'

const user = (id: string, name: string): User =>
  ({
    id,
    name,
    email: `${id}@studentwise.dev`,
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
  }) as User

const member = (u: User, leftAt: string | null = null): GroupMember =>
  ({
    user: u,
    role: 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: leftAt,
  }) as GroupMember

const group = (id: string, members: GroupMember[]): Group =>
  ({
    id,
    name: id,
    type: 'SHARED_APARTMENT',
    currency: 'ILS',
    created_by: 'u-me',
    created_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    members,
  }) as Group

const ME = user('u-me', 'Me')
const MAYA = user('u-maya', 'Maya')
const NOA = user('u-noa', 'Noa')
const AVI = user('u-avi', 'Avi')

describe('rankSuggestions', () => {
  it('leaves me out of my own suggestions', () => {
    const result = rankSuggestions([group('a', [member(ME), member(MAYA)])], 'u-me', [])
    expect(result.map((r) => r.user.id)).toEqual(['u-maya'])
  })

  it('ranks by how many groups we share', () => {
    // The person you split with in two places is a better guess than the
    // person you split with in one.
    const groups = [
      group('a', [member(ME), member(MAYA), member(NOA)]),
      group('b', [member(ME), member(MAYA)]),
    ]
    const result = rankSuggestions(groups, 'u-me', [])
    expect(result.map((r) => r.user.id)).toEqual(['u-maya', 'u-noa'])
    expect(result[0]?.sharedGroups).toBe(2)
    expect(result[1]?.sharedGroups).toBe(1)
  })

  it('breaks a tie by name, so the order does not wander between openings', () => {
    const groups = [group('a', [member(ME), member(NOA), member(AVI)])]
    const result = rankSuggestions(groups, 'u-me', [])
    expect(result.map((r) => r.user.name)).toEqual(['Avi', 'Noa'])
  })

  it('leaves out anyone already picked', () => {
    const result = rankSuggestions([group('a', [member(ME), member(MAYA)])], 'u-me', ['u-maya'])
    expect(result).toEqual([])
  })

  it('leaves out people who have left a group', () => {
    // Leaving is not a suggestion to rejoin.
    const groups = [group('a', [member(ME), member(NOA, '2026-02-01T00:00:00Z')])]
    expect(rankSuggestions(groups, 'u-me', [])).toEqual([])
  })

  it('counts someone once per group, not once per membership row', () => {
    const groups = [
      group('a', [member(ME), member(MAYA)]),
      group('b', [member(ME), member(MAYA)]),
      group('c', [member(ME), member(MAYA)]),
    ]
    expect(rankSuggestions(groups, 'u-me', [])[0]?.sharedGroups).toBe(3)
  })

  it('is empty before the group list has loaded', () => {
    expect(rankSuggestions([], 'u-me', [])).toEqual([])
  })
})
