import prisma from '../utils/prisma.js'
import { sendError, sendSuccess } from '../utils/response.js'

export const getAllEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        isPublic: true,
        status: { not: 'DRAFT' }
      },
      include: {
        _count: {
          select: {
            registrations: true
          }
        }
      }
    })

    const withParticipants = await Promise.all(
      events.map(async (event) => {
        const teamMembersCount = await prisma.teamMember.count({
          where: {
            team: {
              eventId: event.id
            }
          }
        })

        return {
          ...event,
          participants: (event?._count?.registrations || 0) + teamMembersCount
        }
      })
    )

    return sendSuccess(res, withParticipants)
  } catch (err) {
    console.error('getAllEvents error:', err)
    return sendError(res, 500, 'EVENTS_FETCH_FAILED', 'Failed to fetch events')
  }
}

export const getEventBySlug = async (req, res) => {
  try {
    const { slug } = req.params

    let event

    try {
      event = await prisma.event.findUnique({
        where: { slug },
        include: {
          rounds: { orderBy: { order: 'asc' } },
          prizes: true,
          settings: true
        }
      })
    } catch (dbErr) {
      // Temporary compatibility path for production databases that are behind schema.
      if (dbErr?.code === 'P2022' && String(dbErr?.meta?.column || '').includes('EventSettings')) {
        event = await prisma.event.findUnique({
          where: { slug },
          include: {
            rounds: { orderBy: { order: 'asc' } },
            prizes: true
          }
        })
      } else {
        throw dbErr
      }
    }

    if (!event) {
      return sendError(res, 404, 'EVENT_NOT_FOUND', 'Event not found')
    }

    const [soloRegistrationsCount, teamMembersCount] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id } }),
      prisma.teamMember.count({
        where: {
          team: {
            eventId: event.id
          }
        }
      })
    ])

    return sendSuccess(res, {
      ...event,
      participants: soloRegistrationsCount + teamMembersCount
    })
  } catch (err) {
    console.error('getEventBySlug error:', err)
    return sendError(res, 500, 'EVENT_FETCH_FAILED', 'Failed to fetch event')
  }
}

export const getEventRounds = async (req, res) => {
  try {
    const { slug } = req.params

    const event = await prisma.event.findUnique({ where: { slug } })

    if (!event) {
      return sendError(res, 404, 'EVENT_NOT_FOUND', 'Event not found')
    }

    const rounds = await prisma.round.findMany({
      where: { eventId: event.id },
      orderBy: { order: 'asc' }
    })

    return sendSuccess(res, rounds)
  } catch (err) {
    console.error('getEventRounds error:', err)
    return sendError(res, 500, 'ROUNDS_FETCH_FAILED', 'Failed to fetch rounds')
  }
}

export const checkRollNo = async (req, res) => {
  try {
    const { slug } = req.params
    const { rollNo } = req.query

    if (!rollNo || typeof rollNo !== 'string' || rollNo.trim().length === 0) {
      return sendError(res, 400, 'ROLLNO_REQUIRED', 'Roll number is required')
    }

    const event = await prisma.event.findUnique({ where: { slug } })

    if (!event) {
      return sendError(res, 404, 'EVENT_NOT_FOUND', 'Event not found')
    }

    const normalizedRollNo = rollNo.trim()

    const teamMemberExists = await prisma.teamMember.findFirst({
      where: {
        rollNo: normalizedRollNo,
        team: { eventId: event.id }
      }
    })

    const soloExists = await prisma.registration.findFirst({
      where: {
        eventId: event.id,
        user: { rollNo: normalizedRollNo }
      }
    })

    return sendSuccess(res, { taken: !!teamMemberExists || !!soloExists, eventSlug: slug })
  } catch (err) {
    console.error('checkRollNo error:', err)
    return sendError(res, 500, 'ROLLNO_CHECK_FAILED', 'Failed to check roll number')
  }
}
