import express, { Request, Response } from 'express';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'uc_smarthelp',
});

// Verify database connection
db.getConnection()
  .then(async (connection) => {
    try {
      // Auto-migration: Ensure necessary columns exist
      const [columns]: any = await connection.query("SHOW COLUMNS FROM tickets");
      const columnNames = columns.map((c: any) => c.Field);
      
      if (!columnNames.includes('subject')) {
        await connection.query("ALTER TABLE tickets ADD COLUMN subject VARCHAR(255) NOT NULL DEFAULT 'No Subject'");
      }
      if (!columnNames.includes('department')) {
        await connection.query("ALTER TABLE tickets ADD COLUMN department VARCHAR(100)");
      }

      // Auto-migration: Ensure users table has department column
      const [userColumns]: any = await connection.query("SHOW COLUMNS FROM users");
      const userColumnNames = userColumns.map((c: any) => c.Field);
      if (!userColumnNames.includes('department')) {
        await connection.query("ALTER TABLE users ADD COLUMN department VARCHAR(100)");
      }

      // Create ticket_responses table if not exists
      // Check if tickets table has 'id' or 'ticket_id' to use as foreign key
      const ticketRefColumn = columnNames.includes('id') ? 'id' : (columnNames.includes('ticket_id') ? 'ticket_id' : 'id');

      await connection.query(`
        CREATE TABLE IF NOT EXISTS ticket_responses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id INT NOT NULL,
          user_id INT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticket_id) REFERENCES tickets(${ticketRefColumn}),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);

      // Create reviews table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          is_helpful BOOLEAN NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
    } catch (err: any) {
      // Error suppressed
    }
    connection.release();
  })
  .catch((err) => {
    // Error suppressed
  });

const formatUserResponse = (user: any) => {
  const id = user.id ?? user.user_id ?? user.ID ?? user.userId;
  return {
    id: id,
    userId: id,
    user_id: id,
    role: user.role,
    department: user.department,
    firstName: user.first_name || user.firstName,
    lastName: user.last_name || user.lastName,
    fullName: `${user.first_name || user.firstName} ${user.last_name || user.lastName}`,
    email: user.email
  };
};

app.post('/api/register', async (req: Request, res: Response) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    let user;
    if (existing.length > 0) {
      await db.query('UPDATE users SET first_name = ?, last_name = ?, password = ? WHERE email = ?', [firstName, lastName, hashedPassword, email]);
      const [updated] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
      user = updated[0];
    } else {
      // Check if this is the first user
      const [userCount]: any = await db.query('SELECT COUNT(*) as count FROM users');
      const role = userCount[0].count === 0 ? 'admin' : 'student';
      
      await db.query<ResultSetHeader>('INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)', [firstName, lastName, email, hashedPassword, role]);
      const [inserted] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
      user = inserted[0];
    }
    res.status(201).json(formatUserResponse(user));
  } catch (error: any) {
    res.status(500).json({ error: "Registration failed", details: error.message });
  }
});

app.post('/api/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let isMatch = false;
    // Try bcrypt first
    if (user.password && user.password.startsWith('$2')) {
      try {
        isMatch = await bcrypt.compare(password, user.password);
      } catch (e) {
        // Fallback to plain text comparison handled below
      }
    }

    // Fallback to plain text comparison
    if (!isMatch) {
      isMatch = (password === user.password);
    }

    if (isMatch) {
      res.json(formatUserResponse(user));
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error: any) {
    res.status(500).json({ error: "Login error" });
  }
});

app.post('/api/update-profile', async (req: Request, res: Response) => {
  const { userId, firstName, lastName } = req.body;
  if (!userId || !firstName || !lastName) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    let pkName = '';
    // Determine PK column
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE user_id = ?', [userId]);
      if (rows.length > 0) pkName = 'user_id';
    } catch (e) {}
    
    if (!pkName) {
      try {
        const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length > 0) pkName = 'id';
      } catch (e) {}
    }

    if (!pkName) return res.status(404).json({ error: "User not found" });

    await db.query(`UPDATE users SET first_name = ?, last_name = ? WHERE ${pkName} = ?`, [firstName, lastName, userId]);
    
    const [updated] = await db.query<RowDataPacket[]>(`SELECT * FROM users WHERE ${pkName} = ?`, [userId]);
    res.json(formatUserResponse(updated[0]));
  } catch (error: any) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/change-password', async (req: Request, res: Response) => {
  const { userId, oldPassword, newPassword } = req.body;
  if (!userId || !oldPassword || !newPassword) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    let user = null;
    let pkName = '';
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE user_id = ?', [userId]);
      if (rows.length > 0) { user = rows[0]; pkName = 'user_id'; }
    } catch (e) {}
    if (!user) {
      try {
        const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
        if (rows.length > 0) { user = rows[0]; pkName = 'id'; }
      } catch (e) {}
    }
    if (!user) return res.status(404).json({ error: "User not found" });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: "Incorrect old password" });
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await db.query(`UPDATE users SET password = ? WHERE ${pkName} = ?`, [hashedNewPassword, userId]);
    res.json({ message: "Password updated successfully" });
  } catch (error: any) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post('/api/google-auth', async (req: Request, res: Response) => {
  const { email, firstName, lastName } = req.body;
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    let user = rows[0];
    if (!user) {
      await db.query<ResultSetHeader>('INSERT INTO users (first_name, last_name, email, role) VALUES (?, ?, ?, ?)', [firstName, lastName, email, 'student']);
      const [inserted] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
      user = inserted[0];
    }
    res.json(formatUserResponse(user));
  } catch (error: any) {
    res.status(500).json({ error: "Auth Error" });
  }
});

app.post('/api/tickets', async (req: Request, res: Response) => {
  const { subject, description, department, sender_id } = req.body;
  if (!subject || !description || !department || !sender_id) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const userId = parseInt(sender_id.toString());
    if (isNaN(userId)) {
      return res.status(400).json({ error: "Invalid sender_id. Must be a number." });
    }
    
    // Check columns to be robust
    const [columns]: any = await db.query("SHOW COLUMNS FROM tickets");
    const columnNames = columns.map((c: any) => c.Field);
    
    let query = 'INSERT INTO tickets (subject, description, department, user_id, status) VALUES (?, ?, ?, ?, ?)';
    let params = [subject, description, department, userId, 'pending'];

    const [result] = await db.execute<ResultSetHeader>(query, params);
    res.status(201).json({ message: "Success", ticketId: result.insertId });
  } catch (error: any) {
    res.status(500).json({ error: "Database Error", details: error.message });
  }
});

app.get('/api/tickets', async (req: Request, res: Response) => {
  const { user_id, role: clientRole } = req.query;
  
  try {
    // 1. Determine the actual role of the user from the database
    let actualRole = 'student';
    if (user_id) {
      const [userCols]: any = await db.query("SHOW COLUMNS FROM users");
      const userPk = userCols.find((c: any) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';
      const [userRows]: any = await db.query(`SELECT role FROM users WHERE ${userPk} = ?`, [user_id]);
      if (userRows.length > 0) {
        actualRole = userRows[0].role.toLowerCase();
      }
    }

    const isStaffOrAdmin = actualRole === 'admin' || actualRole === 'staff';
    console.log(`[Tickets] Fetching for user_id: ${user_id}, actual_role: ${actualRole}, isStaffOrAdmin: ${isStaffOrAdmin}`);

    // 2. Build the query
    const [ticketCols]: any = await db.query("SHOW COLUMNS FROM tickets");
    const ticketColNames = ticketCols.map((c: any) => c.Field);
    const ticketPk = ticketColNames.includes('id') ? 'id' : (ticketColNames.includes('ticket_id') ? 'ticket_id' : 'id');
    const hasTicketNumber = ticketColNames.includes('ticket_number');

    let selectClause = `t.*, t.${ticketPk} as id`;
    if (!hasTicketNumber) {
      selectClause += `, t.${ticketPk} as ticket_number`;
    }

    let query = `
      SELECT ${selectClause}, u.first_name, u.last_name, CONCAT(u.first_name, ' ', u.last_name) AS full_name 
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.${userPkRealName}
    `;
    const params: any[] = [];
    
    // 3. Apply filtering based on ACTUAL role
    if (!isStaffOrAdmin) {
      if (user_id) {
        query += ' WHERE t.user_id = ?';
        params.push(user_id);
      } else {
        return res.json([]); // No user_id provided for student
      }
    }

    query += ' ORDER BY t.created_at DESC';
    
    const [rows]: any = await db.query(query, params);
    // Normalize status to lowercase and replace spaces with underscores for frontend consistency
    const normalizedRows = rows.map((r: any) => ({
      ...r,
      status: r.status?.toString().toLowerCase().trim().replace(/\s+/g, '_') || 'pending'
    }));
    res.json(normalizedRows);
  } catch (error: any) {
    console.error("Database Error in GET /api/tickets:", error);
    res.status(500).json({ error: "Error fetching tickets", details: error.message });
  }
});

app.get('/api/tickets/:id/responses', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [userCols]: any = await db.query("SHOW COLUMNS FROM users");
    const userPk = userCols.find((c: any) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

    const [rows] = await db.query(`
      SELECT tr.*, u.first_name, u.last_name, u.role
      FROM ticket_responses tr
      JOIN users u ON tr.user_id = u.${userPk}
      WHERE tr.ticket_id = ?
      ORDER BY tr.created_at ASC
    `, [id]);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: "Error fetching responses", details: error.message });
  }
});

app.post('/api/tickets/:id/responses', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id, message } = req.body;
  if (!user_id || !message) return res.status(400).json({ error: "Missing fields" });
  try {
    await db.execute('INSERT INTO ticket_responses (ticket_id, user_id, message) VALUES (?, ?, ?)', [id, user_id, message]);
    res.status(201).json({ message: "Response saved" });
  } catch (error: any) {
    res.status(500).json({ error: "Error saving response", details: error.message });
  }
});

app.post('/api/reviews', async (req: Request, res: Response) => {
  const { user_id, is_helpful, comment } = req.body;
  try {
    await db.execute('INSERT INTO reviews (user_id, is_helpful, comment) VALUES (?, ?, ?)', [user_id || null, is_helpful, comment || null]);
    res.status(201).json({ message: "Review saved" });
  } catch (error: any) {
    res.status(500).json({ error: "Error saving review", details: error.message });
  }
});

app.patch('/api/tickets/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "Missing status" });
  try {
    const [ticketCols]: any = await db.query("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c: any) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    await db.execute(`UPDATE tickets SET status = ? WHERE ${pkName} = ?`, [status, id]);
    res.json({ message: "Status updated successfully" });
  } catch (error: any) {
    res.status(500).json({ error: "Error updating status", details: error.message });
  }
});

app.delete('/api/tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // Check columns to find PK
    const [columns]: any = await db.query("SHOW COLUMNS FROM tickets");
    const pkName = columns.map((c: any) => c.Field).includes('id') ? 'id' : 'ticket_id';

    // First delete responses related to this ticket
    await db.execute('DELETE FROM ticket_responses WHERE ticket_id = ?', [id]);
    const [result] = await db.execute<ResultSetHeader>(`DELETE FROM tickets WHERE ${pkName} = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Ticket not found" });
    res.json({ message: "Ticket deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: "Error deleting ticket", details: error.message });
  }
});

app.get('/api/users', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query('SELECT id, first_name, last_name, email, role, department FROM users');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: "Error fetching users" });
  }
});

app.patch('/api/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, department } = req.body;
  try {
    await db.execute('UPDATE users SET role = ?, department = ? WHERE id = ?', [role, department || null, id]);
    res.json({ message: "User updated" });
  } catch (error: any) {
    res.status(500).json({ error: "Error updating user" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`server is running in port 3000`));

