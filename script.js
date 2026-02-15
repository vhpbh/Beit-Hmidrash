document.addEventListener('DOMContentLoaded', () => {
    setupInterfaceChanges();
});

const SEARCH_TAGS = [
    { id: 'users', name: 'משתמשים', screens: ['screen-leaderboard', 'screen-chavrutas'] },
    { id: 'my-goals', name: 'המסכתות שלי', screens: ['screen-dashboard', 'screen-archive'] },
    { id: 'my-chavrutas', name: 'החברותות שלי', screens: ['screen-chavrutas'] },
    { id: 'chats', name: 'צ\'אטים', screens: [] }, // Special handling for open chat windows
    { id: 'books', name: 'ספרים', screens: ['screen-add'] } // Search the library
];

// הגדרת מסלולי מנוי
const SUBSCRIPTION_TIERS = [
    { price: 10, name: "תומך כשר", level: 1, color: "#d97706" },
    { price: 25, name: "תומך כשר מהדרין", level: 2, color: "#d97706" },
    { price: 50, name: "תומך תורה", level: 3, color: "#d97706" },
    { price: 75, name: "גביר", level: 4, color: "#d97706" },
    { price: 100, name: "זבולון מתחיל", level: 5, color: "#d97706" },
    { price: 150, name: "זבולון מתקדם", level: 6, color: "#d97706" },
    { price: 250, name: "זבולון אינטנסיבי", level: 7, color: "#d97706" }
];

// מסלולי תרומה חד פעמית
const ONE_TIME_TIERS = [
    { price: 18, name: "חי שקלים", level: 0, color: "#e5e7eb" },
    { price: 36, name: "פעמיים חי", level: 0, color: "#d1d5db" },
    { price: 72, name: "עולם חסד", level: 0, color: "#9ca3af" },
    { price: 100, name: "מאה ברכות", level: 0, color: "#fcd34d" },
    { price: 180, name: "עשרת המונים", level: 0, color: "#60a5fa" },
    { price: 360, name: "פרנס היום", level: 0, color: "#818cf8" },
    { price: 500, name: "נדיב לב", level: 0, color: "#a78bfa" },
    { price: 1000, name: "עמוד התווך", level: 0, color: "#f472b6" }
];


let currentUser = null;
let userGoals = [];
let currentLeaderboardSort = 'learned';

// משתני צ'אט (הוסרו משתנים גלובליים יחידים לטובת ניהול חלונות)
let dafYomiToday = null;
let chatInterval = null;
let chatChannel = null;
let realtimeSubscription = null;
let typingTimers = {};

// === פונקציות ליבה ===

function formatHebrewDate(dateString) {
    if (!dateString) return 'לא ידוע';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('he-IL') + ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return 'לא ידוע'; }
}

function updateHebrewDateDisplay(input, displayId) {
    const el = document.getElementById(displayId);
    if (el && input.value) el.innerText = new Date(input.value).toLocaleDateString('he-IL');
}

async function init() {
    checkBanStatus(); // בדיקת חסימת מכשיר
    const storedUser = localStorage.getItem('torahApp_user');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        document.getElementById('auth-overlay').style.display = 'none';
        updateHeader();

        // טעינת פרופיל מהענן
        await loadUserProfile();

        // טעינת לימודים
        await loadGoals();

        // טעינת רייטינג מהזכרון (להצגה מיידית)
        const cachedRating = localStorage.getItem('torahApp_rating');
        if (cachedRating) {
            const dashStat = document.getElementById('stat-rating');
            if (dashStat) dashStat.innerText = cachedRating;
        }

        // טעינת סטטיסטיקה כללית מהזכרון (להצגה מיידית)
        const cachedStats = JSON.parse(localStorage.getItem('torahApp_stats') || '{}');
        if (cachedStats) {
            if (document.getElementById('stat-books')) document.getElementById('stat-books').innerText = cachedStats.books || 0;
            if (document.getElementById('stat-pages')) document.getElementById('stat-pages').innerText = cachedStats.pages || 0;
            if (document.getElementById('stat-completed')) document.getElementById('stat-completed').innerText = cachedStats.completed || 0;
        }

        await loadSchedules(); // טעינת לוח זמנים

        getDafYomi(); // טעינת הדף היומי
        // סנכרון נתונים גלובליים
        checkCookieConsent();

        // טעינת מצב לילה
        if (localStorage.getItem('torahApp_darkMode') === 'true') toggleDarkMode(null, true); // null event

        // setupInterfaceChanges(); // הועבר מחוץ לתנאי כדי שירוץ תמיד
        await syncGlobalData();
        notificationsEnabled = true;
        updateFollowersCount(); // עדכון מונה עוקבים בטעינה
        sendHeartbeat();
        setupRealtime();
        logVisit(); // Log visitor
    }
}

function setupInterfaceChanges() {
    // 1. יצירת מסך פרסומות אם לא קיים
    if (!document.getElementById('screen-ads')) {
        const adsScreen = document.createElement('div');
        adsScreen.id = 'screen-ads';
        adsScreen.className = 'screen';
        adsScreen.innerHTML = `
            <div class="container">
                <div class="card">
                    <h2><i class="fas fa-bullhorn" style="color:var(--accent);"></i> לוח מודעות</h2>
                    <div id="ads-container">
                        <p style="text-align:center; color:#94a3b8;">טוען פרסומות...</p>
                    </div>
                </div>
            </div>
        `;
        const container = document.querySelector('.container');
        if (container && container.parentNode) container.parentNode.appendChild(adsScreen);
    }

    // 2. עדכון סרגל הניווט התחתון
    // Bottom nav is now static in HTML, no longer generated here.

    // 3. הוספת "לוח" (Leaderboard) לתפריט הפרופיל
    const profileMenu = document.getElementById('profile-dropdown');
    if (profileMenu) {
        profileMenu.innerHTML = `
            <div id="profile-menu-achievements" class="profile-menu-item" onclick="toggleProfileMenu(); showAchievements();">
                <i class="fas fa-medal"></i> הישגים
            </div>
            <div class="profile-menu-item" onclick="toggleProfileMenu(); switchScreen('calendar');">
                <i class="fas fa-calendar-alt"></i> לוח זמנים
            </div>
            <div class="profile-menu-item" onclick="toggleProfileMenu(); switchScreen('profile');">
                <i class="fas fa-user-edit"></i> עריכת פרופיל
            </div>
            <div class="profile-menu-item" onclick="toggleProfileMenu(); showMyFollowers();">
                <i class="fas fa-users"></i> העוקבים שלי
                <span id="followersCountBadge" style="margin-right: auto; font-size: 0.9rem; color: inherit; font-weight: normal;">0</span>
            </div>
            <div class="profile-menu-item" style="display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-moon"></i> מצב לילה</span>
                <label class="switch">
                    <input type="checkbox" id="darkModeSwitch" onchange="toggleDarkMode(event)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="profile-menu-item" onclick="toggleProfileMenu(); openChat('admin@system', 'תמיכה');">
                <i class="fas fa-headset"></i> תמיכה / פנייה למנהל
            </div>
            <div class="profile-menu-item" onclick="logout()">
                <i class="fas fa-sign-out-alt"></i> התנתק
            </div>
        `;
    }

    // 7. הסתרת שורת חיפוש לומד בחברותות
    const userSearchInput = document.getElementById('userSearchInput');
    if (userSearchInput && userSearchInput.parentElement) {
        userSearchInput.parentElement.style.display = 'none';
    }

}

function checkBanStatus() {
    if (localStorage.getItem('device_banned') === 'true') {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('banned-overlay').style.display = 'flex';
    }
}

function checkCookieConsent() {
    if (!localStorage.getItem('torahApp_cookie_consent')) {
        document.getElementById('cookieModal').style.display = 'flex';
    }
}

async function acceptCookies() {
    localStorage.setItem('torahApp_cookie_consent', 'true');
    document.getElementById('cookieModal').style.display = 'none';
    // שמירה ב-DB כבקשת המשתמש
    try {
        await supabaseClient.from('user_consents').insert([{
            user_ip: 'client-side', // IP usually handled by server, here just a placeholder or fetch via API if needed
            user_agent: navigator.userAgent
        }]);
    } catch (e) {
        console.log("Cookie consent saved locally.");
    }
}

function openSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    const tagsContainer = document.getElementById('search-tags-container');

    // Populate tags if not already there
    if (tagsContainer.children.length === 0) {
        tagsContainer.innerHTML = SEARCH_TAGS.map(tag =>
            `<div class="search-tag" id="search-tag-${tag.id}" onclick="toggleSearchTag('${tag.id}')">${tag.name}</div>`
        ).join('');
    }

    // Reset state
    // document.querySelectorAll('.search-tag').forEach(t => t.classList.remove('active'));
    document.getElementById('generalSearchResults').innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top: 50px;"><i class="fas fa-search" style="font-size: 3rem; opacity: 0.5;"></i><p>הקלד כדי להתחיל חיפוש</p></div>`;

    // Auto-select tags based on context
    const activeScreen = document.querySelector('.screen.active')?.id;
    SEARCH_TAGS.forEach(tag => {
        if (activeScreen && tag.screens.includes(activeScreen)) {
            document.getElementById(`search-tag-${tag.id}`).classList.add('active');
        }
    });

    // Special check for open chat windows
    if (document.querySelector('.chat-window:not(.minimized)')) {
        document.getElementById('search-tag-chats').classList.add('active');
    }

    dropdown.classList.add('active');
}

function closeSearchDropdown() {
    document.getElementById('searchDropdown').classList.remove('active');
}

function toggleSearchTag(tagId) {
    document.getElementById(`search-tag-${tagId}`).classList.toggle('active');
    // Re-run search with new filters
    executeGeneralSearch();
}

function toggleLeaderboardSort(sortType) {
    currentLeaderboardSort = sortType;
    document.getElementById('sort-learned-btn').className = sortType === 'learned' ? 'lb-tab-btn active' : 'lb-tab-btn';
    document.getElementById('sort-rating-btn').className = sortType === 'rating' ? 'lb-tab-btn active' : 'lb-tab-btn';
    renderLeaderboard();
}

let searchDebounceTimer;
function debouncedGeneralSearch() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(executeGeneralSearch, 300);
}

function handleSearchInput() {
    const input = document.getElementById('generalSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
        clearBtn.style.display = input.value.length > 0 ? 'block' : 'none';
    }
    debouncedGeneralSearch();
}

function clearSearch() {
    const input = document.getElementById('generalSearchInput');
    input.value = '';
    document.getElementById('clearSearchBtn').style.display = 'none';
    input.focus();
    document.getElementById('generalSearchResults').innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top: 50px;"><i class="fas fa-search" style="font-size: 3rem; opacity: 0.5;"></i><p>הקלד כדי להתחיל חיפוש</p></div>`;
}

async function executeGeneralSearch() {
    const query = document.getElementById('generalSearchInput').value.trim().toLowerCase();
    const resultsContainer = document.getElementById('generalSearchResults');

    if (query.length < 2) {
        resultsContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top: 50px;"><i class="fas fa-search" style="font-size: 3rem; opacity: 0.5;"></i><p>הקלד לפחות 2 תווים לחיפוש</p></div>`;
        return;
    }

    resultsContainer.innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top: 50px;"><i class="fas fa-circle-notch fa-spin" style="font-size: 3rem;"></i><p>מחפש...</p></div>`;

    const activeTags = Array.from(document.querySelectorAll('.search-tag.active')).map(t => t.id.replace('search-tag-', ''));
    const searchAll = activeTags.length === 0;

    let results = {};
    let promises = [];

    if (searchAll || activeTags.includes('users')) {
        promises.push(searchUsers(query).then(r => results.users = r));
    }
    if (searchAll || activeTags.includes('my-goals')) {
        promises.push(searchMyGoals(query).then(r => results.my_goals = r));
    }
    if (searchAll || activeTags.includes('my-chavrutas')) {
        promises.push(searchMyChavrutas(query).then(r => results.my_chavrutas = r));
    }
    if (searchAll || activeTags.includes('chats')) {
        promises.push(searchChats(query).then(r => results.chats = r));
    }
    if (searchAll || activeTags.includes('books')) {
        promises.push(searchLibraryBooks(query).then(r => results.books = r));
    }

    await Promise.all(promises);
    renderGeneralSearchResults(results, query);
}

// Individual search functions
async function searchUsers(query) {
    return globalUsersData.filter(u =>
        u.email.toLowerCase().includes(query) ||
        u.name.toLowerCase().includes(query) ||
        (u.city && u.city.toLowerCase().includes(query))
    );
}

async function searchMyGoals(query) {
    return userGoals.filter(g =>
        g.bookName.toLowerCase().includes(query) ||
        (g.dedication && g.dedication.toLowerCase().includes(query))
    );
}

async function searchMyChavrutas(query) {
    const partnerEmails = chavrutaConnections.map(c => c.email);
    return globalUsersData.filter(u =>
        partnerEmails.includes(u.email) &&
        (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    );
}



async function searchLibraryBooks(query) {
    const results = [];
    BOOKS_DB.forEach(book => {
        if (book.name.includes(query)) {
            results.push({ name: book.name, units: book.units, category: book.category });
        }
    });
    return results;
}

// פונקציה חדשה לטעינת פרופיל המשתמש מהענן
async function loadUserProfile() {
    try {
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', currentUser.email)
            .single();

        if (userData && !error) {
            // עדכון הפרופיל המקומי עם נתונים מהענן
            currentUser.displayName = userData.display_name || currentUser.displayName;
            currentUser.phone = userData.phone || '';
            currentUser.city = userData.city || '';
            currentUser.address = userData.address || '';
            currentUser.age = userData.age || null;
            currentUser.isAnonymous = userData.is_anonymous || false;
            currentUser.subscription = userData.subscription || { amount: 0, level: 0, name: '' }; // טעינת מנוי
            currentUser.security_questions = userData.security_questions || [];
            currentUser.password = userData.password || ''; // שמירה מקומית של הסיסמה (לא מומלץ בדרך כלל, אך נדרש לניהול פשוט כאן)
            currentUser.reward_points = userData.reward_points || 0;
            currentUser.marketing_consent = userData.marketing_consent || false;

            // שמירה מקומית
            localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

            // עדכון UI של הפרופיל
            updateProfileUI();
        }
    } catch (e) {
        console.error("שגיאה בטעינת פרופיל:", e);
    }
}

// פונקציה לעדכון השדות בעמוד הפרופיל
function updateProfileUI() {
    const nameInput = document.getElementById('profileName');
    const phoneInput = document.getElementById('profilePhone');
    const cityInput = document.getElementById('profileCity');
    const addressInput = document.getElementById('profileAddress');
    const ageInput = document.getElementById('profileAge');
    const anonSwitch = document.getElementById('anonSwitch');
    const secQInput = document.getElementById('profileSecQ');
    const secAInput = document.getElementById('profileSecA');

    if (nameInput) nameInput.value = currentUser.displayName || '';
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (ageInput) ageInput.value = currentUser.age || '';
    if (cityInput) cityInput.value = currentUser.city || '';
    if (addressInput) addressInput.value = currentUser.address || '';
    if (anonSwitch) anonSwitch.checked = currentUser.isAnonymous || false;

    if (currentUser.security_questions && currentUser.security_questions.length > 0) {
        if (secQInput) secQInput.value = currentUser.security_questions[0].q || '';
        if (secAInput) secAInput.value = currentUser.security_questions[0].a || '';
    }
}

// פונקציה לעדכון הערות מה-iframe
window.updateGoalNotes = async function (goalId, newNotes) {
    const goal = userGoals.find(g => g.id == goalId);
    if (goal) {
        goal.notes = newNotes;
        saveGoals();

        // שמירה לענן
        try {
            await supabaseClient.from('user_goals').update({ notes: newNotes }).eq('id', goalId);
        } catch (e) { console.error("Error saving notes to cloud", e); }
    }
};

// תיקון loadGoals - טעינה מהענן
async function loadGoals() {
    // 1. טעינה מיידית מ-LocalStorage (ללא המתנה לרשת)
    const localGoals = localStorage.getItem('torahApp_goals');
    if (localGoals) {
        userGoals = JSON.parse(localGoals);
        renderGoals(); // רינדור מיידי למסך
    }

    try {
        // ניסיון לטעון מהענן
        const { data: cloudGoals, error } = await supabaseClient
            .from('user_goals')
            .select('*')
            .eq('user_email', currentUser.email);


        // אם יש נתונים מהענן, נעדכן את המידע המקומי ונרנדר מחדש
        if (cloudGoals && !error) {
            // המיזוג והעדכון המורכב יותר מתבצע ב-syncGlobalData
            // כאן רק נדאג שהנתונים המעודכנים ביותר מהענן יהיו זמינים
            // ונרנדר מחדש כדי לשקף אותם
            await syncGlobalData(); // מפעיל את הלוגיקה המלאה של הסנכרון
        }
    } catch (e) {
        console.error("שגיאה בטעינת לימודים:", e);
    }
}

function toggleAuthMode(mode) {
    document.getElementById('btn-login-mode').className = `auth-toggle-btn ${mode === 'login' ? 'active' : ''}`;
    document.getElementById('btn-signup-mode').className = `auth-toggle-btn ${mode === 'signup' ? 'active' : ''}`;

    document.getElementById('login-form').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = mode === 'signup' ? 'block' : 'none';
}

// עדכון handleLogin
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('emailInput').value.trim().toLowerCase();
    const pass = document.getElementById('passInput').value;

    if (!email || !pass) {
        await customAlert("נא להזין אימייל וסיסמה");
        return;
    }

    try {
        // בדיקה מול השרת
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error && error.code !== 'PGRST116') { // שגיאה שאינה "לא נמצא"
            await customAlert("שגיאת תקשורת: " + error.message);
            return;
        }

        if (user) {
            // בדיקת חסימה
            if (user.is_banned) {
                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('banned-overlay').style.display = 'flex';
                localStorage.setItem('device_banned', 'true'); // חסימת מכשיר
                sessionStorage.setItem('banned_email', email); // שמירת אימייל לערעור
                return;
            }

            // משתמש קיים - בדיקת סיסמה
            if (user.password !== pass) {
                const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
                await customAlert(randomJoke);
                return;
            }

            // הגדרת המשתמש הנוכחי
            currentUser = mapUserFromDB(user);

        } else {
            await customAlert("משתמש לא קיים. אנא הירשם.");
            toggleAuthMode('signup');
            return;
        }

        // המשך תהליך ההתחברות הרגיל
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
        document.getElementById('auth-overlay').style.display = 'none';
        switchScreen('dashboard', document.querySelector('.nav-item'));

        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
        setTimeout(checkDailyReminders, 5000);
        setInterval(checkChavrutaReminders, 60000);

        updateHeader();

        // טעינה אסינכרונית
        await loadUserProfile();
        await loadGoals();
        await loadSchedules();
        await syncGlobalData();
        notificationsEnabled = true;
        loadAds();
        sendHeartbeat();
        setupRealtime();
        logVisit(); // Log visitor

        addNotification("ברוך הבא לבית המדרש! בהצלחה בלימוד.");

    } catch (e) {
        console.error("Login Error:", e);
        await customAlert("אירעה שגיאה בהתחברות.");
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const pass = document.getElementById('regPass').value;
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const city = document.getElementById('regCity').value;
    const age = document.getElementById('regAge').value;
    const address = document.getElementById('regAddress').value;
    const q1 = document.getElementById('regSecQ1').value;
    const a1 = document.getElementById('regSecA1').value;
    const marketing = document.getElementById('regMarketing').checked;

    if (!email || !pass || !name || !q1 || !a1) {
        await customAlert("נא למלא את כל שדות החובה");
        return;
    }

    if (!validateInput(email, 'email')) return customAlert("כתובת האימייל אינה תקינה.");
    if (!validateInput(pass, 'password')) return customAlert("הסיסמה חייבת להכיל לפחות 6 תווים, כולל אותיות ומספרים.");
    if (!validateInput(name, 'name')) return customAlert("השם אינו תקין.");
    if (phone && !validateInput(phone, 'phone')) return customAlert("מספר הטלפון אינו תקין.");

    if (!email || !pass || !name || !q1 || !a1) {
        await customAlert("נא למלא את כל שדות החובה");
        return;
    }

    try {
        // בדיקה אם קיים
        const { data: existing } = await supabaseClient.from('users').select('email').eq('email', email).single();
        if (existing) {
            await customAlert("כתובת האימייל כבר רשומה במערכת.");
            return;
        }

        const securityQuestions = [{ q: q1, a: a1 }];

        const newUser = {
            email: email,
            password: pass,
            display_name: name,
            phone: phone,
            city: city,
            age: age ? parseInt(age) : null,
            address: address,
            security_questions: securityQuestions,
            last_seen: new Date(),
            subscription: { amount: 0, level: 0, name: '' },
            marketing_consent: marketing

        };

        const { error } = await supabaseClient.from('users').insert([newUser]);

        if (error) throw error;

        // התחברות אוטומטית לאחר הרשמה
        currentUser = mapUserFromDB({
            email: email,
            display_name: name,
            phone: phone,
            city: city,
            age: age ? parseInt(age) : null,
            address: address,
            security_questions: securityQuestions,
            subscription: { amount: 0, level: 0, name: '' },
            reward_points: 0,
            marketing_consent: marketing
        });

        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
        document.getElementById('auth-overlay').style.display = 'none';
        updateHeader();
        await init(); // אתחול המערכת עם המשתמש החדש
        switchScreen('dashboard', document.querySelector('.nav-item'));
        showToast("החשבון נוצר בהצלחה! ברוך הבא.", "success");

    } catch (e) {
        console.error(e);
        await customAlert("שגיאה ביצירת חשבון: " + e.message);
    }
}

async function handleForgotPassword() {
    const email = await customPrompt("הזן את כתובת האימייל שלך לשחזור:");
    if (!email) return;

    try {
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('email', email.toLowerCase()).single();

        if (error || !user) {
            await customAlert("משתמש לא נמצא.");
            return;
        }

        if (!user.security_questions || user.security_questions.length === 0) {
            await customAlert("לא הוגדרו שאלות אבטחה לחשבון זה. פנה למנהל.");
            return;
        }

        const q = user.security_questions[0];
        const ans = await customPrompt(`שאלת אבטחה: ${q.q}`);

        if (ans === q.a) {
            const newPass = await customPrompt("הזן סיסמה חדשה:");
            if (newPass) {
                await supabaseClient.from('users').update({ password: newPass }).eq('email', email);
                await customAlert("הסיסמה שונתה בהצלחה!");
            }
        } else {
            await customAlert("תשובה שגויה.");
        }
    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בתהליך השחזור.");
    }
}

function mapUserFromDB(user) {
    return {
        email: user.email,
        displayName: user.display_name || user.email.split('@')[0],
        isAnonymous: user.is_anonymous,
        phone: user.phone || '',
        city: user.city || '',
        address: user.address || '',
        age: user.age || null,
        subscription: user.subscription || { amount: 0, level: 0, name: '' },
        security_questions: user.security_questions || [],
        password: user.password,
        reward_points: user.reward_points || 0,
        marketing_consent: user.marketing_consent || false
    };
}

function updateHeader() {
    document.getElementById('headerUserEmail').innerText = currentUser.displayName || currentUser.email;

    // עדכון הילת הפרופיל בהאדר
    const btn = document.getElementById('headerProfileBtn');
    // הסרת כל מחלקות ההילה הקודמות
    for (let i = 1; i <= 7; i++) btn.classList.remove(`aura-lvl-${i}`);

    if (currentUser.subscription && currentUser.subscription.level > 0) {
        btn.classList.add(`aura-lvl-${currentUser.subscription.level}`);
        // הוספת טייטל
        btn.title = `מנוי: ${currentUser.subscription.name}`;
    }
}

async function updateFollowersCount() {
    if (!currentUser) return;

    // טעינה מיידית מהזכרון
    const cached = localStorage.getItem('torahApp_followersCount');
    const badge = document.getElementById('followersCountBadge');
    if (badge && cached) badge.innerText = cached;

    const { count } = await supabaseClient.from('user_followers').select('*', { count: 'exact', head: true }).eq('following_email', currentUser.email);

    if (badge) badge.innerText = count || 0;
    localStorage.setItem('torahApp_followersCount', count || 0);
}

function logout() { localStorage.removeItem('torahApp_user'); location.reload(); }

function logoutBot() {
    if (realAdminUser) {
        currentUser = realAdminUser;
        realAdminUser = null;
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

        // רענון מלא של הנתונים כדי להחזיר את המצב לקדמותו
        userGoals = [];
        chavrutaConnections = [];

        location.reload();
    }
}

// פונקציה לבדיקת תזכורות ושליחת התראה למחשב
function checkDailyReminders() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const activeTasks = userGoals.filter(g => g.status === 'active' && g.targetDate);
    if (activeTasks.length > 0) {
        new Notification("תזכורת לימוד יומי", {
            body: `יש לך ${activeTasks.length} משימות לימוד פתוחות להיום. בהצלחה!`,
            icon: "https://cdn-icons-png.flaticon.com/512/2997/2997295.png"
        });
    }
}

// בדיקת תזכורות חברותא
function checkChavrutaReminders() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');

    for (const [key, sched] of Object.entries(schedules)) {
        if (sched.days.includes(currentDay.toString()) && sched.time === currentTime) {
            const lastNotif = sessionStorage.getItem('last_notif_' + key);
            if (lastNotif !== currentTime) {
                new Notification("תזכורת חברותא", { body: `הגיע הזמן ללמוד ${sched.book} עם ${sched.partnerName}!`, icon: "https://cdn-icons-png.flaticon.com/512/2997/2997295.png" });
                sessionStorage.setItem('last_notif_' + key, currentTime);
            }
        }
    }
}

function getRankName(score) {
    if (score >= 1001) return "תלמיד חכם";
    if (score >= 501) return "צורבא מרבנן";
    if (score >= 101) return "מתמיד";
    return "צורב צעיר";
}

function getUserBadgeHtml(user) {
    if (user.subscription && user.subscription.level > 0) {
        const tier = SUBSCRIPTION_TIERS.find(t => t.level === user.subscription.level);
        const color = tier ? tier.color : 'gold';
        const title = tier ? tier.name : 'מנוי';
        return `<i class="fas fa-crown" style="color:${color}; margin-left:5px;" title="${title}"></i>`;
    }
    return '';
}

// === ניהול לימוד חדש (חיפוש ספרים) ===
let bookSearchDebounce;
let selectedBookStructure = null;

async function handleBookSearch(query) {
    const list = document.getElementById('bookSearchResults');
    if (query.length < 2) {
        list.style.display = 'none';
        return;
    }

    clearTimeout(bookSearchDebounce);
    bookSearchDebounce = setTimeout(async () => {
        try {
            const res = await fetch(`https://www.sefaria.org.il/api/name/${query}?limit=10&lang=he`);
            const data = await res.json();
            list.innerHTML = '';
            if (data.completions && data.completions.length > 0) {
                list.style.display = 'block';
                data.completions.forEach(book => {
                    const li = document.createElement('li');
                    li.style.padding = '8px'; li.style.borderBottom = '1px solid #eee'; li.style.cursor = 'pointer';
                    li.innerText = book;
                    li.onclick = () => selectBookFromSearch(book);
                    list.appendChild(li);
                });
            }
        } catch (e) { console.error(e); }
    }, 300);
}

async function selectBookFromSearch(bookName) {
    document.getElementById('newBookSearch').value = bookName;
    document.getElementById('bookSearchResults').style.display = 'none';
    document.getElementById('bookDetailsArea').style.display = 'block';

    // טעינת מבנה הספר (פרקים)
    try {
        const res = await fetch(`https://www.sefaria.org.il/api/v2/raw/index/${bookName}`);
        const data = await res.json();
        selectedBookStructure = data;

        // איפוס בחירה
        document.getElementById('bookScopeSelect').value = 'full';
        handleScopeChange();

        // הערכת כמות דפים/יחידות (ברירת מחדל)
        // ננסה לקחת את ה-length מה-shape או להעריך
        let estimatedUnits = 50; // ברירת מחדל
        if (data.schema && data.schema.sectionNames) {
            // לוגיקה פשוטה להערכה, בפועל ספריא נותן shape ב-API אחר, אבל נשתמש בזה כבסיס
            // אם זה תלמוד, ננסה למצוא במסד הנתונים המקומי שלנו
            const found = BOOKS_DB.find(b => b.name === bookName);
            if (found) estimatedUnits = found.units;
        }
        document.getElementById('calculatedUnits').value = estimatedUnits;

    } catch (e) {
        console.error("Error fetching book structure", e);
        document.getElementById('calculatedUnits').value = 100; // Fallback
    }
}

function handleScopeChange() {
    const scope = document.getElementById('bookScopeSelect').value;
    const chapterDiv = document.getElementById('chapterSelectDiv');
    const chapterSelect = document.getElementById('chapterSelect');

    if (scope === 'chapter') {
        chapterDiv.style.display = 'block';
        chapterSelect.innerHTML = '';

        if (selectedBookStructure && selectedBookStructure.schema) {
            // ניסיון לזהות מבנה פרקים
            // בדרך כלל nodeType 'JaggedArrayNode'
            // אנו נניח מבנה שטוח של פרקים לצורך הפשטות
            // או ניצור רשימה גנרית של 1-100 אם אין מידע מדויק

            // בדיקה אם יש שמות לפרקים (כמו במסכתות אבות)
            let chaptersCount = 20; // ברירת מחדל
            // אם יש לנו shape ב-API (לא תמיד זמין ב-raw/index), נשתמש בו.
            // כאן נשתמש בלוגיקה גנרית:
            for (let i = 1; i <= 50; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.innerText = `פרק ${i}`;
                chapterSelect.appendChild(opt);
            }
        }
        updateCalculatedUnits();
    } else {
        chapterDiv.style.display = 'none';
        // שחזור כמות מלאה
        if (document.getElementById('newBookSearch').value) {
            // נסה למצוא שוב ב-DB המקומי
            const bookName = document.getElementById('newBookSearch').value;
            let units = 50;
            const found = BOOKS_DB.find(b => b.name === bookName);
            if (found) units = found.units;
            document.getElementById('calculatedUnits').value = units;
        }
    }
}

function updateCalculatedUnits() {
    const scope = document.getElementById('bookScopeSelect').value;
    if (scope === 'chapter') {
        // הערכה לפרק בודד
        document.getElementById('calculatedUnits').value = 20; // ממוצע משניות/פסוקים לפרק
    }
}

async function addQuickLog() {
    const bookName = document.getElementById('quickType').value;
    const amount = parseInt(document.getElementById('quickAmount').value);
    const dedication = document.getElementById('quickDedication').value;

    // נתונים חדשים לתכנון זמן
    const paceType = document.getElementById('quickPace').value;
    const dateInput = document.getElementById('quickDateInput').value;
    let targetDate = "";

    if (paceType === 'date' && dateInput) {
        targetDate = dateInput;
    }

    if (!bookName || !amount || amount <= 0) {
        await customAlert("נא להזין שם ספר וכמות דפים תקינה");
        return;
    }

    createGoal(bookName, amount, targetDate, dedication);

    // איפוס שדות
    document.getElementById('quickAmount').value = '';
    document.getElementById('quickDedication').value = '';
    document.getElementById('quickDateInput').value = '';
    document.getElementById('quickHebrewDate').innerText = '';
}

// פונקציה לעדכון סטטוס מחובר (Heartbeat)


// משתנה חדש לשמירת רשימת החברים המאושרים
let chavrutaConnections = JSON.parse(localStorage.getItem('torahApp_chavrutas') || "[]");
let approvedPartners = new Set(chavrutaConnections.map(c => c.email));
let pendingSentRequests = [];


// פונקציה לבדיקת בקשות ממתינות (יש לקרוא לה מתוך syncGlobalData או setInterval)
async function checkIncomingRequests() {
    if (!currentUser) return;

    // משיכת בקשות שבהן אני הנמען (receiver) והסטטוס הוא 'pending'
    const { data: requests, error } = await supabaseClient
        .from('chavruta_requests')
        .select('*')
        .eq('receiver_email', currentUser.email)
        .eq('status', 'pending');

    if (requests && requests.length > 0) {
        requests.forEach(req => {
            const senderUser = globalUsersData.find(u => u.email === req.sender_email);
            const senderName = senderUser ? senderUser.name : req.sender_email;

            const htmlContent = `
                <div style="font-weight:bold; font-size:0.9rem;">בקשת חברותא חדשה!</div>
                <div style="font-size:0.85rem; margin-bottom:5px;">
                    המשתמש <strong>${senderName}</strong> רוצה ללמוד איתך את <em>${req.book_name}</em>.
                </div>
                <div style="display:flex; gap:5px; flex-wrap:wrap;">
                    <button class="btn" style="background:#3b82f6; font-size:0.8rem; padding:4px; flex:1;" 
                        onclick="showUserDetails('${req.sender_email}')">צפה בפרופיל</button>
                    <button class="btn" style="background:#16a34a; font-size:0.8rem; padding:4px; flex:1;" 
                        onclick="respondToRequest('${req.id}', 'approved')">אשר</button>
                    <button class="btn" style="background:#ef4444; font-size:0.8rem; padding:4px; flex:1;" 
                        onclick="respondToRequest('${req.id}', 'rejected')">דחה</button>
                </div>
            `;
            addNotification(htmlContent, `req-${req.id}`, true);
        });
    }
}

// פונקציה לטיפול באישור/דחייה
async function respondToRequest(reqId, action) {
    try {
        const { error } = await supabaseClient
            .from('chavruta_requests')
            .update({ status: action })
            .eq('id', reqId);

        if (error) throw error;

        showToast(action === 'approved' ? "הבקשה אושרה! כעת ניתן לראות פרטי קשר." : "הבקשה נדחתה.", action === 'approved' ? "success" : "info");

        if (action === 'approved') {
            // שליפת פרטי הבקשה כדי להוסיף את הלימוד אצלי אם חסר
            const { data: reqData } = await supabaseClient.from('chavruta_requests').select('*').eq('id', reqId).single();
            if (reqData) {
                const exists = userGoals.some(g => g.bookName === reqData.book_name && g.status === 'active');
                if (!exists) {
                    await createGoal(reqData.book_name, 100, null, "לימוד עם חברותא"); // יצירת לימוד אוטומטית
                    showToast(`הספר ${reqData.book_name} נוסף לרשימת הלימוד שלך`, "success");
                }
                // הוספה לרשימת החברים המאושרים מקומית
                const partnerEmail = reqData.sender_email === currentUser.email ? reqData.receiver_email : reqData.sender_email;
                approvedPartners.add(partnerEmail);
                chavrutaConnections.push({ email: partnerEmail, book: reqData.book_name });
                renderChavrutas();
            }
        }

        // רענון הנתונים כדי לעדכן את רשימת החברים המאושרים
        document.getElementById('notif-list').innerHTML = '<p style="color:#999; text-align:center;">אין הודעות חדשות</p>';
        document.getElementById('notif-badge').style.display = 'none';
        renderChavrutas();
        setTimeout(syncGlobalData, 2000);

    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בעדכון הבקשה.");
    }
}


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

async function addNewGoal() {
    // זיהוי האלמנטים במסך
    const bookSelectEl = document.getElementById('bookSelect');
    const customNameEl = document.getElementById('customNameInput');
    const customAmountEl = document.getElementById('customAmountInput');
    // const sefariaInput = document.getElementById('sefariaSearchInput'); // Removed

    const dateEl = document.getElementById('targetDateInput');
    const dedicationEl = document.getElementById('dedicationInput');
    const quickTypeEl = document.getElementById('quickType'); // למקרה של הוספה מהירה
    const quickAmountEl = document.getElementById('quickAmount');

    let bookName = "";
    let totalUnits = 0;
    let targetDate = "";

    // בדיקה: האם זו הוספה מהירה (מהכרטיס העליון) או רגילה?
    if (quickAmountEl && quickAmountEl.value) {
        bookName = quickTypeEl.value;
        totalUnits = parseInt(quickAmountEl.value);
        if (document.getElementById('quickDedication').value) {
            // טיפול בהקדשה מהירה אם צריך
        }
    } else {
        // הוספה רגילה מהטופס הגדול

        if (bookSelectEl && bookSelectEl.value) {
            // בחירה מרשימה קיימת (צריך לפענח את ה-JSON)
            try {
                const bookData = JSON.parse(bookSelectEl.value);
                bookName = bookData.name;
                totalUnits = bookData.units;
            } catch (e) {
                console.error("Error parsing book data", e);
                bookName = bookSelectEl.value;
                // אם אין יחידות, ננסה לחפש שדה אחר או נבקש מהמשתמש (כאן נניח 0 כברירת מחדל אם נכשל)
                totalUnits = 50;
            }
        } else if (customNameEl && customNameEl.value) {
            bookName = customNameEl.value;
            totalUnits = parseInt(customAmountEl.value) || 50;
        }

        if (document.getElementById('paceType').value === 'date') {
            targetDate = dateEl.value;
        }
    }

    // בדיקות תקינות
    if (!bookName || !totalUnits || totalUnits <= 0) {
        await customAlert("נא לוודא שנבחר ספר/הוזן שם וכמות יחידות תקינה");
        return;
    }

    // יצירת האובייקט
    const newGoal = {
        id: Date.now().toString(),
        bookName: bookName,
        totalUnits: totalUnits,
        currentUnit: 0,
        status: 'active',
        startDate: new Date().toISOString(),
        targetDate: targetDate, // הוספנו תאריך יעד
        dedication: dedicationEl ? dedicationEl.value : ""
    };

    // שמירה ועדכון
    userGoals.unshift(newGoal); // הוספה לראש הרשימה
    localStorage.setItem('torahApp_goals', JSON.stringify(userGoals)); // או השם שאתה משתמש בו לשמירה
    saveGoals(); // פונקציית העזר שלך לשמירה

    // סימון להבהוב (לפני הרינדור)
    window.newGoalId = newGoal.id;
    window.isNewGoalAnimation = true; // דגל לאנימציה מיוחדת

    renderGoals(); // רענון המסך

    // איפוס שדות
    if (customNameEl) customNameEl.value = '';
    if (customAmountEl) customAmountEl.value = '';

    if (quickAmountEl) quickAmountEl.value = '';
    showToast("הלימוד נוסף בהצלחה!", "success");

    // מעבר ללוח הבקרה
    switchScreen('dashboard', document.querySelectorAll('.nav-item')[0]); // מעבר לבית (אינדקס 0)

    // שמירה בענן (Supabase)
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser && currentUser.email) {
            await supabaseClient.from('user_goals').insert([{
                id: newGoal.id,
                user_email: currentUser.email,
                book_name: bookName,
                total_units: totalUnits,
                current_unit: 0,
                status: 'active',
                target_date: targetDate || null
            }]);
        }
    } catch (e) {
        console.log("נשמר מקומית בלבד");
        console.error("שגיאת שמירה בענן:", e); // הדפסת השגיאה לניפוי באגים
    }
}

async function sendChavrutaRequest(receiverEmail, bookName) {
    if (!currentUser) return await customAlert("עליך להיות מחובר");

    try {
        console.log("שולח בקשה:", { receiverEmail, bookName });

        const { error } = await supabaseClient
            .from('chavruta_requests')
            .insert([{
                sender_email: currentUser.email,
                receiver_email: receiverEmail,
                book_name: bookName,
                status: 'pending'
            }]);

        if (error) throw error;

        showToast("בקשת החברותא נשלחה בהצלחה!", "success");
        document.getElementById('chavrutaModal').style.display = 'none';
    } catch (e) {
        console.error("שגיאה בשליחת הבקשה:", e);
        await customAlert("נכשל בשליחת הבקשה: " + (e.message || "שגיאה לא ידועה"));
    }
}

async function createGoal(name, total, targetDate, dedication) {
    // 1. יצירת האובייקט
    const newGoal = {
        id: Date.now().toString(),
        bookName: name,
        totalUnits: total,
        currentUnit: 0,
        targetDate: targetDate || '',
        status: 'active',
        dedication: dedication || ''
    };

    // 2. הוספה לרשימה המקומית ורענון
    userGoals.unshift(newGoal); // הוספה לראש הרשימה
    saveGoals();

    window.newGoalId = newGoal.id;
    window.isNewGoalAnimation = true;

    renderGoals(); // חשוב מאוד כדי שיופיע מיד במסך!

    // 3. מעבר אוטומטי ללוח הבקרה כדי לראות את התוצאה
    switchScreen('dashboard', document.querySelectorAll('.nav-item')[0]); // מעבר לבית (אינדקס 0)

    // 4. שמירה ב-Supabase
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser) {
            await supabaseClient.from('user_goals').insert([{
                id: newGoal.id,
                user_email: currentUser.email,
                book_name: name,
                total_units: total,
                current_unit: 0,
                status: 'active',
                target_date: targetDate || null
            }]);
        }
    } catch (e) {
        console.error("שגיאה בסנכרון ענן, אך נשמר מקומית:", e);
    }
} async function joinCycle(cycleType) {
    const cycles = { 'daf-yomi': ["דף היומי", 2711], 'mishnah': ["משנה יומית", 4192], 'rambam': ["רמב\"ם יומי", 1000], 'halacha': ["הלכה יומית", 1000] };
    await createGoal(cycles[cycleType][0], cycles[cycleType][1], null, "מחזור לימוד קבוע", "");
    showToast("הצטרפת בהצלחה!", "success");
}
// === רינדור ותצוגה ===
function renderGoals() {
    const list = document.getElementById('goalsList');
    const tasksList = document.getElementById('dailyTasksList');
    const archiveList = document.getElementById('archiveList');
    if (!list || !tasksList || !archiveList) return;

    list.innerHTML = ''; tasksList.innerHTML = ''; archiveList.innerHTML = '';
    let hasTasks = false, totalLearned = 0;

    userGoals.forEach(goal => {
        if (goal.status === 'active') {
            renderGoalCard(goal, list, true);
            totalLearned += goal.currentUnit;

            if (goal.targetDate) {
                hasTasks = true;
                const days = Math.max(1, Math.ceil((new Date(goal.targetDate) - new Date()) / 86400000));
                const totalLeft = goal.totalUnits - goal.currentUnit;
                const dailyTarget = (totalLeft / days).toFixed(1);

                const taskDiv = document.createElement('div');
                taskDiv.className = 'task-row';

                // בדיקה אם המשימה היומית הושלמה (לפי חישוב פשוט של התקדמות)
                if (totalLeft <= 0) {
                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><span class="task-highlight" style="background:#dcfce7; color:#16a34a;">סיימת את הספר!</span>`;
                } else {
                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><span class="task-highlight">יעד יומי: ${dailyTarget}</span>`;
                }
                tasksList.appendChild(taskDiv);
            }
        } else {
            renderGoalCard(goal, archiveList, false);
            totalLearned += goal.totalUnits;
        }
    });

    updateRankProgressBar(totalLearned);
    document.getElementById('dailyTasksContainer').style.display = hasTasks ? 'block' : 'none';
    document.getElementById('stat-books').innerText = userGoals.filter(g => g.status === 'active').length;
    document.getElementById('stat-pages').innerText = totalLearned;
    document.getElementById('stat-completed').innerText = userGoals.filter(g => g.status === 'completed').length;
    // Rating is updated via loadChatRating called in syncGlobalData
}


async function updateRankProgressBar(score) {
    let currentRank = getRankName(score);

    if (notificationsEnabled && currentUser && previousRank && currentRank !== previousRank) {
        const rankOrder = { "צורב צעיר": 0, "מתמיד": 1, "צורבא מרבנן": 2, "תלמיד חכם": 3 };
        if (rankOrder[currentRank] > rankOrder[previousRank]) {
            confetti({ particleCount: 400, spread: 120, origin: { y: 0.6 } });
            const msg = `👑 ברכות! עלית לדרגת ${currentRank}!`;
            addNotification(msg);
            showToast(msg, "success");
            // Add reward points
            await supabaseClient.rpc('increment_field', { table_name: 'users', field_name: 'reward_points', increment_value: 100, user_email: currentUser.email });
        }
    }
    previousRank = currentRank;

    let nextRank = "", nextThreshold = 0, prevThreshold = 0;
    if (score < 101) { nextRank = "מתמיד"; nextThreshold = 101; prevThreshold = 0; }
    else if (score < 501) { nextRank = "צורבא מרבנן"; nextThreshold = 501; prevThreshold = 101; }
    else if (score < 1001) { nextRank = "תלמיד חכם"; nextThreshold = 1001; prevThreshold = 501; }
    else { nextRank = "מאור הדור"; nextThreshold = score; prevThreshold = 0; }

    const rInfo = document.getElementById('rank-info');
    const rBar = document.getElementById('rank-progress-bar');
    const rFooter = document.getElementById('rank-footer');
    if (!rInfo || !rBar) return;

    if (score >= 1001) {
        rInfo.innerText = `דרגת שיא: ${currentRank}`;
        rBar.style.width = "100%";
        rFooter.innerText = "אשריכם! הגעתם לדרגה הגבוהה ביותר.";
    } else {
        const progress = ((score - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
        rInfo.innerText = `דרגה נוכחית: ${currentRank}`;
        rBar.style.width = `${progress}%`;
        rFooter.innerText = `עוד ${nextThreshold - score} דפים לדרגת ${nextRank}`;
    }
}

function renderLeaderboard() {
    const listContainer = document.getElementById('leaderboardList');
    const meContainer = document.getElementById('leaderboardMeContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (meContainer) meContainer.innerHTML = '';

    const cityFilter = document.getElementById('leaderboardCityFilter') ? document.getElementById('leaderboardCityFilter').value.toLowerCase() : '';
    const bookFilter = document.getElementById('leaderboardBookFilter') ? document.getElementById('leaderboardBookFilter').value.toLowerCase() : '';

    // 1. קח את כל המשתמשים מהענן, אבל הסר את עצמך משם (לפי אימייל) כדי למנוע כפילות
    let all = globalUsersData.filter(u => !currentUser || u.email.toLowerCase() !== currentUser.email.toLowerCase());

    // 2. הוסף את עצמך ידנית עם הנתונים המקומיים המעודכנים ביותר
    const myScore = userGoals.reduce((sum, g) => sum + g.currentUnit, 0);
    const myActiveBooks = userGoals.filter(g => g.status === 'active').map(g => g.bookName);

    if (currentUser) {
        all.push({
            id: 'me',
            name: (currentUser.isAnonymous ? "אנונימי" : currentUser.displayName) + " (אני)",
            learned: myScore,
            email: currentUser.email,
            books: myActiveBooks,
            city: currentUser.city
        });
    }

    // סינון
    all = all.filter(u => {
        const cityMatch = !cityFilter || (u.city && u.city.toLowerCase().includes(cityFilter));
        const bookMatch = !bookFilter || (u.books && u.books.some(b => b.toLowerCase().includes(bookFilter)));
        return cityMatch && bookMatch;
    });

    // 3. מיון והצגה
    all.sort((a, b) => {
        if (currentLeaderboardSort === 'rating') {
            return (b.chat_rating || 0) - (a.chat_rating || 0);
        }
        return b.learned - a.learned;
    }).forEach((u, i) => {
        const rank = i + 1;
        // אם זה 'אני', שולחים מזהה מיוחד, אחרת את האימייל
        const idToSend = u.id === 'me' ? 'me' : u.email;
        const score = currentLeaderboardSort === 'rating' ? (u.chat_rating || 0) : u.learned;
        const scoreLabel = currentLeaderboardSort === 'rating' ? 'רייטינג' : 'נקודות';
        const badge = getUserBadgeHtml(u);

        // Render Me Card separately if it's me
        if (u.id === 'me' && meContainer) {
            meContainer.innerHTML = `
                <div class="lb-me-card">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="color:#ffb700; font-weight:900; font-size:1.25rem; width:2rem; text-align:center;">${rank}</div>
                        <div style="width:3.5rem; height:3.5rem; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
                            <i class="fas fa-user" style="color:#94a3b8; font-size:1.5rem;"></i>
                        </div>
                        <div>
                            <h3 style="font-weight:bold; color:#1d180c; margin:0;">${u.name}</h3>
                            <p style="font-size:0.75rem; color:#a18745; font-weight:500; margin:0;">${getRankName(u.learned)} • ${u.city || 'ירושלים'}</p>
                        </div>
                    </div>
                    <div style="text-align:left;">
                        <p style="font-size:1.25rem; font-weight:900; color:#ffb700; margin:0;">${score}</p>
                        <p style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:bold; opacity:0.6; margin:0;">${scoreLabel}</p>
                    </div>
                </div>
            `;
        }

        // Render List Item
        let rankColorClass = 'color:#a18745; opacity:0.6;';
        let rankIcon = '';
        if (rank === 1) {
            rankColorClass = 'color:#ffb700; font-weight:900; font-size:1.5rem;';
            rankIcon = `<div style="position:absolute; top:-4px; right:-4px; background:#ffb700; color:white; padding:2px; border-radius:50%; border:2px solid white; display:flex;"><span class="material-icons-round" style="font-size:10px;">star</span></div>`;
        } else if (rank === 2) {
            rankColorClass = 'color:#a18745; font-weight:900; font-size:1.25rem; opacity:0.8;';
        } else if (rank === 3) {
            rankColorClass = 'color:#a18745; font-weight:900; font-size:1.25rem; opacity:0.6;';
        }

        const div = document.createElement('div');
        div.className = 'lb-card';
        div.style.animationDelay = `${i * 0.05}s`;
        div.onclick = () => showUserDetails(idToSend);
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:1rem;">
                <div style="${rankColorClass} width:2rem; text-align:center;">${rank}</div>
                <div style="position:relative; width:3rem; height:3rem; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-user" style="color:#cbd5e1;"></i>
                    ${rankIcon}
                </div>
                <div>
                    <h3 style="font-weight:bold; color:#1d180c; margin:0; ${rank > 3 ? 'opacity:0.8;' : ''}">${u.name} ${badge}</h3>
                    <p style="font-size:0.75rem; color:#a18745; margin:0; ${rank > 3 ? 'opacity:0.8;' : ''}">${getRankName(u.learned)} • ${u.city || 'לא צוין'}</p>
                </div>
            </div>
            <div style="text-align:left;">
                <p style="font-size:1.125rem; font-weight:bold; color:#1d180c; margin:0; ${rank > 3 ? 'opacity:0.8;' : ''}">${score}</p>
                <p style="font-size:0.65rem; opacity:0.6; font-weight:bold; text-transform:uppercase; margin:0;">${scoreLabel}</p>
            </div>
        `;
        listContainer.appendChild(div);
    });
}

async function findChavruta(bookName) {
    const modal = document.getElementById('chavrutaModal');
    // הזרקת ה-HTML החדש למודאל
    const modalContent = modal.querySelector('.modal-content');
    modalContent.innerHTML = getSearchHTML(bookName);

    modal.style.display = 'flex';
    bringToFront(modal);

    // הגדרת השלבים
    const steps = [
        { id: 'age', text: 'בודק התאמת גיל' },
        { id: 'city', text: 'מחפש שותפים קרובים בעיר שלך' },
        { id: 'level', text: 'משווה רמות לימוד' },
        { id: 'history', text: 'מנתח היסטוריית למידה' }
    ];

    const stepsContainer = document.getElementById('searchSteps');

    // רינדור ראשוני של השלבים
    stepsContainer.innerHTML = steps.map((step, index) => `
        <div id="step-${step.id}" class="search-step ${index === 0 ? 'active' : ''}">
            <div class="step-icon ${index === 0 ? 'active' : 'pending'}">
                ${index === 0 ? '' : ''}
            </div>
            <span class="text-slate-700 dark:text-slate-300 font-medium">${step.text}</span>
        </div>
    `).join('');

    try {
        // משיכת נתונים מהענן
        const { data: remoteUsers, error } = await supabaseClient.from('users').select('*');
        if (error) throw error;

        const matches = remoteUsers.filter(u => u.email !== currentUser.email);

        // סימולציה של שלבי החיפוש (אנימציה)
        for (let i = 0; i < steps.length; i++) {
            await new Promise(r => setTimeout(r, 800)); // השהיה לאפקט
            markStepComplete(steps[i].id);
            if (i < steps.length - 1) {
                activateStep(steps[i + 1].id);
            }
        }

        // לוגיקת חישוב התאמה (כפי שהייתה במקור)
        const myCity = currentUser.city ? currentUser.city.trim().toLowerCase() : "";
        const myRank = getRankName(userGoals.reduce((sum, g) => sum + g.currentUnit, 0));

        matches.forEach(u => {
            u.matchScore = 0;
            if (u.age && currentUser.age && Math.floor(u.age / 10) === Math.floor(currentUser.age / 10)) u.matchScore += 150;
            if (u.city && u.city.trim().toLowerCase() === myCity && myCity) u.matchScore += 100;
            const uLocal = globalUsersData.find(gu => gu.email === u.email);
            const uScore = uLocal ? uLocal.learned : 0;
            if (getRankName(uScore) === myRank) u.matchScore += 50;
            if (Math.random() > 0.7) u.matchScore += 30;
            if (u.display_name && currentUser.displayName && u.display_name[0] === currentUser.displayName[0]) u.matchScore += 10;
        });

        matches.sort((a, b) => b.matchScore - a.matchScore);

        // הצגת התוצאות בעיצוב החדש
        renderChavrutaResults(matches, bookName);

    } catch (e) {
        console.error(e);
        stepsContainer.innerHTML = `<div style="text-align:center; color:#ef4444;">שגיאה בחיפוש: ${e.message}</div>`;
    }
}

function getSearchHTML(bookName) {
    return `
        <div class="search-modal-header">
            <button class="text-slate-400 hover:text-slate-600 transition-colors" style="background:none; border:none; cursor:pointer;" onclick="closeModal()">
                <span class="material-icons-round" style="font-size:1.5rem;">close</span>
            </button>
            <div style="text-align:right;">
                <h2 style="font-size:1.25rem; font-weight:bold; display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; margin:0;">
                    מחפשים לך חברותא
                    <span class="material-icons-round text-primary">auto_awesome</span>
                </h2>
                <p style="color:#64748b; margin-top:0.25rem; font-size:0.85rem;">עבור הספר: <strong>${bookName}</strong></p>
            </div>
        </div>
        <div class="search-modal-body">
            <div class="radar-container">
                <div class="radar-ping"></div>
                <div class="radar-pulse"></div>
                <div class="radar-spinner"></div>
                <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                    <div class="bg-primary-10 p-4 rounded-full" style="padding:0.75rem; border-radius:50%;">
                        <span class="material-icons-round text-primary" style="font-size:2.5rem;">group_add</span>
                    </div>
                </div>
            </div>
            <div style="width:100%; margin-top:1.5rem; display:flex; flex-direction:column; gap:0.5rem;" id="searchSteps"></div>
        </div>
    `;
}

function markStepComplete(stepId) {
    const el = document.getElementById(`step-${stepId}`);
    if (el) {
        el.classList.remove('active');
        const icon = el.querySelector('.step-icon');
        icon.className = 'step-icon done';
        icon.innerHTML = '<span class="material-icons-round" style="font-size:0.9rem;">check</span>';
        const status = el.querySelector('.animate-pulse');
        if (status) status.remove();
    }
}

function activateStep(stepId) {
    const el = document.getElementById(`step-${stepId}`);
    if (el) {
        el.classList.add('active');
        const icon = el.querySelector('.step-icon');
        icon.className = 'step-icon active';
    }
}

function renderChavrutaResults(matches, bookName) {
    const modalContent = document.querySelector('#chavrutaModal .modal-content');

    let resultsHTML = `
        <div class="search-modal-header">
            <button class="text-slate-400 hover:text-slate-600 transition-colors" style="background:none; border:none; cursor:pointer;" onclick="closeModal()">
                <span class="material-icons-round" style="font-size:1.5rem;">close</span>
            </button>
            <div style="text-align:right;">
                <h2 style="font-size:1.25rem; font-weight:bold; display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; margin:0;">
                    תוצאות חיפוש
                    <span class="material-icons-round text-primary">done_all</span>
                </h2>
                <p style="color:#64748b; margin-top:0.25rem; font-size:0.85rem;">נמצאו ${matches.length} לומדים מתאימים</p>
            </div>
        </div>
        <div style="padding:1rem; overflow-y:auto; max-height:50vh;">
    `;

    if (matches.length === 0) {
        resultsHTML += `<div style="text-align:center; color:#64748b; margin-top:2.5rem;">לא נמצאו תוצאות. נסה שוב מאוחר יותר.</div>`;
    } else {
        matches.forEach(user => {
            const displayName = user.isAnonymous ? "לומד אנונימי" : (user.display_name || user.name || "לומד");
            const badge = getUserBadgeHtml(user);

            resultsHTML += `
                <div style="display:flex; align-items:center; justify-content:space-between; background:var(--card-bg); padding:1rem; border-radius:1rem; border:1px solid var(--border-color); margin-bottom:0.75rem; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="width:3rem; height:3rem; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; font-size:1.25rem; color:#64748b;">
                            ${user.isAnonymous ? '<i class="fas fa-user-secret"></i>' : '<i class="fas fa-user"></i>'}
                        </div>
                        <div>
                            <div style="font-weight:bold; display:flex; align-items:center; gap:0.5rem;">
                                ${displayName} ${badge}
                            </div>
                            <div style="font-size:0.85rem; color:#64748b;">${user.city || 'לא צוין'} • ${user.matchScore} נק' התאמה</div>
                        </div>
                    </div>
                    <button class="btn" style="width:auto; padding:0.5rem 1rem; font-size:0.85rem; border-radius:0.75rem;"
                        onclick="sendChavrutaRequest('${user.email}', '${bookName}')">
                        שלח בקשה
                    </button>
                </div>
            `;
        });
    }

    resultsHTML += `</div>`;
    modalContent.innerHTML = resultsHTML;
}

function closeChavrutaModal() {
    const modal = document.getElementById('chavrutaModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// וודא שגם לחיצה מחוץ למודאל תסגור אותו (אופציונלי אך מומלץ)
window.onclick = function (event) {
    const modal = document.getElementById('chavrutaModal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

async function showUserDetails(uid) {
    if (!uid) return;

    let user;
    // בדיקה אם זה הפרופיל שלי
    if (uid === 'me') {
        const myActiveBooks = userGoals.filter(g => g.status === 'active').map(g => g.bookName);
        const myCompletedBooks = userGoals.filter(g => g.status === 'completed').map(g => g.bookName);
        const myScore = userGoals.reduce((sum, g) => sum + g.currentUnit, 0);
        // בפרופיל שלי אני רואה הכל
        user = {
            name: currentUser.displayName,
            learned: myScore,
            books: myActiveBooks,
            completedBooks: myCompletedBooks,
            id: 'me',
            email: currentUser.email,
            phone: currentUser.phone,
            city: currentUser.city,
            address: currentUser.address,
            age: currentUser.age,
            subscription: currentUser.subscription
        };
    } else {
        user = globalUsersData.find(u => u.email && u.email.toLowerCase() === uid.toLowerCase());
    }

    // תיקון: אם המשתמש לא נמצא (בגלל בעיית סנכרון), ניצור פרופיל זמני כדי שהחלונית תיפתח
    if (!user) {
        user = {
            id: uid,
            email: uid || '',
            name: (uid && uid.includes('@')) ? uid.split('@')[0] : 'משתמש',
            learned: 0,
            books: [],
            completedBooks: [],
            city: 'לא ידוע',
            phone: '',
            address: '',
            age: null,
            lastSeen: null,
            subscription: { amount: 0, level: 0 },
            isAnonymous: true
        };
    }

    // בדיקת מעקב
    let isFollowing = false;
    if (currentUser && user.email !== currentUser.email) {
        const { data } = await supabaseClient.from('user_followers').select('*').eq('follower_email', currentUser.email).eq('following_email', user.email).single();
        if (data) isFollowing = true;
    }

    document.getElementById('modalUserName').innerText = user.name;
    document.getElementById('modalUserRank').innerText = "דרגה: " + getRankName(user.learned);
    document.getElementById('modalUserAge').innerText = user.age ? `גיל: ${user.age}` : '';

    // --- הצגת מנוי והילה במודאל ---
    const subDiv = document.getElementById('modalUserSubscription');
    const avatarIcon = document.querySelector('#userModal .fa-user-circle').parentElement;

    // איפוס הילה במודאל
    avatarIcon.className = '';
    avatarIcon.style.fontSize = '3rem'; avatarIcon.style.marginBottom = '10px'; avatarIcon.style.color = '#cbd5e1';
    if (user.subscription && user.subscription.level > 0) {
        subDiv.innerHTML = `<div class="subscription-badge" style="background:${SUBSCRIPTION_TIERS.find(t => t.level === user.subscription.level)?.color}20; color:${SUBSCRIPTION_TIERS.find(t => t.level === user.subscription.level)?.color}; border:1px solid currentColor;"><i class="fas fa-crown"></i> ${user.subscription.name}</div>`;
        avatarIcon.classList.add(`aura-lvl-${user.subscription.level}`, 'aura-base');
        avatarIcon.style.borderRadius = '50%'; // חשוב להילה עגולה
    } else {
        subDiv.innerHTML = '';
    }

    // --- לוגיקת פרטיות ---
    // האם להציג פרטים מלאים? (אם זה אני, או אם זה חברותא מאושרת)
    const showFullDetails = (uid === 'me' || approvedPartners.has(user.email));

    // ניצור אלמנט HTML לפרטי הקשר
    let contactHtml = `<div style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.9rem;">`;

    // העיר תמיד מוצגת
    contactHtml += `<div><i class="fas fa-map-marker-alt" style="width:20px; text-align:center;"></i> <strong>עיר:</strong> ${user.city || 'לא צוין'}</div>`;
    contactHtml += `<div><i class="fas fa-history" style="width:20px; text-align:center;"></i> <strong>נראה לאחרונה:</strong> ${user.lastSeen ? formatHebrewDate(user.lastSeen) : 'לא ידוע'}</div>`;

    if (showFullDetails) {
        // הצגת פרטים מלאים
        contactHtml += `
            <div style="margin-top:5px; color:#16a34a;">
                <i class="fas fa-phone" style="width:20px; text-align:center;"></i> <strong>טלפון:</strong> ${user.phone || 'לא הוזן'}
            </div>
            ${user.address ? `<div style="margin-top:5px;"><i class="fas fa-home" style="width:20px; text-align:center;"></i> <strong>כתובת:</strong> ${user.address}</div>` : ''}
        `;
    } else {
        // הסתרת פרטים
        contactHtml += `
            <div style="margin-top:8px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:5px;">
                <i class="fas fa-lock"></i> הטלפון והכתובת חסויים.<br>
                <small>הפרטים ייחשפו לאחר אישור חברותא הדדי.</small>
            </div>
        `;
    }

    // כפתור מעקב
    if (user.email !== currentUser.email) {
        contactHtml += `
            <div style="margin-top:10px; text-align:center;">
                <button id="followBtn" class="btn" style="width:auto; padding:5px 15px; background:${isFollowing ? '#94a3b8' : 'var(--accent)'};" onclick="toggleFollow('${user.email}')">
                    ${isFollowing ? '<i class="fas fa-user-minus"></i> הסר עוקב' : '<i class="fas fa-user-plus"></i> עקוב'}
                </button>
            </div>`;
    }
    contactHtml += `</div>`;

    // הזרקת פרטי הקשר לתוך המודאל (לפני רשימת הספרים)
    // אנו משתמשים ב-insertAdjacentHTML כדי להוסיף את זה לפני הכותרת "לומד כעת"
    const list = document.getElementById('modalUserBooks');

    // ניקוי תוכן קודם של פרטי קשר אם קיים (דרך פשוטה היא לנקות את כל האזור ולבנות מחדש)
    // לצורך פשטות נחליף את ה-HTML של האזור שמעל הספרים
    // נניח שיש במודאל div שמכיל את המידע. בקוד המקורי זה היה קצת מפוזר.
    // הפתרון הכי נקי בקוד שלך:

    // 1. ננקה את הרשימה
    list.innerHTML = '';

    // 2. נוסיף את פרטי הקשר כפריט ראשון מיוחד (או נזריק לפני הרשימה אם יש לך אלמנט ייעודי)
    // הכי בטוח: להוסיף את ה-HTML שיצרנו כ-DIV נפרד לפני ה-UL של הספרים
    const existingContactDiv = document.getElementById('tempContactDiv');
    if (existingContactDiv) existingContactDiv.remove(); // מחיקת ישן

    const contactDiv = document.createElement('div');
    contactDiv.id = 'tempContactDiv';
    contactDiv.innerHTML = contactHtml;
    list.parentNode.insertBefore(contactDiv, list.parentNode.firstChild); // הוספה בראש הרשימה

    // --- סיום לוגיקת פרטיות ---

    // מילוי רשימת הספרים
    if (!user.books || user.books.length === 0) {
        list.innerHTML += '<li style="color:#999;">לא לומד ספרים כרגע</li>';
    } else {
        user.books.forEach(b => {
            const li = document.createElement('li');
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.marginBottom = "8px";

            let content = `<span>${b}</span>`;

            const isChavruta = chavrutaConnections.some(c => c.email === user.email && c.book === b);

            if (isChavruta) {
                content += ` <span style="font-size:0.7rem; color:green; background:#dcfce7; padding:2px 6px; border-radius:10px;"><i class="fas fa-check"></i> חברותא</span>`;
            } else if (user.id !== 'me') {
                // בדיקה אם אני לומד את הספר הזה
                const amILearning = userGoals.some(g => g.bookName === b && g.status === 'active');
                const isPending = pendingSentRequests.some(r => r.receiver === user.email && r.book === b);

                if (isPending) {
                    content += ` <span style="font-size:0.75rem; color:#f97316;">(בקשה נשלחה)</span>`;
                } else {
                    content += ` 
                     <button class="btn-request" onclick="checkAndSendRequest('${user.email}', '${b}')">
                        <i class="fas fa-paper-plane"></i> שלח בקשה
                     </button>`;
                }
            }

            li.innerHTML = content;
            list.appendChild(li);
        });
    }

    // הצגת ארכיון (ספרים שהושלמו)
    if (user.completedBooks && user.completedBooks.length > 0) {
        const hr = document.createElement('hr');
        hr.style.margin = "15px 0 5px 0";
        hr.style.border = "0";
        hr.style.borderTop = "1px solid #eee";
        list.appendChild(hr);

        const header = document.createElement('div');
        header.innerHTML = '<strong style="color:#16a34a;"><i class="fas fa-check-circle"></i> ארכיון (הושלמו):</strong>';
        header.style.fontSize = '0.9rem';
        header.style.marginBottom = '5px';
        list.appendChild(header);

        user.completedBooks.forEach(b => {
            const li = document.createElement('li');
            li.style.fontSize = "0.9rem";
            li.style.color = "#64748b";
            li.innerHTML = `<i class="fas fa-book" style="font-size:0.8rem; margin-left:5px;"></i> ${b}`;
            list.appendChild(li);
        });
    }
    document.getElementById('userModal').style.display = 'flex';
    bringToFront(document.getElementById('userModal'));
    // הוסף את זה בסוף פונקציית showUserDetails
    document.getElementById('userModal').onclick = function (event) {
        if (event.target == this) {
            closeModal(); // סגירה בלחיצה מחוץ לחלון (על הרקע)
        }
    };
}

async function toggleFollow(targetEmail) {
    const btn = document.getElementById('followBtn');
    const isFollowing = btn.innerText.includes('הסר');

    try {
        if (isFollowing) {
            await supabaseClient.from('user_followers').delete().eq('follower_email', currentUser.email).eq('following_email', targetEmail);
            btn.innerHTML = '<i class="fas fa-user-plus"></i> עקוב';
            btn.style.background = 'var(--accent)';
            showToast("הסרת עוקב", "info");
        } else {
            await supabaseClient.from('user_followers').insert([{ follower_email: currentUser.email, following_email: targetEmail }]);
            btn.innerHTML = '<i class="fas fa-user-minus"></i> הסר עוקב';
            btn.style.background = '#94a3b8';
            showToast("אתה עוקב כעת!", "success");
        }
    } catch (e) {
        console.error(e);
        showToast("שגיאה בעדכון עוקב", "error");
    }
}

async function showMyFollowers() {
    const { data: followers, error } = await supabaseClient
        .from('user_followers')
        .select('follower_email')
        .eq('following_email', currentUser.email);

    const listContent = document.getElementById('followersListContent');
    listContent.innerHTML = '<div style="text-align:center; padding:20px;">טוען עוקבים...</div>';

    document.getElementById('followersModal').style.display = 'flex';
    bringToFront(document.getElementById('followersModal'));

    if (followers && followers.length > 0) {
        let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
        for (const f of followers) {
            const u = globalUsersData.find(user => user.email === f.follower_email) || { name: f.follower_email.split('@')[0], email: f.follower_email, subscription: { level: 0 } };

            // Aura logic
            const subLevel = u.subscription ? u.subscription.level : 0;
            const auraClass = subLevel > 0 ? `aura-lvl-${subLevel}` : '';
            const auraStyle = subLevel > 0 ? 'border-radius: 50%;' : '';

            html += `
                <div style="display:flex; align-items:center; padding:10px; background:#fff; border-bottom:1px solid #eee; cursor:pointer;" onclick="closeModal(); showUserDetails('${u.email}')">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="${auraClass}" style="width:45px; height:45px; display:flex; align-items:center; justify-content:center; font-size:2rem; color:#cbd5e1; ${auraStyle}"><i class="fas fa-user-circle"></i></div>
                        <div>
                            <div style="font-weight:bold;">${u.name}</div>
                            <div style="font-size:0.8rem; color:#64748b;">${u.email}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        listContent.innerHTML = html;
    } else {
        listContent.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">עדיין אין לך עוקבים.</div>';
    }
}

async function checkAndSendRequest(email, book) {
    const amILearning = userGoals.some(g => g.bookName === book && g.status === 'active');
    if (!amILearning) {
        showToast(`עליך ללמוד את "${book}" כדי לשלוח בקשה.`, "error");
        return;
    }
    sendChavrutaRequest(email, book);
}


async function loadSchedules() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('schedules').select('*').eq('user_email', currentUser.email);
        if (data && !error) {
            const schedules = {};
            data.forEach(s => {
                const key = `${s.partner_email}::${s.book_name}`;
                schedules[key] = {
                    days: s.days,
                    time: s.time,
                    partnerName: s.partner_name,
                    book: s.book_name
                };
            });
            localStorage.setItem('chavruta_schedules', JSON.stringify(schedules));
        }
    } catch (e) { console.error("Error loading schedules", e); }
}

async function saveProfile() {
    const name = document.getElementById('profileName').value;
    const phone = document.getElementById('profilePhone').value;
    const city = document.getElementById('profileCity').value;
    const address = document.getElementById('profileAddress').value; // וודא שיש לך input כזה ב-HTML
    const age = document.getElementById('profileAge').value;
    const isAnon = document.getElementById('anonSwitch').checked;
    const newPass = document.getElementById('profileNewPass').value;
    const secQ = document.getElementById('profileSecQ').value;
    const secA = document.getElementById('profileSecA').value;

    // Validation
    if (!validateInput(name, 'name')) {
        return customAlert("השם שהוזן אינו תקין.");
    }
    if (phone && !validateInput(phone, 'phone')) {
        return customAlert("מספר הטלפון שהוזן אינו תקין.");
    }
    if (newPass && !validateInput(newPass, 'password')) {
        return customAlert("הסיסמה החדשה חייבת להכיל לפחות 6 תווים, כולל אותיות ומספרים.");
    }


    // עדכון מקומי
    currentUser.displayName = name;
    currentUser.phone = phone;
    currentUser.city = city;
    currentUser.address = address;
    currentUser.age = age ? parseInt(age) : null;
    currentUser.isAnonymous = isAnon;

    if (newPass) currentUser.password = newPass;
    if (secQ && secA) {
        currentUser.security_questions = [{ q: secQ, a: secA }];
    }

    localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

    // עדכון מיידי של הכותרת והנתונים הגלובליים
    updateHeader();
    const myUserIndex = globalUsersData.findIndex(u => u.email === currentUser.email);
    if (myUserIndex !== -1) {
        globalUsersData[myUserIndex].name = isAnon ? "לומד אנונימי" : (name || "לומד");
        globalUsersData[myUserIndex].city = city;
        globalUsersData[myUserIndex].phone = phone;
        globalUsersData[myUserIndex].isAnonymous = isAnon;
    }

    // עדכון בענן (Upsert)
    let updateData = {
        email: currentUser.email,
        display_name: name,
        age: age ? parseInt(age) : null,
        city: city,
        address: address,
        phone: phone,
        is_anonymous: isAnon,
        subscription: currentUser.subscription,
        last_seen: new Date()
    };
    if (newPass) updateData.password = newPass;
    if (secQ && secA) updateData.security_questions = [{ q: secQ, a: secA }];

    try {
        const { error } = await supabaseClient
            .from('users')
            .upsert(updateData);

        if (error) throw error;
        showToast('הפרופיל עודכן בהצלחה!', "success");

        // רענון כדי לראות את השינויים מיד
        syncGlobalData();
        switchScreen('dashboard', document.querySelector('.nav-item'));

    } catch (e) {
        console.error("שגיאה בשמירה:", e);
        await customAlert("הנתונים נשמרו במכשיר, אך הייתה שגיאה בשמירה לענן.");
    }
}

function saveGoals() {
    // שמירה מקומית
    localStorage.setItem('torahApp_goals', JSON.stringify(userGoals));
}
function switchScreen(name, el) {
    // איפוס תצוגת הוספה למצב ברירת מחדל (תפריט)
    if (name === 'add') {
        showAddSection('menu');
    }

    // טיפול במצב ניהול
    const headerTitle = document.getElementById('headerTitle');
    const bottomNav = document.querySelector('.floating-nav-container');
    const headerEmail = document.getElementById('headerUserEmail');

    if (name === 'admin') {
        isAdminMode = true;
        document.querySelector('.container').style.maxWidth = '100%';
        document.querySelector('.container').style.margin = '0';
        document.querySelector('.container').style.padding = '0';
        document.querySelector('.container').style.height = 'calc(100vh - 65px)'; // גובה מלא פחות האדר
        document.querySelector('.container').style.overflow = 'hidden';

        bottomNav.style.display = 'none';
        headerTitle.innerHTML = 'בית המדרש - <span style="color:#f59e0b;">מצב ניהול</span>';
        headerEmail.innerHTML = '<button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#334155;" onclick="switchScreen(\'dashboard\', document.querySelector(\'.nav-item\'))">יציאה מניהול</button>';
    } else {
        document.getElementById('bot-mode-indicator').style.display = 'none';
        headerEmail.style.display = 'block';
        // אם אנחנו מחוברים כבוט, נציג כפתור חזרה
        if (realAdminUser) {
            document.getElementById('bot-mode-indicator').style.display = 'block';
            headerEmail.style.display = 'none';
        }

        if (name === 'chats') {
            document.querySelector('.container').style.maxWidth = '100%';
            document.querySelector('.container').style.padding = '0';
            document.querySelector('.container').style.margin = '0';
            document.querySelector('.container').style.height = 'calc(100vh - 60px)'; // התאמה לגובה מסך פחות האדר
        }
        isAdminMode = false;
        if (name !== 'chats') {
            const container = document.querySelector('.container');
            container.style.maxWidth = '900px';
            container.style.margin = '20px auto';
            container.style.height = 'auto';
            container.style.overflow = 'visible';
            container.style.padding = '0 15px';
        }
        bottomNav.style.display = 'block';
        headerTitle.innerText = 'בית המדרש';
        headerEmail.innerText = currentUser ? (currentUser.displayName || currentUser.email) : 'לא מחובר';
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');

    // Update active state for the new floating nav
    document.querySelectorAll('.floating-nav-item').forEach(n => n.classList.remove('active'));
    if (el && el.closest('.floating-nav-item')) {
        el.closest('.floating-nav-item').classList.add('active');
    }

    if (name === 'chavrutas') renderChavrutas();
    if (name === 'calendar') renderCalendar();
    if (name === 'community') renderCommunity(); // Mazal Tov moved to chats
    if (name === 'chats') renderChatList('personal');
    if (name === 'archive') loadChatRating();
    if (name === 'ads') loadAds();
}

function toggleDateInput() { document.getElementById('dateInputDiv').style.display = document.getElementById('paceType').value === 'date' ? 'block' : 'none'; }
function toggleQuickDate() { document.getElementById('quickDateDiv').style.display = document.getElementById('quickPace').value === 'date' ? 'block' : 'none'; }

let notifications = [];

// פונקציה להוספת הודעה חדשה
function addNotification(text, id = null, isHtml = false) { // Add isHtml flag
    // מניעת כפילויות
    if (id && notifications.some(n => n.id === id)) return;

    notifications.unshift({
        id: id || Date.now().toString(),
        text: isHtml ? null : text,
        html: isHtml ? text : null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    updateNotifUI();
}

// עדכון הממשק של ההודעות
function updateNotifUI() {
    const badge = document.getElementById('notif-badge');
    const list = document.getElementById('notif-list');

    if (notifications.length > 0) {
        badge.innerText = notifications.length;
        badge.style.display = 'block';
        list.innerHTML = notifications.map((n, index) => {
            if (n.html) {
                // The buttons inside will handle their own logic. No top-level onclick.
                return `<div style="padding: 10px; border-bottom: 1px solid #eee; background: #fff;">${n.html}</div>`;
            }
            // For simple text notifications, allow clicking to remove.
            return `
                    <div style="padding: 8px; border-bottom: 1px solid #f1f5f9; background: #fffbeb; cursor:pointer;" onclick="removeNotification(${index})">
                        <div style="font-weight: bold;">${n.text}</div>
                        <small style="color: #94a3b8;">${n.time}</small>
                    </div>
                `;
        }).join('');
    } else {
        badge.style.display = 'none';
        list.innerHTML = '<p style="color: #94a3b8; text-align: center;">אין הודעות חדשות</p>';
    }
}

function removeNotification(index) {
    notifications.splice(index, 1);
    updateNotifUI();
}

// פתיחה/סגירה של תפריט ההודעות
function toggleNotifications() {
    const dropdown = document.getElementById('notif-dropdown');
    const isOpening = dropdown.style.display === 'none';

    if (isOpening) {
        dropdown.style.display = 'block';
        // When opening, we just show the list. We can also hide the badge.
        document.getElementById('notif-badge').style.display = 'none';
    } else {
        dropdown.style.display = 'none';
        // When closing, clear all notifications from view.
        notifications = [];
        updateNotifUI();
    }
}
// === פונקציות חסרות לציור כרטיסים וניהול התקדמות ===

function renderGoalCard(goal, container, isActive) {
    const div = document.createElement('div');
    div.id = `goal-card-${goal.id}`;
    div.className = 'goal-item';

    // חישוב אחוזים
    const percent = Math.min(100, Math.round((goal.currentUnit / goal.totalUnits) * 100));

    let html = ` 
           <div class="goal-header">
                <div>
                    <span class="goal-title">${goal.bookName}</span>
                    <div style="font-size:0.9rem; color:var(--text-main); font-weight:bold;">${unitToDafString(goal)}</div>
                </div>
                <div style="text-align:left; font-size:0.9rem; color:#64748b;">
                    ${goal.totalUnits - goal.currentUnit} עמודים לסיום
                </div>
            </div>
            ${goal.dedication ? `<div class="dedication-text">${goal.dedication}</div>` : ''}
            
            <div class="progress-container">
                <div class="progress-bar" style="width: ${percent}%"></div>
            </div>`;

    if (isActive) {
        html += `
                <div class="controls-row" style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div class="counter-widget">
                        <button class="btn-circle btn-minus" onclick="updateProgress(${goal.id}, -1)">-</button>
                        <button class="btn-circle btn-plus" onclick="updateProgress(${goal.id}, 1)">+</button>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon" onclick="openChavrutaSearch('${goal.bookName}')" title="מצא חברותא"><i class="fas fa-user-plus"></i></button>
                        <button class="btn-icon" onclick="openBookChat('${goal.bookName}')" title="צ'אט כללי"><i class="fas fa-comments"></i></button>
                        <button class="btn-icon" onclick="openNotes('${goal.id}')" title="הערות אישיות"><i class="fas fa-sticky-note"></i></button>
                        <button class="btn-icon danger" onclick="deleteGoal(${goal.id})" title="מחק לימוד"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
    } else {
        html += `<div style="text-align:center; color:var(--success); font-weight:bold;">הושלם! <i class="fas fa-check"></i></div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
}

function toGematria(num) {
    if (num === 15) return 'טו';
    if (num === 16) return 'טז';

    const letters = [
        ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'],
        ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'],
        ['', 'ק', 'ר', 'ש', 'ת']
    ];
    let str = '';
    let n = num;

    if (n >= 400) {
        str += 'ת'.repeat(Math.floor(n / 400));
        n %= 400;
    }
    if (n >= 100) {
        str += letters[2][Math.floor(n / 100) - 1];
        n %= 100;
    }
    if (n >= 10) {
        str += letters[1][Math.floor(n / 10)];
        n %= 10;
    }
    if (n > 0) {
        str += letters[0][n];
    }
    return str.replace(/יה/g, 'טו').replace(/יו/g, 'טז');
}

function unitToDafString(goal) {
    // בדיקה אם הספר הוא מסוג "תלמוד בבלי"
    const bookEntry = BOOKS_DB.find(b => b.name === goal.bookName);
    const isTalmud = bookEntry && bookEntry.category === "תלמוד בבלי";

    if (isTalmud) {
        if (goal.bookName === 'דף היומי') return dafYomiToday ? `הדף היומי: ${dafYomiToday}` : `נלמדו ${goal.currentUnit} דפים`;
        if (goal.currentUnit === 0) return "טרם התחיל";

        const daf = Math.floor((goal.currentUnit - 1) / 2) + 2;
        const amud = (goal.currentUnit - 1) % 2 === 0 ? '.' : ':';
        return `דף ${toGematria(daf)}${amud}`;
    }
    // לכל השאר, הצג יחידות
    if (goal.currentUnit === 0) return "טרם התחיל";
    return `${goal.currentUnit} / ${goal.totalUnits} יחידות`;
}

// === פונקציות חדשות (הערות ומצב מרוכז) ===

let currentNotesData = { goalId: null, notes: [] };
let noteZIndex = 1;

async function openNotes(goalId) {
    const goal = userGoals.find(g => g.id == goalId);
    if (!goal) return;

    currentNotesData.goalId = goalId;
    currentNotesData.notes = Array.isArray(goal.notes) ? goal.notes : [];
    currentNotesData.bookName = goal.bookName;

    // בדיקה אם יש חברותא וסנכרון פתקים
    const chavruta = chavrutaConnections.find(c => c.book === goal.bookName);
    if (chavruta) {
        try {
            await refreshPartnerNotes(chavruta.email, goal.bookName);
        } catch (e) { console.error("Error fetching partner notes", e); currentNotesData.displayNotes = [...currentNotesData.notes]; }
        const partner = globalUsersData.find(u => u.email === chavruta.email);
        currentNotesData.partnerName = partner ? partner.name : chavruta.email;
    } else {
        currentNotesData.displayNotes = [...currentNotesData.notes];
    }

    localStorage.setItem('current_notes_context', JSON.stringify(currentNotesData));

    // שימוש ב-Textarea במקום iframe כדי לאפשר שמירה אוטומטית ועריכה נוחה
    const modalContent = document.querySelector('#notesModal .modal-content');
    let container = document.getElementById('notesContainer');

    if (!container) {
        // יצירת קונטיינר אם לא קיים (מחליף את ה-iframe)
        const frame = document.getElementById('notesFrame');
        if (frame) frame.style.display = 'none'; // הסתרת ה-iframe הישן

        container = document.createElement('div');
        container.id = 'notesContainer';
        container.style.marginTop = '10px';
        // הוספה ל-DOM אחרי הכותרת או במקום ה-iframe
        if (frame) frame.parentNode.insertBefore(container, frame);
        else modalContent.appendChild(container);
    }

    // יצירת אזור העריכה
    const notesText = currentNotesData.notes.map(n => n.content).join('\n\n');
    container.innerHTML = `
        <textarea id="notesEditor" class="note-content" style="width:100%; height:300px; padding:10px; border:1px solid #ccc; border-radius:8px; font-family:inherit; resize:none;" placeholder="כתוב כאן את חידושי התורה שלך...">${notesText}</textarea>
        <div style="text-align:left; font-size:0.8rem; color:#64748b; margin-top:5px;"><i class="fas fa-save"></i> נשמר אוטומטית</div>
    `;

    // הגדרת שמירה אוטומטית
    const textarea = document.getElementById('notesEditor');
    let saveTimeout;
    textarea.oninput = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const content = textarea.value;
            // שמירה כמערך של הערות (כרגע הערה אחת גדולה לנוחות)
            const newNotes = content ? [{ content: content, date: new Date().toISOString() }] : [];
            updateGoalNotes(goalId, newNotes);
        }, 1000); // שמירה שניה אחרי סיום הקלדה
    };

    document.getElementById('notesModal').style.display = 'flex';
    bringToFront(document.getElementById('notesModal'));
}


function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    const btn = document.querySelector('#bookReaderModal .btn-outline');
    if (document.body.classList.contains('focus-mode')) {
        btn.innerHTML = '<i class="fas fa-compress"></i> יציאה ממצב מרוכז';
        showToast("נכנסת למצב לימוד מרוכז. בהצלחה!", "info");
    } else {
        btn.innerHTML = '<i class="fas fa-expand"></i> מצב מרוכז';
    }
}

async function completeGoal(goalId) {
    const goalIndex = userGoals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) return;

    // עדכון סטטוס לארכיון
    userGoals[goalIndex].status = 'completed';
    userGoals[goalIndex].completedDate = new Date().toISOString();

    saveGoals(); // שמירה קריטית!

    // הפעלת החגיגה (Confetti)
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2ecc71', '#3498db', '#f1c40f']
    });

    // הצגת הודעת שמחה
    showToast("אשריך! סיימת את הלימוד: " + userGoals[goalIndex].bookName, "success");
    addNotification(`🎉 מזל טוב! סיימת את מסכת ${userGoals[goalIndex].bookName}!`);
    renderGoals(); // ריענון התצוגה (יעבור אוטומטית ללשונית ארכיון)

    // מחיקת תזכורות בלוח הקשורות לספר זה
    const bookName = userGoals[goalIndex].bookName;
    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');

    // הסרת חברותא פעילה מרשימת המאושרים (כדי להסתיר את הצ'אט)
    const conn = chavrutaConnections.find(c => c.book === bookName);
    if (conn) {
        approvedPartners.delete(conn.email);
    }

    Object.keys(schedules).forEach(key => {
        if (key.endsWith('::' + bookName)) {
            delete schedules[key];
        }
    });
    localStorage.setItem('chavruta_schedules', JSON.stringify(schedules));

    try {
        // מחיקת בקשת החברותא מהשרת
        await supabaseClient.from('chavruta_requests')
            .delete()
            .eq('book_name', bookName)
            .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`);
        await supabaseClient.from('schedules').delete().eq('user_email', currentUser.email).eq('book_name', bookName);
    } catch (e) { console.error("Error deleting schedule on complete", e); }

    // Post to Mazal Tov board
    try {
        await supabaseClient.from('siyum_board').insert({
            user_email: currentUser.email,
            book_name: bookName,
            completed_at: new Date().toISOString()
        });
    } catch (e) { console.error("Failed to post to siyum board", e); }

    // עדכון ב-Supabase
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser) {
            await supabaseClient
                .from('user_goals')
                .update({ status: 'completed' })
                .eq('user_email', currentUser.email)
                .eq('book_name', userGoals[goalIndex].bookName);
            syncGlobalData();
        }
    } catch (e) {
        console.error("Error updating status in cloud", e);
    }

    // שליחת התראה לעוקבים
    const { data: followers } = await supabaseClient.from('user_followers').select('follower_email').eq('following_email', currentUser.email);
    if (followers && followers.length > 0) {
        const msgs = followers.map(f => ({
            sender_email: 'updates@system', // נשלח כעדכון מהנעקבים
            receiver_email: f.follower_email,
            message: `המשתמש ${currentUser.displayName} סיים את המסכת <strong>${bookName}</strong>!`,
            is_html: true
        }));
        await supabaseClient.from('chat_messages').insert(msgs);
    }
}

async function updateProgress(goalId, change) {
    // 1. מציאת הלימוד ברשימה המקומית
    const goal = userGoals.find(g => g.id == goalId);
    if (!goal) return;

    // 2. חישוב הכמות החדשה (לא פחות מ-0 ולא יותר מהסך הכל)
    const newAmount = Math.max(0, Math.min(goal.totalUnits, goal.currentUnit + change));

    // אם לא היה שינוי, לא עושים כלום
    if (newAmount === goal.currentUnit) return;

    goal.currentUnit = newAmount;
    saveGoals();

    // עדכון ה-DOM ישירות לאנימציה חלקה
    const goalCard = document.getElementById(`goal-card-${goalId}`);
    if (goalCard) {
        const percent = Math.min(100, Math.round((goal.currentUnit / goal.totalUnits) * 100));

        // עדכון טקסט הדף/יחידה
        const dafStringEl = goalCard.querySelector('p[style*="font-size:0.875rem"]');
        if (dafStringEl) dafStringEl.innerText = unitToDafString(goal);

        // עדכון טקסט עמודים לסיום
        const remainingEl = goalCard.querySelector('span[style*="color:#94a3b8"]');
        if (remainingEl) remainingEl.innerText = `${goal.totalUnits - goal.currentUnit} עמודים לסיום`;

        // עדכון טקסט אחוזים
        const percentTextEl = goalCard.querySelector('span[style*="font-weight:bold"]');
        if (percentTextEl) percentTextEl.innerText = `${percent}%`;

        // עדכון פס התקדמות
        const progressBarEl = goalCard.querySelector('.progress-fill-gradient');
        if (progressBarEl) progressBarEl.style.width = `${percent}%`;

        // עדכון סטטיסטיקה כללית
        let totalLearned = userGoals.reduce((sum, g) => sum + (g.currentUnit || 0), 0);
        document.getElementById('stat-pages').innerText = totalLearned;
        updateRankProgressBar(totalLearned);
    } else {
        renderGoals(); // Fallback אם הכרטיס לא נמצא
    }

    // עדכון מעקב יומי (גם אם זה שלילי - תיקון טעות)
    incDailyProgress(goalId, change);

    // --- עדכון מיידי של פס ההתקדמות היומי וחגיגות ---
    if (goal.targetDate) {
        const diffTime = new Date(goal.targetDate) - new Date();
        const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        const dailyTarget = Math.ceil((goal.totalUnits - goal.currentUnit) / diffDays); // חישוב מחדש של היעד
        const doneToday = getDailyProgress(goal.id) + (change > 0 ? change : 0); // Use the new value for checking completion

        // מציאת האלמנט ב-DOM
        const taskRow = document.getElementById(`daily-task-${goal.id}`);
        if (taskRow) {
            const dailyPercent = Math.min(100, (doneToday / Math.max(1, dailyTarget)) * 100);
            const isDailyDone = doneToday >= dailyTarget;
            const fillEl = taskRow.querySelector('.daily-progress-fill');

            if (fillEl) {
                fillEl.style.width = `${dailyPercent}%`;
                fillEl.style.background = isDailyDone ? '#16a34a' : 'var(--accent)';
            }
        }

        if (change > 0) {
            const doneBefore = getDailyProgress(goal.id); // This is before the `incDailyProgress` call
            const doneAfter = doneBefore + change;

            if (doneBefore < dailyTarget && doneAfter >= dailyTarget) {
                confetti({ particleCount: 200, spread: 90, origin: { x: 0.5, y: 0.5 }, zIndex: 9999 });
                const taskRow = document.getElementById(`daily-task-${goal.id}`);
                if (taskRow) {
                    taskRow.classList.add('daily-goal-reached');
                    const statusSpan = taskRow.querySelector('.task-highlight') || taskRow.querySelector('span');
                    if (statusSpan) {
                        statusSpan.innerHTML = '<i class="fas fa-check"></i> הושלם';
                        statusSpan.style.color = '#16a34a';
                        statusSpan.style.background = '#dcfce7';
                    }
                }
            }
        }
    }
    // --------------------------------------------------------

    // הערה: הסרנו את renderGoals() מכאן כדי למנוע קפיצה ("בום") ולשמור על האנימציה

    // 4. בדיקה אם הספר הסתיים
    if (goal.currentUnit >= goal.totalUnits && goal.status === 'active') {
        completeGoal(goal.id);
    }

    // 5. שליחה ל-Supabase ברקע
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser) {
            // עדכון לפי המייל ושם הספר
            await supabaseClient
                .from('user_goals')
                .update({ current_unit: goal.currentUnit })
                .eq('user_email', currentUser.email)
                .eq('book_name', goal.bookName);
        }
    } catch (e) {
        console.log("שגיאת סנכרון (אבל נשמר מקומית):", e);
    }
}

async function deleteGoal(goalId) {
    if (!(await customConfirm("האם אתה בטוח שברצונך למחוק את הלימוד הזה?"))) return;

    // 1. מציאת הלימוד כדי לדעת מה למחוק מהענן אחר כך
    const goalToDelete = userGoals.find(g => g.id == goalId);

    // 2. עדכון הרשימה המקומית (סינון החוצה של האידי שנמחק)
    userGoals = userGoals.filter(g => g.id != goalId);

    // 3. שמירה ורענון מסך
    saveGoals();
    renderGoals();

    // 4. מחיקה מהענן (Supabase)
    try {
        if (typeof supabaseClient !== 'undefined' && currentUser && goalToDelete) {
            await supabaseClient
                .from('user_goals')
                .delete()
                .eq('user_email', currentUser.email)
                .eq('book_name', goalToDelete.bookName);

            // מחיקת חברותות קשורות
            await supabaseClient.from('chavruta_requests')
                .delete()
                .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`)
                .eq('book_name', goalToDelete.bookName)
                .eq('status', 'approved');
        }
    } catch (e) {
        console.error("נמחק מקומית, שגיאה במחיקה מהענן:", e);
    }
}

function closeModal() {
    // סוגר את כל סוגי החלונות הקופצים שיש במערכת
    const userModal = document.getElementById('userModal');
    const chavrutaModal = document.getElementById('chavrutaModal');
    const scheduleModal = document.getElementById('scheduleModal');
    const adminChatModal = document.getElementById('adminChatModal');
    const bookReaderModal = document.getElementById('bookReaderModal');
    const suggestionModal = document.getElementById('suggestionModal');

    if (userModal) userModal.style.display = 'none';
    if (document.getElementById('adminNotesModal')) document.getElementById('adminNotesModal').style.display = 'none';
    if (chavrutaModal) chavrutaModal.style.display = 'none';
    if (scheduleModal) scheduleModal.style.display = 'none';
    if (adminChatModal) adminChatModal.style.display = 'none';
    if (bookReaderModal) {
        bookReaderModal.style.display = 'none';
        const frame = document.getElementById('bookReaderFrame');
        if (frame) frame.src = 'about:blank'; // Stop loading
        if (document.body.classList.contains('focus-mode')) toggleFocusMode(); // יציאה ממצב מרוכז בסגירה
    }
    if (document.getElementById('donationModal')) document.getElementById('donationModal').style.display = 'none';
    if (suggestionModal) suggestionModal.style.display = 'none';
    if (document.getElementById('achievementsModal')) document.getElementById('achievementsModal').style.display = 'none';
    if (document.getElementById('followersModal')) document.getElementById('followersModal').style.display = 'none';

    if (chatInterval) clearInterval(chatInterval);
    if (document.getElementById('notesModal')) document.getElementById('notesModal').style.display = 'none';
}

function renderGeneralSearchResults(results, query) {
    const container = document.getElementById('generalSearchResults');
    container.innerHTML = '';
    let foundResults = false;

    const highlight = (text, term) => {
        if (!text || !term) return text || '';
        const regex = new RegExp(`(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    };

    // Users
    if (results.users && results.users.length > 0) {
        foundResults = true;
        let groupHtml = '<div class="result-group-title">משתמשים</div>';
        results.users.forEach(u => {
            groupHtml += `
                <div class="result-item" onclick="closeModal(); showUserDetails('${u.email}')">
                    <div class="result-item-title">${highlight(u.name, query)}</div>
                    <div class="result-item-context">${highlight(u.email, query)} - ${u.city || ''}</div>
                </div>
            `;
        });
        container.innerHTML += groupHtml;
    }

    // My Goals
    if (results.my_goals && results.my_goals.length > 0) {
        foundResults = true;
        let groupHtml = '<div class="result-group-title">המסכתות שלי</div>';
        results.my_goals.forEach(g => {
            groupHtml += `
                <div class="result-item" onclick="closeSearchDropdown(); switchScreen('dashboard'); setTimeout(() => document.getElementById('goal-card-${g.id}').scrollIntoView({behavior: 'smooth', block: 'center'}), 100);">
                    <div class="result-item-title">${highlight(g.bookName, query)}</div>
                    <div class="result-item-context">${g.status === 'active' ? 'פעיל' : 'בארכיון'} - ${highlight(g.dedication, query)}</div>
                </div>
            `;
        });
        container.innerHTML += groupHtml;
    }

    // My Chavrutas
    if (results.my_chavrutas && results.my_chavrutas.length > 0) {
        foundResults = true;
        let groupHtml = '<div class="result-group-title">החברותות שלי</div>';
        results.my_chavrutas.forEach(u => {
            groupHtml += `
                <div class="result-item" onclick="closeSearchDropdown(); switchScreen('chavrutas'); showUserDetails('${u.email}');">
                    <div class="result-item-title">${highlight(u.name, query)}</div>
                    <div class="result-item-context">${highlight(u.email, query)}</div>
                </div>
            `;
        });
        container.innerHTML += groupHtml;
    }

    // Chat Messages
    if (results.chats && results.chats.length > 0) {
        foundResults = true;
        let groupHtml = '<div class="result-group-title">הודעות בצ\'אט</div>';
        results.chats.forEach(msg => {
            const isMe = msg.sender_email === currentUser.email;
            const partnerEmail = isMe ? msg.receiver_email : msg.sender_email;
            const partner = globalUsersData.find(u => u.email === partnerEmail);
            const partnerName = partner ? partner.name : partnerEmail;
            const safePartnerName = (partnerName || '').replace(/'/g, "\\'");

            // תיקון: הסרת Book: מהשם אם קיים
            const displayName = partnerName.startsWith('book:') ? partnerName.replace('book:', '') : partnerName;

            groupHtml += `
                <div class="result-item" onclick="closeSearchDropdown(); openChat('${partnerEmail}', '${displayName.replace(/'/g, "\\'")}');">
                    <div class="result-item-title">שיחה עם ${displayName}</div>
                    <div class="result-item-context">${isMe ? 'אני' : partnerName}: ${highlight(msg.message, query)}</div>
                </div>
            `;
        });
        container.innerHTML += groupHtml;
    }

    // Library Books
    if (results.books && results.books.length > 0) {
        foundResults = true;
        let groupHtml = '<div class="result-group-title">ספרים בספרייה</div>';
        results.books.forEach(b => {
            groupHtml += `
                <div class="result-item" onclick="closeSearchDropdown(); switchScreen('add'); showAddSection('new'); setTimeout(() => { document.getElementById('categorySelect').value = '${b.category}'; populateBooks(); document.getElementById('bookSelect').value = JSON.stringify({name:'${b.name}', units:${b.units}}); }, 500);">
                    <div class="result-item-title">${highlight(b.name, query)}</div>
                    <div class="result-item-context">קטגוריה: ${b.category}</div>
                </div>
            `;
        });
        container.innerHTML += groupHtml;
    }

    if (!foundResults) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding-top: 50px;"><i class="fas fa-box-open" style="font-size: 3rem; opacity: 0.5;"></i><p>לא נמצאו תוצאות עבור "${query}"</p></div>`;
    }
    if (document.getElementById('notesModal')) document.getElementById('notesModal').style.display = 'none';
}

function bringToFront(element) {
    globalZIndex++;
    element.style.zIndex = globalZIndex;
}



function showAddSection(sectionId) {
    document.getElementById('add-menu-view').style.display = 'none';
    document.getElementById('add-section-cycles').style.display = 'none';
    document.getElementById('add-section-quick').style.display = 'none';
    document.getElementById('add-section-new').style.display = 'none';

    if (sectionId === 'menu' || !sectionId) {
        document.getElementById('add-menu-view').style.display = 'grid';
    } else {
        document.getElementById('add-section-' + sectionId).style.display = 'block';
        if (sectionId === 'new') populateAllBooks(); // טעינת רשימת ספרים
    }
}


/* === לוגיקת תרומות ומנויים === */
let currentDonationType = 'sub'; // 'sub' or 'one'
let selectedTierPrice = 0;

function openDonationModal() {
    const modal = document.getElementById('donationModal');
    modal.style.display = 'flex';
    bringToFront(modal); // הבאה לקדמת המסך
    document.getElementById('donationModal').style.display = 'flex';
    setDonationType('sub'); // ברירת מחדל
    renderTiers();

    // עדכון טקסט האחוזים
    const progress = localStorage.getItem('torahApp_campaign_progress') || 60;
    document.getElementById('campaignProgressText').innerText = progress + '%';
    // עדכון מד התקדמות לפי הגדרות ניהול
    document.getElementById('campaignProgressBar').style.width = progress + '%';

    // האזנה לשינוי בסכום המותאם אישית
    document.getElementById('customDonationAmount').addEventListener('input', function () {
        // הסרת בחירה מהכרטיסים
        document.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
        selectedTierPrice = 0;

        if (currentDonationType === 'sub') {
            const val = parseInt(this.value) || 0;
            const tier = getTierByAmount(val);
            const infoDiv = document.getElementById('projectedTier');
            if (val > 0) {
                if (tier) {
                    infoDiv.innerHTML = `דרגה צפויה: <strong>${tier.name}</strong>`;
                } else {
                    infoDiv.innerHTML = `סכום נמוך מהמינימום למנוי (${SUBSCRIPTION_TIERS[0].price}₪)`;
                }
            } else {
                infoDiv.innerHTML = '';
            }
        }
    });
}

function closeDonationModal() {
    document.getElementById('donationModal').style.display = 'none';
}

function setDonationType(type) {
    currentDonationType = type;
    document.getElementById('donTypeSub').className = `donation-type-option ${type === 'sub' ? 'active' : ''}`;
    document.getElementById('donTypeOne').className = `donation-type-option ${type === 'one' ? 'active' : ''}`;

    document.getElementById('donateBtnText').innerText = type === 'sub' ? 'הצטרף כמנוי' : 'בצע תרומה';
    document.getElementById('subscriptionTiers').style.display = 'grid';
    document.getElementById('projectedTier').innerHTML = '';

    if (type === 'one') {
        document.getElementById('customDonationAmount').placeholder = "סכום לתרומה";
    } else {
        document.getElementById('customDonationAmount').placeholder = "סכום חודשי אחר";
    }

    // עדכון כפתורי סכומים מהירים לפי הסוג
    const chipsContainer = document.getElementById('quickAmountChips');
    chipsContainer.innerHTML = '';
    let amounts = [];
    if (type === 'sub') {
        amounts = SUBSCRIPTION_TIERS.map(t => t.price);
    } else {
        amounts = ONE_TIME_TIERS.map(t => t.price);
    }

    amounts.forEach(amt => {
        const chip = document.createElement('div');
        chip.className = 'amount-chip';
        let label = `₪${amt}`;
        if (type === 'sub') {
            const t = SUBSCRIPTION_TIERS.find(x => x.price === amt);
            if (t) label += `<div style="font-size:0.75rem; font-weight:normal; margin-top:2px; opacity:0.9;">${t.name}</div>`;
        }
        chip.innerHTML = label;

        chip.onclick = () => { document.getElementById('customDonationAmount').value = amt; document.getElementById('customDonationAmount').dispatchEvent(new Event('input')); };
        chipsContainer.appendChild(chip);
    });
}

function renderTiers() {
    const container = document.getElementById('subscriptionTiers');
    container.innerHTML = '';

    const tiers = currentDonationType === 'sub' ? SUBSCRIPTION_TIERS : ONE_TIME_TIERS;
    tiers.forEach(tier => {
        const div = document.createElement('div');
        div.id = `goal-card-${goal.id}`;
        div.className = 'tier-card';
        // div.style.borderTop = `4px solid ${tier.color}`; // הוסר לבקשת המשתמש
        div.onclick = () => selectTier(tier.price, div);
        div.innerHTML = `
            <div class="tier-price">₪${tier.price}</div>
            <div class="tier-name">${tier.name}</div>
        `;
        container.appendChild(div);
    });
}

function selectTier(price, element) {
    selectedTierPrice = price;
    document.querySelectorAll('.tier-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('customDonationAmount').value = ''; // איפוס שדה מותאם אישית
    document.getElementById('projectedTier').innerHTML = '';
}

function getTierByAmount(amount) {
    // מוצא את הדרגה הגבוהה ביותר שהסכום מכסה (המסלול הנמוך הקרוב מלמטה)
    // המשתמש ביקש: "הדרגה תקבע על פי המסלול הנמוך הקרוב אליו" - כלומר אם אני שם 120, אני מקבל דרגה של 100.
    const eligibleTiers = SUBSCRIPTION_TIERS.filter(t => t.price <= amount);
    if (eligibleTiers.length === 0) return null;
    return eligibleTiers[eligibleTiers.length - 1]; // האחרון הוא הגבוה ביותר האפשרי
}

async function processDonation() {
    const customAmount = parseInt(document.getElementById('customDonationAmount').value) || 0;
    const finalAmount = customAmount > 0 ? customAmount : selectedTierPrice;

    if (finalAmount <= 0) return customAlert("נא לבחור מסלול או להזין סכום.");

    if (currentDonationType === 'sub') {
        const tier = getTierByAmount(finalAmount);
        if (!tier) return customAlert(`סכום המינימום למנוי הוא ${SUBSCRIPTION_TIERS[0].price}₪.`);

        // שמירת המנוי למשתמש
        currentUser.subscription = { amount: finalAmount, level: tier.level, name: tier.name, subscription_date: new Date().toISOString() };
        localStorage.setItem('torahApp_user', JSON.stringify(currentUser));

        // שמירה בענן (עדכון שדה subscription בטבלת users - נניח שקיים JSONB או עמודות מתאימות)
        // לצורך הדוגמה נשמור ב-JSONB או נעדכן את הפרופיל
        await saveProfile(); // זה כבר שומר את currentUser המעודכן לענן

        // --- התראה לחברותות (Goal 3) ---
        if (approvedPartners.size > 0) {
            const buttonHtml = `<br><button class='btn-link' style='margin-top:5px;' onclick='openDonationModalAndSelectTier(${tier.level}, ${finalAmount})'>לרכישת אותו מסלול</button>`;
            const msg = `היי! בדיוק הצטרפתי למנוי "${tier.name}" בבית המדרש כדי להחזיק תורה. לא תרצה לעשות זאת גם אתה?${buttonHtml}`;
            approvedPartners.forEach(async (email) => {
                try {
                    await supabaseClient.from('chat_messages').insert([{
                        sender_email: currentUser.email, receiver_email: email, message: msg, is_html: true
                    }]);
                } catch (e) { console.error("Failed to notify partner", e); }
            });
        }

        showThankYouAnimation();

        // שליחת התראה לעוקבים על תרומה
        const { data: followers } = await supabaseClient.from('user_followers').select('follower_email').eq('following_email', currentUser.email);
        if (followers && followers.length > 0) {
            const msgs = followers.map(f => ({
                sender_email: 'updates@system',
                receiver_email: f.follower_email,
                message: `המשתמש ${currentUser.displayName} תרם לחיזוק בית המדרש!`,
                is_html: true
            }));
            await supabaseClient.from('chat_messages').insert(msgs);
        }
    } else {
        // תרומה חד פעמית
        if (approvedPartners.size > 0) {
            const buttonHtml = `<br><button class='btn-link' style='margin-top:5px;' onclick='openDonationModalAndSelectOneTime(${finalAmount})'>גם אני רוצה לתרום</button>`;
            const msg = `היי! הרגע תרמתי ₪${finalAmount} לחיזוק בית המדרש. זכות גדולה! ממליץ גם לך :)${buttonHtml}`;
            approvedPartners.forEach(async (email) => {
                try {
                    await supabaseClient.from('chat_messages').insert([{
                        sender_email: currentUser.email, receiver_email: email, message: msg, is_html: true
                    }]);
                } catch (e) { console.error("Failed to notify partner", e); }
            });
        }
        showThankYouAnimation();
    }
    closeDonationModal();
}

function openDonationModalAndSelectOneTime(amount) {
    openDonationModal();
    setDonationType('one');
    document.getElementById('customDonationAmount').value = amount;
}

function openDonationModalAndSelectTier(tierLevel, amount) {
    openDonationModal();
    setDonationType('sub');

    const tiers = SUBSCRIPTION_TIERS;
    const tierIndex = tiers.findIndex(t => t.level === tierLevel);

    if (tierIndex !== -1) {
        const tierCard = document.getElementById('subscriptionTiers').children[tierIndex];
        if (tierCard) selectTier(tiers[tierIndex].price, tierCard);
    } else if (amount) {
        document.getElementById('customDonationAmount').value = amount;
    }
    syncGlobalData();
}



function openSuggestionModal() {
    document.getElementById('suggestionModal').style.display = 'flex';
    const modal = document.getElementById('suggestionModal');
    modal.style.display = 'flex';
    bringToFront(modal);
}

async function sendSuggestion() {
    const content = document.getElementById('suggestionInput').value;
    if (!content) return customAlert("נא לכתוב תוכן להצעה");

    try {
        await supabaseClient.from('suggestions').insert([{ user_email: currentUser.email, content: content }]);
        showToast("תודה! ההצעה נשלחה בהצלחה.", "success");
        document.getElementById('suggestionInput').value = '';
        closeModal();
    } catch (e) {
        console.error(e);
        await customAlert("שגיאה בשליחת ההצעה.");
    }
}

function showThankYouAnimation() {
    // סגירת כל המודאלים והתפריטים
    closeModal();
    document.getElementById('profile-dropdown').style.display = 'none';
    document.getElementById('notif-dropdown').style.display = 'none';

    // יצירת שכבת תודה
    const overlay = document.createElement('div');
    overlay.className = 'thank-you-overlay';
    overlay.innerHTML = `
        <div class="thank-you-box">
            <h1 style="font-size:3rem; margin:0;">🎉</h1>
            <h2 style="color:var(--primary); margin: 10px auto; text-align:center;">שכוייח!</h2>
            <p style="font-size:1.2rem;">הקבלה נשלחה אליך למייל<br>והזכויות נשלחו הישר לכיסא הכבוד!</p>
            <button class="btn" onclick="closeThankYou(this)">תזכו למצוות</button>
        </div>
    `;
    document.body.appendChild(overlay);

    // פיצוצי קונפטי מרובים
    window.confettiInterval = setInterval(() => {
        const randomX = Math.random();
        const randomY = Math.random();
        confetti({ particleCount: 30, spread: 360, origin: { x: randomX, y: randomY }, zIndex: 10005, startVelocity: 30 });
        confetti({ particleCount: 30, spread: 360, origin: { x: Math.random(), y: Math.random() }, zIndex: 10005, startVelocity: 20 });
    }, 250);
}

function closeThankYou(btn) {
    if (window.confettiInterval) clearInterval(window.confettiInterval);
    btn.closest('.thank-you-overlay').remove();
}

// עזרים למעקב יומי מקומי (כדי להציג את פס ההתקדמות היומי)
function getDailyProgress(goalId) {
    const key = 'daily_track_' + goalId;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const today = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    if (data.date !== today) return 0;
    return data.count || 0;
}

function incDailyProgress(goalId, amount) {
    const current = getDailyProgress(goalId);
    const today = new Date().toLocaleDateString('en-GB');
    localStorage.setItem('daily_track_' + goalId, JSON.stringify({ date: today, count: current + amount }));
}

// === פונקציה ראשית: ציור רשימת הלימוד בעיצוב החדש ===
function renderGoals() {
    const list = document.getElementById('goalsList');
    const tasksList = document.getElementById('dailyTasksList');
    const archiveList = document.getElementById('archiveList');

    if (!list) return;

    list.innerHTML = '';
    if (tasksList) tasksList.innerHTML = '';
    if (archiveList) archiveList.innerHTML = '';

    let hasTasks = false;
    let totalLearned = 0;

    // בדיקת ריקנות
    const activeGoals = userGoals.filter(g => g.status === 'active');
    if (activeGoals.length === 0) {
        // Empty state handled by the add button at the bottom
    }

    userGoals.forEach(goal => {
        // חישוב אחוז התקדמות
        const percent = Math.min(100, Math.round((goal.currentUnit / goal.totalUnits) * 100));
        totalLearned += goal.currentUnit;

        // בדיקה אם יש חברותא לספר זה
        const connection = chavrutaConnections.find(c => c.book === goal.bookName && c.email);
        const partner = connection ? globalUsersData.find(u => u.email === connection.email) : null;
        const partnerName = partner ? partner.name : (connection ? connection.email : '');

        if (goal.status === 'active') {
            // יצירת כרטיס לימוד פעיל
            const div = document.createElement('div');
            div.id = `goal-card-${goal.id}`; // הוספת ID לזיהוי ייחודי
            div.className = 'study-card';

            if (window.newGoalId === goal.id.toString()) {
                // div.classList.add('new-goal-highlight'); // Optional: adapt to new style
                if (window.isNewGoalAnimation) {
                    // div.classList.add('new-goal-animation');
                    window.isNewGoalAnimation = false; // איפוס
                }
            }

            // אנימציה אם הושלם הרגע
            if (window.justCompletedDailyGoal === goal.id) {
                // div.classList.add('daily-goal-reached');
            }

            const iconBg = 'rgba(234, 179, 8, 0.1)';
            const iconColor = '#EAB308';

            div.innerHTML = `
                <div class="study-card-content">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem;">
                            <div class="book-icon-wrapper" style="background:${iconBg}; color:${iconColor};">
                                <i class="fas fa-book" style="font-size:1.25rem;"></i>
                            </div>
                            <div>
                                <h3 style="font-size:1.125rem; font-weight:bold; margin:0; display: flex; align-items: center; gap: 8px;">
                                    ${goal.bookName}
                                    ${connection ? `<i class="fas fa-user-friends" style="color: var(--success);" title="בחברותא עם ${partnerName}"></i>` : ''}
                                </h3>
                                <p style="font-size:0.875rem; color:#64748b; margin:0;">${unitToDafString(goal)}</p>
                            </div>
                        </div>
                        <div style="margin-top:1rem;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:0.5rem; padding:0 0.25rem;">
                                <span style="color:#94a3b8;">${goal.totalUnits - goal.currentUnit} עמודים לסיום</span>
                                <span style="font-weight:bold; color:#EAB308;">${percent}%</span>
                            </div>
                            <div class="progress-track" style="height:0.375rem;">
                                <div class="progress-fill-gradient" style="width: ${percent}%; border-radius:9999px;"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; margin-top:1.5rem; width:100%;">
                        <div class="action-buttons">
                            <button class="action-btn" onclick="deleteGoal(${goal.id})" title="מחק"><i class="fas fa-trash-alt"></i></button>
                            <button class="action-btn" onclick="openNotes('${goal.id}')" title="הערות"><i class="fas fa-sticky-note"></i></button>
                            <button class="action-btn" onclick="openBookChat('${goal.bookName}')" title="צ'אט"><i class="fas fa-comment"></i></button>
                            <button class="action-btn" ${connection ? 'disabled' : ''} onclick="openChavrutaSearch('${goal.bookName}')" title="${connection ? 'כבר לומד בחברותא' : 'מצא חברותא'}">
                                <i class="fas fa-user-plus" ${connection ? 'style="color: #94a3b8;"' : ''}></i>
                            </button>
                        </div>
                        
                        <div class="counter-wrapper">
                            <button class="counter-btn minus" onclick="updateProgress(${goal.id}, -1)"><i class="fas fa-minus"></i></button>
                            <button class="counter-btn plus" onclick="updateProgress(${goal.id}, 1)"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                </div>`;
            list.appendChild(div);

            // חישוב יעד יומי (אם הוגדר תאריך יעד)
            if (goal.targetDate && tasksList) {
                const diffTime = new Date(goal.targetDate) - new Date();
                const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                const unitsLeft = goal.totalUnits - goal.currentUnit;
                if (unitsLeft > 0 && diffDays > 0) {
                    hasTasks = true;
                    const dailyTarget = (unitsLeft / diffDays).toFixed(1);

                    // חישוב התקדמות יומית
                    const doneToday = getDailyProgress(goal.id);
                    const dailyPercent = Math.min(100, (doneToday / Math.ceil(dailyTarget)) * 100);
                    const isDailyDone = doneToday >= Math.ceil(dailyTarget);

                    const taskDiv = document.createElement('div');
                    taskDiv.id = `daily-task-${goal.id}`; // זיהוי ייחודי לעדכון
                    taskDiv.className = 'task-row';

                    if (window.justCompletedDailyGoal === goal.id) {
                        taskDiv.classList.add('daily-goal-reached');
                    }

                    let statusHtml = `<span class="task-highlight">יעד יומי: ${dailyTarget}</span>`;
                    if (isDailyDone) {
                        statusHtml = `<span style="color:#16a34a; font-weight:bold; font-size:0.9rem;"><i class="fas fa-check"></i> הושלם</span>`;
                    }

                    taskDiv.innerHTML = `<div><strong>${goal.bookName}</strong></div><div style="text-align:left;">${statusHtml}
                    <div class="daily-progress-bg"><div class="daily-progress-fill" style="width:${dailyPercent}%; background:${isDailyDone ? '#16a34a' : 'var(--accent)'}"></div></div></div>`;
                    tasksList.appendChild(taskDiv);
                }
            }
        } else {
            // הצגת הלימוד בארכיון
            if (archiveList) {
                const archiveDiv = document.createElement('div');
                archiveDiv.className = 'goal-item';
                archiveDiv.style.borderTopColor = 'var(--success)';
                archiveDiv.innerHTML = `
                <div class="goal-header">
                    <span class="goal-title">${goal.bookName}</span>
                    <span style="color:var(--success); font-weight:bold;">הושלם! <i class="fas fa-check"></i></span>
                </div>
                <div class="progress-container"><div class="progress-bar" style="width: 100%; background: var(--success);"></div></div>`;
                archiveList.appendChild(archiveDiv);
            }
        }
    });

    // עדכון תצוגת הדרגות והסטטיסטיקה
    updateRankProgressBar(totalLearned);
    document.getElementById('dailyTasksContainer').style.display = hasTasks ? 'block' : 'none';

    const activeBooksCount = userGoals.filter(g => g.status === 'active').length;
    const completedBooksCount = userGoals.filter(g => g.status === 'completed').length;

    document.getElementById('stat-books').innerText = activeBooksCount;
    document.getElementById('stat-pages').innerText = totalLearned;
    document.getElementById('stat-completed').innerText = completedBooksCount;

    // שמירת סטטיסטיקה למטמון לטעינה מהירה בפעם הבאה
    const stats = { books: activeBooksCount, pages: totalLearned, completed: completedBooksCount };
    localStorage.setItem('torahApp_stats', JSON.stringify(stats));

    // Rating updated elsewhere

    // איפוס דגלים
    window.justCompletedDailyGoal = null;
    window.newGoalId = null;
}
// === פונקציות חדשות: שמירת פרופיל וחיפוש חברותא ===

// 2. משיכת כל המשתמשים והלימודים שלהם (כדי לראות אותם בלוח)

// 3. מציאת חברותא אמיתית (מתוך הנתונים שמשכנו)
async function openChavrutaSearch(bookName) {
    // בדיקה אם המשתמש מילא פרטים
    if (!currentUser.phone || !currentUser.city) {
        await customAlert("כדי למצוא חברותא, עליך למלא עיר ומספר טלפון בפרופיל.");
        switchScreen('profile', document.getElementById('nav-profile'));
        return;
    }

    // קריאה לפונקציה החדשה שמציגה את ממשק החיפוש המעודכן
    await findChavruta(bookName);
}

function searchSpecificUser() {
    const query = document.getElementById('userSearchInput').value.toLowerCase().trim();
    const resultsDiv = document.getElementById('userSearchResults');
    resultsDiv.innerHTML = '';

    if (!query) return;

    const matches = globalUsersData.filter(u =>
        (u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)) &&
        u.email.toLowerCase() !== currentUser.email.toLowerCase()
    );

    if (matches.length === 0) {
        resultsDiv.innerHTML = '<p style="color:#666; text-align:center;">לא נמצאו משתמשים.</p>';
        return;
    }

    matches.forEach(u => {
        const div = document.createElement('div');
        const badge = getUserBadgeHtml(u);
        div.className = 'chavruta-result';
        div.innerHTML = `
            <div>
                <strong>${badge}${u.name}</strong>
                <div style="font-size:0.8rem;">${u.city || ''}</div>
            </div>
            <button class="btn" style="width:auto; font-size:0.8rem; padding:5px 10px;" onclick="showUserDetails('${u.email}')">הצג פרופיל</button>
        `;
        resultsDiv.appendChild(div);
    });
}

function renderChavrutas() {
    const list = document.getElementById('chavrutasList');
    if (!list) return;
    list.innerHTML = '';

    if (approvedPartners.size === 0 && pendingSentRequests.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">עדיין אין לך חברותות.<br>חפש ספרים והצע חברותא ללומדים אחרים!</div>';
        return;
    }

    approvedPartners.forEach(email => {
        let user = globalUsersData.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());

        // גיבוי: אם המשתמש לא נמצא בנתונים הגלובליים (בגלל בעיית טעינה), ניצור אובייקט זמני
        if (!user) {
            user = {
                name: email.split('@')[0], email: email, city: 'לא זמין', phone: '', lastSeen: null
                , age: null
            };
        }

        const sharedBooks = chavrutaConnections.filter(c => c.email === email).map(c => c.book).join(', ');

        // בדיקת הודעות שלא נקראו
        const unreadCount = unreadMessages[email] || 0;
        const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : '';

        const safeName = (user.name || '').replace(/'/g, "\\'"); // מונע שגיאה אם יש גרש בשם
        const safeBook = sharedBooks.split(',')[0].replace(/'/g, "\\'");

        const badge = getUserBadgeHtml(user);
        const div = document.createElement('div');
        div.className = 'goal-item'; // שימוש בעיצוב הקיים של כרטיסים
        div.innerHTML = `
            <div class="goal-header">
                <span class="goal-title">${badge}${user.name}</span>
                <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;">
                    <span style="font-size:0.8rem; background:#dcfce7; color:#16a34a; padding:2px 8px; border-radius:10px;">חברותא פעילה</span>
                    ${sharedBooks ? `<span style="font-size:0.8rem; background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:10px;">${sharedBooks}</span>` : ''}
                </div>
            </div>
            <div style="font-size:0.9rem; margin-top:5px;">
                <div><i class="fas fa-map-marker-alt"></i> ${user.city || 'לא צוין'}</div>
                ${user.age ? `<div><i class="fas fa-birthday-cake"></i> ${user.age}</div>` : ''}
                <div><i class="fas fa-phone"></i> <a href="tel:${user.phone}">${user.phone || 'לא הוזן'}</a></div>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn-elegant" onclick="showUserDetails('${user.email}')">
                    <i class="fas fa-user"></i> פרופיל
                </button>
                <button class="btn-elegant" onclick="openChat('${user.email}', '${safeName}')">
                    <i class="fas fa-comments"></i> צ'אט ${unreadBadge}
                </button>
                <button class="btn-elegant" onclick="openScheduleModal('${user.email}', '${sharedBooks}', '${safeName}')">
                    <i class="fas fa-clock"></i> זמנים
                </button>
                <button class="btn-elegant" onclick="openBookText('${safeBook}')">
                    <i class="fas fa-book-reader"></i> פתח ספר
                </button>
                <button class="btn-elegant" style="color:#ef4444; border-color:#ef4444;" onclick="cancelChavruta('${user.email}')">
                    <i class="fas fa-user-times"></i> ביטול
                </button>
            </div>
        `;
        list.appendChild(div);
    });

    if (pendingSentRequests.length > 0) {
        const pendingHeader = document.createElement('h3');
        pendingHeader.innerHTML = '<i class="fas fa-hourglass-half"></i> בקשות ממתינות לאישור';
        pendingHeader.style.marginTop = '20px';
        list.appendChild(pendingHeader);

        pendingSentRequests.forEach(req => {
            const user = globalUsersData.find(u => u.email === req.receiver);
            const name = user ? user.name : req.receiver;

            const div = document.createElement('div');
            div.className = 'goal-item';
            div.style.background = '#fff7ed';
            div.style.borderColor = '#fdba74';
            div.innerHTML = `
                <div class="goal-header">
                    <span class="goal-title">${name}</span>
                    <span style="font-size:0.8rem; color:#f97316;">ממתין לאישור</span>
                </div>
                <div style="font-size:0.9rem;">ספר: <strong>${req.book}</strong></div>
                <button class="btn-outline" style="margin-top:5px; font-size:0.8rem; color:#ef4444; border-color:#ef4444; padding:4px 8px; width:auto;" onclick="cancelSentRequest('${req.receiver}', '${req.book}')">
                    <i class="fas fa-times"></i> בטל בקשה
                </button>
            `;
            list.appendChild(div);
        });
    }
}

function openBookText(bookName) {
    if (!bookName) return customAlert("לא נבחר ספר לפתיחה");

    let linkKey = '';

    // Special handling for cycles
    if (bookName === 'דף היומי') linkKey = 'Daf_Yomi';
    else if (bookName === 'משנה יומית') linkKey = 'Mishnah_Yomit';
    else if (bookName === 'רמב"ם יומי') linkKey = 'Rambam_Yomi';
    else if (bookName === 'הלכה יומית') linkKey = 'Halakhah_Yomit';
    else {
        // Fallback: use book name with underscores
        // Note: The new BOOKS_DB doesn't have linkKey, so we rely on Sefaria's smart URL handling or simple replacement
        linkKey = bookName.replace(/ /g, '_');
        // Fallback for books not in library
        if (!linkKey) {
            linkKey = bookName.replace(/ /g, '_');
        }
    }

    const url = `https://www.sefaria.org.il/${linkKey}`;

    const modal = document.getElementById('bookReaderModal');
    const title = document.getElementById('bookReaderTitle');
    const frame = document.getElementById('bookReaderFrame');
    const cookieModal = document.getElementById('cookieModal');


    if (modal && title && frame) {
        title.innerText = bookName;
        frame.src = url;
        modal.style.display = 'flex';
        bringToFront(modal);
    } else {
        // Fallback to old behavior if modal elements don't exist
        window.open(url, '_blank');
    }
}

async function cancelSentRequest(receiverEmail, bookName) {
    if (!(await customConfirm('לבטל את בקשת החברותא?'))) return;
    try {
        const { error } = await supabaseClient
            .from('chavruta_requests')
            .delete()
            .eq('sender_email', currentUser.email)
            .eq('receiver_email', receiverEmail)
            .eq('book_name', bookName)
            .eq('status', 'pending');

        if (error) throw error;

        await customAlert('הבקשה בוטלה.');
        await syncGlobalData();
        renderChavrutas();
    } catch (e) {
        console.error(e);
        await customAlert('שגיאה בביטול הבקשה');
    }
}

let currentScheduleKey = null;

function openScheduleModal(email, book, name) {
    document.getElementById('scheduleModal').style.display = 'flex';
    const modal = document.getElementById('scheduleModal');
    modal.style.display = 'flex';
    bringToFront(modal);
    document.getElementById('scheduleTargetName').innerText = `עם ${name} (${book})`;
    currentScheduleKey = `${email}::${book}`;

    // טעינת הגדרות קיימות
    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');
    const existing = schedules[currentScheduleKey];

    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('scheduleTime').value = '';

    if (existing) {
        document.getElementById('scheduleTime').value = existing.time;
        document.querySelectorAll('.day-checkbox').forEach(cb => {
            if (existing.days.includes(cb.value)) cb.checked = true;
        });
    }
}

async function saveSchedule() {
    if (!currentScheduleKey) return;
    const days = Array.from(document.querySelectorAll('.day-checkbox:checked')).map(cb => cb.value);
    const time = document.getElementById('scheduleTime').value;
    const partnerName = document.getElementById('scheduleTargetName').innerText;

    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');

    if (days.length === 0 || !time) {
        delete schedules[currentScheduleKey];
        await customAlert('התזכורת בוטלה (לא נבחרו ימים או שעה).');

        // מחיקה מהענן
        try {
            const [pEmail, bName] = currentScheduleKey.split('::');
            await supabaseClient.from('schedules').delete()
                .eq('user_email', currentUser.email)
                .eq('partner_email', pEmail)
                .eq('book_name', bName);
        } catch (e) { console.error(e); }

    } else {
        schedules[currentScheduleKey] = { days, time, partnerName, book: currentScheduleKey.split('::')[1] };
        showToast('התזכורת נשמרה בהצלחה!', "success");

        // שמירה בענן
        try {
            const [pEmail, bName] = currentScheduleKey.split('::');
            await supabaseClient.from('schedules').upsert({
                user_email: currentUser.email,
                partner_email: pEmail,
                book_name: bName,
                days: days,
                time: time,
                partner_name: partnerName
            }, { onConflict: 'user_email,partner_email,book_name' });
        } catch (e) { console.error("Cloud save error", e); }
    }

    localStorage.setItem('chavruta_schedules', JSON.stringify(schedules));
    closeModal();
}

function renderCalendar() {
    const container = document.getElementById('calendarView');
    if (!container) return;
    container.innerHTML = '';

    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');
    const daysMap = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    let hasEvents = false;
    for (let i = 0; i < 6; i++) {
        const dayItems = Object.values(schedules).filter(s => s.days.includes(i.toString()));
        dayItems.sort((a, b) => a.time.localeCompare(b.time));

        if (dayItems.length > 0) {
            hasEvents = true;
            let html = `<div class="calendar-day"><div class="calendar-day-header">${daysMap[i]}</div>`;
            dayItems.forEach(item => html += `<div class="calendar-event"><strong>${item.time}</strong> - ${item.partnerName}</div>`);
            html += `</div>`;
            container.innerHTML += html;
        }
    }
    if (!hasEvents) container.innerHTML = '<div style="text-align:center; color:#666; padding:20px;">אין זמני לימוד קבועים.</div>';
}

async function cancelChavruta(partnerEmail) {
    if (!(await customConfirm("האם אתה בטוח שברצונך לבטל את החברותא עם משתמש זה?"))) return;

    try {
        const { error } = await supabaseClient
            .from('chavruta_requests')
            .delete()
            .or(`and(sender_email.eq.${currentUser.email},receiver_email.eq.${partnerEmail}),and(sender_email.eq.${partnerEmail},receiver_email.eq.${currentUser.email})`)
            .eq('status', 'approved');

        if (error) throw error;

        showToast("החברותא בוטלה בהצלחה.", "info");

        // הסרה מיידית מהרשימה המקומית להסתרת הצ'אט
        approvedPartners.delete(partnerEmail);

        // מחיקת תזכורות משותפות בלוח
        const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');
        Object.keys(schedules).forEach(key => {
            if (key.startsWith(partnerEmail + '::')) {
                delete schedules[key];
            }
        });
        localStorage.setItem('chavruta_schedules', JSON.stringify(schedules));

        try {
            await supabaseClient.from('schedules').delete().eq('user_email', currentUser.email).eq('partner_email', partnerEmail);
        } catch (e) { console.error("Error deleting schedule on cancel", e); }

        await syncGlobalData();
        renderChavrutas();
    } catch (e) {
        console.error("שגיאה בביטול חברותא:", e);
        await customAlert("אירעה שגיאה בביטול החברותא.");
    }
}


async function renderMazalTovInMainArea() {
    const main = document.getElementById('chat-main-area');
    main.innerHTML = `
        <div class="chat-header" style="border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; padding: 15px; background: var(--primary); color: white;">
            <div style="display:flex; align-items:center; gap:5px;">
                <i class="fas fa-glass-cheers"></i>
                <span>לוח סיומים</span>
            </div>
            <div style="font-size:1.1rem; display:flex; gap:15px; align-items:center;">
                <i class="fas fa-times" onclick="closeMainChat()" title="סגור" style="cursor:pointer;"></i>
            </div>
        </div>
        <div class="chat-body" style="border-radius: 0 0 12px 12px; overflow-y:auto; padding:20px;">
            <div id="mazaltov-main-container"></div>
        </div>
    `;

    const container = document.getElementById('mazaltov-main-container');
    container.innerHTML = '<p style="text-align:center; color:#94a3b8;">טוען סיומים...</p>';

    const { data: siyumin, error } = await supabaseClient
        .from('siyum_board')
        .select(`
            id, completed_at, book_name,
            users (display_name, email),
            siyum_reactions (count)
        `)
        .order('completed_at', { ascending: false })
        .limit(50);

    if (error || !siyumin) {
        container.innerHTML = '<p style="text-align:center; color:red;">שגיאה בטעינת הלוח.</p>';
        return;
    }

    if (siyumin.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#94a3b8;">עדיין אין סיומים בלוח. היה הראשון לסיים!</p>';
        return;
    }

    container.innerHTML = '';
    siyumin.forEach(siyum => {
        const name = siyum.users ? (siyum.users.display_name || 'לומד') : 'לומד';
        const mazalTovCount = siyum.siyum_reactions[0]?.count || 0;
        // עיצוב משופר ללוח סיומים
        const div = document.createElement('div');
        div.className = 'card siyum-card siyum-festive-bg';
        div.style.marginBottom = '15px';
        div.innerHTML = `
            <div style="text-align:center; position:relative; z-index:2;">
                <h3 style="color:#d97706; margin-top:0; font-family:'Secular One', sans-serif; font-size:1.5rem;">🎉 מזל טוב! 🎉</h3>
                <div style="font-size:1.2rem; margin:10px 0;"><strong style="cursor:pointer; text-decoration:underline;" onclick="showUserDetails('${siyum.users ? siyum.users.email : ''}')">${name}</strong> סיים את <strong>${siyum.book_name}</strong></div>
                <div style="font-size:0.85rem; color:#64748b; margin-bottom:15px;">${new Date(siyum.completed_at).toLocaleDateString('he-IL')}</div>
                <button class="btn" style="width:auto; background:linear-gradient(135deg, #f59e0b, #d97706); border-radius:25px; box-shadow:0 4px 10px rgba(245, 158, 11, 0.3);" onclick="addSiyumReaction(${siyum.id}, this)">
                    <i class="fas fa-glass-cheers"></i> אמור מזל טוב! 
                    <span id="siyum-count-${siyum.id}" style="background:rgba(255,255,255,0.3); padding: 2px 8px; border-radius:10px; margin-right:5px; font-weight:bold;">${mazalTovCount}</span>
                </button>
            </div> 
        `;
        container.appendChild(div);
    });
}



function openReportModal(email) {
    document.getElementById('reportTargetEmail').value = email;
    document.getElementById('reportModal').style.display = 'flex';
    const modal = document.getElementById('reportModal');
    modal.style.display = 'flex';
    bringToFront(modal);
}

function closeReportModal() {
    document.getElementById('reportModal').style.display = 'none';
    document.getElementById('reportReason').value = '';
}

async function submitReport() {
    const target = document.getElementById('reportTargetEmail').value;
    const reason = document.getElementById('reportReason').value;
    if (!reason) return customAlert("נא לפרט את סיבת הדיווח");

    // ביטול חברותא אוטומטי (ללא אישור נוסף)
    try {
        await supabaseClient.from('chavruta_requests').delete()
            .or(`and(sender_email.eq.${currentUser.email},receiver_email.eq.${target}),and(sender_email.eq.${target},receiver_email.eq.${currentUser.email})`)
            .eq('status', 'approved');

        // חסימה מקומית
        if (!blockedUsers.includes(target)) blockedUsers.push(target);
        localStorage.setItem('torahApp_blocked', JSON.stringify(blockedUsers));

        // שליחת דיווח
        await supabaseClient.from('user_reports').insert([{ reporter_email: currentUser.email, reported_email: target, reason: reason }]);

        showToast("הדיווח נשלח והמשתמש נחסם.", "error");
        closeReportModal();
        closeChatWindow(target);
        await syncGlobalData();
        renderChavrutas();
    } catch (e) {
        console.error(e);
        await customAlert("אירעה שגיאה בשליחת הדיווח.");
    }
}


// פונקציה להגדרת האזנה לשינויים בזמן אמת
function setupRealtime() {
    if (!currentUser || typeof supabaseClient === 'undefined') return;
    if (realtimeSubscription) return;

    realtimeSubscription = supabaseClient.channel('global_room')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chavruta_requests' }, (payload) => {
            const newItem = payload.new || {};
            const oldItem = payload.old || {};
            if (newItem.receiver_email === currentUser.email || newItem.sender_email === currentUser.email ||
                oldItem.receiver_email === currentUser.email || oldItem.sender_email === currentUser.email) {

                if (payload.eventType === 'INSERT' && newItem.receiver_email === currentUser.email) {
                    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                    audio.play().catch(e => console.error("Audio error", e));
                }
                checkIncomingRequests();
                syncGlobalData();
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_followers' }, (payload) => {
            if (payload.new && payload.new.following_email === currentUser.email) {
                updateFollowersCount();
                if (payload.eventType === 'INSERT') {
                    addNotification("מזל טוב! מישהו החליט לעקוב אחריך. אל תדאג, זה לא מס הכנסה 😉");
                }
            }
            if (payload.old && payload.old.following_email === currentUser.email) {
                updateFollowersCount();
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_goals' }, () => {
            syncGlobalData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            syncGlobalData();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_goals' }, (payload) => {
            // עדכון מהיר של פתקים אם רלוונטי
            if (currentNotesData.goalId && payload.new.book_name === document.getElementById('notesBookTitle').innerText) {
                const chavruta = chavrutaConnections.find(c => c.book === payload.new.book_name);
                if (chavruta && payload.new.user_email === chavruta.email) {
                    refreshPartnerNotes(chavruta.email, payload.new.book_name);
                }
            }
            syncGlobalData();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_reports' }, (payload) => {
            if (isAdminMode) {
                addNotification(`⚠️ התקבל דיווח חדש על ${payload.new.reported_email}`);
                if (document.getElementById('admin-sec-reports').classList.contains('active')) renderAdminReports();
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
            // בדיקה אם המשתמש הנוכחי נחסם בזמן אמת
            if (payload.new.email === currentUser.email && payload.new.is_banned) {
                location.reload(); // יגרום לטעינה מחדש וכניסה למסך חסימה
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_announcements' }, (payload) => {
            if (payload.new && payload.new.message) {
                const msg = payload.new.message;
                addNotification("📢 הודעת מערכת: " + msg);
                customAlert("📢 הודעת מערכת:<br>" + msg, true);
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'suggestions' }, (payload) => {
            if (isAdminMode && document.getElementById('admin-sec-suggestions').classList.contains('active')) {
                renderAdminSuggestions();
            }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'siyum_board' }, (payload) => {
            // עדכון לוח סיומים בזמן אמת אם הוא פתוח
            if (document.getElementById('mazaltov-main-container')) {
                renderMazalTovInMainArea();
            }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (payload) => {
            handleRealtimeMessage(payload);
        })
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload && payload.payload.to === currentUser.email) {
                const sender = globalUsersData.find(u => u.email === payload.payload.from);
                let displayName = sender ? sender.name : payload.payload.from;
                if (payload.payload.from === 'admin@system') {
                    displayName = 'הודעת מנהל';
                }
                showTyping(payload.payload.from, `${displayName} מקליד...`);
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('מחובר לעדכונים בזמן אמת');
                chatChannel = realtimeSubscription;
            }
            if (status === 'CHANNEL_ERROR') console.error('שגיאה בחיבור לזמן אמת');
        });

    // הוספת מאזין להודעות פרטיות המשודרות
    realtimeSubscription.on('broadcast', { event: 'private_message' }, (payload) => {
        if (payload.payload && payload.payload.message) {
            handleRealtimeMessage({ eventType: 'INSERT', new: payload.payload.message, table: 'chat_messages', schema: 'public', old: {} });
        }
    });
}

function handleRealtimeMessage(payload) {
    const { eventType, new: newMsg, old: oldMsg } = payload;

    if (eventType === 'INSERT' && newMsg) {
        const myEmail = getCurrentChatEmail().toLowerCase();
        const sender = newMsg.sender_email ? newMsg.sender_email.toLowerCase() : '';
        const receiver = newMsg.receiver_email ? newMsg.receiver_email.toLowerCase() : '';

        // בדיקת שרשור בזמן אמת
        if (newMsg.message.includes('ref:')) {
            const refMatch = newMsg.message.match(/ref:(\d+)/);
            if (refMatch && document.getElementById(`msg-${refMatch[1]}`)) {
                // כאן אפשר להוסיף אינדיקציה ויזואלית להודעת האב
                const parentMsg = document.getElementById(`msg-${refMatch[1]}`);
                if (!parentMsg.querySelector('.thread-active-indicator')) {
                    const indicator = document.createElement('span');
                    indicator.className = 'thread-active-indicator';
                    indicator.title = "יש תגובות חדשות בשרשור";
                    parentMsg.appendChild(indicator);
                }
            }
            // אם חלון השרשור פתוח וההודעה שייכת אליו
            if (activeThreadId && refMatch && refMatch[1] === activeThreadId) {
                const container = document.getElementById('thread-messages');
                if (container) {
                    appendThreadMessage(newMsg, container);
                }
            }
        }

        // Handle Book Chat
        if (newMsg.receiver_email && newMsg.receiver_email.startsWith('book:')) {
            const bookId = newMsg.receiver_email;

            // בדיקה חכמה יותר למציאת חלון הצ'אט (כולל תמיכה בקידודים שונים או אותיות גדולות/קטנות)
            let win = document.getElementById(`chat-window-${bookId}`);
            if (!win) {
                const allWins = document.querySelectorAll('.chat-window');
                for (const w of allWins) {
                    if (w.id.toLowerCase() === `chat-window-${bookId.toLowerCase()}`) {
                        win = w;
                        break;
                    }
                }
            }

            const container = win ? win.querySelector('.chat-messages-area') : document.getElementById(`msgs-${bookId}`);

            // בדיקה אם חלון הצ'אט פתוח (בין אם צף ובין אם ראשי)
            if ((win || container) && sender !== myEmail) {
                // שימוש ב-ID המדויק של החלון הפתוח כדי למנוע כפילויות
                const targetId = win ? win.id.replace('chat-window-', '') : bookId;
                appendMessageToWindow(targetId, newMsg.message, 'other', newMsg.id, newMsg.created_at, false, sender);

                if (win && win.classList.contains('minimized')) win.classList.add('flashing');
            }
            return;
        }

        if (receiver === myEmail) {
            if (blockedUsers.includes(sender)) return;

            if (document.getElementById(`chat-window-${sender}`)) {
                appendMessageToWindow(sender, newMsg.message, 'other', newMsg.id, newMsg.created_at, newMsg.is_read, sender);
                const win = document.getElementById(`chat-window-${sender}`);
                if (win && win.classList.contains('minimized')) win.classList.add('flashing');
                else markAsRead(sender);
            } else {
                let senderDisplayName = sender;
                if (sender === 'admin@system') {
                    senderDisplayName = 'הודעת מנהל';
                } else {
                    const senderUser = globalUsersData.find(u => u.email === sender);
                    if (senderUser) senderDisplayName = senderUser.name;
                }
                unreadMessages[sender] = (unreadMessages[sender] || 0) + 1;
                localStorage.setItem('torahApp_unread', JSON.stringify(unreadMessages));
                if (Notification.permission === "granted") {
                    // הסרת תגיות HTML מהתראה שולחנית
                    const plainMsg = newMsg.message.replace(/<[^>]*>?/gm, '');
                    new Notification(`הודעה חדשה מ-${senderDisplayName}`, { body: plainMsg, icon: "https://cdn-icons-png.flaticon.com/512/2997/2997295.png" });
                }
                addNotification(`הודעה חדשה מ-${senderDisplayName}`, `msg-${newMsg.id}`);
                if (document.getElementById('screen-chavrutas').classList.contains('active')) renderChavrutas();
            }
        } else if (sender === myEmail) {
            if (!document.getElementById(`msg-${newMsg.id}`)) {
                if (document.getElementById(`chat-window-${receiver}`)) {
                    appendMessageToWindow(receiver, newMsg.message, 'me', newMsg.id, newMsg.created_at, newMsg.is_read, sender);
                }
            }
        }
    } else if (eventType === 'UPDATE' && newMsg) {
        if (newMsg.sender_email.toLowerCase() === getCurrentChatEmail().toLowerCase() && newMsg.is_read) {
            const check = document.getElementById(`check-${newMsg.id}`);
            if (check) {
                check.innerText = '✓✓';
                check.style.color = '#4ade80';
            }
        }
    } else if (eventType === 'DELETE' && oldMsg) {
        const msgEl = document.getElementById(`msg-${oldMsg.id}`);
        if (msgEl) msgEl.remove();
    }
}

// עדכון מונה מחוברים כל דקה (כדי שיתעדכן גם ללא שינוי ב-DB)
setInterval(() => {
    if (document.getElementById('screen-admin').classList.contains('active')) renderAdminPanel();
}, 2000);


function formatBroadcast(tag) {
    const textarea = document.getElementById('adminSystemMsg');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    const newText = `<${tag}>${selectedText}</${tag}>`;
    textarea.value = before + newText + after;
    textarea.focus();
    // Place cursor after the inserted text
    textarea.selectionStart = start + newText.length;
    textarea.selectionEnd = start + newText.length;
}


// === ניהול אדמין ===
let keySequence = [];
document.addEventListener('keydown', async (e) => {
    // Reset sequence if a non-modifier key is pressed without Alt, or if Escape is pressed.
    if ((!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) || e.key === 'Escape') {
        keySequence = [];
        // Do not return here, to allow the original logic to process other keys if needed.
    }

    if (e.altKey) {
        const k = e.key.toLowerCase();
        keySequence.push(k);

        // Keep the sequence to a manageable length (e.g., last 5 keys)
        if (keySequence.length > 5) keySequence.shift();

        const seqStr = keySequence.join('');

        // Admin sequence: Alt + A, R, I
        if (seqStr.endsWith('ari') || seqStr.endsWith('שרן')) {
            e.preventDefault();
            keySequence = []; // Reset after successful trigger
            const pass = await customPrompt("הכנס סיסמת מנהל:");
            if (pass === "כל יכול") {
                switchScreen('admin');
                renderAdminPanel();
            } else if (pass) await customAlert("סיסמה שגויה");
            return; // Stop further processing
        }

        // Data War sequence: Alt + C, O
        if (seqStr.endsWith('co') || seqStr.endsWith('בם')) {
            e.preventDefault();
            keySequence = []; // Reset after successful trigger
            const pass = await customPrompt("הכנס סיסמת מנהל:");
            if (pass === "כל יכול") {
                toggleDataWar();
            } else if (pass) await customAlert("סיסמה שגויה");
            return; // Stop further processing
        }
    }
});

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
}

// --- בחירת משתמשים למחיקת צ'אט ---
let selectedUsersForDelete = [];

function openUserSelection(targetInputId) {
    document.getElementById('userSelectionModal').style.display = 'flex';
    selectedUsersForDelete = [];
    renderUserSelectionList();
}

function renderUserSelectionList() {
    const search = document.getElementById('userSelectSearch').value.toLowerCase();
    const list = document.getElementById('userSelectionList');
    list.innerHTML = `
        <div class="user-select-item" onclick="toggleSelectAllUsers(this)">
            <input type="checkbox" id="selectAllUsersCheckbox">
            <strong>בחר הכל</strong>
        </div>
    `;

    globalUsersData.forEach(u => {
        if (u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)) {
            const div = document.createElement('div');
            div.className = 'user-select-item';
            div.innerHTML = `<input type="checkbox" value="${u.email}" class="user-select-cb"> ${u.name} (${u.email})`;
            list.appendChild(div);
        }
    });
}

function toggleSelectAllUsers(el) {
    const cb = el.querySelector('input');
    const checked = !cb.checked; // Toggle
    cb.checked = checked;
    document.querySelectorAll('.user-select-cb').forEach(c => c.checked = checked);
}

function confirmUserSelection() {
    const selected = Array.from(document.querySelectorAll('.user-select-cb:checked')).map(cb => cb.value);
    document.getElementById('resetChatEmail1').value = selected.length > 0 ? selected.join(',') : '';
    document.getElementById('userSelectionModal').style.display = 'none';
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

async function downloadMarketingList() {
    const { data } = await supabaseClient.from('users').select('email').eq('marketing_consent', true);
    if (!data || data.length === 0) return customAlert("אין נתונים להורדה");

    const text = data.map(u => u.email).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marketing_emails.txt';
    a.click();
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

function saveCampaignProgress() {
    const val = document.getElementById('adminCampaignInput').value;
    localStorage.setItem('torahApp_campaign_progress', val);
    customAlert('ההתקדמות עודכנה בהצלחה!');
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


async function sendSystemBroadcast() {
    const msg = document.getElementById('adminSystemMsg').value.replace(/\n/g, '<br>');
    if (!msg) return;

    try {
        await supabaseClient.from('system_announcements').insert([{ message: msg }]);
        // השידור מתבצע דרך ה-Realtime Listener שמוגדר ב-setupRealtime
        showToast('ההודעה נשלחה!', "success");
        document.getElementById('adminSystemMsg').value = '';
    } catch (e) {
        console.error(e);
        await customAlert('שגיאה בשליחת ההודעה.');
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

/* --- Toast Function --- */
function showToast(text, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `<i class="fas fa-${icon} toast-icon"></i> <span>${text}</span>`;

    container.prepend(toast);

    // חישוב זמן תצוגה לפי אורך הטקסט (מינימום 3 שניות)
    const duration = Math.max(3000, text.length * 60);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

/* --- Input Validation --- */
function validateInput(value, type) {
    if (!value) return true; // Don't validate empty optional fields, the required attribute handles mandatory fields
    value = value.trim();
    if (value === '') return true;

    switch (type) {
        case 'email':
            return /\S+@\S+\.\S+/.test(value);
        case 'phone':
            // Allows 05x-xxxxxxx, 0x-xxxxxxx, 0xx-xxxxxxx after stripping hyphens
            return /^0\d{8,9}$/.test(value.replace(/-/g, ''));
        case 'password':
            // At least 6 chars, one letter, one number
            return /(?=.*\d)(?=.*[a-zA-Z\u0590-\u05FF]).{6,}/.test(value);
        case 'name':
            // At least two letters, allows Hebrew, English and spaces, not just numbers
            return /^[a-zA-Z\u0590-\u05FF\s]{2,}[a-zA-Z\u0590-\u05FF\s]*$/.test(value) && !/^\d+$/.test(value);
        default:
            return true;
    }
}
/* --- פונקציות עזר למודאלים מותאמים אישית --- */
function customAlert(msg, isHtml = false) {
    return new Promise(resolve => {
        document.getElementById('cAlertMsg').innerText = msg;
        const msgEl = document.getElementById('cAlertMsg');
        document.getElementById('customAlertModal').style.display = 'flex';
        bringToFront(document.getElementById('customAlertModal'));
        if (isHtml) {
            msgEl.innerHTML = msg;
        } else {
            msgEl.innerText = msg;
        }
        const btn = document.getElementById('cAlertBtn');
        btn.onclick = () => {
            document.getElementById('customAlertModal').style.display = 'none';
            resolve();
        };
    });
}

function customConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById('cConfirmMsg').innerText = msg;
        document.getElementById('customConfirmModal').style.display = 'flex';
        bringToFront(document.getElementById('customConfirmModal'));
        document.getElementById('cConfirmOk').onclick = () => {
            document.getElementById('customConfirmModal').style.display = 'none';
            resolve(true);
        };
        document.getElementById('cConfirmCancel').onclick = () => {
            document.getElementById('customConfirmModal').style.display = 'none';
            resolve(false);
        };
    });
}

function customPrompt(msg, defaultVal = '') {
    return new Promise(resolve => {
        document.getElementById('cPromptMsg').innerText = msg;
        const input = document.getElementById('cPromptInput');
        input.value = defaultVal;
        document.getElementById('customPromptModal').style.display = 'flex';
        bringToFront(document.getElementById('customPromptModal'));
        input.focus();

        document.getElementById('cPromptOk').onclick = () => {
            document.getElementById('customPromptModal').style.display = 'none';
            resolve(input.value);
        };
        document.getElementById('cPromptCancel').onclick = () => {
            document.getElementById('customPromptModal').style.display = 'none';
            resolve(null);
        };
    });
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

async function checkBanLifted() {
    const email = sessionStorage.getItem('banned_email');
    if (!email) {
        location.reload();
        return;
    }
    const { data: user } = await supabaseClient.from('users').select('is_banned').eq('email', email).single();
    if (user && !user.is_banned) {
        localStorage.removeItem('device_banned');
        location.reload();
    } else {
        customAlert("החשבון עדיין חסום.");
    }
}

/* --- ניהול תפריט פרופיל --- */
function toggleProfileMenu() {
    const menu = document.getElementById('profile-dropdown');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

// סגירת התפריט בלחיצה בחוץ
document.addEventListener('click', function (event) {
    const container = document.querySelector('.profile-container');
    if (container && !container.contains(event.target)) {
        document.getElementById('profile-dropdown').style.display = 'none';
    }

    // סגירת תפריט התראות בלחיצה בחוץ
    const notifContainer = document.querySelector('#notif-container');
    const notifMenu = document.getElementById('notif-dropdown');
    if (notifContainer && !notifContainer.contains(event.target) && notifMenu.style.display === 'block') {
        toggleNotifications(); // Use the toggle function to handle state
    }

    // Close search dropdown if clicked outside
    const searchContainer = document.querySelector('.header-search-container');
    if (searchContainer && !searchContainer.contains(event.target)) {
        closeSearchDropdown();
    }
});

/* --- בדיקת הודעות מהמנהל (עבור המשתמש) --- */
async function checkAdminMessagesForUser() {
    if (!currentUser) return;

    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .eq('receiver_email', currentUser.email)
        .eq('sender_email', 'admin@system')
        .eq('is_read', false);

    const badge = document.getElementById('profileAdminBadge');
    if (data && data.length > 0) {
        badge.innerText = data.length;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

async function sendAppeal() {
    const msg = document.getElementById('appealMsg').value;
    const email = sessionStorage.getItem('banned_email');
    if (!msg) return customAlert("נא לכתוב תוכן לפנייה");

    // בדיקת שחרור חסימה (אולי המנהל שחרר בינתיים)
    const { data: user } = await supabaseClient.from('users').select('is_banned').eq('email', email).single();
    if (user && !user.is_banned) {
        localStorage.removeItem('device_banned');
        location.reload();
        return;
    }

    try {
        await supabaseClient.from('chat_messages').insert([{
            sender_email: email, receiver_email: 'admin@system', message: 'ערעור חסימה: ' + msg
        }]);
        showToast("הפנייה נשלחה למנהל האתר.", "success");
        document.getElementById('appealMsg').value = '';
    } catch (e) { console.error(e); await customAlert("שגיאה בשליחה"); }
}

async function renderMazalTovBoard() {
    const container = document.getElementById('mazaltov-container');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center; color:#94a3b8;">טוען סיומים...</p>';

    const { data: siyumin, error } = await supabaseClient
        .from('siyum_board')
        .select(`
            id, completed_at, book_name,
            users (display_name),
            siyum_reactions (count)
        `)
        .order('completed_at', { ascending: false })
        .limit(50);

    if (error || !siyumin) {
        container.innerHTML = '<p style="text-align:center; color:red;">שגיאה בטעינת הלוח.</p>';
        return;
    }

    if (siyumin.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#94a3b8;">עדיין אין סיומים בלוח. היה הראשון לסיים!</p>';
        return;
    }

    container.innerHTML = '';
    siyumin.forEach(siyum => {
        const name = siyum.users ? siyum.users.display_name : 'לומד';
        const mazalTovCount = siyum.siyum_reactions[0]?.count || 0;
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <h3 style="text-align:center; color:var(--accent);">🎉 מזל טוב ל<strong>${name}</strong>! 🎉</h3>
            <p style="text-align:center; font-size:1.1rem;">על סיום לימוד <strong>${siyum.book_name}</strong></p>
            <p style="text-align:center; font-size:0.8rem; color:#64748b;">בתאריך ${new Date(siyum.completed_at).toLocaleDateString('he-IL')}</p>
            <div style="text-align:center; margin-top:15px;">
                <button class="btn" style="width:auto; background:var(--primary);" onclick="addSiyumReaction(${siyum.id}, this)">
                    <i class="fas fa-glass-cheers"></i> אמור מזל טוב! 
                    <span id="siyum-count-${siyum.id}" style="background:rgba(255,255,255,0.2); padding: 2px 8px; border-radius:10px; margin-right:5px;">${mazalTovCount}</span>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}


function toggleDarkMode(e, forceState) {
    // e is the change event from the checkbox
    const body = document.body;
    const isDark = forceState !== undefined ? forceState : e.target.checked;

    if (isDark) {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }
    document.getElementById('darkModeSwitch').checked = isDark;
    localStorage.setItem('torahApp_darkMode', isDark);
}

// === Ads Management ===
async function saveAds() {
    const content = document.getElementById('adminAdsContent').value;
    try {
        const { error } = await supabaseClient.from('settings').upsert({ key: 'ads_content', value: content }, { onConflict: 'key' });
        if (error) throw error;
        showToast("הפרסומות נשמרו!", "success");
    } catch (e) {
        console.error("Ads save error:", e);
        await customAlert("שגיאה בשמירת הפרסומות. ודא שטבלת 'settings' קיימת ושהרשאות RLS מאפשרות כתיבה.");
    }
}

async function loadAds() {
    const container = document.getElementById('ads-container');
    // In a real app, you'd load from Supabase
    try {
        const { data, error } = await supabaseClient.from('settings').select('value').eq('key', 'ads_content').single();
        if (error || !data) throw error || new Error("No data");
        container.innerHTML = data.value || '<p style="text-align:center; color:#94a3b8;">אין פרסומות כרגע.</p>';
        logAdView(); // Log view when ads are loaded
    } catch (e) {
        container.innerHTML = '<p style="text-align:center; color:#94a3b8;">אין פרסומות כרגע.</p>';
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

async function addSiyumReaction(siyumId, btn) {
    try {
        const { error } = await supabaseClient.from('siyum_reactions').insert({ siyum_id: siyumId, reactor_email: currentUser.email });

        if (error && error.code === '23505') { // unique constraint violation
            return showToast("כבר אמרת מזל טוב!", "info");
        }
        if (error) throw error;

        const countEl = document.getElementById(`siyum-count-${siyumId}`);
        countEl.innerText = parseInt(countEl.innerText) + 1;
        btn.disabled = true;
        btn.style.background = 'var(--success)';
        showToast("מזל טוב נשלח!", "success");
    } catch (e) { console.error(e); }

}

// === פונקציות ניהול בוטים וכלים ===
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

function logoutBot() {
    currentUser = realAdminUser;
    realAdminUser = null;
    localStorage.setItem('torahApp_user', JSON.stringify(currentUser));
    location.reload(); // רענון כדי להיכנס כבוט
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
// === Data War Animation ===
window.isNetworkMonitorActive = false;
let isVerboseNetworkLog = false;

function toggleVerboseNetworkLog(btn) {
    isVerboseNetworkLog = !isVerboseNetworkLog;
    btn.textContent = isVerboseNetworkLog ? 'הסתר בקשות רקע' : 'הצג בקשות רקע';
    btn.style.background = isVerboseNetworkLog ? '#16a34a' : '#334155';
}
function toggleDataWar() {
    window.isNetworkMonitorActive = !window.isNetworkMonitorActive;
    const overlay = document.getElementById('dataWarOverlay');
    overlay.style.display = window.isNetworkMonitorActive ? 'flex' : 'none';
    if (window.isNetworkMonitorActive) {
        populateNetworkUsers();
    } else {
        document.getElementById('networkLog').innerHTML = ''; // Clear log on close
        document.getElementById('user-icons-container').innerHTML = ''; // Clear icons
    }
}

function populateNetworkUsers() {
    const container = document.getElementById('user-icons-container');
    const visualizer = document.getElementById('network-visualizer');
    if (!container || !visualizer) return;

    container.innerHTML = ''; // Clear previous
    const onlineUsers = globalUsersData.filter(u => u.lastSeen && (new Date() - new Date(u.lastSeen) < 5 * 60 * 1000));

    const width = visualizer.clientWidth;
    const height = visualizer.clientHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width / 2 - 40;
    const radiusY = height / 2 - 40;
    const userCount = onlineUsers.length;

    onlineUsers.forEach((user, i) => {
        const angle = (i / userCount) * 2 * Math.PI - (Math.PI / 2); // Start from top
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);

        const userDiv = document.createElement('div');
        const safeEmail = user.email.replace(/[@.-]/g, '');
        userDiv.id = `net-user-${safeEmail}`;
        userDiv.className = 'net-user';
        userDiv.dataset.id = user.email; // Store original email
        userDiv.style.left = `${x - 30}px`; // Adjust for half width
        userDiv.style.top = `${y - 30}px`; // Adjust for half height

        userDiv.innerHTML = `
            <div class="user-icon-emoji">💻</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${user.name}</div>
        `;
        container.appendChild(userDiv);
    });
}

function drawNetworkLine(fromId, toId, color = '#3b82f6') {
    const svg = document.getElementById('network-lines-svg');
    const fromEl = document.querySelector(`[data-id='${fromId}']`);
    const toEl = document.querySelector(`[data-id='${toId}']`);

    if (!svg || !fromEl || !toEl) {
        return;
    }

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    const fromX = (fromRect.left + fromRect.width / 2) - svgRect.left;
    const fromY = (fromRect.top + fromRect.height / 2) - svgRect.top;
    const toX = (toRect.left + toRect.width / 2) - svgRect.left;
    const toY = (toRect.top + toRect.height / 2) - svgRect.top;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${fromX},${fromY} L${toX},${toY}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');

    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;

    svg.appendChild(path);

    path.animate([
        { strokeDashoffset: length },
        { strokeDashoffset: 0 }
    ], {
        duration: 800,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }).onfinish = () => {
        path.animate([
            { opacity: 1 },
            { opacity: 0 }
        ], { duration: 300, easing: 'ease-out' }).onfinish = () => {
            path.remove();
        };
    };
}
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    const isBoring = url.includes('last_seen') || (url.includes('chavruta_requests') && url.includes('select')) || (url.includes('chat_messages') && url.includes('select'));

    const details = {
        action: getHebrewActionName(url),
        from: currentUser?.email,
        isBoring: isBoring
    };

    if (window.isNetworkMonitorActive) {
        visualizeNetworkActivity('request', details);
    }

    try {
        const response = await originalFetch(...args);
        if (window.isNetworkMonitorActive) {
            details.status = response.status;
            visualizeNetworkActivity('response', details);
        }
        return response;
    } catch (e) {
        if (window.isNetworkMonitorActive) {
            details.status = 'Error';
            visualizeNetworkActivity('error', details);
        }
        throw e;
    }
};

// פונקציה לטעינת כל הספרים מאוצריא/ספריא
async function populateAllBooks() {
    const select = document.getElementById('bookSelect');
    if (!select || select.children.length > 1) return; // כבר נטען

    select.innerHTML = '<option>טוען רשימת ספרים...</option>';
    try {
        const res = await fetch('https://www.sefaria.org.il/api/index/');
        if (!res.ok) throw new Error('Sefaria API failed');
        const data = await res.json();

        select.innerHTML = '<option value="">בחר ספר מהרשימה...</option>';

        const books = [];
        function traverse(node) {
            if (node.contents) node.contents.forEach(traverse);
            else if (node.heTitle) books.push(node.heTitle);
        }
        data.forEach(traverse);
        books.sort();

        books.forEach(b => {
            const opt = document.createElement('option');
            const localBook = Object.values(libraryDB).flat().find(local => local.name === b);
            const units = localBook ? localBook.units : 50;
            opt.value = JSON.stringify({ name: b, units: units });
            opt.innerText = b;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("שגיאה בטעינת ספרים מהרשת, טוען מהמאגר המקומי:", e);
        select.innerHTML = '<option value="">בחר ספר מהרשימה (גיבוי)...</option>';
        const allBooks = [...BOOKS_DB];
        allBooks.sort((a, b) => a.name.localeCompare(b.name, 'he'));
        allBooks.forEach(book => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(book);
            opt.innerText = book.name;
            select.appendChild(opt);
        });
    }
}

let activeThreadId = null;
let activeThreadChatId = null;

async function openThread(msgId, text, chatId) {
    activeThreadId = msgId;
    activeThreadChatId = chatId;

    const area = document.getElementById('chat-thread-area');
    const container = document.getElementById('thread-messages');
    if (!area || !container) return;

    area.style.display = 'flex';
    container.innerHTML = `<div style="background:#e2e8f0; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.9rem;"><strong>הודעת מקור:</strong><br>${text}</div>`;
    container.innerHTML += `<div style="text-align:center; color:#94a3b8;">טוען תגובות...</div>`;

    // מיקוד הסמן בשדה הקלט
    setTimeout(() => {
        const input = document.getElementById('thread-input');
        if (input) input.focus();
    }, 100);

    // שליפת תגובות מהשרת
    const { data: replies } = await supabaseClient
        .from('chat_messages')
        .select('*')
        .ilike('message', `%ref:${msgId}%`) // חיפוש הודעות שמכילות את ה-ID המוסתר
        .order('created_at');

    // ניקוי הודעת הטעינה
    const loadingMsg = container.querySelector('div:last-child');
    if (loadingMsg && loadingMsg.innerText === 'טוען תגובות...') loadingMsg.remove();

    if (replies && replies.length > 0) {
        replies.forEach(rep => appendThreadMessage(rep, container));
    } else {
        container.innerHTML += `<div style="text-align:center; color:#94a3b8; margin-top:20px;">אין תגובות בשרשור זה (עדיין)</div>`;
    }
}

function appendThreadMessage(rep, container) {
    // ניקוי ה-ref מההודעה המוצגת
    const cleanMsg = rep.message.replace(/<span style="display:none">ref:.*?<\/span>/, '');
    const senderUser = globalUsersData.find(u => u.email === rep.sender_email);
    const senderName = senderUser ? senderUser.name : rep.sender_email.split('@')[0];
    const isMe = rep.sender_email === currentUser.email;
    const fullTextSafe = cleanMsg.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const likeDisabled = isMe ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';

    // בדיקת מנוי
    const isSubscribed = senderUser && senderUser.subscription && senderUser.subscription.level > 0;
    const subIcon = isSubscribed ? `<i class="fas fa-crown" style="color:#d97706; font-size:0.7rem; margin-right:3px;" title="מנוי"></i>` : '';

    const div = document.createElement('div');
    div.style.cssText = `background:${isMe ? '#eff6ff' : '#fff'}; padding:8px; margin-bottom:8px; border-radius:6px; border:1px solid #e2e8f0; position:relative;`;

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="color:${isMe ? 'var(--primary)' : '#333'}; font-size:0.85rem;">${subIcon}${isMe ? 'אני' : senderName}</strong>
            <span style="font-size:0.7rem; color:#94a3b8;">${new Date(rep.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div style="font-size:0.9rem; margin-bottom:5px;">${cleanMsg}</div>
        
        <div class="msg-reactions" style="justify-content:flex-start; gap:10px; border-top:1px solid #f1f5f9; padding-top:4px;">
            <button class="reaction-btn" ${likeDisabled} onclick="toggleReaction('${rep.id}', 'like', this)"><i class="fas fa-thumbs-up"></i></button>
            <button class="reaction-btn" ${likeDisabled} onclick="toggleReaction('${rep.id}', 'dislike', this)"><i class="fas fa-thumbs-down"></i></button>
            
            <div class="msg-actions-menu" style="position:relative; display:inline-block;">
                <button class="reaction-btn" onclick="this.nextElementSibling.classList.toggle('active')"><i class="fas fa-ellipsis-v"></i></button>
                <div class="msg-menu-dropdown">
                    <div class="msg-menu-item" onclick="replyToMessage('${activeThreadChatId}', '${senderName}', '${fullTextSafe}'); closeThread();"><i class="fas fa-reply"></i> ציטוט</div>
                    ${!isMe ? `<div class="msg-menu-item" style="color:var(--danger);" onclick="openReportModal('${rep.sender_email}');"><i class="fas fa-flag"></i> דיווח</div>` : ''}
                </div>
            </div>
        </div>
    `;
    container.appendChild(div);
}

function closeThread() {
    document.getElementById('chat-thread-area').style.display = 'none';
    activeThreadId = null;
}

async function sendThreadMessage() {
    const input = document.getElementById('thread-input');
    const text = input.value;
    if (!text || !activeThreadId) return;

    let finalContent = text;
    if (activeReply && activeReply.chatId === activeThreadChatId) {
        finalContent = `<div class="chat-quote"><strong>${activeReply.sender}:</strong> ${activeReply.text}</div>${text}`;
        cancelReply(activeThreadChatId);
    }

    // Send message with hidden ref
    const finalMsg = `${finalContent} <span style="display:none">ref:${activeThreadId}</span>`;

    try {
        await supabaseClient.from('chat_messages').insert([{
            sender_email: currentUser.email,
            receiver_email: activeThreadChatId,
            message: finalMsg,
            is_html: true
        }]);
        input.value = '';

        // הוספה מיידית לתצוגה
        appendThreadMessage({
            id: 'temp-' + Date.now(),
            sender_email: currentUser.email,
            message: finalMsg,
            created_at: new Date().toISOString()
        }, document.getElementById('thread-messages'));

        // Manually append to thread view
        // No need to append manually if realtime works, but for instant feedback we can rely on realtime or append a temp one.
        // Since we have realtime listener for chat_messages, it should appear automatically.
    } catch (e) { console.error(e); }
}

// === Tracking Functions (Fix for Points 4 & 7) ===
async function logVisit() {
    let visitorId = localStorage.getItem('visitor_id');
    if (!visitorId) {
        visitorId = crypto.randomUUID();
        localStorage.setItem('visitor_id', visitorId);
    }
    try {
        await supabaseClient.from('site_visits').insert({
            visitor_id: visitorId,
            user_email: currentUser ? currentUser.email : null
        });
    } catch (e) { console.error("Visit log error", e); }
}

async function logAdView() {
    try {
        await supabaseClient.from('ad_stats').insert({ event_type: 'view' });
    } catch (e) { }
}

async function logAdClick() {
    try {
        await supabaseClient.from('ad_stats').insert({ event_type: 'click' });
    } catch (e) { }
}

async function getDafYomi() {
    try {
        const res = await fetch('https://www.sefaria.org/api/calendars');
        const data = await res.json();
        if (data && data.calendar_items) {
            const dafItem = data.calendar_items.find(item => item.title.en === 'Daf Yomi');
            if (dafItem) dafYomiToday = dafItem.displayValue.he;
        }
    } catch (e) { console.error("Could not fetch Daf Yomi", e); }
}

// === Community Screen Logic (Fix for Point 5) ===
function renderCommunity() {
    loadAds();

    // Render User Stats Graph
    const ctx = document.getElementById('userStatsChart');
    if (ctx) {
        // Prepare data: Books per status
        const active = userGoals.filter(g => g.status === 'active').length;
        const completed = userGoals.filter(g => g.status === 'completed').length;
        const totalPages = userGoals.reduce((sum, g) => sum + g.currentUnit, 0);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['פעיל', 'הושלם'],
                datasets: [{
                    data: [active, completed],
                    backgroundColor: ['#3b82f6', '#22c55e'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    title: { display: true, text: `סה"כ דפים: ${totalPages}` }
                }
            }
        });
    }
}

// מיפוי פעולות רשת לעברית
function getHebrewActionName(url) {
    if (!url) return 'פעולה לא ידועה';
    if (url.includes('users') && !url.includes('last_seen')) return 'טעינת משתמשים';
    if (url.includes('user_goals')) return 'סנכרון לימודים';
    if (url.includes('chat_messages')) return 'הודעות צ\'אט';
    if (url.includes('chavruta_requests')) return 'בקשות חברותא';
    if (url.includes('schedules')) return 'לוח זמנים';
    if (url.includes('user_reports')) return 'דיווחים';
    return 'תקשורת שרת';
}

function visualizeNetworkActivity(type, details) {
    if (!window.isNetworkMonitorActive) return;

    const log = document.getElementById('networkLog');
    if (!log) return;

    const { action, from, to, isBoring, status } = details;

    if (isBoring && !isVerboseNetworkLog) {
        return; // Skip visualization and logging
    }

    // --- Visualization ---
    if (action === 'sendMessage') {
        // Animate from sender to cloud, then cloud to receiver
        drawNetworkLine(from, 'cloud', '#60a5fa'); // Blue for request
        setTimeout(() => {
            drawNetworkLine('cloud', to, '#4ade80'); // Green for delivery
        }, 400);
    } else {
        // Generic request/response
        if (type === 'request') {
            drawNetworkLine(from, 'cloud', '#60a5fa');
        } else if (type === 'response') {
            drawNetworkLine('cloud', from, status >= 400 ? '#f87171' : '#4ade80');
        }
    }

    // Log entry
    const entry = document.createElement('div');
    entry.style.marginBottom = '4px';
    entry.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    entry.style.paddingBottom = '2px';

    const time = new Date().toLocaleTimeString().split(' ')[0];
    let icon = type === 'request' ? '⬆️' : '⬇️';
    let color = type === 'request' ? '#60a5fa' : (type === 'error' ? '#f87171' : '#4ade80');
    if (status >= 400) color = '#f87171';

    const typeLabel = type === 'request' ? 'בקשה' : (status >= 400 ? 'שגיאה' : 'תגובה');

    let fromName = globalUsersData.find(u => u.email === from)?.name || from;
    let toName = globalUsersData.find(u => u.email === to)?.name || to;

    let description = `${action}`;
    if (from && to) {
        description += ` מ-${fromName} ל-${toName}`;
    } else if (from) {
        description += ` מ-${fromName}`;
    }

    entry.innerHTML = `<span style="color:#64748b">[${time}]</span> <span style="color:${color}">${icon} ${typeLabel}</span>: ${description} ${status ? `(${status})` : ''}`;

    log.insertBefore(entry, log.firstChild);
    if (log.children.length > 30) log.lastChild.remove();
}

// האזנה גלובלית ללחיצות לניהול חלונות
document.addEventListener('mousedown', (e) => {
    const win = e.target.closest('.chat-window, .modal-content, .auth-box, .modal-overlay');
    if (win) {
        // אם זה מודאל, נביא את המודאל עצמו (overlay) לקדמה
        if (win.classList.contains('modal-overlay')) {
            bringToFront(win);
        } else if (win.classList.contains('chat-window')) {
            bringToFront(win);
        } else {
            // אם זה תוכן בתוך מודאל, נביא את המודאל העוטף
            const overlay = win.closest('.modal-overlay');
            if (overlay) bringToFront(overlay);
        }
    }
});

// סגירת תפריטי הודעות בלחיצה בחוץ
document.addEventListener('click', (e) => {
    if (!e.target.closest('.msg-actions-menu')) {
        document.querySelectorAll('.msg-menu-dropdown').forEach(el => el.classList.remove('active'));
    }
});


window.onload = async function () {
    try {
        await init(); // טוען את הממשק הבסיסי
    } catch (e) {
        console.log("האתר עלה ללא סנכרון ענן");
    }

    // בדיקה אם המשתמש מחובר והצגת המסך המתאים
    if (currentUser) {
        renderGoals();
        loadAds();
    }
};

function showAchievements() {
    const totalLearned = userGoals.reduce((sum, g) => sum + g.currentUnit, 0);
    const currentRank = getRankName(totalLearned);

    let nextRank = "", nextThreshold = 0;
    if (totalLearned < 101) { nextRank = "מתמיד"; nextThreshold = 101; }
    else if (totalLearned < 501) { nextRank = "צורבא מרבנן"; nextThreshold = 501; }
    else if (totalLearned < 1001) { nextRank = "תלמיד חכם"; nextThreshold = 1001; }
    else { nextRank = "מאור הדור"; nextThreshold = totalLearned; }

    const remaining = Math.max(0, nextThreshold - totalLearned);
    const rating = currentUser.chat_rating || 0;

    const content = `
        <h3 style="text-align:center; color:var(--accent);">ההישגים שלי</h3>
        <div style="margin:20px 0;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>דרגה: ${currentRank}</strong>
                <span>${totalLearned} דפים</span>
            </div>
            <div class="progress-container" style="height:15px; background:#e2e8f0;">
                <div class="progress-bar" style="width:${Math.min(100, (totalLearned / nextThreshold) * 100)}%;"></div>
            </div>
            <div style="text-align:center; font-size:0.9rem; color:#64748b; margin-top:5px;">
                ${remaining > 0 ? `עוד ${remaining} דפים לדרגת ${nextRank}` : 'הגעת לפסגה!'}
            </div>
        </div>
        
        <div style="margin:20px 0; border-top:1px solid #eee; padding-top:20px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <strong>דירוג חברתי (לייקים)</strong>
                <span>${rating}</span>
            </div>
            <div class="progress-container" style="height:15px; background:#e2e8f0;">
                <div class="progress-bar" style="width:${Math.min(100, rating)}%; background: linear-gradient(90deg, #ec4899, #8b5cf6);"></div>
            </div>
        </div>
        
        <button class="btn" onclick="closeModal()">סגור</button>
    `;

    let modal = document.getElementById('achievementsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'achievementsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-content" id="achievementsContent"></div>`;
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    }
    document.getElementById('achievementsContent').innerHTML = content;
    modal.style.display = 'flex';
    bringToFront(modal);
}