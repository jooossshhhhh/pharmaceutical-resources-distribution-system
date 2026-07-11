alter table medicines
add constraint medicines_unique_definition
unique (
    generic_name,
    dosage,
    unit_of_measure
);