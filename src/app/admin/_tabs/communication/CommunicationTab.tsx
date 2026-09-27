import { getClassEmailRosters } from '@/db'

import CommunicationPanel from './CommunicationPanel'

export default async function CommunicationTab(): Promise<React.ReactElement> {
  const { yearCode, classes } = await getClassEmailRosters()
  return <CommunicationPanel yearCode={yearCode} classes={classes} />
}
