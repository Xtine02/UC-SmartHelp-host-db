import mysql from 'mysql2/promise';

const checkUsers = async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'uc_smarthelp'
  });

  try {
    const connection = await pool.getConnection();
    
    // First show table structure
    console.log('\n=== TABLE STRUCTURE ===\n');
    const [columns] = await connection.execute('DESC users');
    columns.forEach(col => {
      console.log(`${col.Field}: ${col.Type}`);
    });
    
    // Then get users
    console.log('\n=== EXISTING USERS IN DATABASE ===\n');
    const [rows] = await connection.execute('SELECT * FROM users');
    rows.forEach((user, idx) => {
      console.log(`\nUser ${idx + 1}:`);
      Object.entries(user).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });
    
    connection.release();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
};

checkUsers();
