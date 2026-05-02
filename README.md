# ☁️ AWS S3 Static Website Hosting — Rubrics & Checker

Automated grading tool para sa college students na nag-aaral ng AWS S3 Static Website Hosting. Hosted sa **GitHub Pages**, nag-save ng submissions sa **Supabase**.

## ✨ Features

- **📋 Rubrics** — Full grading rubrics (100 points, 70 passing)
- **🔍 Automated Checker** — Students paste their S3 URL, auto-checks 6 criteria
- **💾 Supabase Integration** — Submissions auto-saved sa database
- **🔐 Instructor Dashboard** — View all submissions, grade manually, export CSV
- **📖 Step-by-Step Guide** — Tagalog guide para sa students
- **📱 Responsive** — Works sa desktop at mobile

## 🚀 Setup Instructions

### 1. Supabase Setup

1. Gumawa ng account sa [supabase.com](https://supabase.com)
2. Create new project
3. Pumunta sa **SQL Editor**
4. I-paste at i-run ang laman ng `supabase-schema.sql`
5. Kunin ang credentials:
   - **Project URL**: Settings → API → Project URL
   - **Anon Key**: Settings → API → `anon` `public` key

### 2. Configure

I-edit ang `config.js`:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
const ADMIN_PASSWORD = 'your-instructor-password';
```

### 3. Deploy sa GitHub Pages

1. Push ang repo sa GitHub
2. Pumunta sa repo **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` → `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes, live na ang site sa `https://username.github.io/repo-name/`

## 📁 File Structure

```
├── index.html          # Main HTML (all tabs)
├── styles.css          # All styles
├── config.js           # Supabase credentials (EDIT THIS)
├── checker.js          # S3 checker logic + Supabase save
├── admin.js            # Instructor dashboard logic
├── supabase-schema.sql # Database schema (run sa Supabase SQL Editor)
└── README.md           # This file
```

## 📊 Grading Rubrics (100 pts)

| Criteria | Points | Type |
|---|---|---|
| Website Accessibility | 20 | Auto |
| Correct S3 URL Format | 15 | Auto |
| Index Document | 15 | Auto |
| Error Document | 10 | Auto |
| Bucket Policy | 10 | Auto |
| Multiple Pages/Assets | 10 | Auto |
| Content & Design | 15 | Manual |
| Submission Timeliness | 5 | Manual |

## 🔐 Instructor Dashboard

- Default password: `instructor2026` (palitan sa `config.js`)
- Grade Content & Design (0-15) at Submission (0-5) per student
- Export lahat ng submissions as CSV
- Filter by section, graded/ungraded status, o search by name

## ⚠️ Notes

- Ang checker ay client-side — some S3 buckets may block CORS requests. Ang checker handles this gracefully.
- Ang `config.js` ay may Supabase anon key — safe ito for client-side use dahil protected ng Row Level Security (RLS).
- Para sa production, i-restrict ang UPDATE policy sa authenticated instructors lang.
