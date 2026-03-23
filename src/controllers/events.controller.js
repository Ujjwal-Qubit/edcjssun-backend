import prisma from '../utils/prisma.js'

export const getAllEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        isPublic: true,
        status: { not: 'DRAFT' }
      }
    })

    res.json(events)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' })
  }
}

export const getEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params

    const event = await prisma.event.findUnique({
      where: { slug },
      include: {
        rounds: { orderBy: { order: 'asc' } },
        prizes: true,
        settings: true
      }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    res.json(event)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event' })
  }
}

export const getEventRounds = async (req, res) => {
  try {
    const { slug } = req.params

    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const rounds = await prisma.round.findMany({
      where: { eventId: event.id },
      orderBy: { order: 'asc' }
    })

    res.json(rounds)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rounds' })
  }
}

export const checkRollNo = async (req, res) => {
  try {
    const { slug } = req.params
    const { rollNo } = req.query

    const event = await prisma.event.findUnique({
      where: { slug }
    })

    if (!event) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const exists = await prisma.teamMember.findFirst({
      where: {
        rollNo,
        team: { eventId: event.id }
      }
    })

    res.json({ taken: !!exists })
  } catch (err) {
    res.status(500).json({ error: 'Failed to check roll number' })
  }
}