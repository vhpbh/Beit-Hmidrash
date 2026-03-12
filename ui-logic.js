function closeSearchDropdown() {
    document.getElementById('searchDropdown').classList.remove('active');
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

function toggleSearchTag(tagId) {
    document.getElementById(`search-tag-${tagId}`).classList.toggle('active');
    // Re-run search with new filters
    executeGeneralSearch();
}

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

function toggleLeaderboardSort(sortType) {
    currentLeaderboardSort = sortType;
    document.getElementById('sort-learned-btn').className = sortType === 'learned' ? 'lb-tab-btn active' : 'lb-tab-btn';
    document.getElementById('sort-rating-btn').className = sortType === 'rating' ? 'lb-tab-btn active' : 'lb-tab-btn';
    renderLeaderboard();
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

