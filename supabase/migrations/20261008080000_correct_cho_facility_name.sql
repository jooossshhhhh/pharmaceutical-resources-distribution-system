-- Correct City Health Office facility name from 'Central Health Office' to 'City Health Office'
-- Target: City Health Office - City of Naga (CHO-NAGA)

UPDATE public.facilities
SET facility_name = 'City Health Office - City of Naga'
WHERE facility_code = 'CHO-NAGA';
