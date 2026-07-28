const sql = require('../config/db');

async function main() {
  const confirm = process.argv.includes('--confirm');

  // Helper to check table existence
  const tableExists = async (name) => {
    const [row] = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = ${name}
      )
    `;
    return row?.exists;
  };

  // 1. Fetch test class IDs
  const testClassRows = await sql`SELECT id, name, created_at FROM classes WHERE name = '__VERIFY_TEST__'`;
  const testClassIds = testClassRows.map(r => r.id);

  // 2. Fetch test user IDs (by email OR by class_id of test classes)
  let testUserRows = [];
  if (testClassIds.length > 0) {
    testUserRows = await sql`
      SELECT id, name, email, role, created_at FROM users
      WHERE email LIKE '%_verify@test.com' 
         OR email = 'dec_teacher@test.com' 
         OR email = 'dec_student@test.com'
         OR class_id = ANY(${testClassIds})
    `;
  } else {
    testUserRows = await sql`
      SELECT id, name, email, role, created_at FROM users
      WHERE email LIKE '%_verify@test.com' 
         OR email = 'dec_teacher@test.com' 
         OR email = 'dec_student@test.com'
    `;
  }
  const testUserIds = testUserRows.map(r => r.id);

  // 3. Fetch test exam IDs (created by test users AND mapped to test classes)
  let testExamRows = [];
  if (testUserIds.length > 0 && testClassIds.length > 0) {
    testExamRows = await sql`
      SELECT DISTINCT e.id, e.title, e.status, e.created_by, e.created_at, u.email AS creator_email
      FROM exams e
      JOIN exam_classes ec ON e.id = ec.exam_id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.created_by = ANY(${testUserIds})
        AND ec.class_id = ANY(${testClassIds})
    `;
  }
  const testExamIds = testExamRows.map(r => r.id);

  // 4. Fetch test session IDs (created by test users AND mapped to test classes)
  let testSessionRows = [];
  if (testUserIds.length > 0 && testClassIds.length > 0) {
    testSessionRows = await sql`
      SELECT DISTINCT s.id, s.lecture_name, s.started_at, u.email AS teacher_email
      FROM sessions s
      JOIN session_classes sc ON s.id = sc.session_id
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE s.teacher_id = ANY(${testUserIds})
        AND sc.class_id = ANY(${testClassIds})
    `;
  }
  const testSessionIds = testSessionRows.map(r => r.id);

  console.log('========================================================================');
  console.log('CATEGORY A: Safe to Auto-Clean (Unambiguous Test Data)');
  console.log('========================================================================');
  
  console.log(`\n--- Test Users (${testUserRows.length} found) ---`);
  testUserRows.forEach(u => {
    console.log(`  ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Created: ${u.created_at}`);
  });

  console.log(`\n--- Test Exams (${testExamRows.length} found) ---`);
  testExamRows.forEach(e => {
    console.log(`  ID: ${e.id} | Title: ${e.title} | Status: ${e.status} | Creator: ${e.creator_email} | Created: ${e.created_at}`);
  });

  console.log(`\n--- Test Sessions (${testSessionRows.length} found) ---`);
  testSessionRows.forEach(s => {
    console.log(`  ID: ${s.id} | Lecture: ${s.lecture_name} | Teacher: ${s.teacher_email} | Started: ${s.started_at}`);
  });

  console.log(`\n--- Test Classes (${testClassRows.length} found) ---`);
  testClassRows.forEach(c => {
    console.log(`  ID: ${c.id} | Name: ${c.name} | Created: ${c.created_at}`);
  });

  console.log('\n========================================================================');
  console.log('CATEGORY B: Ambiguous / Genuinely In-Progress (NEVER AUTO-DELETED)');
  console.log('========================================================================');
  
  const knownTestExamIds = testExamIds.length > 0 ? testExamIds : [-1];
  const knownTestSessionIds = testSessionIds.length > 0 ? testSessionIds : [-1];

  const ambiguousSessions = await sql`
    SELECT s.id, s.lecture_name, s.started_at, u.email AS teacher_email
    FROM sessions s
    LEFT JOIN users u ON s.teacher_id = u.id
    WHERE s.ended_at IS NULL AND NOT (s.id = ANY(${knownTestSessionIds}))
  `;

  const ambiguousExams = await sql`
    SELECT e.id, e.title, e.status, e.created_at, u.email AS creator_email
    FROM exams e
    LEFT JOIN users u ON e.created_by = u.id
    WHERE e.status IN ('waiting_room', 'active') AND NOT (e.id = ANY(${knownTestExamIds}))
  `;

  console.log(`\n--- Active/In-Progress Sessions (${ambiguousSessions.length} found) ---`);
  if (ambiguousSessions.length === 0) {
    console.log('  None');
  } else {
    ambiguousSessions.forEach(s => {
      console.log(`  ID: ${s.id} | Lecture: ${s.lecture_name} | Teacher: ${s.teacher_email} | Started: ${s.started_at}`);
      console.log(`    [Action Suggestion]: UPDATE sessions SET ended_at = NOW() WHERE id = ${s.id};`);
    });
  }

  console.log(`\n--- Active/Waiting Room Exams (${ambiguousExams.length} found) ---`);
  if (ambiguousExams.length === 0) {
    console.log('  None');
  } else {
    ambiguousExams.forEach(e => {
      console.log(`  ID: ${e.id} | Title: ${e.title} | Status: ${e.status} | Creator: ${e.creator_email} | Created: ${e.created_at}`);
      console.log(`    [Action Suggestion]: UPDATE exams SET status = 'ended' WHERE id = ${e.id};`);
    });
  }

  if (confirm) {
    console.log('\n========================================================================');
    console.log('CONFIRMATION MODE: Performing transactioned cleanup of Category A...');
    console.log('========================================================================');

    try {
      await sql.begin(async (tx) => {
        // 1. exam_violations
        if (testExamIds.length > 0) {
          if (await tableExists('exam_violations')) {
            await tx`
              DELETE FROM exam_violations 
              WHERE exam_attempt_id IN (
                SELECT id FROM exam_attempts WHERE exam_id = ANY(${testExamIds})
              )
            `;
          }
          // 2. exam_answers
          if (await tableExists('exam_answers')) {
            await tx`
              DELETE FROM exam_answers 
              WHERE exam_attempt_id IN (
                SELECT id FROM exam_attempts WHERE exam_id = ANY(${testExamIds})
              )
            `;
          }
          // 3. exam_attempts
          if (await tableExists('exam_attempts')) {
            await tx`
              DELETE FROM exam_attempts 
              WHERE exam_id = ANY(${testExamIds})
            `;
          }
          // 4. questions
          if (await tableExists('questions')) {
            await tx`
              DELETE FROM questions 
              WHERE exam_set_id IN (
                SELECT id FROM exam_sets WHERE exam_id = ANY(${testExamIds})
              )
            `;
          }
          // 5. exam_sets
          if (await tableExists('exam_sets')) {
            await tx`
              DELETE FROM exam_sets 
              WHERE exam_id = ANY(${testExamIds})
            `;
          }
          // 6. exam_classes
          if (await tableExists('exam_classes')) {
            await tx`
              DELETE FROM exam_classes 
              WHERE exam_id = ANY(${testExamIds})
            `;
          }
          // 7. exams
          await tx`
            DELETE FROM exams 
            WHERE id = ANY(${testExamIds})
          `;
        }

        // Clean up class associations for non-test exams
        if (testClassIds.length > 0) {
          if (await tableExists('exam_classes')) {
            await tx`DELETE FROM exam_classes WHERE class_id = ANY(${testClassIds})`;
          }
          if (await tableExists('session_classes')) {
            await tx`DELETE FROM session_classes WHERE class_id = ANY(${testClassIds})`;
          }
        }

        // 8. Nullify exam references to test sessions before deleting sessions
        if (testSessionIds.length > 0) {
          await tx`
            UPDATE exams 
            SET session_id = NULL 
            WHERE session_id = ANY(${testSessionIds})
          `;
        }

        // 9. session_classes
        if (testSessionIds.length > 0) {
          if (await tableExists('session_classes')) {
            await tx`
              DELETE FROM session_classes 
              WHERE session_id = ANY(${testSessionIds})
            `;
          }
          // 10. sessions
          if (await tableExists('tasks') && testSessionIds.length > 0) {
            if (await tableExists('submissions')) {
              await tx`DELETE FROM submissions WHERE task_id IN (SELECT id FROM tasks WHERE session_id = ANY(${testSessionIds}))`;
            }
            await tx`DELETE FROM tasks WHERE session_id = ANY(${testSessionIds})`;
          }
          await tx`
            DELETE FROM sessions 
            WHERE id = ANY(${testSessionIds})
          `;
        }

        // 11. Cleanup doubts, submissions, attendance for test users
        if (testUserIds.length > 0) {
          if (await tableExists('submissions')) {
            await tx`DELETE FROM submissions WHERE student_id = ANY(${testUserIds})`;
          }
          if (await tableExists('doubt_requests')) {
            await tx`DELETE FROM doubt_requests WHERE student_id = ANY(${testUserIds})`;
          }
          if (await tableExists('attendance')) {
            await tx`DELETE FROM attendance WHERE student_id = ANY(${testUserIds})`;
          }
          if (await tableExists('files')) {
            await tx`DELETE FROM files WHERE uploader_id = ANY(${testUserIds})`;
          }

          // 12. users
          await tx`
            DELETE FROM users 
            WHERE id = ANY(${testUserIds})
          `;
        }

        // 13. classes
        if (testClassIds.length > 0) {
          await tx`UPDATE users SET class_id = NULL WHERE class_id = ANY(${testClassIds})`;
          await tx`
            DELETE FROM classes 
            WHERE id = ANY(${testClassIds})
          `;
        }
      });

      console.log('\n✓ Transaction completed successfully.');

      // Re-run Category A queries to verify zero rows
      const postUserCount = await sql`
        SELECT COUNT(*)::int FROM users
        WHERE email LIKE '%_verify@test.com' OR email = 'dec_teacher@test.com' OR email = 'dec_student@test.com'
      `;
      const postExamCount = testUserIds.length > 0 ? await sql`
        SELECT COUNT(*)::int FROM exams
        WHERE created_by = ANY(${testUserIds})
      ` : [{ count: 0 }];
      const postSessionCount = testUserIds.length > 0 ? await sql`
        SELECT COUNT(*)::int FROM sessions
        WHERE teacher_id = ANY(${testUserIds})
      ` : [{ count: 0 }];
      const postClassCount = await sql`
        SELECT COUNT(*)::int FROM classes
        WHERE name = '__VERIFY_TEST__'
      `;

      console.log('\n========================================================================');
      console.log('VERIFICATION: Post-cleanup check (should all be 0)');
      console.log('========================================================================');
      console.log(`  Users remaining: ${postUserCount[0].count}`);
      console.log(`  Exams remaining: ${postExamCount[0].count}`);
      console.log(`  Sessions remaining: ${postSessionCount[0].count}`);
      console.log(`  Classes remaining: ${postClassCount[0].count}`);

      console.log('\n========================================================================');
      console.log('SUMMARY OF REMOVED DATA');
      console.log('========================================================================');
      console.log(`Removed: ${testUserRows.length} test users, ${testExamRows.length} exams, ${testSessionRows.length} sessions.`);
      console.log('========================================================================');

    } catch (err) {
      console.error('\n❌ Transaction failed and rolled back:', err.message);
    }
  } else {
    console.log('\n========================================================================');
    console.log('Dry-run complete. To confirm and execute cleanup of Category A, run:');
    console.log('  node scripts/cleanupTestData.js --confirm');
    console.log('========================================================================');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
