# PRDS Database Backup

This folder contains the complete database structure and backup scripts for the Pharmaceutical Resource Distribution System (PRDS).

## Database Provider

* Supabase PostgreSQL

## Authentication Providers

* Supabase Auth (Phone OTP)
* Supabase Auth (Google Sign-In)
* Supabase Auth (Email Authentication)


## Folder Structure

### enums/

Contains PostgreSQL ENUM definitions used throughout the system.

Examples:

* user_role
* request_status
* transfer_status
* notification_type


### schema/

Contains all database table creation scripts.

Examples:

* profiles
* facilities
* medicines
* suppliers
* inventory
* patients
* medicine requests
* stock transfers
* dispensing records
* notifications
* forecasting


### helper-functions/

Contains PostgreSQL helper functions used by the database.

Examples:

* activity logging
* inventory calculations
* forecasting utilities
* notification helpers
* Supabase Auth user profile creation trigger

### indexes/

Contains database indexes used for performance optimization.

Examples:

* medicine indexes
* inventory indexes
* request indexes

### views/

Contains database views used for reporting and dashboards.

Examples:

* inventory summary
* forecasting reports
* request tracking reports


### rls/

Contains Row Level Security (RLS) policies.

Examples:

* inventory access control
* request access control
* notification access control
* transfer access control


## Database Creation Order

1. enums
2. schema
3. helper-functions
4. indexes
5. views
6. rls


## Project

PRDS (Pharmaceutical Resource Distribution System)

Capstone Project

Technology Stack:

Frontend:

* React.js + Vite
* Tailwind CSS

Backend:

* Supabase PostgreSQL

Authentication:

* Supabase Auth

Future Mobile Application:

* React Native


