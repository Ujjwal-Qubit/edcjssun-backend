export const generateRegistrationId = async (prisma, eventId) => {
  const lastTeam = await prisma.team.findFirst({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    select: { registrationId: true }
  })

  let nextNumber = 1

  if (lastTeam?.registrationId) {
    const lastNumber = parseInt(lastTeam.registrationId.split('-')[1])
    nextNumber = lastNumber + 1
  }

  const padded = String(nextNumber).padStart(4, '0')
  return `FP26-${padded}`
}