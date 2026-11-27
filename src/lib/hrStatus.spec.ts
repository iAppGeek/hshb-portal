import { describe, expect, it } from 'vitest'

import {
  complianceSummary,
  coverStatus,
  dbsCheckedStatus,
  dbsExpiryDate,
  hasLapsedCertificate,
  isDbsExpired,
  isRegulatedRole,
  isValidFireWarden,
  isValidFirstAider,
  NO_CURRENT_YEAR_MESSAGE,
  staffComplianceStatus,
  worstLevel,
  type ComplianceRecord,
  type SchoolYear,
} from './hrStatus'

const TODAY = '2026-11-26'
const YEAR: SchoolYear = { start_date: '2026-09-01', end_date: '2027-08-31' }

function makeRecord(
  overrides: Partial<ComplianceRecord> = {},
): ComplianceRecord {
  return {
    job_role: 'teacher',
    payment_funding: 'school',
    address_line_1: '1 High Street',
    id_verified: true,
    right_to_work_checked: true,
    dbs_verified: true,
    dbs_level: 'enhanced',
    dbs_update_service: false,
    dbs_reference: 'DBS-1',
    dbs_issue_date: '2025-01-10',
    dbs_verified_at: '2026-09-15',
    dbs_renewal_due: null,
    first_aid_certified: false,
    first_aid_expiry_date: null,
    fire_warden_certified: false,
    fire_warden_expiry_date: null,
    ...overrides,
  }
}

const NO_DBS: Partial<ComplianceRecord> = {
  dbs_verified: false,
  dbs_level: null,
  dbs_reference: null,
  dbs_issue_date: null,
  dbs_verified_at: null,
}

describe('worstLevel', () => {
  it('is ok for no levels', () => {
    expect(worstLevel([])).toBe('ok')
  })

  it('picks the most severe level', () => {
    expect(worstLevel(['ok', 'warning'])).toBe('warning')
    expect(worstLevel(['warning', 'error', 'ok'])).toBe('error')
  })
})

describe('isRegulatedRole', () => {
  it.each(['teacher', 'classroom_assistant', 'admin'])(
    '%s is regulated',
    (r) => {
      expect(isRegulatedRole(r)).toBe(true)
    },
  )

  it.each(['admin_assistant', 'committee'])('%s is not regulated', (r) => {
    expect(isRegulatedRole(r)).toBe(false)
  })
})

describe('dbsExpiryDate', () => {
  it('is three years after the issue date', () => {
    expect(dbsExpiryDate(makeRecord({ dbs_issue_date: '2024-03-01' }))).toBe(
      '2027-03-01',
    )
  })

  it('is null on the Update Service, whatever the dates', () => {
    expect(
      dbsExpiryDate(
        makeRecord({
          dbs_update_service: true,
          dbs_issue_date: '2015-01-01',
          dbs_renewal_due: '2025-02-01',
        }),
      ),
    ).toBeNull()
  })

  it('ignores the renewal due date when not on the Update Service', () => {
    expect(
      dbsExpiryDate(
        makeRecord({
          dbs_issue_date: '2024-03-01',
          dbs_renewal_due: '2025-01-01',
        }),
      ),
    ).toBe('2027-03-01')
  })

  it('is null without an issue date when not on the Update Service', () => {
    expect(dbsExpiryDate(makeRecord({ dbs_issue_date: null }))).toBeNull()
  })
})

describe('isDbsExpired', () => {
  it('expires a certificate on its third anniversary', () => {
    expect(
      isDbsExpired(makeRecord({ dbs_issue_date: '2023-11-27' }), TODAY),
    ).toBe(false)
    expect(
      isDbsExpired(makeRecord({ dbs_issue_date: '2023-11-26' }), TODAY),
    ).toBe(true)
  })

  it('never expires on the Update Service', () => {
    expect(
      isDbsExpired(
        makeRecord({
          dbs_update_service: true,
          dbs_issue_date: '2015-01-01',
          dbs_renewal_due: '2026-11-25',
        }),
        TODAY,
      ),
    ).toBe(false)
  })
})

describe('hasLapsedCertificate', () => {
  it('ignores a passed renewal date when not on the Update Service', () => {
    const record = makeRecord({
      dbs_issue_date: '2024-06-01',
      dbs_renewal_due: '2025-01-01',
    })
    expect(hasLapsedCertificate(record, TODAY)).toBe(false)
    expect(staffComplianceStatus(record, YEAR, TODAY).level).toBe('ok')
  })

  it('flags a certificate over three years old despite a later renewal date', () => {
    const record = makeRecord({
      dbs_issue_date: '2022-06-01',
      dbs_renewal_due: '2030-01-01',
    })
    expect(hasLapsedCertificate(record, TODAY)).toBe(true)
    expect(staffComplianceStatus(record, YEAR, TODAY).level).toBe('error')
  })

  it('ignores a passed renewal date on the Update Service', () => {
    expect(
      hasLapsedCertificate(
        makeRecord({ dbs_update_service: true, dbs_renewal_due: '2026-10-01' }),
        TODAY,
      ),
    ).toBe(false)
  })

  it('ignores an expired DBS that was never verified', () => {
    expect(
      hasLapsedCertificate(
        makeRecord({ dbs_verified: false, dbs_issue_date: '2020-01-01' }),
        TODAY,
      ),
    ).toBe(false)
  })

  it('flags an expired first aid or fire warden certificate', () => {
    expect(
      hasLapsedCertificate(
        makeRecord({
          first_aid_certified: true,
          first_aid_expiry_date: '2026-01-01',
        }),
        TODAY,
      ),
    ).toBe(true)
    expect(
      hasLapsedCertificate(
        makeRecord({
          fire_warden_certified: true,
          fire_warden_expiry_date: '2026-01-01',
        }),
        TODAY,
      ),
    ).toBe(true)
    expect(
      hasLapsedCertificate(
        makeRecord({
          first_aid_certified: true,
          first_aid_expiry_date: '2027-01-01',
        }),
        TODAY,
      ),
    ).toBe(false)
  })

  it('is false for a compliant record', () => {
    expect(hasLapsedCertificate(makeRecord(), TODAY)).toBe(false)
  })
})

describe('dbsCheckedStatus', () => {
  it('is ok when verified during the current school year', () => {
    expect(dbsCheckedStatus(makeRecord(), YEAR)).toEqual({
      level: 'ok',
      reasons: [],
    })
  })

  it('accepts both ends of the school year', () => {
    expect(
      dbsCheckedStatus(makeRecord({ dbs_verified_at: '2026-09-01' }), YEAR)
        .level,
    ).toBe('ok')
    expect(
      dbsCheckedStatus(makeRecord({ dbs_verified_at: '2027-08-31' }), YEAR)
        .level,
    ).toBe('ok')
  })

  it('is an error when verified in an earlier school year', () => {
    expect(
      dbsCheckedStatus(makeRecord({ dbs_verified_at: '2026-08-31' }), YEAR),
    ).toEqual({
      level: 'error',
      reasons: ['DBS has not been verified this school year'],
    })
  })

  it('is an error when not verified or there is no record', () => {
    expect(
      dbsCheckedStatus(makeRecord({ dbs_verified: false }), YEAR).level,
    ).toBe('error')
    expect(dbsCheckedStatus(null, YEAR).reasons).toEqual([
      'DBS has not been verified',
    ])
  })

  it('is an error when no school year is current', () => {
    expect(dbsCheckedStatus(makeRecord(), null)).toEqual({
      level: 'error',
      reasons: [NO_CURRENT_YEAR_MESSAGE],
    })
  })
})

describe('staffComplianceStatus', () => {
  it('is an error without an HR record', () => {
    expect(staffComplianceStatus(null, YEAR, TODAY)).toEqual({
      level: 'error',
      reasons: ['No HR record'],
    })
  })

  describe('regulated roles', () => {
    it('is ok with a valid enhanced DBS, ID and right to work', () => {
      expect(staffComplianceStatus(makeRecord(), YEAR, TODAY)).toEqual({
        level: 'ok',
        reasons: [],
      })
    })

    it('is ok on the Update Service with an old certificate verified this year', () => {
      const record = makeRecord({
        dbs_update_service: true,
        dbs_issue_date: '2015-01-01',
      })
      expect(staffComplianceStatus(record, YEAR, TODAY).level).toBe('ok')
    })

    describe('on the Update Service', () => {
      const onUpdateService = {
        dbs_update_service: true,
        dbs_issue_date: '2015-01-01',
      }

      it.each([
        ['later this school year', '2026-12-01'],
        ['today', TODAY],
        ['in the past', '2026-11-25'],
      ])('is ok when the renewal date is %s', (_when, dbs_renewal_due) => {
        expect(
          staffComplianceStatus(
            makeRecord({ ...onUpdateService, dbs_renewal_due }),
            YEAR,
            TODAY,
          ),
        ).toEqual({ level: 'ok', reasons: [] })
      })

      it('is an error when not verified this school year', () => {
        expect(
          staffComplianceStatus(
            makeRecord({
              ...onUpdateService,
              dbs_verified_at: '2026-08-31',
              dbs_renewal_due: '2099-01-01',
            }),
            YEAR,
            TODAY,
          ),
        ).toEqual({
          level: 'error',
          reasons: ['DBS has not been verified this school year'],
        })
      })
    })

    it('ignores the renewal due date when not on the Update Service', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ dbs_renewal_due: '2026-01-01' }),
          YEAR,
          TODAY,
        ).level,
      ).toBe('ok')
    })

    it('is an error with no DBS', () => {
      expect(staffComplianceStatus(makeRecord(NO_DBS), YEAR, TODAY)).toEqual({
        level: 'error',
        reasons: ['No DBS recorded; an enhanced DBS is required for this role'],
      })
    })

    it('is an error when the DBS is over three years old and not on the Update Service', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_issue_date: '2023-11-26' }),
        YEAR,
        TODAY,
      )
      expect(status.level).toBe('error')
      expect(status.reasons).toEqual([
        'DBS was issued more than 3 years ago and is not on the Update Service',
      ])
    })

    it('is an error when the DBS was not verified this school year', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_verified_at: '2026-06-01' }),
        YEAR,
        TODAY,
      )
      expect(status).toEqual({
        level: 'error',
        reasons: ['DBS has not been verified this school year'],
      })
    })

    it('is an error when DBS details exist but it is not verified', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_verified: false }),
        YEAR,
        TODAY,
      )
      expect(status.level).toBe('error')
      expect(status.reasons).toEqual(['DBS has not been verified'])
    })

    it('is an error with a valid basic DBS', () => {
      expect(
        staffComplianceStatus(makeRecord({ dbs_level: 'basic' }), YEAR, TODAY),
      ).toEqual({
        level: 'error',
        reasons: ['Basic DBS held; an enhanced DBS is required for this role'],
      })
    })

    it('is a warning when the DBS lapses within 60 days', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_issue_date: '2024-01-20' }),
        YEAR,
        TODAY,
      )
      expect(status.level).toBe('warning')
      expect(status.reasons).toEqual([
        'DBS lapses on 20 Jan 2027 (within 60 days)',
      ])
    })

    it('does not warn about lapsing on the Update Service', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_issue_date: '2024-01-20', dbs_update_service: true }),
        YEAR,
        TODAY,
      )
      expect(status.level).toBe('ok')
    })

    it('is an error without ID or right to work, listing both', () => {
      const status = staffComplianceStatus(
        makeRecord({ id_verified: false, right_to_work_checked: false }),
        YEAR,
        TODAY,
      )
      expect(status).toEqual({
        level: 'error',
        reasons: [
          'ID has not been verified',
          'Right to work has not been checked',
        ],
      })
    })

    it('lists errors before warnings', () => {
      const status = staffComplianceStatus(
        makeRecord({ dbs_issue_date: '2024-01-20', id_verified: false }),
        YEAR,
        TODAY,
      )
      expect(status.level).toBe('error')
      expect(status.reasons).toEqual([
        'ID has not been verified',
        'DBS lapses on 20 Jan 2027 (within 60 days)',
      ])
    })

    it.each(['classroom_assistant', 'admin'])('applies to %s', (job_role) => {
      expect(
        staffComplianceStatus(makeRecord({ job_role, ...NO_DBS }), YEAR, TODAY)
          .level,
      ).toBe('error')
    })
  })

  describe('non-regulated roles', () => {
    const base = { job_role: 'committee' }

    it('is ok with any valid DBS, including basic', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ ...base, dbs_level: 'basic' }),
          YEAR,
          TODAY,
        ).level,
      ).toBe('ok')
    })

    it('is a warning with no DBS', () => {
      expect(
        staffComplianceStatus(makeRecord({ ...base, ...NO_DBS }), YEAR, TODAY),
      ).toEqual({ level: 'warning', reasons: ['No DBS recorded'] })
    })

    it('is an error with an expired DBS', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ ...base, dbs_issue_date: '2022-01-01' }),
          YEAR,
          TODAY,
        ).level,
      ).toBe('error')
    })

    it('is an error with a DBS not verified this school year', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ ...base, dbs_verified_at: '2025-10-01' }),
          YEAR,
          TODAY,
        ).level,
      ).toBe('error')
    })
  })

  describe('ID and right to work', () => {
    it.each(['admin_assistant', 'committee'])(
      'requires both for a paid %s',
      (job_role) => {
        expect(
          staffComplianceStatus(
            makeRecord({
              job_role,
              id_verified: false,
              right_to_work_checked: false,
            }),
            YEAR,
            TODAY,
          ),
        ).toEqual({
          level: 'error',
          reasons: [
            'ID has not been verified',
            'Right to work has not been checked',
          ],
        })
      },
    )

    it.each(['teacher', 'committee'])(
      'requires only ID for a volunteer %s',
      (job_role) => {
        const volunteer = {
          job_role,
          payment_funding: 'volunteer',
          right_to_work_checked: false,
        }
        expect(
          staffComplianceStatus(makeRecord(volunteer), YEAR, TODAY),
        ).toEqual({ level: 'ok', reasons: [] })
        expect(
          staffComplianceStatus(
            makeRecord({ ...volunteer, id_verified: false }),
            YEAR,
            TODAY,
          ),
        ).toEqual({ level: 'error', reasons: ['ID has not been verified'] })
      },
    )
  })

  describe('with no current school year', () => {
    it('is an error for anyone with a DBS', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ job_role: 'committee' }),
          null,
          TODAY,
        ),
      ).toEqual({ level: 'error', reasons: [NO_CURRENT_YEAR_MESSAGE] })
    })

    it('stays a warning for a non-regulated role with no DBS', () => {
      expect(
        staffComplianceStatus(
          makeRecord({ job_role: 'committee', ...NO_DBS }),
          null,
          TODAY,
        ).level,
      ).toBe('warning')
    })
  })
})

describe('isValidFirstAider / isValidFireWarden', () => {
  it('counts a certificate with no expiry date', () => {
    expect(
      isValidFirstAider(makeRecord({ first_aid_certified: true }), TODAY),
    ).toBe(true)
  })

  it('counts a certificate expiring today or later', () => {
    expect(
      isValidFireWarden(
        makeRecord({
          fire_warden_certified: true,
          fire_warden_expiry_date: TODAY,
        }),
        TODAY,
      ),
    ).toBe(true)
  })

  it('does not count an expired or missing certificate', () => {
    expect(
      isValidFirstAider(
        makeRecord({
          first_aid_certified: true,
          first_aid_expiry_date: '2026-11-25',
        }),
        TODAY,
      ),
    ).toBe(false)
    expect(isValidFireWarden(makeRecord(), TODAY)).toBe(false)
    expect(isValidFirstAider(null, TODAY)).toBe(false)
  })
})

describe('coverStatus', () => {
  it('is ok at or above the minimum', () => {
    expect(coverStatus(4, 4, 'first aiders').level).toBe('ok')
    expect(coverStatus(5, 4, 'first aiders').level).toBe('ok')
  })

  it('is a warning one short', () => {
    expect(coverStatus(3, 4, 'first aiders')).toEqual({
      level: 'warning',
      reasons: ['3 valid first aiders; at least 4 are needed'],
    })
    expect(coverStatus(1, 2, 'fire wardens').level).toBe('warning')
  })

  it('is an error more than one short', () => {
    expect(coverStatus(2, 4, 'first aiders').level).toBe('error')
    expect(coverStatus(0, 2, 'fire wardens').level).toBe('error')
  })
})

describe('complianceSummary', () => {
  const firstAider = { first_aid_certified: true }
  const fireWarden = { fire_warden_certified: true }

  it('is ok when every person is ok and cover is met', () => {
    const records = [
      makeRecord({ ...firstAider, ...fireWarden }),
      makeRecord({ ...firstAider, ...fireWarden }),
      makeRecord(firstAider),
      makeRecord(firstAider),
    ]
    const summary = complianceSummary(records, YEAR, TODAY)
    expect(summary.overall).toEqual({ level: 'ok', reasons: [] })
    expect(summary.staff).toEqual({ ok: 4, warning: 0, error: 0 })
    expect(summary.firstAiders.count).toBe(4)
    expect(summary.fireWardens.count).toBe(2)
    expect(summary.noCurrentYear).toBe(false)
  })

  it('counts staff by status and reports the worst overall', () => {
    const records = [
      makeRecord({ ...firstAider, ...fireWarden }),
      makeRecord({ ...firstAider, ...fireWarden, address_line_1: null }),
      makeRecord(firstAider),
      makeRecord(firstAider),
      null,
    ]
    const summary = complianceSummary(records, YEAR, TODAY)
    expect(summary.staff).toEqual({ ok: 3, warning: 1, error: 1 })
    expect(summary.staffStatus).toEqual({
      level: 'error',
      reasons: ['1 staff need action', '1 staff have warnings'],
    })
    expect(summary.overall.level).toBe('error')
  })

  it('warns when one first aider and one fire warden short', () => {
    const records = [
      makeRecord({ ...firstAider, ...fireWarden }),
      makeRecord(firstAider),
      makeRecord(firstAider),
    ]
    const summary = complianceSummary(records, YEAR, TODAY)
    expect(summary.firstAiders.status.level).toBe('warning')
    expect(summary.fireWardens.status.level).toBe('warning')
    expect(summary.overall).toEqual({
      level: 'warning',
      reasons: [
        '3 valid first aiders; at least 4 are needed',
        '1 valid fire wardens; at least 2 are needed',
      ],
    })
  })

  it('counts first aiders and fire wardens from people without a green status', () => {
    const records = [
      makeRecord({ ...firstAider, ...fireWarden, id_verified: false }),
    ]
    const summary = complianceSummary(records, YEAR, TODAY)
    expect(summary.firstAiders.count).toBe(1)
    expect(summary.fireWardens.count).toBe(1)
  })

  it('is an error with no current school year', () => {
    const summary = complianceSummary([], null, TODAY)
    expect(summary.noCurrentYear).toBe(true)
    expect(summary.overall.level).toBe('error')
    expect(summary.overall.reasons[0]).toBe(NO_CURRENT_YEAR_MESSAGE)
  })
})

describe('staffComplianceStatus for first aid and fire warden certificates', () => {
  const certificates = [
    ['First aid', 'first_aid_certified', 'first_aid_expiry_date'],
    ['Fire warden', 'fire_warden_certified', 'fire_warden_expiry_date'],
  ] as const

  describe.each(certificates)('%s', (name, held, expiry) => {
    function status(
      overrides: Partial<ComplianceRecord>,
    ): ReturnType<typeof staffComplianceStatus> {
      return staffComplianceStatus(makeRecord(overrides), YEAR, TODAY)
    }

    it('is ok when it expires more than 60 days away', () => {
      expect(status({ [held]: true, [expiry]: '2027-01-26' })).toEqual({
        level: 'ok',
        reasons: [],
      })
    })

    it('is ok with no expiry date', () => {
      expect(status({ [held]: true, [expiry]: null }).level).toBe('ok')
    })

    it('is a warning when it expires within 60 days, today included', () => {
      expect(status({ [held]: true, [expiry]: '2027-01-25' })).toEqual({
        level: 'warning',
        reasons: [
          `${name} certificate expires on 25 Jan 2027 (within 60 days)`,
        ],
      })
      expect(status({ [held]: true, [expiry]: TODAY }).level).toBe('warning')
    })

    it('is an error once the expiry date has passed', () => {
      expect(status({ [held]: true, [expiry]: '2026-11-25' })).toEqual({
        level: 'error',
        reasons: [`${name} certificate expired on 25 Nov 2026`],
      })
    })

    it('ignores the date when the certificate is not held', () => {
      expect(status({ [held]: false, [expiry]: '2026-11-25' }).level).toBe('ok')
    })
  })
})

describe('staffComplianceStatus without an address', () => {
  it.each(['teacher', 'committee'])(
    'is a warning for an otherwise compliant %s',
    (job_role) => {
      expect(
        staffComplianceStatus(
          makeRecord({ job_role, address_line_1: null }),
          YEAR,
          TODAY,
        ),
      ).toEqual({ level: 'warning', reasons: ['No address recorded'] })
    },
  )

  it('lists the missing address after the errors', () => {
    expect(
      staffComplianceStatus(
        makeRecord({ address_line_1: null, id_verified: false }),
        YEAR,
        TODAY,
      ),
    ).toEqual({
      level: 'error',
      reasons: ['ID has not been verified', 'No address recorded'],
    })
  })

  it('counts towards the staff warnings in the summary', () => {
    const summary = complianceSummary(
      [makeRecord(), makeRecord({ address_line_1: null })],
      YEAR,
      TODAY,
    )
    expect(summary.staff).toEqual({ ok: 1, warning: 1, error: 0 })
  })
})
