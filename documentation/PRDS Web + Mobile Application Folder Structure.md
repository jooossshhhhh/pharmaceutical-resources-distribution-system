


prds/
│
├── prds-web/
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   └── logo.png
│   │
│   ├── src/
│   │
│   │   ├── assets/
│   │   │   ├── images/
│   │   │   ├── icons/
│   │   │   └── logos/
│   │   │
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Input.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── Table.jsx
│   │   │   │   └── Loading.jsx
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── Navbar.jsx
│   │   │       ├── Sidebar.jsx
│   │   │       ├── Header.jsx
│   │   │       ├── Footer.jsx
│   │   │       └── ProtectedRoute.jsx
│   │   │
│   │   ├── features/
│   │   │
│   │   │   ├── auth/
│   │   │   ├── dashboard/
│   │   │   ├── users/
│   │   │   ├── facilities/
│   │   │   ├── medicines/
│   │   │   ├── inventory/
│   │   │   ├── requests/
│   │   │   ├── transfers/
│   │   │   ├── patients/
│   │   │   ├── dispensing/
│   │   │   ├── programs/
│   │   │   ├── forecasting/
│   │   │   ├── notifications/
│   │   │   └── reports/
│   │   │
│   │   ├── hooks/
│   │   │
│   │   ├── context/
│   │   │
│   │   ├── services/
│   │   │   ├── supabase.js
│   │   │   ├── authService.js
│   │   │   └── apiService.js
│   │   │
│   │   ├── utils/
│   │   │
│   │   ├── constants/
│   │   │
│   │   ├── routes/
│   │   │
│   │   ├── styles/
│   │   │
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   │
│   ├── .env
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── README.md
│
│
├── prds-mobile/
│   │
│   ├── src/
│   │
│   │   ├── assets/
│   │   │   ├── images/
│   │   │   ├── icons/
│   │   │   └── logos/
│   │   │
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   └── shared/
│   │   │
│   │   ├── screens/
│   │   │
│   │   │   ├── Auth/
│   │   │   │   ├── LoginScreen.jsx
│   │   │   │   └── PhoneLoginScreen.jsx
│   │   │   │
│   │   │   ├── Dashboard/
│   │   │   │   └── DashboardScreen.jsx
│   │   │   │
│   │   │   ├── Inventory/
│   │   │   ├── Requests/
│   │   │   ├── Transfers/
│   │   │   ├── Patients/
│   │   │   ├── Dispensing/
│   │   │   ├── Notifications/
│   │   │   └── Profile/
│   │   │
│   │   ├── hooks/
│   │   │
│   │   ├── context/
│   │   │
│   │   ├── services/
│   │   │   ├── supabase.js
│   │   │   └── authService.js
│   │   │
│   │   ├── navigation/
│   │   │   ├── AppNavigator.jsx
│   │   │   └── AuthNavigator.jsx
│   │   │
│   │   ├── utils/
│   │   │
│   │   ├── constants/
│   │   │
│   │   └── App.jsx
│   │
│   ├── app.json
│   ├── package.json
│   └── README.md
│
│
├── database/
│   │
│   ├── schemas/
│   │   ├── profiles_schema.sql
│   │   ├── facilities_schema.sql
│   │   ├── medicines_schema.sql
│   │   ├── inventory_schema.sql
│   │   ├── medicine_requests_schema.sql
│   │   ├── stock_transfers_schema.sql
│   │   ├── patients_schema.sql
│   │   ├── dispensing_schema.sql
│   │   └── forecasting_schema.sql
│   │
│   ├── enums/
│   │   └── enum_creation_schema.sql
│   │
│   ├── views/
│   │   └── views_schema.sql
│   │
│   ├── helper-functions/
│   │   └── helper_functions_schema.sql
│   │
│   └── rls/
│       ├── profiles_rls.sql
│       ├── inventory_rls.sql
│       ├── requests_rls.sql
│       └── transfers_rls.sql
│
│
├── documentation/
│   │
│   ├── Database-Documentation.md
│   ├── System-Architecture.md
│   ├── API-Documentation.md
│   ├── Authentication-Guide.md
│   └── Capstone-Progress.md
│
│
├── .gitignore
├── README.md
└── LICENSE


**Development Order Recommendation**

Build in this order:

1. Authentication
2. Dashboard
3. Facilities
4. Medicines
5. Inventory
6. Requests
7. Transfers
8. Patients
9. Dispensing
10. Programs
11. Notifications
12. Forecasting
13. Reports



Build recommendation:

PRDS/
│
├── prds-web/      ← Build first
│
├── prds-mobile/   ← Build later
│
└── database/      ← SQL backup only
