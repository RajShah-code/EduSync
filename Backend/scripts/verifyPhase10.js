/**
 * Phase 10 Integration Verification — uses existing DB credentials
 * Creates a teacher + students temporarily if needed, runs tests, reports.
 *
 * Usage: node scripts/verifyPhase10.js
 */

const sql = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

// Generate JWT directly (bypass login for test users)
function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name, class_id: user.class_id || null },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function main() {
  console.log('\n======================================');
  console.log('  Phase 10 — Section 8 Verification  ');
  console.log('======================================\n');

  let teacherId, student1Id, student2Id, student3Id, classId, sessionId;
  let createdClassId = null;
  const cleanupIds = { users: [], sessions: [], exams: [] };

  try {
    // ── Setup: Ensure dedicated __VERIFY_TEST__ class exists ───────────────
    let [cls] = await sql`SELECT id FROM classes WHERE name = '__VERIFY_TEST__' LIMIT 1`;
    if (!cls) {
      [cls] = await sql`INSERT INTO classes (name) VALUES ('__VERIFY_TEST__') RETURNING id`;
      createdClassId = cls.id;
    }
    classId = cls.id;
    console.log(`[Setup] Using class_id=${classId} (__VERIFY_TEST__)`);

    // ── Setup: Create test teacher ──────────────────────────────────────────
    const pwHash = await bcrypt.hash('test123', 10);
    const [teacher] = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Test Teacher P10', 'p10_teacher_verify@test.com', ${pwHash}, 'teacher')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, role, class_id
    `;
    teacherId = teacher.id;
    cleanupIds.users.push(teacherId);
    console.log(`[Setup] Teacher created: id=${teacherId}`);

    // ── Setup: Create 3 test students with distinct roll_nos ────────────────
    const students = [];
    for (let i = 1; i <= 3; i++) {
      const [s] = await sql`
        INSERT INTO users (name, email, password_hash, role, class_id, roll_no)
        VALUES (
          ${'P10 Student ' + i},
          ${'p10_student' + i + '_verify@test.com'},
          ${pwHash},
          'student',
          ${classId},
          ${'P10-0' + i}
        )
        ON CONFLICT (email) DO UPDATE SET roll_no = EXCLUDED.roll_no, class_id = EXCLUDED.class_id
        RETURNING id, name, role, class_id, roll_no
      `;
      students.push(s);
      cleanupIds.users.push(s.id);
    }
    [student1Id, student2Id, student3Id] = students.map(s => s.id);
    console.log(`[Setup] Students: ${students.map(s => `${s.name}(roll:${s.roll_no})`).join(', ')}`);

    // ── Setup: Create a session for the teacher ─────────────────────────────
    const [session] = await sql`
      INSERT INTO sessions (lecture_name, subject, lab_room, password_hash, teacher_id, started_at)
      VALUES ('P10 Verify Session', 'Testing', 'Lab-1', ${pwHash}, ${teacherId}, NOW())
      RETURNING id
    `;
    sessionId = session.id;
    cleanupIds.sessions.push(sessionId);
    await sql`INSERT INTO session_classes (session_id, class_id) VALUES (${sessionId}, ${classId})`;
    console.log(`[Setup] Session created: id=${sessionId}`);

    const teacherToken = makeToken(teacher);
    const s1Token = makeToken(students[0]);
    const s2Token = makeToken(students[1]);
    const s3Token = makeToken(students[2]);

    // ── STEP 1: Teacher creates an exam with 2 sets ─────────────────────────
    console.log('\n--- STEP 1: Teacher Creates Exam (2 sets, mcq, limit 3) ---');
    const examPayload = {
      title: 'Unit Test Exam',
      session_id: sessionId,
      question_type: 'mcq',
      num_sets: 2,
      time_limit_minutes: 30,
      violation_limit: 3,
      class_ids: [classId],
      sets: [
        {
          set_number: 1,
          questions: [
            { question_text: 'Set 1 Q1', options: ['A','B','C','D'], correct_option: 0 },
            { question_text: 'Set 1 Q2', options: ['A','B','C','D'], correct_option: 1 }
          ]
        },
        {
          set_number: 2,
          questions: [
            { question_text: 'Set 2 Q1', options: ['A','B','C','D'], correct_option: 2 },
            { question_text: 'Set 2 Q2', options: ['A','B','C','D'], correct_option: 3 }
          ]
        }
      ]
    };

    const createRes = await api('POST', '/exams/create', examPayload, teacherToken);
    console.log(`Create Exam status: ${createRes.status}`);
    if (createRes.status !== 201) throw new Error(`Create exam failed: ${JSON.stringify(createRes.data)}`);
    const examId = createRes.data.exam.id;
    cleanupIds.exams.push(examId);
    console.log(`Exam created with id=${examId}, status=${createRes.data.exam.status}`);

    // Verify draft status
    if (createRes.data.exam.status !== 'draft') throw new Error('Exam initial status should be draft');

    // ── STEP 2: Open Exam (Transition draft -> waiting_room) ────────────────
    console.log('\n--- STEP 2: Teacher Opens Exam (draft -> waiting_room) ---');
    const openRes = await api('POST', `/exams/${examId}/open`, {}, teacherToken);
    console.log(`Open Exam status: ${openRes.status}`);
    if (openRes.status !== 200) throw new Error(`Open exam failed: ${JSON.stringify(openRes.data)}`);

    // ── STEP 3: Students Join Waiting Room ──────────────────────────────────
    console.log('\n--- STEP 3: 3 Students Join Waiting Room ---');
    const join1 = await api('POST', `/exams/${examId}/join`, {}, s1Token);
    const join2 = await api('POST', `/exams/${examId}/join`, {}, s2Token);
    const join3 = await api('POST', `/exams/${examId}/join`, {}, s3Token);

    console.log(`Student 1 Join status=${join1.status}`);
    console.log(`Student 2 Join status=${join2.status}`);
    console.log(`Student 3 Join status=${join3.status}`);

    if (join1.status !== 200 || join2.status !== 200 || join3.status !== 200) {
      throw new Error('Student join failed');
    }

    // ── STEP 4: Start Exam (Transition waiting_room -> active) ──────────────
    console.log('\n--- STEP 4: Teacher Starts Exam (waiting_room -> active) ---');
    const startRes = await api('POST', `/exams/${examId}/start`, {}, teacherToken);
    console.log(`Start Exam status: ${startRes.status}`);
    if (startRes.status !== 200) throw new Error(`Start exam failed: ${JSON.stringify(startRes.data)}`);

    // Verify round-robin set assignment by fetching assigned questions
    const q1Res = await api('GET', `/exams/${examId}/my-questions`, null, s1Token);
    const q2Res = await api('GET', `/exams/${examId}/my-questions`, null, s2Token);
    const q3Res = await api('GET', `/exams/${examId}/my-questions`, null, s3Token);

    const assignedSets = [q1Res.data.setNumber, q2Res.data.setNumber, q3Res.data.setNumber];
    console.log(`Assigned Sets across 3 students: [${assignedSets.join(', ')}]`);
    if (!assignedSets.includes(1) || !assignedSets.includes(2)) {
      throw new Error('Round-robin set distribution failed to assign both set 1 and set 2');
    }

    // ── STEP 5: Student 1 Records 3 Violations -> Auto-Submit Trigger ──────
    console.log('\n--- STEP 5: Student 1 Triggers Violations (Threshold = 3) ---');
    for (let i = 1; i <= 3; i++) {
      const vRes = await api('POST', `/exams/${examId}/violation`, { violation_type: 'tab_switch' }, s1Token);
      console.log(`  Violation ${i}: status=${vRes.status}, count=${vRes.data.violationCount}, locked=${vRes.data.locked}`);
      if (i < 3 && vRes.data.locked) throw new Error('Locked/auto-submitted prematurely!');
      if (i === 3 && !vRes.data.locked) throw new Error('Failed to lock/auto-submit on 3rd violation!');
    }
    console.log('Student 1 correctly locked & auto-submitted on 3rd violation ✓');

    // ── STEP 6: Student 2 Submits Normally ──────────────────────────────────
    console.log('\n--- STEP 6: Student 2 Submits Answers Normally ---');
    const questionsS2 = q2Res.data.questions || [];
    const answersS2 = questionsS2.map(q => ({ questionId: q.id, selectedOption: 0 }));
    const sub2Res = await api('POST', `/exams/${examId}/submit`, { answers: answersS2 }, s2Token);
    console.log(`Student 2 Submit status: ${sub2Res.status}`);
    if (sub2Res.status !== 200) throw new Error(`Submit failed for S2: ${JSON.stringify(sub2Res.data)}`);

    // ── STEP 7: Teacher Ends Exam ───────────────────────────────────────────
    console.log('\n--- STEP 7: Teacher Ends Exam (active -> ended) ---');
    const endRes = await api('POST', `/exams/${examId}/end`, {}, teacherToken);
    console.log(`End Exam status: ${endRes.status}`);
    if (endRes.status !== 200) throw new Error(`End exam failed: ${JSON.stringify(endRes.data)}`);

    // ── STEP 8: Teacher Fetches Results ─────────────────────────────────────
    console.log('\n--- STEP 8: Teacher Views Results Dashboard ---');
    const resultsRes = await api('GET', `/exams/${examId}/results`, null, teacherToken);
    console.log(`Results GET status: ${resultsRes.status}`);
    if (resultsRes.status !== 200) throw new Error('Failed to fetch exam results');

    const { exam, results } = resultsRes.data;
    console.log(`Exam Title: ${exam.title}, Total Recorded Attempts: ${results.length}`);
    console.log(`Results List (${results.length} attempts recorded):`);
    results.forEach(r => {
      console.log(`  - Student: ${r.student_name} (${r.roll_no}) | Status: ${r.status} | Violations: ${r.violation_count} | Auto-Submitted: ${r.auto_submitted}`);
    });

    if (results.length < 3) throw new Error('Expected 3 student attempt records in results');

    console.log('\n======================================');
    console.log('✓ ALL SECTION 8 VERIFICATION CHECKS PASSED');
    console.log('======================================\n');

  } catch (err) {
    console.error('\n✗ Verification error:', err.message);
  } finally {
    // ── Cleanup test data in single transaction ─────────────────────────────
    console.log('[Cleanup] Removing test data via transactioned cleanup...');
    try {
      await sql.begin(async (tx) => {
        if (cleanupIds.exams.length > 0) {
          await tx`DELETE FROM exam_violations WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(${cleanupIds.exams}))`;
          await tx`DELETE FROM exam_answers WHERE exam_attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = ANY(${cleanupIds.exams}))`;
          await tx`DELETE FROM exam_attempts WHERE exam_id = ANY(${cleanupIds.exams})`;
          await tx`DELETE FROM questions WHERE exam_set_id IN (SELECT id FROM exam_sets WHERE exam_id = ANY(${cleanupIds.exams}))`;
          await tx`DELETE FROM exam_sets WHERE exam_id = ANY(${cleanupIds.exams})`;
          await tx`DELETE FROM exam_classes WHERE exam_id = ANY(${cleanupIds.exams})`;
          await tx`DELETE FROM exams WHERE id = ANY(${cleanupIds.exams})`;
        }
        if (cleanupIds.sessions.length > 0) {
          await tx`DELETE FROM session_classes WHERE session_id = ANY(${cleanupIds.sessions})`;
          await tx`DELETE FROM sessions WHERE id = ANY(${cleanupIds.sessions})`;
        }
        if (cleanupIds.users.length > 0) {
          await tx`DELETE FROM users WHERE id = ANY(${cleanupIds.users})`;
        }
        if (createdClassId) {
          await tx`DELETE FROM classes WHERE id = ${createdClassId}`;
        }
      });
      console.log('[Cleanup] Done ✓ — Database fully restored.');
    } catch (cleanupErr) {
      console.error('[Cleanup] Error during transactioned cleanup:', cleanupErr.message);
    }
    process.exit(0);
  }
}

main();
