const sql = require('../../config/db');
const { resolveClassroomAccess } = require('./connectAccessControl');

const MIN_OPTIONS = 2;

// buildPollResults — shared shape for listPolls / voteOnPoll broadcast /
// getPollResults, so all three surfaces agree on what "results" means.
async function buildPollResults(pollId) {
  const [poll] = await sql`
    SELECT id, class_subject_id, creator_id, question, closes_at, created_at
    FROM connect_polls WHERE id = ${pollId}
  `;
  if (!poll) return null;

  const options = await sql`
    SELECT o.id, o.option_text, o.display_order, COUNT(v.id)::int AS vote_count
    FROM connect_poll_options o
    LEFT JOIN connect_poll_votes v ON v.option_id = o.id
    WHERE o.poll_id = ${pollId}
    GROUP BY o.id
    ORDER BY o.display_order ASC, o.id ASC;
  `;

  const totalVotes = options.reduce((sum, o) => sum + o.vote_count, 0);

  return { poll, options, total_votes: totalVotes };
}

// POST /connect/classrooms/:classSubjectId/polls — teacher-only, and only
// the teacher who owns THAT classroom (resolveClassroomAccess.isTeacher).
// Body: { question, option_text: string[], closes_at?: ISO string|null }
const createPoll = async (req, res) => {
  const { classSubjectId } = req.params;
  const { question, option_text, closes_at } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!question || !question.trim()) {
    return res.status(400).json({ message: 'question is required' });
  }
  const options = Array.isArray(option_text) ? option_text.map((t) => (t || '').trim()).filter(Boolean) : [];
  if (options.length < MIN_OPTIONS) {
    return res.status(400).json({ message: `option_text must be an array of at least ${MIN_OPTIONS} non-empty strings` });
  }

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access || !access.isTeacher) {
      return res.status(403).json({ message: 'Only the teacher of this classroom can create a poll' });
    }

    const [poll] = await sql`
      INSERT INTO connect_polls (class_subject_id, creator_id, question, closes_at)
      VALUES (${classSubjectId}, ${userId}, ${question.trim()}, ${closes_at || null})
      RETURNING id, class_subject_id, creator_id, question, closes_at, created_at;
    `;

    for (let i = 0; i < options.length; i++) {
      await sql`
        INSERT INTO connect_poll_options (poll_id, option_text, display_order)
        VALUES (${poll.id}, ${options[i]}, ${i});
      `;
    }

    const results = await buildPollResults(poll.id);
    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/classrooms/:classSubjectId/polls — any user with access to
// the classroom. Each poll includes per-option vote counts and whether
// (and how) the requesting user has already voted.
const listPolls = async (req, res) => {
  const { classSubjectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const polls = await sql`
      SELECT id FROM connect_polls WHERE class_subject_id = ${classSubjectId} ORDER BY created_at DESC;
    `;

    const out = [];
    for (const p of polls) {
      const results = await buildPollResults(p.id);
      const [myVote] = await sql`
        SELECT option_id FROM connect_poll_votes WHERE poll_id = ${p.id} AND user_id = ${userId}
      `;
      out.push({
        ...results,
        closed: !!(results.poll.closes_at && new Date(results.poll.closes_at) < new Date()),
        user_vote_option_id: myVote ? myVote.option_id : null,
      });
    }

    res.json({ polls: out });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// POST /connect/polls/:pollId/vote — body: { option_id }. Any user with
// access to the poll's classroom, once, ever (no vote-changing in v1 — a
// second attempt hits the DB's UNIQUE(poll_id, user_id) constraint and
// comes back as a real 409, not an app-level pre-check pretending to be one).
const voteOnPoll = async (req, res) => {
  const { pollId } = req.params;
  const { option_id } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!option_id) {
    return res.status(400).json({ message: 'option_id is required' });
  }

  try {
    const [poll] = await sql`SELECT id, class_subject_id, closes_at FROM connect_polls WHERE id = ${pollId}`;
    if (!poll) return res.status(404).json({ message: 'Poll not found' });

    const access = await resolveClassroomAccess(userId, role, poll.class_subject_id);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
      return res.status(410).json({ message: 'This poll is closed' });
    }

    const [option] = await sql`SELECT id FROM connect_poll_options WHERE id = ${option_id} AND poll_id = ${pollId}`;
    if (!option) {
      return res.status(400).json({ message: 'option_id does not belong to this poll' });
    }

    await sql`
      INSERT INTO connect_poll_votes (poll_id, option_id, user_id)
      VALUES (${pollId}, ${option_id}, ${userId});
    `;

    const results = await buildPollResults(pollId);

    const io = req.app.get('io');
    if (io) {
      io.to(`connect:classroom:${poll.class_subject_id}`).emit('connect:poll:updated', { pollId: Number(pollId), ...results });
    }

    res.status(201).json({ message: 'Vote recorded', ...results });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'You have already voted on this poll' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/polls/:pollId/results — option-by-option counts + total.
// Access-checked the same way as voting (must have access to the classroom).
const getPollResults = async (req, res) => {
  const { pollId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [poll] = await sql`SELECT id, class_subject_id FROM connect_polls WHERE id = ${pollId}`;
    if (!poll) return res.status(404).json({ message: 'Poll not found' });

    const access = await resolveClassroomAccess(userId, role, poll.class_subject_id);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const results = await buildPollResults(pollId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createPoll, listPolls, voteOnPoll, getPollResults };
