import prisma from '../utils/prisma.js'

export const registerTeam = async (req, res) => {
  const { slug } = req.params

  try {
    const { teamName, teamSize, members } = req.body || {}
    const parsedTeamSize = Number(teamSize)

    if (!teamName || !Number.isInteger(parsedTeamSize) || !Array.isArray(members)) {
      return res.status(400).json({ error: 'Invalid input' })
    }

    // 1. Validate event
    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    if (!event.registrationOpen || new Date() > event.registrationDeadline) {
      return res.status(403).json({ error: 'Registration closed' })
    }

    if (members.length !== parsedTeamSize) {
      return res.status(400).json({ error: 'Team size mismatch' })
    }

    if (parsedTeamSize < event.teamSizeMin || parsedTeamSize > event.teamSizeMax) {
      return res.status(400).json({ error: 'Invalid team size' })
    }

    // 3. Duplicate rollNo in payload
    const rollNos = members.map(m => m.rollNo)
    const unique = new Set(rollNos)

    if (unique.size !== rollNos.length) {
      return res.status(422).json({ error: 'Duplicate roll numbers in team' })
    }

    // 4. Transaction
    const result = await prisma.$transaction(async (tx) => {
      const teamCount = await tx.team.count({
        where: { eventId: event.id }
      })

      if (teamCount >= event.maxTeams) {
        throw new Error('MAX_TEAMS')
      }

      const existing = await tx.teamMember.findMany({
        where: {
          rollNo: { in: rollNos },
          team: { eventId: event.id }
        },
        select: { rollNo: true }
      })

      if (existing.length > 0) {
        throw new Error(`ROLL_EXISTS:${existing[0].rollNo}`)
      }

      // Generate ID
      const regId = `FP26-${Math.floor(1000 + Math.random() * 9000)}-${Date.now()}`

      // Create team
      const team = await tx.team.create({
        data: {
          registrationId: regId,
          eventId: event.id,
          teamName,
          teamSize: parsedTeamSize
        }
      })

      // Create members
      for (let m of members) {
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            eventId: event.id,
            name: m.name,
            rollNo: m.rollNo,
            year: m.year,
            branch: m.branch,
            email: m.email,
            phone: m.phone,
            isLead: m.isLead || false
          }
        })
      }

      return { team, regId }
    })

    res.json({
      registrationId: result.regId,
      teamName,
      message: 'Registration successful'
    })

  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate data' })
    }

    if (err.message === 'MAX_TEAMS') {
      return res.status(403).json({ error: 'Max teams reached' })
    }

    if (err.message?.startsWith('ROLL_EXISTS')) {
      return res.status(409).json({
        error: 'DUPLICATE_ROLLNO',
        rollNo: err.message.split(':')[1]
      })
    }

    console.error(err)
    res.status(500).json({ error: 'Something went wrong' })
  }
}