const mysql = require('mysql2/promise');

const checkUsers = async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'uc_smarthelp'
  });

  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT id, email, first_name, last_name, role, department FROM users');
    console.log('\n=== EXISTING USERS IN DATABASE ===\n');
    rows.forEach(user => {
      console.log(`ID: ${user.id}`);
      console.log(`Email: ${user.email}`);
      console.log(`Name: ${user.first_name} ${user.last_name}`);
      console.log(`Role: ${user.role}`);
      console.log(`Department: ${user.department}\n`);
    });
    connection.release();
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
};

checkUsers();
