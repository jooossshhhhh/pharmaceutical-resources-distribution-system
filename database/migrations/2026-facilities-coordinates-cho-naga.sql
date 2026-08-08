-- Backfill coordinates for Central Health Office - City of Naga (CHO-NAGA)
-- Pin point: East Poblacion, Naga, Cebu (10.2098713, 123.7594282)

UPDATE facilities
SET latitude = 10.2098713,
    longitude = 123.7594282
WHERE facility_code = 'CHO-NAGA';
