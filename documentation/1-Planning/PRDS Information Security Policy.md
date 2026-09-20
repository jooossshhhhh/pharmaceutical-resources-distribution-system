# PRDS Information Security and Acceptable Use Policy

## Purpose

This policy defines the security rules for the Pharmaceutical Resources Distribution System (PRDS) of the City Health Office of Naga, Cebu. It protects medicine inventory records, patient records, user accounts, facility transactions, forecasting data, notifications, and activity logs from unauthorized access, misuse, loss, and alteration.

## Scope

This policy applies to all PRDS users, including PHARMA_II administrators, PHARMA_I pharmacy staff, Barangay Health Workers (BHW), developers, database maintainers, and any authorized personnel who access the PRDS desktop application (`prds-desktop`), web application (`prds-web`), local offline databases (`prds.db` / snapshot store), Supabase backend, PostgreSQL database, storage bucket, source code, or documentation.

## Policy Statements

1. PRDS users must access the system only through their own approved account. Account sharing, borrowed logins, and use of another user's session are prohibited.
2. New BHW and PHARMA_I registrations must remain in `PENDING` status until a PHARMA_II user reviews and approves the account. PHARMA_II access must be assigned only to active CHO administrative personnel.
3. Access must follow least privilege. BHW users may access only their assigned facility records. PHARMA_I users may access CHO operational records and barangay inventory, requests, transfers, reports, and forecasts. PHARMA_II users may manage users and system-wide administrative functions.
4. PostgreSQL Row Level Security, Supabase Auth, route guards, and SECURITY DEFINER RPC permission checks must remain enabled for protected PRDS data. UI hiding alone does not satisfy access control.
5. Patient records, phone numbers, email addresses, facility assignments, medicine dispensing history, and other personal or health-related data must be collected and used only for declared PRDS operations.
6. Users must protect passwords, OTP codes, Google sign-in access, phone sign-in access, and active browser sessions. Suspected credential exposure must be reported immediately.
7. Users must not export, email, upload, or store PRDS records in personal cloud drives, personal devices, unencrypted removable media, or public messaging channels unless CHO management authorizes the transfer and the data receives appropriate protection.
8. Inventory edits, medicine requests, stock transfers, dispensing, supplier updates, profile changes, and user management actions must create or preserve activity logs where the system supports logging.
9. Users must report suspected incidents immediately, including unauthorized access, incorrect facility access, missing stock records, exposed patient data, suspicious notifications, malware, lost devices, or accidental disclosure.
10. Developers and maintainers must keep Supabase service-role keys, database credentials, environment files, and production access tokens out of source control, screenshots, chat messages, and public documentation.
11. Security changes to RLS, RPC grants, authentication, profile approval, audit logging, or patient-data access must be reviewed before deployment because these controls enforce the PRDS role model.
12. Internal testing, vulnerability scanning, database inspection, and log review must have an authorized PRDS maintenance purpose. Unauthorized access, data alteration, interception, or destructive testing is prohibited.
13. On desktop installations (`prds-desktop`), local cache files, SQLite databases, and offline mutation queues must be maintained within the user's secure application profile. Workstations located in Barangay Health Stations must utilize Windows login passwords or screen locks to prevent unauthorized physical access to cached patient and inventory data.

## Responsibilities

**PHARMA_II administrators**

- Approve or reject user registrations and facility change requests.
- Assign roles, facility access, and account status according to job duties.
- Review activity logs, notifications, and incident reports.
- Keep at least one active PHARMA_II account assigned to CHO.

**PHARMA_I pharmacy staff**

- Manage CHO operational pharmacy work within assigned authority.
- Review requests, transfers, inventory, reports, and forecasts according to PRDS workflows.
- Report inaccurate records, suspicious access, or suspected data exposure.

**BHW users**

- Use PRDS only for their assigned facility.
- Protect patient records, requests, dispensing records, and transfer records.
- Confirm received medicines accurately and report stock or account issues promptly.

**Developers and database maintainers**

- Maintain RLS, authenticated-only grants, RPC permission checks, input validation, and audit logging.
- Limit production access to approved maintenance work.
- Protect environment variables, Supabase keys, backups, migration files, and deployment credentials.

**All users**

- Follow this policy, protect credentials, use PRDS data only for authorized health operations, and report security incidents without delay.

## Enforcement

Violations may result in account suspension, role reduction, facility reassignment, removal of PRDS access, administrative action by CHO management, and legal action when required. Incidents involving personal or sensitive personal information must be assessed under the Philippine Data Privacy Act of 2012. Reportable personal data breaches must follow National Privacy Commission notification requirements. Unauthorized access, interception, data interference, or system interference may fall under the Cybercrime Prevention Act of 2012.

## Review

CHO management and the PRDS maintainer must review this policy at least once per year and after major security incidents, role-model changes, Supabase configuration changes, or database access-control changes.

## Source Basis

- National Privacy Commission, Data Privacy Act and IRR, https://privacy.gov.ph/data-privacy-act/ and https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/; Department of Justice Office of Cybercrime, RA 10175, https://cybercrime.doj.gov.ph/republic-act-no-10175-cybercrime-prevention-act-of-2012/.
