// =============================================
// Supabase Client Init
// =============================================
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =============================================
// Tab Navigation
// =============================================
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// =============================================
// S3 URL Patterns
// =============================================
const S3_PATTERNS = {
    websiteEndpointDash: /^https?:\/\/(.+)\.s3-website-([a-z0-9-]+)\.amazonaws\.com\/?$/i,
    websiteEndpointDot: /^https?:\/\/(.+)\.s3-website\.([a-z0-9-]+)\.amazonaws\.com\/?$/i,
    s3ObjectUrl: /^https?:\/\/(.+)\.s3\.([a-z0-9-]+)\.amazonaws\.com\/?$/i,
    s3PathStyle: /^https?:\/\/s3\.([a-z0-9-]+)\.amazonaws\.com\/([^/]+)\/?$/i,
    isS3: /amazonaws\.com/i,
};

// =============================================
// Checker Elements
// =============================================
const checkBtn = document.getElementById('check-btn');
const urlInput = document.getElementById('s3-url');
const studentNameInput = document.getElementById('student-name');
const studentIdInput = document.getElementById('student-id');
const studentSectionInput = document.getElementById('student-section');
const resultsSection = document.getElementById('results');
const resultsList = document.getElementById('results-list');
const totalScoreEl = document.getElementById('total-score');
const saveStatusEl = document.getElementById('save-status');

checkBtn.addEventListener('click', runCheck);
urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runCheck(); });

document.getElementById('recheck-btn').addEventListener('click', () => {
    resultsSection.style.display = 'none';
    urlInput.focus();
});

document.getElementById('copy-results').addEventListener('click', copyResults);

// =============================================
// Main Check Function
// =============================================
async function runCheck() {
    const url = urlInput.value.trim();
    const studentName = studentNameInput.value.trim();
    const studentId = studentIdInput.value.trim();
    const section = studentSectionInput.value.trim();

    // Validate required fields
    if (!studentName || !studentId || !section || !url) {
        [studentNameInput, studentIdInput, studentSectionInput, urlInput].forEach(input => {
            if (!input.value.trim()) {
                input.style.borderColor = '#e53e3e';
                setTimeout(() => input.style.borderColor = '', 2500);
            }
        });
        return;
    }

    // UI: loading state
    checkBtn.disabled = true;
    checkBtn.querySelector('.btn-text').style.display = 'none';
    checkBtn.querySelector('.btn-loading').style.display = 'inline';
    resultsSection.style.display = 'none';
    saveStatusEl.style.display = 'none';

    const results = [];

    try {
        const urlCheck = checkUrlFormat(url);
        results.push(urlCheck);

        const accessCheck = await checkAccessibility(url);
        results.push(accessCheck);

        const indexCheck = await checkIndexDocument(url, accessCheck);
        results.push(indexCheck);

        const errorCheck = await checkErrorDocument(url);
        results.push(errorCheck);

        const policyCheck = checkBucketPolicy(accessCheck);
        results.push(policyCheck);

        const assetsCheck = await checkAssets(url, accessCheck);
        results.push(assetsCheck);

        results.push({
            name: 'Website Content & Design',
            icon: '🧑‍🏫', score: null, maxScore: 15,
            status: 'manual', message: 'Graded manually by the instructor'
        });

        results.push({
            name: 'Submission Timeliness',
            icon: '🧑‍🏫', score: null, maxScore: 5,
            status: 'manual', message: 'Graded manually by the instructor'
        });

    } catch (err) {
        console.error('Check error:', err);
    }

    displayResults(results);

    // Save to Supabase
    await saveSubmission(studentName, studentId, section, url, results);

    // UI: reset button
    checkBtn.disabled = false;
    checkBtn.querySelector('.btn-text').style.display = 'inline';
    checkBtn.querySelector('.btn-loading').style.display = 'none';
}

// =============================================
// Save to Supabase
// =============================================
async function saveSubmission(name, studentId, section, url, results) {
    const autoResults = results.filter(r => r.status !== 'manual');
    const autoTotal = autoResults.reduce((sum, r) => sum + (r.score || 0), 0);

    const submission = {
        student_name: name,
        student_id: studentId,
        section: section.toUpperCase(),
        s3_url: url,
        score_url_format: getScore(results, 'Correct S3 URL Format'),
        score_accessibility: getScore(results, 'Website Accessibility'),
        score_index_doc: getScore(results, 'Index Document (index.html)'),
        score_error_doc: getScore(results, 'Error Document (error.html)'),
        score_bucket_policy: getScore(results, 'Bucket Policy (Public Access)'),
        score_assets: getScore(results, 'Multiple Pages / Assets'),
        auto_total: autoTotal,
        check_details: results.map(r => ({
            name: r.name,
            score: r.score,
            maxScore: r.maxScore,
            status: r.status,
            message: r.message
        }))
    };

    try {
        const { data, error } = await db
            .from('submissions')
            .insert([submission])
            .select();

        if (error) throw error;

        saveStatusEl.className = 'save-status success';
        saveStatusEl.textContent = '✅ Submission saved successfully! Your instructor will grade Content & Design and Submission scores.';
        saveStatusEl.style.display = 'block';
    } catch (err) {
        console.error('Save error:', err);
        saveStatusEl.className = 'save-status error';
        saveStatusEl.textContent = '❌ Failed to save submission. Error: ' + (err.message || 'Unknown error. Please check the Supabase configuration.');
        saveStatusEl.style.display = 'block';
    }
}

function getScore(results, name) {
    const r = results.find(r => r.name === name);
    return r ? (r.score || 0) : 0;
}

// =============================================
// Individual Check Functions
// =============================================
function checkUrlFormat(url) {
    const result = { name: 'Correct S3 URL Format', icon: '🔗', maxScore: 15, score: 0, status: 'fail', message: '' };

    if (S3_PATTERNS.websiteEndpointDash.test(url) || S3_PATTERNS.websiteEndpointDot.test(url)) {
        result.score = 15; result.status = 'pass';
        result.message = 'Correct S3 website endpoint format!';
    } else if (S3_PATTERNS.s3ObjectUrl.test(url)) {
        result.score = 10; result.status = 'partial';
        result.message = 'This is an S3 URL but not the website endpoint. Use the URL from Properties → Static website hosting.';
    } else if (S3_PATTERNS.s3PathStyle.test(url)) {
        result.score = 5; result.status = 'partial';
        result.message = 'This is a path-style S3 URL. Use the website endpoint URL instead.';
    } else if (S3_PATTERNS.isS3.test(url)) {
        result.score = 5; result.status = 'partial';
        result.message = 'Contains an S3 reference but the format is incorrect.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'This is not an S3 URL. Make sure to submit the S3 website endpoint.';
    }
    return result;
}

async function checkAccessibility(url) {
    const result = {
        name: 'Website Accessibility', icon: '🌐', maxScore: 20,
        score: 0, status: 'fail', message: '',
        httpStatus: null, responseOk: false, htmlContent: ''
    };

    try {
        const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache', redirect: 'follow' });
        result.httpStatus = response.status;

        if (response.ok) {
            result.score = 20; result.status = 'pass';
            result.message = `Website accessible! HTTP ${response.status}`;
            result.responseOk = true;
            try { result.htmlContent = await response.text(); } catch { result.htmlContent = ''; }
        } else if (response.status === 403) {
            result.score = 0; result.status = 'fail';
            result.message = 'HTTP 403 Forbidden — The bucket is not public. Check the bucket policy and "Block public access" settings.';
        } else if (response.status === 404) {
            result.score = 5; result.status = 'partial';
            result.message = 'HTTP 404 — No index.html found. Upload index.html to the bucket.';
        } else {
            result.score = 5; result.status = 'partial';
            result.message = `HTTP ${response.status} — There is an issue with the website.`;
        }
    } catch {
        try {
            const probeResult = await probeUrl(url);
            if (probeResult === 'reachable') {
                result.score = 15; result.status = 'partial';
                result.message = 'Website appears reachable but content cannot be verified due to CORS policy. Open the link in a new tab to verify manually.';
                result.responseOk = true;
            } else {
                result.score = 0; result.status = 'fail';
                result.message = 'Cannot access the website. Check if the URL is correct.';
            }
        } catch {
            result.score = 0; result.status = 'fail';
            result.message = 'Cannot access the website. Check the URL and static website hosting configuration.';
        }
    }
    return result;
}

function probeUrl(url) {
    return new Promise((resolve) => {
        fetch(url, { mode: 'no-cors', cache: 'no-cache' })
            .then(() => resolve('reachable'))
            .catch(() => resolve('unreachable'));
    });
}

async function checkIndexDocument(url, accessCheck) {
    const result = { name: 'Index Document (index.html)', icon: '📄', maxScore: 15, score: 0, status: 'fail', message: '' };

    if (accessCheck.responseOk && accessCheck.htmlContent) {
        const html = accessCheck.htmlContent.toLowerCase();
        if (html.includes('<!doctype html') || html.includes('<html') || html.includes('<head') || html.includes('<body')) {
            result.score = 15; result.status = 'pass';
            result.message = 'index.html is configured and loading HTML content!';
        } else if (html.length > 0) {
            result.score = 10; result.status = 'partial';
            result.message = 'Content is loading but it does not appear to be proper HTML.';
        } else {
            result.score = 5; result.status = 'partial';
            result.message = 'Server responded but returned no content.';
        }
    } else if (accessCheck.responseOk) {
        result.score = 10; result.status = 'partial';
        result.message = 'Website is reachable — index.html is likely configured but content cannot be verified (CORS).';
    } else if (accessCheck.httpStatus === 404) {
        result.score = 0; result.status = 'fail';
        result.message = 'No index.html detected. Upload it to the bucket root.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Cannot verify — website is not accessible.';
    }
    return result;
}

async function checkErrorDocument(url) {
    const result = { name: 'Error Document (error.html)', icon: '🚫', maxScore: 10, score: 0, status: 'fail', message: '' };
    const errorUrl = url.replace(/\/?$/, '/') + 'this-page-does-not-exist-' + Date.now();

    try {
        const response = await fetch(errorUrl, { method: 'GET', mode: 'cors', cache: 'no-cache' });

        if (response.status === 404 || response.status === 403) {
            try {
                const html = await response.text();
                const htmlLower = html.toLowerCase();

                if (htmlLower.includes('<html') && !htmlLower.includes('<code>nosuchkey</code>') && !htmlLower.includes('accessdenied')) {
                    if (htmlLower.includes('error') || htmlLower.includes('404') || htmlLower.includes('not found') || htmlLower.includes('page')) {
                        result.score = 10; result.status = 'pass';
                        result.message = 'Custom error page detected and working!';
                    } else {
                        result.score = 7; result.status = 'partial';
                        result.message = 'A custom page is shown on error but it has no clear error message.';
                    }
                } else if (htmlLower.includes('nosuchkey') || htmlLower.includes('accessdenied') || htmlLower.includes('<error>')) {
                    result.score = 0; result.status = 'fail';
                    result.message = 'Default S3 XML error page is showing. Create an error.html and configure it in Static Website Hosting settings.';
                } else if (html.trim().length > 50) {
                    result.score = 7; result.status = 'partial';
                    result.message = 'A custom response was returned but it cannot be confirmed as a proper error page.';
                } else {
                    result.score = 0; result.status = 'fail';
                    result.message = 'No custom error page found. Create an error.html file.';
                }
            } catch {
                result.score = 4; result.status = 'partial';
                result.message = 'Server responded to the error URL but the content could not be read.';
            }
        } else if (response.ok) {
            result.score = 4; result.status = 'partial';
            result.message = 'Error URL returned HTTP 200 — possible redirect to index. Check if a separate error.html exists.';
        }
    } catch {
        result.score = 0; result.status = 'fail';
        result.message = 'Cannot check the error page (CORS issue). Verify manually by visiting a non-existent page on your website.';
    }
    return result;
}

function checkBucketPolicy(accessCheck) {
    const result = { name: 'Bucket Policy (Public Access)', icon: '🔓', maxScore: 10, score: 0, status: 'fail', message: '' };

    if (accessCheck.responseOk && accessCheck.httpStatus === 200) {
        result.score = 10; result.status = 'pass';
        result.message = 'Bucket policy is correct — public read access is working!';
    } else if (accessCheck.responseOk) {
        result.score = 7; result.status = 'partial';
        result.message = 'Website is reachable — bucket policy is likely correct.';
    } else if (accessCheck.httpStatus === 403) {
        result.score = 0; result.status = 'fail';
        result.message = '403 Forbidden — no public access. Add the bucket policy and uncheck "Block all public access".';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Cannot verify bucket policy — website is not accessible.';
    }
    return result;
}

async function checkAssets(url, accessCheck) {
    const result = { name: 'Multiple Pages / Assets', icon: '📁', maxScore: 10, score: 0, status: 'fail', message: '' };

    if (!accessCheck.responseOk || !accessCheck.htmlContent) {
        if (accessCheck.responseOk) {
            result.score = 4; result.status = 'partial';
            result.message = 'Cannot analyze assets (CORS). Verify manually if CSS, JS, and images are present.';
        } else {
            result.score = 0; result.status = 'fail';
            result.message = 'Cannot check — website is not accessible.';
        }
        return result;
    }

    const html = accessCheck.htmlContent;
    const findings = [];

    if ((html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || []).length > 0 ||
        (html.match(/href=["'][^"']+\.css["']/gi) || []).length > 0) {
        findings.push('CSS');
    }
    if ((html.match(/<script[^>]+src=["'][^"']+["'][^>]*>/gi) || []).length > 0) {
        findings.push('JS');
    }
    const images = html.match(/<img[^>]+src=["'][^"']+["'][^>]*>/gi) || [];
    if (images.length > 0) findings.push(`${images.length} image(s)`);

    const internalLinks = html.match(/<a[^>]+href=["'](?!https?:\/\/|#|mailto:)[^"']+\.html?["'][^>]*>/gi) || [];
    if (internalLinks.length > 0) findings.push(`${internalLinks.length} internal link(s)`);

    const inlineStyles = html.match(/<style[^>]*>/gi) || [];
    const hasInlineStyle = html.match(/style=["'][^"']+["']/gi) || [];

    if (findings.length >= 3) {
        result.score = 10; result.status = 'pass';
        result.message = `Multiple assets detected: ${findings.join(', ')}`;
    } else if (findings.length >= 1) {
        result.score = 7; result.status = 'partial';
        result.message = `Assets found: ${findings.join(', ')}. Add more pages/assets for full score.`;
    } else if (inlineStyles.length > 0 || hasInlineStyle.length > 0) {
        result.score = 4; result.status = 'partial';
        result.message = 'Only inline styles detected. Use an external CSS file for a higher score.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'No external assets detected. Add CSS, JS, images, or additional pages.';
    }
    return result;
}

// =============================================
// Display Results
// =============================================
function displayResults(results) {
    resultsList.innerHTML = '';
    let autoTotal = 0;
    let autoMax = 0;

    results.forEach(r => {
        const item = document.createElement('div');
        item.className = 'result-item';

        let scoreClass = 'zero';
        let scoreText = '';

        if (r.status === 'manual') {
            scoreClass = 'manual';
            scoreText = `🧑‍🏫 /${r.maxScore}`;
        } else {
            autoTotal += r.score;
            autoMax += r.maxScore;
            if (r.score === r.maxScore) scoreClass = 'full';
            else if (r.score > 0) scoreClass = 'partial';
            else scoreClass = 'zero';
            scoreText = `${r.score}/${r.maxScore}`;
        }

        item.innerHTML = `
            <div class="result-icon">${r.status === 'pass' ? '✅' : r.status === 'partial' ? '⚠️' : r.status === 'manual' ? '🧑‍🏫' : '❌'}</div>
            <div class="result-details">
                <strong>${r.name}</strong>
                <small>${r.message}</small>
            </div>
            <div class="result-score ${scoreClass}">${scoreText}</div>
        `;
        resultsList.appendChild(item);
    });

    const manualMax = 20;
    totalScoreEl.textContent = `${autoTotal}/${autoMax} (auto) + /${manualMax} (manual)`;
    totalScoreEl.className = 'total-score ' + (autoTotal >= (autoMax * 0.7) ? 'pass' : 'fail');

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =============================================
// Copy Results
// =============================================
function copyResults() {
    const items = document.querySelectorAll('.result-item');
    let text = '=== S3 Static Website Hosting - Check Results ===\n';
    text += `Student: ${studentNameInput.value} (${studentIdInput.value})\n`;
    text += `Section: ${studentSectionInput.value}\n`;
    text += `URL: ${urlInput.value}\n`;
    text += `Date: ${new Date().toLocaleString()}\n\n`;

    items.forEach(item => {
        const name = item.querySelector('.result-details strong').textContent;
        const message = item.querySelector('.result-details small').textContent;
        const score = item.querySelector('.result-score').textContent;
        text += `${name}: ${score}\n  → ${message}\n\n`;
    });

    text += `Total (auto): ${totalScoreEl.textContent}\n`;

    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-results');
        const original = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => btn.textContent = original, 2000);
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const btn = document.getElementById('copy-results');
        btn.textContent = '✅ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy Results', 2000);
    });
}
