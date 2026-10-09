# PRDS Forecasting Module: Plain-Language Interpretation Guide

> **Target Audience:** City Health Office (CHO) Pharmacists, Planning Officers, Barangay Health Workers (BHW), and Healthcare Staff.  
> **Systems Covered:** PRDS Desktop (`prds-desktop`) and PRDS Web (`prds-web`).

---

## 1. What is the Forecasting Module?

The **Forecasting Module** is a smart inventory planning assistant built directly into PRDS. 

In healthcare facilities, running out of essential medicine puts patients at risk. On the other hand, ordering too much medicine wastes municipal funds and leads to expired tablets sitting forgotten on storage shelves.

The Forecasting Module helps you strike the right balance by answering three practical questions:
1. **How much medicine will our patients likely need next month?**
2. **Are we about to run out of stock?**
3. **Do we have too much stock that might expire before we can dispense it?**

---

## 2. How the System Predicts Medicine Demand (In Plain Words)

You do **not** need a background in statistics or mathematics to understand the forecast. The system automatically does the calculations behind the scenes.

Here is how it works in everyday language:

```
Step 1: Look at Past Usage
The system looks at how many units of a medicine you handed out to patients 
over the past several months (from your daily dispensing records).
               │
               ▼
Step 2: Find the Usage Pattern
The system checks if usage is going UP, going DOWN, or staying STEADY.
               │
               ▼
Step 3: Estimate Upcoming Needs
The system follows that pattern forward to predict how many units you 
will need next month and in the months ahead.
               │
               ▼
Step 4: Compare with Current Stock
The system compares your predicted need against what is physically on your shelf 
today to tell you if your supply is Safe, Low, or Excess.
```

### An Everyday Analogy
Think of the forecast like tracking your monthly rice consumption at home:
* If your family consumed **10 kg** in October, **12 kg** in November, and **14 kg** in December, you notice consumption is growing by **2 kg each month**.
* You can reasonably expect to need around **16 kg** in January.
* If you only have **5 kg** left in your bin, you know you will run out in less than two weeks and need to buy more right away.

The PRDS Forecasting Module does the exact same thing for every medicine in your health center.

---

## 3. Understanding the 4 Summary Cards at the Top

When you open the Forecasting screen, four cards at the top give you a quick health check of your inventory:

| Card | What It Shows | What It Means for You |
| :--- | :--- | :--- |
| **Total Projected Demand** | Total units estimated for the selected planning period | The total quantity of medicines (tablets, bottles, vials) expected to be dispensed across all items. The City Health Office uses this to budget funds and prepare supplier orders. |
| **Stockout Risk Items** | Count and percentage of medicines running dangerously low | The number of medicine lines that will **run out within 30 days** if current dispensing rates continue. **Target: Always 0 items (0%).** |
| **Increasing Trends** | Count of medicines with rising usage | Medicines where patient demand is growing month-after-month (such as cough syrups during the rainy season or hypertension maintenance medications). |
| **Average Reliability Score** | Overall predictability percentage (e.g., `92%`) | Tells you how steady and consistent the historical records have been. A high percentage means the forecast is very reliable. If records are new or jump unpredictably, it shows `—`. |

---

## 4. Understanding the Medicine Table

Below the summary cards is the **Medicine Trends Table** (displaying 10 medicines per page). Here is what each column means:

### 1. Medicine & Category
* **Generic Name & Dosage:** The standard formulation (e.g., *Paracetamol 500mg Tablet*).
* **Brand Name:** Displayed below the generic name if known (e.g., *Biogesic*), or left blank if generic.
* **Category:** The therapeutic program tag (e.g., *Analgesic*, *Antibiotic*, *Antihypertensive*).

### 2. Current Stock
* The actual quantity of usable medicine physically on your shelves today.

### 3. Trend (Monthly Change)
* Shows whether patient demand is climbing, falling, or flat:
  * <span style="color:#16a34a;font-weight:bold;">↑ +33/mo</span> (Green): Usage is growing by about 33 units every month.
  * <span style="color:#dc2626;font-weight:bold;">↓ -15/mo</span> (Red): Usage is slowing down by about 15 units every month.
  * <span style="color:#64748b;font-weight:bold;">→ 0/mo</span> (Slate): Usage is steady month-to-month.

### 4. Next Month Demand
* The estimated number of units patients will need during the upcoming month.

### 5. Coverage (Months of Supply)
* Tells you **how long your current stock will last** based on next month's expected usage.
  * **`0.53x`** = You have about half a month of supply left (approx. 16 days).
  * **`1.85x`** = You have nearly 2 months of supply left.
  * **`3.20x`** = You have over 3 months of supply left.
  * **`—`** = No forecast available yet (need at least 2 months of dispensing history).

### 6. Reliability Score ($R^2$)
* Measures how steady the past pattern has been on a scale from `0.00` to `1.00`:
  * **`0.80 to 1.00` (High Confidence):** Dispensing has followed a smooth, predictable path. You can rely on this number with high confidence.
  * **`0.50 to 0.79` (Moderate Confidence):** Usage fluctuates somewhat from month to month. Use the forecast as a helpful estimate.
  * **`—` (Insufficient Data):** Less than 2 full months of dispensing logs exist.

### 7. Risk Status Badges & Required Actions
The colored badge in the last column gives you an instant, clear instruction:

| Badge | Meaning | Action for Barangay Health Worker (BHW) | Action for CHO Pharmacist |
| :---: | :--- | :--- | :--- |
| <span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#fee2e2;color:#dc2626;font-weight:bold;font-size:12px;">Stockout Risk</span> | Current stock will last **less than 1 month** ($< 1.0\times$), or stock is at or below minimum safety threshold. | **Submit a stock request to the City Health Office immediately.** | Prioritize approval and prepare replenishment delivery to prevent stockout. |
| <span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#d1fae5;color:#047857;font-weight:bold;font-size:12px;">Optimal</span> | Current stock will last between **1.0 and 2.5 months**. This is the ideal buffer. | Healthy level. Continue normal daily dispensing and monthly logging. | Maintain standard monthly replenishment schedule. |
| <span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#fef3c7;color:#b45309;font-weight:bold;font-size:12px;">Overstock</span> | Current stock exceeds **2.5 months** of expected consumption. | **Do not request more of this item.** Check batch expiration dates (FEFO) so stock does not expire. | Pause new allocations for this facility; consider transferring excess stock to another barangay in deficit. |
| <span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#f1f5f9;color:#64748b;font-weight:bold;font-size:12px;">Insufficient Data</span> | Facility has fewer than 2 months of dispensing records. | Continue recording daily dispensing. Once 2 full months are logged, the forecast appears automatically. | Rely on standard minimum thresholds until historical records accumulate. |

---

## 5. How to Read the Projection Chart

Above the table is an interactive visual chart showing how your stock and demand evolve over time:

```
Units
  ▲
  │                                           ● (Projected +2mo)
  │                                    ● (Projected +1mo)
  │                             ● (Last Actual: 310)
  │                      ● (270)
  │               ● (240)
  │        ● (210)
  │
  └─────────────────────────────────────────────────────────────► Month
         Oct     Nov     Dec     Jan     Feb (+1mo)   Mar (+2mo)
         [──── Past Actuals ────]        [──── Future Forecast ────]
```

* **Solid Green Line (Past Actuals):** The real number of tablets or bottles handed out to patients in past months.
* **Blue Dashed Line (Average Trend):** The smooth direction line showing the overall path of your dispensing.
* **Orange Dashed Line with Dots (Future Forecast):** What the system projects you will need in upcoming months (+1mo, +2mo, etc.).

---

## 6. How to Use the Screen Controls

1. **Facility Filter (City Health Office Users):**
   * Select a specific Barangay Health Center (e.g. *Tinaan Health Center*) to view only their stock and needs.
   * Select *All Facilities* to see total city-wide medicine requirements.
   * *(Note: Barangay Health Workers automatically see only their assigned health station).*
2. **Planning Horizon Selector:**
   * **3 Months:** Recommended for quarterly medicine requests.
   * **6 Months:** Recommended for semi-annual procurement planning.
   * **12 Months:** Used by City Health Officers for annual LGU health budgeting.
3. **Search Bar:**
   * Type any medicine name, brand, or category (e.g., `"Amoxicillin"`, `"Hypertension"`) to instantly filter the list.
4. **Export CSV Button:**
   * Click **Export CSV** at the top right to download the table as an Excel-ready spreadsheet for meetings, audit reports, or offline printing.

---

## 7. Real-World Walkthrough: Tinaan Health Center

To see how simple this is in practice, look at this real example:

* **Location:** Tinaan Barangay Health Center
* **Medicine:** Paracetamol 500mg Tablet
* **Stock on Shelf Today:** 180 tablets
* **Minimum Safety Threshold:** 100 tablets

### What happened over the last 4 months?
* October: Dispensed **210 tablets**
* November: Dispensed **240 tablets**
* December: Dispensed **270 tablets**
* January: Dispensed **310 tablets**

### What does the system see?
* Patient demand has steadily grown by about **+33 tablets each month**.
* Therefore, for next month (February), the system estimates Tinaan will need **340 tablets**.

### What is the stock situation?
* Tinaan currently has **180 tablets** in stock.
* Dividing 180 tablets by the 340 tablets needed gives **0.53 months of coverage** (about **16 days of supply**).
* Because 16 days is less than a full month, the system displays:
  <span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#fee2e2;color:#dc2626;font-weight:bold;font-size:12px;">Stockout Risk</span>

### What action is taken?
1. The BHW at Tinaan sees the red **Stockout Risk** badge.
2. The BHW opens the **Requests** module and creates a requisition for at least **260 tablets** ($340 \text{ needed} - 180 \text{ in stock} + 100 \text{ safety buffer}$).
3. The City Health Office Pharmacist sees the request and approves it, delivering fresh stock before Tinaan runs out.
4. **Result:** Patients visiting Tinaan continue to receive fever medicine without interruption.

---

## 8. Simple Decision Guide for Health Workers

```
When checking the Forecasting screen:

Does any medicine have a RED "Stockout Risk" badge?
   │
   ├── YES ──► SUBMIT AN IMMEDIATE REQUISITION to the City Health Office.
   │           Specify the quantity needed to cover next month plus safety buffer.
   │
   └── NO ───► Does any medicine have an AMBER "Overstock" badge?
                 │
                 ├── YES ──► DO NOT ORDER MORE.
                 │           Check expiration dates on current boxes.
                 │           Notify CHO so excess can be shared with health centers in need.
                 │
                 └── NO ───► ALL GREEN "OPTIMAL".
                             Your inventory is healthy. Continue standard daily operations.
```

---

## 9. Technical Appendix (For Developers & IT Administrators Only)

> This section documents the underlying algorithms implemented in `src/shared/utils/forecastingUtils.js` for system maintenance and verification.

### Mathematical Model: Ordinary Least Squares (OLS) Linear Regression

Historical monthly dispensing records for a given medicine at a specific facility are indexed chronologically as:

$$x \in \{0, 1, 2, \dots, n-1\}, \quad y \in \{y_0, y_1, y_2, \dots, y_{n-1}\}$$

Where $n$ is the number of historical months within the selected window.

#### 1. Minimum Data Guard
If $n < 2$, the algorithm cannot establish a trend slope. The function returns `{ slope: 0, intercept: y_0 || 0, rSquared: 0 }`.

#### 2. Slope ($m$) and Intercept ($c$)
$$\text{Slope } (m) = \frac{n \sum xy - (\sum x)(\sum y)}{n \sum x^2 - (\sum x)^2}$$

$$\text{Intercept } (c) = \frac{\sum y - m \sum x}{n}$$

* **Direction Classification:**
  * $m > 0.5 \implies$ **Increasing**
  * $m < -0.5 \implies$ **Declining**
  * $-0.5 \le m \le 0.5 \implies$ **Stable**

#### 3. Coefficient of Determination ($R^2$)
With mean actual consumption $\bar{y} = \frac{\sum y}{n}$:

$$SS_{\text{tot}} = \sum_{i=0}^{n-1} (y_i - \bar{y})^2, \quad SS_{\text{res}} = \sum_{i=0}^{n-1} (y_i - (m \cdot x_i + c))^2$$

$$R^2 = \begin{cases} 1.0 & \text{if } SS_{\text{tot}} = 0 \\ \max\Big(0, \; 1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}}\Big) & \text{otherwise} \end{cases}$$

#### 4. Future Month Projection ($\hat{y}_k$)
For horizon step $k \in \{1, 2, \dots, H\}$:

$$\hat{y}_k = \max\Big(0, \; \operatorname{round}(m \cdot (n - 1 + k) + c)\Big)$$

#### 5. Coverage Multiplier
$$\text{Coverage Months} = \begin{cases} \dfrac{\text{Current Stock } (S)}{\hat{y}_1} & \text{if } \hat{y}_1 > 0 \\ \text{null} & \text{otherwise} \end{cases}$$

#### 6. Code & Test Files
* **Calculations:** `prds-desktop/src/shared/utils/forecastingUtils.js`
* **Automated Unit Tests:** `prds-desktop/src/shared/utils/forecastingUtils.test.mjs` (Run with `node --test src/shared/utils/forecastingUtils.test.mjs`)
* **Local Snapshot Cache:** `STORAGE_KEYS.FORECASTING` in `snapshotStore.js`
