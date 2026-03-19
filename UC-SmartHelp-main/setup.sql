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
    department VARCHAR(100),
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
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Add sender_type column if it doesn't exist (for existing tables)
ALTER TABLE chatbot_history ADD COLUMN IF NOT EXISTS sender_type ENUM('student', 'ai') NOT NULL DEFAULT 'student';

-- Drop response column if it exists
ALTER TABLE chatbot_history DROP COLUMN IF EXISTS response;

-- Create audit trail table
CREATE TABLE IF NOT EXISTS audit_trail (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Add department column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Create ticket_response table
CREATE TABLE IF NOT EXISTS ticket_response (
    response_id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    sender_id INT NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'student',
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (sender_id) REFERENCES users(user_id)
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    is_helpful BOOLEAN NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create department_feedback table
CREATE TABLE IF NOT EXISTS department_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    user_id INT NOT NULL,
    department VARCHAR(100) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create website_feedback table
CREATE TABLE IF NOT EXISTS website_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    session_id VARCHAR(255),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    ease_of_use INT NOT NULL CHECK (ease_of_use >= 1 AND ease_of_use <= 5),
    design INT NOT NULL CHECK (design >= 1 AND design <= 5),
    speed INT NOT NULL CHECK (speed >= 1 AND speed <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
