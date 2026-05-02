// =============================================
// Admin / Instructor Dashboard
// =============================================

let isAdminLoggedIn = false;
let allSubmissions = [];
let currentGradingId = null;

// ===== Login =====
const adminLoginBtn = document.getElementById('admin-login-btn');
const adminPasswordInput = document.getElementById('admin-password');
const loginError = document.getElementById('login-error');
const adminLoginSection = document.getElementById('admin-login');
const adminDashboard = document.getElementById('admin-dashboard');

adminLoginBtn.addEventListener('click', handleLogin);
adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    const password = adminPasswordInput.value.trim();
    if (password === ADMIN_PASSWORD) {
        isAdminLoggedIn = true;
        adminLoginSection.style.display = 'none';
        adminDashboard.style.display = 'block';
        loginError.style.display = 'none';
        loadSubmissions();
    } else {
        loginError.style.display = 'block';
        adminPasswordInput.value = '';
        adminPasswordInput.focus();
    }
}

document.getElementById('logout-btn').addEventListener('click', () => {
    isAdminLoggedIn = false;
    adminDashboard.style.display = 'none';
    adminLoginSection.style.display = 'flex';
    adminPasswordInput.value = '';
});

// ===== Load Submissions =====
document.getElementById('refresh-btn').addEventListener('click', loadSubmissions);

async function loadSubmissions() {
    const tbody = document.getElementById('submissions-body');
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">⏳ Loading submissions...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('submissions')
            .select('*')
            .order('submitted_at', { ascending: false });

        if (error) throw error;

        allSubmissions = data || [];
        updateStats();
        populateSectionFilter();
        renderSubmissions();
    } catch (err) {
        console.error('Load error:', err);
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">❌ Error loading: ${err.message}</td></tr>`;
    }
}

// ===== Stats =====
function updateStats() {
    const total = allSubmissions.length;
    const graded = allSubmissions.filter(s => s.final_total !== null).length;
    const avgAuto = total > 0 ? (allSubmissions.reduce((sum, s) => sum + (s.auto_total || 0), 0) / total).toFixed(1) : 0;
    const passing = allSubmissions.filter(s => s.final_total !== null && s.final_total >= 70).length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-graded').textContent = `${graded}/${total}`;
    document.getElementById('stat-avg').textContent = avgAuto;
    document.getElementById('stat-passing').textContent = passing;
}

// ===== Section Filter =====
function populateSectionFilter() {
    const select = document.getElementById('filter-section');
    const sections = [...new Set(allSubmissions.map(s => s.section))].sort();
    
    // Keep first option
    select.innerHTML = '<option value="">Lahat</option>';
    sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        select.appendChild(opt);
    });
}

// ===== Filters =====
document.getElementById('filter-section').addEventListener('change', renderSubmissions);
document.getElementById('filter-status').addEventListener('change', renderSubmissions);
document.getElementById('filter-search').addEventListener('input', renderSubmissions);

function getFilteredSubmissions() {
    const section = document.getElementById('filter-section').value;
    const status = document.getElementById('filter-status').value;
    const search = document.getElementById('filter-search').value.toLowerCase().trim();

    return allSubmissions.filter(s => {
        if (section && s.section !== section) return false;
        if (status === 'graded' && s.final_total === null) return false;
        if (status === 'ungraded' && s.final_total !== null) return false;
        if (search) {
            const haystack = `${s.student_name} ${s.student_id} ${s.s3_url}`.toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

// ===== Render Table =====
function renderSubmissions() {
    const tbody = document.getElementById('submissions-body');
    const filtered = getFilteredSubmissions();

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Walang submissions na nahanap.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const isGraded = s.final_total !== null;
        const finalClass = isGraded ? (s.final_total >= 70 ? 'pass' : 'fail') : 'pending';
        const finalText = isGraded ? s.final_total : '—';
        const contentText = s.score_content_design !== null ? s.score_content_design : '—';
        const submissionText = s.score_submission !== null ? s.score_submission : '—';
        const date = new Date(s.submitted_at).toLocaleString('en-PH', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        return `
            <tr>
                <td class="student-info">
                    <strong>${escapeHtml(s.student_name)}</strong>
                    <small>${escapeHtml(s.student_id)}</small>
                </td>
                <td>${escapeHtml(s.section)}</td>
                <td class="url-cell">
                    <a href="${escapeHtml(s.s3_url)}" target="_blank" rel="noopener">${escapeHtml(s.s3_url)}</a>
                </td>
                <td class="score-cell ${s.auto_total >= 56 ? 'pass' : 'fail'}">${s.auto_total}/80</td>
                <td class="score-cell ${s.score_content_design !== null ? '' : 'pending'}">${contentText}</td>
                <td class="score-cell ${s.score_submission !== null ? '' : 'pending'}">${submissionText}</td>
                <td class="score-cell ${finalClass}">${finalText}</td>
                <td><small>${date}</small></td>
                <td>
                    <button class="grade-btn ${isGraded ? 'graded' : ''}" onclick="openGradeModal('${s.id}')">
                        ${isGraded ? '✏️ Edit' : '📝 Grade'}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// =============================================
// Grade Modal
// =============================================
const gradeModal = document.getElementById('grade-modal');
const modalClose = document.getElementById('modal-close');
const saveGradeBtn = document.getElementById('save-grade-btn');

modalClose.addEventListener('click', closeModal);
gradeModal.addEventListener('click', (e) => {
    if (e.target === gradeModal) closeModal();
});

function closeModal() {
    gradeModal.style.display = 'none';
    currentGradingId = null;
}

function openGradeModal(id) {
    const submission = allSubmissions.find(s => s.id === id);
    if (!submission) return;

    currentGradingId = id;

    // Student info
    document.getElementById('modal-student-info').innerHTML = `
        <strong>${escapeHtml(submission.student_name)}</strong> (${escapeHtml(submission.student_id)})<br>
        Section: ${escapeHtml(submission.section)}<br>
        URL: <a href="${escapeHtml(submission.s3_url)}" target="_blank" rel="noopener">${escapeHtml(submission.s3_url)}</a>
    `;

    // Auto scores
    document.getElementById('modal-auto-scores').innerHTML = `
        <div class="score-line"><span>🔗 URL Format:</span> <strong>${submission.score_url_format}/15</strong></div>
        <div class="score-line"><span>🌐 Accessibility:</span> <strong>${submission.score_accessibility}/20</strong></div>
        <div class="score-line"><span>📄 Index Document:</span> <strong>${submission.score_index_doc}/15</strong></div>
        <div class="score-line"><span>🚫 Error Document:</span> <strong>${submission.score_error_doc}/10</strong></div>
        <div class="score-line"><span>🔓 Bucket Policy:</span> <strong>${submission.score_bucket_policy}/10</strong></div>
        <div class="score-line"><span>📁 Assets:</span> <strong>${submission.score_assets}/10</strong></div>
        <div class="score-line" style="border-top:1px solid #e2e8f0;padding-top:6px;margin-top:6px;">
            <span><strong>Auto Total:</strong></span> <strong>${submission.auto_total}/80</strong>
        </div>
    `;

    // Pre-fill existing grades
    document.getElementById('grade-content').value = submission.score_content_design ?? '';
    document.getElementById('grade-submission').value = submission.score_submission ?? '';
    document.getElementById('grade-notes').value = submission.notes || '';

    gradeModal.style.display = 'flex';
}

// ===== Save Grade =====
saveGradeBtn.addEventListener('click', async () => {
    if (!currentGradingId) return;

    const contentScore = parseInt(document.getElementById('grade-content').value);
    const submissionScore = parseInt(document.getElementById('grade-submission').value);
    const notes = document.getElementById('grade-notes').value.trim();

    // Validate
    if (isNaN(contentScore) || contentScore < 0 || contentScore > 15) {
        alert('Content & Design score dapat 0-15 lang.');
        return;
    }
    if (isNaN(submissionScore) || submissionScore < 0 || submissionScore > 5) {
        alert('Submission score dapat 0-5 lang.');
        return;
    }

    const submission = allSubmissions.find(s => s.id === currentGradingId);
    if (!submission) return;

    const finalTotal = submission.auto_total + contentScore + submissionScore;

    saveGradeBtn.disabled = true;
    saveGradeBtn.textContent = '⏳ Saving...';

    try {
        const { error } = await supabase
            .from('submissions')
            .update({
                score_content_design: contentScore,
                score_submission: submissionScore,
                final_total: finalTotal,
                notes: notes || null,
                graded_by: 'instructor',
                graded_at: new Date().toISOString()
            })
            .eq('id', currentGradingId);

        if (error) throw error;

        // Update local data
        submission.score_content_design = contentScore;
        submission.score_submission = submissionScore;
        submission.final_total = finalTotal;
        submission.notes = notes;

        updateStats();
        renderSubmissions();
        closeModal();
    } catch (err) {
        console.error('Grade save error:', err);
        alert('Error saving grade: ' + err.message);
    }

    saveGradeBtn.disabled = false;
    saveGradeBtn.textContent = '💾 Save Grade';
});

// =============================================
// Export CSV
// =============================================
document.getElementById('export-btn').addEventListener('click', exportCSV);

function exportCSV() {
    const filtered = getFilteredSubmissions();
    if (filtered.length === 0) {
        alert('Walang data na i-export.');
        return;
    }

    const headers = [
        'Student Name', 'Student ID', 'Section', 'S3 URL',
        'URL Format (15)', 'Accessibility (20)', 'Index Doc (15)',
        'Error Doc (10)', 'Bucket Policy (10)', 'Assets (10)',
        'Auto Total (80)', 'Content & Design (15)', 'Submission (5)',
        'Final Total (100)', 'Submitted At', 'Notes'
    ];

    const rows = filtered.map(s => [
        s.student_name,
        s.student_id,
        s.section,
        s.s3_url,
        s.score_url_format,
        s.score_accessibility,
        s.score_index_doc,
        s.score_error_doc,
        s.score_bucket_policy,
        s.score_assets,
        s.auto_total,
        s.score_content_design ?? '',
        s.score_submission ?? '',
        s.final_total ?? '',
        new Date(s.submitted_at).toLocaleString(),
        s.notes || ''
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `s3-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
