begin;

alter table public.medicines
  add column if not exists categories text[] not null default '{}';

comment on column public.medicines.categories is
  'CHO medicine category labels. A medicine can belong to more than one category.';

-- Reset every operational row tied to the retired mock medicine identifiers.
delete from public.patient_medicine_records;
delete from public.medicine_dispensing;
delete from public.medicine_request_fulfillments;
delete from public.medicine_request_items;
delete from public.medicine_requests;
delete from public.stock_transfer_fulfillments;
delete from public.stock_transfer_items;
delete from public.stock_transfers;
delete from public.forecasting;
delete from public.program_medicines;
delete from public.inventory;
delete from public.medicines;

delete from public.activity_logs
where module in (
  'Inventory',
  'Forecasting',
  'Dispensing',
  'Medicine Request',
  'Stock Transfer',
  'Medicines'
);

delete from public.notifications
where title ilike 'Request %'
   or title ilike '%Transfer%'
   or title ilike 'Dispensing %'
   or title ilike 'Low Stock%'
   or title ilike 'Seed Request%'
   or title ilike 'Seed Transfer%'
   or title ilike 'Seed Low Stock%';

-- Source: documentation/6-ClientData/ListOfMedicine.xlsx, Sheet1 H3:L202.
-- Workbook spellings and capitalization are preserved; surrounding whitespace is trimmed.
with source_rows(row_number, generic_name, dosage, unit_of_measure, category) as (
  values
    (3, 'Ketoconazole 2%', '15 g cream', 'tube', 'Topicals'),
    (4, 'Clotrimazole 1%', '20 g cream', 'tube', 'Topicals'),
    (5, 'Betamethasone 0.1%, cream', '5 g', 'tube', 'Topicals'),
    (6, 'Silver Sulfadiazine 1%', '25 g', 'tube', 'Topicals'),
    (7, 'Fusidic acid 2%', '15 g ointment', 'tube', 'Topicals'),
    (8, 'Mupirocin 2%', '5 g ointment', 'tube', 'Topicals'),
    (9, 'Potassium Citrate', '10 mEq', 'tablet', 'Gatro - Genitourinary Meds'),
    (10, 'Sambong', '500 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (11, 'Tamsulosin', '400 mcg', 'tablet', 'Gatro - Genitourinary Meds'),
    (12, 'Furosemide', '40 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (13, 'Spironolactone', '50 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (14, 'Finasteride', '5 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (15, 'Aluminum Hydroxide + Magnesium Hydroxide', '200mg +100 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (16, 'Aluminum Hydroxide + Magnesium Hydroxide', '225mg +200 mg /5 mL, 60 mL', 'bottle', 'Gatro - Genitourinary Meds'),
    (17, 'Dicycloverine', '10 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (18, 'Dicycloverine', '10 mg /5mL, 60 mL', 'bottle', 'Gatro - Genitourinary Meds'),
    (19, 'Hyoscine N-butylbromide', '10 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (20, 'Omeprazole', '20 mg', 'capsule', 'Gatro - Genitourinary Meds'),
    (21, 'Omeprazole', '40 mg', 'capsule', 'Gatro - Genitourinary Meds'),
    (22, 'Metoclopramide', '10 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (23, 'Metoclopramide', '5 mg/5 mL, 60 Ml', 'bottle', 'Gatro - Genitourinary Meds'),
    (24, 'Bisacodyl', '5 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (25, 'Sodium Bicarbonate', '650 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (26, 'Lactulose', '3.3g/5mL, 120 mL', 'bottle', 'Gatro - Genitourinary Meds'),
    (27, 'Ranitidine', '150 mg', 'tablet', 'Gatro - Genitourinary Meds'),
    (28, 'Celecoxib', '200 mg', 'capsule', 'Anti-Inflammatory & Symptom Relief Meds'),
    (29, 'Ibuprofen', '200 mg/5mL, 60 mL', 'bottle', 'Anti-Inflammatory & Symptom Relief Meds'),
    (30, 'Ibuprofen', '400 mg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (31, 'Paracetamol', '500 mg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (32, 'Paracetamol', '250 mg/5mL, 60 mL, suspension', 'bottle', 'Anti-Inflammatory & Symptom Relief Meds'),
    (33, 'Paracetamol', '100 mg/mL, 15 mL', 'bottle', 'Anti-Inflammatory & Symptom Relief Meds'),
    (34, 'Mefenamic acid', '500 mg', 'capsule', 'Anti-Inflammatory & Symptom Relief Meds'),
    (35, 'Mefenamic', '250 mg', 'capsule', 'Anti-Inflammatory & Symptom Relief Meds'),
    (36, 'Mefenamic', '50 mg/5mL, 60 mL', 'bottle', 'Anti-Inflammatory & Symptom Relief Meds'),
    (37, 'Allopurinol', '100 mg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (38, 'Allopurinol', '300 mg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (39, 'Colchicine', '500 mcg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (40, 'Hydroxycloroquine', '200 mg', 'tablet', 'Anti-Inflammatory & Symptom Relief Meds'),
    (41, 'Cetirizine', '10 mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (42, 'Cetirizine', '2.5 mg/mL 10 mL oral drops', 'bottle', 'Upper & Lower Respiratory Tract Meds'),
    (43, 'Cetirizine', '1mg/mL 60mL syrup', 'bottle', 'Upper & Lower Respiratory Tract Meds'),
    (44, 'Diphenhydramine', '25 mg', 'capsule', 'Upper & Lower Respiratory Tract Meds'),
    (45, 'Diphenhydramine', '50 mg', 'capsule', 'Upper & Lower Respiratory Tract Meds'),
    (46, 'Chlorphenamine maleate', '4mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (47, 'Chlorphenamine maleate', '2mg/5 mL, 60 mL', 'bottle', 'Upper & Lower Respiratory Tract Meds'),
    (48, 'Fluticasone + Salmeterol', '250 mcg + 25 mcg x120 doses MDI', 'inhaler', 'Upper & Lower Respiratory Tract Meds'),
    (49, 'Lagundi leaf', '300 mg/5mL, 120 mL', 'bottle', 'Upper & Lower Respiratory Tract Meds'),
    (50, 'Lagundi leaf', '300 mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (51, 'Budesonide', '250mcg/mL, 2mL respiratory solution', 'nebule', 'Upper & Lower Respiratory Tract Meds'),
    (52, 'Salbutamol', '100 mcg/dose x 200 doses MDI', 'inhaler', 'Upper & Lower Respiratory Tract Meds'),
    (53, 'Budesonide + formoterol', '160 mcg + 4.5 mcg, 120 doses MDI', 'inhaler', 'Upper & Lower Respiratory Tract Meds'),
    (54, 'Ipratropium + salbutamol', '500 mcg + 2.5 mg x 2.5 mL', 'nebule', 'Upper & Lower Respiratory Tract Meds'),
    (55, 'Salbutamol', '1 mg/mL, 2.5 mL', 'nebule', 'Upper & Lower Respiratory Tract Meds'),
    (56, 'Salbutamol', '2mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (57, 'Salbutamol', '2mg/5mL, 60 mL', 'bottle', 'Upper & Lower Respiratory Tract Meds'),
    (58, 'Dextromethorphan', '10 mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (59, 'Montelukast', '10 mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (60, 'Acetylcysteine', '200 mg', 'tablet', 'Upper & Lower Respiratory Tract Meds'),
    (61, 'Acetylcysteine', '600 mg', 'sachet', 'Upper & Lower Respiratory Tract Meds'),
    (62, 'Amoxicillin Trihydrate', '500 mg', 'capsule', 'Anti-Infectives'),
    (63, 'Amoxicillin', '250 mg', 'capsule', 'Anti-Infectives'),
    (64, 'Amoxicillin Trihydrate', '100 mg/1mL,10 mL', 'bottle', 'Anti-Infectives'),
    (65, 'Amoxicillin Trihydrate', '250 mg/5mL, 60 mL', 'bottle', 'Anti-Infectives'),
    (66, 'Cloxacilin', '250mg/5mL, 60 mL', 'bottle', 'Anti-Infectives'),
    (67, 'Cloxacillin', '500 mg', 'capsule', 'Anti-Infectives'),
    (68, 'Co-Amoxiclav', '200 mg + 28.5 mg / 5 mL, 70 mL', 'bottle', 'Anti-Infectives'),
    (69, 'Co-Amoxiclav', '400mg+57 mg/5mL, 70 mL suspension', 'bottle', 'Anti-Infectives'),
    (70, 'Co-Amoxiclav', '625mg', 'tablet', 'Anti-Infectives'),
    (71, 'Cefalexin monohydrate', '250 mg/5 mL, 60 mL', 'bottle', 'Anti-Infectives'),
    (72, 'Cefalexin', '100mg/mL 10 mL Oral drops', 'bottle', 'Anti-Infectives'),
    (73, 'Cefalexin monohydrate', '500 mg', 'capsule', 'Anti-Infectives'),
    (74, 'Cefuroxime', '250mg/ 5mL, 50 mL', 'bottle', 'Anti-Infectives'),
    (75, 'Cefuroxime', '500 mg', 'tablet', 'Anti-Infectives'),
    (76, 'Cefixime', '200 mg', 'tablet', 'Anti-Infectives'),
    (77, 'Cefixime', '100 mg/ 5mL, 60 mL', 'bottle', 'Anti-Infectives'),
    (78, 'Clindamycin', '300mg', 'capsule', 'Anti-Infectives'),
    (79, 'Azithromycin', '500 mg', 'tablet', 'Anti-Infectives'),
    (80, 'Azithromycin', '200 mg/5mL, 15 mL', 'bottle', 'Anti-Infectives'),
    (81, 'Clarithromycin', '250 mg/5mL, 50 mL', 'bottle', 'Anti-Infectives'),
    (82, 'Clarithromycin', '500 mg', 'tablet', 'Anti-Infectives'),
    (83, 'Erythromycin', '500 mg', 'tablet', 'Anti-Infectives'),
    (84, 'Levofloxacin', '500 mg', 'tablet', 'Anti-Infectives'),
    (85, 'Ciprofloxacin', '500 mg', 'tablet', 'Anti-Infectives'),
    (86, 'Cotrimoxazole (Sulfamethoxazole + Trimethoprim)', '800 mg + 160 mg (Forte)', 'tablet', 'Anti-Infectives'),
    (87, 'Metronidazole', '500 mg', 'tablet', 'Anti-Infectives'),
    (88, 'Metronidazole', '125 mg/5 mL, 60 mL oral suspension', 'bottle', 'Anti-Infectives'),
    (89, 'Doxycycline', '100 mg', 'capsule', 'Anti-Infectives'),
    (90, 'Aciclovir', '800 mg', 'tablet', 'Anti-Infectives'),
    (91, 'Aciclovir', '400 mg', 'tablet', 'Anti-Infectives'),
    (92, 'Ascorbic acid', '100mg/5 mL , 60 mL syrup', 'bottle', 'Nutritional Supplements'),
    (93, 'Ascorbic acid', '500 mg', 'tablet', 'Nutritional Supplements'),
    (94, 'Ascorbic', '100 mg/mL, 15 mL oral drops', 'bottle', 'Nutritional Supplements'),
    (95, 'Multivitamins', 'Standard formulation', 'capsule', 'Nutritional Supplements'),
    (96, 'Multivitamins', '60 mL syrup', 'bottle', 'Nutritional Supplements'),
    (97, 'Multivitamins', '15 mL oral drops', 'bottle', 'Nutritional Supplements'),
    (98, 'Vitamin B1 + Vitamin B6 + Vitamin B12', '100 mg + 5 mg + 50 mcg', 'tablet', 'Nutritional Supplements'),
    (99, 'Ferrous Sulfate + folic acid', '60 mg + 400 mcg', 'capsule', 'Nutritional Supplements'),
    (100, 'Folic acid', '5 mg', 'tablet', 'Nutritional Supplements'),
    (101, 'Zinc sufate', '27.5 mg/mL, 15 mL, oral drops', 'bottle', 'Nutritional Supplements'),
    (102, 'Zinc Sulfate', '55mg/5mL, 60 mL syrup', 'bottle', 'Nutritional Supplements'),
    (103, 'Calcium Carbonate + Cholecalciferol ( D3)', '600 mg + 400 IU', 'tablet', 'Nutritional Supplements'),
    (104, 'Potassium Chloride (Durules)', '750 mg (approx. 10 mEq)', 'tablet', 'Nutritional Supplements'),
    (105, 'Oral Rehydration Salts (ORS)', 'Oral powder packet', 'sachet', 'Nutritional Supplements'),
    (106, 'Gliclazide', '30 mg MR', 'tablet', 'Antidiabetics'),
    (107, 'Gliclazide', '60 mg', 'tablet', 'Antidiabetics'),
    (108, 'Gliclazide', '80 mg', 'tablet', 'Antidiabetics'),
    (109, 'Metformin Hydrochloride', '500 mg', 'tablet', 'Antidiabetics'),
    (110, 'Insulin Glargine', '100 IU/mL, 3 mL', 'vial', 'Antidiabetics'),
    (111, 'Insulin, Biphasic Isophane Human 70/30 (Recombinant DNA)', '100 IU/mL, 10 mL (70% isophane + 30% soluble)', 'vial', 'Antidiabetics'),
    (112, 'Dapagliflozin propan', '10 mg', 'tablet', 'Antidiabetics'),
    (113, 'Losartan', '50 mg', 'tablet', 'Cardiovascular Meds'),
    (114, 'Losartan', '100 mg', 'tablet', 'Cardiovascular Meds'),
    (115, 'Losartan + Hydrochlorothiazide (HCTZ)', '50 mg + 12.5 mg', 'tablet', 'Cardiovascular Meds'),
    (116, 'Irbesartan', '150 mg', 'tablet', 'Cardiovascular Meds'),
    (117, 'Irbesartan', '300 mg', 'tablet', 'Cardiovascular Meds'),
    (118, 'Amlodipine', '5 mg', 'tablet', 'Cardiovascular Meds'),
    (119, 'Amlodipine', '10 mg', 'tablet', 'Cardiovascular Meds'),
    (120, 'Metoprolol', '50 mg', 'tablet', 'Cardiovascular Meds'),
    (121, 'Metoprolol', '100 mg', 'tablet', 'Cardiovascular Meds'),
    (122, 'Carvedilol', '6.25 mg', 'tablet', 'Cardiovascular Meds'),
    (123, 'Carvedilol', '25 mg', 'tablet', 'Cardiovascular Meds'),
    (124, 'Trimetazidine', '35 mg', 'tablet', 'Cardiovascular Meds'),
    (125, 'Isosorbide Mononitrate (ISMN)', '60 mg', 'tablet', 'Cardiovascular Meds'),
    (126, 'Aspirin', '80 mg', 'tablet', 'Cardiovascular Meds'),
    (127, 'Clopidogrel', '75 mg', 'tablet', 'Cardiovascular Meds'),
    (128, 'Digoxin', '250 mcg', 'tablet', 'Cardiovascular Meds'),
    (129, 'Atenolol', '50 mg', 'tablet', 'Cardiovascular Meds'),
    (130, 'Atenolol', '100 mg', 'tablet', 'Cardiovascular Meds'),
    (131, 'Enalapril', '5 mg', 'tablet', 'Cardiovascular Meds'),
    (132, 'Telmisartan', '40 mg', 'tablet', 'Cardiovascular Meds'),
    (133, 'Telmisartan', '80 mg', 'tablet', 'Cardiovascular Meds'),
    (134, 'Clonidine', '150 mcg', 'tablet', 'Cardiovascular Meds'),
    (135, 'Captopril', '25 mg', 'tablet', 'Cardiovascular Meds'),
    (136, 'Clonidine', '75 mcg', 'tablet', 'Cardiovascular Meds'),
    (137, 'Methyldopa', '250 mg', 'capsule', 'Cardiovascular Meds'),
    (138, 'Nifedipine', '10 mg', 'capsule', 'Cardiovascular Meds'),
    (139, 'Rosuvastatin', '20mg', 'tablet', 'Dyslipidemic Agents'),
    (140, 'Rosuvastatin', '10mg', 'tablet', 'Dyslipidemic Agents'),
    (141, 'Simvastatin', '20 mg', 'tablet', 'Dyslipidemic Agents'),
    (142, 'Simvastatin', '40 mg', 'tablet', 'Dyslipidemic Agents'),
    (143, 'Atorvastatin', '40 mg', 'tablet', 'Dyslipidemic Agents'),
    (144, 'Atorvastatin', '20 mg', 'tablet', 'Dyslipidemic Agents'),
    (145, 'Atorvastatin', '80 mg', 'tablet', 'Dyslipidemic Agents'),
    (146, 'Fenofibrate', '160 mg', 'capsule', 'Dyslipidemic Agents'),
    (147, 'Betahistine', '24mg', 'tablet', 'Anti-Vertigo'),
    (148, 'Betahistine', '16mg', 'tablet', 'Anti-Vertigo'),
    (149, 'Propylthiouracil (PTU)', '50 mg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (150, 'Levothyroxine', '100 mcg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (151, 'Methimazole', '5 mg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (152, 'Propanolol', '10 mg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (153, 'Prednisone', '20 mg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (154, 'Tranexamic acid', '500 mg', 'tablet', 'Thyroid & Antithyroid Agents'),
    (155, 'Chlorpromazine', '100 mg', 'tablet', 'Mental Health Program'),
    (156, 'Risperidone', '2 mg', 'tablet', 'Mental Health Program'),
    (157, 'Levetiracetam', '500 mg', 'tablet', 'Mental Health Program'),
    (158, 'Biperiden Hydrochloride', '2 mg', 'tablet', 'Mental Health Program'),
    (159, 'Carbamazepine', '200 mg', 'tablet', 'Mental Health Program'),
    (160, 'Olanzapine', '10 mg', 'tablet', 'Mental Health Program'),
    (161, 'Divalproex Sodium (Sodium Valproate + Valproic Acid)', '500 mg', 'tablet', 'Mental Health Program'),
    (162, 'Valproic acid', '500 mg', 'tablet', 'Mental Health Program'),
    (163, 'Valproic Acid', '250 mg/5 mL, 120 mL Syrup Bottle', 'bottle', 'Mental Health Program'),
    (164, 'Memantine', '10 mg', 'tablet', 'Mental Health Program'),
    (165, 'Aripiprazole', '10 mg', 'tablet', 'Mental Health Program'),
    (166, 'Lithium Carbonate', '450 mg', 'tablet', 'Mental Health Program'),
    (167, 'Clozapine', '25 mg', 'tablet', 'Mental Health Program'),
    (168, 'Quitiapine', '100 mg', 'tablet', 'Mental Health Program'),
    (169, 'Levodopa + Carbidopa', '100 mg +25 mg', 'tablet', 'Mental Health Program'),
    (170, 'Escitalopram', '10 mg( as oxalate)', 'tablet', 'Mental Health Program'),
    (171, 'Paliperidone Palmitate', '100 mg/mL, 1 mL prolonged-release suspension', 'pre-filled syringe', 'Mental Health Program'),
    (172, 'Rabies Vaccine (Purified Chick Embryo Cell - PCEC)', 'Standard immunization dose', 'vial', 'Antirabies Vaccine'),
    (173, 'Equine Rabies Immunoglobulin (ERIG)', 'Standard dose', 'vial', 'Antirabies Vaccine'),
    (174, 'Tetanus Toxoid Vaccine', '0.5 mL', 'ampule', 'Antirabies Vaccine'),
    (175, 'Isoniazid + Rifampicin + Pyrazinamide + Ethambutol (4-FDC)', '75 mg + 150 mg + 400 mg + 275 mg (Intensive Phase)', 'tablet', 'TB Meds'),
    (176, 'Isoniazid + Rifampicin (2-FDC)', '75 mg + 150 mg (Maintenance Phase)', 'tablet', 'TB Meds'),
    (177, 'Rifampicin', '200 mg/5mL, 120 mL', 'bottle', 'TB Meds'),
    (178, 'Pyrazinamide', '250 mg/5mL 120 mL', 'bottle', 'TB Meds'),
    (179, 'Isoniazid', '200 mg/5ml, 120 mL', 'bottle', 'TB Meds'),
    (180, 'Ethambutol', '400 mg', 'tablet', 'TB Meds'),
    (181, 'Tuberculin Purified Protein Derivative (PPD)', '2 TU / 0.1 mL, 5 mL', 'vial', 'TB Meds'),
    (182, 'Vitamin B1 + Vitamin B6 + Vitamin B12', '100 mg + 5 mg + 50 mcg', 'tablet', 'TB Meds'),
    (183, 'Isoniazid', '300 mg', 'tablet', 'TB Meds'),
    (184, 'Pneumococcal Conjugate Vaccine (PCV)', 'Standard immunization dose', 'vial', 'Vaccines for NIP'),
    (185, 'Influenza Vaccine (Quadrivalent)', 'Standard seasonal dose', 'vial', 'Vaccines for NIP'),
    (186, 'Tetanus Toxoid Vaccine', '0.5 mL', 'ampule', 'Vaccines for NIP'),
    (187, 'Dolutegravir + Lamivudine + Tenofovir Disoproxil Fumarate (TLD)', '50 mg + 300 mg + 300 mg', 'bottle', 'HIV Program'),
    (188, 'Cefixime', '200 mg', 'tablet', 'HIV Program'),
    (189, 'Azithromycin', '500 mg', 'tablet', 'HIV Program'),
    (190, 'Doxycycline', '100 mg', 'capsule', 'HIV Program'),
    (191, 'Fluoconazole', '50 mg', 'tablet', 'HIV Program'),
    (192, 'Oral Rehydration Salts (ORS)', 'Oral powder packet', 'sachet', 'HIV Program'),
    (193, 'Multivitamins', 'Standard formulation', 'capsule', 'Nutrition'),
    (194, 'Ferrous Sulfate + folic acid', '60 mg + 400 mcg', 'capsule', 'Nutrition'),
    (195, 'Calcium Carbonate + Cholecalciferol ( D3)', '600 mg + 400 IU', 'tablet', 'Nutrition'),
    (196, 'Multivitamins', '120 mL syrup', 'bottle', 'Nutrition'),
    (197, 'Chlorella Growth Factor (CGF) + Taurine + Zinc + Multivitamins', '120 mL syrup', 'bottle', 'Nutrition'),
    (198, 'Micronutrient Powder (MNP)', 'Multi-vitamin/mineral powder sachet', 'sachet', 'Nutrition'),
    (199, 'Vitamin A (Retinol)', '200,000 IU', 'capsule', 'Nutrition'),
    (200, 'Albendazole', '400 mg chewable tablet', 'tablet', 'Nutrition'),
    (201, 'Levonorgestrel + Ethinylestradiol', '150 mcg + 30 mcg (28 tablets/cycle)', 'cycle', 'Family Planning'),
    (202, 'Medroxyprogesterone Acetate', '150 mg/mL, 1 mL suspension for injection', 'vial', 'Family Planning')
),
grouped_medicines as (
  select
    generic_name,
    dosage,
    unit_of_measure,
    array_agg(category order by row_number) as categories,
    min(row_number) as first_row
  from source_rows
  group by generic_name, dosage, unit_of_measure
)
insert into public.medicines (
  generic_name,
  brand_name,
  unit_of_measure,
  dosage,
  unit_cost,
  categories
)
select
  generic_name,
  null,
  unit_of_measure,
  dosage,
  null,
  categories
from grouped_medicines
order by first_row;

do $verify$
declare
  v_medicine_count integer;
  v_category_assignment_count integer;
  v_distinct_category_count integer;
begin
  select count(*) into v_medicine_count
  from public.medicines;

  select coalesce(sum(cardinality(categories)), 0)
  into v_category_assignment_count
  from public.medicines;

  select count(distinct category)
  into v_distinct_category_count
  from public.medicines
  cross join lateral unnest(categories) as category;

  if v_medicine_count <> 191 then
    raise exception 'CHO medicine import expected 191 medicines, found %.', v_medicine_count;
  end if;

  if v_category_assignment_count <> 200 then
    raise exception 'CHO medicine import expected 200 category assignments, found %.', v_category_assignment_count;
  end if;

  if v_distinct_category_count <> 18 then
    raise exception 'CHO medicine import expected 18 categories, found %.', v_distinct_category_count;
  end if;

  if exists (
    select 1
    from public.medicines
    where brand_name is not null
       or unit_cost is not null
       or cardinality(categories) = 0
  ) then
    raise exception 'CHO medicine import contains unexpected brand, unit cost, or empty category data.';
  end if;

  if exists (
    select 1
    from (
      select count(*) as row_count from public.inventory
      union all select count(*) from public.forecasting
      union all select count(*) from public.medicine_dispensing
      union all select count(*) from public.patient_medicine_records
      union all select count(*) from public.medicine_requests
      union all select count(*) from public.medicine_request_items
      union all select count(*) from public.medicine_request_fulfillments
      union all select count(*) from public.stock_transfers
      union all select count(*) from public.stock_transfer_items
      union all select count(*) from public.stock_transfer_fulfillments
      union all select count(*) from public.program_medicines
    ) as reset_counts
    where row_count <> 0
  ) then
    raise exception 'CHO medicine reset left connected operational rows behind.';
  end if;
end
$verify$;

commit;