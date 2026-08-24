**Database Tables and Attributes**

**1\. Profiles**

- Profile Id
- First Name
- Last Name
- Email
- Phone number
- Role (pharma ii, pharma i, bhw)
- Facility ID (refer to the facility table)
- Status (pending, active, deactivated)
- Created at
- Update At
- Approved by
- Approve at (date and time, it records what time the profile was approved)

**2\. Facilty**

- Facility ID
- Facility Name
- Facility Code (short code name like CHO or TNHC, etc.)
- Facility Type
- Address
- Status (active/inactive)

**3\. Medicine**

- Medicine ID
- Generic Name
- Brand Name
- Unit of Measure
- Dosage
- Unit Cost

**4\. Supplier**

- Supplier ID
- Supplier Name
- Contact Number
- Address
- Status (active or not active)

**5\. Patient**

- Patient ID
- First Name
- Last Name
- Gender
- Date of Birth
- Facility ID (no need to put another address since we have facility table)

**6\. Patient Medicine Record**

- Patient Record ID
- Patient ID (refer to the patient table)
- Remarks (if a patient is a PWD, has receipt to show during medicine requesting)
- Medicine ID (refer to the medicine table. (Additionally, it also shows what medicine they have been requested)
- Medicine Quantity
- Date stamp
- Dispensed By (refer to the user table to show who gave the medicine)

**7\. Inventory**

- Inventory ID
- Facility ID (refer to the facility table)
- Medicine ID (refer to the medicine table)
- Supplier ID (refer to the supplier table)
- Quantity (quantity on hand)
- Threshold
- Batch Number
- Date Received
- Expiration Date
- Updated At (to have real time record for the stocks, and only it should be date and time)

**8\. Medicine Request**

- Request ID
- Requested By (refer to the users table)
- Facility ID (refer to the facility table)
- Request Date (Date and time)
- Status (pending, approved rejected and completed. Additionally for this part we set a timeline of the request so that we have monitoring if it's received or what by the requester)
- Approved By (refer to the users table)
- Remarks (if there will a leave message needed)

**9\. Medicine Request Items**

- Request Items ID
- Request ID (refer to the Medicine Request table)
- Medicine ID (refer to the medicine table)
- Quantity

**10\. Stock Transfer**

- Transfer ID
- Source Facility ID (refer to the facility table)
- Destination Facility ID (refer to the facility table)
- Requested By (refer to the users table)
- Approved By (refer to the users table)
- Approved At (date and time)
- Status (what is the status for the transfer if its pending, approved, reject or completed, but by default it is pending)
- Created at (date and time when the transfer created)
- Transfer Date
- Received By (refer to the user table)
- Received At (Date and Time)
- Remarks

**11\. Stock Transfer Items**

- Transfer Item ID
- Transfer ID (refer to the stock transfer table)
- Medicine ID (refer to the medicine table)
- Quantity

**12\. Medicine Dispensing**

- Dispense ID
- Facility ID (refer to the facility table)
- Medicine ID (refer to the medicine table)
- Inventory ID (refer to the inventory table)
- Quantity
- Dispensing Type
- Dispense By (refer to the users id)
- Patient ID (refer to patient table)
- Dispense Date (Date and time of dispensing)

**13\. Other Programs**

- Program ID
- Program Name
- Program Date
- Description

**14\. Program Medicine**

- Program Med ID
- Program ID (refer to the program table)
- Medicine ID (refer to the medicine table)
- Quantity Used

**15\. Notification**

- Notification ID
- User ID (refer to the user table. Additionally, the purpose for this is to specify whom the notification is intended to)
- Title (e.g., Low Stock Alert, Transfer Approved, Request Approved etc.)
- Message
- Is Read (to know if the message is already clicked or seen, it should be having a value of "true" or "false")
- Created At (Date and Time)

**16\. Activity Logs**

- Log ID
- User ID (refer to the user table)
- Action (stores what Happened)
- Module (stores where did happened)
- Details (it gives you short description what happens specifically, like User 1 approved user 3)
- Created At (Date and Time)

**17\. Forecasting**

- Forecast ID
- Medicine ID (refer to the medicine table)
- Facility ID (refer to the facility table)
- Forecast Month (date)
- Predicted Quantity
- Generated at (Date and time and it should be default "now")

**Additional note:**

In terms of row level security.

In viewing for the user;

- BHW can only see their barangay stock
- Pharma I can see all barangay stock and the Cho stock
- Pharma II can see everything.

And last, for the user that can approval authority,

- All user registration require approval from Pharma II before access is granted