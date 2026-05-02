// =============================================
// Supabase Client Init
// =============================================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

document.getElementById('recheck-btn')?.addEventListener('click', () => {
    resultsSection.style.display = 'none';
    urlInput.focus();
});

document.getElementById('copy-results')?.addEventListener('click', copyResults);

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

        const policyCheck = checkBucketPolicy(accessCheck, urlCheck);
        results.push(policyCheck);

        const assetsCheck = await checkAssets(url, accessCheck);
        results.push(assetsCheck);

        results.push({
            name: 'Website Content & Design',
            icon: '🧑‍🏫', score: null, maxScore: 15,
            status: 'manual', message: 'Manu-manong i-grade ng instructor'
        });

        results.push({
            name: 'Submission Timeliness',
            icon: '🧑‍🏫', score: null, maxScore: 5,
            status: 'manual', message: 'Manu-manong i-grade ng instructor'
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
        const { data, error } = await supabase
            .from('submissions')
            .insert([submission])
            .select();

        if (error) throw error;

        saveStatusEl.className = 'save-status success';
        saveStatusEl.textContent = '✅ Submission saved successfully! Ang instructor mo na ang mag-grade ng Content & Design at Submission score.';
        saveStatusEl.style.display = 'block';
    } catch (err) {
        console.error('Save error:', err);
        saveStatusEl.className = 'save-status error';
        saveStatusEl.textContent = '❌ Hindi ma-save ang submission. Error: ' + (err.message || 'Unknown error. I-check ang Supabase config.');
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
        result.message = 'Tama ang S3 website endpoint format!';
    } else if (S3_PATTERNS.s3ObjectUrl.test(url)) {
        result.score = 10; result.status = 'partial';
        result.message = 'S3 URL ito pero hindi website endpoint. Gamitin ang URL mula sa Properties → Static website hosting.';
    } else if (S3_PATTERNS.s3PathStyle.test(url)) {
        result.score = 5; result.status = 'partial';
        result.message = 'Path-style S3 URL ito. Gamitin ang website endpoint URL.';
    } else if (S3_PATTERNS.isS3.test(url)) {
        result.score = 5; result.status = 'partial';
        result.message = 'May S3 reference pero mali ang format.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Hindi ito S3 URL. Siguraduhing S3 website endpoint ang isusumit.';
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
            result.message = 'HTTP 403 Forbidden — Hindi public ang bucket. I-check ang bucket policy.';
        } else if (response.status === 404) {
            result.score = 5; result.status = 'partial';
            result.message = 'HTTP 404 — Walang index.html. I-upload ang index.html sa bucket.';
        } else {
            result.score = 5; result.status = 'partial';
            result.message = `HTTP ${response.status} — May issue ang website.`;
        }
    } catch {
        try {
            const probeResult = await probeUrl(url);
            if (probeResult === 'reachable') {
                result.score = 15; result.status = 'partial';
                result.message = 'Website appears reachable pero hindi ma-verify ang content (CORS). Buksan sa bagong tab para i-verify.';
                result.responseOk = true;
            } else {
                result.score = 0; result.status = 'fail';
                result.message = 'Hindi ma-access ang website. I-check kung tama ang URL.';
            }
        } catch {
            result.score = 0; result.status = 'fail';
            result.message = 'Hindi ma-access ang website. I-check ang URL at static website hosting config.';
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
            result.message = 'index.html naka-configure at nag-lo-load ng HTML content!';
        } else if (html.length > 0) {
            result.score = 10; result.status = 'partial';
            result.message = 'May content pero mukhang hindi proper HTML.';
        } else {
            result.score = 5; result.status = 'partial';
            result.message = 'Nag-respond ang server pero walang content.';
        }
    } else if (accessCheck.responseOk) {
        result.score = 10; result.status = 'partial';
        result.message = 'Website reachable — index.html likely configured pero hindi ma-verify (CORS).';
    } else if (accessCheck.httpStatus === 404) {
        result.score = 0; result.status = 'fail';
        result.message = 'Walang index.html. I-upload sa bucket root.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Hindi ma-verify — website not accessible.';
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
                    if (htmlLower.includes('error') || htmlLower.includes('404') || htmlLower.includes('not found') || htmlLower.includes('hindi') || htmlLower.includes('page')) {
                        result.score = 10; result.status = 'pass';
                        result.message = 'Custom error page detected at gumagana!';
                    } else {
                        result.score = 7; result.status = 'partial';
                        result.message = 'May custom page pero walang clear error message.';
                    }
                } else if (htmlLower.includes('nosuchkey') || htmlLower.includes('accessdenied') || htmlLower.includes('<error>')) {
                    result.score = 0; result.status = 'fail';
                    result.message = 'Default S3 XML error page. Gumawa ng error.html.';
                } else if (html.trim().length > 50) {
                    result.score = 7; result.status = 'partial';
                    result.message = 'May custom response pero hindi ma-confirm kung proper error page.';
                } else {
                    result.score = 0; result.status = 'fail';
                    result.message = 'Walang custom error page. Gumawa ng error.html.';
                }
            } catch {
                result.score = 4; result.status = 'partial';
                result.message = 'Server nag-respond pero hindi ma-read ang content.';
            }
        } else if (response.ok) {
            result.score = 4; result.status = 'partial';
            result.message = 'Error URL nag-return ng 200 — possible redirect. I-check kung may separate error.html.';
        }
    } catch {
        result.score = 0; result.status = 'fail';
        result.message = 'Hindi ma-check ang error page (CORS). I-verify manually.';
    }
    return result;
}

function checkBucketPolicy(accessCheck) {
    const result = { name: 'Bucket Policy (Public Access)', icon: '🔓', maxScore: 10, score: 0, status: 'fail', message: '' };

    if (accessCheck.responseOk && accessCheck.httpStatus === 200) {
        result.score = 10; result.status = 'pass';
        result.message = 'Bucket policy tama — public read access gumagana!';
    } else if (accessCheck.responseOk) {
        result.score = 7; result.status = 'partial';
        result.message = 'Website reachable — bucket policy likely correct.';
    } else if (accessCheck.httpStatus === 403) {
        result.score = 0; result.status = 'fail';
        result.message = '403 Forbidden — walang public access. I-add ang bucket policy.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Hindi ma-verify — website not accessible.';
    }
    return result;
}

async function checkAssets(url, accessCheck) {
    const result = { name: 'Multiple Pages / Assets', icon: '📁', maxScore: 10, score: 0, status: 'fail', message: '' };

    if (!accessCheck.responseOk || !accessCheck.htmlContent) {
        if (accessCheck.responseOk) {
            result.score = 4; result.status = 'partial';
            result.message = 'Hindi ma-analyze ang assets (CORS). I-verify manually.';
        } else {
            result.score = 0; result.status = 'fail';
            result.message = 'Hindi ma-check — website not accessible.';
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
        result.message = `May assets: ${findings.join(', ')}. Mag-add pa para sa full score.`;
    } else if (inlineStyles.length > 0 || hasInlineStyle.length > 0) {
        result.score = 4; result.status = 'partial';
        result.message = 'Inline styles lang. Gumamit ng external CSS file.';
    } else {
        result.score = 0; result.status = 'fail';
        result.message = 'Walang external assets. Mag-add ng CSS, JS, images, o pages.';
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
