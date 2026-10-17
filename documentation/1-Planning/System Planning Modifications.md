
# System Planning Modifications

## 1. Stock Returns

There are two methods for recording stock returns:

### 1.1 Barangay Health Worker (BHW) Submission
- The BHW selects specific inventory items from their health center to return (including Lot No., Medicine Name, and Quantity) and specifies the reason.
- A **Return ID** is generated with status `Pending`.
- The City Health Office (CHO) is notified. Once physical items are received and checked, the CHO pharmacist **confirms** the return.
- Upon confirmation, status updates to `Confirmed`, recording who confirmed it and when.

### 1.2 City Health Office (CHO) Manual Recording (Walk-In / Direct)
- The CHO pharmacist manually records the return by selecting the returning facility.
- The system fetches that facility's available inventory and auto-populates the medicine details, lot numbers, and expiration dates.
- CHO inputs the quantity and reason.
- Once saved, the return is immediately marked as `Confirmed` with a generated **Return ID**, and the returned stock is automatically deducted from the facility.

---

## 2. Stock Return Data Structure

### 2.1 Entity: Stock Return (Header)
Captures the overall return transaction, source facility, tracking identifier, and confirmation details.

| Attribute | Description | Example / Type |
| :--- | :--- | :--- |
| **Return ID** | Unique human-readable return code & tracking reference | `RET-2026-0001` (Text / PK) |
| **Source Facility** | Health center returning the medicines | Reference to `facilities` |
| **Returned By** | Person / staff submitting or handing over the stock | Text / User Profile |
| **Return Date** | Date and time the return was created | Timestamp |
| **Reason** | Primary reason for return | Expired, Damaged, Recalled, Excess Stock |
| **Status** | Current state of the return | `Pending` or `Confirmed` |
| **Confirmed By** | CHO staff member who confirmed the return | Reference to `profiles` |
| **Confirmed Date** | Date and time the return was confirmed | Timestamp |
| **Remarks** | Optional notes or handling instructions | Text |

### 2.2 Entity: Stock Return Items (Detail)
Captures each individual medicine batch/lot included in the return.

| Attribute | Description | Example / Type |
| :--- | :--- | :--- |
| **Item ID** | Unique line-item identifier | UUID / Number |
| **Return ID** | Reference to the parent Stock Return | `RET-2026-0001` (FK) |
| **Source Inventory ID** | Specific batch record at the facility to deduct from | Reference to `inventory.id` |
| **Medicine ID** | Catalog link for drug specifications | Reference to `medicines.id` |
| **Medicine Name** | Generic medicine name | `Paracetamol 500mg` |
| **Medicine Brand** | Brand name | `Biogesic` |
| **Lot No.** | Lot / Batch number being returned | `LOT-2025-A` |
| **Expiration Date** | Expiration date of the batch | `2026-12-31` |
| **Quantity** | Number of units / pieces being returned | Positive Integer |

---

## 3. Status Lifecycle & Terms

| Term | Meaning | Trigger / Action |
| :--- | :--- | :--- |
| **`Pending`** | Return submitted by BHW; items in transit to CHO | Created by BHW at barangay station |
| **`Confirmed`** | Return officially received and accepted by CHO | CHO clicks **Confirm** (or created directly via CHO Manual Recording) |
| **`Confirm Return`** | Action button to accept and finalize the return | Performed by CHO pharmacist |
| **`Cancelled`** | Return cancelled before confirmation (if entered by mistake) | Performed by submitter or CHO |