async function searchChats(query) {
    if (!currentUser) return [];
    const { data, error } = await supabaseClient
        .from('chat_messages')
        .select('*')
        // כאן הוספנו בדיקה אם ההודעה היא "כללית" (is_public) או "מזל טוב"
        .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email},receiver_email.is.null,receiver_email.eq.global`)
        .ilike('message', `%${query}%`);

    if (error) {
        console.error("Chat search error:", error);
        return [];
    }
    return data;
}

// === מנגנון Polling (גיבוי לצ'אט) ===
let chatPollInterval = null;

function startChatPolling() {
    if (!chatPollInterval) {
        chatPollInterval = setInterval(pollChats, 3000);
    }
}

async function pollChats() {
    const windows = document.querySelectorAll('.chat-window');
    if (windows.length === 0) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
        return;
    }

    for (const win of windows) {
        const partnerEmail = win.id.replace('chat-window-', '');
        await checkNewMessagesFor(partnerEmail);
    }
}
async function checkNewMessagesFor(partnerEmail) {
    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    let lastTime = new Date(0).toISOString();
    const bubbles = container.querySelectorAll('.message-bubble');
    if (bubbles.length > 0) {
        const lastBubble = bubbles[bubbles.length - 1];
        if (lastBubble.dataset.timestamp) lastTime = lastBubble.dataset.timestamp;
    }

    try {
        let query = supabaseClient.from('chat_messages').select('*');

        if (partnerEmail.startsWith('book:')) {
            query = query.eq('receiver_email', partnerEmail);
        } else {
            query = query.or(`and(sender_email.eq.${partnerEmail},receiver_email.eq.${currentUser.email}),and(sender_email.eq.${currentUser.email},receiver_email.eq.${partnerEmail})`);
        }

        const { data } = await query
            .gt('created_at', lastTime)
            .order('created_at', { ascending: true });

        if (data && data.length > 0) {
            data.forEach(msg => {
                const type = msg.sender_email.toLowerCase() === currentUser.email.toLowerCase() ? 'me' : 'other';
                appendMessageToWindow(partnerEmail, msg.message, type, msg.id, msg.created_at, msg.is_read, msg.sender_email);
                if (type === 'other') {
                    const win = document.getElementById(`chat-window-${partnerEmail}`);
                    if (win && win.classList.contains('minimized')) win.classList.add('flashing');
                    else markAsRead(partnerEmail);
                }
            });
        }
    } catch (e) { console.error("Polling error", e); }
}

// === לוגיקת צ'אט ===
let activeChats = {}; // מעקב אחרי חלונות צ'אט פתוחים

function getCurrentChatEmail() {
    return isAdminMode ? 'admin@system' : currentUser.email;
}

function openBookChat(bookName) {
    openChat('book:' + bookName, 'צ\'אט: ' + bookName);
}

function openChat(partnerEmail, partnerName, startMinimized = false, forceFloating = false) {
    if (!requireAuth()) return;
    // Don't lowercase book IDs as they might contain case sensitive parts or spaces we want to preserve visually, though ID must be safe.
    // For simplicity, we keep email lowercase, but book ID we handle carefully.
    const isBook = partnerEmail.startsWith('book:');
    if (!isBook) partnerEmail = partnerEmail.toLowerCase();

    if (partnerEmail === 'admin@system') {
        partnerName = 'הודעת מנהל';
    }
    if (partnerEmail === 'updates@system') {
        partnerName = 'עדכונים מהנעקבים';
    }

    // If we are in the Chats screen, open it there instead of floating
    if (!forceFloating && document.getElementById('screen-chats').classList.contains('active')) {
        loadChatIntoMainArea(partnerEmail, partnerName);
        return;
    }

    // בדיקה אם החלון כבר קיים
    if (document.getElementById(`chat-window-${partnerEmail}`)) {
        const win = document.getElementById(`chat-window-${partnerEmail}`);
        win.classList.remove('minimized');
        win.querySelector('input')?.focus();
        return;
    }

    // איפוס הודעות שלא נקראו
    if (unreadMessages[partnerEmail]) {
        unreadMessages[partnerEmail] = 0;
        localStorage.setItem('torahApp_unread', JSON.stringify(unreadMessages));
        if (document.getElementById('screen-chavrutas').classList.contains('active')) renderChavrutas();
    }

    const isBlocked = blockedUsers.includes(partnerEmail);
    const blockClass = isBlocked ? 'blocked' : '';
    const blockIconColor = isBlocked ? '#ef4444' : '#ef4444';
    const banIconClass = isBlocked ? 'text-red-500' : 'text-red-400'; // Red by default for visibility
    const isSystem = partnerEmail === 'admin@system';
    const banStyle = (isSystem || isBook) ? 'display:none;' : `color:${blockIconColor}; cursor:pointer;`;

    const chatHtml = `
        <div class="chat-window ${blockClass} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl overflow-hidden flex flex-col" id="chat-window-${partnerEmail}">
            <div class="chat-header bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex justify-between items-center cursor-pointer" onclick="toggleChatWindow('${partnerEmail}')">
                <div class="flex items-center gap-3">
                    ${isBook ? '<i class="fas fa-book"></i>' : `<span class="online-dot" id="online-${partnerEmail}"></span>`}
                    <span class="font-bold text-slate-800 dark:text-white">${partnerName}</span>
                </div>
                <div class="flex items-center gap-3 text-slate-400">
                    <i class="fas fa-ban ${banIconClass} hover:text-red-600 transition-colors" onclick="event.stopPropagation(); openReportModal('${partnerEmail}')" title="דיווח וחסימה" style="${banStyle}" id="block-btn-${partnerEmail}"></i>
                    <i class="fas fa-minus hover:text-slate-600 transition-colors" onclick="event.stopPropagation(); toggleChatWindow('${partnerEmail}')" title="מזער"></i>
                    <i class="fas fa-expand hover:text-slate-600 transition-colors" onclick="event.stopPropagation(); expandChatToScreen('${partnerEmail}', '${partnerName.replace(/'/g, "\\'")}')" title="פתח במסך מלא"></i>
                    <i class="fas fa-times hover:text-slate-600 transition-colors" onclick="event.stopPropagation(); closeChatWindow('${partnerEmail}')"></i>
                </div>
            </div>
            <div class="chat-body">
                <div class="chat-messages-area flex flex-col" id="msgs-${partnerEmail}">
                    <div class="chat-loading-indicator" style="text-align:center; padding:20px; color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i> טוען צ'אט...</div>
                </div>
                <div class="typing-indicator-box" id="typing-${partnerEmail}"></div>
                <footer class="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                    <div class="max-w-5xl mx-auto relative flex items-center gap-3">
                        <input type="text" id="input-${partnerEmail}" class="w-full h-12 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-5 text-sm focus:ring-2 focus:ring-blue-500/50 dark:text-white dark:placeholder-slate-500" placeholder="הקלד הודעה..." 
                        oninput="handleTyping('${partnerEmail}')" 
                        onkeyup="saveChatDraft('${partnerEmail}', this.value)"
                        onkeypress="if(event.key === 'Enter') sendMessage('${partnerEmail}')">
                        <button class="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-slate-800 transition-transform active:scale-95 shadow-md shrink-0" onclick="sendMessage('${partnerEmail}')">
                            <span class="material-icons-round transform -scale-x-100">send</span>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatHtml);
    bringToFront(document.getElementById(`chat-window-${partnerEmail}`)); // הבאה לקדמת המסך
    rearrangeMinimizedWindows();

    // בדיקת סטטוס מחובר
    if (!isBook) {
        const partner = globalUsersData.find(u => u.email === partnerEmail);
        if (partner && partner.lastSeen && (new Date() - new Date(partner.lastSeen) < 5 * 60 * 1000)) {
            document.getElementById(`online-${partnerEmail}`).classList.add('active');
        }
    }

    loadChatHistory(partnerEmail);

    const draft = localStorage.getItem('chat_draft_' + partnerEmail);
    if (draft) document.getElementById('input-' + partnerEmail).value = draft;

    if (startMinimized) {
        const win = document.getElementById(`chat-window-${partnerEmail}`);
        if (win && unreadMessages[partnerEmail] > 0) { // Only flash if there are unread messages
            win.classList.add('minimized');
            win.classList.add('flashing');
            rearrangeMinimizedWindows();
        }
    } else {
        markAsRead(partnerEmail); // סימון הודעות כנקראות רק אם נפתח מלא
    }
    startChatPolling();
}

function expandChatToScreen(email, name) {
    // Close the popup
    closeChatWindow(email);
    // Switch to chats screen
    switchScreen('chats');
    // Load the specific chat
    loadChatIntoMainArea(email, name);
}

let currentChatFilter = 'personal';

async function renderChatList(filter, tabEl, isBackgroundUpdate = false) {
    currentChatFilter = filter;
    const cacheKey = `chatListCache_${filter}`;

    // Handle tab UI
    document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
    if (tabEl && tabEl.classList.contains('chat-tab')) {
        tabEl.classList.add('active');
    }
    // If it's archive, no tab is active, and we can show a title
    if (filter === 'archive') {
        const mainArea = document.getElementById('chat-main-area');
        mainArea.innerHTML = `<div style="margin: auto; color: #94a3b8; text-align: center;"><i class="fas fa-archive" style="font-size: 3rem; opacity: 0.3;"></i><p>ארכיון צ'אטים</p></div>`;
    }

    const container = document.getElementById('chat-list-container');
    if (!isBackgroundUpdate) {
        const cachedHtml = localStorage.getItem(cacheKey);
        if (cachedHtml) {
            container.innerHTML = cachedHtml;
        } else {
            container.innerHTML = '<div class="text-center p-5 text-slate-400">טוען...</div>';
        }
    }

    // Fetch all messages involving me to find unique partners
    const { data } = await supabaseClient.from('chat_messages')
        .select('sender_email, receiver_email, message, created_at, is_read')
        .or(`sender_email.eq.${currentUser.email},receiver_email.eq.${currentUser.email}`)
        .order('created_at', { ascending: false });

    if (!data) {
        const emptyHtml = '<div class="text-center p-5 text-slate-500">אין צ\'אטים.</div>';
        container.innerHTML = emptyHtml;
        localStorage.setItem(cacheKey, emptyHtml);
        return;
    }

    const partners = new Set();
    const chats = [];

    data.forEach(msg => {
        const isMe = msg.sender_email === currentUser.email;
        const partner = isMe ? msg.receiver_email : msg.sender_email;

        if (!partners.has(partner)) {
            partners.add(partner);

            let category;
            if (partner.startsWith('book:')) {
                category = 'public';
            } else if (partner === 'admin@system' || partner === 'updates@system') {
                category = 'other';
            } else if (approvedPartners.has(partner)) {
                category = 'personal';
            } else {
                // This is a chat with a user who is not a book, not system, and not an approved partner.
                category = 'archive';
            }

            if (category === filter) {
                chats.push({
                    email: partner,
                    lastMsg: msg.message,
                    time: msg.created_at,
                    unread: (!isMe && !msg.is_read)
                });
            }
        }
    });

    let newHTML = '';

    // Add Mazal Tov Board item if filter is 'other'
    if (filter === 'other') {
        newHTML += `
            <div class="chat-list-item" onclick="renderMazalTovInMainArea()">
                <div style="width:40px; height:40px; background:#fef3c7; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-left:10px;">
                    <i class="fas fa-glass-cheers" style="color:#d97706;"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-weight:bold;">לוח סיומים (מזל טוב)</div>
                    <div style="font-size:0.85rem; color:#64748b;">חגיגות סיומי מסכת בקהילה</div>
                </div>
            </div>
        `;
    }

    // Ensure system chats are always present in 'other'
    if (filter === 'other') {
        const systemChats = ['admin@system', 'updates@system'];
        systemChats.forEach(sysEmail => {
            if (!chats.some(c => c.email === sysEmail)) {
                chats.push({
                    email: sysEmail,
                    lastMsg: sysEmail === 'admin@system' ? 'הודעות מערכת והנהלה' : 'עדכונים שוטפים',
                    time: new Date().toISOString(),
                    unread: false
                });
            }
        });
    }

    if (chats.length === 0) {
        newHTML = '<div class="text-center p-5 text-slate-400">אין צ\'אטים בקטגוריה זו.</div>';
    } else {

        chats.forEach(chat => {
            const user = globalUsersData.find(u => u.email && chat.email && u.email.toLowerCase() === chat.email.toLowerCase());
            const name = user ? user.name : (chat.email.startsWith('book:') ? chat.email.replace('book:', '') : (chat.email === 'admin@system' ? 'הנהלה' : (chat.email === 'updates@system' ? 'עדכונים מהנעקבים' : chat.email.split('@')[0])));

            const isOnline = user && user.lastSeen && (new Date() - new Date(user.lastSeen) < 5 * 60 * 1000);
            const onlineHtml = isOnline ? `<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block ml-1"></span>` : '';

            const msgDate = new Date(chat.time);
            const now = new Date();
            const isToday = msgDate.toDateString() === now.toDateString();
            const timeDisplay = isToday ? msgDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : msgDate.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

            newHTML += `
            <div class="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer border border-transparent ${chat.unread ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100' : ''}" onclick="loadChatIntoMainArea('${chat.email}', '${name.replace(/'/g, "\\'")}', this)">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                        ${name}
                        ${onlineHtml}
                    </span>
                    <span class="text-xs text-slate-400">${timeDisplay}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 ${chat.unread ? 'font-bold text-slate-800 dark:text-slate-200' : ''}">${chat.lastMsg}</p>
            </div>
        `;
        });
    }

    // Update DOM and cache only if changed
    if (newHTML !== localStorage.getItem(cacheKey)) {
        container.innerHTML = newHTML;
        localStorage.setItem(cacheKey, newHTML);
    }
}
function loadChatIntoMainArea(email, name, el) {
    const main = document.getElementById('chat-main-area');
    main.innerHTML = ''; // Clear current

    // Highlight active chat in sidebar
    document.querySelectorAll('.p-3').forEach(item => item.classList.remove('bg-slate-100', 'dark:bg-slate-800'));
    if (el) {
        el.classList.add('bg-slate-100', 'dark:bg-slate-800');
        el.classList.remove('bg-blue-50', 'dark:bg-blue-900/20'); // Remove unread style
        const dot = el.querySelector('.chat-list-unread-dot');
        if(dot) dot.remove();
    }

    const isBlocked = blockedUsers.includes(email);
    const blockIconColor = isBlocked ? '#ef4444' : '#94a3b8';
    const isBook = email.startsWith('book:');
    const isArchived = !isBook && !email.includes('@system') && !approvedPartners.has(email);
    const isSystem = email === 'admin@system' || email === 'updates@system';
    
    const partner = globalUsersData.find(u => u.email === email);
    const isOnline = partner && partner.lastSeen && (new Date() - new Date(partner.lastSeen) < 5 * 60 * 1000);
    const statusText = isOnline ? 'מחובר כעת' : 'לא מחובר';
    const statusColorClass = isOnline ? 'text-emerald-500' : 'text-red-500';
    const statusDotBgClass = isOnline ? 'bg-emerald-400' : 'bg-red-500';
    const avatarInitial = name.charAt(0);

    // Reuse the chat window HTML structure but adapted for full size
    const chatHtml = `
        <header class="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center px-6 justify-between shadow-sm z-20">
            <div class="flex items-center gap-3">
                <div class="relative">
                    <div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white">${isBook ? '<i class="fas fa-book"></i>' : avatarInitial}</div>
                    ${!isBook ? `<span class="absolute bottom-0 left-0 w-3 h-3 rounded-full ${statusDotBgClass} border-2 border-white dark:border-slate-900"></span>` : ''}
                </div>
                <div class="flex flex-col">
                    <span class="font-bold text-lg leading-tight text-slate-800 dark:text-white">${name}</span>
                    <span class="text-[10px] ${statusColorClass} font-medium">${isBook ? 'צ\'אט ציבורי' : statusText}</span>
                </div>
            </div>
            <div class="flex items-center gap-4">
                ${!isSystem && !isBook ? `<button class="hover:bg-slate-100 p-1.5 rounded-full transition-colors" onclick="openReportModal('${email}')"><span class="material-icons-round text-xl text-slate-500">block</span></button>` : ''}
                <button class="hover:bg-slate-100 p-1.5 rounded-full transition-colors" onclick="minimizeMainChat('${email}', '${name.replace(/'/g, "\\'")}')"><span class="material-icons-round text-xl text-slate-500">open_in_full</span></button>
                <button class="hover:bg-slate-100 p-1.5 rounded-full transition-colors" onclick="closeMainChat()"><span class="material-icons-round text-xl text-rose-400">close</span></button>
            </div>
        </header>
        <div class="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-900/95 flex flex-col" id="msgs-${email}">
            <div class="chat-loading-indicator" style="text-align:center; padding:20px; color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i> טוען צ'אט...</div>
        </div>
        ${isArchived ? `
            <footer class="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div class="text-center text-slate-500 p-2">צ'אט זה בארכיון (לקריאה בלבד).</div>
            </footer>
        ` : `
            <footer class="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                <div class="max-w-5xl mx-auto relative flex items-center gap-3">
                    <input type="text" id="input-${email}" class="w-full h-12 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-5 text-sm focus:ring-2 focus:ring-blue-500/50 dark:text-white dark:placeholder-slate-500" placeholder="הקלד הודעה..." 
                        oninput="handleTyping('${email}')" 
                        onkeypress="if(event.key === 'Enter') sendMessage('${email}')">
                    <button class="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-slate-800 transition-transform active:scale-95 shadow-md shrink-0" onclick="sendMessage('${email}')">
                        <span class="material-icons-round transform -scale-x-100">send</span>
                    </button>
                </div>
            </footer>
        `}
    `;
    main.innerHTML = chatHtml;

    // Load messages
    loadChatHistory(email);

    // Check online status for main header
    markAsRead(email);
}

function closeMainChat() {
    document.getElementById('chat-main-area').innerHTML = `
        <div style="margin: auto; color: #94a3b8; text-align: center;">
            <i class="fas fa-comments" style="font-size: 3rem; opacity: 0.3;"></i>
            <p>בחר צ'אט מהרשימה</p>
        </div>`;
}

function minimizeMainChat(email, name) {
    // Clear main area
    closeMainChat();
    // Open floating minimized
    openChat(email, name, true, true);
}

function rearrangeMinimizedWindows() {
    const minimized = document.querySelectorAll('.chat-window.minimized');
    minimized.forEach((win, index) => {
        win.style.bottom = (90 + index * 60) + 'px';
    });
}

function closeChatWindow(email) {
    const win = document.getElementById(`chat-window-${email}`);
    if (win) win.remove();
    rearrangeMinimizedWindows();
}

function toggleChatWindow(email) {
    const win = document.getElementById(`chat-window-${email}`);
    if (win) {
        win.classList.toggle('minimized');
        win.classList.remove('flashing'); // הפסקת הבהוב בעת פתיחה/מזעור

        if (!win.classList.contains('minimized')) {
            win.style.bottom = '';
            markAsRead(email);
        }
        rearrangeMinimizedWindows();
    }
}

async function loadChatHistory(partnerEmail) {
    const myEmail = getCurrentChatEmail();
    const isBook = partnerEmail.startsWith('book:');

    let query = supabaseClient.from('chat_messages').select('*');

    // איפוס צ'אט יומי (דף היומי וכו') ב-2:00 בלילה
    const dailyBooks = ['book:דף היומי', 'book:משנה יומית', 'book:רמב"ם יומי', 'book:הלכה יומית'];
    if (dailyBooks.includes(partnerEmail)) {
        const now = new Date();
        let cutoff = new Date();
        cutoff.setHours(2, 0, 0, 0);
        if (now < cutoff) {
            cutoff.setDate(cutoff.getDate() - 1);
        }
        query = query.gt('created_at', cutoff.toISOString());
    }

    if (isBook) {
        query = query.eq('receiver_email', partnerEmail); // For books, receiver is the book ID
    } else {
        query = query.or(
            `and(sender_email.eq.${myEmail},receiver_email.eq.${partnerEmail})`,
            `and(sender_email.eq.${partnerEmail},receiver_email.eq.${myEmail})`
        );
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) console.error("שגיאה בטעינת צ'אט:", error);

    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    // Remove loading indicator if exists
    const loader = container.querySelector('.chat-loading-indicator');
    if (loader) loader.remove();

    if (data) {
        container.innerHTML = '';
        data.forEach(msg => {
            // בדיקה אם להודעה זו יש תגובות (שרשור)
            // אנו בודקים אם קיימת הודעה אחרת ב-data שמכילה ref ל-ID הזה
            // זה עובד רק אם התגובה נטענה בהיסטוריה הנוכחית. לפתרון מלא צריך שאילתה נפרדת או שדה ב-DB.
            // כפתרון ביניים יעיל:
            const hasReplies = data.some(m => m.message.includes(`ref:${msg.id}`));

            const type = (msg.sender_email.toLowerCase() === myEmail.toLowerCase()) ? 'me' : 'other';
            const el = appendMessageToWindow(partnerEmail, msg.message, type, msg.id, msg.created_at, msg.is_read, msg.sender_email);

            if (hasReplies && el) {
                const indicator = document.createElement('span');
                indicator.className = 'thread-active-indicator';
                indicator.title = "יש תגובות בשרשור";
                // הוספה לבועה
                const bubble = el.querySelector('.message-bubble') || el;
                bubble.appendChild(indicator);
            }
        });

        // טעינת ריאקציות (לייקים) שביצעתי
        if (isBook && data.length > 0) {
            const msgIds = data.map(m => m.id);
            const { data: reactions } = await supabaseClient
                .from('message_reactions')
                .select('message_id, reaction_type')
                .in('message_id', msgIds)
                .eq('user_email', currentUser.email);

            if (reactions) {
                reactions.forEach(r => {
                    const btnIcon = document.querySelector(`#msg-${r.message_id} .reaction-btn i.fa-thumbs-${r.reaction_type === 'like' ? 'up' : 'down'}`);
                    if (btnIcon && btnIcon.parentElement) {
                        const btn = btnIcon.parentElement;
                        btn.classList.add('active');
                        btn.style.color = r.reaction_type === 'like' ? '#22c55e' : '#ef4444';
                        // btn.disabled = true; // הסרנו את ה-disabled כדי לאפשר ביטול
                        // הוספת מידע על סוג הריאקציה לכפתור כדי שנוכל לזהות בלחיצה הבאה
                        btn.dataset.reaction = r.reaction_type;
                    }
                });
            }
        }

        // גלילה למטה לאחר טעינת ההיסטוריה
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}

async function loadChatRating() {
    const display = document.getElementById('chatRatingDisplay');
    if (!currentUser) return;

    // חישוב פשוט: שליפת כל ההודעות שלי וספירת לייקים
    const { data: messages } = await supabaseClient.from('chat_messages').select('id').eq('sender_email', currentUser.email);
    if (messages && messages.length > 0) {
        const ids = messages.map(m => m.id);
        const { count } = await supabaseClient.from('message_reactions').select('*', { count: 'exact', head: true }).in('message_id', ids).eq('reaction_type', 'like');
        
        const rating = count || 0;
        if (display) display.innerText = rating;

        // Update Dashboard Rating
        const dashStat = document.getElementById('stat-rating');
        if (dashStat) dashStat.innerText = rating;
        
        // Cache rating for immediate load next time
        localStorage.setItem('torahApp_rating', rating);
    } else {
        if (display) display.innerText = 0;
        const dashStat = document.getElementById('stat-rating');
        if (dashStat) dashStat.innerText = 0;
        localStorage.setItem('torahApp_rating', 0);
    }
}

async function sendMessage(partnerEmail) {
    if (!requireAuth()) return;
    const isBook = partnerEmail.startsWith('book:');
    if (!isBook && blockedUsers.includes(partnerEmail)) return await customAlert("משתמש זה חסום.");

    const input = document.getElementById(`input-${partnerEmail}`);
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.includes('ref:')) return; // Prevent manual ref injection

    let finalMsg = msg;
    let isHtml = false;

    if (activeReply && activeReply.chatId === partnerEmail) {
        finalMsg = `<div class="chat-quote"><strong>${activeReply.sender}:</strong> ${activeReply.text}</div>${msg}`;
        isHtml = true;
        // אם אנחנו בתוך שרשור, הציטוט צריך להיות בתוך השרשור
        if (activeThreadId) {
            // הטיפול בשרשור נעשה ב-sendThreadMessage, אבל אם המשתמש בחר לצטט בתוך שרשור:
            // activeReply נשמר גלובלית. sendThreadMessage צריך להשתמש בו.
        }
        cancelReply(partnerEmail); // איפוס הציטוט
    }

    // Visualize before sending
    visualizeNetworkActivity('request', {
        action: 'sendMessage',
        from: currentUser.email,
        to: partnerEmail,
        isBoring: false
    });

    // ניקוי שדה הקלט
    input.value = '';
    localStorage.removeItem('chat_draft_' + partnerEmail);

    const sender = getCurrentChatEmail();
    // שמירה ב-Supabase
    try {
        // --- תיקון: שימוש ב-partnerEmail במקום currentChatPartner ---
        const { data, error } = await supabaseClient.from('chat_messages').insert([{
            sender_email: sender,
            receiver_email: partnerEmail, // For books, this is 'book:Name'
            message: finalMsg,
            is_html: isHtml
        }]).select();


        if (error) {
            console.error("Supabase Error:", error);
            if (error.code === "401") {
                await customAlert("שגיאת שליחה: אין הרשאה (401).<br>בדוק את מפתח ה-API בקובץ api.js.", true);
            } else {
                await customAlert("שגיאה בשליחה: " + error.message);
            }
        } else if (data && data[0]) {
            // שדר את ההודעה לכל הלקוחות המאזינים
            if (chatChannel) {
                chatChannel.send({
                    type: 'broadcast',
                    event: 'private_message',
                    payload: { message: data[0] }
                });
            }
            appendMessageToWindow(partnerEmail, finalMsg, 'me', data[0].id, data[0].created_at, false, sender);
        }
    } catch (e) {
        console.error("שגיאה בשליחת הודעה:", e);
    }
}

function saveChatDraft(email, val) {
    localStorage.setItem('chat_draft_' + email, val);
}

function appendMessageToWindow(partnerEmail, text, type, id, timestamp, isRead = false, senderEmail = null) {
    // Filter out thread replies from main view if they have a ref tag (hidden)
    // But since we use is_html for threads, we might want to show them or hide them.
    // הסתרת הודעות שרשור מהצ'אט הראשי
    if (text.includes('ref:')) return null;

    const container = document.getElementById(`msgs-${partnerEmail}`);
    if (!container) return;

    // מניעת כפילויות (חשוב למנגנון ה-Polling)
    if (id && document.getElementById(`msg-${id}`)) return;

    const div = document.createElement('div');
    // div.className = `message-bubble msg-${type}`; // Old class
    if (id) div.id = `msg-${id}`;
    if (timestamp) div.dataset.timestamp = timestamp;
    div.style.cursor = 'pointer';

    let contentDiv = div;

    // For book chats, show sender name and avatar for EVERYONE (me and others)
    if (partnerEmail.startsWith('book:') && senderEmail) {
        const wrapper = document.createElement('div');
        wrapper.className = 'new-message-animation';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'flex-end';
        wrapper.style.gap = '8px';
        wrapper.style.marginBottom = '8px';
        wrapper.style.maxWidth = '70%';
        
        // RTL Logic:
        // Me (Right side): justify-content: flex-start (Right in RTL), flex-direction: row (Avatar -> Message)
        // Other (Left side): justify-content: flex-end (Left in RTL), flex-direction: row-reverse (Avatar -> Message)
        
        wrapper.style.alignSelf = type === 'me' ? 'flex-start' : 'flex-end';
        wrapper.style.flexDirection = type === 'me' ? 'row' : 'row-reverse';

        const senderUser = globalUsersData.find(u => u.email === senderEmail);
        const isSubscribed = senderUser && senderUser.subscription && senderUser.subscription.level > 0;
        const subClass = isSubscribed ? `aura-lvl-${senderUser.subscription.level}` : '';
        const subTitle = isSubscribed ? `מנוי: ${senderUser.subscription.name}` : '';

        const avatar = document.createElement('div');
        // צבע שונה לי ולאחרים
        const avatarColor = type === 'me' ? '#3b82f6' : '#cbd5e1';
        avatar.innerHTML = `<i class="fas fa-user-circle ${subClass}" style="font-size: 28px; color: ${avatarColor}; cursor: pointer; border-radius:50%;" title="${subTitle}"></i>`;
        avatar.onclick = (e) => { e.stopPropagation(); showUserDetails(senderEmail); };

        wrapper.appendChild(avatar); // Avatar first in DOM
        wrapper.appendChild(div);
        container.appendChild(wrapper);

        // Add name inside bubble too
        const senderName = senderUser ? senderUser.name : senderEmail.split('@')[0];
        const nameSpan = document.createElement('span');
        nameSpan.className = 'msg-sender-name';
        nameSpan.innerText = senderName;
        div.appendChild(nameSpan);
    } else {
        // For personal chats, we also use a wrapper for robust alignment.
        const wrapper = document.createElement('div');
        wrapper.className = 'new-message-animation';
        wrapper.style.display = 'flex';
        wrapper.style.width = '100%';
        wrapper.style.marginBottom = '8px';
        wrapper.style.justifyContent = type === 'me' ? 'flex-start' : 'flex-end';
        wrapper.appendChild(div);
        container.appendChild(wrapper);
    }

    // Apply new Tailwind classes
    const animClass = ''; // Animation is now on the wrapper element for both personal and book chats.
    if (type === 'me') {
        div.className = `message-bubble max-w-md bg-slate-800 dark:bg-slate-700 text-white p-4 rounded-2xl rounded-tr-sm shadow-lg relative`;
    } else {
        div.className = `message-bubble max-w-md bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700 relative`;
    }

    // Check if the message is HTML
    if (text.includes('<button') || text.includes('chat-quote')) {
        div.innerHTML = text;
    } else {
        const p = document.createElement('p');
        p.className = "text-sm leading-relaxed mb-1";
        p.textContent = text;
        div.appendChild(p);
    }

    if (type === 'me') {
        if ((partnerEmail !== 'admin@system' && !partnerEmail.startsWith('book:')) || isAdminMode) {
            const check = document.createElement('span');
            check.className = 'msg-check';
            check.id = `check-${id}`;
            check.innerText = isRead ? '✓✓' : '✓';
            // check.style.color = isRead ? '#4ade80' : '#cbd5e1'; // Handled by classes or inline
            // div.appendChild(check); // Will append in footer
        }
    }

    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const timeDiv = document.createElement('div');
    timeDiv.className = 'flex justify-between items-center mt-auto pt-1 text-[10px] opacity-70';
    timeDiv.innerHTML = `<span>${timeStr}</span>`;
    div.appendChild(timeDiv);

    div.onclick = function (e) {
        if (e.target.closest('.msg-delete-btn')) return;
        const ts = this.querySelector('.msg-timestamp');
        if (ts) ts.style.display = ts.style.display === 'block' ? 'none' : 'block';
    };

    if (type === 'me' && id) {
        const delBtn = document.createElement('button');
        delBtn.className = 'msg-delete-btn';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteMessage(id, div); };
        div.appendChild(delBtn);
    }

    // Add Reactions/Menu for ALL chats (Personal + Book)
    if (id) {
        // Extract plain text for quoting - CLEANER VERSION
        const clone = div.cloneNode(true);
        // הסרת אלמנטים מיותרים לפני לקיחת הטקסט
        const toRemove = clone.querySelectorAll('.msg-timestamp, .msg-sender-name, .msg-delete-btn, .msg-check, .msg-reactions');
        toRemove.forEach(el => el.remove());

        const isBook = partnerEmail.startsWith('book:');
        const plainText = clone.innerText.replace('הצג טלפון ליצירת קשר', '').trim();
        const senderName = senderEmail ? (globalUsersData.find(u => u.email === senderEmail)?.name || senderEmail.split('@')[0]) : 'משתמש';
        const fullTextSafe = plainText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeSenderName = senderName.replace(/'/g, "\\'");

        const isMe = senderEmail === currentUser.email;

        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'flex gap-2 mt-2 justify-end';

        // הוספת הוי (Check) בתוך שורת הריאקציות
        if (type === 'me') {
            if ((partnerEmail !== 'admin@system' && !partnerEmail.startsWith('book:')) || isAdminMode) {
                const check = document.createElement('span');
                check.className = 'msg-check';
                check.id = `check-${id}`;
                check.innerText = isRead ? 'done_all' : 'check';
                check.className = "material-icons-round text-[14px] " + (isRead ? "text-blue-400" : "text-slate-400");
                check.style.color = isRead ? '#4ade80' : '#cbd5e1';
                timeDiv.appendChild(check); // Add check to time div
            }
        }

        let innerHTML = '';
        if (isBook) {
            const likeDisabled = isMe ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
            innerHTML += `
                <button class="reaction-btn" ${likeDisabled} onclick="event.stopPropagation(); toggleReaction('${id}', 'like', this)"><i class="fas fa-thumbs-up"></i></button>
                <button class="reaction-btn" ${likeDisabled} onclick="event.stopPropagation(); toggleReaction('${id}', 'dislike', this)"><i class="fas fa-thumbs-down"></i></button>
            `;
        }

        innerHTML += `
            <div class="relative inline-block">
                <button class="text-slate-400 hover:text-white transition-colors" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden')"><span class="material-icons-round text-sm">more_vert</span></button>
                <div class="hidden absolute bottom-full right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 min-w-[120px] overflow-hidden">
                    <div class="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-xs flex items-center gap-2" onclick="event.stopPropagation(); replyToMessage('${partnerEmail}', '${safeSenderName}', '${fullTextSafe}'); this.parentElement.classList.add('hidden');"><span class="material-icons-round text-sm">reply</span> ציטוט</div>
                    ${isBook ? `<div class="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-xs flex items-center gap-2" onclick="event.stopPropagation(); openThread('${id}', '${fullTextSafe}', '${partnerEmail}'); this.parentElement.classList.add('hidden');"><span class="material-icons-round text-sm">forum</span> שרשור</div>` : ''}
                    ${!isMe ? `<div class="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 cursor-pointer text-xs flex items-center gap-2" onclick="event.stopPropagation(); openReportModal('${senderEmail}'); this.parentElement.classList.add('hidden');"><span class="material-icons-round text-sm">flag</span> דיווח</div>` : ''}
                </div>
            </div>
        `;
        // reactionsDiv.innerHTML = innerHTML; // Using the more_vert menu instead
        timeDiv.innerHTML += innerHTML;
    }

    container.scrollTop = container.scrollHeight;
    return div; // החזרת האלמנט לשימוש חיצוני
}

function replyToMessage(chatId, senderName, text) {
    activeReply = { chatId, sender: senderName, text };
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) {
        preview.style.display = 'flex';
        preview.innerHTML = `<span><strong>משיב ל-${senderName}:</strong> ${text}</span> <i class="fas fa-times" style="cursor:pointer;" onclick="cancelReply('${chatId}')"></i>`;
        document.getElementById(`input-${chatId}`).focus();
    }
}

function cancelReply(chatId) {
    activeReply = null;
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) preview.style.display = 'none';
}


async function deleteMessage(id, element) {
    if (!requireAuth()) return;
    if (!(await customConfirm('למחוק הודעה זו?'))) return;

    try {
        const { error } = await supabaseClient.from('chat_messages').delete().eq('id', id);
        if (error) throw error;
        element.remove();
    } catch (e) {
        console.error("Error deleting message:", e);
        await customAlert("שגיאה במחיקת ההודעה");
    }
}

async function toggleReaction(msgId, type, btn) {
    if (!requireAuth()) return;
    // לוגיקה חדשה: ביטול והחלפה
    const isActive = btn.classList.contains('active');
    const container = btn.parentElement;
    const otherType = type === 'like' ? 'dislike' : 'like';
    const otherBtn = container.querySelector(`.reaction-btn i.fa-thumbs-${type === 'like' ? 'down' : 'up'}`).parentElement;

    try {
        if (isActive) {
            // ביטול סימון קיים (מחיקה)
            await supabaseClient.from('message_reactions').delete()
                .eq('message_id', msgId)
                .eq('user_email', currentUser.email);

            btn.classList.remove('active');
            btn.style.color = '';
            delete btn.dataset.reaction;
        } else {
            // סימון חדש או החלפה
            await supabaseClient.from('message_reactions').upsert({
                message_id: msgId,
                user_email: currentUser.email,
                reaction_type: type
            }, { onConflict: 'message_id,user_email' });

            // הפעלת הכפתור הנוכחי
            btn.classList.add('active');
            btn.style.color = type === 'like' ? '#22c55e' : '#ef4444';
            btn.dataset.reaction = type;

            // כיבוי הכפתור השני אם היה פעיל
            if (otherBtn.classList.contains('active')) {
                otherBtn.classList.remove('active');
                otherBtn.style.color = '';
                delete otherBtn.dataset.reaction;
            }

            // Award points for like
            if (type === 'like') {
                try {
                    const { data: msg } = await supabaseClient.from('chat_messages').select('sender_email').eq('id', msgId).single();
                    if (msg && msg.sender_email !== currentUser.email) {
                        await supabaseClient.rpc('increment_field', { table_name: 'users', field_name: 'reward_points', increment_value: 5, user_email: msg.sender_email });
                        // Optional: notify the user who got points
                    }
                } catch(e) {
                    console.error("Error awarding points for like", e);
                }
            }
        }
    } catch (e) {
        console.error("Reaction error", e);
        showToast("שגיאה בעדכון תגובה", "error");
    }
}

let typingTimeout = null;
let lastTypingTime = 0;

function handleTyping(partnerEmail) {
    const now = Date.now();
    if (now - lastTypingTime > 2000 && chatChannel) {
        lastTypingTime = now;
        chatChannel.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser.email, to: partnerEmail } });
    }
}

function showTyping(partnerEmail, text) {
    const el = document.getElementById(`typing-${partnerEmail}`);
    if (el) {
        el.innerText = text;
        el.classList.add('active');
        if (typingTimers[partnerEmail]) clearTimeout(typingTimers[partnerEmail]);
        typingTimers[partnerEmail] = setTimeout(() => { el.classList.remove('active'); }, 3000);
    }
}

async function markAsRead(senderEmail) {
    try {
        await supabaseClient.from('chat_messages')
            .update({ is_read: true })
            .eq('sender_email', senderEmail)
            .eq('receiver_email', getCurrentChatEmail())
            .eq('is_read', false);
    } catch (e) { console.error("Error marking as read:", e); }
}