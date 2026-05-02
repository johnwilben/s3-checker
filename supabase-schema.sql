-- =============================================
-- Supabase Schema for S3 Website Checker
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. Table: submissions
-- Stores each student submission
CREATE TABLE IF NOT EXISTS submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    section TEXT NOT NULL,
    s3_url TEXT NOT NULL,
    
    -- Automated scores
    score_url_format INTEGER DEFAULT 0,
    score_accessibility INTEGER DEFAULT 0,
    score_index_doc INTEGER DEFAULT 0,
    score_error_doc INTEGER DEFAULT 0,
    score_bucket_policy INTEGER DEFAULT 0,
    score_assets INTEGER DEFAULT 0,
    
    -- Manual scores (instructor fills in)
    score_content_design INTEGER DEFAULT NULL,
    score_submission INTEGER DEFAULT NULL,
    
    -- Auto total (sum of automated scores)
    auto_total INTEGER DEFAULT 0,
    -- Final total (auto + manual, updated by instructor)
    final_total INTEGER DEFAULT NULL,
    
    -- Detailed results JSON
    check_details JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    graded_by TEXT DEFAULT NULL,
    graded_at TIMESTAMPTZ DEFAULT NULL,
    notes TEXT DEFAULT NULL
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_section ON submissions(section);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can INSERT (students submit)
CREATE POLICY "Anyone can submit" ON submissions
    FOR INSERT
    WITH CHECK (true);

-- Policy: Anyone can SELECT (students see their results, instructor sees all)
CREATE POLICY "Anyone can view submissions" ON submissions
    FOR SELECT
    USING (true);

-- Policy: Anyone can UPDATE (so instructor can grade)
-- In production, restrict this to authenticated instructors only
CREATE POLICY "Anyone can update" ON submissions
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- 4. Function: auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_updated_at
    BEFORE UPDATE ON submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 5. View: Summary per section
CREATE OR REPLACE VIEW section_summary AS
SELECT 
    section,
    COUNT(*) as total_students,
    COUNT(CASE WHEN final_total IS NOT NULL THEN 1 END) as graded_count,
    ROUND(AVG(auto_total), 1) as avg_auto_score,
    ROUND(AVG(final_total), 1) as avg_final_score,
    COUNT(CASE WHEN final_total >= 70 THEN 1 END) as passing_count,
    COUNT(CASE WHEN final_total < 70 THEN 1 END) as failing_count
FROM submissions
GROUP BY section
ORDER BY section;
