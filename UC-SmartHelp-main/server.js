const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  database: process.env.DB_NAME || 'uc_smarthelp',
});

// Verify connection
db.getConnection()
  .then(() => { /* Success */ })
  .catch(err => { /* Error suppressed */ });

const initializeDatabase = async () => {
  const connection = await db.getConnection();
  try {
    const [userColumns] = await connection.query("SHOW COLUMNS FROM users");
    const userColumnNames = userColumns.map((c) => c.Field);
    if (!userColumnNames.includes('is_disabled')) {
      await connection.query("ALTER TABLE users ADD COLUMN is_disabled TINYINT(1) DEFAULT 0");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS website_feedback (
        web_feedback_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        is_helpful BOOLEAN NOT NULL,
        comment TEXT,
        date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [websiteColumns] = await connection.query("SHOW COLUMNS FROM website_feedback");
    const userIdColumn = websiteColumns.find((c) => c.Field === 'user_id');
    if (userIdColumn && userIdColumn.Null === 'NO') {
      await connection.query("ALTER TABLE website_feedback MODIFY COLUMN user_id INT NULL");
    }
  } finally {
    connection.release();
  }
};

initializeDatabase().catch(() => {});

// Authentication routes
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, username, password } = req.body;
  
  if (!firstName || !lastName || !username || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Username already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (first_name, last_name, username, password, role) VALUES (?, ?, ?, ?, ?)',
      [firstName, lastName, username, hashedPassword, 'student']
    );

    res.status(201).json({
      id: result.insertId,
      userId: result.insertId,
      firstName,
      lastName,
      username,
      role: 'student',
      fullName: `${firstName} ${lastName}`
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed", details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (user && Number(user.is_disabled) === 1) {
      return res.status(403).json({ error: "Account disabled" });
    }
    if (user && user.password && await bcrypt.compare(password, user.password)) {
      res.json({
        id: user.id,
        userId: user.id,
        role: user.role,
        fullName: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Login error", details: error.message });
  }
});

app.post('/api/google-auth', async (req, res) => {
  const { email, firstName, lastName, profileImage } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [email]);
    let user = rows[0];

    if (!user) {
      const [result] = await db.query(
        'INSERT INTO users (first_name, last_name, username, role, image) VALUES (?, ?, ?, ?, ?)',
        [firstName, lastName, email, 'student', profileImage || null]
      );
      user = { id: result.insertId, first_name: firstName, last_name: lastName, username: email, role: 'student', image: profileImage || null };
    } else if ((!user.image || String(user.image).trim() === '') && typeof profileImage === 'string' && profileImage.trim() !== '') {
      await db.query('UPDATE users SET image = ? WHERE id = ?', [profileImage, user.id]);
      user.image = profileImage;
    }

    res.json({ 
      id: user.id, 
      userId: user.id, 
      role: user.role, 
      fullName: `${user.first_name} ${user.last_name}`, 
      firstName: user.first_name, 
      lastName: user.last_name, 
      username: user.username,
      image: user.image || null,
      profileImage: user.image || null
    });
  } catch (error) {
    res.status(500).json({ error: "Google Auth error", details: error.message });
  }
});

// Ticket routes
app.post('/api/tickets', async (req, res) => {
  const { subject, description, department, sender_id } = req.body;
  if (!subject || !description || !department || !sender_id) {
    return res.status(400).json({ error: "Missing fields" });
  }
  
  try {
    const [result] = await db.query(
      'INSERT INTO tickets (subject, description, department, user_id, status) VALUES (?, ?, ?, ?, ?)',
      [subject, description, department, sender_id, 'pending']
    );
    res.status(201).json({ message: "Ticket created successfully", ticketId: result.insertId });
  } catch (error) {
    res.status(500).json({ error: "Database Error", details: error.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  const { user_id, role } = req.query;
  try {
    let query = 'SELECT * FROM tickets';
    const params = [];

    if (role === 'student') {
      query += ' WHERE user_id = ?';
      params.push(user_id);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await db.query(query, params);
    // Add an alias for the UI if it expects ticket_number
    const formattedRows = rows.map(r => ({
      ...r,
      ticket_number: r.id || r.ticket_id || r.ID
    }));
    res.json(formattedRows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets", details: error.message });
  }
});

// Website Feedback endpoint
app.post('/api/website-feedback', async (req, res) => {
  try {
    const { user_id, is_helpful, comment } = req.body;

    console.log('📮 Website Feedback Received:', { user_id, is_helpful, comment });

    if (is_helpful === null || is_helpful === undefined) {
      return res.status(400).json({ error: "is_helpful field is required" });
    }

    const userIdValue = typeof user_id !== 'undefined' ? user_id : null;
    const [result] = await db.query(
      'INSERT INTO website_feedback (user_id, is_helpful, comment, date_submitted) VALUES (?, ?, ?, NOW())',
      [userIdValue, is_helpful, comment || null]
    );

    console.log('✅ Feedback stored with ID:', result.insertId);

    res.status(201).json({
      id: result.insertId,
      message: "Feedback submitted successfully"
    });
  } catch (error) {
    console.error('❌ Feedback error:', error.message);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// Get website feedback endpoint
app.get('/api/website-feedback', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, user_id, is_helpful, comment, date_submitted FROM website_feedback ORDER BY date_submitted DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching website feedback:", error);
    res.status(500).json({ error: "Failed to fetch website feedback", details: error.message });
  }
});

// User management endpoints (support id/user_id schema)
app.patch('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { role, department, is_disabled } = req.body;
  try {
    const [columns] = await db.query("SHOW COLUMNS FROM users");
    const columnNames = columns.map((c) => c.Field);
    const idColumn = columnNames.includes("id") ? "id" : (columnNames.includes("user_id") ? "user_id" : "id");

    const updates = [];
    const values = [];
    if (typeof role !== "undefined") {
      updates.push("role = ?");
      values.push(role);
    }
    if (typeof department !== "undefined") {
      updates.push("department = ?");
      values.push(department || null);
    }
    if (typeof is_disabled !== "undefined") {
      updates.push("is_disabled = ?");
      values.push(Number(Boolean(is_disabled)));
    }
    if (!updates.length) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    values.push(id);
    const [result] = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE ${idColumn} = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Error updating user', details: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      'DELETE FROM users WHERE user_id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Error deleting user', details: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`server is running in port 3000`));

