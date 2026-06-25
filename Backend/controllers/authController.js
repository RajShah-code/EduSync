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
                roll_no: user.roll_no || null
            } 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

module.exports = { login };