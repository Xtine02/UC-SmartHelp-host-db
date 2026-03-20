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

// This is used for ticket responses tables, which may be named either `ticket_response` or `ticket_responses`.
// It's initialized during database migration in `initializeDatabase`.
let RESPONSE_TABLE = 'ticket_response';

interface DBColumn extends RowDataPacket {
  Field: string;
}

interface User extends RowDataPacket {
  id?: number;
  user_id?: number;
  ID?: number;
  userId?: number;
  role: string;
  department?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  email: string;
  password?: string;
}

// Helper to return the correct ticket response table name.
// Some installs use `ticket_response` (singular), others use `ticket_responses`.
const getResponseTableName = async () => {
  const [tables] = await db.query<RowDataPacket[]>("SHOW TABLES");
  const tableNames = tables.map((row: RowDataPacket) => Object.values(row)[0]);
  if (tableNames.includes('ticket_response')) return 'ticket_response';
  if (tableNames.includes('ticket_responses')) return 'ticket_responses';
  return 'ticket_response';
};

// Helper to log audit trail entries without blocking the main request flow.
const logAudit = async (
  req: Request,
  userId: number | string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: string
) => {
  try {
    const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
    await db.execute(
      'INSERT INTO audit_trail (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, action, entityType || null, entityId || null, details || null, ip_address]
    );
  } catch (error: unknown) {
    console.error('Error logging audit trail:', error);
  }
};

// Verify database connection and perform auto-migrations
const initializeDatabase = async () => {
  const connection = await db.getConnection();
  try {
    // Auto-migration: Ensure necessary columns exist
    const [columns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const columnNames = columns.map((c) => c.Field);

    if (!columnNames.includes('subject')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN subject VARCHAR(255) NOT NULL DEFAULT 'No Subject'");
    }
    if (!columnNames.includes('department')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN department VARCHAR(100)");
    }

    // Add a department_id foreign key column if it doesn't exist (used for forwarding by department ID)
    if (!columnNames.includes('department_id')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN department_id INT NULL");
    }

    const ticketRefColumn = columnNames.includes('id') ? 'id' : (columnNames.includes('ticket_id') ? 'ticket_id' : 'id');

    // Auto-migration: Ensure users table has department column
    const [userColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userColumnNames = userColumns.map((c) => c.Field);
    if (!userColumnNames.includes('department')) {
      await connection.query("ALTER TABLE users ADD COLUMN department VARCHAR(100)");
    }

    // Normalize response table naming (if old plural table exists, rename it)
    const [tables] = await connection.query<RowDataPacket[]>("SHOW TABLES");
    const tableNames = tables.map((row: RowDataPacket) => Object.values(row)[0]);
    if (tableNames.includes('ticket_responses') && !tableNames.includes('ticket_response')) {
      await connection.query('RENAME TABLE ticket_responses TO ticket_response');
    }

    // Ensure departments table exists for ticket forwarding
    if (!tableNames.includes('departments')) {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS departments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        )
      `);
    }

    // Check if departments table is empty or incomplete, and repopulate if needed
    const [existingDepts] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM departments");
    const deptCount = existingDepts[0]?.count || 0;
    
    if (deptCount < 7) {
      // Delete existing departments and repopulate to ensure consistency
      await connection.query("DELETE FROM departments");
      await connection.query(`
        INSERT INTO departments (id, name) VALUES 
          (1, "Registrar's Office"),
          (2, "Accounting Office"),
          (3, "Clinic"),
          (4, "CCS Office"),
          (5, "Cashier's Office"),
          (6, "SAO"),
          (7, "Scholarship")
      `);
    } else {
      // Departments table already has sufficient data
    }

    // Use singular table name always
    RESPONSE_TABLE = 'ticket_response';

    // Create response table if it does not exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ticket_response (
        response_id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        sender_id INT NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'student',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(${ticketRefColumn}),
        FOREIGN KEY (sender_id) REFERENCES users(id)
      )
    `);

    // Ensure response table has required columns
    const [responseColumns] = await connection.query<DBColumn[]>(`SHOW COLUMNS FROM ${RESPONSE_TABLE}`);
    const responseColumnNames = responseColumns.map((c) => c.Field);

    if (!responseColumnNames.includes('response_id') && responseColumnNames.includes('id')) {
      await connection.query(`ALTER TABLE ${RESPONSE_TABLE} CHANGE id response_id INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (!responseColumnNames.includes('sender_id') && responseColumnNames.includes('user_id')) {
      await connection.query(`ALTER TABLE ${RESPONSE_TABLE} CHANGE user_id sender_id INT NOT NULL`);
    }
    if (!responseColumnNames.includes('role')) {
      await connection.query(`ALTER TABLE ${RESPONSE_TABLE} ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'student'`);
    }

    // Ensure there is no unique constraint on ticket_id (allows multiple replies per ticket)
    try {
      const [indexes] = await connection.query<RowDataPacket[]>(`SHOW INDEX FROM ${RESPONSE_TABLE} WHERE Column_name = 'ticket_id'`);
      interface IndexRecord extends RowDataPacket {
        Non_unique: number;
        Key_name: string;
      }
      const uniqueIndexes = (indexes as IndexRecord[]).filter((idx: IndexRecord) => idx.Non_unique === 0);
      if (uniqueIndexes.length) {
        console.log(`Dropping unique indexes on ${RESPONSE_TABLE}.ticket_id:`, uniqueIndexes.map((i) => i.Key_name));
      }
      for (const idx of uniqueIndexes) {
        if (idx.Key_name) {
          await connection.query(`ALTER TABLE ${RESPONSE_TABLE} DROP INDEX \`${idx.Key_name}\``);
        }
      }
    } catch (err: unknown) {
      console.warn("Could not inspect/drop ticket_id indexes on response table", err);
    }

    // Create reviews table (no foreign key to avoid schema mismatch)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        is_helpful BOOLEAN NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create department_feedback table (no foreign keys to avoid mismatched schema)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS department_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id INT NOT NULL,
        user_id INT NOT NULL,
        department VARCHAR(100) NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create website_feedback table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS website_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        session_id VARCHAR(255),
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
        ease_of_use INT NOT NULL CHECK (ease_of_use >= 1 AND ease_of_use <= 5),
        design INT NOT NULL CHECK (design >= 1 AND design <= 5),
        speed INT NOT NULL CHECK (speed >= 1 AND speed <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err: unknown) {
    console.error("Database initialization error:", err);
  } finally {
    connection.release();
  }
};

initializeDatabase().catch((err) => {
  console.error("Failed to initialize database:", err);
});

const formatUserResponse = (user: User) => {
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
      const [userCount] = await db.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
    const role = (userCount[0] as { count: number }).count === 0 ? 'admin' : 'student';
      
    await db.query<ResultSetHeader>('INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)', [firstName, lastName, email, hashedPassword, role]);
    const [inserted] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    user = inserted[0];
  }
  res.status(201).json(formatUserResponse(user as User));
} catch (error: unknown) {
  res.status(500).json({ error: "Registration failed", details: error instanceof Error ? error.message : String(error) });
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
    } catch (e: unknown) {
      // Fallback to plain text comparison handled below
    }
  }

  // Fallback to plain text comparison
  if (!isMatch) {
    isMatch = (password === user.password);
  }

  if (isMatch) {
    // Log successful login - handle both 'id' and 'user_id' column names
    const userId = user.id ?? user.user_id;
    await logAudit(req, userId, 'User logged in', 'user', userId.toString(), `Login from ${user.role} account`);

    res.json(formatUserResponse(user as User));
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
} catch (error: unknown) {
  res.status(500).json({ error: "Login error" });
}
});

// Logout endpoint with audit logging
app.post('/api/logout', async (req: Request, res: Response) => {
  const { userId } = req.body;

  if (userId) {
    await logAudit(req, userId, 'User logged out', 'user', userId.toString(), 'User session ended');
  }

  res.json({ message: 'Logged out successfully' });
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
  } catch (e: unknown) {
    // Ignore if column doesn't exist
  }
  
  if (!pkName) {
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
      if (rows.length > 0) pkName = 'id';
    } catch (e: unknown) {
      // Ignore if column doesn't exist
    }
  }

  if (!pkName) return res.status(404).json({ error: "User not found" });

  await db.query(`UPDATE users SET first_name = ?, last_name = ? WHERE ${pkName} = ?`, [firstName, lastName, userId]);
  
  const [updated] = await db.query<RowDataPacket[]>(`SELECT * FROM users WHERE ${pkName} = ?`, [userId]);

  // Log audit trail for profile update
  await logAudit(req, userId, 'Updated profile information', 'user', userId.toString(), 'Updated first name and last name');

  res.json(formatUserResponse(updated[0] as User));
} catch (error: unknown) {
  res.status(500).json({ error: "Server error" });
}
});

app.post('/api/change-password', async (req: Request, res: Response) => {
const { userId, oldPassword, newPassword } = req.body;
if (!userId || !oldPassword || !newPassword) {
  return res.status(400).json({ error: "Missing required fields" });
}
try {
  let user: User | null = null;
  let pkName = '';
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE user_id = ?', [userId]);
    if (rows.length > 0) { user = rows[0] as User; pkName = 'user_id'; }
  } catch (e: unknown) {
    // Ignore if column doesn't exist
  }
  if (!user) {
    try {
      const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE id = ?', [userId]);
      if (rows.length > 0) { user = rows[0] as User; pkName = 'id'; }
    } catch (e: unknown) {
      // Ignore if column doesn't exist
    }
  }
  if (!user) return res.status(404).json({ error: "User not found" });
  const isMatch = await bcrypt.compare(oldPassword, user.password || '');
  if (!isMatch) return res.status(401).json({ error: "Incorrect old password" });
  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  await db.query(`UPDATE users SET password = ? WHERE ${pkName} = ?`, [hashedNewPassword, userId]);

  // Log audit trail for password change
  await logAudit(req, userId, 'Changed password', 'user', userId.toString(), 'Password updated successfully');

  res.json({ message: "Password updated successfully" });
} catch (error: unknown) {
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
  res.json(formatUserResponse(user as User));
} catch (error: unknown) {
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
  
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
  const columnNames = columns.map((c) => c.Field);
  
  const query = 'INSERT INTO tickets (subject, description, department, user_id, status) VALUES (?, ?, ?, ?, ?)';
  const params = [subject, description, department, userId, 'pending'];

  const [result] = await db.execute<ResultSetHeader>(query, params);
  await logAudit(req, userId, 'Created ticket', 'ticket', result.insertId.toString(), `Subject: ${subject}`);
  res.status(201).json({ message: "Success", ticketId: result.insertId });
} catch (error: unknown) {
  res.status(500).json({ error: "Database Error", details: error instanceof Error ? error.message : String(error) });
}
});

app.get('/api/tickets', async (req: Request, res: Response) => {
const { user_id, department } = req.query;

try {
  // 1. Identify the user and their actual role
  let actualRole = 'student';
  let detectedUserPk = 'id';
  
  const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
  detectedUserPk = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

  if (user_id) {
    const [userRows] = await db.query<RowDataPacket[]>(`SELECT role FROM users WHERE ${detectedUserPk} = ?`, [user_id]);
    if (userRows.length > 0) {
      actualRole = userRows[0].role.toLowerCase();
    }
  }

  const isStaffOrAdmin = actualRole === 'admin' || actualRole === 'staff';

  // 2. Determine ticket primary key
  const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
  const ticketColNames = ticketCols.map((c) => c.Field);
  const ticketPk = ticketColNames.includes('id') ? 'id' : (ticketColNames.includes('ticket_id') ? 'ticket_id' : 'id');
  const hasTicketNumber = ticketColNames.includes('ticket_number');

  // Add an unread reply indicator for student view: true when staff replied after last acknowledge
  let selectClause = `t.*, t.${ticketPk} as id,
    (SELECT COUNT(*) FROM ticket_response tr WHERE tr.ticket_id = t.${ticketPk}
      AND LOWER(tr.role) = 'staff'
      AND tr.created_at > IFNULL(t.acknowledge_at, t.created_at)
    ) > 0 AS has_unread_reply
  `;
  if (!hasTicketNumber) {
    selectClause += `, t.${ticketPk} as ticket_number`;
  }

  // 3. Build query with strict server-side filtering
  // Join departments if available so frontend can display department name and id
  let query = `
    SELECT ${selectClause}, u.first_name, u.last_name, CONCAT(u.first_name, ' ', u.last_name) AS full_name,
      d.id AS department_id, d.name AS department_name
    FROM tickets t
    LEFT JOIN users u ON t.user_id = u.${detectedUserPk}
    LEFT JOIN departments d ON t.department_id = d.id
  `;
  
  const params: unknown[] = [];
  let whereAdded = false;

  if (actualRole === 'admin') {
    // Admin can see all tickets (no additional filtering)
    whereAdded = true;
  } else if (actualRole === 'staff' && department && department.toString().trim().toLowerCase() !== 'all') {
    // Staff requesting specific department tickets (Dashboard mode)
    query += ` WHERE (t.department = ? OR t.department LIKE ?)`;
    params.push(department, `%${department}%`);
    whereAdded = true;
  } else if (user_id) {
    // Default mode: Everyone (including students) sees ONLY their own tickets
    query += ` WHERE t.user_id = ?`;
    params.push(user_id);
    whereAdded = true;
  }

  if (!whereAdded) {
    // Safety fallback: if no user_id or authorized dept, return nothing
    return res.json([]);
  }

  query += ' ORDER BY t.created_at DESC';
  
  const [rows] = await db.query<RowDataPacket[]>(query, params);
  
  const normalizedRows = rows.map((r) => {
    const normalizedStatus = r.status
      ?.toString()
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_')
      || 'pending';

    const departmentName = r.department_name || r.department || null;

    return {
      ...r,
      status: normalizedStatus,
      department: departmentName,
      departments: {
        id: r.department_id,
        name: departmentName
      }
    };
  });
  
  res.json(normalizedRows);
} catch (error: unknown) {
  console.error("Database Error in GET /api/tickets:", error);
  res.status(500).json({ error: "Error fetching tickets" });
}
});

// Departments list for forwarding/selecting ticket department
app.get('/api/departments', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>("SELECT id, name FROM departments ORDER BY name");
    res.json(rows);
  } catch (error: unknown) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Error fetching departments" });
  }
});

app.get('/api/tickets/:id/responses', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userPk = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

    // Try both possible table names in case the DB uses plural or singular naming.
    const candidateTables = ['ticket_response', 'ticket_responses'];
    let rows: RowDataPacket[] = [];

    for (const table of candidateTables) {
      try {
        const [responseCols] = await db.query<DBColumn[]>(`SHOW COLUMNS FROM ${table}`);
        const responseUserCol = responseCols.find((c) => c.Field.toLowerCase() === 'sender_id') ? 'sender_id' : 'user_id';

        const result = await db.query<RowDataPacket[]>(`
          SELECT
            tr.response_id,
            tr.ticket_id,
            tr.${responseUserCol} AS sender_id,
            tr.role,
            tr.message,
            tr.created_at,
            u.first_name,
            u.last_name
          FROM ${table} tr
          LEFT JOIN users u ON tr.${responseUserCol} = u.${userPk}
          WHERE tr.ticket_id = ?
          ORDER BY tr.created_at ASC
        `, [id]);

        rows = result[0] as RowDataPacket[];
        break;
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (!err.message?.includes("doesn't exist")) {
          throw err;
        }
        // If table doesn't exist, try next candidate
      }
    }

    // Normalize to support frontend expectations
    const normalized = rows.map((r) => ({
      id: r.response_id,
      response_id: r.response_id,
      ticket_id: r.ticket_id,
      sender_id: r.sender_id,
      role: r.role,
      message: r.message,
      created_at: r.created_at,
      first_name: r.first_name,
      last_name: r.last_name,
    }));

    res.json(normalized);
  } catch (error: unknown) {
    res.status(500).json({ error: "Error fetching responses", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/tickets/:id/responses', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id, message } = req.body;
  if (!user_id || !message) return res.status(400).json({ error: "Missing fields" });

  try {
    // Resolve user and role for sender
    const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userPk = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

    const [userRows] = await db.query<RowDataPacket[]>(`SELECT ${userPk} as userId, role FROM users WHERE ${userPk} = ?`, [user_id]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const role = (userRows[0].role || 'student').toLowerCase();
    const isStudent = role === 'student';

    // Auto reopen logic: If student replies and ticket is resolved, change to reopened
    if (isStudent) {
      const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
      const ticketPk = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

      const [currentTicket] = await db.query<RowDataPacket[]>(`SELECT status FROM tickets WHERE ${ticketPk} = ?`, [id]);
      if (currentTicket.length > 0 && currentTicket[0].status?.toLowerCase() === 'resolved') {
        await db.query(`UPDATE tickets SET status = 'Reopened', reopen_at = CURRENT_TIMESTAMP WHERE ${ticketPk} = ?`, [id]);
      }
    }

    // Try to insert into either possible response table name
    const candidateTables = ['ticket_response', 'ticket_responses'];
    let lastError: unknown = null;
    for (const table of candidateTables) {
      try {
        const [responseCols] = await db.query<DBColumn[]>(`SHOW COLUMNS FROM ${table}`);
        const responseUserCol = responseCols.find((c) => c.Field.toLowerCase() === 'sender_id') ? 'sender_id' : 'user_id';

        const insertQuery = `INSERT INTO ${table} (ticket_id, ${responseUserCol}, role, message) VALUES (?, ?, ?, ?)`;
        console.log(`Reply insert -> table: ${table}, sender column: ${responseUserCol}`);
        await db.execute(insertQuery, [id, user_id, role, message]);
        lastError = null;
        break;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const err = e instanceof Error ? e : new Error(String(e));
        if (!err.message?.includes("doesn't exist")) {
          throw err;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    // Log audit trail for ticket response
    await logAudit(req, user_id, 'Added ticket response', 'ticket', id.toString(), `Role: ${role}`);

    res.status(201).json({ message: "Response saved" });
  } catch (error: unknown) {
    res.status(500).json({ error: "Error saving response", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/reviews', async (req: Request, res: Response) => {
const { user_id, is_helpful, comment } = req.body;
try {
  await db.execute('INSERT INTO reviews (user_id, is_helpful, comment) VALUES (?, ?, ?)', [user_id || null, is_helpful, comment || null]);
  res.status(201).json({ message: "Review saved" });
} catch (error: unknown) {
  res.status(500).json({ error: "Error saving review", details: error instanceof Error ? error.message : String(error) });
}
});

// Utility to normalize status strings for the frontend
const normalizeStatus = (status: string | null | undefined): string =>
  status
    ?.toString()
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    || 'pending';

app.patch('/api/tickets/:id/status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, user_id } = req.body;
  if (!status) return res.status(400).json({ error: "Missing status" });
  
  try {
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // Business Rule: Cannot revert to pending if it's already in_progress or resolved
    if (status.toLowerCase() === 'pending') {
      const [current] = await db.query<RowDataPacket[]>(`SELECT status FROM tickets WHERE ${pkName} = ?`, [id]);
      if (current.length > 0 && current[0].status?.toLowerCase() !== 'pending') {
        return res.status(400).json({ error: "Ticket is already processed and cannot return to pending status." });
      }
    }

    // Map status to proper case for database
    const statusMap: { [key: string]: string } = {
      'pending': 'Pending',
      'in_progress': 'In-Progress',
      'resolved': 'Resolved',
      'closed': 'Closed',
      'reopened': 'Reopened'
    };
    
    const dbStatus = statusMap[status.toLowerCase()] || status;
    await db.execute(`UPDATE tickets SET status = ? WHERE ${pkName} = ?`, [dbStatus, id]);

    // Return the updated ticket so frontend can sync state exactly
    const [rows] = await db.query<RowDataPacket[]>(`SELECT * FROM tickets WHERE ${pkName} = ?`, [id]);
    const ticket = rows[0];
    if (ticket) {
      ticket.status = normalizeStatus(ticket.status);
    }

    // Log audit trail if a user_id was provided
    if (user_id) {
      await logAudit(req, user_id, `Updated ticket status to ${dbStatus}`, 'ticket', id.toString(), `Status updated to ${dbStatus}`);
    }

    res.json({ message: "Status updated successfully", ticket });
  } catch (error: unknown) {
    res.status(500).json({ error: "Error updating status", details: error instanceof Error ? error.message : String(error) });
  }
});

// New Specialized Endpoint for Opening a Ticket
app.patch('/api/tickets/:id/open', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;
  try {
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // SQL Query: Update if current status is 'pending' or 'reopened' (case-insensitive)
    const query = `UPDATE tickets SET status = 'In-Progress', acknowledge_at = CURRENT_TIMESTAMP WHERE ${pkName} = ? AND (LOWER(status) = 'pending' OR LOWER(status) = 'reopened')`;
    const [result] = await db.execute<ResultSetHeader>(query, [id]);

    // Fetch the latest state
    const [rows] = await db.query<RowDataPacket[]>(`SELECT * FROM tickets WHERE ${pkName} = ?`, [id]);
    
    // Log audit trail if a user_id was provided
    if (user_id) {
      await logAudit(req, user_id, 'Opened ticket', 'ticket', id.toString(), 'Marked ticket as In-Progress');
    }

    res.json({ 
      success: true, 
      updated: result.affectedRows > 0,
      ticket: rows[0] 
    });
  } catch (error: unknown) {
    console.error("Error opening ticket:", error);
    res.status(500).json({ error: "Failed to open ticket" });
  }
});

// Forward ticket to another department
app.patch('/api/tickets/:id/forward', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { department_id, department_name, user_id } = req.body;

  if (!department_id && !department_name) {
    return res.status(400).json({ error: "department_id or department_name is required" });
  }

  try {
    // Resolve department name and ID (if provided, validate against the departments table)
    let deptId: number | null = null;
    let deptName: string | null = null;

    // Try to fetch department by ID if provided
    if (department_id) {
      const [deptRows] = await db.query<RowDataPacket[]>(`SELECT id, name FROM departments WHERE id = ?`, [department_id]);
      if (deptRows.length === 0) {
        return res.status(400).json({ error: "Invalid department_id" });
      }
      deptId = deptRows[0].id;
      deptName = deptRows[0].name;
    }

    // If only name provided, look up its ID
    if (!deptId && department_name) {
      const [deptRows] = await db.query<RowDataPacket[]>(`SELECT id, name FROM departments WHERE name = ?`, [department_name]);
      if (deptRows.length === 0) {
        return res.status(400).json({ error: "Invalid department_name" });
      }
      deptId = deptRows[0].id;
      deptName = deptRows[0].name;
    }

    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // Update ticket's department (both string and ID if available)
    const query = `UPDATE tickets SET department = ?, department_id = ? WHERE ${pkName} = ?`;
    const [result] = await db.execute<ResultSetHeader>(query, [deptName, deptId, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Log audit trail for ticket forwarding
    if (user_id) {
      try {
        const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
        await db.execute(
          'INSERT INTO audit_trail (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
          [user_id, 'Forwarded ticket to department', 'ticket', id.toString(), `Forwarded to ${deptName}`, ip_address]
        );
      } catch (auditError) {
        console.error('Error logging ticket forward audit:', auditError);
        // Don't fail the operation if audit logging fails
      }
    }

    // Fetch the updated ticket
    const [rows] = await db.query<RowDataPacket[]>(`SELECT * FROM tickets WHERE ${pkName} = ?`, [id]);
    
    res.json({ 
      success: true, 
      message: "Ticket forwarded successfully",
      ticket: rows[0] 
    });
  } catch (error: unknown) {
    console.error("Error forwarding ticket:", error);
    res.status(500).json({ error: "Failed to forward ticket" });
  }
});

// Website feedback endpoint
app.post('/api/website-feedback', async (req: Request, res: Response) => {
  const { user_id, session_id, rating, ease_of_use, design, speed, comment } = req.body;

  if (typeof rating !== 'number' || typeof ease_of_use !== 'number' || typeof design !== 'number' || typeof speed !== 'number') {
    return res.status(400).json({ error: 'Missing ratings' });
  }

  try {
    await db.execute(
      'INSERT INTO website_feedback (user_id, session_id, rating, ease_of_use, design, speed, comment) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id || null, session_id || null, rating, ease_of_use, design, speed, comment || null]
    );

    res.status(201).json({ message: 'Feedback saved' });
  } catch (error: unknown) {
    console.error('Error saving website feedback:', error);
    res.status(500).json({ error: 'Error saving feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

// Get website feedback
app.get('/api/website-feedback', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, user_id, rating, ease_of_use, design, speed, comment, created_at FROM website_feedback ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching website feedback:', error);
    res.status(500).json({ error: 'Error fetching website feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

// Department feedback endpoints
app.post('/api/department-feedback', async (req: Request, res: Response) => {
  const { ticket_id, user_id, department, rating, comment } = req.body;

  if (!department || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await db.execute(
      'INSERT INTO department_feedback (ticket_id, user_id, department, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [ticket_id || null, user_id || null, department, rating, comment || null]
    );

    res.status(201).json({ message: 'Department feedback saved' });
  } catch (error: unknown) {
    console.error('Error saving department feedback:', error);
    res.status(500).json({ error: 'Error saving department feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/department-feedback', async (req: Request, res: Response) => {
  const { department } = req.query;

  try {
    let query = 'SELECT * FROM department_feedback';
    const params: unknown[] = [];

    if (typeof department === 'string' && department.trim()) {
      query += ' WHERE LOWER(department) = LOWER(?)';
      params.push(department.trim());
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await db.query<RowDataPacket[]>(query, params);
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching department feedback:', error);
    res.status(500).json({ error: 'Error fetching department feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;
  console.log(`Attempting to delete ticket ID: ${id}`);
  try {
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // 1. Delete associated responses/messages (best-effort)
    try {
      await db.query(`DELETE FROM ${RESPONSE_TABLE} WHERE ticket_id = ?`, [id]);
    } catch (e) {
      console.warn(`Unable to delete responses for ticket ${id}, skipping response cleanup:`, e);
    }

    // 2. Delete associated reviews if the column exists
    try {
      await db.query('DELETE FROM reviews WHERE ticket_id = ?', [id]);
    } catch (e) {
      console.warn(`Unable to delete reviews for ticket ${id}, skipping review cleanup:`, e);
    
    if (result.affectedRows === 0) {
      console.warn(`Ticket with ${pkName}=${id} not found.`);
      return res.status(404).json({ error: "Ticket not found" });
    }
    
    console.log(`Ticket ${id} deleted successfully.`);
    if (user_id) {
      await logAudit(req, user_id, 'Deleted ticket', 'ticket', id.toString(), 'Ticket removed from system');
    }
    res.json({ message: "Ticket deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting ticket:", error);
    res.status(500).json({ 
      error: "Error deleting ticket", 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

app.get('/api/users', async (req: Request, res: Response) => {
try {
  console.log('🔍 [GET /api/users] Starting user fetch...');
  
  try {
    // First, check which id column exists (id or user_id)
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const columnNames = columns.map((c) => c.Field);
    const idColumn = columnNames.includes("id")
      ? "id"
      : columnNames.includes("user_id")
      ? "user_id"
      : "id";

    console.log("📋 Users table columns:", columnNames);
    console.log(`🔎 Using ${idColumn} as the primary user identifier column`);

    const selectColumns = [`
      \`${idColumn}\` AS id,
      first_name,
      last_name,
      email,
      role
    `];

    const hasDepartment = columnNames.includes("department");
    if (hasDepartment) {
      console.log("✅ Department column exists, selecting with department...");
      selectColumns.push("department");
    }

    const query = `SELECT ${selectColumns.join(", ")} FROM users`;
    const [rows] = await db.query<RowDataPacket[]>(query);

    const result = hasDepartment
      ? rows
      : (rows as RowDataPacket[]).map((u) => ({ ...u, department: null }));

    console.log(`✅ Successfully fetched ${result.length} users`);
    res.json(result);
  } catch (innerError: unknown) {
    const innerMsg = innerError instanceof Error ? innerError.message : String(innerError);
    console.error("❌ Error in user fetch query:", innerMsg);
    throw innerError;
  }
} catch (error: unknown) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error("❌ [GET /api/users] Error fetching users:", errorMsg);
  console.error("Full error:", error);
  res.status(500).json({ error: "Error fetching users", details: errorMsg });
}
});

// Diagnostic endpoint to check database structure
app.get('/api/debug/users-table', async (req: Request, res: Response) => {
try {
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
  const [count] = await db.query<RowDataPacket[]>("SELECT COUNT(*) as total FROM users");
  const [users] = await db.query<RowDataPacket[]>("SELECT id, email, role, first_name, last_name FROM users LIMIT 5");
  
  res.json({
    table_exists: true,
    columns: columns.map(c => ({ name: c.Field, type: c.Type })),
    total_users: count[0].total,
    sample_users: users
  });
} catch (error: unknown) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error('Error checking users table:', errorMsg);
  res.status(500).json({ error: "Error checking users table", details: errorMsg });
}
});

app.post('/api/users', async (req: Request, res: Response) => {
  const { first_name, last_name, email, password, role, department } = req.body;
  if (!first_name || !last_name || !email || !password || !role) {
    return res.status(400).json({ error: "All required fields must be provided" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: "User with this email already exists" });
    }
    await db.query<ResultSetHeader>('INSERT INTO users (first_name, last_name, email, password, role, department) VALUES (?, ?, ?, ?, ?, ?)', 
      [first_name, last_name, email, hashedPassword, role, department || null]);
    const [inserted] = await db.query<RowDataPacket[]>('SELECT id, first_name, last_name, email, role, department FROM users WHERE email = ?', [email]);
    res.status(201).json(inserted[0]);
  } catch (error: unknown) {
    res.status(500).json({ error: "Error creating user", details: error instanceof Error ? error.message : String(error) });
  }
});

app.patch('/api/users/:id', async (req: Request, res: Response) => {
const { id } = req.params;
const { role, department } = req.body;
try {
  await db.execute('UPDATE users SET role = ?, department = ? WHERE id = ?', [role, department || null, id]);
  res.json({ message: "User updated" });
} catch (error: unknown) {
  res.status(500).json({ error: "Error updating user" });
}
});

// Audit trail endpoints
app.post('/api/audit-trail', async (req: Request, res: Response) => {
  const { user_id, action, entity_type, entity_id, details } = req.body;

  if (!user_id || !action) {
    return res.status(400).json({ error: "user_id and action are required" });
  }

  try {
    const ip_address = req.ip || req.connection.remoteAddress || 'unknown';
    await db.execute(
      'INSERT INTO audit_trail (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, action, entity_type || null, entity_id || null, details || null, ip_address]
    );
    res.status(201).json({ message: 'Audit entry logged' });
  } catch (error: unknown) {
    console.error('Error logging audit trail:', error);
    res.status(500).json({ error: 'Error logging audit entry' });
  }
});

app.get('/api/audit-trail/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { limit = '50' } = req.query;

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT id, action, entity_type, entity_id, details, ip_address, created_at FROM audit_trail WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, parseInt(limit as string)]
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ error: 'Error fetching audit trail' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`server is running in port 3000`));

