import { describe, expect, it } from 'vitest'

import {
  ALL_PARENTS_LIST,
  ALL_TEACHERS_LIST,
  recipientFields,
  toClassEmailRoster,
} from './communication'

describe('toClassEmailRoster', () => {
  it('keeps the teacher school email and deduped guardian emails', () => {
    expect(
      toClassEmailRoster({
        id: 'class-1',
        name: 'Year 3',
        year_group: '3',
        teacher: {
          first_name: 'Jane',
          last_name: 'Smith',
          display_name: null,
          email: ' jane@hshb.org.uk ',
        },
        student_classes: [
          {
            student: {
              primary_guardian: { email: 'a@x.com' },
              secondary_guardian: { email: 'a@x.com' },
            },
          },
          {
            student: {
              primary_guardian: { email: null },
              secondary_guardian: { email: 'b@x.com' },
            },
          },
          { student: null },
        ],
      }),
    ).toEqual({
      id: 'class-1',
      name: 'Year 3',
      teacherName: 'Jane Smith',
      teacherEmail: 'jane@hshb.org.uk',
      guardianEmails: ['a@x.com', 'b@x.com'],
    })
  })

  it('leaves teacher fields empty when the class has no teacher', () => {
    expect(
      toClassEmailRoster({
        id: 'class-2',
        name: 'Year 4',
        year_group: '4',
        teacher: null,
        student_classes: [],
      }),
    ).toMatchObject({
      teacherName: null,
      teacherEmail: null,
      guardianEmails: [],
    })
  })
})

describe('recipientFields', () => {
  const year3 = {
    id: 'class-1',
    name: 'Year 3',
    teacherName: 'Jane Smith',
    teacherEmail: 'jane@hshb.org.uk',
    guardianEmails: ['a@x.com', 'b@x.com'],
  }

  it('puts both distribution lists in To for a broadcast', () => {
    expect(recipientFields('broadcast', null)).toEqual({
      to: [ALL_PARENTS_LIST, ALL_TEACHERS_LIST],
      cc: [],
      bcc: [],
    })
  })

  it('puts the parents list in To', () => {
    expect(recipientFields('parents', null)).toEqual({
      to: [ALL_PARENTS_LIST],
      cc: [],
      bcc: [],
    })
  })

  it('puts the teachers list in To', () => {
    expect(recipientFields('teachers', null)).toEqual({
      to: [ALL_TEACHERS_LIST],
      cc: [],
      bcc: [],
    })
  })

  it('puts the class teacher in Cc and guardians in Bcc', () => {
    expect(recipientFields('class', year3)).toEqual({
      to: [],
      cc: ['jane@hshb.org.uk'],
      bcc: ['a@x.com', 'b@x.com'],
    })
  })

  it('leaves class fields empty until a class is chosen', () => {
    expect(recipientFields('class', null)).toEqual({
      to: [],
      cc: [],
      bcc: [],
    })
  })
})
