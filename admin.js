async function adminWipeAllData() {
    const pass = await customPrompt("⚠️ אזהרה: פעולה זו תמחק את כל הנתונים באתר (משתמשים, צ'אטים, הישגים וכו')!\nהטבלאות עצמן יישארו.\n\nכדי לאשר, הקלד 'מחק הכל':");
    if (pass !== 'מחק הכל') return;

    const confirm2 = await customConfirm("האם אתה בטוח ב-100%? אין דרך חזרה.");
    if (!confirm2) return;

    showToast("מתחיל במחיקת נתונים...", "info");

    try {
        // מחיקת נתונים מטבלאות קשורות תחילה
        const tables = ['message_reactions', 'book_chat_reactions', 'siyum_reactions', 'chat_messages', 'book_chats', 'user_followers', 'user_inventory', 'user_goals', 'siyum_board', 'chavruta_requests', 'schedules', 'user_reports', 'user_consents', 'site_visits', 'suggestions', 'system_announcements', 'cookie_consents', 'ad_stats'];

        for (const table of tables) {
            await supabaseClient.from(table).delete().neq('id', 0); // מחיקת כל השורות
        }

        // מחיקת משתמשים (למעט המנהל הנוכחי כדי לא לנתק)
        if (currentUser) {
            await supabaseClient.from('users').delete().neq('email', currentUser.email);
        }

        showToast("כל הנתונים נמחקו בהצלחה.", "success");
        setTimeout(() => location.reload(), 2000);
    } catch (e) {
        console.error("Wipe error:", e);
        await customAlert("אירעה שגיאה במחיקת הנתונים: " + e.message);
    }
}

async function executeAdminSQL() {
    let query = document.getElementById('adminSqlInput').value.trim();
    const output = document.getElementById('adminSqlOutput');
    if (!query) {
        output.innerText = 'נא להזין שאילתת SQL.';
        return;
    }

    // הסרת נקודה-פסיק בסוף השאילתה, אם קיימת, כדי למנוע שגיאת תחביר ב-plpgsql
    if (query.endsWith(';')) {
        query = query.slice(0, -1);
    }

    output.innerText = 'מריץ שאילתה...';

    try {
        // This RPC call requires a function named 'exec' in your Supabase SQL editor.
        const { data, error } = await supabaseClient.rpc('exec', { sql: query });

        if (error) throw error;

        output.innerText = JSON.stringify(data, null, 2);
        showToast('השאילתה בוצעה בהצלחה.', 'success');
    } catch (e) {
        output.innerText = 'שגיאה:\n' + e.message;
        showToast('שגיאה בביצוע השאילתה.', 'error');
        console.error("SQL Execution Error:", e);
    }
}

async function runSchemaQuery() {
    const schemaQuery = `SELECT 
    cols.table_schema, 
    cols.table_name, 
    cols.column_name, 
    cols.data_type, 
    kcu.constraint_name AS foreign_key_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM 
    information_schema.columns cols
LEFT JOIN 
    information_schema.key_column_usage kcu 
    ON cols.table_schema = kcu.table_schema 
    AND cols.table_name = kcu.table_name 
    AND cols.column_name = kcu.column_name
LEFT JOIN 
    information_schema.constraint_column_usage ccu 
    ON kcu.constraint_name = ccu.constraint_name
WHERE 
    cols.table_schema = 'public' -- מסנן לטבלאות שאתה יצרת
ORDER BY 
    cols.table_name, 
    cols.ordinal_position`;

    // Set the query in the textarea and execute it
    document.getElementById('adminSqlInput').value = schemaQuery.trim();
    await executeAdminSQL();
}

function logoutBot() {
    currentUser = realAdminUser;
    realAdminUser = null;
    localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
    location.reload(); // רענון כדי להיכנס כבוט
}

function loginAsBot(botUser) {
    realAdminUser = currentUser; // שמירת המנהל המקורי
    currentUser = mapUserFromDB(botUser);
    currentUser.isBot = true;
    previousRank = null;

    // איפוס מוחלט של נתונים מקומיים
    userGoals = []; // איפוס לימודים
    chavrutaConnections = []; // איפוס חברותות
    unreadMessages = {}; // איפוס הודעות
    approvedPartners = new Set(); // איפוס חברים מאושרים
    pendingSentRequests = []; // איפוס בקשות
    notifications = []; // איפוס התראות

    // ניקוי ויזואלי מיידי
    document.getElementById('goalsList').innerHTML = '';
    document.getElementById('chavrutasList').innerHTML = '';
    document.getElementById('dailyTasksList').innerHTML = '';

    localStorage.setItem('torahApp_goals', '[]'); // איפוס לוקאלי
    localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
    // אין צורך ברענון מלא, אפשר לעדכן את הממשק
    document.getElementById('bot-mode-indicator').style.display = 'block';
    document.getElementById('headerUserEmail').style.display = 'none';
    updateProfileUI();
    switchScreen('dashboard', document.querySelectorAll('.nav-item')[1]);
    updateHeader();
    updateNotifUI();
    renderGoals();
    renderChavrutas();
    syncGlobalData();
}

async function createBot() {
    const name = document.getElementById('newBotName').value;
    if (!name) return customAlert("נא להזין שם לבוט");

    const botEmail = `user_${Math.random().toString(36).substring(2, 10)}@local.app`;
    const botPass = `bot${Date.now()}`; // סיסמה אקראית

    try {
        const { error } = await supabaseClient.from('users').insert([{
            email: botEmail,
            password: botPass,
            display_name: name,
            is_bot: true,
            is_anonymous: false
        }]);

        if (error) throw error;
        showToast("בוט נוצר בהצלחה!", "success");
        document.getElementById('newBotName').value = '';
        renderAdminTools();
    } catch (e) {
        console.error(e);
        await customAlert("שגיאה ביצירת בוט");
    }
}

async function adminDeleteChatRange() {
    const emailsInput = document.getElementById('resetChatEmail1').value;
    const start = document.getElementById('resetChatStart').value;
    const end = document.getElementById('resetChatEnd').value;

    if (!start || !end) return customAlert("חובה להזין טווח תאריכים");
    if (!(await customConfirm("פעולה זו תמחק הודעות לצמיתות. להמשיך?"))) return;

    let query = supabaseClient.from('chat_messages').delete()
        .gte('created_at', start + 'T00:00:00')
        .lte('created_at', end + 'T23:59:59');

    if (emailsInput) {
        const emails = emailsInput.split(',').map(e => e.trim());
        // מחיקת הודעות שבהן השולח או המקבל נמצאים ברשימה
        // Supabase לא תומך ב-OR מורכב עם IN בצורה פשוטה ב-JS client בגרסאות ישנות, 
        // אבל אפשר להשתמש ב-or עם רשימה.
        // דרך פשוטה: נמחק הודעות שבהן sender IN list OR receiver IN list.
        // התחביר: .or(`sender_email.in.(${emails}),receiver_email.in.(${emails})`)
        const listStr = `(${emails.map(e => `"${e}"`).join(',')})`;
        query = query.or(`sender_email.in.${listStr},receiver_email.in.${listStr}`);
    }

    try {
        const { error, count } = await query; // count requires select usually, delete returns null data usually
        if (error) throw error;
        showToast("הודעות נמחקו בהצלחה.", "success");
    } catch (e) {
        console.error(e);
        await customAlert("שגיאה במחיקה: " + e.message);
    }
}

async function adminDeleteBot(email) {
    if (!await customConfirm(`האם למחוק את הבוט ${email}?`)) return;
    try {
        const { error } = await supabaseClient.from('users').delete().eq('email', email).eq('is_bot', true);
        if (error) throw error;
        showToast("הבוט נמחק", "success");
        renderAdminTools();
    } catch (e) {
        await customAlert("שגיאה במחיקת הבוט: " + e.message);
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`admin-sec-${tabName}`).classList.add('active');

    document.querySelectorAll('.admin-tab-btn').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (tabName === 'users') renderAdminUsersTable();
    if (tabName === 'reports') renderAdminReports();
    if (tabName === 'inbox') renderAdminInbox();
    if (tabName === 'donations') renderAdminDonations();
    if (tabName === 'ads') loadAdsForAdmin();
    if (tabName === 'suggestions') renderAdminSuggestions();
    if (tabName === 'marketing') renderAdminMarketing();
    if (tabName === 'tools') renderAdminTools();
    if (tabName === 'shop') renderAdminShop();
    if (tabName === 'sql') {
        document.getElementById('adminSqlOutput').innerText = '';
        // Add the schema query button if it doesn't exist
        const sqlInputContainer = document.getElementById('adminSqlInput')?.parentElement;
        if (sqlInputContainer && !document.getElementById('runSchemaQueryBtn')) {
            const btn = document.createElement('button');
            btn.id = 'runSchemaQueryBtn';
            btn.className = 'admin-btn';
            btn.style.cssText = 'background:#f59e0b; color:black; margin-top:10px; width: auto; padding: 8px 15px;';
            btn.innerHTML = '<i class="fas fa-database"></i> הצג מבנה טבלאות';
            btn.onclick = runSchemaQuery;
            // Insert after the textarea, not at the end of the parent
            document.getElementById('adminSqlInput').insertAdjacentElement('afterend', btn);
        }
    }
}

function renderAdminPanel() {
    // עדכון סטטיסטיקה כללית (מוצג תמיד או בדשבורד)
    document.getElementById('adminTotalUsers').innerText = globalUsersData.length;

    const now = new Date();
    const onlineUsers = globalUsersData.filter(u => u.lastSeen && (now - new Date(u.lastSeen) < 5 * 60 * 1000));
    document.getElementById('adminOnlineCount').innerText = onlineUsers.length;

    updateAdminChart();
    // אם אנחנו בלשונית משתמשים, נרענן את הטבלה
    if (document.getElementById('admin-sec-users').classList.contains('active')) renderAdminUsersTable();
}

function renderAdminUsersTable() {
    const search = document.getElementById('adminSearch').value.toLowerCase();
    const tbody = document.getElementById('adminUsersList');
    if (!tbody) return;
    tbody.innerHTML = '';

    const now = new Date();
    const onlineUsers = globalUsersData.filter(u => u.lastSeen && (now - new Date(u.lastSeen) < 5 * 60 * 1000));

    const onlineList = document.getElementById('adminOnlineList');
    onlineList.innerHTML = '';
    if (onlineUsers.length === 0) onlineList.innerHTML = '<span style="color:#64748b; font-size:0.85rem;">אין משתמשים מחוברים כעת</span>';
    else {
        onlineUsers.forEach(u => {
            const chip = document.createElement('div');
            chip.style.cssText = "background:#1e293b; border:1px solid #22c55e; color:#fff; padding:4px 10px; border-radius:15px; font-size:0.8rem; display:flex; align-items:center; gap:5px;";
            chip.innerHTML = `<div style="width:6px; height:6px; background:#22c55e; border-radius:50%;"></div> ${u.name}`;
            onlineList.appendChild(chip);
        });
    }

    const filteredUsers = globalUsersData.filter(u =>
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        (u.city && u.city.toLowerCase().includes(search))
    );

    // מיון לפי פעילות אחרונה (מהחדש לישן)
    filteredUsers.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));

    filteredUsers.forEach(u => {
        const isOnline = u.lastSeen && (new Date() - new Date(u.lastSeen) < 5 * 60 * 1000);
        const lastSeenText = u.lastSeen ? new Date(u.lastSeen).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'לא ידוע';
        const onlineIndicator = isOnline ? '<span style="display:inline-block; width:8px; height:8px; background:#22c55e; border-radius:50%; margin-left:5px;" title="מחובר כעת"></span>' : '';
        const subText = (u.subscription && u.subscription.level > 0) ? `<span style="color:#d97706; font-weight:bold;">${u.subscription.name}</span>` : '-';
        const isBanned = u.is_banned;

        const tr = document.createElement('tr');
        if (isBanned) tr.style.background = 'rgba(239, 68, 68, 0.1)';

        tr.innerHTML = `
            <td>${onlineIndicator}${u.name} ${isBanned ? '<span style="color:red; font-weight:bold;">(חסום)</span>' : ''}</td>
            <td>${u.email}</td>
            <td>${u.city}</td>
            <td>${subText}</td>
            <td style="text-align:center; white-space:nowrap;">
                <button class="admin-btn" style="background:#8b5cf6; color:white;" onclick="adminSendPrivateMessage('${u.email}')" title="שלח הודעה אישית"><i class="fas fa-paper-plane"></i></button>
                <button class="admin-btn" style="background:#3b82f6; color:white;" onclick="adminViewChats('${u.email}')" title="צפה בצ'אטים"><i class="fas fa-comments"></i></button>
                <button class="admin-btn" style="background:#f59e0b; color:black;" onclick="adminViewSecurity('${u.email}')" title="צפה בפרטי אבטחה"><i class="fas fa-key"></i></button>
                <button class="admin-btn" style="background:#14b8a6; color:white;" onclick="adminViewNotes('${u.email}')" title="צפה בהערות"><i class="fas fa-sticky-note"></i></button>
                <button class="admin-btn" style="background:#10b981; color:white;" onclick="adminEditUser('${u.email}')" title="ערוך"><i class="fas fa-edit"></i></button>
                ${isBanned ?
                `<button class="admin-btn" style="background:#22c55e; color:white;" onclick="adminUnbanUser('${u.email}')" title="בטל חסימה"><i class="fas fa-unlock"></i></button>` :
                `<button class="admin-btn" style="background:#ef4444; color:white;" onclick="adminBanUser('${u.email}')" title="מחק/חסום"><i class="fas fa-ban"></i></button>`
            }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function adminUnbanUser(email) {
    if (!(await customConfirm(`האם לבטל את החסימה למשתמש ${email}?`))) return;
    try {
        await supabaseClient.from('users').update({ is_banned: false }).eq('email', email);
        showToast("החסימה בוטלה.", "success");
        await syncGlobalData();
        renderAdminUsersTable();
    } catch (e) { await customAlert("שגיאה בביטול חסימה: " + e.message); }
}

async function renderAdminSuggestions() {
    const list = document.getElementById('adminSuggestionsList');
    list.innerHTML = 'טוען...';
    const { data, error } = await supabaseClient.from('suggestions').select('*').order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
        list.innerHTML = 'אין הצעות.';
        return;
    }

    list.innerHTML = '';
    data.forEach(s => {
        const div = document.createElement('div');
        div.style.cssText = "background:#0f172a; padding:15px; margin-bottom:10px; border-radius:8px; border:1px solid #334155;";
        div.innerHTML = `
            <div style="color:#94a3b8; font-size:0.8rem; margin-bottom:5px;">${s.user_email} | ${new Date(s.created_at).toLocaleDateString()}</div>
            <div style="color:#fff;">${s.content}</div>
        `;
        list.appendChild(div);
    });
}

async function renderAdminMarketing() {
    const list = document.getElementById('adminMarketingList');
    list.innerHTML = 'טוען...';
    const { data } = await supabaseClient.from('users').select('email, display_name').eq('marketing_consent', true);

    if (!data || data.length === 0) {
        list.innerHTML = 'אין נרשמים.';
        return;
    }

    list.innerHTML = `<div style="color:#fff; margin-bottom:10px;">סה"כ רשומים: ${data.length}</div>`;
    const ul = document.createElement('ul');
    ul.style.color = '#cbd5e1';
    data.forEach(u => {
        ul.innerHTML += `<li>${u.email} (${u.display_name})</li>`;
    });
    list.appendChild(ul);
}

async function adminViewNotes(email) {
    const modal = document.getElementById('adminNotesModal');
    const title = document.getElementById('adminNotesTitle');
    const content = document.getElementById('adminNotesContent');

    title.innerText = `הערות של ${email}`;
    content.innerHTML = 'טוען...';
    modal.style.display = 'flex';
    bringToFront(modal);

    const { data, error } = await supabaseClient.from('user_goals').select('book_name, notes').eq('user_email', email);

    if (error || !data) {
        content.innerHTML = 'שגיאה בטעינת הערות.';
        return;
    }

    const notesByBook = data.filter(g => g.notes && Array.isArray(g.notes) && g.notes.length > 0);
    if (notesByBook.length === 0) {
        content.innerHTML = 'למשתמש זה אין הערות שמורות.';
        return;
    }

    content.innerHTML = notesByBook.map(book => `<h4>${book.book_name}</h4><ul>${book.notes.map(note => `<li>${note.content}</li>`).join('')}</ul>`).join('<hr>');
}


async function adminViewSecurity(email) {
    const u = globalUsersData.find(user => user.email === email);
    if (!u) return;

    let secInfo = `<strong>סיסמה:</strong> ${u.password || 'לא ידועה'}<br><br>`;
    if (u.security_questions && u.security_questions.length > 0) {
        secInfo += `<strong>שאלות אבטחה:</strong><br>`;
        u.security_questions.forEach((q, i) => {
            secInfo += `${i + 1}. ${q.q} <br> תשובה: ${q.a}<br>`;
        });
    } else {
        secInfo += `אין שאלות אבטחה מוגדרות.`;
    }

    await customAlert(secInfo, true);
}

async function renderAdminInbox() {
    const list = document.getElementById('adminInboxList');
    list.innerHTML = '<div style="text-align:center; color:#94a3b8;">טוען הודעות...</div>';

    // שליפת הודעות שנשלחו ל-admin@system או למייל של המנהל הנוכחי
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('receiver_email', 'admin@system') // רק הודעות למערכת
        .order('created_at', { ascending: false });

    if (error || !data) {
        list.innerHTML = '<div style="text-align:center; color:#ef4444;">שגיאה בטעינת הודעות</div>';
        return;
    }

    // קיבוץ לפי שולח
    const conversations = {};
    data.forEach(msg => {
        if (!conversations[msg.sender_email]) {
            conversations[msg.sender_email] = {
                lastMsg: msg,
                count: 0,
                unread: 0
            };
        }
        conversations[msg.sender_email].count++;
        if (!msg.is_read) conversations[msg.sender_email].unread++;
    });

    list.innerHTML = '';
    if (Object.keys(conversations).length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">אין הודעות נכנסות</div>';
        return;
    }

    Object.keys(conversations).forEach(email => {
        const conv = conversations[email];
        const user = globalUsersData.find(u => u.email === email);
        const name = user ? user.name : email;
        const date = new Date(conv.lastMsg.created_at).toLocaleString('he-IL');

        const div = document.createElement('div');
        div.className = `inbox-item ${conv.unread > 0 ? 'unread' : ''}`;
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong style="color:#fff; font-size:1rem;">${name} <span style="font-size:0.8rem; color:#94a3b8;">(${email})</span></strong>
                <span style="color:#64748b; font-size:0.8rem;">${date}</span>
            </div>
            <div style="color:#cbd5e1; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${conv.lastMsg.message}
            </div>
            ${conv.unread > 0 ? `<div style="margin-top:5px;"><span style="background:#f59e0b; color:#000; font-size:0.7rem; padding:2px 6px; border-radius:4px;">${conv.unread} חדשות</span></div>` : ''}
        `;
        div.onclick = () => {
            // פתיחת צ'אט רגיל עם המשתמש
            openChat(email, name);
            // סימון כנקרא (נעשה אוטומטית בפתיחת הצ'אט)
        };
        list.appendChild(div);
    });
}

function renderAdminDonations() {
    const currentProgress = localStorage.getItem('torahApp_campaign_progress') || 60;
    const container = document.getElementById('adminDonationsList');

    let html = `
        <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #334155;">
            <h4 style="color:#fff; margin-top:0;">ניהול קמפיין תרומות</h4>
            <label for="adminCampaignInput" style="color:#cbd5e1; display:block; margin-bottom:5px;">אחוז התקדמות במד (0-100):</label>
            <div style="display:flex; gap:10px;">
                <input type="number" id="adminCampaignInput" value="${currentProgress}" class="admin-input" style="width:100px;">
                <button class="admin-btn" style="background:#22c55e; color:#fff; font-size:1rem;" onclick="saveCampaignProgress()">עדכן מד</button>
            </div>
        </div>
        <div style="background:#0f172a; padding:15px; border-radius:8px; margin-bottom:20px; border:1px solid #334155;">
            <h4 style="color:#fff; margin-top:0;">הודעה לכל התורמים</h4>
            <textarea id="adminDonorsMsg" class="admin-input" placeholder="הקלד הודעה..." style="height: 80px;"></textarea>
            <button class="admin-btn" style="background: #8b5cf6; color: #fff; font-size: 1rem; padding: 8px 15px; margin-top: 10px;" onclick="adminSendToDonors()">שלח לכולם</button>
        </div>
        <h3 style="color:#fff; border:none; margin-bottom:15px;">רשימת תורמים ומנויים</h3>
    `;

    // Table
    const donors = globalUsersData.filter(u => u.subscription && u.subscription.level > 0);
    // Sort by subscription date, newest first
    donors.sort((a, b) => {
        const dateA = a.subscription.subscription_date ? new Date(a.subscription.subscription_date) : new Date(0);
        const dateB = b.subscription.subscription_date ? new Date(b.subscription.subscription_date) : new Date(0);
        return dateB - dateA;
    });

    if (donors.length === 0) {
        html += '<div style="color:#94a3b8; text-align:center; padding:20px;">אין מנויים פעילים כרגע.</div>';
    } else {
        html += `<div style="overflow-x:auto;"><table class="admin-table">
            <thead><tr style="background:#0f172a;"><th>שם</th><th>אימייל</th><th>מסלול</th><th>סכום חודשי</th><th>תאריך הצטרפות</th></tr></thead>
            <tbody>`;
        donors.forEach(u => {
            const joinDate = u.subscription.subscription_date ? new Date(u.subscription.subscription_date).toLocaleDateString('he-IL') : 'לא ידוע';
            html += `<tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${u.subscription.name}</td>
                <td>₪${u.subscription.amount}</td>
                <td>${joinDate}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    container.innerHTML = html;
}

function updateAdminChart() {
    const ctx = document.getElementById('adminActivityChart');
    if (!ctx) return;

    // הכנת נתונים: קיבוץ משתמשים לפי שעת פעילות אחרונה
    const hours = Array(24).fill(0);
    const now = new Date();

    globalUsersData.forEach(u => {
        if (u.lastSeen) {
            const d = new Date(u.lastSeen);
            // אם הפעילות הייתה ב-24 שעות האחרונות
            if (now - d < 24 * 60 * 60 * 1000) {
                hours[d.getHours()]++;
            }
        }
    });

    // יצירת תוויות לשעות (למשל: 14:00, 15:00...)
    const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

    if (adminChartInstance) {
        adminChartInstance.data.datasets[0].data = hours;
        adminChartInstance.update();
    } else {
        adminChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'משתמשים פעילים',
                    data: hours,
                    backgroundColor: '#3b82f6',
                    borderColor: '#2563eb',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                },
                plugins: {
                    legend: { labels: { color: '#fff' } }
                }
            }
        });
    }
}

async function adminSendPrivateMessage(targetEmail) {
    // פתיחת צ'אט רגיל, אך מכיוון שאנחנו במצב ניהול, זה יישלח כ-admin@system
    openChat(targetEmail, targetEmail);
}

async function adminSendToDonors() {
    const msg = document.getElementById('adminDonorsMsg').value;
    if (!msg) return customAlert('יש לכתוב תוכן להודעה.');
    if (!(await customConfirm('האם לשלוח הודעה זו לכל התורמים והמנויים?'))) return;

    const donors = globalUsersData.filter(u => u.subscription && u.subscription.level > 0);
    if (donors.length === 0) return customAlert('לא נמצאו תורמים לשליחה.');

    const messages = donors.map(donor => ({
        sender_email: 'admin@system',
        receiver_email: donor.email,
        message: msg
    }));

    try {
        const { error } = await supabaseClient.from('chat_messages').insert(messages);
        if (error) throw error;
        showToast(`הודעה נשלחה ל-${donors.length} תורמים.`, 'success');
        document.getElementById('adminDonorsMsg').value = '';
    } catch (e) {
        console.error(e);
        await customAlert('שגיאה בשליחת ההודעות.');
    }
}

async function adminViewChats(email) {
    const modal = document.getElementById('adminChatModal');
    const content = document.getElementById('adminChatContent');
    modal.style.display = 'flex';
    bringToFront(modal);
    content.innerHTML = '<div style="text-align:center;">טוען רשימת צ\'אטים...</div>';

    // שליפת כל ההודעות של המשתמש כדי לקבץ לפי שיחות
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('sender_email, receiver_email, message, created_at')
        .or(`sender_email.eq.${email},receiver_email.eq.${email}`)
        .order('created_at', { ascending: false });

    if (error) {
        content.innerHTML = '<div style="color:red; text-align:center;">שגיאה בטעינת הודעות</div>';
        return;
    }

    if (!data || data.length === 0) {
        content.innerHTML = '<div style="text-align:center; color:#64748b;">לא נמצאו צ\'אטים למשתמש זה.</div>';
        return;
    }

    // קיבוץ לפי בן שיח
    const chats = {};
    data.forEach(msg => {
        const partner = msg.sender_email === email ? msg.receiver_email : msg.sender_email;
        if (!chats[partner]) chats[partner] = [];
        chats[partner].push(msg);
    });

    content.innerHTML = `<h4 style="margin-top:0;">רשימת שיחות של ${email}</h4>`;
    const list = document.createElement('div');

    Object.keys(chats).forEach(partner => {
        const item = document.createElement('div');
        item.style.cssText = "background:#fff; padding:10px; margin-bottom:5px; border-radius:6px; cursor:pointer; border:1px solid #e2e8f0;";
        item.innerHTML = `<strong>מול: ${partner}</strong> <span style="color:#64748b; font-size:0.8rem;">(${chats[partner].length} הודעות)</span>`;
        item.onclick = () => openAdminChatConversation(email, partner, chats[partner]);
        list.appendChild(item);
    });
    content.appendChild(list);
}

function openAdminChatConversation(userEmail, partnerEmail, messages) {
    const content = document.getElementById('adminChatContent');
    content.innerHTML = `
        <div style="margin-bottom:10px;">
            <button class="admin-btn" style="background:#64748b;" onclick="adminViewChats('${userEmail}')">חזור לרשימה</button>
            <span style="margin-right:10px; font-weight:bold;">שיחה עם ${partnerEmail}</span>
        </div>
        <div style="background:#e2e8f0; padding:10px; border-radius:8px; height:60vh; overflow-y:auto;">
    `;

    // מיון הודעות (ישן לחדש)
    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const container = content.querySelector('div:last-child');
    messages.forEach(msg => {
        const isUser = msg.sender_email === userEmail;
        const div = document.createElement('div');
        div.style.cssText = `
            background: ${isUser ? '#dbeafe' : '#fff'}; 
            padding: 8px; 
            margin-bottom: 5px; 
            border-radius: 6px; 
            max-width: 80%; 
            align-self: ${isUser ? 'flex-start' : 'flex-end'};
            margin-${isUser ? 'left' : 'right'}: auto;
        `;
        div.innerHTML = `
            <div style="font-size:0.75rem; color:#64748b; margin-bottom:2px;">${isUser ? userEmail : partnerEmail} | ${new Date(msg.created_at).toLocaleString('he-IL')}</div>
            <div>${msg.message}</div>
        `;
        container.appendChild(div);
    });
    // גלילה למטה
    container.scrollTop = container.scrollHeight;
}

function closeAdminChat() {
    document.getElementById('adminChatModal').style.display = 'none';
}

async function adminDeleteUser(email) {
    if (!(await customConfirm('למחוק את המשתמש ' + email + '? פעולה זו אינה הפיכה.'))) return;
    try {
        const { error } = await supabaseClient.from('users').delete().eq('email', email);
        if (error) throw error;
        showToast('משתמש נמחק', "info");
        await syncGlobalData();
        renderAdminPanel();
    } catch (e) { await customAlert('שגיאה במחיקה: ' + e.message); }
}

async function adminEditUser(email) {
    const u = globalUsersData.find(user => user.email === email);
    if (!u) return;
    const newName = await customPrompt('שם חדש:', u.name);
    if (newName === null) return;
    const newCity = await customPrompt('עיר חדשה:', u.city);
    if (newCity === null) return;

    if (newName !== null && newCity !== null) {
        try {
            const { error } = await supabaseClient.from('users').update({ display_name: newName, city: newCity }).eq('email', email);
            if (error) throw error;
            showToast('עודכן בהצלחה', "success");
            await syncGlobalData();
            renderAdminPanel();
        } catch (e) { await customAlert('שגיאה בעדכון: ' + e.message); }
    }
}

async function renderAdminReports() {
    const list = document.getElementById('adminReportsList');
    list.innerHTML = '<div style="text-align:center; color:#94a3b8;">טוען דיווחים...</div>';

    const { data, error } = await supabaseClient.from('user_reports').select('*').order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
        list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px;">אין דיווחים חדשים</div>';
        return;
    }

    list.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'admin-table';
    table.innerHTML = `<thead><tr style="background:#0f172a;"><th>מדווח</th><th>דווח ע"י</th><th>סיבה</th><th>תאריך</th><th>פעולות</th></tr></thead><tbody></tbody>`;

    data.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:#ef4444; font-weight:bold;">${r.reported_email}</td>
            <td>${r.reporter_email}</td>
            <td>${r.reason}</td>
            <td>${new Date(r.created_at).toLocaleDateString('he-IL')}</td>
            <td>
                <button class="admin-btn" style="background:#ef4444; color:white;" onclick="adminBanUser('${r.reported_email}')">חסום משתמש</button>
            </td>
        `;
        table.querySelector('tbody').appendChild(tr);
    });
    list.appendChild(table);
}

async function renderAdminShop() {
    // This function will render the forms and lists for shop and lotteries.
    
    // Render Item Form
    // טופס הוספה/עריכה משופר
    document.getElementById('adminShopItemForm').innerHTML = `
        <h4 style="color:#fff; margin-top:0; border-bottom:1px solid #334155; padding-bottom:10px; margin-bottom:15px;">
            <i class="fas fa-plus-circle"></i> הוספה/עריכת פריט לחנות
        </h4>
        <input type="hidden" id="shopItemId">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
            <div>
                <label style="color:#cbd5e1; font-size:0.85rem;">שם הרב / הפריט</label>
                <input type="text" id="shopItemName" class="admin-input" placeholder="למשל: הרב עובדיה יוסף">
            </div>
            <div>
                <label style="color:#cbd5e1; font-size:0.85rem;">מחיר (בנקודות)</label>
                <input type="number" id="shopItemPrice" class="admin-input" placeholder="למשל: 500">
            </div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="color:#cbd5e1; font-size:0.85rem;">סוג הפריט</label>
            <select id="shopItemType" class="admin-input">
                <option value="background">רקע לאתר (Background)</option>
                <option value="icon">אייקון פרופיל (Icon)</option>
                <option value="theme">ערכת נושא (Theme)</option>
            </select>
        </div>

        <div style="margin-bottom:15px;">
            <label style="color:#cbd5e1; font-size:0.85rem;">קישור לתמונה (URL)</label>
            <input type="text" id="shopItemImage" class="admin-input" placeholder="https://example.com/image.jpg" oninput="document.getElementById('adminImgPreview').src = this.value || ''">
            <div style="margin-top:5px; width:100px; height:100px; background:#0f172a; border:1px dashed #334155; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:8px;">
                <img id="adminImgPreview" src="" style="max-width:100%; max-height:100%; object-fit:cover;" alt="תצוגה מקדימה">
            </div>
        </div>

        <div style="margin-bottom:15px;">
            <label style="color:#cbd5e1; font-size:0.85rem;">תיאור (אופציונלי)</label>
            <textarea id="shopItemDesc" class="admin-input" placeholder="תיאור קצר..." style="height:60px;"></textarea>
        </div>

        <button class="admin-btn" style="background:#22c55e; width:100%; padding:12px; font-size:1rem; font-weight:bold;" onclick="saveShopItem()">
            <i class="fas fa-save"></i> שמור פריט בחנות
        </button>
    `;

    // Render Lottery Form
    // טופס הגרלות (ללא שינוי כרגע)
    document.getElementById('adminLotteryForm').innerHTML = `
        <h4 style="color:#fff; margin-top:0;">הוספה/עריכת הגרלה</h4>
        <input type="hidden" id="lotteryItemId">
        <input type="text" id="lotteryItemName" class="admin-input" placeholder="שם הפרס">
        <textarea id="lotteryItemDesc" class="admin-input" placeholder="תיאור הפרס"></textarea>
        <input type="text" id="lotteryItemImage" class="admin-input" placeholder="URL לתמונת הפרס">
        <input type="datetime-local" id="lotteryItemEnd" class="admin-input">
        <button class="admin-btn" style="background:#22c55e;" onclick="saveLotteryItem()">שמור הגרלה</button>
    `;

    renderAdminShopItems();
    renderAdminLotteries();
}

async function renderAdminShopItems() {
    const list = document.getElementById('adminShopItemsList');
    list.innerHTML = '<div style="text-align:center; color:#94a3b8;">טוען פריטים...</div>';
    
    const { data, error } = await supabaseClient.from('shop_items').select('*').order('created_at', { ascending: false });
    if (error) { list.innerHTML = 'שגיאה בטעינת פריטים'; return; }
    
    let html = '<table class="admin-table"><thead><tr><th>תמונה</th><th>שם</th><th>סוג</th><th>מחיר</th><th>פעיל</th><th>פעולות</th></tr></thead><tbody>';
    data.forEach(item => {
        html += `<tr>
            <td><img src="${item.image_url || ''}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; background:#333;"></td>
            <td>${item.name}</td>
            <td>${item.item_type}</td>
            <td>${item.price}</td>
            <td>${item.is_active ? '<span style="color:#4ade80">כן</span>' : '<span style="color:#f87171">לא</span>'}</td>
            <td>
                <button class="admin-btn" style="background:#3b82f6; padding:4px 8px;" onclick='editShopItem(${JSON.stringify(item)})'><i class="fas fa-edit"></i></button>
                <button class="admin-btn" style="background:#ef4444; padding:4px 8px;" onclick="deleteShopItem(${item.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    list.innerHTML = html;
}

function editShopItem(item) {
    document.getElementById('shopItemId').value = item.id;
    document.getElementById('shopItemName').value = item.name;
    document.getElementById('shopItemPrice').value = item.price;
    document.getElementById('shopItemType').value = item.item_type;
    document.getElementById('shopItemImage').value = item.image_url || '';
    document.getElementById('shopItemDesc').value = item.description || '';
    document.getElementById('adminImgPreview').src = item.image_url || '';
    
    // גלילה לטופס
    document.getElementById('adminShopItemForm').scrollIntoView({ behavior: 'smooth' });
}

async function renderAdminLotteries() {
    const list = document.getElementById('adminLotteriesList');
    list.innerHTML = 'טוען הגרלות...';
    const { data, error } = await supabaseClient.from('lottery_items').select('*');
    if (error) { list.innerHTML = 'שגיאה בטעינת הגרלות'; return; }

    let html = '<table class="admin-table"><thead><tr><th>פרס</th><th>זוכה</th><th>פעיל</th><th>פעולות</th></tr></thead><tbody>';
    data.forEach(item => {
        html += `<tr>
            <td>${item.name}</td>
            <td>${item.winner_email || 'טרם הוגרל'}</td>
            <td>${item.is_active ? 'כן' : 'לא'}</td>
            <td>
                <button class="admin-btn" onclick="drawLotteryWinner(${item.id})">הגרל זוכה</button>
                <button class="admin-btn" style="background:#ef4444;" onclick="deleteLotteryItem(${item.id})">מחק</button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    list.innerHTML = html;
}

async function saveShopItem() {
    const id = document.getElementById('shopItemId').value;
    const name = document.getElementById('shopItemName').value;
    const description = document.getElementById('shopItemDesc').value;
    const item_type = document.getElementById('shopItemType').value;
    const price = parseInt(document.getElementById('shopItemPrice').value);
    const image_url = document.getElementById('shopItemImage').value;
    
    if (!name || !price || !item_type) return customAlert("נא למלא שדות חובה (שם, מחיר, סוג)");

    const record = { name, description, item_type, price, image_url };
    
    try {
        let query;
        if (id) {
            query = supabaseClient.from('shop_items').update(record).eq('id', id);
        } else {
            query = supabaseClient.from('shop_items').insert(record);
        }
        const { error } = await query;
        if (error) throw error;
        
        showToast('פריט נשמר בהצלחה', 'success');
        // איפוס טופס
        document.getElementById('shopItemId').value = '';
        document.getElementById('shopItemName').value = '';
        document.getElementById('shopItemPrice').value = '';
        document.getElementById('shopItemImage').value = '';
        document.getElementById('shopItemDesc').value = '';
        document.getElementById('adminImgPreview').src = '';
        
        renderAdminShopItems();
    } catch(e) {
        await customAlert('שגיאה בשמירת פריט: ' + e.message);
    }
}

async function saveLotteryItem() { /* ... similar to saveShopItem ... */ }
async function deleteShopItem(id) {
    if (!await customConfirm("למחוק פריט זה?")) return;
    try {
        await supabaseClient.from('shop_items').delete().eq('id', id);
        renderAdminShopItems();
    } catch(e) { console.error(e); }
}
async function deleteLotteryItem(id) { /* ... */ }

async function drawLotteryWinner(lotteryId) {
    if (!await customConfirm('האם להגריל זוכה להגרלה זו? הפעולה סופית.')) return;

    try {
        const { data: entries, error: entriesError } = await supabaseClient
            .from('lottery_entries')
            .select('user_email')
            .eq('lottery_id', lotteryId);
        
        if (entriesError) throw entriesError;
        if (entries.length === 0) return customAlert('אף אחד לא נרשם להגרלה זו.');

        const winner = entries[Math.floor(Math.random() * entries.length)];
        const winnerEmail = winner.user_email;

        const { error: updateError } = await supabaseClient
            .from('lottery_items')
            .update({ winner_email: winnerEmail, is_active: false })
            .eq('id', lotteryId);
        
        if (updateError) throw updateError;

        await customAlert(`הזוכה הוא: ${winnerEmail}`);
        renderAdminLotteries();

    } catch(e) {
        await customAlert('שגיאה בביצוע ההגרלה: ' + e.message);
    }
}

async function adminBanUser(email) {
    if (!(await customConfirm(`האם לחסום את המשתמש ${email}?`))) return;
    try {
        // חסימה ב-DB
        await supabaseClient.from('users').update({ is_banned: true }).eq('email', email);
        // שליחת הודעת מערכת למשתמש (אופציונלי, כדי לנתק אותו מיד אם הוא מחובר לסוקט)
        // ה-Realtime Listener ב-setupRealtime יטפל בזה
        showToast("המשתמש נחסם בהצלחה.", "error");
    } catch (e) { await customAlert("שגיאה בחסימה: " + e.message); }
}

async function checkAdminMessagesForUser() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('receiver_email', currentUser.email)
        .eq('sender_email', 'admin@system')
        .eq('is_read', false);

    const badge = document.getElementById('profileAdminBadge');
    if (!badge) return; // הגנה מפני קריסה אם האלמנט לא קיים
    if (data && data.length > 0) {
        badge.innerText = data.length;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

async function loadAdsForAdmin() {
    try {
        const { data, error } = await supabaseClient.from('settings').select('value').eq('key', 'ads_content').single();
        if (error || !data) throw error || new Error("No data");
        document.getElementById('adminAdsContent').value = data.value || '';
    } catch (e) {
        document.getElementById('adminAdsContent').value = '';
    }
}

async function renderAdminTools() {
    const list = document.getElementById('adminBotsList');
    list.innerHTML = 'טוען בוטים...';

    const { data: bots } = await supabaseClient.from('users').select('*').eq('is_bot', true);

    list.innerHTML = '';
    if (bots && bots.length > 0) {
        bots.forEach(bot => {
            const div = document.createElement('div');
            div.style.cssText = "background:#1e293b; padding:10px; border-radius:8px; border:1px solid #334155; text-align:center; cursor:pointer; transition:0.2s;";
            div.onmouseover = () => div.style.borderColor = '#3b82f6';
            div.onmouseout = () => div.style.borderColor = '#334155';
            div.onclick = () => loginAsBot(bot);

            div.innerHTML = `
                <div style="font-size:2rem; margin-bottom:5px;">🤖</div>
                <div style="font-weight:bold; color:#fff; margin-bottom:10px;">${bot.display_name}</div>
                <button class="admin-btn" style="background:#ef4444; color:white; width:100%; margin:0;" onclick="event.stopPropagation(); adminDeleteBot('${bot.email}')"><i class="fas fa-trash"></i> מחק בוט</button>
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<div style="color:#94a3b8;">אין בוטים מוגדרים.</div>';
    }
}
