const sql = require('./db');
const bcrypt = require('bcryptjs');

/**
 * Automatically creates/updates the database schema for Phase 1.
 * Seeds initial classes and exactly one admin user if none exists.
 */
const setup = async () => {
  try {
    console.log("Database Setup: Checking tables and columns...");

    // 1. Create classes table
    await sql`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log("Database Setup: classes table checked.");

    // 2. Add class_id and roll_no to users table if they do not exist
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL;
    `;
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS roll_no VARCHAR(50);
    `;
    
    // Update users_role_check constraint to allow 'admin'
    await sql`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    `;
    await sql`
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin'));
    `;
    console.log("Database Setup: users table columns and check constraint checked.");

    // Create session_classes join table
    await sql`
      CREATE TABLE IF NOT EXISTS session_classes (
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
        PRIMARY KEY (session_id, class_id)
      );
    `;
    console.log("Database Setup: session_classes join table checked.");

    // 3. Seed default classes if none exist
    const [{ count: classCount }] = await sql`SELECT COUNT(*)::int FROM classes;`;
    if (classCount === 0) {
      console.log("Database Setup: Seeding default classes...");
      await sql`
        INSERT INTO classes (name) VALUES 
        ('FYBCA'), 
        ('SYBCA'), 
        ('TYBCA');
      `;
      console.log("Database Setup: Seed classes successfully added.");
    }

    // 4. Seed default admin if none exist
    const [{ count: adminCount }] = await sql`SELECT COUNT(*)::int FROM users WHERE role = 'admin';`;
    if (adminCount === 0) {
      console.log("Database Setup: Seeding default admin user (credentials: admin / admin123)...");
      const passwordHash = await bcrypt.hash('admin123', 10);
      await sql`
        INSERT INTO users (name, email, password_hash, role) 
        VALUES ('Admin', 'admin', ${passwordHash}, 'admin');
      `;
      console.log("Database Setup: Default admin seeded.");
    }

    console.log("Database Setup: Initialization complete.");
  } catch (err) {
    console.error("Database Setup: Failed to initialize schema/seed:", err);
    throw err;
  }
};

module.exports = setup;
