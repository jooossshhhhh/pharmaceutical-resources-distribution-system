/*
=====================================================
MIGRATION: Facilities Coordinates

Purpose:
Adds geographic coordinates to the facilities table so
facility locations can be displayed on the dashboard and
forecasting maps, and picked via the location search in
the Facilities module.

Changes:
- Adds latitude numeric(10,7)
- Adds longitude numeric(10,7)
- Adds range CHECK constraints

Notes:
- No backfill: existing sample facility rows are left
  with NULL coordinates. Only facilities with a pin will
  appear on the map.
- New/edited facilities set coordinates through the
  location picker in the Facilities module form.
=====================================================
*/

alter table facilities
    add column latitude numeric(10,7),
    add column longitude numeric(10,7);

alter table facilities
    add constraint facilities_latitude_range_check
    check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table facilities
    add constraint facilities_longitude_range_check
    check (longitude is null or (longitude >= -180 and longitude <= 180));
