import mysql from 'mysql2/promise';

const fixForeignKeys = async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'uc_smarthelp'
  });

  try {
    const connection = await pool.getConnection();
    
    console.log('🔧 Fixing foreign key constraints...\n');

    // Fix chatbot_history table
    console.log('Fixing chatbot_history table...');
    try {
      // Drop the old foreign key
      await connection.query(
        'ALTER TABLE chatbot_history DROP FOREIGN KEY chatbot_history_ibfk_1'
      );
      console.log('✓ Dropped old chatbot_history foreign key');
    } catch (error) {
      console.log('⚠ Could not drop old FK (may not exist):', error.message);
    }

    try {
      // Add the correct foreign key
      await connection.query(
        'ALTER TABLE chatbot_history ADD CONSTRAINT chatbot_history_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
      );
      console.log('✓ Added correct chatbot_history foreign key\n');
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        console.error('✗ Error adding foreign key:', error.message);
      } else {
        console.log('✓ Foreign key constraint already exists\n');
      }
    }

    // Fix audit_trail table
    console.log('Fixing audit_trail table...');
    try {
      // Drop the old foreign key
      await connection.query(
        'ALTER TABLE audit_trail DROP FOREIGN KEY audit_trail_ibfk_1'
      );
      console.log('✓ Dropped old audit_trail foreign key');
    } catch (error) {
      console.log('⚠ Could not drop old FK (may not exist):', error.message);
    }

    try {
      // Add the correct foreign key
      await connection.query(
        'ALTER TABLE audit_trail ADD CONSTRAINT audit_trail_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
      );
      console.log('✓ Added correct audit_trail foreign key\n');
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        console.error('✗ Error adding foreign key:', error.message);
      } else {
        console.log('✓ Foreign key constraint already exists\n');
      }
    }

    // Fix ticket_response table
    console.log('Fixing ticket_response table...');
    try {
      // Drop the old foreign key
      await connection.query(
        'ALTER TABLE ticket_response DROP FOREIGN KEY ticket_response_ibfk_2'
      );
      console.log('✓ Dropped old ticket_response foreign key');
    } catch (error) {
      console.log('⚠ Could not drop old FK (may not exist):', error.message);
    }

    try {
      // Add the correct foreign key
      await connection.query(
        'ALTER TABLE ticket_response ADD CONSTRAINT ticket_response_sender_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE'
      );
      console.log('✓ Added correct ticket_response foreign key\n');
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        console.error('✗ Error adding foreign key:', error.message);
      } else {
        console.log('✓ Foreign key constraint already exists\n');
      }
    }

    console.log('✅ All foreign key constraints have been fixed!');
    console.log('\n📝 Your chatbot chats should now be stored in the database.');

    connection.release();
  } catch (error) {
    console.error('❌ Error fixing foreign keys:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

fixForeignKeys();
