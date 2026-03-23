import express from 'express'
import {
  getAllEvents,
  getEventBySlug,
  getEventRounds,
  checkRollNo
} from '../controllers/events.controller.js'

import { registerTeam } from '../controllers/registration.controller.js'

const router = express.Router()

router.get('/', getAllEvents)
router.get('/:slug', getEventBySlug)
router.get('/:slug/rounds', getEventRounds)
router.get('/:slug/check-rollno', checkRollNo)
router.post('/:slug/register', registerTeam)

export default router