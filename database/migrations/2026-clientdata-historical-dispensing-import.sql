/*
  ClientData historical dispensing import
  Sources: documentation/6-ClientData/Dispensing.xlsx and RequestIssuanceSlip.xlsx
  History-only rows: no inventory deduction and excluded from forecasting summaries.
*/
begin;

create temp table _clientdata_source_rows (
  batch text not null,
  line_no integer not null,
  source_description text not null,
  source_unit text not null,
  quantity integer not null check (quantity > 0)
) on commit drop;

insert into _clientdata_source_rows (batch, line_no, source_description, source_unit, quantity)
values
('JULY', 1, 'Acetylcysteine 200 mg', 'TABLET', 110),
('JULY', 2, 'Acetylcysteine 600 mg', 'TABLET', 995),
('JULY', 3, 'Aciclovir 400 mg', 'TABLET', 145),
('JULY', 4, 'Aciclovir 800 mg', 'TABLET', 605),
('JULY', 5, 'Allopurinol 100 mg', 'TABLET', 1420),
('JULY', 6, 'ALLOPURINOL 300 MG', 'TABLET', 2150),
('JULY', 7, 'Aluminum Hydroxide + Magnesium Hydroxide 200 mg + 100 mg', 'TABLET', 1631),
('JULY', 8, 'Amlodipine 10 mg', 'TABLET', 67723),
('JULY', 9, 'Amlodipine 5 mg', 'TABLET', 40909),
('JULY', 10, 'Amoxicillin 100 mg/mL, 10 mL', 'BOTTLE', 146),
('JULY', 11, 'Amoxicillin 250 mg', 'CAPSULE', 100),
('JULY', 12, 'Amoxicillin 250 mg/5mL, 60mL', 'BOTTLE', 195),
('JULY', 13, 'AMOXICILLIN TRIHYDRATE 100 MG/ML, 10 ML', 'BOTTLE', 36),
('JULY', 14, 'AMOXICILLIN TRIHYDRATE 500 MG', 'CAPSULE', 1996),
('JULY', 15, 'ARIPIPRAZOLE 10 MG', 'TABLET', 270),
('JULY', 16, 'Ascorbic 100mg/ml syrup 60mL', 'BOTTLE', 365),
('JULY', 17, 'Ascorbic acid 500 mg', 'TABLET', 6300),
('JULY', 18, 'Aspirin 80 mg', 'TABLET', 8616),
('JULY', 19, 'Atenolol 100mg', 'TABLET', 1254),
('JULY', 20, 'Atenolol 50 mg', 'TABLET', 460),
('JULY', 21, 'Atorvastatin 20 mg', 'TABLET', 12774),
('JULY', 22, 'Atorvastatin 40 mg', 'TABLET', 11857),
('JULY', 23, 'Azithromycin 200 mg/5mL, 15 mL', 'BOTTLE', 15),
('JULY', 24, 'AZITHROMYCIN 500 MG', 'TABLET', 1024),
('JULY', 25, 'Azithromycin 500 mg', 'TABLET', 930),
('JULY', 26, 'Betahistine 16 mg', 'TABLET', 776),
('JULY', 27, 'Betahistine 24 mg', 'TABLET', 347),
('JULY', 28, 'Betamethasone 0.1% 5 g cream', 'TUBE', 37),
('JULY', 29, 'Bisacodyl 5 mg', 'TABLET', 102),
('JULY', 30, 'Budesonide 250mcg/mL, 2 mL respiratory solution', 'NEBULE', 84),
('JULY', 31, 'Calcium Carbonate + Cholecalciferol ( D3) 600 mg + 400 IU', 'TABLET', 10300),
('JULY', 32, 'CAPTOPRIL 25 MG', 'TABLET', 36),
('JULY', 33, 'Carvedilol 25 mg', 'TABLET', 825),
('JULY', 34, 'Carvedilol 6.25', 'TABLET', 4530),
('JULY', 35, 'Cefalexin  monohydrate 250mg/5ml, 60ml', 'BOTTLE', 255),
('JULY', 36, 'Cefixime 200 mg', 'TABLET', 470),
('JULY', 37, 'Cefuroxime 250 mg/5mL, 50 mL', 'BOTTLE', 106),
('JULY', 38, 'CEFUROXIME 500 MG', 'TABLET', 4242),
('JULY', 39, 'Celecoxib 200 mg', 'TABLET', 5272),
('JULY', 40, 'Cetirizine 1 mg/mL, 60 mL syrup', 'TABLET', 352),
('JULY', 41, 'Cetirizine 10 mg', 'TABLET', 3869),
('JULY', 42, 'Cetirizine 2.5 mg/mL, 10 ml oral drops', 'BOTTLE', 225),
('JULY', 43, 'CHLORPHENAMINE MALEATE 2 MG/5ML, 60 ML', 'BOTTLE', 573),
('JULY', 44, 'Chlorphenamine maleate 4 mg', 'TABLET', 4918),
('JULY', 45, 'CHLORPROMAZINE 100 MG', 'TABLET', 3070),
('JULY', 46, 'CIPROFLOXACIN 500 MG', 'TABLET', 6413),
('JULY', 47, 'Clarithromycin  250 mg/5mL, 60 mL', 'BOTTLE', 12),
('JULY', 48, 'Clarithromycin  500 mg', 'TABLET', 116),
('JULY', 49, 'Clindamycin', 'CAPSULE', 1410),
('JULY', 50, 'Clonidine 150 mcg', 'TABLET', 770),
('JULY', 51, 'Clonidine 75 mcg', 'TABLET', 2375),
('JULY', 52, 'Clopidogrel 75 mg', 'TABLET', 12855),
('JULY', 53, 'Cloxacilin 250mg/5mL, 60 mL', 'BOTTLE', 6),
('JULY', 54, 'Cloxacillin 500 mg', 'CAPSULE', 1458),
('JULY', 55, 'Clozapine 25 mg', 'TABLET', 60),
('JULY', 56, 'Co-amoxiclav 200 mg + 28.5 mg/mL, 70 mL/ Amoxicillin+ Clavulanic acid 200mg+28.5mg/5ml, 70ml', 'BOTTLE', 133),
('JULY', 57, 'Co-amoxiclav 400 mg + 57 mg/mL, 70 mL/ Amoxicillin+ Clavulanic acid 400mg+57mg/5ml, 70ml', 'BOTTLE', 466),
('JULY', 58, 'Co-amoxiclav 625 mg', 'TABLET', 10541),
('JULY', 59, 'Colchicine 500 mcg', 'TABLET', 371),
('JULY', 60, 'Dextromethorphan 10 mg', 'TABLET', 301),
('JULY', 61, 'DICLOFENAC 50 MG', 'TABLET', 240),
('JULY', 62, 'DICYCLOVERINE 10 MG', 'TABLET', 160),
('JULY', 63, 'DICYCLOVERINE 10 MG /5ML, 60 ML', 'BOTTLE', 10),
('JULY', 64, 'Digoxin 250 mcg', 'TABLET', 641),
('JULY', 65, 'DIPHENHYDRAMINE 50 MG', 'TABLET', 122),
('JULY', 66, 'Divalproex Sodium ( Sodium Valproate + Valproaic acid) 500 mg', 'TABLET', 350),
('JULY', 67, 'DONEPEZIL 10MG', 'TABLET', 320),
('JULY', 68, 'DOXYCYCLINE 100 MG', 'CAPSULE', 914),
('JULY', 69, 'Enalapril 5 mg', 'TABLET', 447),
('JULY', 70, 'Erythromycin 500 mg', 'TABLET', 219),
('JULY', 71, 'ESCITALOPRAM 10 MG ( AS OXALATE)', 'TABLET', 388),
('JULY', 72, 'Ferrous + Folic acid 60 mg + folic acid 60 mg + 400 mcg', 'CAPSULE', 177096),
('JULY', 73, 'Finasteride 5 mg', 'TABLET', 4137),
('JULY', 74, 'Finofibrate 160 mg', 'TABLET', 2427),
('JULY', 75, 'Fluphenazine 25 mg/mL ( as decanoate), 1 mL', 'AMPULE', 41),
('JULY', 76, 'Fluticasone + salmeterol 250 mcg + 25 mcg x 120 doses MDI', 'INHALER', 65),
('JULY', 77, 'Folic acid 5 mg', 'TABLET', 1587),
('JULY', 78, 'Furosemide 40 mg', 'TABLET', 196),
('JULY', 79, 'FUSIDIC ACID 2%, 10 G OINTMENT', 'TUBE', 25),
('JULY', 80, 'Gliclazide 30 mg', 'TABLET', 3550),
('JULY', 81, 'Gliclazide 60 mg', 'TABLET', 2057),
('JULY', 82, 'Gliclazide 80 mg', 'TABLET', 7560),
('JULY', 83, 'Hydroxychloroquine 200mg', 'TABLET', 200),
('JULY', 84, 'Hyoscine N-Butylbromide 10 mg', 'TABLET', 1275),
('JULY', 85, 'Ibuprofen 200 mg/5mL, 60 mL', 'BOTTLE', 41),
('JULY', 86, 'Ibuprofen 400 mg', 'TABLET', 78),
('JULY', 87, 'Insulin Biphasic Isophane Human 70/30 ( Recombinant DNA ) 70 % isopahne suspension + 30 % soluble insulin in 100 IU, 10 mL', 'VIAL', 73),
('JULY', 88, 'Insulin Glargine 100 IU/ mL, 3 mL', 'VIAL', 6),
('JULY', 89, 'Irbesartan 150 mg', 'TABLET', 550),
('JULY', 90, 'Irbesartan 300 mg', 'TABLET', 1285),
('JULY', 91, 'Isosorbide mononitrate 60 mg( scored tablet)', 'TABLET', 730),
('JULY', 92, 'Ketoconazole 2%, 15 g cream', 'TABLET', 22),
('JULY', 93, 'Lactulose 3.33 g/5mL, 120 mL', 'BOTTLE', 59),
('JULY', 94, 'Lagundi 300 mg', 'TABLET', 2374),
('JULY', 95, 'Lagundi leaf 300 mg/5mL, 120 mL', 'BOTTLE', 398),
('JULY', 96, 'Levetiracetam 500 mg', 'TABLET', 136),
('JULY', 97, 'Levodopa + Carbidopa 100 mg + 25 mg', 'TABLET', 120),
('JULY', 98, 'Levofloxacin 500 mg', 'TABLET', 98),
('JULY', 99, 'Levothyroxine 100 mcg', 'TABLET', 59),
('JULY', 100, 'Losartan 100 g', 'TABLET', 46886),
('JULY', 101, 'Losartan 100 mg + HCTZ 12.5 mg', 'TABLET', 10),
('JULY', 102, 'Losartan 50 mg', 'TABLET', 17900),
('JULY', 103, 'LOSARTAN 50 MG', 'TABLET', 11663),
('JULY', 104, 'Losartan 50 mg', 'TABLET', 64920),
('JULY', 105, 'Losartan 50 mg', 'TABLET', 4460),
('JULY', 106, 'Losartan 50 mg + HCTZ 12.5 mg', 'TABLET', 1270),
('JULY', 107, 'MEFENAMIC 250 MG', 'TABLET', 377),
('JULY', 108, 'Mefenamic acid 50 mg/5mL, 60 mL', 'BOTTLE', 66),
('JULY', 109, 'Mefenamic acid 500 mg', 'TABLET', 4864),
('JULY', 110, 'Metformin Hydrochloride 500 mg', 'TABLET', 29895),
('JULY', 111, 'Methimazole 5 mg', 'TABLET', 30),
('JULY', 112, 'Methyldopa 250mg', 'TABLET', 1601),
('JULY', 113, 'Metochlopramide 10 mg', 'TABLET', 405),
('JULY', 114, 'Metochlopramide 5 mg/5mL  60 mL', 'BOTTLE', 3),
('JULY', 115, 'Metoprolol 100 mg', 'TABLET', 970),
('JULY', 116, 'Metoprolol 50 mg', 'TABLET', 2629),
('JULY', 117, 'Metronidazole 125 mg/5mL, 60 mL', 'BOTTLE', 44),
('JULY', 118, 'Metronidazole 500 mg', 'TABLET', 1203),
('JULY', 119, 'Montelukast 10 mg', 'TABLET', 154),
('JULY', 120, 'Multivitamins', 'TABLET', 10500),
('JULY', 121, 'Multivitamins 15 mg oral drops', 'BOTTLE', 34),
('JULY', 122, 'Multivitamins 60 mL', 'TABLET', 414),
('JULY', 123, 'Nifedipine 10 mg', 'TABLET', 300),
('JULY', 124, 'Olanzapine 10 mg', 'TABLET', 2599),
('JULY', 125, 'OMEPRAZOLE 20 MG', 'TABLET', 512),
('JULY', 126, 'Omeprazole 40 mg', 'TABLET', 6262),
('JULY', 127, 'ORAL REHYDRATION SALT ( ORS 75-REPLACEMENT) 5.575 G', 'SACHET', 928),
('JULY', 128, 'PARACETAMOL 100 MG/ML, 15 ML', 'BOTTLE', 323),
('JULY', 129, 'Paracetamol 250 mg/5mL, 60 mL', 'BOTTLE', 342),
('JULY', 130, 'Potassium Chloride', 'TABLET', 365),
('JULY', 131, 'Potassium Citrate 10 mEq', 'TABLET', 2845),
('JULY', 132, 'Prednisone 20 mg', 'TABLET', 167),
('JULY', 133, 'PROPANOLOL 10 MG', 'TABLET', 70),
('JULY', 134, 'Risperidone 2 mg', 'TABLET', 2340),
('JULY', 135, 'Rosuvastatin 10 mg', 'TABLET', 2640),
('JULY', 136, 'Rosuvastatin 20 mg', 'TABLET', 10200),
('JULY', 137, 'Salbutamol 1 mg/mL, 2.5 mL', 'INHALER', 705),
('JULY', 138, 'Salbutamol 100 mcg/dose x 200 doses MDI', 'TABLET', 30),
('JULY', 139, 'Salbutamol 2 mg', 'TABLET', 678),
('JULY', 140, 'SALBUTAMOL 2 MG/5 ML, 60 ML', 'TABLET', 132),
('JULY', 141, 'Sambong 500 mg', 'TABLET', 7641),
('JULY', 142, 'Silver Sulfadiazine 1%, 25 g', 'TUBE', 48),
('JULY', 143, 'SIMVASTATIN 20 MG', 'TABLET', 3280),
('JULY', 144, 'SIMVASTATIN 40 MG', 'TABLET', 1111),
('JULY', 145, 'Sodium Bicarbonate 650 mg', 'TABLET', 4410),
('JULY', 146, 'Spironolactone 50 mg', 'TABLET', 170),
('JULY', 147, 'Tamsolusin 400 mcg', 'TABLET', 10817),
('JULY', 148, 'Telmisartan 80 mg', 'TABLET', 1890),
('JULY', 149, 'TOBRAMYCIN  0.3 %, 5ML', 'BOTTLE', 2),
('JULY', 150, 'TOBRAMYCIN + DEXAMETHASONE  EYE                 DROPS 0.3 %  + 0.1 %, 5 ML', 'BOTTLE', 16),
('JULY', 151, 'Trimetazidine 35 mg', 'TABLET', 4365),
('JULY', 152, 'Valproic acid 250 mg/5mL, 120 mL', 'BOTTLE', 2),
('JULY', 153, 'Vitamin A ( 200,000 IU)', 'SOFTGEL CAPSULE', 475),
('JULY', 154, 'Vitamin B1 + Vitamin B6 + Vitamin B12 , 100 mg + 5 mg + 50 mcg', 'TABLET', 7500),
('JULY', 155, 'Zinc Sulfate 55 mg/5mL, 60 mL syrup', 'BOTTLE', 165),
('AUG_CHO', 1, 'Losartan 50 mg', 'TABLET', 120),
('AUG_CHO', 2, 'CO-AMOXICLAV 625 MG ( AMOXICILLIN 500 MG + POTASSIUM CLAVULANATE 125 MG)', 'TABLET', 63),
('AUG_CHO', 3, 'VALPROIC ACID 500MG', 'TABLET', 60),
('AUG_CHO', 4, 'ASCORBIC ACID 500 MG', 'TABLET', 40),
('AUG_CHO', 5, 'AMLODIPINE 10 MG', 'TABLET', 30),
('AUG_CHO', 6, 'ATORVASTATIN 20MG', 'TABLET', 30),
('AUG_CHO', 7, 'LOSARTAN 100 MG', 'TABLET', 30),
('AUG_CHO', 8, 'TELMISARTAN 40MG', 'TABLET', 30),
('AUG_CHO', 9, 'VITAMIN B COMPLEX', 'TABLET', 30),
('AUG_CHO', 10, 'HYOSCINE N BUTYLBROMIDE 10 MG', 'TABLET', 22),
('AUG_CHO', 11, 'CLINDAMYCIN 300 MG', 'CAPSULE', 21),
('AUG_CHO', 12, 'Celecoxib 200 mg', 'CAPSULE', 20),
('AUG_CHO', 13, 'Digoxin 250 mcg', 'TABLET', 20),
('AUG_CHO', 14, 'LAGUNDI 300 MG', 'TABLET', 20),
('AUG_CHO', 15, 'TRIMETAZIDINE 35 MG HYDROCHLORIDE', 'TABLET', 20),
('AUG_CHO', 16, 'ALUMINUM HYDROXIDE + MAGNESIUM HYDROXIDE 200 MG + 100 MG', 'TABLET', 18),
('AUG_CHO', 17, 'Omeprazole 40 mg', 'CAPSULE', 17),
('AUG_CHO', 18, 'Cefuroxime 500 mg', 'TABLET', 14),
('AUG_CHO', 19, 'CELECOXIB 200 MG', 'CAPSULE', 10),
('AUG_CHO', 20, 'Enalapril 5 mg', 'TABLET', 10),
('AUG_CHO', 21, 'CO-AMOXICLAV (AMOXICILLIN 400 MG + POTASSIUM CLAVULANATE 57 MG/5ML, 70 ML)', 'BOTTLE', 5),
('AUG_CHO', 22, 'FUROSEMIDE 40 MG', 'TABLET', 4),
('AUG_CHO', 23, 'Valproic acid 250 mg/5mL, 100 mL', 'BOTTLE', 4),
('AUG_CHO', 24, 'Lagundi leaf 300 mg', 'TABLET', 3),
('AUG_CHO', 25, 'PARACETAMOL 250 MG/5ML, 60 ML SUSPENSION', 'BOTTLE', 3),
('AUG_CHO', 26, 'Aluminum Hydroxide + Magnesium Hydroxide 225 mg + 200 mg / 5mL, 60 mL', 'BOTTLE', 2),
('AUG_CHO', 27, 'Aluminum Hydroxide + Magnesium Hydroxide 225 mg + 200 mg / 5mL, 60 mL', 'BOTTLE', 2),
('AUG_CHO', 28, 'CLONIDIN 75MG', 'TABLET', 2),
('AUG_CHO', 29, 'Azithromycin 500 mg', 'TABLET', 1),
('AUG_CHO', 30, 'CETIRIZINE 5 MG/5ML, 60 ML', 'BOTTLE', 1),
('AUG_CHO', 31, 'Zinc Sulfate 55mg/5mL, 60 mL syrup', 'BOTTLE', 1),
('AUG_COLON', 1, 'Losartan 50 mg', 'TABLET', 120),
('AUG_COLON', 2, 'CO-AMOXICLAV 625 MG ( AMOXICILLIN 500 MG + POTASSIUM CLAVULANATE 125 MG)', 'TABLET', 63),
('AUG_COLON', 3, 'VALPROIC ACID 500MG', 'TABLET', 60),
('AUG_COLON', 4, 'ASCORBIC ACID 500 MG', 'TABLET', 40),
('AUG_COLON', 5, 'AMLODIPINE 10 MG', 'TABLET', 30),
('AUG_COLON', 6, 'ATORVASTATIN 20MG', 'TABLET', 30),
('AUG_COLON', 7, 'LOSARTAN 100 MG', 'TABLET', 30),
('AUG_COLON', 8, 'TELMISARTAN 40MG', 'TABLET', 30);

create temp table _clientdata_aliases (
  source_description text primary key,
  generic_name text not null,
  dosage text not null,
  unit_of_measure text not null
) on commit drop;

insert into _clientdata_aliases values
('Acetylcysteine 600 mg','Acetylcysteine','600 mg','sachet'),
('Amoxicillin 100 mg/mL, 10 mL','Amoxicillin Trihydrate','100 mg/1mL,10 mL','bottle'),
('Amoxicillin 250 mg/5mL, 60mL','Amoxicillin Trihydrate','250 mg/5mL, 60 mL','bottle'),
('AMOXICILLIN TRIHYDRATE 100 MG/ML, 10 ML','Amoxicillin Trihydrate','100 mg/1mL,10 mL','bottle'),
('AMOXICILLIN TRIHYDRATE 500 MG','Amoxicillin Trihydrate','500 mg','capsule'),
('Ascorbic 100mg/ml syrup 60mL','Ascorbic acid','100mg/5 mL , 60 mL syrup','bottle'),
('Betamethasone 0.1% 5 g cream','Betamethasone 0.1%, cream','5 g','tube'),
('Carvedilol 6.25','Carvedilol','6.25 mg','tablet'),
('Cetirizine 1 mg/mL, 60 mL syrup','Cetirizine','1mg/mL 60mL syrup','bottle'),
('CHLORPHENAMINE MALEATE 2 MG/5ML, 60 ML','Chlorphenamine maleate','2mg/5 mL, 60 mL','bottle'),
('Clarithromycin  250 mg/5mL, 60 mL','Clarithromycin','250 mg/5mL, 50 mL','bottle'),
('Clindamycin','Clindamycin','300mg','capsule'),
('Co-amoxiclav 200 mg + 28.5 mg/mL, 70 mL/ Amoxicillin+ Clavulanic acid 200mg+28.5mg/5ml, 70ml','Co-Amoxiclav','200 mg + 28.5 mg / 5 mL, 70 mL','bottle'),
('Co-amoxiclav 400 mg + 57 mg/mL, 70 mL/ Amoxicillin+ Clavulanic acid 400mg+57mg/5ml, 70ml','Co-Amoxiclav','400mg+57 mg/5mL, 70 mL suspension','bottle'),
('Co-amoxiclav 625 mg','Co-Amoxiclav','625mg','tablet'),
('DIPHENHYDRAMINE 50 MG','Diphenhydramine','50 mg','capsule'),
('Divalproex Sodium ( Sodium Valproate + Valproaic acid) 500 mg','Divalproex Sodium (Sodium Valproate + Valproic Acid)','500 mg','tablet'),
('Ferrous + Folic acid 60 mg + folic acid 60 mg + 400 mcg','Ferrous Sulfate + folic acid','60 mg + 400 mcg','capsule'),
('Finofibrate 160 mg','Fenofibrate','160 mg','capsule'),
('Gliclazide 30 mg','Gliclazide','30 mg MR','tablet'),
('Hydroxychloroquine 200mg','Hydroxycloroquine','200 mg','tablet'),
('Insulin Biphasic Isophane Human 70/30 ( Recombinant DNA ) 70 % isopahne suspension + 30 % soluble insulin in 100 IU, 10 mL','Insulin, Biphasic Isophane Human 70/30 (Recombinant DNA)','100 IU/mL, 10 mL (70% isophane + 30% soluble)','vial'),
('Isosorbide mononitrate 60 mg( scored tablet)','Isosorbide Mononitrate (ISMN)','60 mg','tablet'),
('Lactulose 3.33 g/5mL, 120 mL','Lactulose','3.3g/5mL, 120 mL','bottle'),
('Lagundi 300 mg','Lagundi leaf','300 mg','tablet'),
('Losartan 100 g','Losartan','100 mg','tablet'),
('Losartan 50 mg + HCTZ 12.5 mg','Losartan + Hydrochlorothiazide (HCTZ)','50 mg + 12.5 mg','tablet'),
('Mefenamic acid 50 mg/5mL, 60 mL','Mefenamic','50 mg/5mL, 60 mL','bottle'),
('Metochlopramide 10 mg','Metoclopramide','10 mg','tablet'),
('Metochlopramide 5 mg/5mL  60 mL','Metoclopramide','5 mg/5 mL, 60 Ml','bottle'),
('Metronidazole 125 mg/5mL, 60 mL','Metronidazole','125 mg/5 mL, 60 mL oral suspension','bottle'),
('Multivitamins 15 mg oral drops','Multivitamins','15 mL oral drops','bottle'),
('Multivitamins 60 mL','Multivitamins','60 mL syrup','bottle'),
('OMEPRAZOLE 20 MG','Omeprazole','20 mg','capsule'),
('Omeprazole 40 mg','Omeprazole','40 mg','capsule'),
('ORAL REHYDRATION SALT ( ORS 75-REPLACEMENT) 5.575 G','Oral Rehydration Salts (ORS)','Oral powder packet','sachet'),
('PARACETAMOL 100 MG/ML, 15 ML','Paracetamol','100 mg/mL, 15 mL','bottle'),
('Paracetamol 250 mg/5mL, 60 mL','Paracetamol','250 mg/5mL, 60 mL, suspension','bottle'),
('PARACETAMOL 250 MG/5ML, 60 ML SUSPENSION','Paracetamol','250 mg/5mL, 60 mL, suspension','bottle'),
('Tamsolusin 400 mcg','Tamsulosin','400 mcg','tablet'),
('Valproic acid 250 mg/5mL, 120 mL','Valproic Acid','250 mg/5 mL, 120 mL Syrup Bottle','bottle'),
('Vitamin A ( 200,000 IU)','Vitamin A (Retinol)','200,000 IU','capsule'),
('CO-AMOXICLAV 625 MG ( AMOXICILLIN 500 MG + POTASSIUM CLAVULANATE 125 MG)','Co-Amoxiclav','625mg','tablet'),
('VALPROIC ACID 500MG','Valproic acid','500 mg','tablet'),
('ASCORBIC ACID 500 MG','Ascorbic acid','500 mg','tablet'),
('HYOSCINE N BUTYLBROMIDE 10 MG','Hyoscine N-butylbromide','10 mg','tablet'),
('LAGUNDI 300 MG','Lagundi leaf','300 mg','tablet'),
('TRIMETAZIDINE 35 MG HYDROCHLORIDE','Trimetazidine','35 mg','tablet'),
('ALUMINUM HYDROXIDE + MAGNESIUM HYDROXIDE 200 MG + 100 MG','Aluminum Hydroxide + Magnesium Hydroxide','200mg +100 mg','tablet'),
('CO-AMOXICLAV (AMOXICILLIN 400 MG + POTASSIUM CLAVULANATE 57 MG/5ML, 70 ML)','Co-Amoxiclav','400mg+57 mg/5mL, 70 mL suspension','bottle'),
('Valproic acid 250 mg/5mL, 100 mL','Valproic Acid','250 mg/5 mL, 120 mL Syrup Bottle','bottle'),
('CLONIDIN 75MG','Clonidine','75 mcg','tablet'),
('CETIRIZINE 5 MG/5ML, 60 ML','Cetirizine','2.5 mg/mL 10 mL oral drops','bottle'),
('Zinc Sulfate 55mg/5mL, 60 mL syrup','Zinc Sulfate','55mg/5mL, 60 mL syrup','bottle');

create temp table _clientdata_context (
  batch text primary key,
  facility_id uuid,
  dispensed_by uuid,
  manual_label text not null,
  source_date date not null
) on commit drop;

insert into _clientdata_context (batch, facility_id, dispensed_by, manual_label, source_date)
select v.batch,
       f.id,
       p.id,
       v.manual_label,
       v.source_date::date
from (values
  ('JULY', 'CHO-NAGA', 'ClientData historical import: Dispensing.xlsx', '2026-07-01'),
  ('AUG_CHO', 'CHO-NAGA', 'ClientData historical import: RequestIssuanceSlip.xlsx / pharmacy dispensing', '2026-08-01'),
  ('AUG_COLON', 'HC-COLON', 'ClientData historical import: RequestIssuanceSlip.xlsx / Barangay Colon', '2026-08-01')
) as v(batch, facility_code, manual_label, source_date)
left join lateral (
  select id
  from public.facilities
  where status::text = 'ACTIVE'
    and facility_code = v.facility_code
  order by id
  limit 1
) f on true
left join lateral (
  select id
  from public.profiles
  where facility_id = f.id
    and status::text = 'ACTIVE'
    and role::text in ('PHARMA_I', 'PHARMA_II', 'BHW')
  order by case when role::text = 'PHARMA_II' then 1
                when role::text = 'PHARMA_I' then 2
                else 3 end, id
  limit 1
) p on true;

do $$
begin
  if exists (
    select 1
    from _clientdata_context c
    where c.facility_id is null or c.dispensed_by is null
       or not exists (
         select 1 from public.patients p
         where p.facility_id = c.facility_id and p.archived_at is null
       )
  ) then
    raise exception 'ClientData dispensing import prerequisites missing: active facility, eligible profile, or facility-matched active patient pool';
  end if;
end $$;

create temp table _clientdata_patients on commit drop as
select c.batch,
       p.id as patient_id,
       row_number() over (partition by c.batch order by p.id) as patient_rank,
       count(*) over (partition by c.batch) as patient_count
from _clientdata_context c
join public.patients p
  on p.facility_id = c.facility_id
 and p.archived_at is null;

create temp table _clientdata_mapped on commit drop as
select s.*,
       c.facility_id,
       c.dispensed_by,
       c.manual_label,
       c.source_date,
       row_number() over (partition by s.batch order by s.line_no) as batch_row,
       m.medicine_id
from _clientdata_source_rows s
join _clientdata_context c using (batch)
left join lateral (
  select med.id as medicine_id
  from public.medicines med
  left join _clientdata_aliases a
    on lower(btrim(a.source_description)) = lower(btrim(s.source_description))
  where
       regexp_replace(lower(med.generic_name || med.dosage || med.unit_of_measure), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(s.source_description || s.source_unit), '[^a-z0-9]', '', 'g')
    or regexp_replace(lower(med.generic_name || med.dosage), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(s.source_description), '[^a-z0-9]', '', 'g')
    or (
         a.source_description is not null
         and regexp_replace(lower(med.generic_name || med.dosage || med.unit_of_measure), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(a.generic_name || a.dosage || a.unit_of_measure), '[^a-z0-9]', '', 'g')
       )
  order by case
    when a.source_description is not null then 1
    when regexp_replace(lower(med.generic_name || med.dosage || med.unit_of_measure), '[^a-z0-9]', '', 'g')
       = regexp_replace(lower(s.source_description || s.source_unit), '[^a-z0-9]', '', 'g') then 2
    else 3
  end, med.id
  limit 1
) m on true;

do $$
declare
  batch_name text;
  source_qty bigint;
  mapped_qty bigint;
  skipped_rows bigint;
begin
  for batch_name in select batch from _clientdata_context order by batch loop
    select coalesce(sum(quantity), 0), coalesce(sum(quantity) filter (where medicine_id is not null), 0),
           count(*) filter (where medicine_id is null)
      into source_qty, mapped_qty, skipped_rows
      from _clientdata_mapped where batch = batch_name;
    raise notice 'ClientData import %: source_qty=%, mapped_qty=%, skipped_rows=%',
      batch_name, source_qty, mapped_qty, skipped_rows;
  end loop;
end $$;

insert into public.medicine_dispensing (
  facility_id,
  medicine_id,
  inventory_id,
  quantity,
  needed_quantity,
  prescribed_by,
  dispensing_type,
  dispensed_by,
  patient_id,
  dispense_date,
  dispensing_transaction_id,
  is_manual_record,
  manual_dispensed_by,
  record_type
)
select m.facility_id,
       m.medicine_id,
       null,
       m.quantity,
       m.quantity,
       'Mock historical source import',
       'WALK_IN',
       m.dispensed_by,
       p.patient_id,
       (
         case when m.batch = 'JULY'
           then m.source_date + ((m.batch_row - 1) % 31)
           else m.source_date
         end
       )::timestamptz,
       (
         substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 1, 8) || '-' ||
         substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 9, 4) || '-' ||
         substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 13, 4) || '-' ||
         substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 17, 4) || '-' ||
         substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 21, 12)
       )::uuid,
       true,
       m.manual_label,
       'HISTORY_ONLY'
from _clientdata_mapped m
join _clientdata_patients p
  on p.batch = m.batch
 and p.patient_rank = ((m.batch_row - 1) % p.patient_count) + 1
where m.medicine_id is not null
  and not exists (
    select 1
    from public.medicine_dispensing existing
    where existing.dispensing_transaction_id = (
      substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 1, 8) || '-' ||
      substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 9, 4) || '-' ||
      substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 13, 4) || '-' ||
      substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 17, 4) || '-' ||
      substr(md5('PRDS_CLIENTDATA:' || m.batch || ':' || m.line_no::text), 21, 12)
    )::uuid
  );

commit;
