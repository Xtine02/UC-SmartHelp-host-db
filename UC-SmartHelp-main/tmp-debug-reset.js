require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  try {
    const email = 'adolfo.christine@gmail.com';
    console.log('Requesting password reset for', email);
    const res = await fetch('http://localhost:3000/api/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    console.log('status', res.status);
    const data = await res.json();
    console.log('body', JSON.stringify(data));
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    const [tokens] = await conn.query(
      'SELECT pass_reset_id,user_id,token_hash,expires_at,used_at,created_at FROM password_reset_tokens WHERE user_id = ? ORDER BY pass_reset_id DESC LIMIT 5',
      [15]
    );
    console.log('tokens', tokens);
    await conn.end();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
