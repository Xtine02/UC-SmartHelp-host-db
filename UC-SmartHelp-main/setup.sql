-- Create the database
CREATE DATABASE IF NOT EXISTS uc_smarthelp;
USE uc_smarthelp;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255),
    role ENUM('student', 'staff', 'admin') DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_number VARCHAR(20) UNIQUE,
    user_id INT,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    department VARCHAR(50),
    status ENUM('pending', 'in_progress', 'resolved', 'reopened') DEFAULT 'pending',
    acknowledge_at TIMESTAMP NULL,
    closed_at TIMESTAMP NULL,
    reopen_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sample departments table
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

-- Insert sample departments
INSERT IGNORE INTO departments (id, name) VALUES 
(1, 'Registrar\'s Office'),
(2, 'Accounting Office'),
(3, 'Clinic'),
(4, 'CCS Office'),
(5, 'Cashier\'s Office'),
(6, 'SAO'),
(7, 'Scholarship');

-- Create chatbot_history table
CREATE TABLE IF NOT EXISTS chatbot_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    sender_type ENUM('student', 'ai') NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Add sender_type column if it doesn't exist (for existing tables)
ALTER TABLE chatbot_history ADD COLUMN IF NOT EXISTS sender_type ENUM('student', 'ai') NOT NULL DEFAULT 'student';

-- Drop response column if it exists
ALTER TABLE chatbot_history DROP COLUMN IF EXISTS response;
