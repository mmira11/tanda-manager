import { describe, it, expect } from 'vitest'
import { parseMemberList, shuffled } from '../utils/memberList'

describe('parseMemberList', () => {
  it('reads common shapes: spaces, commas, tabs, dots, parens, +1, list numbers', () => {
    const rows = parseMemberList([
      'Maria 555-010-0101',
      'Rosa, (555) 010-0102',
      'Luis\t5550100103',
      '1. Ana Lopez 555.010.0104',
      '+1 555 010 0105 Carmen',
      '  ',
      'Sofia',
    ].join('\n'))
    expect(rows).toEqual([
      { name: 'Maria', phone: '555-010-0101', phoneOk: true },
      { name: 'Rosa', phone: '(555) 010-0102', phoneOk: true },
      { name: 'Luis', phone: '5550100103', phoneOk: true },
      { name: 'Ana Lopez', phone: '555.010.0104', phoneOk: true },
      { name: 'Carmen', phone: '+1 555 010 0105', phoneOk: true },
      { name: 'Sofia', phone: '', phoneOk: true },
    ])
  })

  it('flags a phone that is too short or too long, and keeps a phone with no name', () => {
    expect(parseMemberList('Pedro 555-01011\nLuis 555010\n555-010-0199')).toEqual([
      { name: 'Pedro', phone: '555-01011', phoneOk: false },
      { name: 'Luis', phone: '555010', phoneOk: false },
      { name: '', phone: '555-010-0199', phoneOk: true },
    ])
  })

  it('handles Windows line endings and empty input', () => {
    expect(parseMemberList('Ana 5550100104\r\nBeto')).toHaveLength(2)
    expect(parseMemberList('')).toEqual([])
    expect(parseMemberList(undefined)).toEqual([])
  })
})

describe('shuffled', () => {
  it('returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4]
    const out = shuffled(input, () => 0)
    expect(out).toEqual([2, 3, 4, 1])
    expect(input).toEqual([1, 2, 3, 4])
    expect([...out].sort()).toEqual(input)
  })
})
