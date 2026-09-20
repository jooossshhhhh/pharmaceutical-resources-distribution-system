
# PRDS Forecasting Module: Interpretation & Analytics Guide

> **Target Audience:** City Health Office (CHO) Pharmacists, Planning Officers, Barangay Health Workers (BHW), and System Administrators.  
> **Systems Covered:** `prds-desktop` (Tauri v2 primary client) and `prds-web` (browser client).

---

## 1. Executive Summary & Purpose

The PRDS Forecasting Module translates historical medicine dispensing data into proactive supply chain decisions. It enables healthcare planners to:
1. **Anticipate Future Demand:** Project monthly medicine requirements across varying planning horizons (3, 6, 12 months).
2. **Prevent Stockouts:** Identify facilities where current stock will not cover upcoming demand before depletion occurs.
3. **Prevent Expiry & Overstocking:** Detect facilities holding excess inventory ($> 2.5\times$ monthly consumption) to facilitate inter-facility stock transfers.
4. **Evaluate Trend Reliability:** Quantify the statistical confidence of projections using goodness-of-fit metrics ($R^2$).

---

## 2. Analytics Engine & Computation Process

All computations are executed client-side in `forecastingUtils.js` using data synced from Supabase and cached locally in `snapshotStore.js` (`STORAGE_KEYS.FORECASTING`).

```
┌──────────────────────────────┐     ┌─────────────────────────────┐
│  monthly_dispensing_summary  │     │          inventory          │
│ (Historical Actuals: y_t)    │     │ (Stock: S, Threshold: T)    │
└──────────────┬───────────────┘     └──────────────┬──────────────┘
               │                                    │
               ▼                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│              Analytics Engine (forecastingUtils.js)              │
│  Step 1: Data Ingestion & Time Indexing (x = 0, 1, ..., n-1)     │
│  Step 2: Data Sufficiency Guard (n >= 2 months)                  │
│  Step 3: Intermediate Sums Calculation (Σx, Σy, Σxy, Σx²)        │
│  Step 4: Ordinary Least Squares Regression (Slope m, Intercept c)│
│  Step 5: Goodness of Fit Evaluation (R² Coefficient)             │
│  Step 6: Future Horizon Demand Projection (ŷ_k)                  │
│  Step 7: Stock Coverage Multiplier (S / ŷ_1)                     │
│  Step 8: Multi-Tier Risk Classification                          │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              User Interface (ForecastingModule.jsx)              │
│  • Top 4 KPI Metrics                                             │
│  • Interactive 3-Series Projection Chart                         │
│  • Facility-Scoped Medicine Trends Table (10 items / page)       │
└──────────────────────────────────────────────────────────────────┘
```

---

### 2.1 The 8-Step Computation Process

#### Step 1: Data Ingestion & Time Indexing
Historical monthly dispensing records for a given medicine and facility are sorted chronologically and mapped to 0-based time indices:

$$x \in \{0, 1, 2, \dots, n-1\}, \quad y \in \{y_0, y_1, y_2, \dots, y_{n-1}\}$$

Where $n$ is the number of historical months available within the selected horizon window (e.g., 3, 6, 12, or All months).

#### Step 2: Data Sufficiency Guard
- If $n < 2$: Linear regression cannot establish a reliable slope. The engine returns `{ slope: null, intercept: y_0 ?? null, rSquared: null }`.
- If $n \ge 2$: The engine proceeds to calculate Ordinary Least Squares (OLS) regression.

#### Step 3: Compute Intermediate Statistical Sums
$$\sum x = \sum_{i=0}^{n-1} x_i, \quad \sum y = \sum_{i=0}^{n-1} y_i, \quad \sum xy = \sum_{i=0}^{n-1} (x_i \cdot y_i), \quad \sum x^2 = \sum_{i=0}^{n-1} x_i^2$$

#### Step 4: Calculate Slope ($m$) and Intercept ($c$)
$$\text{Slope } (m) = \frac{n \sum xy - (\sum x)(\sum y)}{n \sum x^2 - (\sum x)^2}$$

$$\text{Intercept } (c) = \frac{\sum y - m \sum x}{n}$$

- **Slope Interpretation:**
  - $m > 0.5$: **Increasing Trend** (green arrow, demand is accelerating).
  - $m < -0.5$: **Declining Trend** (red arrow, demand is slowing).
  - $-0.5 \le m \le 0.5$: **Stable / Flat Trend** (slate dash).

#### Step 5: Calculate Goodness-of-Fit ($R^2$)
Measures what proportion of historical dispensing variance is explained by the regression line:

$$\bar{y} = \frac{\sum y}{n}$$

$$SS_{\text{tot}} = \sum_{i=0}^{n-1} (y_i - \bar{y})^2 \quad \text{(Total Variation)}$$

$$SS_{\text{res}} = \sum_{i=0}^{n-1} (y_i - \hat{y}_i)^2 \quad \text{where } \hat{y}_i = m \cdot x_i + c \quad \text{(Residual Error)}$$

$$R^2 = 1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}}$$

#### Step 6: Project Future Monthly Demand ($\hat{y}_k$)
For future month index $k \in \{1, 2, \dots, H\}$ beyond the historical window:

$$\text{Time step } x_{\text{future}} = n - 1 + k$$

$$\hat{y}_k = \max\Big(0, \; \operatorname{round}(m \cdot x_{\text{future}} + c)\Big)$$

*Non-negativity constraint:* If the downward slope projects a negative value, $\max(0, \dots)$ ensures demand does not drop below 0 units.

#### Step 7: Calculate Stock Coverage Multiplier
Calculates how many months the current physical stock ($S$) will sustain the facility at next month's projected demand ($\hat{y}_1$):

$$\text{Coverage Multiplier} = \begin{cases} 
\dfrac{S}{\hat{y}_1} & \text{if } \hat{y}_1 > 0 \\ 
\text{null} & \text{if } \hat{y}_1 = 0 \text{ (no projected consumption)} 
\end{cases}$$

#### Step 8: Assign Risk Classification Tier
1. **Stockout Risk (Red Pill):**
   $$\text{Coverage} < 1.0\times \quad \text{OR} \quad S \le T \text{ (Threshold)}$$
2. **Optimal Buffer (Green Pill):**
   $$1.0\times \le \text{Coverage} \le 2.5\times \quad \text{AND} \quad S > T$$
3. **Overstock (Amber Pill):**
   $$\text{Coverage} > 2.5\times$$
4. **Insufficient Data (Amber Pill):**
   $$n = 1 \text{ month of history}$$
5. **No History (Slate Pill):**
   $$n = 0 \text{ months of history}$$

---

### 2.2 Concrete Worked Numerical Example

To understand the exact flow, consider the following real-world scenario:
- **Facility:** Tinaan Barangay Health Center
- **Medicine:** Paracetamol 500mg Tablet
- **Current Available Stock ($S$):** 180 tablets
- **Safety Threshold ($T$):** 100 tablets
- **Historical Dispensing ($n = 4$ months):**
  - Month 0 (October): $210$ tablets
  - Month 1 (November): $240$ tablets
  - Month 2 (December): $270$ tablets
  - Month 3 (January): $310$ tablets

#### Step-by-Step Calculation Table

| Month | Time Index ($x$) | Actual Dispensed ($y$) | $x \cdot y$ | $x^2$ | Model Fit ($\hat{y} = mx + c$) | Error ($y - \hat{y}$) | $(y - \hat{y})^2$ | $(y - \bar{y})^2$ |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Oct | 0 | 210 | 0 | 0 | 196 | +14 | 196 | 2,256.25 |
| Nov | 1 | 240 | 240 | 1 | 237 | +3 | 9 | 306.25 |
| Dec | 2 | 270 | 540 | 4 | 278 | -8 | 64 | 156.25 |
| Jan | 3 | 310 | 930 | 9 | 319 | -9 | 81 | 2,756.25 |
| **Sum** | **$\sum x = 6$** | **$\sum y = 1030$** | **$\sum xy = 1710$** | **$\sum x^2 = 14$** | — | — | **$SS_{\text{res}} = 350$** | **$SS_{\text{tot}} = 5475$** |

*Note: Mean consumption $\bar{y} = 1030 / 4 = 257.5$.*

#### Step 4 Arithmetic: Slope ($m$) & Intercept ($c$)
$$\text{Numerator} = n \sum xy - (\sum x)(\sum y) = 4(1710) - (6)(1030) = 6840 - 6180 = 660$$

$$\text{Denominator} = n \sum x^2 - (\sum x)^2 = 4(14) - (6)^2 = 56 - 36 = 20$$

$$\text{Slope } (m) = \frac{660}{20} = \mathbf{+33.0 \text{ units/month}}$$

$$\text{Intercept } (c) = \frac{\sum y - m \sum x}{n} = \frac{1030 - (33.0 \cdot 6)}{4} = \frac{1030 - 198}{4} = \frac{832}{4} = \mathbf{208.0}$$

$$\text{Regression Equation: } \hat{y} = 33.0x + 208.0$$

#### Step 5 Arithmetic: Goodness of Fit ($R^2$)
$$R^2 = 1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}} = 1 - \frac{350}{5475} = 1 - 0.0639 = \mathbf{0.936} \quad (93.6\%)$$

**Interpretation:** $R^2 = 0.936 \ge 0.80$, representing **High Confidence**. Tinaan BHC shows a steady, reliable monthly growth of $+33$ tablets/month.

#### Step 6 Arithmetic: Projected Demand for Next Month (February, $k=1$)
Future time step $x = 3 + 1 = 4$:
$$\hat{y}_1 = \max(0, \; \operatorname{round}(33.0 \times 4 + 208.0)) = \max(0, \; 132 + 208) = \mathbf{340 \text{ units}}$$

#### Step 7 Arithmetic: Stock Coverage Multiplier
$$\text{Coverage} = \frac{\text{Current Stock } (S)}{\text{Next Month Forecast } (\hat{y}_1)} = \frac{180}{340} = \mathbf{0.53\times} \quad (\approx 16 \text{ days of supply})$$

#### Step 8 Result: Risk Categorization
- $\text{Coverage } (0.53\times) < 1.0\times$.
- **Resulting UI Badge:** <span style="color:#dc2626;font-weight:bold;">Stockout Risk</span> (Red Pill Badge).
- **Automated Workflow Impact:**
  - Placed on the CHO Pharmacist's replenishment watch-list.
  - BHW at Tinaan sees an alert to request at least $340 - 180 + 100 = 260$ tablets from the Central Health Office.

---

## 3. UI Component Guide & Interpretation

### 3.1 Top 4 KPI Cards
| Card Title | Metric Displayed | Interpretation |
| :--- | :--- | :--- |
| **Total Projected Demand** | Total units across horizon | Aggregate volume of medicines expected to be consumed across all scoped items over the selected time horizon ($H$). |
| **Stockout Risk Items** | Item count and % of catalog | Number of medicine lines that will run out before next month at current consumption rates. Target is always **0 items (0%)**. |
| **Increasing Trends** | Count of items with $m > 0$ | Medicines whose monthly consumption is climbing. Used by planners to identify growing health programs or disease surges. |
| **Average $R^2$ Confidence** | Mean $R^2$ across valid models | Macro-level statistical confidence for the facility. Displays `—` if records are insufficient. |

### 3.2 Filtering & Facility Scoping
- **Facility Selector (CHO View):**
  - **Specific Health Center:** Scopes all 4 KPI cards, the projection chart, and the table strictly to that health center. The `FACILITY` column is automatically hidden from the table for visual cleanliness.
  - **All Facilities:** Shows aggregated municipal demand; the `FACILITY` column is displayed to indicate row ownership.
- **BHW View:** Locked automatically to the worker's assigned health center (filter dropdown hidden).
- **Time Horizon Selector:** Sets projection range to **3 Months** (quarterly planning), **6 Months** (semi-annual procurement), or **12 Months** (annual LGU budget forecasting).
- **Search:** Real-time filter across generic names, brand names, and therapeutic categories.
- **Export CSV:** Downloads the currently filtered table with formatted coverage and trend metrics.

### 3.3 Forecasting Projection Chart
An interactive three-series chart providing visual verification of regression models:
1. **Historical Actuals (Solid Green Line):** Actual recorded dispensing numbers from `monthly_dispensing_summary`.
2. **Regression Fit (Blue Dashed Line):** The linear trend line computed through Ordinary Least Squares ($y = mx + c$).
3. **Projected Demand (Orange Dashed Line):** Future monthly estimates ($\hat{y}_k$) marked with solid dots.
4. **Notice States:**
   - *No History:* Replaces chart with a descriptive notice indicating that $\ge 2$ consecutive months of dispensing logs are required.
   - *Insufficient Data:* Displays an informational alert banner indicating single-month baseline calibration.

### 3.4 Medicine Trends Table
Paginated to **10 entries per page**:
- **Medicine:** Displays Generic Name and Dosage, with Brand Name below.
- **Category:** Therapeutic class (e.g., Antibiotic, Antihypertensive, Analgesic).
- **Facility:** Displayed only in "All Facilities" view; hidden when a specific health center is selected.
- **Current Stock:** Total physical units available on hand ($S$).
- **Trend:** Arrow icon with numeric slope ($m$). Positive slopes show green `+N/mo`; negative slopes show red `-N/mo`.
- **Next Month:** Forecasted consumption for month $t+1$ ($\hat{y}_1$).
- **Coverage:** Current stock expressed as a monthly multiplier (e.g., `1.85x`). Shows `—` when demand is zero or uncalculated.
- **$R^2$:** Goodness of fit (e.g., `0.94`). Shows `—` when data points are $< 2$.
- **Risk:** Modern borderless pill badge showing the inventory risk classification.

---

## 4. Glossary of Terminologies

| Term | Definition |
| :--- | :--- |
| **Ordinary Least Squares (OLS)** | A linear statistical method that finds the line of best fit by minimizing the sum of squared differences between actual dispensing and estimated values. |
| **Slope ($m$)** | The rate of change in demand per month. A slope of `+15` means consumption is increasing by approximately 15 units every month. |
| **Intercept ($c$)** | The theoretical baseline consumption point where the time index begins ($x = 0$). |
| **$R^2$ (R-Squared)** | A statistical metric between 0.0 and 1.0 indicating how closely the regression line fits actual historical dispensing. Higher values indicate higher predictability. |
| **Projected Demand ($\hat{y}$)** | The calculated future quantity of medicines required by a facility for a given month. |
| **Stockout Risk** | Condition where available inventory is less than the projected demand for the upcoming month ($\text{Coverage} < 1.0\times$) or below safety threshold. |
| **Optimal Buffer** | Inventory level sufficient to satisfy between 1.0 and 2.5 months of anticipated demand without risk of expiry. |
| **Overstock** | Inventory level exceeding 2.5 months of projected demand, representing tied-up municipal resources and potential expiration risk. |
| **Time Horizon** | The forward-looking forecast duration (3, 6, or 12 months) selected for procurement planning. |
| **Data Sufficiency** | The requirement of having at least 2 consecutive monthly dispensing records before regression algorithms can mathematically determine a trend. |

---

## 5. Practical Decision Matrix for Healthcare Workers

```
Is Coverage Multiplier < 1.0x OR Stock <= Threshold?
   ├── YES ──> [STOCKOUT RISK]
   │             • CHO Pharmacist: Create purchase order or batch transfer.
   │             • BHW: Submit requisition to CHO immediately.
   │
   └── NO ───> Is Coverage Multiplier > 2.5x?
                 ├── YES ──> [OVERSTOCK]
                 │             • CHO Pharmacist: Pause reorders; evaluate transfer to health centers in deficit.
                 │             • BHW: Check lot expiration dates; flag slow-moving stock.
                 │
                 └── NO ───> [OPTIMAL]
                               • Maintain regular monitoring and standard monthly reorder cycle.
```

---

## 6. Codebase Reference Map

| Component / Utility | File Path | Primary Responsibility |
| :--- | :--- | :--- |
| **Math & Statistical Logic** | `src/shared/utils/forecastingUtils.js` (desktop)<br>`src/modules/forecasting/forecastingUtils.js` (web) | OLS regression, $R^2$, coverage multipliers, risk tagging, CSV generator. |
| **Unit Test Suite** | `src/shared/utils/forecastingUtils.test.mjs` (desktop)<br>`src/modules/forecasting/forecastingUtils.test.mjs` (web) | Automated validation of regressions, edge cases, zero histories, and risk tiers. |
| **Module Shell & State** | `src/frontend/views/forecasting/ForecastingModule.jsx` (desktop)<br>`src/modules/forecasting/ForecastingModule.jsx` (web) | Data fetching, role scoping, offline cache management, KPI metric assembly. |
| **Projection Chart** | `.../components/charts/ForecastingProjectionChart.jsx` | Canvas chart rendering for actuals, OLS fit, projections, and empty states. |
| **Trends Table** | `.../components/MedicineTrendTable.jsx` | 10-entry paginated table with dynamic facility column and borderless risk badges. |
