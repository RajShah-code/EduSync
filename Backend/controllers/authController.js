const sql = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            role: user.role, 
            name: user.name,
            class_id: user.class_id || null,
            roll_no: user.roll_no || null
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
    );
};

// Login
const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [user] = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (!user) return res.status(404).json({ message: 'User not found' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ message: 'Invalid password' });

        res.json({ 
            token: generateToken(user), 
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                role: user.role,
                class_id: user.class_id || null,
                roll_no: user.roll_no || null,
                has_seen_tour: user.has_seen_tour ?? false
            } 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// Windows Auto-Login
const windowsLogin = async (req, res) => {
    const clientKeyHeader = req.headers['x-edusync-client-key'];
    const expectedClientKey = process.env.WINDOWS_LOGIN_CLIENT_KEY;

    if (!expectedClientKey || !clientKeyHeader || clientKeyHeader !== expectedClientKey) {
        return res.status(401).json({ message: 'Unauthorized client' });
    }

    const { windows_username } = req.body;
    if (!windows_username || typeof windows_username !== 'string' || !windows_username.trim()) {
        return res.status(400).json({ message: 'Windows username is required' });
    }

    const trimmedUsername = windows_username.trim();

    try {
        // Step 1: Direct windows_username lookup (any role)
        const [directUser] = await sql`
            SELECT * FROM users WHERE LOWER(windows_username) = LOWER(${trimmedUsername})
        `;
        if (directUser) {
            return res.json({
                token: generateToken(directUser),
                user: {
                    id: directUser.id,
                    name: directUser.name,
                    email: directUser.email,
                    role: directUser.role,
                    class_id: directUser.class_id || null,
                    roll_no: directUser.roll_no || null,
                    has_seen_tour: directUser.has_seen_tour ?? false
                }
            });
        }

        // Step 2: Fallback class+roll regex lookup (students only)
        const match = trimmedUsername.match(/^([A-Za-z]+)(\d+)$/);
        if (!match) {
            return res.status(404).json({ message: 'No matching user' });
        }

        const prefix = match[1];
        const rollStr = match[2];
        const rollInt = parseInt(rollStr, 10);

        const [cls] = await sql`
            SELECT id FROM classes WHERE LOWER(name) = LOWER(${prefix})
        `;
        if (!cls) {
            return res.status(404).json({ message: 'No matching class' });
        }

        const [user] = await sql`
            SELECT * FROM users 
            WHERE class_id = ${cls.id} 
              AND role = 'student' 
              AND (
                (roll_no ~ '^[0-9]+$' AND roll_no::integer = ${rollInt})
                OR TRIM(roll_no) = ${rollStr}
              )
        `;
        if (!user) {
            return res.status(404).json({ message: 'No matching student' });
        }

        res.json({ 
            token: generateToken(user), 
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                role: user.role,
                class_id: user.class_id || null,
                roll_no: user.roll_no || null,
                has_seen_tour: user.has_seen_tour ?? false
            } 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

module.exports = { login, windowsLogin };