import express, { Request, Response } from 'express';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const VERBOSE_LOGS = process.env.VERBOSE_LOGS === "1";
if (!VERBOSE_LOGS) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
}

const app = express();
app.use(express.json({ limit: "10mb" }));
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
  Extra?: string;
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
  is_disabled?: number | boolean;
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
  entityId?: string
) => {
  try {
    await db.execute(
      'INSERT INTO audit_trail (user_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, action, entityType || null, entityId || null]
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

    if (!columnNames.includes('staff_acknowledge_at')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN staff_acknowledge_at TIMESTAMP NULL");
    }
    if (!columnNames.includes('closed_at')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN closed_at TIMESTAMP NULL");
    }
    if (!columnNames.includes('reopen_at')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN reopen_at TIMESTAMP NULL");
    }
    if (!columnNames.includes('resolved_at')) {
      await connection.query("ALTER TABLE tickets ADD COLUMN resolved_at TIMESTAMP NULL");
    }

    const ticketRefColumn = columnNames.includes('id') ? 'id' : (columnNames.includes('ticket_id') ? 'ticket_id' : 'id');

    // Auto-migration: Ensure users table has department column
    const [userColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userColumnNames = userColumns.map((c) => c.Field);
    if (!userColumnNames.includes('department')) {
      await connection.query("ALTER TABLE users ADD COLUMN department VARCHAR(100)");
    }
    
    // Auto-migration: Ensure users table has image column (for profile pictures)
    if (!userColumnNames.includes('image')) {
      await connection.query("ALTER TABLE users ADD COLUMN image LONGTEXT");
    }
    // Ensure image column can store larger base64 payloads
    await connection.query("ALTER TABLE users MODIFY COLUMN image LONGTEXT NULL");

    // Auto-migration: Ensure users table has gmail_account column for password recovery
    if (!userColumnNames.includes('gmail_account')) {
      await connection.query("ALTER TABLE users ADD COLUMN gmail_account VARCHAR(150) NULL");
    }

    // Auto-migration: Ensure users table has is_disabled column
    if (!userColumnNames.includes('is_disabled')) {
      await connection.query("ALTER TABLE users ADD COLUMN is_disabled TINYINT(1) DEFAULT 0");
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

    // Create/Migrate department_feedback table
    try {
      // Create table if it doesn't exist (don't drop to preserve data)
      await connection.query(`
        CREATE TABLE IF NOT EXISTS department_feedback (
          dept_feedback_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          department VARCHAR(100) NOT NULL,
          is_helpful BOOLEAN NOT NULL,
          comment TEXT,
          date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (err: unknown) {
      console.error("Error migrating department_feedback table:", err);
    }

    // Create/Migrate website_feedback table
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS website_feedback (
          web_feedback_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          is_helpful BOOLEAN NOT NULL,
          comment TEXT,
          date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Backward compatibility: ensure id column is auto increment even in old schemas
      const [websiteColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM website_feedback");
      const existingIdColumn = websiteColumns.find((c) => ["web_feedback_id", "id"].includes(c.Field));
      if (existingIdColumn && !(existingIdColumn.Extra || "").toLowerCase().includes("auto_increment")) {
        await connection.query(
          `ALTER TABLE website_feedback MODIFY COLUMN ${existingIdColumn.Field} INT NOT NULL AUTO_INCREMENT`
        );
      }
    } catch (err: unknown) {
      console.error("Error migrating website_feedback table:", err);
    }

    // Create/Migrate announcement table
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS announcement (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          role VARCHAR(50) NOT NULL,
          audience VARCHAR(20) NOT NULL DEFAULT 'all',
          department VARCHAR(100),
          message TEXT NOT NULL,
          posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const [announcementColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
      const announcementColumnNames = announcementColumns.map((c) => c.Field);
      if (!announcementColumnNames.includes("user_id")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN user_id INT NULL");
      }
      if (!announcementColumnNames.includes("role")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'staff'");
      }
      if (!announcementColumnNames.includes("audience")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN audience VARCHAR(20) NOT NULL DEFAULT 'all'");
      }
      if (!announcementColumnNames.includes("department")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN department VARCHAR(100) NULL");
      }
      if (!announcementColumnNames.includes("posted_at")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      }
      if (!announcementColumnNames.includes("created_at")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      }
    } catch (err: unknown) {
      console.error("Error migrating announcement table:", err);
    }

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
    email: user.email,
    gmail_account: (user as any).gmail_account || null,
    image: (user as any).image || null,
    profileImage: (user as any).image || null
  };
};

const getUserPkName = async (): Promise<'id' | 'user_id'> => {
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
  const columnNames = columns.map((c) => c.Field.toLowerCase());
  if (columnNames.includes('user_id')) return 'user_id';
  return 'id';
};

const detectUserPk = async (userId: string | number): Promise<'id' | 'user_id' | null> => {
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
  const columnNames = columns.map((c) => c.Field.toLowerCase());

  const candidates: ('user_id' | 'id')[] = columnNames.includes('user_id') ? ['user_id', 'id'] : ['id', 'user_id'];

  for (const candidate of candidates) {
    if (!columnNames.includes(candidate)) continue;
    try {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT 1 FROM users WHERE ${candidate} = ? LIMIT 1`,
        [userId]
      );
      if (rows.length > 0) return candidate;
    } catch (error: unknown) {
      // ignore and continue with fallback candidate
    }
  }

  return null;
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

  if (Number(user.is_disabled) === 1) {
    return res.status(403).json({ error: "Account disabled" });
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
    await logAudit(req, userId, 'User logged in', 'user', userId.toString());

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
    await logAudit(req, userId, 'User logged out', 'user', userId.toString());
  }

  res.json({ message: 'Logged out successfully' });
});

app.post('/api/update-profile', async (req: Request, res: Response) => {
const { userId, firstName, lastName, profileImage } = req.body;
if (!userId || !firstName || !lastName) {
  return res.status(400).json({ error: "Missing required fields" });
}
try {
  const pkName = await detectUserPk(userId);

  if (!pkName) return res.status(404).json({ error: "User not found" });

  // Update profile with optional image
  if (typeof profileImage === "string" && profileImage.trim().length > 0) {
    await db.query(`UPDATE users SET first_name = ?, last_name = ?, image = ? WHERE ${pkName} = ?`, [firstName, lastName, profileImage, userId]);
  } else {
    await db.query(`UPDATE users SET first_name = ?, last_name = ? WHERE ${pkName} = ?`, [firstName, lastName, userId]);
  }
  
  const [updated] = await db.query<RowDataPacket[]>(`SELECT * FROM users WHERE ${pkName} = ?`, [userId]);

  // Log audit trail for profile update
  await logAudit(req, userId, 'Updated profile information', 'user', userId.toString());

  res.json(formatUserResponse(updated[0] as User));
} catch (error: unknown) {
  console.error("Error updating profile:", error);
  res.status(500).json({ error: "Server error", details: error instanceof Error ? error.message : String(error) });
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
  await logAudit(req, userId, 'Changed password', 'user', userId.toString());

  res.json({ message: "Password updated successfully" });
} catch (error: unknown) {
  res.status(500).json({ error: "Server error" });
}
});

app.post('/api/google-auth', async (req: Request, res: Response) => {
const { email, firstName, lastName, profileImage } = req.body;
try {
  const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
  let user = rows[0];
  if (!user) {
    await db.query<ResultSetHeader>(
      'INSERT INTO users (first_name, last_name, email, role, image, gmail_account) VALUES (?, ?, ?, ?, ?, ?)',
      [firstName, lastName, email, 'student', profileImage || null, email]
    );
    const [inserted] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    user = inserted[0];
  } else if ((!user.image || String(user.image).trim() === '') && typeof profileImage === 'string' && profileImage.trim() !== '') {
    const pkName = await detectUserPk(user.id ?? user.user_id);
    if (pkName) {
      await db.query(`UPDATE users SET image = ? WHERE ${pkName} = ?`, [profileImage, user.id ?? user.user_id]);
      const [updated] = await db.query<RowDataPacket[]>(`SELECT * FROM users WHERE ${pkName} = ?`, [user.id ?? user.user_id]);
      user = updated[0];
    }
  }
  if (Number(user?.is_disabled) === 1) {
    return res.status(403).json({ error: "Account disabled" });
  }
  res.json(formatUserResponse(user as User));
} catch (error: unknown) {
  res.status(500).json({ error: "Auth Error" });
}
});

app.post('/api/find-linked-gmail', async (req: Request, res: Response) => {
  const { identifier } = req.body;
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'Please provide a username or email address.' });
  }

  const trimmed = identifier.trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'Please provide a username or email address.' });
  }

  const emailPattern = trimmed.includes('@') ? trimmed : `${trimmed}@%`;

  try {
    // Check which columns exist in the users table
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const columnNames = columns.map((c) => c.Field.toLowerCase());
    
    // Build dynamic query based on available columns
    const whereClauses = ['email = ?', 'gmail_account = ?', 'email LIKE ?', 'gmail_account LIKE ?'];
    const params: any[] = [trimmed, trimmed, emailPattern, emailPattern];
    
    // Add username search if column exists
    if (columnNames.includes('username')) {
      whereClauses.push('username = ?');
      params.push(trimmed);
    }
    
    // If identifier doesn't have @, also try as pattern for username
    if (!trimmed.includes('@') && columnNames.includes('username')) {
      whereClauses.push('username LIKE ?');
      params.push(`%${trimmed}%`);
    }

    const query = `SELECT * FROM users WHERE ${whereClauses.join(' OR ')} LIMIT 1`;
    const [rows] = await db.query<RowDataPacket[]>(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found or no linked Gmail account.' });
    }

    const user = rows[0] as User;
    const gmail = user.gmail_account || null;
    const fullName = [user.first_name || user.firstName, user.last_name || user.lastName]
      .filter(Boolean)
      .join(" ") || null;

    res.json({
      gmail_account: gmail,
      user_id: user.id ?? user.user_id,
      profile: {
        email: user.email || null,
        image: (user as any).image || null,
        first_name: user.first_name || user.firstName || null,
        last_name: user.last_name || user.lastName || null,
        full_name: fullName,
      },
    });
  } catch (error: unknown) {
    console.error('Error finding linked Gmail:', error);
    res.status(500).json({ error: 'Server error while locating linked Gmail.' });
  }
});

app.post('/api/verify-gmail-owner', async (req: Request, res: Response) => {
  const { userId, gmail } = req.body;
  console.log("🔍 Verify Gmail Owner - userId:", userId, "gmail:", gmail);
  
  if (!userId || !gmail) {
    return res.status(400).json({ error: 'userId and gmail are required' });
  }

  if (typeof gmail !== 'string' || !gmail.endsWith('@gmail.com')) {
    return res.status(400).json({ error: 'Invalid Gmail address' });
  }

  try {
    const pkName = await getUserPkName();
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ${pkName} as id, gmail_account FROM users WHERE ${pkName} = ? LIMIT 1`,
      [userId]
    );

    console.log("📋 User lookup result:", { pkName, rowsFound: rows.length, data: rows[0] });

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0] as any;
    const linkedGmail = user.gmail_account || null;

    console.log("📧 Database gmail_account:", linkedGmail, "| Input gmail:", gmail);

    if (!linkedGmail || linkedGmail.toLowerCase() !== gmail.toLowerCase()) {
      console.log("❌ Gmail mismatch or no linked Gmail");
      return res.status(403).json({ error: 'This Gmail is not linked to your account' });
    }

    console.log("✅ Gmail verified successfully");
    res.json({ verified: true, message: 'Gmail verified for this account' });
  } catch (error: unknown) {
    console.error('❌ Error verifying Gmail owner:', error);
    res.status(500).json({ error: 'Server error while verifying Gmail' });
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
  await logAudit(req, userId, 'Created ticket', 'ticket', result.insertId.toString());
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

  // Add unread reply indicators for both directions (staff->student and student->staff)
  let selectClause = `t.*, t.${ticketPk} as id,
    COALESCE((SELECT message FROM ticket_response WHERE ticket_id = t.${ticketPk} ORDER BY created_at DESC LIMIT 1), t.description) AS description,
    (SELECT COUNT(*) FROM ticket_response tr WHERE tr.ticket_id = t.${ticketPk}
      AND LOWER(tr.role) = 'staff'
      AND tr.created_at > IFNULL(t.acknowledge_at, t.created_at)
    ) > 0 AS has_unread_staff_reply,
    (SELECT COUNT(*) FROM ticket_response tr WHERE tr.ticket_id = t.${ticketPk}
      AND LOWER(tr.role) = 'student'
      AND tr.created_at > IFNULL(t.staff_acknowledge_at, t.created_at)
    ) > 0 AS has_unread_student_reply
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
      },
      has_unread_reply: actualRole === 'student' ? r.has_unread_staff_reply : r.has_unread_student_reply,
      has_unread_staff_reply: r.has_unread_staff_reply,
      has_unread_student_reply: r.has_unread_student_reply,
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
      const currentStatus = currentTicket.length > 0 ? (currentTicket[0].status || '').toString().toLowerCase() : '';
      if (currentStatus === 'resolved' || currentStatus === 'closed') {
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
    await logAudit(req, user_id, 'Added ticket response', 'ticket', id.toString());

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
    
    // Build UPDATE query with timestamp logic
    let updateQuery = `UPDATE tickets SET status = ?`;
    const params: any[] = [dbStatus];
    
    // Set resolved_at when ticket is resolved
    if (dbStatus.toLowerCase() === 'resolved') {
      updateQuery += `, resolved_at = CURRENT_TIMESTAMP`;
    }

    // Set closed_at when ticket is closed
    if (dbStatus.toLowerCase() === 'closed') {
      updateQuery += `, closed_at = CURRENT_TIMESTAMP`;
    }
    
    // Set reopen_at when ticket is reopened
    if (dbStatus.toLowerCase() === 'reopened') {
      updateQuery += `, reopen_at = CURRENT_TIMESTAMP`;
    }
    
    updateQuery += ` WHERE ${pkName} = ?`;
    params.push(id);
    
    await db.execute(updateQuery, params);

    // Return the updated ticket so frontend can sync state exactly
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT t.*, 
        COALESCE((SELECT message FROM ticket_response WHERE ticket_id = t.${pkName} ORDER BY created_at DESC LIMIT 1), t.description) AS description
      FROM tickets t 
      WHERE ${pkName} = ?
    `, [id]);
    const ticket = rows[0];
    if (ticket) {
      ticket.status = normalizeStatus(ticket.status);
    }

    // Log audit trail if a user_id was provided
    if (user_id) {
      await logAudit(req, user_id, `Updated ticket status to ${dbStatus}`, 'ticket', id.toString());
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
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT t.*, 
        COALESCE((SELECT message FROM ticket_response WHERE ticket_id = t.${pkName} ORDER BY created_at DESC LIMIT 1), t.description) AS description
      FROM tickets t 
      WHERE ${pkName} = ?
    `, [id]);
    
    // Log audit trail if a user_id was provided
    if (user_id) {
      await logAudit(req, user_id, 'Opened ticket', 'ticket', id.toString());
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

app.patch('/api/tickets/:id/acknowledge', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id, role } = req.body;

  if (!role || !['student', 'staff', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role for acknowledge' });
  }

  try {
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';
    const column = role === 'student' ? 'acknowledge_at' : 'staff_acknowledge_at';

    const query = `UPDATE tickets SET ${column} = CURRENT_TIMESTAMP WHERE ${pkName} = ?`;
    const [result] = await db.execute<ResultSetHeader>(query, [id]);

    if (user_id) {
      await logAudit(req, user_id, `Acknowledged ticket as ${role}`, 'ticket', id.toString());
    }

    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT t.*, 
        COALESCE((SELECT message FROM ticket_response WHERE ticket_id = t.${pkName} ORDER BY created_at DESC LIMIT 1), t.description) AS description
      FROM tickets t 
      WHERE ${pkName} = ?
    `, [id]);

    res.json({ success: true, updated: result.affectedRows > 0, ticket: rows[0] });
  } catch (error: unknown) {
    console.error('Error acknowledging ticket:', error);
    res.status(500).json({ error: 'Failed to acknowledge ticket' });
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
        await db.execute(
          'INSERT INTO audit_trail (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
          [user_id, 'Forwarded ticket to department', 'ticket', id.toString()]
        );
      } catch (auditError) {
        console.error('Error logging ticket forward audit:', auditError);
        // Don't fail the operation if audit logging fails
      }
    }

    // Fetch the updated ticket
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT t.*, 
        COALESCE((SELECT message FROM ticket_response WHERE ticket_id = t.${pkName} ORDER BY created_at DESC LIMIT 1), t.description) AS description
      FROM tickets t 
      WHERE ${pkName} = ?
    `, [id]);
    
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

// Department feedback endpoints
app.post('/api/department-feedback', async (req: Request, res: Response) => {
  const { user_id, department, rating, comment } = req.body;

  if (!department || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Convert rating (5 = helpful pressed, 1 = poor pressed) to boolean is_helpful
    const isHelpful = rating === 5; // 5 = true (helpful), 1 = false (poor)
    
    await db.execute(
      'INSERT INTO department_feedback (user_id, department, is_helpful, comment, date_submitted) VALUES (?, ?, ?, ?, NOW())',
      [user_id || null, department, isHelpful, comment || null]
    );

    res.status(201).json({ message: 'Department feedback saved' });
  } catch (error: unknown) {
    console.error('Error saving department feedback:', error);
    res.status(500).json({ error: 'Error saving department feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/department-feedback', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT dept_feedback_id as id, user_id, department, is_helpful, comment, date_submitted FROM department_feedback ORDER BY date_submitted DESC');
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching department feedback:', error);
    res.status(500).json({ error: 'Error fetching department feedback' });
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
    }

    // 3. Delete the ticket itself using the resolved primary key
    const [result] = await db.query<ResultSetHeader>(`DELETE FROM tickets WHERE ${pkName} = ?`, [id]);

    if (result.affectedRows === 0) {
      console.warn(`Ticket with ${pkName}=${id} not found.`);
      return res.status(404).json({ error: "Ticket not found" });
    }

    console.log(`Ticket ${id} deleted successfully.`);
    if (user_id) {
      await logAudit(req, user_id, 'Deleted ticket', 'ticket', id.toString());
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
    const hasDisabledFlag = columnNames.includes("is_disabled");
    const hasImage = columnNames.includes("image");
    if (hasDepartment) {
      console.log("✅ Department column exists, selecting with department...");
      selectColumns.push("department");
    }
    if (hasDisabledFlag) {
      selectColumns.push("is_disabled");
    }
    if (hasImage) {
      selectColumns.push("image");
    }

    const query = `SELECT ${selectColumns.join(", ")} FROM users`;
    const [rows] = await db.query<RowDataPacket[]>(query);

    const result = (rows as RowDataPacket[]).map((u) => ({
      ...u,
      department: hasDepartment ? u.department ?? null : null,
      is_disabled: hasDisabledFlag ? Number(u.is_disabled) : 0,
      image: hasImage ? u.image ?? null : null,
    }));

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

// Chatbot user context endpoint - returns user-specific data for RAG
app.get('/api/chatbot-user-data/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  
  try {
    console.log("🤖 [Chatbot] Fetching context for user_id:", userId);
    
    // Handle guest users
    if (userId === 'guest') {
      console.log("👤 [Chatbot] Returning guest context");
      
      // Get all departments (public data)
      const [departmentRows] = await db.query<RowDataPacket[]>(
        `SELECT id, name FROM departments ORDER BY name`
      );
      
      // Get general announcements (all audience)
      const [announcementRows] = await db.query<RowDataPacket[]>(
        `SELECT id, message, role, audience, department, posted_at FROM announcement
         WHERE audience = 'all'
         ORDER BY posted_at DESC LIMIT 10`
      );
      
      const context = {
        user: {
          id: 'guest',
          firstName: 'Guest',
          lastName: 'User',
          email: null,
          role: 'guest',
          department: null
        },
        tickets: [],
        responses: [],
        departments: departmentRows,
        announcements: announcementRows
      };
      
      console.log("✅ [Chatbot] Guest context loaded");
      return res.json(context);
    }
    
    const pkName = await getUserPkName();
    
    // Get user profile
    const [userRows] = await db.query<RowDataPacket[]>(
      `SELECT ${pkName} as id, first_name, last_name, email, role, department FROM users WHERE ${pkName} = ? LIMIT 1`,
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userRows[0];
    
    // Get user's tickets
    const [ticketRows] = await db.query<RowDataPacket[]>(
      `SELECT id, ticket_number, subject, description, department, status, created_at FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );
    
    // Get user's ticket responses
    const [responseRows] = await db.query<RowDataPacket[]>(
      `SELECT tr.response_id, tr.ticket_id, tr.message, tr.role, tr.created_at
       FROM ${RESPONSE_TABLE} tr
       WHERE tr.ticket_id IN (SELECT id FROM tickets WHERE user_id = ?)
       ORDER BY tr.created_at DESC LIMIT 50`,
      [userId]
    );
    
    // Get departments
    const [departmentRows] = await db.query<RowDataPacket[]>(
      `SELECT id, name FROM departments ORDER BY name`
    );
    
    // Get announcements visible to this user
    const [announcementRows] = await db.query<RowDataPacket[]>(
      `SELECT id, message, role, audience, department, posted_at FROM announcement
       WHERE audience IN ('all', ?) OR department = ?
       ORDER BY posted_at DESC LIMIT 10`,
      [user.role, user.department]
    );
    
    // Format context for RAG
    const context = {
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        department: user.department
      },
      tickets: ticketRows.map((t: any) => ({
        id: t.id,
        ticketNumber: t.ticket_number,
        subject: t.subject,
        description: t.description,
        department: t.department,
        status: t.status,
        createdAt: t.created_at
      })),
      responses: responseRows.map((r: any) => ({
        id: r.response_id,
        ticketId: r.ticket_id,
        message: r.message,
        role: r.role,
        createdAt: r.created_at
      })),
      departments: departmentRows,
      announcements: announcementRows
    };
    
    console.log("✅ [Chatbot] Context loaded:", {
      tickets: ticketRows.length,
      responses: responseRows.length,
      departments: departmentRows.length,
      announcements: announcementRows.length
    });
    
    res.json(context);
  } catch (error: unknown) {
    console.error('❌ Error fetching chatbot context:', error);
    res.status(500).json({ error: 'Error fetching chatbot context' });
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
  console.log('POST /api/users - Creating user:', { first_name, last_name, email, role, department });
  
  if (!first_name || !last_name || !email || !password || !role) {
    console.error('Missing required fields:', { first_name, last_name, email, password, role });
    return res.status(400).json({ error: "All required fields must be provided" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      console.error('User with email already exists:', email);
      return res.status(400).json({ error: "User with this email already exists" });
    }
    const [result] = await db.query<ResultSetHeader>('INSERT INTO users (first_name, last_name, email, password, role, department) VALUES (?, ?, ?, ?, ?, ?)', 
      [first_name, last_name, email, hashedPassword, role, department || null]);
    
    console.log('User inserted successfully with ID:', result.insertId);
    
    const pk = await getUserPkName();

    const [inserted] = await db.query<RowDataPacket[]>(`SELECT ${pk} AS id, first_name, last_name, email, role, department FROM users WHERE ${pk} = ?`, [result.insertId]);
    
    if (!inserted || inserted.length === 0) {
      console.error('Failed to retrieve created user with ID:', result.insertId);
      return res.status(500).json({ error: "User created but could not be retrieved", details: "Database query returned no results" });
    }
    
    console.log('Returning user data with 201 status:', inserted[0]);
    res.status(201).json(inserted[0]);
  } catch (error: unknown) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: "Error creating user", details: error instanceof Error ? error.message : String(error) });
  }
});

app.patch('/api/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { role, department, is_disabled } = req.body;

  try {
    if (!id) {
      return res.status(400).json({ error: "Missing user id" });
    }
    const pkName = await detectUserPk(id) || await getUserPkName();

    const updateFields: string[] = [];
    const values: Array<string | number | null> = [];

    if (typeof role !== "undefined") {
      updateFields.push("role = ?");
      values.push(role);
    }
    if (typeof department !== "undefined") {
      updateFields.push("department = ?");
      values.push(department || null);
    }
    if (typeof is_disabled !== "undefined") {
      updateFields.push("is_disabled = ?");
      values.push(Number(Boolean(is_disabled)));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    values.push(id);
    const safeValues = values.map((value) => (typeof value === "undefined" ? null : value));
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users SET ${updateFields.join(", ")} WHERE ${pkName} = ?`,
      safeValues
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: "User updated" });
  } catch (error: unknown) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: "Error updating user", details: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    console.log('Deleting user with id/user_id:', id);

    const pkName = await getUserPkName();

    const [result] = await db.query<ResultSetHeader>(
      `DELETE FROM users WHERE ${pkName} = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      console.warn('User not found after delete attempt:', id, 'pk:', pkName);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User deleted successfully:', id);
    res.json({ message: 'User deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Error deleting user', details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/link-gmail', async (req: Request, res: Response) => {
  const { userId, gmail } = req.body;
  if (!userId || !gmail) {
    return res.status(400).json({ error: 'userId and gmail are required' });
  }
  if (typeof gmail !== 'string' || !gmail.endsWith('@gmail.com')) {
    return res.status(400).json({ error: 'Invalid Gmail address' });
  }

  try {
    const pkName = await getUserPkName();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users SET gmail_account = ? WHERE ${pkName} = ?`,
      [gmail.trim(), userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Gmail linked successfully' });
  } catch (error: unknown) {
    console.error('Error linking Gmail:', error);
    res.status(500).json({ error: 'Error linking Gmail', details: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/link-gmail', async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const pkName = await getUserPkName();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users SET gmail_account = NULL WHERE ${pkName} = ?`,
      [userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Gmail unlinked successfully' });
  } catch (error: unknown) {
    console.error('Error unlinking Gmail:', error);
    res.status(500).json({ error: 'Error unlinking Gmail', details: error instanceof Error ? error.message : String(error) });
  }
});

// Audit trail endpoints
app.post('/api/audit-trail', async (req: Request, res: Response) => {
  const { user_id, action, entity_type, entity_id } = req.body;

  if (!user_id || !action) {
    return res.status(400).json({ error: "user_id and action are required" });
  }

  try {
    await db.execute(
      'INSERT INTO audit_trail (user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
      [user_id, action, entity_type || null, entity_id || null]
    );
    res.status(201).json({ message: 'Audit entry logged' });
  } catch (error: unknown) {
    console.error('Error logging audit trail:', error);
    res.status(500).json({ error: 'Error logging audit entry' });
  }
});

// Audit trail endpoints
app.get('/api/audit-trail', async (req: Request, res: Response) => {
  const { limit = '50' } = req.query;
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT audit_id as id, user_id, action, entity_type, entity_id, created_at FROM audit_trail ORDER BY created_at DESC LIMIT ?',
      [parseInt(limit as string)]
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching all audit trail:', error);
    res.status(500).json({ error: 'Error fetching audit trail' });
  }
});

app.get('/api/audit-trail/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { limit = '50' } = req.query;

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT audit_id as id, user_id, action, entity_type, entity_id, created_at FROM audit_trail WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      [userId, parseInt(limit as string)]
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching audit trail:', error);
    res.status(500).json({ error: 'Error fetching audit trail' });
  }
});

app.delete('/api/audit-trail/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [result] = await db.query<ResultSetHeader>(
      'DELETE FROM audit_trail WHERE audit_id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Audit entry not found' });
    }
    res.json({ message: 'Audit entry deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting audit entry:', error);
    res.status(500).json({ error: 'Error deleting audit entry' });
  }
});

// Website Feedback endpoints
app.post('/api/website-feedback', async (req: Request, res: Response) => {
  const { user_id, is_helpful, comment } = req.body;

  if (is_helpful === null || is_helpful === undefined) {
    return res.status(400).json({ error: "is_helpful field is required" });
  }

  try {
    const [feedbackColumns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM website_feedback");
    const idColumn = feedbackColumns.find((c) => ["web_feedback_id", "id"].includes(c.Field))?.Field || "web_feedback_id";
    const idDef = feedbackColumns.find((c) => c.Field === idColumn);
    const hasAutoIncrementId = (idDef?.Extra || "").toLowerCase().includes("auto_increment");

    let result: ResultSetHeader;
    if (hasAutoIncrementId) {
      const [insertResult] = await db.query<ResultSetHeader>(
        `INSERT INTO website_feedback (user_id, is_helpful, comment, date_submitted) VALUES (?, ?, ?, NOW())`,
        [user_id || null, is_helpful, comment || null]
      );
      result = insertResult;
    } else {
      const [nextRows] = await db.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(${idColumn}), 0) + 1 AS next_id FROM website_feedback`
      );
      const nextId = Number(nextRows[0]?.next_id || 1);
      const [insertResult] = await db.query<ResultSetHeader>(
        `INSERT INTO website_feedback (${idColumn}, user_id, is_helpful, comment, date_submitted) VALUES (?, ?, ?, ?, NOW())`,
        [nextId, user_id || null, is_helpful, comment || null]
      );
      result = insertResult;
    }

    res.status(201).json({
      id: result.insertId,
      message: "Website feedback submitted successfully"
    });
  } catch (error: unknown) {
    console.error('Error saving website feedback:', error);
    res.status(500).json({ error: 'Error saving website feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/website-feedback', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT web_feedback_id as id, user_id, is_helpful, comment, 
              DATE_FORMAT(date_submitted, "%Y-%m-%d %H:%i:%s") as date_submitted 
       FROM website_feedback 
       ORDER BY date_submitted DESC`
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error("Error fetching website feedback:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Full error details:", errorMsg);
    res.status(500).json({ error: "Failed to fetch website feedback", details: errorMsg });
  }
});

// Get all announcements
app.get('/api/announcements', async (req: Request, res: Response) => {
  try {
    const viewerRole = (req.query.viewer_role || "guest").toString().trim().toLowerCase();
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
    const columnNames = columns.map((c) => c.Field);
    const idColumn = columnNames.includes("announcement_id")
      ? "announcement_id"
      : columnNames.includes("id")
      ? "id"
      : "id";
    const hasAudience = columnNames.includes("audience");
    const hasRole = columnNames.includes("role");
    const hasPostedAt = columnNames.includes("posted_at");
    const hasCreatedAt = columnNames.includes("created_at");

    let whereClause = "";
    const params: string[] = [];
    if (hasAudience) {
      if (viewerRole === "admin") {
        whereClause = "";
      } else if (viewerRole === "staff") {
        whereClause = "WHERE (a.audience = 'all' OR a.audience = 'staff')";
      } else if (viewerRole === "student") {
        whereClause = "WHERE (a.audience = 'all' OR a.audience = 'students')";
      } else {
        whereClause = "WHERE a.audience = 'all'";
      }
    }

    const orderByClause = hasPostedAt
      ? "ORDER BY a.posted_at DESC"
      : hasCreatedAt
      ? "ORDER BY a.created_at DESC"
      : `ORDER BY a.${idColumn} DESC`;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT a.${idColumn} AS announcement_id, ${columnNames.includes("user_id") ? "a.user_id" : "NULL AS user_id"}, ${hasRole ? "a.role" : "'staff' AS role"}, ${columnNames.includes("department") ? "a.department" : "NULL AS department"}, ${hasAudience ? "a.audience" : "'all' as audience"}, a.message, 
              ${hasPostedAt ? 'DATE_FORMAT(a.posted_at, "%Y-%m-%d %H:%i:%s")' : hasCreatedAt ? 'DATE_FORMAT(a.created_at, "%Y-%m-%d %H:%i:%s")' : "NULL"} AS posted_at
       FROM announcement a
       ${whereClause}
       ${orderByClause}`
      ,
      params
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error("Error fetching announcements:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to fetch announcements", details: errorMsg });
  }
});

// Create announcement (staff/admin only)
app.post('/api/announcements', async (req: Request, res: Response) => {
  try {
    const { user_id, role, audience, department, message } = req.body;

    if (!user_id || !role || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Only allow staff and admin to create announcements
    if (!['staff', 'admin'].includes(role.toLowerCase())) {
      return res.status(403).json({ error: "Only staff and admin can create announcements" });
    }

    const normalizedRole = role.toLowerCase();
    const normalizedAudience = (audience || "").toString().trim().toLowerCase();
    const allowedAudience = ["all", "students", "staff"];
    const finalAudience =
      normalizedRole === "admin"
        ? (allowedAudience.includes(normalizedAudience) ? normalizedAudience : "all")
        : "students";

    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
    const columnNames = columns.map((c) => c.Field);
    const insertCols: string[] = [];
    const placeholders: string[] = [];
    const values: Array<string | number | null> = [];

    if (columnNames.includes("user_id")) {
      insertCols.push("user_id");
      placeholders.push("?");
      values.push(user_id);
    }
    if (columnNames.includes("role")) {
      insertCols.push("role");
      placeholders.push("?");
      values.push(normalizedRole);
    }
    if (columnNames.includes("audience")) {
      insertCols.push("audience");
      placeholders.push("?");
      values.push(finalAudience);
    }
    if (columnNames.includes("department")) {
      insertCols.push("department");
      placeholders.push("?");
      values.push(department || null);
    }
    insertCols.push("message");
    placeholders.push("?");
    values.push(message);
    if (columnNames.includes("posted_at")) {
      insertCols.push("posted_at");
      placeholders.push("NOW()");
    }
    if (columnNames.includes("created_at")) {
      insertCols.push("created_at");
      placeholders.push("NOW()");
    }

    const [result] = await db.query(
      `INSERT INTO announcement (${insertCols.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );

    res.status(201).json({
      id: (result as any).insertId,
      message: "Announcement created successfully"
    });
  } catch (error: unknown) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Error creating announcement', details: error instanceof Error ? error.message : String(error) });
  }
});

// Update announcement (owner only, admin/staff only)
app.patch('/api/announcements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role, message, audience } = req.body;

    if (!user_id || !role || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!['staff', 'admin'].includes(String(role).toLowerCase())) {
      return res.status(403).json({ error: "Only staff and admin can edit announcements" });
    }

    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
    const columnNames = columns.map((c) => c.Field);
    const idColumn = columnNames.includes("announcement_id") ? "announcement_id" : "id";

    const [existingRows] = await db.query<RowDataPacket[]>(
      `SELECT ${idColumn} as announcement_id, ${columnNames.includes("user_id") ? "user_id" : "NULL as user_id"} FROM announcement WHERE ${idColumn} = ? LIMIT 1`,
      [id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    if (Number(existingRows[0].user_id) !== Number(user_id)) {
      return res.status(403).json({ error: "You can only edit your own announcement" });
    }

    const normalizedRole = String(role).toLowerCase();
    const normalizedAudience = (audience || "").toString().trim().toLowerCase();
    const allowedAudience = ["all", "students", "staff"];
    const finalAudience = normalizedRole === "admin"
      ? (allowedAudience.includes(normalizedAudience) ? normalizedAudience : "all")
      : "students";

    const updates: string[] = ["message = ?"];
    const values: Array<string | number> = [String(message).trim()];

    if (columnNames.includes("role")) {
      updates.push("role = ?");
      values.push(normalizedRole);
    }
    if (columnNames.includes("audience")) {
      updates.push("audience = ?");
      values.push(finalAudience);
    }
    if (columnNames.includes("posted_at")) {
      updates.push("posted_at = NOW()");
    } else if (columnNames.includes("created_at")) {
      updates.push("created_at = NOW()");
    }

    values.push(id);
    await db.query(`UPDATE announcement SET ${updates.join(", ")} WHERE ${idColumn} = ?`, values);
    res.json({ message: "Announcement updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating announcement:", error);
    res.status(500).json({ error: "Error updating announcement", details: error instanceof Error ? error.message : String(error) });
  }
});

// Delete announcement (owner only, admin/staff only)
app.delete('/api/announcements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!user_id || !role) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (!['staff', 'admin'].includes(String(role).toLowerCase())) {
      return res.status(403).json({ error: "Only staff and admin can delete announcements" });
    }

    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
    const columnNames = columns.map((c) => c.Field);
    const idColumn = columnNames.includes("announcement_id") ? "announcement_id" : "id";

    const [existingRows] = await db.query<RowDataPacket[]>(
      `SELECT ${idColumn} as announcement_id, ${columnNames.includes("user_id") ? "user_id" : "NULL as user_id"} FROM announcement WHERE ${idColumn} = ? LIMIT 1`,
      [id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    if (Number(existingRows[0].user_id) !== Number(user_id)) {
      return res.status(403).json({ error: "You can only delete your own announcement" });
    }

    await db.query(`DELETE FROM announcement WHERE ${idColumn} = ?`, [id]);
    res.json({ message: "Announcement deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({ error: "Error deleting announcement", details: error instanceof Error ? error.message : String(error) });
  }
});

const PORT = 3000;
app.listen(PORT, () => process.stdout.write(`Server running on port ${PORT}\n`));

