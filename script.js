document.addEventListener('DOMContentLoaded', () => {
    setupInterfaceChanges();
});

let currentUser = null;
let currentLeaderboardSort = 'learned';
let lastLeaderboardHTML = '';


let dafYomiToday = null;
let chatInterval = null;
let chatChannel = null;
let realtimeSubscription = null;
let typingTimers = {};


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

        // הוספת onclick לכפתור הסיומים לאחר שהכל נטען
        const completedStatCard = document.getElementById('stat-completed')?.closest('.stat-card');
        if (completedStatCard) {
            completedStatCard.style.cursor = 'pointer';
            completedStatCard.onclick = () => showCompletions();
        }
        updateFollowersCount(); // עדכון מונה עוקבים בטעינה
        sendHeartbeat();
        setupRealtime();
        logVisit(); // Log visitor
        
        // === הוספה: החלת התאמות אישיות (רקעים/אייקונים) ===
        if (typeof applyUserCustomizations === 'function') {
            await applyUserCustomizations();
        }
    } else {
        // New Guest Mode
        document.getElementById('auth-overlay').style.display = 'none';
        setupGuestHeader();
        await syncGlobalData(); // To get public data like users for leaderboard
        renderLeaderboard();
        loadAds();
        getDafYomi();
        renderGoals(); // To show empty state
        checkCookieConsent();
        if (localStorage.getItem('torahApp_darkMode') === 'true') toggleDarkMode(null, true);
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

let searchDebounceTimer;

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
    if (!currentUser) return;
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

function updateCalculatedUnits() {
    if (!requireAuth()) return;
    const scope = document.getElementById('bookScopeSelect').value;
    if (scope === 'chapter') {
        // הערכה לפרק בודד
        document.getElementById('calculatedUnits').value = 20; // ממוצע משניות/פסוקים לפרק
    }
}


function renderLeaderboard() {
    const listContainer = document.getElementById('leaderboardList');
    const meContainer = document.getElementById('leaderboardMeContainer');
    if (!listContainer || !meContainer) return;

    const cityFilter = document.getElementById('leaderboardCityFilter') ? document.getElementById('leaderboardCityFilter').value.toLowerCase() : '';
    const bookFilter = document.getElementById('leaderboardBookFilter') ? document.getElementById('leaderboardBookFilter').value.toLowerCase() : '';

    // 1. קח את כל המשתמשים מהענן, אבל הסר את עצמך משם (לפי אימייל) כדי למנוע כפילות
    let all = globalUsersData.filter(u => u.email && (!currentUser || u.email.toLowerCase() !== currentUser.email.toLowerCase()));

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

    let newHTML = '';
    let myCardHTML = '';

    // 3. מיון והצגה
    all.sort((a, b) => {
        if (currentLeaderboardSort === 'rating') {
            return (b.chat_rating || 0) - (a.chat_rating || 0);
        }
        return b.learned - a.learned;
    }).slice(0, 15).forEach((u, i) => { // הגבלה ל-15 המובילים
        const rank = i + 1;
        // אם זה 'אני', שולחים מזהה מיוחד, אחרת את האימייל
        const idToSend = u.id === 'me' ? 'me' : u.email;
        const score = currentLeaderboardSort === 'rating' ? (u.chat_rating || 0) : u.learned;
        const scoreLabel = currentLeaderboardSort === 'rating' ? 'רייטינג' : 'נקודות';
        const badge = getUserBadgeHtml(u);

        // Render Me Card separately if it's me
        if (u.id === 'me' && meContainer) {
            myCardHTML = `
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

        newHTML += `
        <div class="lb-card" style="animation-delay:${i * 0.05}s" onclick="showUserDetails('${idToSend}')">
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
        </div>`;
    });

    // עדכון ה-DOM רק אם יש שינוי, למניעת הבהוב
    if (newHTML !== lastLeaderboardHTML) {
        listContainer.innerHTML = newHTML;
        meContainer.innerHTML = myCardHTML;
        lastLeaderboardHTML = newHTML;
    }
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
            await new Promise(r => setTimeout(r, 1200)); // השהיה לאפקט
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
            if (uLocal) {
                const uScore = uLocal.learned || 0;
                if (getRankName(uScore) === myRank) u.matchScore += 50;
                u.books = uLocal.books || [];
                if (u.books.includes(bookName)) {
                    u.matchScore += 30; // 10% of 300 for match score
                }
            } else {
                u.books = [];
            }
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
    // שמירת התוצאות למשתנה גלובלי לשימוש בדף התוצאות
    currentChavrutaSearchResults = matches;
    currentSearchBook = bookName;
    
    // סגירת המודאל ומעבר לדף התוצאות
    closeModal();
    switchScreen('chavruta-results');
    
    // אתחול המסננים ורינדור הדף
    resetChavrutaFilters();
}

function closeChavrutaModal() {
    const modal = document.getElementById('chavrutaModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function findNewChavruta() {
    const bookName = await customPrompt("לאיזה ספר תרצה לחפש חברותא?");
    if (bookName && bookName.trim() !== '') {
        await openChavrutaSearch(bookName.trim());
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
            subscription: currentUser.subscription,
            lastSeen: new Date().toISOString() // For 'me', last seen is now
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

    // --- Populate Header ---
    document.getElementById('modalUserName').innerText = user.name;
    document.getElementById('modalUserRank').innerHTML = `<i class="fas fa-medal" style="margin-left: 5px;"></i> דרגה: ${getRankName(user.learned)}`;
    document.getElementById('modalUserAge').innerText = user.age ? `גיל: ${user.age}` : '';

    // --- Subscription & Avatar Aura ---
    const subDiv = document.getElementById('modalUserSubscription');
    const avatarDiv = document.getElementById('modalUserAvatar');
    avatarDiv.className = 'relative mb-4'; // Reset aura
    subDiv.innerHTML = '';

    if (user.subscription && user.subscription.level > 0) {
        const tier = SUBSCRIPTION_TIERS.find(t => t.level === user.subscription.level);
        const color = tier ? tier.color : 'gold';
        
        subDiv.innerHTML = `<div class="subscription-badge" style="background:${color}20; color:${color}; border:1px solid currentColor;"><i class="fas fa-crown"></i> ${user.subscription.name}</div>`;
        
        // Apply aura to the avatar container
        avatarDiv.classList.add(`aura-lvl-${user.subscription.level}`, 'aura-base');
        avatarDiv.style.borderRadius = '50%'; // Ensure roundness for aura effect
    }

    // --- Contact Info & Privacy ---
    const contactContainer = document.getElementById('modalContactInfo');
    const showFullDetails = (uid === 'me' || approvedPartners.has(user.email));
    let contactHtml = '';

    // City (always visible)
    contactHtml += `
        <div class="flex items-center gap-3 text-gray-500 dark:text-slate-400 text-sm">
            <i class="fas fa-map-marker-alt text-yellow-500"></i>
            <span class="font-semibold text-gray-800 dark:text-white">עיר:</span>
            <span>${user.city || 'לא צוין'}</span>
        </div>`;

    // Last Seen (always visible)
    const lastSeenText = user.lastSeen ? timeAgo(user.lastSeen) : 'לא ידוע';
    const lastSeenTitle = user.lastSeen ? formatHebrewDate(user.lastSeen) : '';

    contactHtml += `
        <div class="flex items-center gap-3 text-gray-500 dark:text-slate-400 text-sm" title="${lastSeenTitle}">
            <i class="fas fa-history text-yellow-500"></i>
            <span class="font-semibold text-gray-800 dark:text-white">פעילות אחרונה:</span>
            <span>${lastSeenText}</span>
        </div>`;

    if (showFullDetails) {
        contactHtml += `
            <div class="flex items-center gap-3 text-gray-500 dark:text-slate-400 text-sm">
                <i class="fas fa-phone text-green-500"></i>
                <span class="font-semibold text-gray-800 dark:text-white">טלפון:</span>
                <a class="text-green-600 font-bold hover:underline" href="tel:${user.phone || ''}">${user.phone || 'לא הוזן'}</a>
            </div>
            ${user.address ? `
            <div class="flex items-center gap-3 text-gray-500 dark:text-slate-400 text-sm">
                <i class="fas fa-home text-yellow-500"></i>
                <span class="font-semibold text-gray-800 dark:text-white">כתובת:</span>
                <span>${user.address}</span>
            </div>` : ''}
        `;
    } else {
        contactHtml += `
            <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 text-center text-xs text-slate-500">
                <i class="fas fa-lock"></i> הטלפון והכתובת חסויים.<br>
                <small>הפרטים ייחשפו לאחר אישור חברותא הדדי.</small>
            </div>
        `;
    }

    // כפתור מעקב
    if (user.email !== currentUser.email) {
        contactHtml += `
            <button id="followBtn" class="w-full mt-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-sm ${isFollowing ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-yellow-500/90 hover:bg-yellow-500 text-white'}" onclick="toggleFollow('${user.email}')">
                ${isFollowing ? '<i class="fas fa-user-minus"></i> הסר עוקב' : '<i class="fas fa-user-plus"></i> עקוב'}
            </button>`;
    }
    contactContainer.innerHTML = contactHtml;

    // --- Book Lists ---
    const booksContainer = document.getElementById('modalUserBooks');
    const archiveContainer = document.getElementById('modalUserArchive');
    const archiveSection = document.getElementById('modalArchiveSection');

    booksContainer.innerHTML = '';
    archiveContainer.innerHTML = '';

    // Active books
    if (!user.books || user.books.length === 0) {
        booksContainer.innerHTML = '<div class="text-center text-sm text-slate-500 p-4">לא לומד ספרים כרגע</div>';
    } else {
        user.books.forEach(b => {
            let statusHtml = '';
            const isChavruta = chavrutaConnections.some(c => c.email === user.email && c.book === b);

            if (isChavruta) {
                statusHtml = `<span class="bg-green-50 text-green-600 text-xs px-2 py-0.5 rounded-md">חברותא ✓</span>`;
            } else if (user.id !== 'me') {
                const isPending = pendingSentRequests.some(r => r.receiver === user.email && r.book === b);
                if (isPending) {
                    statusHtml = `<span class="text-xs text-orange-500">(בקשה נשלחה)</span>`;
                } else {
                    statusHtml = `
                     <button class="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded-md flex items-center gap-1 hover:bg-blue-100" onclick="checkAndSendRequest('${user.email}', '${b}', this)">
                        <i class="fas fa-paper-plane" style="font-size: 0.65rem;"></i> שלח בקשה
                     </button>`;
                }
            }

            booksContainer.innerHTML += `
                <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-sm">
                    <span class="text-gray-800 dark:text-white font-semibold">${b}</span>
                    ${statusHtml}
                </div>
            `;
        });
    }

    // הצגת ארכיון (ספרים שהושלמו)
    if (user.completedBooks && user.completedBooks.length > 0) {
        archiveSection.style.display = 'block';
        user.completedBooks.forEach(b => {
            archiveContainer.innerHTML += `
                <li class="flex items-center gap-3 p-3 bg-gray-50/50 dark:bg-slate-800/50 rounded-xl text-gray-500 dark:text-slate-400 text-sm border border-transparent hover:border-green-100 transition-colors">
                    <div class="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm">
                        <i class="fas fa-book h-4 w-4 text-gray-400"></i>
                    </div>
                    <span class="font-medium">${b}</span>
                    <span class="mr-auto text-green-500">
                        <i class="fas fa-check-circle"></i>
                    </span>
                </li>
            `;
        });
    } else {
        archiveSection.style.display = 'none';
    }

    document.getElementById('userModal').style.display = 'flex';
    bringToFront(document.getElementById('userModal'));
}

async function checkAndSendRequest(email, book, btnElement) {
    if (!requireAuth()) return;
    const amILearning = userGoals.some(g => g.bookName === book && g.status === 'active');
    if (!amILearning) {
        showToast(`עליך ללמוד את "${book}" כדי לשלוח בקשה.`, "error");
        return;
    }

    if(btnElement) btnElement.disabled = true;

    const success = await sendChavrutaRequest(email, book);

    if (success && btnElement) {
        btnElement.outerHTML = `<span class="text-xs text-orange-500">(בקשה נשלחה)</span>`;
        // Add to local state to persist until next sync
        pendingSentRequests.push({ receiver: email, book: book, created_at: new Date().toISOString() });
    } else if (btnElement) {
        btnElement.disabled = false;
    }
}

async function toggleFollow(targetEmail) {
    if (!requireAuth()) return;
    const btn = document.getElementById('followBtn');
    if (!btn) return;
    const isFollowing = btn.innerHTML.includes('הסר עוקב');

    try {
        if (isFollowing) {
            await supabaseClient.from('user_followers').delete().eq('follower_email', currentUser.email).eq('following_email', targetEmail);
            btn.innerHTML = '<i class="fas fa-user-plus"></i> עקוב';
            btn.className = 'w-full mt-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-sm bg-yellow-500/90 hover:bg-yellow-500 text-white';
            showToast("הסרת עוקב", "info");
        } else {
            await supabaseClient.from('user_followers').insert([{ follower_email: currentUser.email, following_email: targetEmail }]);
            btn.innerHTML = '<i class="fas fa-user-minus"></i> הסר עוקב';
            btn.className = 'w-full mt-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all text-sm bg-gray-200 hover:bg-gray-300 text-gray-700';
            showToast("אתה עוקב כעת!", "success");
        }
        updateFollowersCount(); // Update the count in the header dropdown
    } catch (e) {
        console.error(e);
        showToast("שגיאה בעדכון עוקב", "error");
    }
}

async function showFollows() {
    const modal = document.getElementById('followersModal');
    modal.style.display = 'flex';
    bringToFront(modal);

    // The tabs are now part of the HTML, so we just need to trigger the first render.
    // The `renderFollowsList` will handle the active state of the button.
    renderFollowsList('followers', document.querySelector('#followers-tabs button:first-child'));
}

async function renderFollowsList(type, tabEl) {
    if (tabEl) {
        // New tab styling
        document.querySelectorAll('#followers-tabs button').forEach(t => {
            t.classList.remove('bg-amber-400', 'text-white', 'shadow-md', 'dark:bg-amber-400', 'dark:text-slate-900');
            t.classList.add('text-slate-500', 'dark:text-slate-400');
        });
        tabEl.classList.add('bg-amber-400', 'text-white', 'shadow-md', 'dark:bg-amber-400', 'dark:text-slate-900');
        tabEl.classList.remove('text-slate-500', 'dark:text-slate-400');
    }

    const listArea = document.getElementById('follows-list-area');
    listArea.innerHTML = '<div class="text-center p-5 text-slate-400">טוען...</div>';

    const { data, error } = await supabaseClient.from('user_followers').select(type === 'followers' ? 'follower_email' : 'following_email').eq(type === 'followers' ? 'following_email' : 'follower_email', currentUser.email);

    if (error || !data || data.length === 0) {
        listArea.innerHTML = `<div class="text-center p-10 text-slate-500">אין ${type === 'followers' ? 'עוקבים' : 'נעקבים'} בקטגוריה זו.</div>`;
        return;
    }

    const emails = data.map(item => type === 'followers' ? item.follower_email : item.following_email);
    
    const { data: users, error: usersError } = await supabaseClient
        .from('users')
        .select('display_name, email, subscription')
        .in('email', emails);

    if (usersError) {
        listArea.innerHTML = `<div class="text-center p-10 text-red-500">שגיאה בטעינת משתמשים.</div>`;
        return;
    }

    if (!users || users.length === 0) {
        listArea.innerHTML = `<div class="text-center p-10 text-slate-500">לא נמצאו פרטי משתמשים.</div>`;
        return;
    }

    let html = '';
    users.forEach(u => {
        const subLevel = u.subscription?.level || 0;
        const isSub = subLevel > 0;
        const tier = isSub ? SUBSCRIPTION_TIERS.find(t => t.level === subLevel) : null;
        const glowColor = tier ? tier.color : '#a855f7'; // default purple

        const avatarGlowStyle = isSub ? `border: 2px solid ${glowColor}; box-shadow: 0 0 15px ${glowColor}4D;` : '';
        const cardGlowClass = isSub ? 'border-2' : 'border border-slate-200 dark:border-slate-700';
        const cardGlowStyle = isSub ? `border-color: ${glowColor}33; background-color: ${glowColor}0D;` : '';

        html += `
        <div class="user-card ${cardGlowClass} rounded-2xl p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors" style="${cardGlowStyle}" onclick="closeModal(); showUserDetails('${u.email}')">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-400" style="${avatarGlowStyle}">
                    <i class="fas fa-user text-xl"></i>
                </div>
                <div class="flex flex-col">
                    <span class="font-bold text-slate-800 dark:text-white text-base">${u.display_name || u.email.split('@')[0]}</span>
                    <span class="text-xs text-slate-500 dark:text-slate-400">${u.email}</span>
                </div>
            </div>
        </div>
        `;
    });
    listArea.innerHTML = html;
}

async function checkAndSendRequest(email, book) {
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
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


function switchScreen(name, el) {
    if (name === 'chats' && !requireAuth()) return;

    // איפוס תצוגת הוספה למצב ברירת מחדל (תפריט)
    if (name === 'add') {
        showAddSection('menu');
    }

    // טיפול במצב ניהול
    const headerTitle = document.getElementById('headerTitle');
    const bottomNav = document.querySelector('.floating-nav-container');
    const headerEmail = document.getElementById('headerUserEmail');
    const spacer = document.getElementById('bottom-spacer');
    const container = document.querySelector('.container');
    
    // איפוס סגנונות קונטיינר למצב רגיל
    container.style.maxWidth = '';
    container.style.margin = '';
    container.style.padding = '';
    container.style.height = '';
    container.style.overflow = '';
    document.body.style.paddingBottom = '';
    if (name === 'admin') {
        isAdminMode = true;
        container.style.maxWidth = '100%';
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.height = 'calc(100vh - 65px)'; // גובה מלא פחות האדר
        container.style.overflow = 'hidden';

        bottomNav.classList.add('nav-hidden');
        if (spacer) spacer.style.display = 'none';
        headerTitle.innerHTML = 'בית המדרש - <span style="color:#f59e0b;">מצב ניהול</span>';
        headerEmail.innerHTML = '<button class="btn" style="padding:4px 10px; font-size:0.8rem; background:#334155;" onclick="switchScreen(\'dashboard\', document.querySelector(\'.nav-item\'))">יציאה מניהול</button>';
    } else {
        isAdminMode = false;
        headerTitle.innerText = 'בית המדרש';
        document.getElementById('bot-mode-indicator').style.display = 'none';
        // אם אנחנו מחוברים כבוט, נציג כפתור חזרה
        if (realAdminUser) {
            document.getElementById('bot-mode-indicator').style.display = 'block';
            headerEmail.innerHTML = ''; // Hide text but keep element for layout
        } else {
            headerEmail.style.display = 'block';
            headerEmail.innerText = currentUser ? (currentUser.displayName || currentUser.email) : 'לא מחובר';
        }

        if (name === 'chats') {
            bottomNav.classList.add('nav-hidden');
            if (spacer) spacer.style.display = 'none';
            headerEmail.innerHTML = `<button class="btn-back" onclick="switchScreen('dashboard', document.querySelector('.floating-nav-item'))"><i class="fas fa-arrow-left"></i> יציאה מהצ'אטים</button>`;
            container.style.maxWidth = 'calc(100% - 2rem)'; // כמעט רוחב מלא
            container.style.margin = '0 auto';
            container.style.height = 'calc(100vh - 67px)';
            container.style.overflow = 'hidden';
            document.body.style.paddingBottom = '0';
        } else {
            bottomNav.classList.remove('nav-hidden');
            if (spacer) spacer.style.display = 'block';
        }
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
    if (name === 'shop') renderShop();
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
        badge.style.display = 'flex';
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
    div.className = 'glass rounded-super p-6 transition-all hover:shadow-2xl hover:translate-y-[-2px] border border-white/50 dark:border-slate-700/40 mb-4';

    // חישוב אחוזים
    const percent = Math.min(100, Math.round((goal.currentUnit / goal.totalUnits) * 100));

    let html = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="flex-1">
            <div class="flex items-center gap-4 mb-2">
                <div class="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl">
                    <i class="fas fa-book"></i>
                </div>
                <div>
                    <h3 class="text-lg font-bold">${goal.bookName}</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${unitToDafString(goal)}</p>
                </div>
            </div>
            <div class="mt-4">
                <div class="flex justify-between text-xs mb-2 px-1">
                    <span class="text-slate-400">${goal.totalUnits - goal.currentUnit} עמודים לסיום</span>
                    <span class="font-bold text-primary">${percent}%</span>
                </div>
                <div class="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full progress-gradient rounded-full" style="width: ${percent}%"></div>
                </div>
            </div>
        </div>
        <div class="flex items-center justify-between md:justify-end gap-3">
            <div class="flex items-center gap-2">
                <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="deleteGoal('${goal.id}')" title="מחק">
                    <i class="fas fa-trash-alt"></i>
                </button>
                <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="openNotes('${goal.id}')" title="הערות">
                    <i class="fas fa-sticky-note"></i>
                </button>
                <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="openBookChat('${goal.bookName}')" title="צ'אט">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="w-10 h-10 rounded-full glass hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center text-slate-500 dark:text-slate-400" onclick="openChavrutaSearch('${goal.bookName}')" title="מצא חברותא">
                    <i class="fas fa-user-plus"></i>
                </button>
            </div>
            <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
                <button class="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-slate-600 dark:text-slate-300" onclick="updateProgress(${goal.id}, -1)">
                    <i class="fas fa-minus"></i>
                </button>
                <button class="w-10 h-10 rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all" onclick="updateProgress(${goal.id}, 1)">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
    </div>`;

    if (!isActive) {
        html += `<div style="text-align:center; color:var(--success); font-weight:bold;">הושלם! <i class="fas fa-check"></i></div>`;
    }

    div.innerHTML = html;
    container.appendChild(div);
}

function toGematria(num) {
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
    let result = str.replace(/יה/g, 'טו').replace(/יו/g, 'טז');

    if (result.length > 1) {
        result = result.slice(0, -1) + '"' + result.slice(-1);
    } else if (result.length === 1) {
        result += "'";
    }

    return result;
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

    const modalContent = document.querySelector('#notesModal .modal-content');
    
    // ניקוי קונטיינר ישן אם קיים
    const container = document.getElementById('notesContainer');
    if (container) container.remove();

    // שימוש ב-iframe לטעינת notes.html
    let frame = document.getElementById('notesFrame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'notesFrame';
        frame.style.cssText = "width:100%; height:100%; border:none; border-radius: 16px;";
        modalContent.appendChild(frame);
    }
    frame.style.display = 'block';
    frame.src = 'notes.html';

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
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
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
        const dafStringEl = goalCard.querySelector('p.text-sm.text-slate-500');
        if (dafStringEl) dafStringEl.innerText = unitToDafString(goal);

        // עדכון טקסט עמודים לסיום
        const remainingEl = goalCard.querySelector('.flex.justify-between.text-xs span.text-slate-400');
        if (remainingEl) remainingEl.innerText = `${goal.totalUnits - goal.currentUnit} עמודים לסיום`;

        // עדכון טקסט אחוזים
        const percentTextEl = goalCard.querySelector('.font-bold.text-primary');
        if (percentTextEl) percentTextEl.innerText = `${percent}%`;

        // עדכון פס התקדמות
        const progressBarEl = goalCard.querySelector('.progress-gradient');
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
    if (!requireAuth()) return;
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

// === לוגיקת דף תוצאות חברותא ===
let currentChavrutaSearchResults = [];
let currentSearchBook = '';
let activeAgeFilter = null;

function renderChavrutaResultsPage() {
    const container = document.getElementById('chavrutaResultsPageContainer');
    const countLabel = document.getElementById('resultsCountLabel');
    const userCityDisplay = document.getElementById('userCityDisplay');
    
    if (currentUser && currentUser.city) {
        userCityDisplay.innerText = currentUser.city;
    } else {
        userCityDisplay.innerText = 'לא מוגדר';
    }

    let filtered = [...currentChavrutaSearchResults];

    // סינון: הצג רק משתמשים שלומדים את אותו הספר
    if (currentSearchBook) {
        filtered = filtered.filter(u => u.books && u.books.includes(currentSearchBook));
    }

    // סינון לפי גיל
    if (activeAgeFilter) {
        filtered = filtered.filter(u => u.age && u.age >= activeAgeFilter.min && u.age <= activeAgeFilter.max);
    }

    // סינון לפי עיר
    const sameCity = document.getElementById('filterSameCity').checked;
    if (sameCity && currentUser && currentUser.city) {
        filtered = filtered.filter(u => u.city && u.city.trim() === currentUser.city.trim());
    }

    // סינון לפי היסטוריית לימוד
    const historyFilter = document.getElementById('filterHistory').checked;
    if (historyFilter) {
        filtered = filtered.filter(u => chavrutaConnections.some(c => c.email === u.email));
    }

    countLabel.innerText = `(${filtered.length} חברותות נמצאו)`;
    container.innerHTML = '';

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#94a3b8; padding:50px;">יש כאן חפצא (חיפוש), אבל אין גברא (חברותא)... נסה להסיר כמה מגבלות, אולי החברותא שלך מסתתר מאחורי סינון אחר.</div>`;
        return;
    }

    filtered.forEach(user => {
        const displayName = user.isAnonymous ? "לומד אנונימי" : (user.display_name || user.name || "לומד");
        const badge = getUserBadgeHtml(user);
        const matchPercent = Math.min(100, Math.round((user.matchScore / 300) * 100)); // נרמול ל-100% בערך
        const dashOffset = 213.6 - (213.6 * matchPercent) / 100;

        const card = document.createElement('div');
        card.className = "bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow relative overflow-hidden group";
        card.innerHTML = `
            <div class="absolute right-0 top-0 bottom-0 w-1.5 bg-amber-500 rounded-r-full"></div>
            <div class="flex-shrink-0 flex flex-col items-center cursor-pointer" onclick="showUserDetails('${user.email}')">
                <div class="relative w-24 h-24 mb-3">
                    <div class="w-full h-full rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-4xl text-slate-400">
                        ${user.isAnonymous ? '<i class="fas fa-user-secret"></i>' : '<i class="fas fa-user"></i>'}
                    </div>
                    ${user.lastSeen && (new Date() - new Date(user.lastSeen) < 5 * 60 * 1000) ?
                    '<div class="absolute -bottom-2 -left-2 bg-green-500 w-4 h-4 rounded-full border-2 border-white dark:border-slate-800 shadow-sm"></div>' : ''}
                </div>
                <div class="text-center">
                    <h3 class="font-bold text-lg leading-tight">${displayName} ${badge}</h3>
                    <p class="text-slate-500 dark:text-slate-400 text-sm">${user.city || 'לא צוין'}</p>
                </div>
            </div>
            <div class="flex-1 space-y-4">
                <div class="flex flex-wrap gap-2">
                    ${user.age ? `<span class="bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full text-xs font-medium">גיל: ${user.age}</span>` : ''}
                    <span class="bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full text-xs font-medium">לומד: ${currentSearchBook}</span>
                    <span class="bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded-full text-xs font-medium">דרגה: ${getRankName(user.learned)}</span>
                </div>
                <p class="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                    ${user.isAnonymous ? 'משתמש זה בחר להישאר אנונימי.' : 'מחפש חברותא ללימוד משותף.'}
                </p>
                <div class="flex items-center gap-4 pt-2">
                    <button class="bg-amber-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/20" onclick="sendChavrutaRequest('${user.email}', '${currentSearchBook}')">שלח בקשת חברותא</button>
                </div>
            </div>
            <div class="flex-shrink-0 flex flex-col items-center justify-center px-4 border-r border-slate-100 dark:border-slate-700">
                <div class="relative w-20 h-20 flex items-center justify-center">
                    <svg class="w-full h-full transform -rotate-90">
                        <circle class="text-slate-100 dark:text-slate-700" cx="40" cy="40" fill="transparent" r="34" stroke="currentColor" stroke-width="6"></circle>
                        <circle class="text-amber-500 rounded-full" cx="40" cy="40" fill="transparent" r="34" stroke="currentColor" stroke-dasharray="213.6" stroke-dashoffset="${dashOffset}" stroke-width="6"></circle>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-xl font-black text-amber-500">${matchPercent}%</span>
                        <span class="text-[10px] text-slate-400 font-medium">התאמה</span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function filterChavrutaByAge(min, max, btn) {
    activeAgeFilter = { min, max };
    document.querySelectorAll('.filter-age-btn').forEach(b => b.classList.replace('bg-amber-500', 'bg-slate-100'));
    document.querySelectorAll('.filter-age-btn').forEach(b => b.classList.replace('text-white', 'text-slate-600'));
    
    btn.classList.replace('bg-slate-100', 'bg-amber-500');
    btn.classList.replace('text-slate-600', 'text-white');
    renderChavrutaResultsPage();
}

function toggleCustomCheckbox(id) {
    const input = document.getElementById(id);
    input.checked = !input.checked;
    updateCustomCheckboxVisual(id);
    renderChavrutaResultsPage();
}

function updateCustomCheckboxVisual(id) {
    const input = document.getElementById(id);
    const visual = document.getElementById('visual-' + id);
    const icon = visual.querySelector('span');
    
    if (input.checked) {
        visual.classList.remove('border-slate-300', 'dark:border-slate-600');
        visual.classList.add('bg-amber-500', 'border-amber-500');
        icon.classList.remove('hidden');
    } else {
        visual.classList.add('border-slate-300', 'dark:border-slate-600');
        visual.classList.remove('bg-amber-500', 'border-amber-500');
        icon.classList.add('hidden');
    }
}

function resetChavrutaFilters() {
    activeAgeFilter = null;
    document.getElementById('filterSameCity').checked = false;
    updateCustomCheckboxVisual('filterSameCity');
    document.getElementById('filterHistory').checked = false;
    updateCustomCheckboxVisual('filterHistory');
    document.querySelectorAll('.filter-age-btn').forEach(b => b.classList.replace('bg-amber-500', 'bg-slate-100'));
    document.querySelectorAll('.filter-age-btn').forEach(b => b.classList.replace('text-white', 'text-slate-600'));
    renderChavrutaResultsPage();
}

async function sendSuggestion() {
    if (!requireAuth()) return;
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
    overlay.className = 'thank-you-overlay fixed inset-0 flex items-center justify-center z-[9999] p-4';
    overlay.innerHTML = `
        <div class="animate-popup bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden relative border border-white" style="box-shadow: 0 20px 50px rgba(0,0,0,0.1);">
            <!-- Top Decorative Bar (Dash Style) -->
            <div class="p-8 md:p-12 flex flex-col items-center text-center">
                <!-- Success Icon/Illustration -->
                <div class="mb-6 bg-yellow-50 rounded-full p-4">
                    <svg class="h-16 w-16 text-[#fbbd08]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                    </svg>
                </div>
                <!-- Main Heading -->
                <h1 class="text-5xl font-extrabold text-gray-800 mb-4 tracking-tight">
                    שכוייח!
                </h1>
                <!-- Content Text -->
                <div class="space-y-2 mb-10">
                    <p class="text-xl text-gray-600 font-medium">
                        הקבלה נשלחה אליך למייל
                    </p>
                    <p class="text-lg text-gray-500">
                        והזכויות נשלחו הישר לכיסא הכבוד!
                    </p>
                </div>
                <!-- Action Button -->
                <button class="w-full py-4 bg-[#1e293b] text-white rounded-2xl text-xl font-bold hover:bg-slate-800 transition-colors shadow-lg active:transform active:scale-95" onclick="closeThankYou(this)">
                    תזכו למצוות
                </button>
            </div>
            <!-- Sparkle Ornaments (Dashboard Style) -->
            <div class="absolute top-6 right-8 text-[#fbbd08] opacity-50">
                <svg fill="currentColor" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M12,2L10.5,8.5L4,10L10.5,11.5L12,18L13.5,11.5L20,10L13.5,8.5L12,2Z"></path></svg>
            </div>
            <div class="absolute bottom-10 left-8 text-[#fbbd08] opacity-30 transform rotate-45">
                <svg fill="currentColor" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M12,2L10.5,8.5L4,10L10.5,11.5L12,18L13.5,11.5L20,10L13.5,8.5L12,2Z"></path></svg>
            </div>
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
    if (!requireAuth()) return;
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
    
    // Header
    let html = `
    <div class="flex items-center gap-3 mb-6 justify-start">
        <h2 class="text-2xl font-bold text-gray-800 dark:text-white m-0">לוח זמנים שבועי</h2>
        <div class="text-blue-900 dark:text-blue-400">
            <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
        </div>
    </div>
    <div class="space-y-6">
    `;

    const schedules = JSON.parse(localStorage.getItem('chavruta_schedules') || '{}');
    const daysMap = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

    let hasEvents = false;
    for (let i = 0; i < 6; i++) {
        const dayItems = Object.values(schedules).filter(s => s.days.includes(i.toString()));
        dayItems.sort((a, b) => a.time.localeCompare(b.time));

        if (dayItems.length > 0) {
            hasEvents = true;
            html += `
            <section class="bg-white dark:bg-slate-800 rounded-2xl p-6 soft-shadow">
                <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-100 dark:border-slate-700 pb-2">יום ${daysMap[i]}</h3>
                <div class="space-y-3">
            `;
            dayItems.forEach(item => {
                html += `
                <div class="day-strip bg-blue-50/50 dark:bg-slate-700/50 p-4 rounded-lg flex justify-between items-center">
                    <span class="text-gray-500 dark:text-gray-300 font-medium">${item.time}</span>
                    <span class="text-blue-900 dark:text-blue-300 font-semibold">עם ${item.partnerName} (${item.book})</span>
                </div>
                `;
            });
            html += `</div></section>`;
        }
    }
    if (!hasEvents) html += '<div style="text-align:center; color:#94a3b8; padding:20px;">אין זמני לימוד קבועים.</div>';
    
    html += '</div>';
    container.innerHTML = html;
}

async function cancelChavruta(partnerEmail) {
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
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

                // My sent request was approved
                if (payload.eventType === 'UPDATE' && newItem.status === 'approved' && oldItem.status === 'pending' && newItem.sender_email === currentUser.email) {
                    const receiverUser = globalUsersData.find(u => u.email === newItem.receiver_email);
                    const receiverName = receiverUser ? receiverUser.name : newItem.receiver_email;
                    addNotification(`🎉 בקשת החברותא שלך עם ${receiverName} על הספר "${newItem.book_name}" אושרה!`);
                    showToast(`החברותא עם ${receiverName} אושרה!`, "success");
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
    // Do not reset if only a modifier key is pressed
    if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta') {
        return;
    }

    if (e.key === 'Escape') {
        keySequence = [];
        return;
    }

    if (!e.altKey) {
        keySequence = [];
    }

    if (e.altKey) {
        const k = e.key.toLowerCase();
        if (k.length === 1) e.preventDefault(); // Prevent browser default actions for Alt+key

        keySequence.push(k);

        if (keySequence.length > 5) keySequence.shift();

        const seqStr = keySequence.join('');

        // Admin sequence: Alt + A, R, I
        if (seqStr.endsWith('ari') || seqStr.endsWith('שרן')) {
            keySequence = []; // Reset after successful trigger
            switchScreen('admin');
            renderAdminPanel();
            return;
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

function saveCampaignProgress() {
    const val = document.getElementById('adminCampaignInput').value;
    localStorage.setItem('torahApp_campaign_progress', val);
    customAlert('ההתקדמות עודכנה בהצלחה!');
}

async function sendSystemBroadcast() {
    if (!requireAuth()) return;
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

async function sendAppeal() {
    if (!requireAuth()) return;
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

async function addSiyumReaction(siyumId, btn) {
    if (!requireAuth()) return;
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
    if (!requireAuth()) return;
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

function toggleChatMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('chat-menu-dropdown');
    if (menu) {
        menu.classList.toggle('active');
    }
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

function getRatingRankName(rating) {
    if (rating >= 50000) return "עוקר הרים ומשברם וטוחנן דק דק";
    if (rating >= 10000) return "עוקר הרים";
    if (rating >= 5000) return "רשכבה\"ג";
    if (rating >= 3500) return "אב בי\"ד";
    if (rating >= 1800) return "דיין מומחה";
    if (rating >= 1000) return "דיין";
    if (rating >= 750) return "רב עיר";
    if (rating >= 500) return "רב שכונה";
    if (rating >= 300) return "מו\"צ";
    if (rating >= 150) return "רב";
    if (rating >= 50) return "אברך";
    return "מתחיל";
}

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
    
    // חישוב דרגת רייטינג
    const ratingRank = getRatingRankName(rating);
    const ratingThresholds = [50, 150, 300, 500, 750, 1000, 1800, 3500, 5000, 10000, 50000];
    let nextRatingThreshold = 50000;
    let nextRatingRankName = "";
    
    for (let t of ratingThresholds) {
        if (rating < t) {
            nextRatingThreshold = t;
            nextRatingRankName = getRatingRankName(t);
            break;
        }
    }
    const ratingRemaining = Math.max(0, nextRatingThreshold - rating);
    const ratingProgress = rating >= 50000 ? 100 : (rating / nextRatingThreshold) * 100;

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
                <strong>רייטינג: ${ratingRank}</strong>
                <span>${rating} נקודות</span>
            </div>
            <div class="progress-container" style="height:15px; background:#e2e8f0;">
                <div class="progress-bar" style="width:${ratingProgress}%; background: linear-gradient(90deg, #ec4899, #8b5cf6);"></div>
            </div>
            <div style="text-align:center; font-size:0.9rem; color:#64748b; margin-top:5px;">
                ${rating < 50000 ? `עוד ${ratingRemaining} נקודות לדרגת ${nextRatingRankName}` : 'הגעת לפסגת הרייטינג!'}
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

function toHebrewDateString(dateString) {
    if (!dateString) return 'תאריך לא ידוע';
    try {
        const date = new Date(dateString);
        // Using Intl for proper Hebrew calendar conversion
        const day = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' }).format(date);
        const month = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' }).format(date);
        const year = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric' }).format(date);

        const hebrewDay = toGematria(parseInt(day));
        // Extract year letters from "ה'תשפ"ו" -> "תשפ"ו"
        const hebrewYear = year.split("'")[1] || year;

        return `${hebrewDay} ${month} ${hebrewYear}`;
    } catch (e) {
        return 'תאריך לא תקין';
    }
}

function showCompletions() {
    const modal = document.getElementById('completionsModal');
    const list = document.getElementById('completionsList');
    if (!modal || !list) return;

    const completedGoals = userGoals.filter(g => g.status === 'completed');
    list.innerHTML = '';

    if (completedGoals.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:#94a3b8;">עדיין לא סיימת אף ספר. בהצלחה בהמשך!</p>';
    } else {
        completedGoals.sort((a, b) => new Date(b.completedDate || 0) - new Date(a.completedDate || 0));

        completedGoals.forEach(goal => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; justify-content:space-between; padding: 8px 4px; border-bottom: 1px solid #f1f5f9;';
            item.innerHTML = `
                <span style="font-weight:bold;">${goal.bookName}</span>
                <span style="color:#64748b;">${toHebrewDateString(goal.completedDate)}</span>
            `;
            list.appendChild(item);
        });
    }

    modal.style.display = 'flex';
    bringToFront(modal);
}