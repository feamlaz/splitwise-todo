class TodoApp {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.currentFilter = 'active';
        this.currentProject = 'all';
        this.editingTaskId = null;
        this.timers = {};
        this.comments = {};
        this.achievements = [];
        this.quickNotes = localStorage.getItem('quickNotes') || '';
        this.isOnline = navigator.onLine;
        this.supabase = null;
        this.currentUser = null;
        this.useSupabase = false;
        this.init();
    }
    async init() {
        // Р–РґРµРј Р·Р°РіСЂСѓР·РєРё DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
        
        await this.initSupabase();
        await this.setupAuth();
        //this.registerServiceWorker(); // РћС‚РєР»СЋС‡РµРЅРѕ РґР»СЏ GitHub Pages
        this.setupPWA();
        this.setupOnlineStatus();
        this.bindEvents();
        await this.loadTasks();
        this.render();
        this.updateStats();
        this.setupRepeats();
        this.initSidebar();
        this.startClock();
        this.initChart();
        this.initCalendar();
        this.checkAchievements();
        
        // Р’СЂРµРјРµРЅРЅР°СЏ РїСЂРѕРІРµСЂРєР° Supabase (РџРћРЎР›Р• РёРЅРёС†РёР°Р»РёР·Р°С†РёРё)
        console.log('=== Supabase Status Check ===');
        console.log('Supabase client:', this.supabase);
        console.log('Current user:', this.currentUser);
        console.log('Use Supabase:', this.useSupabase);
        console.log('=== End Status Check ===');
    }
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.showUpdateNotification();
                            }
                        });
                    });
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        }
    }
    
    setupPWA() {
        // Install button
        let deferredPrompt;
        const installBtn = document.createElement('button');
        installBtn.innerHTML = 'рџ“± РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїСЂРёР»РѕР¶РµРЅРёРµ';
        installBtn.className = 'install-btn';
        installBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 50px;
            cursor: pointer;
            font-family: 'Comfortaa', cursive;
            font-weight: 600;
            box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4);
            z-index: 1000;
            transition: all 0.3s ease;
        `;
        
        installBtn.addEventListener('click', () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the A2HS prompt');
                        installBtn.style.display = 'none';
                    }
                    deferredPrompt = null;
                });
            }
        });
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            document.body.appendChild(installBtn);
        });
        
        // Hide install button if already installed
        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            if (installBtn.parentNode) {
                installBtn.parentNode.removeChild(installBtn);
            }
        });
    }
    
    setupOnlineStatus() {
        const updateOnlineStatus = () => {
            this.isOnline = navigator.onLine;
            const statusElement = document.querySelector('.status-active');
            if (statusElement) {
                statusElement.textContent = this.isOnline ? 'рџџў РђРєС‚РёРІРµРЅ' : 'рџ”ґ РћС„С„Р»Р°Р№РЅ';
                statusElement.className = this.isOnline ? 'info-value status-active' : 'info-value status-offline';
            }
            
            if (this.isOnline) {
                this.syncData();
            }
        };
        
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        updateOnlineStatus();
    }
    
    async requestNotificationPermission() {
        if ('Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('Notification permission granted');
                this.subscribeToPush();
            }
        }
    }
    
    async subscribeToPush() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array('your-vapid-public-key')
                });
                
                console.log('Push subscription:', subscription);
                // Send subscription to server
            } catch (error) {
                console.error('Push subscription error:', error);
            }
        }
    }
    
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #2ecc71, #27ae60);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
                z-index: 1001;
                font-family: 'Comfortaa', cursive;
                max-width: 300px;
            ">
                <div style="font-weight: 600; margin-bottom: 8px;">рџ”„ РћР±РЅРѕРІР»РµРЅРёРµ РґРѕСЃС‚СѓРїРЅРѕ</div>
                <div style="font-size: 12px; margin-bottom: 12px;">РќРѕРІР°СЏ РІРµСЂСЃРёСЏ РїСЂРёР»РѕР¶РµРЅРёСЏ РіРѕС‚РѕРІР° Рє СѓСЃС‚Р°РЅРѕРІРєРµ</div>
                <button onclick="location.reload()" style="
                    background: white;
                    color: #1fbe61;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-family: 'Comfortaa', cursive;
                    font-weight: 600;
                ">РћР±РЅРѕРІРёС‚СЊ</button>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: transparent;
                    color: white;
                    border: 1px solid white;
                    padding: 8px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-family: 'Comfortaa', cursive;
                    font-weight: 600;
                    margin-left: 8px;
                ">РџРѕР·Р¶Рµ</button>
            </div>
        `;
        document.body.appendChild(notification);
    }
    
    syncData() {
        // Sync tasks with server when back online
        console.log('Syncing data with server...');
        // Implementation for server sync
    }

    bindEvents() {
        // Р–РґРµРј Р·Р°РіСЂСѓР·РєРё DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        document.getElementById('addTaskBtn').addEventListener('click', () => this.openTaskModal());
        
        document.getElementById('saveTaskBtn').addEventListener('click', () => this.saveTask());
        document.getElementById('cancelTaskBtn').addEventListener('click', () => this.closeTaskModal());
        
        document.getElementById('clearCompleted').addEventListener('click', () => this.clearCompleted());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportTasks());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        
        // РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ - РїСЂРѕРІРµСЂСЏРµРј СЃСѓС‰РµСЃС‚РІРѕРІР°РЅРёРµ СЌР»РµРјРµРЅС‚РѕРІ
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        
        if (loginBtn) loginBtn.addEventListener('click', () => this.showAuthModal(false));
        if (registerBtn) registerBtn.addEventListener('click', () => this.showAuthModal(true));
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.signOut());
        
        // РњРѕРґР°Р»СЊРЅРѕРµ РѕРєРЅРѕ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё
        const authForm = document.getElementById('authForm');
        const authCancelBtn = document.getElementById('authCancelBtn');
        const authSwitchLink = document.getElementById('authSwitchLink');
        
        if (authForm) authForm.addEventListener('submit', (e) => this.handleAuth(e));
        if (authCancelBtn) authCancelBtn.addEventListener('click', () => this.hideAuthModal());
        if (authSwitchLink) authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleAuthMode();
        });
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
        });
        
        document.getElementById('projectFilter').addEventListener('change', (e) => this.setProjectFilter(e.target.value));
        document.getElementById('tagSearch').addEventListener('input', (e) => this.searchByTags(e.target.value));
        
        document.getElementById('saveEditBtn').addEventListener('click', () => this.saveEdit());
        document.getElementById('cancelEditBtn').addEventListener('click', () => this.closeEditModal());
        
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') this.closeTaskModal();
        });
        
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') this.closeEditModal();
        });
        
        document.getElementById('searchInput').addEventListener('input', (e) => this.searchByAssignee(e.target.value));
        
        // Repeat checkbox events
        document.getElementById('taskRepeatCheckbox').addEventListener('change', (e) => {
            document.getElementById('taskRepeatInput').style.display = e.target.checked ? 'block' : 'none';
        });
        
        document.getElementById('editTaskRepeatCheckbox').addEventListener('change', (e) => {
            document.getElementById('editTaskRepeatInput').style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Sidebar events
        document.getElementById('quickNotes').addEventListener('input', (e) => this.saveQuickNotes(e.target.value));
        document.getElementById('quickAddBtn').addEventListener('click', () => this.quickAddTask());
        document.getElementById('importBtn').addEventListener('click', () => this.importTasks());
        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('notificationsBtn').addEventListener('click', () => this.toggleNotifications());
    }

    openTaskModal() {
        document.getElementById('taskModal').style.display = 'block';
        document.getElementById('taskTitleInput').focus();
    }
    
    closeTaskModal() {
        document.getElementById('taskModal').style.display = 'none';
        this.clearTaskForm();
    }
    
    clearTaskForm() {
        document.getElementById('taskTitleInput').value = '';
        document.getElementById('taskDescriptionInput').value = '';
        document.getElementById('taskDateTimeInput').value = '';
        document.getElementById('taskPriorityInput').value = 'medium';
        document.getElementById('taskProjectInput').value = 'personal';
        document.getElementById('taskTagsInput').value = '';
        document.getElementById('taskAssigneeInput').value = '';
        document.getElementById('taskRepeatCheckbox').checked = false;
        document.getElementById('taskRepeatInput').style.display = 'none';
        document.getElementById('taskRepeatInput').value = 'daily';
    }
    
    async saveTask() {
        console.log('saveTask() called');
        
        // РџСЂРѕРІРµСЂСЏРµРј СЃСѓС‰РµСЃС‚РІРѕРІР°РЅРёРµ РІСЃРµС… СЌР»РµРјРµРЅС‚РѕРІ С„РѕСЂРјС‹
        const titleElement = document.getElementById('taskTitleInput');
        const descriptionElement = document.getElementById('taskDescriptionInput');
        const dateTimeElement = document.getElementById('taskDateTimeInput');
        const priorityElement = document.getElementById('taskPriorityInput');
        const projectElement = document.getElementById('taskProjectInput');
        const tagsElement = document.getElementById('taskTagsInput');
        const assigneeElement = document.getElementById('taskAssigneeInput');
        const repeatCheckboxElement = document.getElementById('taskRepeatCheckbox');
        const repeatInputElement = document.getElementById('taskRepeatInput');
        
        if (!titleElement || !descriptionElement || !dateTimeElement || 
            !priorityElement || !projectElement || !tagsElement || 
            !assigneeElement || !repeatCheckboxElement || !repeatInputElement) {
            console.error('Form elements not found!');
            this.showNotification('Р¤РѕСЂРјР° РЅРµ РЅР°Р№РґРµРЅР°. РћР±РЅРѕРІРёС‚Рµ СЃС‚СЂР°РЅРёС†Сѓ.', 'error');
            return;
        }
        
        const title = titleElement?.value?.trim() || '';
        const description = descriptionElement?.value?.trim() || '';
        const dateTime = dateTimeElement?.value || '';
        const priority = priorityElement?.value || 'medium';
        const project = projectElement?.value || 'personal';
        const tags = tagsElement?.value?.trim() || '';
        const assignee = assigneeElement?.value?.trim() || '';
        const isRepeat = repeatCheckboxElement?.checked || false;
        const repeatType = isRepeat ? repeatInputElement?.value : null;
        
        console.log('Task data:', { title, description, dateTime, priority, project, tags, assignee, isRepeat, repeatType });
        
        if (title === '') {
            this.showNotification('Р’РІРµРґРёС‚Рµ РЅР°Р·РІР°РЅРёРµ Р·Р°РґР°С‡Рё!', 'error');
            return;
        }

        const task = {
            title: title,
            description: description,
            dueDate: dateTime || null,
            priority: priority,
            project: project,
            tags: tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [],
            assignee: assignee || '',
            status: 'active',
            repeatType: repeatType
        };
        
        console.log('Created task object:', task);

        try {
            const savedTask = await this.saveTask(task);
            
            // РћР±РЅРѕРІР»СЏРµРј Р·Р°РґР°С‡Сѓ РІ РјР°СЃСЃРёРІРµ
            if (savedTask) {
                if (!task.id || typeof task.id === 'undefined') {
                    // РќРѕРІР°СЏ Р·Р°РґР°С‡Р° - РґРѕР±Р°РІР»СЏРµРј РІ РЅР°С‡Р°Р»Рѕ СЃ РЅРѕРІС‹Рј ID
                    this.tasks.unshift(savedTask);
                } else {
                    // РћР±РЅРѕРІР»РµРЅРёРµ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµР№ Р·Р°РґР°С‡Рё - Р·Р°РјРµРЅСЏРµРј РїРѕ ID
                    const existingIndex = this.tasks.findIndex(t => t.id === task.id);
                    if (existingIndex >= 0) {
                        this.tasks[existingIndex] = savedTask;
                    } else {
                        // Р•СЃР»Рё РЅРµ РЅР°С€Р»Рё РїРѕ СЃС‚Р°СЂРѕРјСѓ ID, РёС‰РµРј РїРѕ РЅРѕРІРѕРјСѓ
                        const newIndex = this.tasks.findIndex(t => t.id === savedTask.id);
                        if (newIndex >= 0) {
                            this.tasks[newIndex] = savedTask;
                        } else {
                            this.tasks.unshift(savedTask);
                        }
                    }
                }
            }
            
            this.closeTaskModal();
            this.render();
            this.updateStats();
            this.showNotification('вњ… Р—Р°РґР°С‡Р° РґРѕР±Р°РІР»РµРЅР°!', 'success');
        } catch (error) {
            console.error('Error saving task:', error);
            this.showNotification('вќЊ РћС€РёР±РєР° РїСЂРё СЃРѕС…СЂР°РЅРµРЅРёРё Р·Р°РґР°С‡Рё', 'error');
        }
    }

    toggleTask(id) {
        console.log('toggleTask called with ID:', id);
        console.log('Current tasks:', this.tasks.map(t => ({id: t.id, title: t.title})));
        
        const task = this.tasks.find(t => t.id === id);
        console.log('Found task:', task);
        
        if (task && task.status !== 'paused') {
            task.status = task.status === 'active' ? 'completed' : 'active';
            console.log('Task status updated to:', task.status);

            if (this.useSupabase && this.currentUser) {
                this.saveTaskToSupabase(task);
            } else {
                this.saveTasks();
            }

            this.render();
        } else {
            console.warn('Task not found or is paused:', task);
        }
    }

    async deleteTask(id) {
        if (this.useSupabase && this.currentUser) {
            const success = await this.deleteTaskFromSupabase(id);
            if (success) {
                this.tasks = this.tasks.filter(t => t.id !== id);
                this.render();
                this.updateStats();
            }
        } else {
            this.tasks = this.tasks.filter(t => t.id !== id);
            this.saveTasks();
            this.render();
            this.updateStats();
        }
    }

    togglePause(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task && task.status !== 'completed') {
            task.status = task.status === 'active' ? 'paused' : 'active';
            
            if (this.useSupabase && this.currentUser) {
                this.saveTaskToSupabase(task);
            } else {
                this.saveTasks();
            }
            
            this.render();
        }
    }
    
    editTask(id) {
        console.log('editTask called with id:', id);
        const task = this.tasks.find(t => t.id === id);
        console.log('Found task:', task);
        if (task && task.status === 'active') {
            this.editingTaskId = id;
            document.getElementById('editTaskInput').value = task.title;
            document.getElementById('editTaskDescriptionInput').value = task.description || '';
            document.getElementById('editTaskDateTime').value = task.dateTime || '';
            document.getElementById('editTaskPriority').value = task.priority || 'medium';
            document.getElementById('editTaskProject').value = task.project || 'personal';
            document.getElementById('editTaskTagsInput').value = task.tags ? task.tags.join(', ') : '';
            document.getElementById('editTaskAssigneeInput').value = task.assignee || '';
            
            const hasRepeat = !!task.repeatType;
            document.getElementById('editTaskRepeatCheckbox').checked = hasRepeat;
            document.getElementById('editTaskRepeatInput').style.display = hasRepeat ? 'block' : 'none';
            document.getElementById('editTaskRepeatInput').value = task.repeatType || 'daily';
            
            document.getElementById('editModal').style.display = 'block';
            console.log('Edit modal should be visible now');
        } else {
            console.log('Cannot edit task - not found or not active:', task);
        }
    }
    
        const task = this.tasks.find(t => t.id === this.editingTaskId);
        if (task) {
            const title = document.getElementById('editTaskInput').value.trim();
            if (title === '') {
                alert('Введите название задачи!');
                return;
            }
            
            task.title = title;
            task.description = document.getElementById('editTaskDescriptionInput').value.trim();
            task.dateTime = document.getElementById('editTaskDateTime').value || null;
            task.priority = document.getElementById('editTaskPriority').value;
            task.project = document.getElementById('editTaskProject').value;
            const tags = document.getElementById('editTaskTagsInput').value.trim();
            task.tags = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];
            task.assignee = document.getElementById('editTaskAssigneeInput').value.trim() || null;
            
            const isRepeat = document.getElementById('editTaskRepeatCheckbox').checked;
            task.repeatType = isRepeat ? document.getElementById('editTaskRepeatInput').value : null;
            
            if (this.useSupabase && this.currentUser) {
                const updatedTask = await this.saveTaskToSupabase(task);
                // Update local task with returned data
                if (updatedTask) {
                    Object.assign(task, updatedTask, {
                        dateTime: updatedTask.due_date,
                        repeatType: updatedTask.repeat_type
                    });
                }
            } else {
                this.saveTasks();
            }
            
            this.render();
            this.updateStats();
            this.closeEditModal();
        }
    }
    
    closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
        this.editingTaskId = null;
    }

    clearCompleted() {
        this.tasks = this.tasks.filter(t => t.status !== 'completed');
        
        if (this.useSupabase && this.currentUser) {
            // РЈРґР°Р»СЏРµРј Р·Р°РІРµСЂС€РµРЅРЅС‹Рµ Р·Р°РґР°С‡Рё РёР· Supabase
            const completedTasks = this.tasks.filter(t => t.status === 'completed');
            completedTasks.forEach(task => {
                this.deleteTaskFromSupabase(task.id);
            });
        } else {
            this.saveTasks();
        }
        
        this.render();
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        const filterBtns = document.querySelectorAll('.filter-btn');
        if (filterBtns) {
            filterBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
        }
        
        this.render();
    }
    
    setProjectFilter(project) {
        this.currentProject = project;
        this.render();
    }
    
    searchByTags(searchValue) {
        this.render();
    }
    
    exportTasks() {
        const dataStr = JSON.stringify(this.tasks, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `tasks_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
    
    openSettings() {
        alert('РќР°СЃС‚СЂРѕР№РєРё РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ!');
    }
    
    setupRepeat(task) {
        if (!task.repeatType) return;
        
        const now = new Date();
        const nextDate = new Date(task.dateTime || now);
        
        switch (task.repeatType) {
            case 'daily':
                nextDate.setDate(nextDate.getDate() + 1);
                break;
            case 'weekly':
                nextDate.setDate(nextDate.getDate() + 7);
                break;
            case 'monthly':
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
        }
        
        // Schedule next repeat
        const delay = nextDate - now;
        setTimeout(() => {
            this.createRepeatTask(task);
        }, delay);
    }
    
    createRepeatTask(originalTask) {
        const newTask = {
            ...originalTask,
            id: Date.now(),
            status: 'active',
            createdAt: new Date().toISOString(),
            timer: 0,
            comments: [],
            repeatType: originalTask.repeatType
        };
        
        this.tasks.unshift(newTask);
        this.saveTasks();
        this.render();
        this.updateStats();
        
        // Setup next repeat
        this.setupRepeat(newTask);
    }
    
    updateStats() {
        const totalTasks = this.tasks.length;
        const today = new Date().toDateString();
        const completedToday = this.tasks.filter(t => 
            t.status === 'completed' && 
            new Date(t.createdAt).toDateString() === today
        ).length;
        const overdueTasks = this.tasks.filter(t => {
            if (!t.dateTime || t.status === 'completed') return false;
            return new Date(t.dateTime) < new Date();
        }).length;
        
        const totalTasksEl = document.getElementById('totalTasks');
        const completedTodayEl = document.getElementById('completedToday');
        const overdueTasksEl = document.getElementById('overdueTasks');
        
        if (totalTasksEl) totalTasksEl.textContent = totalTasks;
        if (completedTodayEl) completedTodayEl.textContent = completedToday;
        if (overdueTasksEl) overdueTasksEl.textContent = overdueTasks;
        
        this.updateTaskCount();
        this.updateSidebarStats();
    }
    
    updateTaskCount() {
        const activeCount = this.tasks.filter(t => t.status === 'active').length;
        const pausedCount = this.tasks.filter(t => t.status === 'paused').length;
        const completedCount = this.tasks.filter(t => t.status === 'completed').length;
        
        let statsText = '';
        if (this.currentFilter === 'all') {
            statsText = `${activeCount} Р°РєС‚РёРІРЅС‹С…, ${pausedCount} РЅР° РїР°СѓР·Рµ, ${completedCount} Р·Р°РІРµСЂС€РµРЅРЅС‹С…`;
        } else if (this.currentFilter === 'active') {
            statsText = `${activeCount} Р·Р°РґР°С‡`;
        } else if (this.currentFilter === 'paused') {
            statsText = `${pausedCount} Р·Р°РґР°С‡`;
        } else {
            statsText = `${completedCount} Р·Р°РґР°С‡`;
        }
        
        const taskCountEl = document.getElementById('taskCount');
        if (taskCountEl) taskCountEl.textContent = statsText;
        
        const clearBtn = document.getElementById('clearCompleted');
        if (clearBtn) clearBtn.style.display = completedCount > 0 ? 'block' : 'none';
    }

    getFilteredTasks() {
        let tasks = this.tasks;
        
        // РџСЂРёРјРµРЅСЏРµРј С„РёР»СЊС‚СЂ РїРѕ СЃС‚Р°С‚СѓСЃСѓ
        switch (this.currentFilter) {
            case 'active':
                tasks = tasks.filter(t => t.status === 'active');
                break;
            case 'paused':
                tasks = tasks.filter(t => t.status === 'paused');
                break;
            case 'completed':
                tasks = tasks.filter(t => t.status === 'completed');
                break;
        }
        
        // РџСЂРёРјРµРЅСЏРµРј С„РёР»СЊС‚СЂ РїРѕ РїСЂРѕРµРєС‚Сѓ
        if (this.currentProject !== 'all') {
            tasks = tasks.filter(t => t.project === this.currentProject);
        }
        
        // РџСЂРёРјРµРЅСЏРµРј РїРѕРёСЃРє РїРѕ РёСЃРїРѕР»РЅРёС‚РµР»СЋ
        const searchValue = document.getElementById('searchInput').value.trim().toLowerCase();
        if (searchValue) {
            tasks = tasks.filter(t => 
                t.assignee && t.assignee.toLowerCase().includes(searchValue)
            );
        }
        
        // РџСЂРёРјРµРЅСЏРµРј РїРѕРёСЃРє РїРѕ С‚РµРіР°Рј
        const tagValue = document.getElementById('tagSearch').value.trim().toLowerCase();
        if (tagValue) {
            tasks = tasks.filter(t => 
                t.tags && t.tags.some(tag => tag.toLowerCase().includes(tagValue))
            );
        }
        
        return tasks;
    }

    render() {
        const taskList = document.getElementById('taskList');
        
        // РџСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ СЌР»РµРјРµРЅС‚ СЃСѓС‰РµСЃС‚РІСѓРµС‚
        if (!taskList) {
            console.warn('taskList element not found');
            return;
        }
        
        const filteredTasks = this.getFilteredTasks();
        
        if (filteredTasks.length === 0) {
            taskList.innerHTML = '<div class="empty-state">РќРµС‚ Р·Р°РґР°С‡ РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ</div>';
        } else {
            taskList.innerHTML = filteredTasks.map(task => {
                const dateTimeText = task.dateTime ? this.formatDateTime(task.dateTime) : '';
                const isCompleted = task.status === 'completed';
                const isPaused = task.status === 'paused';
                const priorityClass = `priority-${task.priority || 'medium'}`;
                const priorityText = this.getPriorityText(task.priority || 'medium');
                const projectText = this.getProjectText(task.project || 'personal');
                const isOverdue = task.dateTime && new Date(task.dateTime) < new Date() && !isCompleted;
                
                return `
                    <li class="task-item ${isCompleted ? 'completed' : ''} ${isPaused ? 'paused' : ''} ${isOverdue ? 'task-overdue' : ''}">
                        <input type="checkbox" 
                               class="task-checkbox" 
                               ${isCompleted ? 'checked' : ''} 
                               ${isPaused ? 'disabled' : ''}
                               onchange="app.toggleTask(${task.id})">
                        <div class="task-content">
                            <div>
                                <span class="task-text">${this.escapeHtml(task.title)}</span>
                                <span class="task-priority ${priorityClass}">${priorityText}</span>
                            </div>
                            ${task.description ? `<span class="task-description">${this.escapeHtml(task.description)}</span>` : ''}
                            ${task.project ? `<span class="task-project">${projectText}</span>` : ''}
                            ${task.tags && task.tags.length > 0 ? `<div class="task-tags">${task.tags.map(tag => `<span class="task-tag">${this.escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                            ${task.assignee ? `<span class="task-assignee">${this.escapeHtml(task.assignee)}</span>` : ''}
                            ${dateTimeText ? `<span class="task-datetime">${dateTimeText}</span>` : ''}
                            ${task.timer > 0 ? `<span class="task-timer">${this.formatTimer(task.timer)}</span>` : ''}
                            ${task.comments && task.comments.length > 0 ? `<span class="task-comments">${task.comments.length} РєРѕРјРјРµРЅС‚Р°СЂРёРµРІ</span>` : ''}
                        </div>
                        <div class="task-actions">
                            ${!isCompleted && !isPaused ? `<button class="task-action-btn" onclick="app.editTask(${task.id})">вњЏпёЏ</button>` : ''}
                            ${!isCompleted ? `<button class="task-action-btn" onclick="app.togglePause(${task.id})">${isPaused ? 'в–¶пёЏ' : 'вЏёпёЏ'}</button>` : ''}
                            <button class="task-action-btn" onclick="app.deleteTask(${task.id})">рџ—‘пёЏ</button>
                        </div>
                    </li>
                `;
            }).join('');
        }
        
        this.updateStats();
        this.initSidebar();
        this.initChart();
        this.checkAchievements();
    }

    updateStats() {
        const totalTasks = this.tasks.length;
        const today = new Date().toDateString();
        const completedToday = this.tasks.filter(t => 
            t.status === 'completed' && 
            new Date(t.createdAt).toDateString() === today
        ).length;
        const overdueTasks = this.tasks.filter(t => {
            if (!t.dateTime || t.status === 'completed') return false;
            return new Date(t.dateTime) < new Date();
        }).length;
        
        document.getElementById('totalTasks').textContent = totalTasks;
        document.getElementById('completedToday').textContent = completedToday;
        document.getElementById('overdueTasks').textContent = overdueTasks;
        
        this.updateTaskCount();
        this.updateSidebarStats();
    }
    
    updateTaskCount() {
        const activeCount = this.tasks.filter(t => t.status === 'active').length;
        const pausedCount = this.tasks.filter(t => t.status === 'paused').length;
        const completedCount = this.tasks.filter(t => t.status === 'completed').length;
        
        let statsText = '';
        if (this.currentFilter === 'all') {
            statsText = `${activeCount} Р°РєС‚РёРІРЅС‹С…, ${pausedCount} РЅР° РїР°СѓР·Рµ, ${completedCount} Р·Р°РІРµСЂС€РµРЅРЅС‹С…`;
        } else if (this.currentFilter === 'active') {
            statsText = `${activeCount} Р·Р°РґР°С‡`;
        } else if (this.currentFilter === 'paused') {
            statsText = `${pausedCount} Р·Р°РґР°С‡`;
        } else {
            statsText = `${completedCount} Р·Р°РґР°С‡`;
        }
        
        const taskCountEl = document.getElementById('taskCount');
        if (taskCountEl) taskCountEl.textContent = statsText;
        
        const clearBtn = document.getElementById('clearCompleted');
        if (clearBtn) clearBtn.style.display = completedCount > 0 ? 'block' : 'none';
    }

    async saveTasks() {
        if (this.useSupabase && this.currentUser) {
            // Р”Р»СЏ Supabase Р·Р°РґР°С‡Рё СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ РёРЅРґРёРІРёРґСѓР°Р»СЊРЅРѕ С‡РµСЂРµР· saveTaskToSupabase
            return;
        }
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDateTime(dateTimeString) {
        if (!dateTimeString) return '';
        
        const date = new Date(dateTimeString);
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleString('ru-RU', options);
    }
    
    setupRepeats() {
        this.tasks.forEach(task => {
            if (task.repeatType && task.status === 'active') {
                this.setupRepeat(task);
            }
        });
    }
    
    searchByAssignee(searchValue) {
        this.render();
    }
    
    getPriorityText(priority) {
        const priorities = {
            'low': 'РќРёР·РєРёР№',
            'medium': 'РЎСЂРµРґРЅРёР№',
            'high': 'Р’С‹СЃРѕРєРёР№'
        };
        return priorities[priority] || 'РЎСЂРµРґРЅРёР№';
    }
    
    getProjectText(project) {
        const projects = {
            'work': 'Р Р°Р±РѕС‚Р°',
            'personal': 'Р›РёС‡РЅРѕРµ',
            'study': 'РЈС‡РµР±Р°',
            'health': 'Р—РґРѕСЂРѕРІСЊРµ'
        };
        return projects[project] || 'Р›РёС‡РЅРѕРµ';
    }
    
    formatTimer(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Sidebar functions
    initSidebar() {
        this.renderAssignees();
        this.renderQuickFilters();
        this.renderUrgentTasks();
        this.loadQuickNotes();
        this.updateSidebarStats();
    }
    
    renderAssignees() {
        const assignees = {};
        this.tasks.forEach(task => {
            if (task.assignee) {
                assignees[task.assignee] = (assignees[task.assignee] || 0) + 1;
            }
        });
        
        const container = document.getElementById('assigneesList');
        container.innerHTML = Object.entries(assignees).map(([name, count]) => `
            <div class="assignee-item" onclick="app.filterByAssignee('${name}')">
                <div class="assignee-avatar">${name.charAt(0).toUpperCase()}</div>
                <div class="assignee-info">
                    <div class="assignee-name">${name}</div>
                    <div class="assignee-count">${count} Р·Р°РґР°С‡</div>
                </div>
            </div>
        `).join('');
    }
    
    renderQuickFilters() {
        const allTags = new Set();
        this.tasks.forEach(task => {
            if (task.tags) {
                task.tags.forEach(tag => allTags.add(tag));
            }
        });
        
        const container = document.getElementById('quickFilters');
        container.innerHTML = Array.from(allTags).slice(0, 8).map(tag => `
            <div class="quick-filter-tag" onclick="app.filterByTag('${tag}')">#${tag}</div>
        `).join('');
    }
    
    renderUrgentTasks() {
        const urgentTasks = this.tasks.filter(task => 
            task.status === 'active' && 
            task.priority === 'high' && 
            (!task.dateTime || new Date(task.dateTime) < new Date(Date.now() + 24 * 60 * 60 * 1000))
        ).slice(0, 5);
        
        const container = document.getElementById('urgentTasks');
        container.innerHTML = urgentTasks.map(task => `
            <div class="urgent-task-item" onclick="app.highlightTask(${task.id})">
                рџ”Ґ ${this.escapeHtml(task.title)}
            </div>
        `).join('');
    }
    
    loadQuickNotes() {
        document.getElementById('quickNotes').value = this.quickNotes;
    }
    
    saveQuickNotes(value) {
        this.quickNotes = value;
        localStorage.setItem('quickNotes', value);
    }
    
    updateSidebarStats() {
        // Update weekly progress
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekTasks = this.tasks.filter(task => 
            new Date(task.createdAt) >= weekStart
        );
        const completedWeekTasks = weekTasks.filter(t => t.status === 'completed');
        const weekProgress = weekTasks.length > 0 ? 
            Math.round((completedWeekTasks.length / weekTasks.length) * 100) : 0;
        document.getElementById('weeklyProgress').textContent = weekProgress + '%';
        
        // Update productivity score
        const todayTasks = this.tasks.filter(task => 
            new Date(task.createdAt).toDateString() === new Date().toDateString()
        );
        const completedToday = todayTasks.filter(t => t.status === 'completed').length;
        const productivityScore = Math.min(100, completedToday * 20);
        document.getElementById('productivityScore').textContent = productivityScore;
    }
    
    startClock() {
        const updateTime = () => {
            const now = new Date();
            document.getElementById('currentTime').textContent = 
                now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            document.getElementById('currentDate').textContent = 
                now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
    
    initChart() {
        const canvas = document.getElementById('tasksChart');
        const ctx = canvas.getContext('2d');
        
        // Simple bar chart
        const data = this.getChartData();
        const maxValue = Math.max(...data);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = 25;
        const spacing = 5;
        const startX = 20;
        const startY = canvas.height - 20;
        
        data.forEach((value, index) => {
            const barHeight = (value / maxValue) * (canvas.height - 40);
            const x = startX + index * (barWidth + spacing);
            const y = startY - barHeight;
            
            // Draw bar
            ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Draw value
            ctx.fillStyle = 'white';
            ctx.font = '10px Comfortaa';
            ctx.textAlign = 'center';
            ctx.fillText(value, x + barWidth/2, y - 5);
        });
    }
    
    getChartData() {
        const days = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'];
        const data = [];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - date.getDay() + i);
            const dayTasks = this.tasks.filter(task => 
                new Date(task.createdAt).toDateString() === date.toDateString()
            );
            data.push(dayTasks.length);
        }
        
        return data;
    }
    
    initCalendar() {
        const container = document.getElementById('miniCalendar');
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let html = '<div class="calendar-grid">';
        
        // Day headers
        const dayHeaders = ['РџРЅ', 'Р’С‚', 'РЎСЂ', 'Р§С‚', 'РџС‚', 'РЎР±', 'Р’СЃ'];
        dayHeaders.forEach(day => {
            html += `<div style="font-weight: 600; font-size: 9px;">${day}</div>`;
        });
        
        // Empty cells
        for (let i = 0; i < firstDay - 1; i++) {
            html += '<div></div>';
        }
        
        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === now.toDateString();
            const hasTasks = this.tasks.some(task => 
                task.dateTime && new Date(task.dateTime).toDateString() === date.toDateString()
            );
            
            let classes = 'calendar-day';
            if (isToday) classes += ' today';
            if (hasTasks) classes += ' has-tasks';
            
            html += `<div class="${classes}" onclick="app.showDayTasks(${year}, ${month}, ${day})">${day}</div>`;
        }
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    checkAchievements() {
        const achievements = [];
        
        // Check for achievements
        if (this.tasks.length >= 10) {
            achievements.push({ icon: 'рџЋЇ', title: '10 Р·Р°РґР°С‡', desc: 'РЎРѕР·РґР°РЅРѕ 10 Р·Р°РґР°С‡' });
        }
        
        const completedCount = this.tasks.filter(t => t.status === 'completed').length;
        if (completedCount >= 5) {
            achievements.push({ icon: 'в­ђ', title: 'РСЃРїРѕР»РЅРёС‚РµР»СЊ', desc: 'Р’С‹РїРѕР»РЅРµРЅРѕ 5 Р·Р°РґР°С‡' });
        }
        
        if (completedCount >= 20) {
            achievements.push({ icon: 'рџЏ†', title: 'РњР°СЃС‚РµСЂ', desc: 'Р’С‹РїРѕР»РЅРµРЅРѕ 20 Р·Р°РґР°С‡' });
        }
        
        const today = new Date().toDateString();
        const todayCompleted = this.tasks.filter(t => 
            t.status === 'completed' && new Date(t.createdAt).toDateString() === today
        ).length;
        
        if (todayCompleted >= 3) {
            achievements.push({ icon: 'рџ”Ґ', title: 'РџСЂРѕРґСѓРєС‚РёРІРЅС‹Р№ РґРµРЅСЊ', desc: '3 Р·Р°РґР°С‡Рё Р·Р° РґРµРЅСЊ' });
        }
        
        const container = document.getElementById('achievements');
        container.innerHTML = achievements.map(achievement => `
            <div class="achievement-item">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <div class="achievement-title">${achievement.title}</div>
                    <div class="achievement-desc">${achievement.desc}</div>
                </div>
            </div>
        `).join('');
    }
    
    // Sidebar actions
    quickAddTask() {
        const title = prompt('РќР°Р·РІР°РЅРёРµ Р±С‹СЃС‚СЂРѕР№ Р·Р°РґР°С‡Рё:');
        if (title) {
            const task = {
                id: Date.now(),
                title: title,
                status: 'active',
                priority: 'medium',
                project: 'personal',
                tags: [],
                createdAt: new Date().toISOString()
            };
            
            this.tasks.unshift(task);
            this.saveTasks();
            this.render();
            this.updateStats();
            this.initSidebar();
        }
    }
    
    importTasks() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedTasks = JSON.parse(event.target.result);
                        this.tasks = [...importedTasks, ...this.tasks];
                        this.saveTasks();
                        this.render();
                        this.updateStats();
                        this.initSidebar();
                        alert('Р—Р°РґР°С‡Рё СѓСЃРїРµС€РЅРѕ РёРјРїРѕСЂС‚РёСЂРѕРІР°РЅС‹!');
                    } catch (error) {
                        alert('РћС€РёР±РєР° РїСЂРё РёРјРїРѕСЂС‚Рµ С„Р°Р№Р»Р°');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }
    
    toggleTheme() {
        alert('РўРµРјС‹ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ!');
    }
    
    toggleNotifications() {
        alert('РЈРІРµРґРѕРјР»РµРЅРёСЏ РІ СЂР°Р·СЂР°Р±РѕС‚РєРµ!');
    }
    
    filterByAssignee(assignee) {
        document.getElementById('searchInput').value = assignee;
        this.searchByAssignee(assignee);
    }
    
    filterByTag(tag) {
        document.getElementById('tagSearch').value = tag;
        this.searchByTags(tag);
    }
    
    highlightTask(taskId) {
        // Scroll to task and highlight
        const taskElement = document.querySelector(`[onclick="app.deleteTask(${taskId})"]`);
        if (taskElement) {
            taskElement.parentElement.style.background = 'rgba(255, 255, 255, 0.3)';
            taskElement.parentElement.scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => {
                taskElement.parentElement.style.background = '';
            }, 2000);
        }
    }
    
    showDayTasks(year, month, day) {
        const date = new Date(year, month, day);
        const dayTasks = this.tasks.filter(task => 
            task.dateTime && new Date(task.dateTime).toDateString() === date.toDateString()
        );
        
        if (dayTasks.length > 0) {
            alert(`Р—Р°РґР°С‡Рё РЅР° ${date.toLocaleDateString('ru-RU')}:\n\n${dayTasks.map(t => `вЂў ${t.title}`).join('\n')}`);
        } else {
            alert(`РќРµС‚ Р·Р°РґР°С‡ РЅР° ${date.toLocaleDateString('ru-RU')}`);
        }
    }

    // Supabase РјРµС‚РѕРґС‹
    async initSupabase() {
        try {
            // РџСЂРѕРІРµСЂСЏРµРј РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ Supabase
            if (typeof window !== 'undefined' && window.SUPABASE_CONFIG) {
                // Р—Р°РіСЂСѓР¶Р°РµРј Supabase РґРёРЅР°РјРёС‡РµСЃРєРё
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
                script.onload = () => {
                    try {
                        const { createClient } = window.supabase;
                        this.supabase = createClient(
                            window.SUPABASE_CONFIG.url,
                            window.SUPABASE_CONFIG.anonKey
                        );
                        this.useSupabase = true;
                        console.log('Supabase initialized successfully');
                        this.setupAuth();
                    } catch (error) {
                        console.error('Error initializing Supabase client:', error);
                        this.useSupabase = false;
                    }
                };
                script.onerror = () => {
                    console.error('Failed to load Supabase script');
                    this.useSupabase = false;
                };
                document.head.appendChild(script);
            } else {
                console.log('Supabase config not found, using localStorage');
                this.useSupabase = false;
            }
        } catch (error) {
            console.error('Error in initSupabase:', error);
            this.useSupabase = false;
        }
    }

    async setupAuth() {
        if (!this.supabase || !this.useSupabase) return;

        // РџСЂРѕРІРµСЂСЏРµРј С‚РµРєСѓС‰СѓСЋ СЃРµСЃСЃРёСЋ
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            console.log('User logged in:', session.user.email);
            this.showUserInterface();
        } else {
            this.showLoginInterface();
        }

        // РЎР»СѓС€Р°С‚РµР»СЊ РёР·РјРµРЅРµРЅРёР№ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user;
                await this.loadTasks();
                this.render();
                this.showUserInterface();
                this.showNotification(`Р”РѕР±СЂРѕ РїРѕР¶Р°Р»РѕРІР°С‚СЊ, ${session.user.email}!`, 'success');
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.tasks = [];
                this.render();
                this.showLoginInterface();
                this.showNotification('Р’С‹ РІС‹С€Р»Рё РёР· СЃРёСЃС‚РµРјС‹', 'info');
            }
        });
    }

    showUserInterface() {
        console.log('=== Show User Interface ===');
        console.log('Current user:', this.currentUser);
        
        const loginSection = document.getElementById('loginSection');
        const authSection = document.getElementById('authSection');
        const userEmail = document.getElementById('userEmail');
        
        console.log('Elements found:', {
            loginSection: !!loginSection,
            authSection: !!authSection,
            userEmail: !!userEmail
        });
        
        if (loginSection) loginSection.style.display = 'none';
        if (authSection) authSection.style.display = 'flex';
        if (userEmail && this.currentUser) userEmail.textContent = this.currentUser.email;
        
        console.log('=== End Show User Interface ===');
    }

    showLoginInterface() {
        console.log('=== Show Login Interface ===');
        
        const loginSection = document.getElementById('loginSection');
        const authSection = document.getElementById('authSection');
        
        console.log('Elements found:', {
            loginSection: !!loginSection,
            authSection: !!authSection
        });
        
        if (loginSection) loginSection.style.display = 'flex';
        if (authSection) authSection.style.display = 'none';
        
        console.log('=== End Show Login Interface ===');
    }

    showAuthModal(isRegister = false) {
        const modal = document.getElementById('authModal');
        const title = document.getElementById('authTitle');
        const submitBtn = document.getElementById('authSubmitBtn');
        const switchText = document.getElementById('authSwitchText');
        const switchLink = document.getElementById('authSwitchLink');
        
        if (isRegister) {
            title.textContent = 'рџ“ќ Р РµРіРёСЃС‚СЂР°С†РёСЏ РІ Smurf';
            submitBtn.textContent = 'Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ';
            switchText.innerHTML = 'РЈР¶Рµ РµСЃС‚СЊ Р°РєРєР°СѓРЅС‚? <a href="#" id="authSwitchLink">Р’РѕР№С‚Рё</a>';
        } else {
            title.textContent = 'рџ”ђ Р’С…РѕРґ РІ Smurf';
            submitBtn.textContent = 'Р’РѕР№С‚Рё';
            switchText.innerHTML = 'РќРµС‚ Р°РєРєР°СѓРЅС‚Р°? <a href="#" id="authSwitchLink">Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ</a><br><small><a href="#" id="resendLink" style="color: #f39c12; margin-left: 10px;">рџ“§ РџРѕРІС‚РѕСЂРёС‚СЊ РѕС‚РїСЂР°РІРєСѓ email</a></small>';
        }
        
        modal.style.display = 'block';
        document.getElementById('authEmail').focus();
        
        // Р’РµС€Р°РµРј РѕР±СЂР°Р±РѕС‚С‡РёРє РЅР° РЅРѕРІСѓСЋ СЃСЃС‹Р»РєСѓ
        document.getElementById('authSwitchLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.hideAuthModal();
            this.showAuthModal(!isRegister);
        });
        
        // РћР±СЂР°Р±РѕС‚С‡РёРє РґР»СЏ РїРѕРІС‚РѕСЂРЅРѕР№ РѕС‚РїСЂР°РІРєРё email
        const resendLink = document.getElementById('resendLink');
        if (resendLink) {
            resendLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.resendConfirmationEmail();
            });
        }
        
        this.isRegisterMode = isRegister;
    }

    async resendConfirmationEmail() {
        const email = document.getElementById('authEmail').value;
        
        if (!email) {
            this.showNotification('Р’РІРµРґРёС‚Рµ email РґР»СЏ РїРѕРІС‚РѕСЂРЅРѕР№ РѕС‚РїСЂР°РІРєРё', 'error');
            return;
        }
        
        try {
            const { error } = await this.supabase.auth.resend({
                type: 'signup',
                email: email
            });
            
            if (error) throw error;
            
            this.showNotification('рџ“§ Email РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РѕС‚РїСЂР°РІР»РµРЅ РїРѕРІС‚РѕСЂРЅРѕ!', 'success');
        } catch (error) {
            console.error('Resend error:', error);
            this.showNotification('РћС€РёР±РєР° РїРѕРІС‚РѕСЂРЅРѕР№ РѕС‚РїСЂР°РІРєРё email', 'error');
        }
    }

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('authForm').reset();
    }

    toggleAuthMode() {
        this.hideAuthModal();
        this.showAuthModal(!this.isRegisterMode);
    }

    async handleAuth(event) {
        event.preventDefault();
        
        console.log('handleAuth called');
        console.log('DOM elements:', {
            authForm: !!document.getElementById('authForm'),
            authEmail: !!document.getElementById('authEmail'),
            authPassword: !!document.getElementById('authPassword')
        });
        
        const email = document.getElementById('authEmail')?.value?.trim() || '';
        const password = document.getElementById('authPassword')?.value || '';
        
        // Р’Р°Р»РёРґР°С†РёСЏ email
        if (!email) {
            this.showNotification('Р’РІРµРґРёС‚Рµ email', 'error');
            document.getElementById('authEmail')?.focus();
            return;
        }
        
        if (!this.isValidEmail(email)) {
            this.showNotification('Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ email Р°РґСЂРµСЃ', 'error');
            document.getElementById('authEmail')?.focus();
            return;
        }
        
        // Р’Р°Р»РёРґР°С†РёСЏ РїР°СЂРѕР»СЏ
        if (!password) {
            this.showNotification('Р’РІРµРґРёС‚Рµ РїР°СЂРѕР»СЊ', 'error');
            document.getElementById('authPassword')?.focus();
            return;
        }
        
        if (password.length < 6) {
            this.showNotification('РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ', 'error');
            document.getElementById('authPassword')?.focus();
            return;
        }
        
        // РџРѕРєР°Р·С‹РІР°РµРј РёРЅРґРёРєР°С‚РѕСЂ Р·Р°РіСЂСѓР·РєРё
        const submitBtn = document.getElementById('authSubmitBtn');
        const originalText = submitBtn?.textContent || '';
        if (submitBtn) {
            submitBtn.textContent = 'вЏі Р—Р°РіСЂСѓР·РєР°...';
            submitBtn.disabled = true;
        }
        
        try {
            if (this.isRegisterMode) {
                const { data, error } = await this.supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin
                    }
                });
                
                if (error) throw error;
                
                this.showNotification('рџ“§ Р РµРіРёСЃС‚СЂР°С†РёСЏ СѓСЃРїРµС€РЅР°! РџСЂРѕРІРµСЂСЊС‚Рµ email РґР»СЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ.', 'success');
                this.hideAuthModal();
            } else {
                const { data, error } = await this.supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) {
                    // Р•СЃР»Рё РѕС€РёР±РєР° "Email not confirmed"
                    if (error.message.includes('Email not confirmed')) {
                        this.showNotification('рџ“§ РЎРЅР°С‡Р°Р»Р° РїРѕРґС‚РІРµСЂРґРёС‚Рµ email! РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕС‡С‚Сѓ.', 'warning');
                        return;
                    }
                    throw error;
                }
                
                this.showNotification('вњ… Р’С…РѕРґ РІС‹РїРѕР»РЅРµРЅ СѓСЃРїРµС€РЅРѕ!', 'success');
                this.hideAuthModal();
            }
        } catch (error) {
            console.error('Auth error:', error);
            let errorMessage = error.message;
            
            // РЈР»СѓС‡С€Р°РµРј СЃРѕРѕР±С‰РµРЅРёСЏ РѕР± РѕС€РёР±РєР°С…
            if (error.message.includes('User already registered')) {
                errorMessage = 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚. Р’РѕР№РґРёС‚Рµ РІ СЃРёСЃС‚РµРјСѓ.';
            } else if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'РќРµРІРµСЂРЅС‹Р№ email РёР»Рё РїР°СЂРѕР»СЊ.';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'Email РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅ. РџСЂРѕРІРµСЂСЊС‚Рµ РїРѕС‡С‚Сѓ.';
            } else if (error.message.includes('User already registered')) {
                errorMessage = 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј email СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚.';
            } else if (error.message.includes('weak password')) {
                errorMessage = 'РЎР»РёС€РєРѕРј РїСЂРѕСЃС‚РѕР№ РїР°СЂРѕР»СЊ. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РјРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ.';
            }
            
            this.showNotification(`вќЊ ${errorMessage}`, 'error');
        } finally {
            // Р’РѕСЃСЃС‚Р°РЅР°РІР»РёРІР°РµРј РєРЅРѕРїРєСѓ
            if (submitBtn) {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async signOut() {
        if (!this.supabase || !this.currentUser) return;
        
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            console.error('Sign out error:', error);
            this.showNotification('РћС€РёР±РєР° РІС‹С…РѕРґР°', 'error');
        }
    }

    async loadTasks() {
        if (!this.supabase || !this.currentUser || !this.useSupabase) {
            // РСЃРїРѕР»СЊР·СѓРµРј localStorage
            this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading tasks:', error);
                // Fallback Рє localStorage
                this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
                return;
            }
            
            this.tasks = data || [];
            console.log('Tasks loaded from Supabase:', this.tasks.length);
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        }
    }

    async saveTaskToSupabase(task) {
        console.log('saveTaskToSupabase() called with:', task);
        
        if (!this.supabase || !this.currentUser || !this.useSupabase) {
            console.log('Using localStorage fallback');
            return this.saveTaskLocalStorage(task);
        }

        try {
            const taskData = {
                user_id: this.currentUser.id,
                title: task.title,
                description: task.description || '',
                due_date: task.dateTime || null,
                priority: task.priority || 'medium',
                project: task.project || 'work',
                tags: task.tags || [],
                assignee: task.assignee || '',
                repeat_type: task.repeatType || null,
                status: task.status || 'active'
            };
            
            console.log('Task data for Supabase:', taskData);

            // РџСЂРѕРІРµСЂСЏРµРј РµСЃС‚СЊ Р»Рё ID Рё СЌС‚Рѕ РЅРµ Р»РѕРєР°Р»СЊРЅС‹Р№ ID
            if (task.id && !task.id.startsWith('local_') && typeof task.id !== 'undefined') {
                console.log('Updating existing task with ID:', task.id);
                // РћР±РЅРѕРІР»РµРЅРёРµ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµР№ Р·Р°РґР°С‡Рё
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update(taskData)
                    .eq('id', task.id)
                    .eq('user_id', this.currentUser.id)
                    .select()
                    .single();

                if (error) throw error;
                console.log('Task updated successfully:', data);
                return data;
            } else {
                console.log('Creating new task');
                // РќРѕРІР°СЏ Р·Р°РґР°С‡Р°
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(taskData)
                    .select()
                    .single();

                if (error) throw error;
                console.log('Task created successfully:', data);
                return data;
            }
        } catch (error) {
            console.error('Error saving task:', error);
            return this.saveTaskLocalStorage(task);
        }
    }

    saveTaskLocalStorage(task) {
        const localTask = {
            ...task,
            id: task.id || `local_${Date.now()}`,
            createdAt: new Date().toISOString(),
            timer: 0,
            comments: []
        };
        
        this.tasks.unshift(localTask);
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        return localTask;
    }

    async deleteTask(taskId) {
        if (!this.supabase || !this.currentUser || !this.useSupabase) {
            return this.deleteTaskLocalStorage(taskId);
        }

        try {
            const { error } = await this.supabase
                .from('tasks')
                .delete()
                .eq('id', taskId)
                .eq('user_id', this.currentUser.id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting task:', error);
            return this.deleteTaskLocalStorage(taskId);
        }
    }

    async deleteTaskFromSupabase(taskId) {
        return await this.deleteTask(taskId);
    }

    deleteTaskLocalStorage(taskId) {
        const tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        localStorage.setItem('tasks', JSON.stringify(filteredTasks));
        return true;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#27ae60' : '#3498db'};
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    async signOut() {
        if (!this.supabase) return;
        
        try {
            const { error } = await this.supabase.auth.signOut();
            if (error) throw error;
            
            console.log('Signed out successfully');
            // UI updates will be handled by onAuthStateChange listener
        } catch (error) {
            console.error('Sign out error:', error);
            this.showNotification('РћС€РёР±РєР° РІС‹С…РѕРґР°: ' + error.message, 'error');
        }
    }

    useLocalStorage() {
        // Fallback Рє localStorage РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РІС‹Р±СЂР°Р» РіРѕСЃС‚РµРІРѕР№ СЂРµР¶РёРј
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.showNotification('Р РµР¶РёРј Р±РµР· СЂРµРіРёСЃС‚СЂР°С†РёРё. Р”Р°РЅРЅС‹Рµ СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ Р»РѕРєР°Р»СЊРЅРѕ.', 'info');
    }

    async loadTasks() {
        if (!this.supabase || !this.currentUser) {
            this.useLocalStorage();
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            // Map database fields to app fields
            this.tasks = (data || []).map(task => ({
                ...task,
                dateTime: task.due_date,
                repeatType: task.repeat_type
            }));
            console.log('Tasks loaded:', this.tasks.length);
        } catch (error) {
            console.error('Error loading tasks:', error);
            this.showNotification('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р·Р°РґР°С‡', 'error');
            this.useLocalStorage();
        }
    }

    async saveTask(task) {
        if (!this.supabase || !this.currentUser) {
            return this.saveTaskLocalStorage(task);
        }

        try {
            const taskData = {
                user_id: this.currentUser.id,
                title: task.title,
                description: task.description || '',
                due_date: task.dateTime || null,
                priority: task.priority || 'medium',
                project: task.project || 'work',
                tags: task.tags || [],
                assignee: task.assignee || '',
                repeat_type: task.repeatType || null,
                status: task.status || 'active'
            };

            if (!task.id || task.id.startsWith('local_')) {
                // РќРѕРІР°СЏ Р·Р°РґР°С‡Р°
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(taskData)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            } else {
                // РћР±РЅРѕРІР»РµРЅРёРµ Р·Р°РґР°С‡Рё
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update(taskData)
                    .eq('id', task.id)
                    .eq('user_id', this.currentUser.id)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            }
        } catch (error) {
            console.error('Error saving task:', error);
            this.showNotification('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ Р·Р°РґР°С‡Рё', 'error');
            return null;
        }
    }

    async deleteTask(taskId) {
        if (!this.supabase || !this.currentUser) {
            return this.deleteTaskLocalStorage(taskId);
        }

        try {
            const { error } = await this.supabase
                .from('tasks')
                .delete()
                .eq('id', taskId)
                .eq('user_id', this.currentUser.id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting task:', error);
            this.showNotification('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р·Р°РґР°С‡Рё', 'error');
            return false;
        }
    }

    saveTaskLocalStorage(task) {
        const localTask = {
            ...task,
            id: task.id || `local_${Date.now()}`,
            createdAt: new Date().toISOString(),
            timer: 0,
            comments: []
        };

        this.tasks.unshift(localTask);
        localStorage.setItem('tasks', JSON.stringify(this.tasks));
        return localTask;
    }

    deleteTaskLocalStorage(taskId) {
        const tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        localStorage.setItem('tasks', JSON.stringify(filteredTasks));
        return true;
    }
}

window.app = new TodoApp();

