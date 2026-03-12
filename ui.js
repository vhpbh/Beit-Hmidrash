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

    // 1.5. הוספת מודאל סיומים
    if (!document.getElementById('completionsModal')) {
        const completionsModal = document.createElement('div');
        completionsModal.id = 'completionsModal';
        completionsModal.className = 'modal-overlay';
        completionsModal.style.display = 'none';
        completionsModal.onclick = (e) => { if (e.target === completionsModal) closeModal(); };
        completionsModal.innerHTML = `
            <div class="modal-content">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="margin:0;">הספרים שסיימתי</h3>
                    <i class="fas fa-times" style="cursor:pointer;" onclick="closeModal()"></i>
                </div>
                <div id="completionsList" style="max-height: 60vh; overflow-y: auto;"></div>
            </div>
        `;
        document.body.appendChild(completionsModal);
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
            <div class="profile-menu-item" onclick="toggleProfileMenu(); showFollows();">
                <i class="fas fa-users"></i> עוקבים
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
                <span id="profileAdminBadge" class="unread-badge" style="display: none; margin-right: auto;">0</span>
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

    // 8. הוספת תיקון CSS למצב לילה בצ'אט
    if (!document.getElementById('dark-mode-chat-fix')) {
        const style = document.createElement('style');
        style.id = 'dark-mode-chat-fix';
        style.innerHTML = `
            body.dark-mode .msg-other {
                background-color: #334155;
                color: #f1f5f9;
            }
            body.dark-mode .msg-other .msg-sender-name {
                color: #93c5fd;
            }
            body.dark-mode .msg-me {
                background-color: #3730a3;
                color: #e0e7ff;
            }
            body.dark-mode .chat-quote {
                background-color: rgba(200, 200, 255, 0.1);
                border-left-color: #a5b4fc;
                color: #e2e8f0;
            }
        `;
        document.head.appendChild(style);
    }

    // 11. הוספת אנימציות ושיפורי עיצוב
    if (!document.getElementById('app-ui-improvements')) {
        const uiStyle = document.createElement('style');
        uiStyle.id = 'app-ui-improvements';
        uiStyle.innerHTML = `
            /* 1. אנימציה להופעת הודעות בצ'אט */
            @keyframes floatIn {
                from { opacity: 0; transform: translateY(15px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .new-message-animation {
                animation: floatIn 0.4s ease-out forwards;
            }

            /* 2. עיצוב מודאל אישור מחיקה */
            #cConfirmMsg {
                margin-bottom: 2rem; /* הרחקת הטקסט מהכפתורים */
            }
            #customConfirmModal .modal-actions {
                display: flex;
                gap: 1rem;
                width: 100%;
            }
            #cConfirmOk, #cConfirmCancel {
                flex: 1; /* גודל זהה */
                padding: 0.75rem 1rem;
                border-radius: 12px; /* פינות מעוגלות */
                font-weight: bold;
                border: none;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            #cConfirmOk {
                background-color: #16a34a; /* ירוק */
                color: white;
            }
            #cConfirmCancel {
                background-color: #ef4444; /* אדום לביטול */
                color: white;
            }

            /* 3. אנימציה לתפריט תחתון */
            .floating-nav-container {
                transition: transform 0.4s ease-in-out, opacity 0.3s ease-in-out;
            }
            .floating-nav-container.nav-hidden {
                transform: translateY(100%);
                opacity: 0;
                pointer-events: none;
            }
        `;
        document.head.appendChild(uiStyle);
    }

    // 9. הסתרת אלמנטים מהדשבורד לבקשת המשתמש
    const rankContainer = document.getElementById('rank-info')?.closest('.card');
    if (rankContainer) rankContainer.style.display = 'none';
    // הרייטינג הוחזר לבקשת המשתמש

    // 10. הפיכת אייקון הספר שבהאדר ללחיץ
    const headerBookIcon = document.querySelector('.header .fa-book-open');
    if (headerBookIcon) {
        headerBookIcon.style.cursor = 'pointer';
        headerBookIcon.onclick = () => switchScreen('dashboard', document.querySelector('.floating-nav-item'));
    }

    // 12. שינוי תווית דפים/פרקים לניקוד בדשבורד
    const pagesStat = document.getElementById('stat-pages');
    if (pagesStat && pagesStat.parentElement) {
        Array.from(pagesStat.parentElement.children).forEach(child => {
            if (child !== pagesStat && (child.innerText.includes('דפים') || child.innerText.includes('פרקים'))) {
                child.innerText = 'ניקוד';
            }
        });
    }
}
