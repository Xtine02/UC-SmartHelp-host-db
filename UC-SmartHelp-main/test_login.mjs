const testLogin = async (email, password) => {
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    console.log(`\nLogin test for ${email}:`);
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error testing login for ${email}:`, error.message);
  }
};

console.log('Testing login endpoints...');
await testLogin('admin@gmail.com', 'Admin123');
await testLogin('accounting@gmail.com', 'Accounting123');
await testLogin('scholarship@gmail.com', 'Scholarship123');
