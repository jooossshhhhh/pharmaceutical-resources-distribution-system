create type user_role as enum (
    'PHARMA_II',
    'PHARMA_I',
    'BHW'
);

create type profile_status as enum (
    'PENDING',
    'ACTIVE',
    'DEACTIVATED'
);

create type facility_type as enum (
    'CHO',
    'HEALTH_CENTER'
);

create type facility_status as enum (
    'ACTIVE',
    'INACTIVE'
);

create type supplier_status as enum (
    'ACTIVE',
    'INACTIVE'
);

create type request_status as enum (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'COMPLETED'
);

create type transfer_status as enum (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'COMPLETED'
);

create type dispensing_type as enum (
    'WALK_IN',
    'PROGRAM',
    'REQUEST'
);

create type gender_type as enum (
    'MALE',
    'FEMALE'
);



create type notification_type as enum (
    'LOW_STOCK',
    'REQUEST_APPROVED',
    'REQUEST_REJECTED',
    'TRANSFER_APPROVED',
    'TRANSFER_COMPLETED',
    'ACCOUNT_APPROVED'
);
