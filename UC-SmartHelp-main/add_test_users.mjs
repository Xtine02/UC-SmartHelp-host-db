import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

async function addTestUser() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME || 'uc_smarthelp',
  });

  try {
    const connection = await pool.getConnection();
    
    // Create test users with different roles
    const testUsers = [
      { firstName: 'John', lastName: 'Student', username: 'student1', password: 'password123', role: 'student' },
      { firstName: 'Admin', lastName: 'User', username: 'admin1', password: 'admin123', role: 'admin' },
      { firstName: 'Staff', lastName: 'Member', username: 'staff1', password: 'staff123', role: 'staff' },
    ];

    console.log('\n=== ADDING TEST USERS ===\n');

    for (const user of testUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      try {
        const [result] = await connection.query(
          'INSERT INTO users (first_name, last_name, username, password, role) VALUES (?, ?, ?, ?, ?)',
          [user.firstName, user.lastName, user.username, hashedPassword, user.role]
        );
        console.log(`✅ Created ${user.role}: ${user.username} (password: ${user.password})`);
      } catch (error) {
        console.log(`⚠️  ${user.username} already exists or error: ${error.message}`);
      }
    }

    // Show all users
    console.log('\n--- ALL USERS IN DATABASE ---');
    const [users] = await connection.query('SELECT id, first_name, last_name, username, role FROM users');
    users.forEach(u => {
      console.log(`  ID: ${u.id}, ${u.first_name} ${u.last_name} (@${u.username}) - Role: ${u.role}`);
    });

    connection.release();
    console.log('\n=== DONE ===\n');
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  } finally {
    await pool.end();
  }
}

addTestUser();
