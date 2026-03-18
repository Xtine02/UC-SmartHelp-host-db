const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'uc_smarthelp',
});

// Verify connection
db.getConnection()
  .then(() => { /* Success */ })
  .catch(err => { /* Error suppressed */ });

// Authentication routes
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [firstName, lastName, email, hashedPassword, 'student']
    );

    res.status(201).json({
      id: result.insertId,
      userId: result.insertId,
      firstName,
      lastName,
      email,
      role: 'student',
      fullName: `${firstName} ${lastName}`
    });
  } catch (error) {
    res.status(500).json({ error: "Registration failed", details: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (user && user.password && await bcrypt.compare(password, user.password)) {
      res.json({
        id: user.id,
        userId: user.id,
        role: user.role,
        fullName: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Login error", details: error.message });
  }
});

app.post('/api/google-auth', async (req, res) => {
  const { email, firstName, lastName } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    let user = rows[0];

    if (!user) {
      const [result] = await db.query(
        'INSERT INTO users (first_name, last_name, email, role) VALUES (?, ?, ?, ?)',
        [firstName, lastName, email, 'student']
      );
      user = { id: result.insertId, first_name: firstName, last_name: lastName, email, role: 'student' };
    }

    res.json({ 
      id: user.id, 
      userId: user.id, 
      role: user.role, 
      fullName: `${user.first_name} ${user.last_name}`, 
      firstName: user.first_name, 
      lastName: user.last_name, 
      email: user.email 
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

// Chatbot history routes
app.post('/api/chatbot-history', async (req, res) => {
  const { user_id, sender_type, message } = req.body;
  if (!user_id || !sender_type || !message) {
    return res.status(400).json({ error: "Missing fields" });
  }
  
  try {
    const [result] = await db.query(
      'INSERT INTO chatbot_history (user_id, sender_type, message) VALUES (?, ?, ?)',
      [user_id, sender_type, message]
    );
    res.status(201).json({ message: "Chat history saved", id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: "Database Error", details: error.message });
  }
});

app.get('/api/chatbot-history/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT * FROM chatbot_history WHERE user_id = ? AND DATE(created_at) = CURDATE() ORDER BY created_at ASC',
      [userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chat history", details: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`server is running in port 3000`));

