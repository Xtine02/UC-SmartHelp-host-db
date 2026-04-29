import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'uc_smarthelp',
  });

  try {
    console.log('\n=== CHECKING DATABASE ===\n');
    
    const connection = await pool.getConnection();
    
    // Get all tables
    console.log('--- TABLES IN DATABASE ---');
    const [tables] = await connection.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);
    tables.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
    
    // Check users table structure
    console.log('\n--- USERS TABLE STRUCTURE ---');
    const [userColumns] = await connection.query('DESCRIBE users');
    userColumns.forEach(col => console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : ''} ${col.Key ? `(${col.Key})` : ''}`));
    
    // Check users count
    console.log('\n--- USERS COUNT ---');
    const [[{ count }]] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`  Total users: ${count}`);
    
    // Show all users (without password for security)
    console.log('\n--- ALL USERS ---');
    const [users] = await connection.query('SELECT id, first_name, last_name, username, role, is_disabled FROM users');
    if (users.length === 0) {
      console.log('  ❌ NO USERS FOUND IN DATABASE');
    } else {
      users.forEach(u => {
        console.log(`  ID: ${u.id}, Username: ${u.username}, Name: ${u.first_name} ${u.last_name}, Role: ${u.role}, Disabled: ${u.is_disabled}`);
      });
    }

    connection.release();
    
    console.log('\n=== CHECK COMPLETE ===\n');
    
  } catch (error) {
    console.error('❌ DATABASE ERROR:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
