/*
=====================================================
Facility Medicine Thresholds Table

Purpose:
Stores the facility-specific minimum safety stock /
reorder threshold policy for each medicine.

Business Rules:
1. Threshold belongs to a medicine at a facility.
2. A facility can have at most one threshold policy per medicine.
3. Threshold persists independently of lot lifecycles, ensuring
   reorder points are retained even when stock reaches 0.
4. Triggers automatically cascade threshold updates to all active
   inventory lot rows, and ensure new lot intakes inherit the policy.
=====================================================
*/

CREATE TABLE facility_medicine_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    facility_id UUID NOT NULL
        REFERENCES facilities(id)
        ON DELETE RESTRICT,

    medicine_id UUID NOT NULL
        REFERENCES medicines(id)
        ON DELETE RESTRICT,

    threshold INTEGER NOT NULL DEFAULT 0
        CHECK (threshold >= 0),

    is_custom BOOLEAN NOT NULL DEFAULT false,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_facility_medicine_threshold
        UNIQUE (facility_id, medicine_id)
);
