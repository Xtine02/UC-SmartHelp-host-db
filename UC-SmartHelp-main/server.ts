import express, { Request, Response } from 'express';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

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
  deactivated_at?: string | Date | null;
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

// Helper to create notifications for users
const createNotification = async (
  userId: number,
  type: string,
  title: string,
  message?: string,
  ticketId?: number,
  announcementId?: number
) => {
  try {
    console.log(`🔔 Creating notification: userId=${userId}, type=${type}, title=${title}, ticketId=${ticketId}, announcementId=${announcementId}`);
    const [result] = await db.execute(
      'INSERT INTO notifications (user_id, type, title, message, ticket_id, announcement_id) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, type, title, message || null, ticketId || null, announcementId || null]
    );
    console.log(`✅ Notification created successfully, insertId:`, (result as any).insertId);
  } catch (error: unknown) {
    console.error('❌ Error creating notification:', error);
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
    if (!userColumnNames.includes('deactivated_at')) {
      await connection.query("ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL");
    }

    // Password reset token storage
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        pass_reset_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_id (user_id),
        INDEX idx_expires_at (expires_at)
      )
    `);

    const [passwordResetCols] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM password_reset_tokens");
    const passwordResetColumnNames = passwordResetCols.map((c) => c.Field.toLowerCase());
    if (!passwordResetColumnNames.includes('pass_reset_id') && passwordResetColumnNames.includes('id')) {
      await connection.query("ALTER TABLE password_reset_tokens CHANGE id pass_reset_id INT AUTO_INCREMENT PRIMARY KEY");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        login_attempt_id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        failed_count INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const [loginAttemptCols] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM login_attempts");
    const loginAttemptColumnNames = loginAttemptCols.map((c) => c.Field.toLowerCase());
    if (!loginAttemptColumnNames.includes('login_attempt_id') && loginAttemptColumnNames.includes('id')) {
      await connection.query("ALTER TABLE login_attempts CHANGE id login_attempt_id INT AUTO_INCREMENT PRIMARY KEY");
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
          department_id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        )
      `);
    }

    // Ensure department primary key column is normalized
    const [deptColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM departments");
    const deptColumnNames = deptColumns.map((c) => c.Field.toLowerCase());
    if (!deptColumnNames.includes('department_id') && deptColumnNames.includes('id')) {
      await connection.query("ALTER TABLE departments CHANGE id department_id INT AUTO_INCREMENT PRIMARY KEY");
    }

    // Check if departments table is empty or incomplete, and repopulate if needed
    const [existingDepts] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM departments");
    const deptCount = existingDepts[0]?.count || 0;
    
    if (deptCount < 7) {
      // Delete existing departments and repopulate to ensure consistency
      await connection.query("DELETE FROM departments");
      await connection.query(`
        INSERT INTO departments (department_id, name) VALUES 
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
        user_id INT NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'student',
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(${ticketRefColumn}),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Ensure response table has required columns
    const [responseColumns] = await connection.query<DBColumn[]>(`SHOW COLUMNS FROM ${RESPONSE_TABLE}`);
    const responseColumnNames = responseColumns.map((c) => c.Field);

    if (!responseColumnNames.includes('response_id') && responseColumnNames.includes('id')) {
      await connection.query(`ALTER TABLE ${RESPONSE_TABLE} CHANGE id response_id INT AUTO_INCREMENT PRIMARY KEY`);
    }
    if (!responseColumnNames.includes('user_id') && responseColumnNames.includes('sender_id')) {
      await connection.query(`ALTER TABLE ${RESPONSE_TABLE} CHANGE sender_id user_id INT NOT NULL`);
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
          ticket_id INT NULL,
          department VARCHAR(100) NOT NULL,
          is_helpful BOOLEAN NULL,
          comment TEXT,
          feedback_requested BOOLEAN DEFAULT FALSE,
          feedback_completed BOOLEAN DEFAULT FALSE,
          auto_closed BOOLEAN DEFAULT FALSE,
          date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          date_requested TIMESTAMP NULL,
          INDEX idx_ticket_id (ticket_id),
          INDEX idx_user_id (user_id),
          INDEX idx_department (department)
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

    // Create/Migrate chat_history table for chatbot conversations
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NULL,
          sender_type VARCHAR(32) NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const [chatHistoryColumns] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM chat_history");
      const chatColumnNames = chatHistoryColumns.map((c) => c.Field.toLowerCase());
      const chatColumnSet = new Set(chatColumnNames);
      if (!chatColumnNames.includes("sender_type")) {
        await connection.query("ALTER TABLE chat_history ADD COLUMN sender_type VARCHAR(32) NULL");
        chatColumnSet.add("sender_type");
      }
      if (chatColumnSet.has("role")) {
        await connection.query(`
          UPDATE chat_history
          SET sender_type = LOWER(TRIM(COALESCE(role, '')))
          WHERE (sender_type IS NULL OR TRIM(sender_type) = '')
            AND role IS NOT NULL
            AND TRIM(role) <> ''
        `);
        await connection.query("ALTER TABLE chat_history DROP COLUMN role");
      }
      if (chatColumnSet.has("message_type")) {
        await connection.query("ALTER TABLE chat_history DROP COLUMN message_type");
      }
      if (chatColumnSet.has("metadata")) {
        await connection.query("ALTER TABLE chat_history DROP COLUMN metadata");
      }
      if (!chatColumnNames.includes("created_at")) {
        await connection.query("ALTER TABLE chat_history ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      }
    } catch (err: unknown) {
      console.error("Error migrating chat_history table:", err);
    }

    // Create/Migrate announcement table
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS announcement (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT,
          role VARCHAR(50) NOT NULL,
          audience VARCHAR(20) NOT NULL DEFAULT 'all',
          department VARCHAR(100),
          message TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      if (!announcementColumnNames.includes("created_at")) {
        await connection.query("ALTER TABLE announcement ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
      }
      if (announcementColumnNames.includes("posted_at")) {
        await connection.query("ALTER TABLE announcement DROP COLUMN posted_at");
      }
    } catch (err: unknown) {
      console.error("Error migrating announcement table:", err);
    }

    // Create notification tables
    try {
      // Detect user primary key for foreign key references
      const [userCols] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM users");
      const userPkName = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';
      
      // Create notifications table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          ticket_id INT NULL,
          announcement_id INT NULL,
          is_read TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at)
        )
      `);

      // Create announcement_views table to track announcement reads
      // First check if announcement table exists
      try {
        const [announcementCheckCols] = await connection.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
        const announcementIdCol = announcementCheckCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'announcement_id')?.Field || 'id';
        
        await connection.query(`
          CREATE TABLE IF NOT EXISTS announcement_views (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            announcement_id INT NOT NULL,
            viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_announcement (user_id, announcement_id),
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (announcement_id) REFERENCES announcement(${announcementIdCol}) ON DELETE CASCADE,
            INDEX idx_user_id (user_id)
          )
        `);
      } catch (announcementViewsErr: unknown) {
        console.warn("Could not create announcement_views table (announcement table might not exist yet):", announcementViewsErr instanceof Error ? announcementViewsErr.message : String(announcementViewsErr));
      }
    } catch (err: unknown) {
      console.error("Error creating notification tables:", err);
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
    profileImage: (user as any).image || null,
    is_disabled: Number((user as any).is_disabled || 0),
    deactivated_at: (user as any).deactivated_at || null
  };
};

const getUserPkName = async (): Promise<'id' | 'user_id'> => {
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
  const columnNames = columns.map((c) => c.Field.toLowerCase());
  if (columnNames.includes('user_id')) return 'user_id';
  return 'id';
};

const getDepartmentPkName = async (): Promise<'id' | 'department_id'> => {
  const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM departments");
  const columnNames = columns.map((c) => c.Field.toLowerCase());
  if (columnNames.includes('department_id')) return 'department_id';
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

const pickChatHistoryColumn = (columns: string[], candidates: string[]) => {
  const exact = candidates.find((c) => columns.includes(c));
  if (exact) return exact;
  const partial = columns.find((col) => candidates.some((candidate) => col.includes(candidate)));
  return partial || null;
};

const getChatHistoryColumns = async (): Promise<string[] | null> => {
  try {
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM chat_history");
    return columns.map((c) => c.Field.toLowerCase());
  } catch (error: unknown) {
    return null;
  }
};

app.post('/api/register', async (req: Request, res: Response) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const normalizedEmail = String(email).toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(password, 10);
    const [existing] = await db.query<RowDataPacket[]>(
      `SELECT 1
       FROM users
       WHERE LOWER(TRIM(email)) = ?
          OR LOWER(TRIM(COALESCE(gmail_account, ''))) = ?
       LIMIT 1`,
      [normalizedEmail, normalizedEmail]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email is already taken" });
    }

    // Check if this is the first user
    const [userCount] = await db.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM users');
    const role = (userCount[0] as { count: number }).count === 0 ? 'admin' : 'student';
      
    await db.query<ResultSetHeader>(
      'INSERT INTO users (first_name, last_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [firstName, lastName, normalizedEmail, hashedPassword, role]
    );
    const [inserted] = await db.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [normalizedEmail]
    );
    const user = inserted[0];
  
    res.status(201).json(formatUserResponse(user as User));
  } catch (error: unknown) {
    res.status(500).json({ error: "Registration failed", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/login', async (req: Request, res: Response) => {
const { email, password } = req.body;
try {
  const normalizedEmail = String(email || "").toLowerCase().trim();
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const [lockRows] = await db.query<RowDataPacket[]>(
    'SELECT failed_count, locked_until FROM login_attempts WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );
  const lockRow = lockRows[0];
  const now = Date.now();
  const lockedUntilMs = lockRow?.locked_until ? new Date(lockRow.locked_until).getTime() : 0;
  if (lockedUntilMs && lockedUntilMs > now) {
    return res.status(429).json({ error: "too many attempts try again after 2 minutes" });
  }

  const [rows] = await db.query<RowDataPacket[]>('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1', [normalizedEmail]);
  const user = rows[0];
  console.log('Login attempt for user:', user.email, 'password starts with:', user.password ? user.password.substring(0, 10) : 'no password');
  
  if (!user) {
    const nextFailed = Number(lockRow?.failed_count || 0) + 1;
    const shouldLock = nextFailed >= 3;
    await db.query(
      `INSERT INTO login_attempts (email, failed_count, locked_until)
       VALUES (?, ?, ${shouldLock ? "DATE_ADD(NOW(), INTERVAL 2 MINUTE)" : "NULL"})
       ON DUPLICATE KEY UPDATE
         failed_count = VALUES(failed_count),
         locked_until = VALUES(locked_until)`,
      [normalizedEmail, shouldLock ? 0 : nextFailed]
    );
    if (shouldLock) {
      return res.status(429).json({ error: "too many attempts try again after 2 minutes" });
    }
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (Number(user.is_disabled) === 1) {
    console.log('Account disabled for user:', user.email);
    return res.status(403).json({ error: "Account disabled" });
  }

  let isMatch = false;
  // Try bcrypt first
  if (user.password && user.password.startsWith('$2')) {
    try {
      isMatch = await bcrypt.compare(password, user.password);
      console.log('Bcrypt compare result for user', user.email, ':', isMatch);
    } catch (e: unknown) {
      console.log('Bcrypt compare failed for user', user.email, ':', e);
      // Fallback to plain text comparison handled below
    }
  }

  // Fallback to plain text comparison
  if (!isMatch) {
    isMatch = (password === user.password);
    if (isMatch) console.log('Plain text match for user', user.email);
  }

  if (isMatch) {
    await db.query(
      'DELETE FROM login_attempts WHERE email = ?',
      [normalizedEmail]
    );
    // Log successful login - handle both 'id' and 'user_id' column names
    const userId = user.id ?? user.user_id;
    await logAudit(req, userId, 'User logged in', 'user', userId.toString());

    res.json(formatUserResponse(user as User));
  } else {
    const nextFailed = Number(lockRow?.failed_count || 0) + 1;
    const shouldLock = nextFailed >= 3;
    await db.query(
      `INSERT INTO login_attempts (email, failed_count, locked_until)
       VALUES (?, ?, ${shouldLock ? "DATE_ADD(NOW(), INTERVAL 2 MINUTE)" : "NULL"})
       ON DUPLICATE KEY UPDATE
         failed_count = VALUES(failed_count),
         locked_until = VALUES(locked_until)`,
      [normalizedEmail, shouldLock ? 0 : nextFailed]
    );
    if (shouldLock) {
      return res.status(429).json({ error: "too many attempts try again after 2 minutes" });
    }
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

app.post('/api/chat-history', async (req: Request, res: Response) => {
  try {
    if (String(req.body?.operation || "").toLowerCase() === "delete") {
      const columns = await getChatHistoryColumns();
      if (!columns) {
        return res.status(500).json({ error: "chat_history table not found" });
      }

      const idColumn = pickChatHistoryColumn(columns, ["id", "chat_id", "history_id"]);
      const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
      if (!idColumn || !userIdColumn) {
        return res.status(500).json({ error: "chat_history must have id and user_id columns" });
      }

      const { user_id, ids } = req.body || {};
      const normalizedUserId = String(user_id || "").trim();
      const normalizedIds = Array.isArray(ids)
        ? ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];

      if (!normalizedUserId) {
        return res.status(400).json({ error: "user_id is required" });
      }
      if (!normalizedIds.length) {
        return res.status(400).json({ error: "ids is required" });
      }

      const placeholders = normalizedIds.map(() => "?").join(", ");
      const sql = `
        DELETE FROM chat_history
        WHERE ${userIdColumn} = ?
          AND ${idColumn} IN (${placeholders})
      `;
      const [result] = await db.execute<ResultSetHeader>(sql, [normalizedUserId, ...normalizedIds]);
      return res.json({ message: "Deleted selected chats", deleted: result.affectedRows || 0 });
    }

    const {
      user_id,
      sender_type,
      role,
      message,
    } = req.body || {};

    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
      return res.status(400).json({ error: "message is required" });
    }

    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.status(500).json({ error: "chat_history table not found" });
    }

    const messageColumn = pickChatHistoryColumn(columns, ["message", "content", "chat_message", "text"]);
    if (!messageColumn) {
      return res.status(500).json({ error: "chat_history has no message/content column" });
    }

    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    const roleColumn = pickChatHistoryColumn(columns, ["sender_type", "role", "sender_role", "sender", "actor", "source"]);

    const insertColumns: string[] = [];
    const insertValues: Array<string | number | null> = [];
    const appendInsert = (columnName: string | null, value: string | number | null) => {
      if (!columnName) return;
      if (insertColumns.includes(columnName)) return;
      insertColumns.push(columnName);
      insertValues.push(value);
    };

    appendInsert(messageColumn, normalizedMessage);

    appendInsert(userIdColumn, user_id ?? null);
    appendInsert(roleColumn, String(sender_type || role || "assistant").toLowerCase());

    const placeholders = insertColumns.map(() => "?").join(", ");
    const sql = `INSERT INTO chat_history (${insertColumns.join(", ")}) VALUES (${placeholders})`;
    await db.execute(sql, insertValues);
    res.status(201).json({ message: "Chat history saved" });
  } catch (error: unknown) {
    console.error("Error saving chat history:", error);
    res.status(500).json({ error: "Failed to save chat history" });
  }
});

app.get('/api/chat-history', async (req: Request, res: Response) => {
  try {
    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.status(500).json({ error: "chat_history table not found" });
    }

    const idColumn = pickChatHistoryColumn(columns, ["id", "chat_id", "history_id"]);
    const messageColumn = pickChatHistoryColumn(columns, ["message", "content", "chat_message", "text"]);
    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    const roleColumn = pickChatHistoryColumn(columns, ["sender_type", "role", "sender_role", "sender", "actor", "source"]);
    const createdAtColumn = pickChatHistoryColumn(columns, ["created_at", "date_submitted", "timestamp", "createdon", "time"]);

    if (!messageColumn) {
      return res.status(500).json({ error: "chat_history has no message/content column" });
    }

    const { user_id, limit = "200" } = req.query;
    const params: Array<string | number> = [];
    const parsedLimit = Math.max(1, Math.min(500, Number(limit) || 200));

    if (!userIdColumn) {
      return res.status(500).json({ error: "chat_history has no user_id column" });
    }

    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }
    params.push(String(user_id));

    const selectParts = [
      idColumn ? `${idColumn} AS id` : "NULL AS id",
      `${messageColumn} AS message`,
      userIdColumn ? `${userIdColumn} AS user_id` : "NULL AS user_id",
      roleColumn ? `${roleColumn} AS role` : "'assistant' AS role",
      createdAtColumn ? `${createdAtColumn} AS created_at` : "NOW() AS created_at",
    ];

    const orderColumn = createdAtColumn || idColumn || messageColumn;
    const sql = `
      SELECT ${selectParts.join(", ")}
      FROM chat_history
      WHERE ${userIdColumn} = ?
      ORDER BY ${orderColumn} ASC
      LIMIT ${parsedLimit}
    `;

    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error: unknown) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

app.get('/api/chat-history/conversations', async (req: Request, res: Response) => {
  try {
    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.status(500).json({ error: "chat_history table not found" });
    }

    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    const messageColumn = pickChatHistoryColumn(columns, ["message", "content", "chat_message", "text"]);
    const roleColumn = pickChatHistoryColumn(columns, ["sender_type", "role", "sender_role", "sender", "actor", "source"]);
    const createdAtColumn = pickChatHistoryColumn(columns, ["created_at", "date_submitted", "timestamp", "createdon", "time"]);

    if (!messageColumn) {
      return res.status(500).json({ error: "chat_history needs message column" });
    }

    const { user_id, limit = "200" } = req.query;
    const normalizedUserId = String(user_id || "").trim();
    const parsedLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    if (!normalizedUserId) {
      return res.status(400).json({ error: "user_id is required" });
    }

    const orderColumn = createdAtColumn || messageColumn;
    const userRoleFilter = roleColumn ? `AND LOWER(COALESCE(c2.${roleColumn}, '')) = 'user'` : "";
    const whereClauses: string[] = [];
    const params: Array<string | number> = [];
    if (normalizedUserId && userIdColumn) {
      whereClauses.push(`c.${userIdColumn} = ?`);
      params.push(normalizedUserId);
    }
    if (!whereClauses.length) {
      return res.status(500).json({ error: "chat_history has no user_id column for user-based filtering" });
    }
    const sessionExpr = userIdColumn ? `CONCAT('user-', c.${userIdColumn})` : `'legacy-all'`;
    const titleOwnerFilter = userIdColumn ? `c2.${userIdColumn} = c.${userIdColumn}` : "1=1";
    const titleFallbackOwnerFilter = userIdColumn ? `c3.${userIdColumn} = c.${userIdColumn}` : "1=1";

    const sql = `
      SELECT
        ${sessionExpr} AS session_id,
        MIN(c.${orderColumn}) AS first_message_at,
        MAX(c.${orderColumn}) AS last_message_at,
        COUNT(*) AS message_count,
        (
          SELECT c4.${messageColumn}
          FROM chat_history c4
          WHERE ${titleOwnerFilter}
            ${roleColumn ? `AND LOWER(COALESCE(c4.${roleColumn}, '')) = 'user'` : ""}
          ORDER BY c4.${orderColumn} ASC
          LIMIT 1
        ) AS first_user_message,
        (
          SELECT c5.${messageColumn}
          FROM chat_history c5
          WHERE ${titleOwnerFilter}
            ${roleColumn ? `AND LOWER(COALESCE(c5.${roleColumn}, '')) = 'assistant'` : ""}
          ORDER BY c5.${orderColumn} ASC
          LIMIT 1
        ) AS first_assistant_message,
        COALESCE(
          (
            SELECT c2.${messageColumn}
            FROM chat_history c2
            WHERE ${titleOwnerFilter}
              ${userRoleFilter}
            ORDER BY c2.${orderColumn} ASC
            LIMIT 1
          ),
          (
            SELECT c3.${messageColumn}
            FROM chat_history c3
            WHERE ${titleFallbackOwnerFilter}
            ORDER BY c3.${orderColumn} ASC
            LIMIT 1
          )
        ) AS title
      FROM chat_history c
      WHERE ${whereClauses.join(" AND ")}
      GROUP BY ${sessionExpr}
      ORDER BY last_message_at DESC
      LIMIT ${parsedLimit}
    `;

    const [rows] = await db.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error: unknown) {
    console.error("Error fetching chat conversations:", error);
    res.status(500).json({ error: "Failed to fetch chat conversations" });
  }
});

app.get('/api/chatbot-analytics', async (req: Request, res: Response) => {
  try {
    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.json({
        totalMessages: 0,
        activeUsers: 0,
        peakTime: "N/A",
      });
    }

    const createdAtColumn = pickChatHistoryColumn(columns, ["created_at", "date_submitted", "timestamp", "createdon", "time"]);
    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    const sessionIdColumn = pickChatHistoryColumn(columns, ["session_id", "chat_session_id", "conversation_id", "session"]);

    if (!createdAtColumn) {
      return res.json({
        totalMessages: 0,
        activeUsers: 0,
        peakTime: "N/A",
      });
    }

    const [totalRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM chat_history`
    );
    const totalMessages = Number(totalRows[0]?.total || 0);

    let activeUsers = 0;
    if (userIdColumn && sessionIdColumn) {
      const [activeRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT COALESCE(NULLIF(CAST(${userIdColumn} AS CHAR), ''), NULLIF(${sessionIdColumn}, ''))) AS active
         FROM chat_history`
      );
      activeUsers = Number(activeRows[0]?.active || 0);
    } else if (userIdColumn) {
      const [activeRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT ${userIdColumn}) AS active
         FROM chat_history`
      );
      activeUsers = Number(activeRows[0]?.active || 0);
    } else if (sessionIdColumn) {
      const [activeRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT ${sessionIdColumn}) AS active
         FROM chat_history`
      );
      activeUsers = Number(activeRows[0]?.active || 0);
    }

    const [peakRows] = await db.query<RowDataPacket[]>(
      `SELECT HOUR(${createdAtColumn}) AS hour_bucket, COUNT(*) AS total
       FROM chat_history
       GROUP BY HOUR(${createdAtColumn})
       ORDER BY total DESC, hour_bucket ASC
       LIMIT 1`
    );

    const toRangeLabel = (hourBucket: number) => {
      const start = Number.isFinite(hourBucket) ? hourBucket : 0;
      const end = (start + 2) % 24;
      const fmt = (h: number) => {
        const period = h >= 12 ? "PM" : "AM";
        const hour = h % 12 === 0 ? 12 : h % 12;
        return `${hour}:00 ${period}`;
      };
      return `${fmt(start)} - ${fmt(end)}`;
    };

    const peakTime = peakRows.length ? toRangeLabel(Number(peakRows[0]?.hour_bucket || 0)) : "N/A";

    res.json({
      totalMessages,
      activeUsers,
      peakTime,
    });
  } catch (error: unknown) {
    console.error("Error fetching chatbot analytics:", error);
    res.status(500).json({ error: "Failed to fetch chatbot analytics" });
  }
});

app.delete('/api/chat-history', async (req: Request, res: Response) => {
  try {
    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.status(500).json({ error: "chat_history table not found" });
    }

    const idColumn = pickChatHistoryColumn(columns, ["id", "chat_id", "history_id"]);
    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    if (!idColumn || !userIdColumn) {
      return res.status(500).json({ error: "chat_history must have id and user_id columns" });
    }

    const { user_id, ids } = req.body || {};
    const normalizedUserId = String(user_id || "").trim();
    const normalizedIds = Array.isArray(ids)
      ? ids
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      : [];

    if (!normalizedUserId) {
      return res.status(400).json({ error: "user_id is required" });
    }
    if (!normalizedIds.length) {
      return res.status(400).json({ error: "ids is required" });
    }

    const placeholders = normalizedIds.map(() => "?").join(", ");
    const sql = `
      DELETE FROM chat_history
      WHERE ${userIdColumn} = ?
        AND ${idColumn} IN (${placeholders})
    `;
    const [result] = await db.execute<ResultSetHeader>(sql, [normalizedUserId, ...normalizedIds]);
    res.json({ message: "Deleted selected chats", deleted: result.affectedRows || 0 });
  } catch (error: unknown) {
    console.error("Error deleting chat history:", error);
    res.status(500).json({ error: "Failed to delete chat history" });
  }
});

app.post('/api/chat-history/conversations/delete', async (req: Request, res: Response) => {
  try {
    const columns = await getChatHistoryColumns();
    if (!columns) {
      return res.status(500).json({ error: "chat_history table not found" });
    }

    const sessionIdColumn = pickChatHistoryColumn(columns, ["session_id", "chat_session_id", "conversation_id", "session"]);
    const userIdColumn = pickChatHistoryColumn(columns, ["user_id", "account_id", "sender_id", "userid"]);
    const { user_id, session_id, session_ids } = req.body || {};
    const normalizedUserId = String(user_id || "").trim();
    const normalizedSessionId = String(session_id || "").trim();
    const normalizedSessionIds = Array.isArray(session_ids)
      ? session_ids.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (!normalizedUserId && !normalizedSessionId) {
      return res.status(400).json({ error: "user_id or session_id is required" });
    }
    if (!normalizedSessionIds.length) {
      return res.status(400).json({ error: "session_ids is required" });
    }

    const filters: string[] = [];
    const params: Array<string> = [];
    if (normalizedUserId && userIdColumn) {
      filters.push(`${userIdColumn} = ?`);
      params.push(normalizedUserId);
    }
    if (normalizedSessionId && sessionIdColumn) {
      filters.push(`${sessionIdColumn} = ?`);
      params.push(normalizedSessionId);
    }
    if (!filters.length) {
      return res.status(500).json({ error: "chat_history has no user_id column for user-based deletion" });
    }

    let sql = "";
    let sqlParams: Array<string> = [];
    if (sessionIdColumn) {
      const placeholders = normalizedSessionIds.map(() => "?").join(", ");
      sql = `
        DELETE FROM chat_history
        WHERE ${filters.join(" AND ")}
          AND ${sessionIdColumn} IN (${placeholders})
      `;
      sqlParams = [...params, ...normalizedSessionIds];
    } else {
      // Fallback for legacy chat_history schemas without session column:
      // deleting selected "conversation" removes all rows matching owner filters.
      sql = `
        DELETE FROM chat_history
        WHERE ${filters.join(" AND ")}
      `;
      sqlParams = [...params];
    }
    const [result] = await db.execute<ResultSetHeader>(sql, sqlParams);
    res.json({ message: "Deleted selected conversations", deleted: result.affectedRows || 0 });
  } catch (error: unknown) {
    console.error("Error deleting chat conversations:", error);
    res.status(500).json({ error: "Failed to delete chat conversations" });
  }
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

app.post('/api/find-accounts-by-gmail', async (req: Request, res: Response) => {
  const { gmail } = req.body || {};
  const normalizedGmail = String(gmail || "").trim().toLowerCase();

  if (!normalizedGmail || !normalizedGmail.endsWith("@gmail.com")) {
    return res.status(400).json({ error: "Please provide a valid Gmail address." });
  }

  try {
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const columnNames = columns.map((c) => c.Field.toLowerCase());
    const idColumn = columnNames.includes("id") ? "id" : (columnNames.includes("user_id") ? "user_id" : "id");
    const hasImage = columnNames.includes("image");
    const hasGmailAccount = columnNames.includes("gmail_account");
    const hasFirstName = columnNames.includes("first_name");
    const hasLastName = columnNames.includes("last_name");

    if (!hasGmailAccount && !columnNames.includes("email")) {
      return res.status(500).json({ error: "Users table is missing required email columns." });
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         ${idColumn} AS user_id,
         email,
         ${hasGmailAccount ? "gmail_account" : "NULL AS gmail_account"},
         ${hasFirstName ? "first_name" : "NULL AS first_name"},
         ${hasLastName ? "last_name" : "NULL AS last_name"},
         ${hasImage ? "image" : "NULL AS image"}
       FROM users
       WHERE LOWER(TRIM(email)) = ?
          ${hasGmailAccount ? "OR LOWER(TRIM(COALESCE(gmail_account, ''))) = ?" : ""}
       ORDER BY ${idColumn} ASC`,
      hasGmailAccount ? [normalizedGmail, normalizedGmail] : [normalizedGmail]
    );

    const accounts = rows.map((row) => {
      const firstName = row.first_name ? String(row.first_name) : "";
      const lastName = row.last_name ? String(row.last_name) : "";
      const fullName = `${firstName} ${lastName}`.trim();
      return {
        user_id: row.user_id,
        email: row.email || null,
        gmail_account: row.gmail_account || null,
        profile: {
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: fullName || row.email || "Unknown User",
          image: row.image || null,
          email: row.email || null,
        },
      };
    });

    res.json({ accounts, gmail: normalizedGmail });
  } catch (error: unknown) {
    console.error("Error finding accounts by gmail:", error);
    res.status(500).json({ error: "Server error while finding accounts." });
  }
});

app.post('/api/find-accounts-by-email', async (req: Request, res: Response) => {
  const { email } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  try {
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const columnNames = columns.map((c) => c.Field.toLowerCase());
    const idColumn = await getUserPkName();
    const hasImage = columnNames.includes("image");
    const hasGmailAccount = columnNames.includes("gmail_account");
    const hasUsername = columnNames.includes("username");
    const hasFirstName = columnNames.includes("first_name");
    const hasLastName = columnNames.includes("last_name");

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         ${idColumn} AS user_id,
         email,
         ${hasUsername ? "username" : "NULL AS username"},
         ${hasGmailAccount ? "gmail_account" : "NULL AS gmail_account"},
         ${hasFirstName ? "first_name" : "NULL AS first_name"},
         ${hasLastName ? "last_name" : "NULL AS last_name"},
         ${hasImage ? "image" : "NULL AS image"}
       FROM users
       WHERE LOWER(TRIM(email)) = ?
       ORDER BY ${idColumn} ASC
       LIMIT 1`,
      [normalizedEmail]
    );

    const accounts = rows.map((row) => {
      const firstName = row.first_name ? String(row.first_name) : "";
      const lastName = row.last_name ? String(row.last_name) : "";
      const fullName = `${firstName} ${lastName}`.trim();
      return {
        user_id: row.user_id,
        email: row.email || null,
        username: row.username || null,
        gmail_account: row.gmail_account || null,
        profile: {
          username: row.username || null,
          first_name: firstName || null,
          last_name: lastName || null,
          full_name: fullName || row.username || row.email || "Unknown User",
          image: row.image || null,
          email: row.email || null,
        },
      };
    });

    res.json({ accounts, email: normalizedEmail });
  } catch (error: unknown) {
    console.error("Error finding accounts by email:", error);
    res.status(500).json({ error: "Server error while finding accounts." });
  }
});

app.post('/api/verify-gmail-owner', async (req: Request, res: Response) => {
  const { userId, gmail } = req.body;
  console.log("🔍 Verify Gmail Owner - userId:", userId, "gmail:", gmail);
  
  if (!userId || !gmail) {
    return res.status(400).json({ error: 'userId and gmail are required' });
  }

  const normalizedGmail = String(gmail || "").trim().toLowerCase();
  if (!normalizedGmail || !normalizedGmail.endsWith('@gmail.com')) {
    return res.status(400).json({ error: 'Invalid Gmail address' });
  }

  try {
    const pkName = await detectUserPk(userId) || await getUserPkName();
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

    if (!linkedGmail || String(linkedGmail).trim().toLowerCase() !== normalizedGmail) {
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

app.post('/api/request-password-reset', async (req: Request, res: Response) => {
  const { email, user_id } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  try {
    const pkName = await getUserPkName();
    const queryWhere = `LOWER(TRIM(email)) = ? OR LOWER(TRIM(COALESCE(gmail_account, ''))) = ?`;
    const params: any[] = [normalizedEmail, normalizedEmail];

    let query = `SELECT ${pkName} AS user_id, email, first_name
       FROM users
       WHERE (${queryWhere})`;

    if (typeof user_id !== 'undefined' && user_id !== null) {
      const parsedUserId = Number(user_id);
      if (Number.isNaN(parsedUserId)) {
        return res.status(400).json({ error: 'Invalid user_id provided.' });
      }
      query += ` AND ${pkName} = ?`;
      params.push(parsedUserId);
    }

    query += ` LIMIT 1`;
    const [rows] = await db.query<RowDataPacket[]>(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'email is not exists' });
    }

    const user = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await db.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.user_id, tokenHash, expiresAt]
    );

    const mailUser =
      process.env.SMTP_USER ||
      process.env.GMAIL_USER ||
      process.env.EMAIL_USER ||
      "";
    const mailPass =
      process.env.SMTP_PASS ||
      process.env.GMAIL_APP_PASSWORD ||
      process.env.EMAIL_PASS ||
      "";
    if (!mailUser || !mailPass) {
      console.error('Missing SMTP_USER/SMTP_PASS in environment');
      return res.status(500).json({ error: 'Email service is not configured.' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: mailUser, pass: mailPass },
    });

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: `"UC SmartHelp" <${mailUser}>`,
      to: normalizedEmail,
      subject: 'Password Reset Request',
      html: `
        <p>Hello,</p>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
      `,
    });

    return res.status(200).json({ message: 'If this account exists, a reset link has been sent.' });
  } catch (error: unknown) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({ error: 'Failed to send password reset email' });
  }
});

app.post('/api/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    console.log('Reset attempt with token hash:', tokenHash);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT pass_reset_id AS id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       ORDER BY pass_reset_id DESC LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      console.log('No valid token found for hash:', tokenHash);
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const resetRow = rows[0];
    console.log('Found reset token for user_id:', resetRow.user_id);
    const hashedPassword = await bcrypt.hash(String(password), 10);
    console.log('Hashed password starts with:', hashedPassword.substring(0, 10));

    const pkName = await getUserPkName();
    const [updateResult] = await db.query<ResultSetHeader>(
      `UPDATE users SET password = ? WHERE ${pkName} = ?`,
      [hashedPassword, resetRow.user_id]
    );

    if (updateResult.affectedRows === 0) {
      console.error('Password reset failed: no user row updated for user_id', resetRow.user_id);
      return res.status(500).json({ error: 'Failed to update password for this account.' });
    }

    console.log('Password updated successfully for user_id:', resetRow.user_id);
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE pass_reset_id = ?', [resetRow.id]);

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (error: unknown) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
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

  // Notify admins about new ticket submission
  try {
    const [adminUsers] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE role = 'admin'"
    );
    
    for (const admin of adminUsers) {
      await createNotification(
        admin.id,
        'new_ticket',
        'New ticket submitted',
        `A new ticket has been submitted: "${subject}"`,
        result.insertId
      );
    }
  } catch (notifError) {
    console.error('Error creating admin notification for new ticket:', notifError);
    // Don't fail the ticket creation if notification fails
  }

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
  const departmentPk = await getDepartmentPkName();
  let query = `
    SELECT ${selectClause}, u.first_name, u.last_name, CONCAT(u.first_name, ' ', u.last_name) AS full_name,
      d.${departmentPk} AS department_id, d.name AS department_name
    FROM tickets t
    LEFT JOIN users u ON t.user_id = u.${detectedUserPk}
    LEFT JOIN departments d ON t.department_id = d.${departmentPk}
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
    const departmentPk = await getDepartmentPkName();
    const [rows] = await db.query<RowDataPacket[]>(`SELECT ${departmentPk} AS id, name FROM departments ORDER BY name`);
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
    // Resolve user and role for sender - INCLUDE first_name and last_name for notifications
    const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userPk = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

    const [userRows] = await db.query<RowDataPacket[]>(`SELECT ${userPk} as userId, role, first_name, last_name FROM users WHERE ${userPk} = ?`, [user_id]);
    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const role = (userRows[0].role || 'student').toLowerCase();
    const isStudent = role === 'student';
    const userRow = userRows[0];

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

    // Try to insert using the RESPONSE_TABLE constant (ticket_response)
    try {
      const insertQuery = `INSERT INTO ${RESPONSE_TABLE} (ticket_id, user_id, role, message, created_at) VALUES (?, ?, ?, ?, NOW())`;
      console.log(`✅ Inserting response into ${RESPONSE_TABLE} for ticket ${id}`);
      console.log(`   Params: ticket_id=${id}, user_id=${user_id}, role=${role}, message_len=${message.length}`);
      
      const [result] = await db.execute<ResultSetHeader>(insertQuery, [id, user_id, role, message]);
      console.log(`✅ Response inserted successfully. Insert ID:`, result.insertId);
    } catch (insertError: unknown) {
      const err = insertError instanceof Error ? insertError : new Error(String(insertError));
      console.error(`❌ Error inserting into ${RESPONSE_TABLE}:`, err.message);
      throw new Error(`Failed to insert response into database: ${err.message}`);
    }

    // Log audit trail for ticket response
    await logAudit(req, user_id, 'Added ticket response', 'ticket', id.toString());

    // Create notification for ticket owner if someone else replied
    try {
      const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
      const ticketPk = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

      const [ticketRows] = await db.query<RowDataPacket[]>(`SELECT user_id, subject FROM tickets WHERE ${ticketPk} = ?`, [id]);
      if (ticketRows.length > 0) {
        const ticketOwnerId = ticketRows[0].user_id;
        const ticketSubject = ticketRows[0].subject || 'Ticket';

        // Only create notification if the replier is not the ticket owner
        if (ticketOwnerId !== user_id) {
          const senderName = userRow.first_name && userRow.last_name 
            ? `${userRow.first_name} ${userRow.last_name}` 
            : (role === 'staff' || role === 'admin' ? 'Staff' : 'Student');

          console.log(`📢 Creating notification for user ${ticketOwnerId}: New reply from ${senderName}`);
          await createNotification(
            ticketOwnerId,
            'ticket_reply',
            `New reply on your ticket`,
            `${senderName} replied to your ticket: "${ticketSubject}"`,
            parseInt(id)
          );
        }

        // If a student replied, notify all staff/admin users about the new reply
        if (role === 'student') {
          const [staffUsers] = await db.query<RowDataPacket[]>(
            "SELECT id FROM users WHERE role IN ('staff', 'admin')"
          );
          
          console.log(`📢 Notifying ${staffUsers.length} staff members about student reply`);
          for (const staff of staffUsers) {
            await createNotification(
              staff.id,
              'student_ticket_reply',
              'New ticket reply',
              `Student replied to ticket: "${ticketSubject}"`,
              parseInt(id)
            );
          }
        }
      }
    } catch (notifError) {
      console.error('Error creating notification for ticket reply:', notifError);
      // Don't fail the response if notification creation fails
    }

    res.status(201).json({ message: "Response saved" });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Fatal error in POST /api/tickets/:id/responses:', err.message);
    res.status(500).json({ error: "Error saving response", details: err.message });
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
    
    // Set closed_at when ticket is resolved or closed
    if (dbStatus.toLowerCase() === 'resolved' || dbStatus.toLowerCase() === 'closed') {
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

    // Create notifications for status change
    try {
      // Get ticket owner and staff info
      const [ticketInfo] = await db.query<RowDataPacket[]>(
        `SELECT t.user_id, t.subject, u.role FROM tickets t 
         LEFT JOIN users u ON t.user_id = u.id 
         WHERE t.${pkName} = ?`,
        [id]
      );

      if (ticketInfo.length > 0) {
        const ticketOwnerId = ticketInfo[0].user_id;
        const ticketSubject = ticketInfo[0].subject || 'Ticket';

        // Notify the ticket owner (student) about status change
        if (ticketOwnerId !== user_id) { // Don't notify if the owner is updating their own ticket
          await createNotification(
            ticketOwnerId,
            'ticket_status_changed',
            'Ticket status updated',
            `Your ticket "${ticketSubject}" status has been changed to ${dbStatus}`,
            parseInt(id)
          );
        }

        // Notify the staff member who made the change (if they're staff/admin)
        if (user_id && user_id !== ticketOwnerId) {
          const [staffInfo] = await db.query<RowDataPacket[]>(
            "SELECT role FROM users WHERE id = ?",
            [user_id]
          );
          
          if (staffInfo.length > 0 && ['staff', 'admin'].includes(staffInfo[0].role.toLowerCase())) {
            await createNotification(
              user_id,
              'status_updated_by_you',
              'Status update confirmed',
              `You updated ticket "${ticketSubject}" status to ${dbStatus}`,
              parseInt(id)
            );
          }
        }
      }
    } catch (notifError) {
      console.error('Error creating notifications for status change:', notifError);
      // Don't fail the status update if notification creation fails
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
    const departmentPk = await getDepartmentPkName();

    if (department_id) {
      const [deptRows] = await db.query<RowDataPacket[]>(`SELECT ${departmentPk} AS id, name FROM departments WHERE ${departmentPk} = ?`, [department_id]);
      if (deptRows.length === 0) {
        return res.status(400).json({ error: "Invalid department_id" });
      }
      deptId = deptRows[0].id;
      deptName = deptRows[0].name;
    }

    // If only name provided, look up its ID
    if (!deptId && department_name) {
      const [deptRows] = await db.query<RowDataPacket[]>(`SELECT ${departmentPk} AS id, name FROM departments WHERE name = ?`, [department_name]);
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

// Check for overdue tickets and create notifications
app.post('/api/check-overdue-tickets', async (req: Request, res: Response) => {
  try {
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const pkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // Find tickets that haven't had responses for 5 days
    const [overdueTickets] = await db.query<RowDataPacket[]>(`
      SELECT t.${pkName} as id, t.user_id, t.subject, t.status, t.created_at,
             MAX(tr.created_at) as last_response_date,
             u.role
      FROM tickets t
      LEFT JOIN ticket_response tr ON t.${pkName} = tr.ticket_id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.status NOT IN ('resolved', 'closed')
      GROUP BY t.${pkName}, t.user_id, t.subject, t.status, t.created_at, u.role
      HAVING last_response_date IS NULL 
         AND DATEDIFF(CURRENT_DATE, DATE(t.created_at)) >= 5
         OR (last_response_date IS NOT NULL 
         AND DATEDIFF(CURRENT_DATE, DATE(last_response_date)) >= 5)
    `);

    let notificationsCreated = 0;

    for (const ticket of overdueTickets) {
      const ticketId = ticket.id;
      const userId = ticket.user_id;
      const subject = ticket.subject || 'Ticket';
      const userRole = ticket.role?.toLowerCase() || 'student';

      // Notify students about their overdue tickets
      if (userRole === 'student') {
        await createNotification(
          userId,
          'ticket_overdue',
          'Ticket overdue',
          `Your ticket "${subject}" is overdue (no response for 5 days)`,
          ticketId
        );
        notificationsCreated++;
      } 
      // Notify staff/admin about overdue tickets they're handling
      else if (['staff', 'admin'].includes(userRole)) {
        await createNotification(
          userId,
          'ticket_overdue_staff',
          'Ticket overdue',
          `Ticket "${subject}" is overdue (no update for 5 days)`,
          ticketId
        );
        notificationsCreated++;
      }
    }

    // Also notify admins about any overdue tickets in the system
    if (overdueTickets.length > 0) {
      const [adminUsers] = await db.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE role = 'admin'"
      );
      
      for (const admin of adminUsers) {
        await createNotification(
          admin.id,
          'overdue_tickets_detected',
          'Overdue tickets detected',
          `${overdueTickets.length} ticket(s) are overdue and need attention`,
          undefined,
          undefined
        );
      }
    }

    res.json({ 
      message: `Checked for overdue tickets. Created ${notificationsCreated} notifications.`,
      overdueCount: overdueTickets.length
    });
  } catch (error: unknown) {
    console.error('Error checking overdue tickets:', error);
    res.status(500).json({ error: 'Error checking overdue tickets', details: error instanceof Error ? error.message : String(error) });
  }
});

// Department feedback endpoints
app.post('/api/department-feedback', async (req: Request, res: Response) => {
  const { user_id, ticket_id, department, rating, comment } = req.body;

  if (!department || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Convert rating (5 = helpful pressed, 1 = poor pressed) to boolean is_helpful
    const isHelpful = rating === 5; // 5 = true (helpful), 1 = false (poor)
    
    // Check if this ticket has an auto-closed feedback record
    let finalComment = comment?.trim() || null;
    if (ticket_id) {
      const [existingFeedback] = await db.query<RowDataPacket[]>(
        'SELECT auto_closed FROM department_feedback WHERE ticket_id = ? AND auto_closed = TRUE LIMIT 1',
        [ticket_id]
      );
      
      if (existingFeedback.length > 0) {
        // This is feedback for an auto-closed ticket - append "- unattended"
        if (finalComment) {
          finalComment = `${finalComment} - unattended`;
        } else {
          finalComment = '- unattended';
        }
      }
    }
    
    await db.execute(
      'INSERT INTO department_feedback (user_id, ticket_id, department, is_helpful, comment, feedback_completed, date_submitted) VALUES (?, ?, ?, ?, ?, TRUE, NOW())',
      [user_id || null, ticket_id || null, department, isHelpful, finalComment]
    );

    res.status(201).json({ message: 'Department feedback saved' });
  } catch (error: unknown) {
    console.error('Error saving department feedback:', error);
    res.status(500).json({ error: 'Error saving department feedback', details: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/department-feedback', async (req: Request, res: Response) => {
  try {
    const [rows] = await db.query<RowDataPacket[]>('SELECT dept_feedback_id as id, user_id, ticket_id, department, is_helpful, comment, feedback_requested, feedback_completed, auto_closed, date_submitted, date_requested FROM department_feedback ORDER BY date_submitted DESC');
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching department feedback:', error);
    res.status(500).json({ error: 'Error fetching department feedback' });
  }
});

// Get pending feedback requests for a user
app.get('/api/department-feedback/pending', async (req: Request, res: Response) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT df.*, t.subject as ticket_subject FROM department_feedback df LEFT JOIN tickets t ON df.ticket_id = t.id WHERE df.user_id = ? AND df.feedback_requested = TRUE AND df.feedback_completed = FALSE ORDER BY df.date_requested DESC',
      [user_id]
    );
    res.json(rows);
  } catch (error: unknown) {
    console.error('Error fetching pending feedback:', error);
    res.status(500).json({ error: 'Error fetching pending feedback' });
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
    const hasGmailAccount = columnNames.includes("gmail_account");
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
    if (hasGmailAccount) {
      selectColumns.push("gmail_account");
    }

    const query = `SELECT ${selectColumns.join(", ")} FROM users`;
    const [rows] = await db.query<RowDataPacket[]>(query);

    const result = (rows as RowDataPacket[]).map((u) => ({
      ...u,
      department: hasDepartment ? u.department ?? null : null,
      is_disabled: hasDisabledFlag ? Number(u.is_disabled) : 0,
      image: hasImage ? u.image ?? null : null,
      gmail_account: hasGmailAccount ? u.gmail_account ?? null : null,
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
  const { first_name, last_name, email, role, department, is_disabled, deactivated_at, gmail_account } = req.body;

  try {
    if (!id) {
      return res.status(400).json({ error: "Missing user id" });
    }
    const pkName = await detectUserPk(id) || await getUserPkName();
    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const hasGmailAccount = columns.some((c) => c.Field.toLowerCase() === "gmail_account");

    const updateFields: string[] = [];
    const values: Array<string | number | null> = [];

    if (typeof role !== "undefined") {
      updateFields.push("role = ?");
      values.push(role);
    }
    if (typeof first_name !== "undefined") {
      updateFields.push("first_name = ?");
      values.push(first_name);
    }
    if (typeof last_name !== "undefined") {
      updateFields.push("last_name = ?");
      values.push(last_name);
    }
    if (typeof email !== "undefined") {
      const normalizedEmail = String(email).toLowerCase().trim();
      const [existingEmail] = await db.query<RowDataPacket[]>(
        `SELECT ${pkName} as id FROM users WHERE LOWER(TRIM(email)) = ? AND ${pkName} <> ? LIMIT 1`,
        [normalizedEmail, id]
      );
      if (existingEmail.length > 0) {
        return res.status(409).json({ error: "Email is already taken" });
      }
      updateFields.push("email = ?");
      values.push(normalizedEmail);
    }
    if (typeof gmail_account !== "undefined" && hasGmailAccount) {
      const normalizedGmail = String(gmail_account || "").trim().toLowerCase();
      if (normalizedGmail && !normalizedGmail.endsWith("@gmail.com")) {
        return res.status(400).json({ error: "Please provide a valid Gmail address" });
      }
      const [existingGmail] = await db.query<RowDataPacket[]>(
        `SELECT ${pkName} as id FROM users WHERE LOWER(TRIM(COALESCE(gmail_account, ''))) = ? AND ${pkName} <> ? LIMIT 1`,
        [normalizedGmail, id]
      );
      if (normalizedGmail && existingGmail.length > 0) {
        return res.status(409).json({ error: "Gmail account is already linked to another user" });
      }
      updateFields.push("gmail_account = ?");
      values.push(normalizedGmail || null);
    }
    if (typeof department !== "undefined") {
      updateFields.push("department = ?");
      values.push(department || null);
    }
    if (typeof is_disabled !== "undefined") {
      updateFields.push("is_disabled = ?");
      values.push(Number(Boolean(is_disabled)));
    }
    if (typeof deactivated_at !== "undefined") {
      updateFields.push("deactivated_at = ?");
      values.push(deactivated_at ? String(deactivated_at) : null);
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

    const selectUpdatedParts = [
      `${pkName} AS id`,
      "first_name",
      "last_name",
      "email",
      "role",
      "department",
      "is_disabled",
      "deactivated_at",
      "image",
      hasGmailAccount ? "gmail_account" : "NULL AS gmail_account",
    ];
    const [updatedRows] = await db.query<RowDataPacket[]>(
      `SELECT ${selectUpdatedParts.join(", ")} FROM users WHERE ${pkName} = ? LIMIT 1`,
      [id]
    );
    res.json(updatedRows[0] || { message: "User updated" });
  } catch (error: unknown) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: "Error updating user", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/account/deactivation', async (req: Request, res: Response) => {
  const { userId, deactivate } = req.body || {};
  if (!userId || typeof deactivate !== "boolean") {
    return res.status(400).json({ error: "userId and deactivate flag are required" });
  }

  try {
    const pkName = await detectUserPk(userId) || await getUserPkName();
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE users
       SET is_disabled = ?,
           deactivated_at = ?
       WHERE ${pkName} = ?
       LIMIT 1`,
      [deactivate ? 1 : 0, deactivate ? new Date() : null, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT ${pkName} AS id, is_disabled, deactivated_at FROM users WHERE ${pkName} = ? LIMIT 1`,
      [userId]
    );
    return res.json(rows[0] || { id: userId, is_disabled: deactivate ? 1 : 0, deactivated_at: deactivate ? new Date() : null });
  } catch (error: unknown) {
    console.error('Error toggling account deactivation:', error);
    return res.status(500).json({ error: "Error toggling account status", details: error instanceof Error ? error.message : String(error) });
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
    const viewerUserId = req.query.viewer_user_id ? parseInt(req.query.viewer_user_id.toString()) : null;
    
    console.log(`📢 Fetching announcements: viewerRole=${viewerRole}, viewerUserId=${viewerUserId}`);
    
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
    const params: (string | number)[] = [];
    if (hasAudience) {
      if (viewerRole === "admin") {
        // Admins can only see announcements addressed to all, plus their own announcements
        whereClause = "WHERE (a.audience = 'all'";
        if (viewerUserId) {
          whereClause += " OR a.user_id = ?";
          params.push(viewerUserId);
        }
        whereClause += ")";
      } else if (viewerRole === "staff") {
        // Staff can see announcements addressed to all or staff, plus their own announcements
        whereClause = "WHERE (a.audience = 'all' OR a.audience = 'staff'";
        if (viewerUserId) {
          whereClause += " OR a.user_id = ?";
          params.push(viewerUserId);
        }
        whereClause += ")";
      } else if (viewerRole === "student") {
        // Students can see announcements addressed to all or students
        whereClause = "WHERE (a.audience = 'all' OR a.audience = 'students')";
      } else {
        // Guests can only see 'all' announcements
        whereClause = "WHERE a.audience = 'all'";
      }
    }

    console.log(`📢 WHERE clause: ${whereClause}, params:`, params);

    const orderByClause = hasPostedAt
      ? "ORDER BY a.posted_at DESC"
      : hasCreatedAt
      ? "ORDER BY a.created_at DESC"
      : `ORDER BY a.${idColumn} DESC`;
    
    const query = `SELECT a.${idColumn} AS announcement_id, a.user_id, ${hasRole ? "a.role" : "'staff' AS role"}, ${columnNames.includes("department") ? "a.department" : "NULL AS department"}, ${hasAudience ? "a.audience" : "'all' as audience"}, a.message, 
              ${hasCreatedAt ? 'DATE_FORMAT(a.created_at, "%Y-%m-%d %H:%i:%s")' : "NULL"} AS posted_at
       FROM announcement a
       ${whereClause}
       ${orderByClause}`;
    
    console.log(`📢 Executing query: ${query}`);
    console.log(`📢 Query params:`, params);
    
    const [rows] = await db.query<RowDataPacket[]>(query, params);
    console.log(`📢 Query returned ${rows.length} announcements`);
    rows.forEach(row => console.log(`   - ID: ${row.announcement_id}, user_id: ${row.user_id}, audience: ${row.audience}`));
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

    if (!user_id || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userColNames = userCols.map((c) => c.Field);
    const userPk = userColNames.includes("user_id") ? "user_id" : "id";

    const [userRows] = await db.query<RowDataPacket[]>(
      `SELECT role FROM users WHERE ${userPk} = ? LIMIT 1`,
      [user_id]
    );

    if (userRows.length === 0) {
      return res.status(403).json({ error: "Invalid user" });
    }

    const actualRole = userRows[0].role?.toString().trim().toLowerCase();
    if (!actualRole || !['staff', 'admin'].includes(actualRole)) {
      return res.status(403).json({ error: "Only staff and admin can create announcements" });
    }

    const normalizedRole = actualRole;
    let normalizedAudience = (audience || "").toString().trim().toLowerCase();
    if (normalizedAudience === "student") {
      normalizedAudience = "students";
    }
    const allowedAudience = ["all", "students", "staff"];
    const finalAudience = allowedAudience.includes(normalizedAudience)
      ? normalizedAudience
      : normalizedRole === "admin"
      ? "all"
      : "students";

    const [columns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM announcement");
    const columnNames = columns.map((c) => c.Field);
    const insertCols: string[] = [];
    const placeholders: string[] = [];
    const values: Array<string | number | null> = [];

    if (columnNames.includes("user_id")) {
      insertCols.push("user_id");
      placeholders.push("?");
      values.push(user_id || null);
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
    if (columnNames.includes("created_at")) {
      insertCols.push("created_at");
      placeholders.push("NOW()");
    }

    const [result] = await db.query(
      `INSERT INTO announcement (${insertCols.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );

    // Create notifications for users based on audience (exclude the author)
    try {
      const announcementId = (result as any).insertId;
      console.log(`📢 Creating notifications for announcement ${announcementId}, audience: ${finalAudience}`);
      
      let userQuery = 'SELECT user_id, role FROM users WHERE is_disabled = 0 AND user_id != ?';
      const queryParams: any[] = [user_id]; // Exclude the author

      if (finalAudience === 'students') {
        userQuery += ' AND LOWER(role) = ?';
        queryParams.push('student');
      } else if (finalAudience === 'staff') {
        userQuery += ' AND LOWER(role) = ?';
        queryParams.push('staff');
      }
      // For 'all', no additional filter needed

      console.log(`📢 User query: ${userQuery}, params:`, queryParams);
      const [users] = await db.query<RowDataPacket[]>(userQuery, queryParams);
      console.log(`📢 Found ${users.length} users to notify:`, users.map(u => ({ user_id: u.user_id, role: u.role })));
      
      // Create notifications for each user
      for (const user of users) {
        console.log(`📢 Creating notification for user ${user.user_id} (${user.role})`);
        await createNotification(
          user.user_id,
          'announcement',
          'New Announcement',
          'A new announcement has been posted',
          undefined, // ticket_id
          announcementId // announcement_id
        );
        console.log(`✅ Notification created for user ${user.user_id}`);
      }
      
      console.log(`📢 Created ${users.length} notifications for announcement ${announcementId}`);
    } catch (notifError) {
      console.error('❌ Error creating notifications for announcement:', notifError);
      // Don't fail the announcement creation if notifications fail
    }

    res.status(201).json({
      id: (result as any).insertId,
      message: "Announcement created successfully"
    });
  } catch (error: unknown) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Error creating announcement', details: error instanceof Error ? error.message : String(error) });
  }
});

// Update announcement (admin/staff only, or announcement owner)
app.patch('/api/announcements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role, message, audience } = req.body;

    if (!role || !message) {
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

    const existingRow = existingRows[0] as any;
    if (existingRow.user_id && user_id && existingRow.user_id !== user_id) {
      return res.status(403).json({ error: "You can only edit your own announcements" });
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
    if (columnNames.includes("created_at")) {
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

// Delete announcement (admin/staff only, or announcement owner)
app.delete('/api/announcements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { user_id, role } = req.body;

    if (!role) {
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

    const existingRow = existingRows[0] as any;
    if (existingRow.user_id && user_id && existingRow.user_id !== user_id) {
      return res.status(403).json({ error: "You can only delete your own announcements" });
    }

    await db.query(`DELETE FROM announcement WHERE ${idColumn} = ?`, [id]);
    res.json({ message: "Announcement deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({ error: "Error deleting announcement", details: error instanceof Error ? error.message : String(error) });
  }
});

// Notification endpoints
app.get('/api/notifications/unread-count', async (req: Request, res: Response) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const [result] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [user_id]
    );
    const count = result[0]?.count || 0;
    res.json({ count });
  } catch (error: unknown) {
    console.error('Error fetching unread notification count:', error);
    res.status(500).json({ error: 'Error fetching notification count' });
  }
});

app.get('/api/notifications', async (req: Request, res: Response) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const [notifications] = await db.query<RowDataPacket[]>(
      `SELECT * FROM notifications 
       WHERE user_id = ? 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [user_id]
    );
    res.json(notifications);
  } catch (error: unknown) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Error fetching notifications' });
  }
});

app.patch('/api/notifications/:id/mark-as-read', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (error: unknown) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Error marking notification as read' });
  }
});

app.patch('/api/notifications/mark-all-as-read', async (req: Request, res: Response) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [user_id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error: unknown) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Error marking all notifications as read' });
  }
});

// Delete notification endpoint
app.delete('/api/notifications/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!id || !user_id) {
    return res.status(400).json({ error: 'id and user_id are required' });
  }

  try {
    const [result] = await db.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [id, user_id]
    );
    
    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: 'Notification not found or not owned by user' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error: unknown) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Error deleting notification' });
  }
});

// Announcement unread count endpoint
app.get('/api/announcements/unread-count', async (req: Request, res: Response) => {
  const { user_id } = req.query;
  
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const [result] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM announcement a
       LEFT JOIN announcement_views av ON a.id = av.announcement_id AND av.user_id = ?
       WHERE av.id IS NULL`,
      [user_id]
    );
    const count = result[0]?.count || 0;
    res.json({ count });
  } catch (error: unknown) {
    console.error('Error fetching unread announcement count:', error);
    res.status(500).json({ error: 'Error fetching announcement count' });
  }
});

app.patch('/api/announcements/:id/mark-as-read', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    await db.query(
      `INSERT INTO announcement_views (user_id, announcement_id) 
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP`,
      [user_id, id]
    );
    res.json({ message: 'Announcement marked as read' });
  } catch (error: unknown) {
    console.error('Error marking announcement as read:', error);
    res.status(500).json({ error: 'Error marking announcement as read' });
  }
});

const runDeactivatedAccountCleanup = async () => {
  try {
    const [userColumns] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userColumnNames = userColumns.map((c) => c.Field.toLowerCase());
    if (!userColumnNames.includes("deactivated_at")) {
      return;
    }

    const [result] = await db.execute<ResultSetHeader>(
      `DELETE FROM users
       WHERE is_disabled = 1
         AND deactivated_at IS NOT NULL
         AND deactivated_at <= DATE_SUB(NOW(), INTERVAL 30 SECOND)`
    );
    if (result.affectedRows > 0) {
      console.log(`Auto-cleanup removed ${result.affectedRows} deactivated account(s).`);
    }
  } catch (error: unknown) {
    console.error('Error cleaning up deactivated accounts:', error);
  }
};

setInterval(() => {
  void runDeactivatedAccountCleanup();
}, 5 * 1000);
void runDeactivatedAccountCleanup();

// Check for overdue tickets every 6 hours (21600000 ms)
const checkOverdueTickets = async () => {
  try {
    console.log('Checking for overdue tickets...');
    
    const [ticketCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM tickets");
    const ticketPkName = ticketCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'ticket_id')?.Field || 'id';

    // Detect users table primary key
    const [userCols] = await db.query<DBColumn[]>("SHOW COLUMNS FROM users");
    const userPkName = userCols.find((c) => c.Field.toLowerCase() === 'id' || c.Field.toLowerCase() === 'user_id')?.Field || 'id';

    // Find tickets that haven't had responses for 5 days
    const [overdueTickets] = await db.query<RowDataPacket[]>(`
      SELECT t.${ticketPkName} as id, t.user_id, t.subject, t.status, t.created_at, t.department,
             MAX(tr.created_at) as last_response_date,
             u.role
      FROM tickets t
      LEFT JOIN ${RESPONSE_TABLE} tr ON t.${ticketPkName} = tr.ticket_id
      LEFT JOIN users u ON t.user_id = u.${userPkName}
      WHERE t.status NOT IN ('resolved', 'closed')
      GROUP BY t.${ticketPkName}, t.user_id, t.subject, t.status, t.created_at, t.department, u.role
      HAVING last_response_date IS NULL 
         AND DATEDIFF(CURRENT_DATE, DATE(t.created_at)) >= 5
         OR (last_response_date IS NOT NULL 
         AND DATEDIFF(CURRENT_DATE, DATE(last_response_date)) >= 5)
    `);

    let notificationsCreated = 0;
    let ticketsAutoClosed = 0;

    for (const ticket of overdueTickets) {
      const ticketId = ticket.id;
      const userId = ticket.user_id;
      const subject = ticket.subject || 'Ticket';
      const department = ticket.department;
      const userRole = ticket.role?.toLowerCase() || 'student';

      // Check if we already notified about this ticket today to avoid spam
      const [existingNotifications] = await db.query<RowDataPacket[]>(`
        SELECT id FROM notifications 
        WHERE user_id = ? AND ticket_id = ? AND type IN ('ticket_overdue', 'ticket_overdue_staff') 
        AND DATE(created_at) = CURRENT_DATE
      `, [userId, ticketId]);

      if (existingNotifications.length === 0) {
        // Notify students about their overdue tickets
        if (userRole === 'student') {
          await createNotification(
            userId,
            'ticket_overdue',
            'Ticket overdue',
            `Your ticket "${subject}" is overdue (no response for 5 days)`,
            ticketId
          );
          notificationsCreated++;
        } 
        // Notify staff/admin about overdue tickets they're handling
        else if (['staff', 'admin'].includes(userRole)) {
          await createNotification(
            userId,
            'ticket_overdue_staff',
            'Ticket overdue',
            `Ticket "${subject}" is overdue (no update for 5 days)`,
            ticketId
          );
          notificationsCreated++;
        }
      }

      // Auto-close tickets that are 5+ days overdue and create feedback request
      const daysSinceLastActivity = ticket.last_response_date 
        ? Math.floor((Date.now() - new Date(ticket.last_response_date).getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastActivity >= 5) {
        // Check if we already auto-closed this ticket
        const [existingFeedback] = await db.query<RowDataPacket[]>(`
          SELECT id FROM department_feedback 
          WHERE ticket_id = ? AND auto_closed = TRUE
        `, [ticketId]);

        if (existingFeedback.length === 0) {
          // Auto-close the ticket
          await db.execute(
            `UPDATE tickets SET status = 'Resolved', closed_at = CURRENT_TIMESTAMP WHERE ${pkName} = ?`,
            [ticketId]
          );

          // Create feedback request for the department
          if (department && userId) {
            await db.execute(
              `INSERT INTO department_feedback (user_id, ticket_id, department, feedback_requested, auto_closed, date_requested) 
               VALUES (?, ?, ?, TRUE, TRUE, NOW())`,
              [userId, ticketId, department]
            );

            // Notify the user about the auto-closure and feedback request
            await createNotification(
              userId,
              'ticket_auto_closed',
              'Ticket auto-closed',
              `Your ticket "${subject}" has been automatically closed due to no response for 5 days. Please provide feedback about the ${department} department.`,
              ticketId
            );

            ticketsAutoClosed++;
          }
        }
      }
    }

    // Also notify admins about any overdue tickets in the system (once per day)
    if (overdueTickets.length > 0) {
      const [existingAdminNotifications] = await db.query<RowDataPacket[]>(`
        SELECT id FROM notifications 
        WHERE type = 'overdue_tickets_detected' 
        AND DATE(created_at) = CURRENT_DATE
        LIMIT 1
      `);

      if (existingAdminNotifications.length === 0) {
        const [adminUsers] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE role = 'admin'"
        );
        
        for (const admin of adminUsers) {
          await createNotification(
            admin.id,
            'overdue_tickets_detected',
            'Overdue tickets detected',
            `${overdueTickets.length} ticket(s) are overdue and need attention`,
            undefined,
            undefined
          );
        }
      }
    }

    if (notificationsCreated > 0 || ticketsAutoClosed > 0) {
      console.log(`Created ${notificationsCreated} overdue notifications and auto-closed ${ticketsAutoClosed} tickets`);
    }
  } catch (error: unknown) {
    console.error('Error checking overdue tickets:', error);
  }
};

// Run overdue check every 6 hours
setInterval(() => {
  void checkOverdueTickets();
}, 6 * 60 * 60 * 1000);

// Also run on startup
void checkOverdueTickets();

const PORT = 3000;
app.listen(PORT, () => process.stdout.write(`Server running on port ${PORT}\n`));

