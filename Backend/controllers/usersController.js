const sql = require('../config/db');
const bcrypt = require('bcryptjs');

// GET /users/me
const getMe = async (req, res) => {
    try {
        const [user] = await sql`SELECT id, name, email, role, class_id, roll_no FROM users WHERE id = ${req.user.id}`;
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// PUT /users/me
const updateName = async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Name is required' });
    }

    try {
        const trimmedName = name.trim();
        const [updatedUser] = await sql`
            UPDATE users 
            SET name = ${trimmedName} 
            WHERE id = ${req.user.id} 
            RETURNING id, name, email, role
        `;
        
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// PUT /users/me/password
const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' });
    }

    try {
        const [user] = await sql`SELECT * FROM users WHERE id = ${req.user.id}`;
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'New password must be at least 8 characters long' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${req.user.id}`;

        res.json({ message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

module.exports = {
    getMe,
    updateName,
    changePassword
};
